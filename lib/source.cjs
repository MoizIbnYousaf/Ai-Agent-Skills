const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const { parseSkillMarkdown } = require('./frontmatter.cjs');

function sanitizeSubpath(subpath) {
  if (!subpath) return null;
  const segments = String(subpath).replace(/\\/g, '/').split('/').filter(Boolean);
  for (const seg of segments) {
    if (seg === '..') {
      throw new Error(`Path traversal rejected: "${subpath}" contains ".." segment`);
    }
  }
  return segments.join('/') || null;
}

function isWindowsPath(source) {
  return /^[a-zA-Z]:[\\\/]/.test(source);
}

function isLocalPath(source) {
  return source.startsWith('./')
    || source.startsWith('../')
    || source.startsWith('/')
    || source.startsWith('~/')
    || isWindowsPath(source);
}

function isGitUrl(source) {
  if (!source || typeof source !== 'string') return false;
  if (isLocalPath(source)) return false;
  const sshLike = /^git@[a-zA-Z0-9._-]+:[a-zA-Z0-9._\/-]+(?:\.git)?(?:#[a-zA-Z0-9._\/-]+)?$/;
  const protocolLike = /^(https?|git|ssh|file):\/\/[a-zA-Z0-9._@:\/-]+(?:#[a-zA-Z0-9._\/-]+)?$/;
  return sshLike.test(source) || protocolLike.test(source);
}

function parseGitUrl(source) {
  if (!source || typeof source !== 'string') return { url: null, ref: null };
  const hashIndex = source.indexOf('#');
  if (hashIndex === -1) return { url: source, ref: null };
  return {
    url: source.slice(0, hashIndex),
    ref: source.slice(hashIndex + 1) || null,
  };
}

function getRepoNameFromUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const cleaned = url.replace(/\/+$/, '').replace(/\.git$/, '');
  if (cleaned.includes('@') && cleaned.includes(':')) {
    const colonIndex = cleaned.lastIndexOf(':');
    const pathPart = cleaned.slice(colonIndex + 1);
    const segments = pathPart.split('/').filter(Boolean);
    return segments.length > 0 ? segments[segments.length - 1] : null;
  }
  const segments = cleaned.split('/').filter(Boolean);
  return segments.length > 0 ? segments[segments.length - 1] : null;
}

function validateGitUrl(url) {
  if (!url || typeof url !== 'string') {
    throw new Error('Invalid git URL: empty or not a string');
  }
  if (url.length > 2048) {
    throw new Error('Git URL too long (max 2048 characters)');
  }
  if (/[\x00-\x1f\x7f`$\\]/.test(url)) {
    throw new Error('Git URL contains invalid characters');
  }
  if (!isGitUrl(url)) {
    throw new Error('Invalid git URL format');
  }
  return true;
}

function sanitizeGitUrl(url) {
  if (!url) return url;
  try {
    if (!url.includes('://')) return url;
    const parsed = new URL(url);
    parsed.username = '';
    parsed.password = '';
    return parsed.toString();
  } catch {
    return url;
  }
}

function expandPath(p) {
  if (p.startsWith('~')) {
    return path.join(os.homedir(), p.slice(1));
  }
  return path.resolve(p);
}

function parseSource(source) {
  if (!source || typeof source !== 'string') {
    return { type: 'catalog', name: source };
  }

  const trimmed = source.trim();

  if (trimmed === '.' || trimmed.startsWith('./') || trimmed.startsWith('../') || trimmed.startsWith('/') || trimmed.startsWith('~/') || isWindowsPath(trimmed)) {
    return { type: 'local', url: trimmed };
  }

  const treeMatch = trimmed.match(/^(?:https?:\/\/)?github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)(?:\/(.+))?$/);
  if (treeMatch) {
    const subpath = treeMatch[4] ? sanitizeSubpath(treeMatch[4]) : null;
    return {
      type: 'github',
      url: `https://github.com/${treeMatch[1]}/${treeMatch[2]}`,
      owner: treeMatch[1],
      repo: treeMatch[2],
      ref: treeMatch[3],
      subpath,
    };
  }

  const ghUrlMatch = trimmed.match(/^(?:https?:\/\/)?github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/)?$/);
  if (ghUrlMatch) {
    return {
      type: 'github',
      url: `https://github.com/${ghUrlMatch[1]}/${ghUrlMatch[2]}`,
      owner: ghUrlMatch[1],
      repo: ghUrlMatch[2],
    };
  }

  const atMatch = trimmed.match(/^([^/:@.]+)\/([^/:@.]+)@(.+)$/);
  if (atMatch) {
    return {
      type: 'github',
      url: `https://github.com/${atMatch[1]}/${atMatch[2]}`,
      owner: atMatch[1],
      repo: atMatch[2],
      skillFilter: atMatch[3],
    };
  }

  const shortMatch = trimmed.match(/^([^/:@.]+)\/([^/:@.]+)$/);
  if (shortMatch && !trimmed.includes(':') && !trimmed.includes('.')) {
    return {
      type: 'github',
      url: `https://github.com/${shortMatch[1]}/${shortMatch[2]}`,
      owner: shortMatch[1],
      repo: shortMatch[2],
    };
  }

  const subpathMatch = trimmed.match(/^([^/:@.]+)\/([^/:@.]+)\/(.+)$/);
  if (subpathMatch && !trimmed.includes(':') && !trimmed.includes('://')) {
    const subpath = sanitizeSubpath(subpathMatch[3]);
    return {
      type: 'github',
      url: `https://github.com/${subpathMatch[1]}/${subpathMatch[2]}`,
      owner: subpathMatch[1],
      repo: subpathMatch[2],
      subpath,
    };
  }

  if (isGitUrl(trimmed)) {
    return { type: 'git', url: trimmed };
  }

  return { type: 'catalog', name: trimmed };
}

