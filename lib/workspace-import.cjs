const fs = require('fs');
const path = require('path');

const { parseSkillMarkdown } = require('./frontmatter.cjs');

const RESERVED_FLAT_DIRS = new Set([
  '.git',
  '.ai-agent-skills',
  'node_modules',
  'dist',
  'build',
  'skills',
]);

const DEFAULT_CLASSIFY_KEYWORDS = {
  mobile: ['react native', 'expo', 'ios', 'android', 'simulator', 'testflight', 'swiftui'],
  backend: ['api', 'database', 'supabase', 'auth', 'postgres', 'server', 'backend'],
  frontend: ['browser', 'playwright', 'chrome', 'figma', 'frontend', 'ui', 'webapp'],
  workflow: ['deploy', 'release', 'ota', 'shipping', 'workflow', 'testflight', 'planning'],
  'agent-engineering': ['agent', 'mcp', 'prompt', 'orchestrat', 'tooling', 'eval'],
};

function readSkillCandidate(dirPath, layout) {
  const skillMdPath = path.join(dirPath, 'SKILL.md');
  if (!fs.existsSync(skillMdPath)) return null;

  try {
    const raw = fs.readFileSync(skillMdPath, 'utf8');
    const parsed = parseSkillMarkdown(raw);
    if (!parsed) {
      return {
        status: 'invalid',
        dirPath,
        layout,
        reason: 'Could not parse SKILL.md frontmatter.',
      };
    }

    const name = String(parsed.frontmatter.name || '').trim();
    const description = String(parsed.frontmatter.description || '').trim();
    if (!name || !description) {
      return {
        status: 'invalid',
        dirPath,
        layout,
        reason: 'SKILL.md frontmatter must include name and description.',
      };
    }

    return {
      status: 'ok',
      name,
      description,
      dirPath,
      layout,
      relativeDir: null,
      raw,
      frontmatter: parsed.frontmatter,
      content: parsed.content || '',
    };
  } catch (error) {
    return {
      status: 'invalid',
      dirPath,
      layout,
      reason: `Unreadable SKILL.md: ${error.message}`,
    };
  }
}

function listChildDirectories(rootDir) {
  try {
    return fs.readdirSync(rootDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

function humanizeAreaId(id) {
  return String(id || '')
    .split('-')
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function tokenizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function countMatches(text, token) {
  if (!token) return 0;
  const pattern = new RegExp(`(^|[^a-z0-9])${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`, 'g');
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
}

function discoverImportCandidates(rootDir) {
  const resolvedRoot = path.resolve(rootDir);
  const candidatesByName = new Map();
  const skipped = [];
  const failures = [];

  const registerCandidate = (candidate, relativeDir) => {
    if (!candidate) return;

    if (candidate.status !== 'ok') {
      failures.push({
        path: path.relative(resolvedRoot, candidate.dirPath).replace(/\\/g, '/'),
        layout: candidate.layout,
        reason: candidate.reason,
      });
      return;
    }

    candidate.relativeDir = relativeDir;
    const existing = candidatesByName.get(candidate.name);
    if (!existing) {
      candidatesByName.set(candidate.name, candidate);
      return;
    }

    const preferCandidate = candidate.layout === 'nested' && existing.layout === 'flat';
    if (preferCandidate) {
      skipped.push({
        name: existing.name,
        path: existing.relativeDir,
        reason: `Duplicate skill name. Preferred nested skills/ copy at ${relativeDir}.`,
      });
      candidatesByName.set(candidate.name, candidate);
      return;
    }

    skipped.push({
      name: candidate.name,
      path: relativeDir,
      reason: `Duplicate skill name. Kept ${existing.relativeDir}.`,
    });
  };

  for (const dirName of listChildDirectories(resolvedRoot)) {
    if (dirName.startsWith('.') || RESERVED_FLAT_DIRS.has(dirName)) continue;
    const dirPath = path.join(resolvedRoot, dirName);
    registerCandidate(readSkillCandidate(dirPath, 'flat'), dirName);
  }

  const nestedRoot = path.join(resolvedRoot, 'skills');
  if (fs.existsSync(nestedRoot)) {
    for (const dirName of listChildDirectories(nestedRoot)) {
      if (dirName.startsWith('.')) continue;
      const dirPath = path.join(nestedRoot, dirName);
      registerCandidate(readSkillCandidate(dirPath, 'nested'), `skills/${dirName}`);
    }
  }

  return {
    rootDir: resolvedRoot,
    discovered: [...candidatesByName.values()].sort((left, right) => left.name.localeCompare(right.name)),
    skipped,
    failures,
  };
}

function classifyImportedSkill(candidate, workAreas = []) {
  const text = [
    candidate.name,
    candidate.description,
    candidate.content,
    candidate.frontmatter?.tags,
    candidate.frontmatter?.labels,
  ]
    .flat()
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const scored = [];
  for (const area of workAreas) {
    const id = String(area.id || '').trim();
    if (!id) continue;
    const title = String(area.title || humanizeAreaId(id)).trim();
    const tokens = new Set([
      id.toLowerCase(),
      ...tokenizeText(id),
      ...tokenizeText(title),
    ]);
    let score = 0;
    for (const token of tokens) {
      score += countMatches(text, token) * 4;
    }
    if (score > 0) {
      scored.push({ id, score, reason: 'lexical' });
    }
  }

  scored.sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
  if (scored.length > 0) {
    const best = scored[0];
    const second = scored[1];
    if (!second || best.score >= second.score + 3) {
      return {
        workArea: best.id,
        autoClassified: true,
        needsCuration: false,
      };
    }
  }

  const available = new Set(workAreas.map((area) => area.id));
  const keywordScores = [];
  for (const [areaId, keywords] of Object.entries(DEFAULT_CLASSIFY_KEYWORDS)) {
    if (!available.has(areaId)) continue;
    let score = 0;
    for (const keyword of keywords) {
      score += countMatches(text, keyword);
    }
    if (score > 0) {
      keywordScores.push({ id: areaId, score });
    }
  }

  keywordScores.sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
  if (keywordScores.length > 0) {
    const best = keywordScores[0];
    const second = keywordScores[1];
    if (!second || best.score >= second.score + 2) {
      return {
        workArea: best.id,
        autoClassified: true,
        needsCuration: false,
      };
    }
  }

  return {
    workArea: available.has('workflow') ? 'workflow' : (workAreas[0]?.id || 'workflow'),
    autoClassified: false,
    needsCuration: true,
  };
}

module.exports = {
  RESERVED_FLAT_DIRS,
  classifyImportedSkill,
  discoverImportCandidates,
  humanizeAreaId,
};