function classifyGitError(message) {
  const msg = String(message || '');
  if (msg.includes('timed out') || msg.includes('block timeout')) {
    return 'Clone timed out. If this is a private repo, check your credentials.';
  }
  if (msg.includes('Authentication failed') || msg.includes('Permission denied')) {
    return 'Authentication failed. Check your git credentials or SSH keys.';
  }
  if (msg.includes('Repository not found') || msg.includes('not found')) {
    return 'Repository not found. It may be private or the URL may be wrong.';
  }
  return msg;
}

function discoverSkills(rootDir, options = {}) {
  const seen = new Set();
  const skills = [];
  const repoRoot = options.repoRoot || rootDir;

  function collectSkill(skillDir, dirName, isRoot = false) {
    const skillMd = path.join(skillDir, 'SKILL.md');
    if (!fs.existsSync(skillMd)) return;
    const parsed = parseSkillMarkdown(fs.readFileSync(skillMd, 'utf8'));
    const name = parsed?.frontmatter?.name && typeof parsed.frontmatter.name === 'string'
      ? parsed.frontmatter.name.trim()
      : dirName;
    const description = parsed?.frontmatter?.description && typeof parsed.frontmatter.description === 'string'
      ? parsed.frontmatter.description.trim()
      : '';
    if (!name || seen.has(name.toLowerCase())) return;
    seen.add(name.toLowerCase());
    skills.push({
      name,
      description,
      dirName,
      dir: skillDir,
      isRoot,
      relativeDir: path.relative(repoRoot, skillDir).replace(/\\/g, '/'),
      frontmatter: parsed?.frontmatter || {},
    });
  }

  if (fs.existsSync(path.join(rootDir, 'SKILL.md'))) {
    collectSkill(rootDir, path.basename(rootDir), true);
    return skills;
  }

  const standardDirs = [
    path.join(rootDir, 'skills'),
    path.join(rootDir, 'skills', '.curated'),
    path.join(rootDir, 'skills', '.experimental'),
    path.join(rootDir, 'skills', '.system'),
    path.join(rootDir, '.agents', 'skills'),
    path.join(rootDir, '.augment', 'skills'),
    path.join(rootDir, '.claude', 'skills'),
  ];

  function scanDir(dir) {
    if (!fs.existsSync(dir)) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (['.git', 'node_modules', 'dist', 'build', '__pycache__'].includes(entry.name)) continue;
        collectSkill(path.join(dir, entry.name), entry.name);
      }
    } catch {
      // Skip unreadable directories.
    }
  }

  for (const dir of standardDirs) {
    scanDir(dir);
  }

  if (skills.length === 0) {
    function walkTree(dir, depth) {
      if (depth > 5 || !fs.existsSync(dir)) return;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          if (['.git', 'node_modules', 'dist', 'build', '__pycache__'].includes(entry.name)) continue;
          const childDir = path.join(dir, entry.name);
          if (fs.existsSync(path.join(childDir, 'SKILL.md'))) {
            collectSkill(childDir, entry.name);
          } else {
            walkTree(childDir, depth + 1);
          }
        }
      } catch {
        // Skip unreadable directories.
      }
    }
    walkTree(rootDir, 0);
  }

  return skills;
}

function prepareSource(source, options = {}) {
  const parsed = options.parsed || parseSource(source);
  const tempDir = parsed.type === 'local' ? null : fs.mkdtempSync(path.join(os.tmpdir(), 'ai-skills-'));
  let repoRoot = null;
  let rootDir = null;
  let usedSparse = false;

  if (parsed.type === 'local') {
    repoRoot = expandPath(parsed.url);
    if (!fs.existsSync(repoRoot)) {
      throw new Error(`Path not found: ${repoRoot}`);
    }
    rootDir = parsed.subpath ? path.join(repoRoot, parsed.subpath) : repoRoot;
    if (!fs.existsSync(rootDir)) {
      throw new Error(`Subpath "${parsed.subpath}" not found`);
    }
  } else {
    const cloneUrl = parsed.type === 'github' ? `${parsed.url}.git` : parsed.url;
    const sparseSubpath = parsed.type === 'github' && options.sparseSubpath ? sanitizeSubpath(options.sparseSubpath) : null;

    function cloneNormally() {
      const cloneArgs = ['clone'];
      if (!cloneUrl.startsWith('file://')) cloneArgs.push('--depth', '1');
      if (parsed.ref) cloneArgs.push('--branch', parsed.ref);
      cloneArgs.push(cloneUrl, tempDir);
      execFileSync('git', cloneArgs, {
        stdio: 'pipe',
        timeout: 60000,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      });
    }

    try {
      if (sparseSubpath) {
        const cloneArgs = ['clone', '--sparse'];
        if (!cloneUrl.startsWith('file://')) {
          cloneArgs.push('--depth', '1', '--filter=blob:none');
        }
        if (parsed.ref) cloneArgs.push('--branch', parsed.ref);
        cloneArgs.push(cloneUrl, tempDir);
        execFileSync('git', cloneArgs, {
          stdio: 'pipe',
          timeout: 60000,
          env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
        });
        execFileSync('git', ['-C', tempDir, 'sparse-checkout', 'set', '--no-cone', sparseSubpath], {
          stdio: 'pipe',
          timeout: 60000,
          env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
        });
        usedSparse = true;
      } else {
        cloneNormally();
      }
    } catch (error) {
      if (sparseSubpath) {
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch {}
        fs.mkdirSync(tempDir, { recursive: true });
        cloneNormally();
        usedSparse = false;
      } else {
        throw new Error(classifyGitError(error.message || error.stderr));
      }
    }

    repoRoot = tempDir;
    rootDir = parsed.subpath ? path.join(repoRoot, parsed.subpath) : repoRoot;
    if (!fs.existsSync(rootDir)) {
      throw new Error(`Subpath "${parsed.subpath}" not found in repository`);
    }
  }

  return {
    parsed,
    repoRoot,
    rootDir,
    tempDir,
    usedSparse,
    cleanup() {
      if (tempDir) {
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch {}
      }
    },
  };
}

module.exports = {
  classifyGitError,
  discoverSkills,
  expandPath,
  getRepoNameFromUrl,
  isGitUrl,
  isLocalPath,
  isWindowsPath,
  parseGitUrl,
  parseSource,
  prepareSource,
  sanitizeGitUrl,
  sanitizeSubpath,
  validateGitUrl,
};
