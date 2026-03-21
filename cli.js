#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');
const { pathToFileURL } = require('url');
const { compareSkillsByCurationData, getGitHubInstallSpec, getSiblingRecommendations, sortSkillsByCuration } = require('./tui/catalog.cjs');
const {
  AGENT_PATHS,
  CONFIG_FILE,
  LEGACY_AGENTS,
  MAX_SKILL_SIZE,
  ROOT_DIR,
  SCOPES,
  SKILLS_DIR,
} = require('./lib/paths.cjs');
const {
  addUpstreamSkillFromDiscovery,
  buildReviewQueue,
  buildHouseCatalogEntry,
  curateSkill,
  removeSkillFromCatalog,
  normalizeListInput,
  ensureRequiredPlacement,
  addHouseSkillEntry,
  currentIsoDay,
  currentCatalogTimestamp,
} = require('./lib/catalog-mutations.cjs');
const {
  findSkillByName,
  getCatalogCounts,
  loadCatalogData,
} = require('./lib/catalog-data.cjs');
const { parseSkillMarkdown: parseSkillMarkdownFile } = require('./lib/frontmatter.cjs');
const { readInstalledMeta, writeInstalledMeta } = require('./lib/install-metadata.cjs');
const {
  classifyGitError: classifyGitErrorLib,
  discoverSkills: discoverSkillsLib,
  expandPath: expandPathLib,
  getRepoNameFromUrl: getRepoNameFromUrlLib,
  isGitUrl: isGitUrlLib,
  isLocalPath: isLocalPathLib,
  isWindowsPath: isWindowsPathLib,
  parseGitUrl: parseGitUrlLib,
  parseSource: parseSourceLib,
  prepareSource: prepareSourceLib,
  sanitizeGitUrl: sanitizeGitUrlLib,
  sanitizeSubpath: sanitizeSubpathLib,
  validateGitUrl: validateGitUrlLib,
} = require('./lib/source.cjs');

// Version check
const [NODE_MAJOR, NODE_MINOR] = process.versions.node.split('.').map(Number);
if (NODE_MAJOR < 14 || (NODE_MAJOR === 14 && NODE_MINOR < 16)) {
  console.error(`Error: Node.js 14.16+ required (you have ${process.versions.node})`);
  process.exit(1);
}

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  magenta: '\x1b[35m'
};

const LEGACY_COLLECTION_ALIASES = {
  'web-product': {
    targetId: 'build-apps',
    message: 'Collection "web-product" now maps to "build-apps".'
  },
  'mobile-expo': {
    targetId: 'build-apps',
    message: 'Collection "mobile-expo" now maps to "build-apps". Use tags like "expo" when you want the mobile slice.'
  },
  'backend-systems': {
    targetId: 'build-systems',
    message: 'Collection "backend-systems" now maps to "build-systems".'
  },
  'quality-workflows': {
    targetId: 'test-and-debug',
    message: 'Collection "quality-workflows" now maps to "test-and-debug".'
  },
  'docs-files': {
    targetId: 'docs-and-research',
    message: 'Collection "docs-files" now maps to "docs-and-research".'
  },
  'business-research': {
    targetId: null,
    message: 'Collection "business-research" is no longer a top-level collection. Use search or tags for those skills.'
  },
  'creative-media': {
    targetId: null,
    message: 'Collection "creative-media" is no longer a top-level collection. Use search or tags for those skills.'
  }
};

function log(msg) { console.log(msg); }
function success(msg) { console.log(`${colors.green}${colors.bold}${msg}${colors.reset}`); }
function info(msg) { console.log(`${colors.cyan}${msg}${colors.reset}`); }
function warn(msg) { console.log(`${colors.yellow}${msg}${colors.reset}`); }
function error(msg) { console.log(`${colors.red}${msg}${colors.reset}`); }

// ============ CONFIG FILE SUPPORT ============

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
  } catch (e) {
    warn(`Warning: Could not load config file: ${e.message}`);
  }
  return { defaultAgent: 'claude', autoUpdate: false };
}

function saveConfig(config) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    return true;
  } catch (e) {
    error(`Failed to save config: ${e.message}`);
    return false;
  }
}

// ============ SKILL METADATA SUPPORT ============

function writeSkillMeta(skillPath, meta) {
  return writeInstalledMeta(skillPath, meta);
}

function readSkillMeta(skillPath) {
  return readInstalledMeta(skillPath);
}

// ============ SECURITY VALIDATION ============

function validateSkillName(name) {
  if (!name || typeof name !== 'string') {
    throw new Error('Skill name is required');
  }

  // Check for path traversal attacks
  if (name.includes('..') || name.includes('/') || name.includes('\\')) {
    throw new Error(`Invalid skill name: "${name}" contains path characters`);
  }

  // Check for valid characters (lowercase, numbers, hyphens)
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(name)) {
    throw new Error(`Invalid skill name: "${name}" must be lowercase alphanumeric with hyphens`);
  }

  // Check length
  if (name.length > 64) {
    throw new Error(`Skill name too long: ${name.length} > 64 characters`);
  }

  return true;
}

function isSafePath(basePath, targetPath) {
  const normalizedBase = path.normalize(path.resolve(basePath));
  const normalizedTarget = path.normalize(path.resolve(targetPath));
  return normalizedTarget.startsWith(normalizedBase + path.sep)
    || normalizedTarget === normalizedBase;
}

function safeTempCleanup(dir) {
  try {
    const normalizedDir = path.normalize(path.resolve(dir));
    const normalizedTmp = path.normalize(path.resolve(os.tmpdir()));
    if (!normalizedDir.startsWith(normalizedTmp + path.sep)) {
      throw new Error('Attempted to clean up directory outside of temp directory');
    }
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (cleanupErr) {
    // Swallow cleanup errors so they don't obscure the real error
  }
}

function validateGitHubSkillPath(skillPath) {
  if (!skillPath) return [];

  const segments = String(skillPath).split('/').filter(Boolean);
  if (segments.length === 0) {
    throw new Error('Invalid GitHub skill path');
  }

  segments.forEach((segment) => {
    if (segment === '.' || segment === '..') {
      throw new Error(`Invalid GitHub skill path segment: "${segment}"`);
    }
    if (!/^[a-zA-Z0-9._-]+$/.test(segment)) {
      throw new Error(`Invalid GitHub skill path segment: "${segment}" contains invalid characters`);
    }
  });

  return segments;
}

function parseSkillMarkdown(raw) {
  return parseSkillMarkdownFile(raw);
}

function readSkillDirectory(skillDir) {
  const skillMdPath = path.join(skillDir, 'SKILL.md');
  if (!fs.existsSync(skillMdPath)) {
    return null;
  }

  const raw = fs.readFileSync(skillMdPath, 'utf8');
  const parsed = parseSkillMarkdown(raw);
  if (!parsed) {
    return null;
  }

  return {
    skillMdPath,
    ...parsed,
  };
}

// ============ ERROR-SAFE JSON LOADING ============

function loadSkillsJson() {
  try {
    return loadCatalogData();
  } catch (e) {
    error(`Failed to load skills.json: ${e.message}`);
    process.exit(1);
  }
}

function getCollections(data) {
  return Array.isArray(data.collections) ? data.collections : [];
}

function getCollection(data, collectionId) {
  if (!collectionId) return null;
  return getCollections(data).find(collection => collection.id === collectionId);
}

function resolveCollection(data, collectionId) {
  if (!collectionId) {
    return {
      collection: null,
      message: null,
      unknown: false,
      retired: false
    };
  }

  const exact = getCollection(data, collectionId);
  if (exact) {
    return {
      collection: exact,
      message: null,
      unknown: false,
      retired: false
    };
  }

  const alias = LEGACY_COLLECTION_ALIASES[collectionId];
  if (!alias) {
    return {
      collection: null,
      message: `Unknown collection "${collectionId}"`,
      unknown: true,
      retired: false
    };
  }

  if (!alias.targetId) {
    return {
      collection: null,
      message: alias.message,
      unknown: false,
      retired: true
    };
  }

  const mapped = getCollection(data, alias.targetId);
  if (!mapped) {
    return {
      collection: null,
      message: `Collection "${collectionId}" now maps to "${alias.targetId}", but that collection is missing from skills.json.`,
      unknown: true,
      retired: false
    };
  }

  return {
    collection: mapped,
    message: alias.message,
    unknown: false,
    retired: false
  };
}

function getCollectionsForSkill(data, skillName) {
  return getCollections(data).filter(collection =>
    Array.isArray(collection.skills) && collection.skills.includes(skillName)
  );
}

function getCollectionBadgeText(data, skill, limit = 2) {
  const collections = getCollectionsForSkill(data, skill.name).slice(0, limit);
  if (collections.length === 0) return null;
  return collections.map(collection => collection.title).join(', ');
}

function getCollectionStartHere(collection, limit = 3) {
  return (collection?.skills || []).slice(0, limit);
}

function getSearchMatchScore(skill, query) {
  const q = query.toLowerCase();
  let score = 0;

  if (skill.name.toLowerCase() === q) score += 5000;
  else if (skill.name.toLowerCase().startsWith(q)) score += 3000;
  else if (skill.name.toLowerCase().includes(q)) score += 1800;

  if ((skill.workArea || '').toLowerCase() === q) score += 1200;
  if ((skill.branch || '').toLowerCase() === q) score += 1200;
  if ((skill.category || '').toLowerCase() === q) score += 1000;
  if ((skill.description || '').toLowerCase().includes(q)) score += 500;
  if ((skill.tags || []).some(tag => tag.toLowerCase() === q)) score += 900;
  else if ((skill.tags || []).some(tag => tag.toLowerCase().includes(q))) score += 300;

  return score;
}

function sortSkillsForSearch(data, skills, query) {
  return [...skills].sort((left, right) => {
    const scoreDiff = getSearchMatchScore(right, query) - getSearchMatchScore(left, query);
    if (scoreDiff !== 0) return scoreDiff;
    return compareSkillsByCurationData(data, left, right);
  });
}

function getWorkAreas(data) {
  return Array.isArray(data.workAreas) ? data.workAreas : [];
}

function formatWorkAreaTitle(workArea) {
  if (!workArea || typeof workArea !== 'string') return 'Other';
  if (workArea === 'docs') return 'Docs';
  return workArea
    .split('-')
    .map(token => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ');
}

function formatCount(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function getWorkAreaMeta(data, workAreaId) {
  return getWorkAreas(data).find(area => area.id === workAreaId) || null;
}

function getSkillWorkArea(skill) {
  if (skill && typeof skill.workArea === 'string' && skill.workArea.trim()) {
    return skill.workArea;
  }
  return null;
}

function getSkillBranch(skill) {
  if (skill && typeof skill.branch === 'string' && skill.branch.trim()) {
    return skill.branch;
  }
  return null;
}

function getOrigin(skill) {
  if (skill && typeof skill.origin === 'string' && skill.origin.trim()) {
    return skill.origin;
  }
  return skill.source === 'MoizIbnYousaf/Ai-Agent-Skills' ? 'authored' : 'curated';
}

function getTrust(skill) {
  if (skill && typeof skill.trust === 'string' && skill.trust.trim()) {
    return skill.trust;
  }
  if (skill.verified) return 'verified';
  if (skill.featured) return 'reviewed';
  return 'listed';
}

function getSyncMode(skill) {
  if (skill && typeof skill.syncMode === 'string' && skill.syncMode.trim()) {
    return skill.syncMode;
  }
  const origin = getOrigin(skill);
  if (origin === 'authored' || origin === 'adapted') return origin;
  return 'snapshot';
}

function getTier(skill) {
  if (skill && (skill.tier === 'house' || skill.tier === 'upstream')) {
    return skill.tier;
  }
  return skill && skill.vendored === false ? 'upstream' : 'house';
}

function getDistribution(skill) {
  if (skill && (skill.distribution === 'bundled' || skill.distribution === 'live')) {
    return skill.distribution;
  }
  return getTier(skill) === 'house' ? 'bundled' : 'live';
}

function getTierBadge(skill) {
  if (getTier(skill) === 'house') {
    return `${colors.green}[house copy]${colors.reset}`;
  }
  return `${colors.magenta}[cataloged upstream]${colors.reset}`;
}

function getTierLine(skill) {
  if (getTier(skill) === 'house') {
    return 'House copy · bundled in this library';
  }
  return `Cataloged upstream · install pulls live from ${skill.installSource || skill.source}`;
}

function getSkillMeta(skill, includeCategory = true) {
  const parts = [];
  const workArea = getSkillWorkArea(skill);
  const branch = getSkillBranch(skill);
  if (workArea && branch) {
    parts.push(`${formatWorkAreaTitle(workArea)} / ${branch}`);
  } else if (workArea) {
    parts.push(formatWorkAreaTitle(workArea));
  } else if (includeCategory && skill.category) {
    parts.push(skill.category);
  }
  parts.push(getOrigin(skill));
  if (skill.source) parts.push(skill.source);
  return parts.join(' · ');
}

function filterSkillsByCollection(data, skills, collectionId) {
  if (!collectionId) {
    return { collection: null, skills, message: null, unknown: false, retired: false };
  }

  const resolution = resolveCollection(data, collectionId);
  if (!resolution.collection) {
    return {
      collection: null,
      skills: null,
      message: resolution.message,
      unknown: resolution.unknown,
      retired: resolution.retired
    };
  }

  const order = new Map(resolution.collection.skills.map((name, index) => [name, index]));
  const filtered = skills
    .filter(skill => order.has(skill.name))
    .sort((a, b) => order.get(a.name) - order.get(b.name));

  return {
    collection: resolution.collection,
    skills: filtered,
    message: resolution.message,
    unknown: false,
    retired: false
  };
}

function printCollectionSuggestions(data) {
  const collections = getCollections(data);
  if (collections.length === 0) return;

  log(`\n${colors.dim}Available collections:${colors.reset}`);
  collections.forEach(collection => {
    log(`  ${colors.cyan}${collection.id}${colors.reset} - ${collection.title}`);
  });
}

function getAvailableSkills() {
  const skills = [];

  // Vendored skills (local folders)
  if (fs.existsSync(SKILLS_DIR)) {
    try {
      skills.push(...fs.readdirSync(SKILLS_DIR).filter(name => {
        const skillPath = path.join(SKILLS_DIR, name);
        return fs.statSync(skillPath).isDirectory() &&
               fs.existsSync(path.join(skillPath, 'SKILL.md'));
      }));
    } catch (e) {
      error(`Failed to read skills directory: ${e.message}`);
    }
  }

  // Non-vendored cataloged skills (from skills.json)
  try {
    const data = loadSkillsJson();
    for (const skill of data.skills) {
      if (skill.vendored === false && !skills.includes(skill.name)) {
        skills.push(skill.name);
      }
    }
  } catch {}

  return skills;
}

// ============ ARGUMENT PARSING ============

function parseArgs(args) {
  const config = loadConfig();
  const validAgents = Object.keys(AGENT_PATHS);
  const validLegacyAgents = Object.keys(LEGACY_AGENTS);

  const result = {
    command: null,
    param: null,
    scope: null,          // v3: 'global', 'project', or null (default)
    agents: [],           // Legacy: array of agents
    allAgents: false,
    explicitAgent: false,
    installed: false,
    all: false,
    dryRun: false,
    tags: null,
    labels: null,
    notes: null,
    why: null,
    branch: null,
    trust: null,
    description: null,
    lastVerified: null,
    featured: null,
    clearVerified: false,
    remove: false,
    category: null,
    workArea: null,
    collection: null,
    skillFilters: [],     // v3: --skill flag values
    listMode: false,      // v3: --list flag
    yes: false,           // v3: --yes flag (non-interactive)
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    // v3 scope flags
    if (arg === '-p' || arg === '--project') {
      result.scope = 'project';
    }
    else if (arg === '-g' || arg === '--global') {
      result.scope = 'global';
    }
    // v3 --skill filter
    else if (arg === '--skill') {
      const value = args[i + 1];
      if (value) {
        result.skillFilters.push(value);
        i++;
      }
    }
    // v3 --list flag
    else if (arg === '--list') {
      result.listMode = true;
    }
    // v3 --yes flag
    else if (arg === '--yes' || arg === '-y') {
      result.yes = true;
    }
    // --agents claude,cursor,codex (multiple agents)
    else if (arg === '--agents') {
      result.explicitAgent = true;
      const value = args[i + 1] || '';
      value.split(',').forEach(a => {
        const agent = a.trim();
        if (validAgents.includes(agent) && !result.agents.includes(agent)) {
          result.agents.push(agent);
        }
      });
      i++;
    }
    // --agent cursor (single agent, backward compatible)
    else if (arg === '--agent' || arg === '-a') {
      result.explicitAgent = true;
      let agentValue = args[i + 1] || 'claude';
      agentValue = agentValue.replace(/^-+/, '');
      if (validAgents.includes(agentValue) && !result.agents.includes(agentValue)) {
        result.agents.push(agentValue);
      }
      i++;
    }
    // --all-agents (install to all known agents)
    else if (arg === '--all-agents') {
      result.explicitAgent = true;
      result.allAgents = true;
    }
    else if (arg === '--installed' || arg === '-i') {
      result.installed = true;
    }
    else if (arg === '--all') {
      result.all = true;
    }
    else if (arg === '--dry-run' || arg === '-n') {
      result.dryRun = true;
    }
    else if (arg === '--tag' || arg === '--tags' || arg === '-t') {
      result.tags = args[i + 1];
      i++;
    }
    else if (arg === '--labels') {
      result.labels = args[i + 1];
      i++;
    }
    else if (arg === '--notes') {
      result.notes = args[i + 1];
      i++;
    }
    else if (arg === '--why') {
      result.why = args[i + 1];
      i++;
    }
    else if (arg === '--branch') {
      result.branch = args[i + 1];
      i++;
    }
    else if (arg === '--trust') {
      result.trust = args[i + 1];
      i++;
    }
    else if (arg === '--description') {
      result.description = args[i + 1];
      i++;
    }
    else if (arg === '--last-verified') {
      result.lastVerified = args[i + 1];
      i++;
    }
    else if (arg === '--feature') {
      result.featured = true;
    }
    else if (arg === '--unfeature') {
      result.featured = false;
    }
    else if (arg === '--verify') {
      result.trust = 'verified';
    }
    else if (arg === '--unverify' || arg === '--clear-verified') {
      result.clearVerified = true;
    }
    else if (arg === '--remove') {
      result.remove = true;
    }
    else if (arg === '--category' || arg === '-c') {
      result.category = args[i + 1];
      i++;
    }
    else if (arg === '--work-area' || arg === '--area') {
      result.workArea = args[i + 1];
      i++;
    }
    else if (arg === '--collection') {
      result.collection = args[i + 1];
      i++;
    }
    else if (arg.startsWith('--')) {
      const potentialAgent = arg.replace(/^--/, '');
      if (validAgents.includes(potentialAgent)) {
        result.explicitAgent = true;
        if (!result.agents.includes(potentialAgent)) {
          result.agents.push(potentialAgent);
        }
      } else if (!result.command) {
        result.command = arg;
      }
    }
    else if (!result.command) {
      result.command = args[i];
    } else if (!result.param) {
      result.param = args[i];
    }
  }

  // Resolve final agents list
  if (result.allAgents) {
    result.agents = [...validAgents];
  } else if (result.agents.length === 0) {
    // Use config agents or default
    const configAgents = config.agents && config.agents.length > 0
      ? config.agents.filter(a => validAgents.includes(a))
      : [];
    result.agents = configAgents.length > 0 ? configAgents : ['claude'];
  }

  return result;
}

// v3: resolve install target path from scope/agent flags
function resolveInstallPath(parsed) {
  // 1. Explicit legacy --agent override
  if (parsed.explicitAgent && parsed.agents.length > 0) {
    return parsed.agents.map(a => AGENT_PATHS[a] || SCOPES.global);
  }
  // 2. --all installs to both scopes
  if (parsed.all) {
    return [SCOPES.global, SCOPES.project];
  }
  // 3. Explicit scope flag
  if (parsed.scope === 'project') return [SCOPES.project];
  if (parsed.scope === 'global') return [SCOPES.global];
  // 4. Default: global
  return [SCOPES.global];
}

function resolveManagedTargets(parsed) {
  if (parsed.explicitAgent && parsed.agents.length > 0) {
    return parsed.agents.map((agent) => ({
      label: agent,
      path: AGENT_PATHS[agent] || SCOPES.global,
    }));
  }

  if (parsed.scope === 'project') {
    return [{ label: 'project', path: SCOPES.project }];
  }

  if (parsed.scope === 'global') {
    return [{ label: 'global', path: SCOPES.global }];
  }

  return parsed.agents.map((agent) => ({
    label: agent,
    path: AGENT_PATHS[agent] || SCOPES.global,
  }));
}

// v3: resolve scope label for metadata
function resolveScopeLabel(targetPath) {
  if (targetPath === SCOPES.global) return 'global';
  if (targetPath === SCOPES.project) return 'project';
  return 'legacy';
}

// ============ SAFE FILE OPERATIONS ============

function copyDir(src, dest, currentSize = { total: 0 }, rootSrc = null) {
  // Track root source to prevent path escape attacks
  if (rootSrc === null) rootSrc = src;

  try {
    if (fs.existsSync(dest)) {
      fs.rmSync(dest, { recursive: true });
    }
    fs.mkdirSync(dest, { recursive: true });

    const entries = fs.readdirSync(src, { withFileTypes: true });

    // Files/folders to skip during copy
    const skipList = ['.git', '.github', 'node_modules', '.DS_Store'];

    for (const entry of entries) {
      // Skip unnecessary files/folders
      if (skipList.includes(entry.name)) continue;

      // Skip symlinks to prevent path escape attacks
      if (entry.isSymbolicLink()) {
        warn(`Skipping symlink: ${entry.name}`);
        continue;
      }

      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      // Verify resolved path stays within source directory (prevent path traversal)
      const resolvedSrc = fs.realpathSync(srcPath);
      if (!resolvedSrc.startsWith(fs.realpathSync(rootSrc))) {
        warn(`Skipping file outside source directory: ${entry.name}`);
        continue;
      }

      if (entry.isDirectory()) {
        copyDir(srcPath, destPath, currentSize, rootSrc);
      } else if (entry.isFile()) {
        const stat = fs.statSync(srcPath);
        currentSize.total += stat.size;

        if (currentSize.total > MAX_SKILL_SIZE) {
          throw new Error(`Skill exceeds maximum size of ${MAX_SKILL_SIZE / 1024 / 1024}MB`);
        }

        fs.copyFileSync(srcPath, destPath);
      }
      // Skip any other special file types (sockets, devices, etc.)
    }
  } catch (e) {
    // Clean up partial install on failure
    if (fs.existsSync(dest)) {
      try { fs.rmSync(dest, { recursive: true }); } catch {}
    }
    throw e;
  }
}

function getDirectorySize(dir) {
  let size = 0;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        size += getDirectorySize(fullPath);
      } else {
        size += fs.statSync(fullPath).size;
      }
    }
  } catch {}
  return size;
}

// ============ CORE COMMANDS ============

function installSkill(skillName, agent = 'claude', dryRun = false, targetPath = null) {
  try {
    validateSkillName(skillName);
  } catch (e) {
    error(e.message);
    return false;
  }

  const sourcePath = path.join(SKILLS_DIR, skillName);

  if (!fs.existsSync(sourcePath)) {
    // Check if this is a non-vendored cataloged skill
    try {
      const data = loadSkillsJson();
      const cataloged = data.skills.find(s => s.name === skillName && s.tier === 'upstream');
      if (cataloged) {
        const installSource = cataloged.installSource || cataloged.source;
        if (installSource) {
          info(`"${skillName}" is a cataloged upstream skill. Installing live from ${installSource}...`);
          const parsed = parseSource(installSource);
          const installPaths = targetPath ? [targetPath] : [AGENT_PATHS[agent] || SCOPES.global];
          return installFromSource(installSource, parsed, installPaths, [skillName], false, true, dryRun);
        }
      }
    } catch {}

    error(`Skill "${skillName}" not found.`);

    // Suggest similar skills
    const available = getAvailableSkills();
    const similar = available.filter(s =>
      s.includes(skillName) || skillName.includes(s) ||
      levenshteinDistance(s, skillName) <= 3
    ).slice(0, 3);

    if (similar.length > 0) {
      log(`\n${colors.dim}Did you mean: ${similar.join(', ')}?${colors.reset}`);
    }
    return false;
  }

  const destDir = targetPath || AGENT_PATHS[agent] || SCOPES.global;
  const destPath = path.join(destDir, skillName);
  const skillSize = getDirectorySize(sourcePath);

  if (dryRun) {
    const scopeLabel = resolveScopeLabel(destDir);
    log(`\n${colors.bold}Dry Run${colors.reset} (no changes made)\n`);
    info(`Would install: ${skillName}`);
    info(`Scope: ${scopeLabel}`);
    info(`Source: ${sourcePath}`);
    info(`Destination: ${destPath}`);
    info(`Size: ${(skillSize / 1024).toFixed(1)} KB`);

    if (fs.existsSync(destPath)) {
      warn(`Note: Would overwrite existing installation`);
    }
    return true;
  }

  try {
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    copyDir(sourcePath, destPath);

    // Write metadata for update tracking
    writeSkillMeta(destPath, {
      sourceType: 'registry',
      source: 'registry',
      skillName,
      scope: resolveScopeLabel(destDir),
    });

    const scopeLabel = resolveScopeLabel(destDir);
    success(`\nInstalled: ${skillName}`);
    info(`Scope: ${scopeLabel}`);
    info(`Location: ${destPath}`);
    info(`Size: ${(skillSize / 1024).toFixed(1)} KB`);

    log('');
    if (agent) {
      showAgentInstructions(agent, skillName, destPath);
    }

    return true;
  } catch (e) {
    error(`Failed to install skill: ${e.message}`);
    return false;
  }
}

// v3: install a catalog skill to a scope path directly (for TUI scope chooser)
function installSkillToScope(skillName, scopePath, scopeLabel, dryRun = false) {
  try { validateSkillName(skillName); } catch (e) { error(e.message); return false; }

  const sourcePath = path.join(SKILLS_DIR, skillName);
  if (!fs.existsSync(sourcePath)) {
    try {
      const data = loadSkillsJson();
      const cataloged = data.skills.find((skill) => skill.name === skillName && skill.tier === 'upstream');
      if (cataloged && cataloged.installSource) {
        const parsed = parseSource(cataloged.installSource);
        return installFromSource(cataloged.installSource, parsed, [scopePath], [skillName], false, true, dryRun);
      }
    } catch {}

    error(`Skill "${skillName}" not found.`);
    const available = getAvailableSkills();
    const similar = available.filter(s => s.includes(skillName) || skillName.includes(s) || levenshteinDistance(s, skillName) <= 3).slice(0, 3);
    if (similar.length > 0) log(`\n${colors.dim}Did you mean: ${similar.join(', ')}?${colors.reset}`);
    return false;
  }

  const destPath = path.join(scopePath, skillName);
  const skillSize = getDirectorySize(sourcePath);

  if (dryRun) {
    log(`\n${colors.bold}Dry Run${colors.reset} (no changes made)\n`);
    info(`Would install: ${skillName}`);
    info(`Scope: ${scopeLabel}`);
    info(`Destination: ${destPath}`);
    info(`Size: ${(skillSize / 1024).toFixed(1)} KB`);
    return true;
  }

  try {
    if (!fs.existsSync(scopePath)) fs.mkdirSync(scopePath, { recursive: true });
    copyDir(sourcePath, destPath);
    writeSkillMeta(destPath, {
      sourceType: 'registry',
      source: 'registry',
      repo: 'MoizIbnYousaf/Ai-Agent-Skills',
      url: 'https://github.com/MoizIbnYousaf/Ai-Agent-Skills',
      skillName,
      scope: scopeLabel,
    });
    success(`\nInstalled: ${skillName}`);
    info(`Scope: ${scopeLabel}`);
    info(`Location: ${destPath}`);
    info(`Size: ${(skillSize / 1024).toFixed(1)} KB`);
    if (scopeLabel === 'global') {
      log(`${colors.dim}The skill is now available in Claude Code.\nJust mention "${skillName}" in your prompt and Claude will use it.${colors.reset}`);
    } else {
      log(`${colors.dim}The skill is installed in .agents/skills/ for this project.\nMultiple agents (Claude, Cursor, Codex, Gemini CLI) can read it.${colors.reset}`);
    }
    return true;
  } catch (e) {
    error(`Failed to install skill: ${e.message}`);
    return false;
  }
}

function showAgentInstructions(agent, skillName, destPath) {
  const instructions = {
    claude: `The skill is now available in Claude Code.\nJust mention "${skillName}" in your prompt and Claude will use it.`,
    cursor: `The skill is installed in your project's .cursor/skills/ folder.\nCursor will automatically detect and use it.`,
    amp: `The skill is now available in Amp.`,
    codex: `The skill is now available in Codex.`,
    vscode: `The skill is installed in your project's .github/skills/ folder.`,
    copilot: `The skill is installed in your project's .github/skills/ folder.`,
    project: `The skill is installed in .skills/ in your current directory.\nThis makes it portable across all compatible agents.`,
    letta: `The skill is now available in Letta.`,
    goose: `The skill is now available in Goose.`,
    opencode: `The skill is now available in OpenCode.`,
    kilocode: `The skill is now available in Kilo Code.\nKiloCode will automatically detect and use it.`,
    gemini: `The skill is now available in Gemini CLI.\nMake sure Agent Skills is enabled in your Gemini CLI settings.`
  };

  log(`${colors.dim}${instructions[agent] || `The skill is ready to use with ${agent}.`}${colors.reset}`);
}

function uninstallSkill(skillName, agent = 'claude', dryRun = false) {
  const destDir = AGENT_PATHS[agent] || AGENT_PATHS.claude;
  return uninstallSkillFromPath(skillName, destDir, agent, dryRun);
}

function uninstallSkillFromPath(skillName, destDir, targetLabel = 'global', dryRun = false) {
  try {
    validateSkillName(skillName);
  } catch (e) {
    error(e.message);
    return false;
  }

  const skillPath = path.join(destDir, skillName);

  if (!fs.existsSync(skillPath)) {
    error(`Skill "${skillName}" is not installed in ${targetLabel}.`);
    log(`\nInstalled skills in ${targetLabel}:`);
    listInstalledSkillsInPath(destDir, targetLabel);
    return false;
  }

  if (dryRun) {
    log(`\n${colors.bold}Dry Run${colors.reset} (no changes made)\n`);
    info(`Would uninstall: ${skillName}`);
    info(`Target: ${targetLabel}`);
    info(`Path: ${skillPath}`);
    return true;
  }

  try {
    fs.rmSync(skillPath, { recursive: true });
    success(`\nUninstalled: ${skillName}`);
    info(`Target: ${targetLabel}`);
    info(`Removed from: ${skillPath}`);
    return true;
  } catch (e) {
    error(`Failed to uninstall skill: ${e.message}`);
    return false;
  }
}

function getInstalledSkills(agent = 'claude') {
  const destDir = AGENT_PATHS[agent] || AGENT_PATHS.claude;
  return getInstalledSkillsInPath(destDir);
}

function getInstalledSkillsInPath(destDir) {
  if (!fs.existsSync(destDir)) return [];

  try {
    return fs.readdirSync(destDir).filter(name => {
      const skillPath = path.join(destDir, name);
      return fs.statSync(skillPath).isDirectory() &&
             fs.existsSync(path.join(skillPath, 'SKILL.md'));
    });
  } catch (e) {
    return [];
  }
}

function listInstalledSkills(agent = 'claude') {
  const installed = getInstalledSkills(agent);
  const destDir = AGENT_PATHS[agent] || AGENT_PATHS.claude;
  return listInstalledSkillsInPath(destDir, agent, installed);
}

function listInstalledSkillsInPath(destDir, label = 'global', installed = null) {
  const resolvedInstalled = Array.isArray(installed) ? installed : getInstalledSkillsInPath(destDir);

  if (resolvedInstalled.length === 0) {
    warn(`No skills installed in ${label}`);
    info(`Location: ${destDir}`);
    return;
  }

  log(`\n${colors.bold}Installed Skills${colors.reset} (${resolvedInstalled.length} in ${label})\n`);
  log(`${colors.dim}Location: ${destDir}${colors.reset}\n`);

  resolvedInstalled.forEach(name => {
    log(`  ${colors.green}${name}${colors.reset}`);
  });

  if (label === 'project') {
    log(`\n${colors.dim}Update:    npx ai-agent-skills update <name> --project${colors.reset}`);
    log(`${colors.dim}Uninstall: npx ai-agent-skills uninstall <name> --project${colors.reset}`);
    return;
  }

  if (label === 'global') {
    log(`\n${colors.dim}Update:    npx ai-agent-skills update <name> --global${colors.reset}`);
    log(`${colors.dim}Uninstall: npx ai-agent-skills uninstall <name> --global${colors.reset}`);
    return;
  }

  log(`\n${colors.dim}Update:    npx ai-agent-skills update <name> --agent ${label}${colors.reset}`);
  log(`${colors.dim}Uninstall: npx ai-agent-skills uninstall <name> --agent ${label}${colors.reset}`);
}

function runDoctor(agentsToCheck = Object.keys(AGENT_PATHS)) {
  const checks = [];

  try {
    const data = loadSkillsJson();
    const vendoredSkills = (data.skills || []).filter(s => s.tier === 'house');
    const catalogedSkills = (data.skills || []).filter(s => s.tier === 'upstream');
    const missingSkills = vendoredSkills.filter((skill) => {
      const skillPath = path.join(SKILLS_DIR, skill.name, 'SKILL.md');
      return !fs.existsSync(skillPath);
    });

    const vendoredCount = vendoredSkills.length;
    const catalogedCount = catalogedSkills.length;
    checks.push({
      name: 'Bundled library',
      pass: missingSkills.length === 0,
      detail: missingSkills.length === 0
        ? `${vendoredCount} vendored + ${catalogedCount} cataloged upstream across ${getCollections(data).length} collections`
        : `Missing bundled SKILL.md for ${missingSkills.map((skill) => skill.name).join(', ')}`,
    });
  } catch (e) {
    checks.push({
      name: 'Bundled library',
      pass: false,
      detail: `Failed to load skills.json: ${e.message}`,
    });
  }

  if (!fs.existsSync(CONFIG_FILE)) {
    checks.push({
      name: 'Config file',
      pass: true,
      detail: `Not created yet; defaults will be used at ${CONFIG_FILE}`,
    });
  } else {
    try {
      JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      checks.push({
        name: 'Config file',
        pass: true,
        detail: `Readable at ${CONFIG_FILE}`,
      });
    } catch (e) {
      checks.push({
        name: 'Config file',
        pass: false,
        detail: `Invalid JSON at ${CONFIG_FILE}: ${e.message}`,
      });
    }
  }

  agentsToCheck.forEach((agent) => {
    const targetPath = AGENT_PATHS[agent] || AGENT_PATHS.claude;
    const access = getPathAccessStatus(targetPath);
    const installedCount = getInstalledSkills(agent).length;
    const brokenCount = getBrokenInstalledEntries(agent).length;
    const detailParts = [access.detail, `${installedCount} installed`];
    if (brokenCount > 0) {
      detailParts.push(`${brokenCount} broken entries`);
    }

    checks.push({
      name: `${agent} target`,
      pass: access.pass && brokenCount === 0,
      detail: detailParts.join(' · '),
    });
  });

  log(`\n${colors.bold}AI Agent Skills Doctor${colors.reset}`);
  log(`${colors.dim}Checking the library, config, and install targets.${colors.reset}\n`);

  let passed = 0;
  let failed = 0;
  checks.forEach((check) => {
    const badge = check.pass
      ? `${colors.green}${colors.bold}PASS${colors.reset}`
      : `${colors.red}${colors.bold}FAIL${colors.reset}`;
    log(`  [${badge}] ${check.name}`);
    log(`      ${colors.dim}${check.detail}${colors.reset}`);
    log('');
    if (check.pass) passed++;
    else failed++;
  });

  log(`${colors.bold}Summary:${colors.reset} ${colors.green}${passed} passed${colors.reset}, ${failed > 0 ? `${colors.red}${failed} failed${colors.reset}` : `${colors.dim}0 failed${colors.reset}`}\n`);

  if (failed > 0) {
    process.exitCode = 1;
  }
}

function runValidate(targetPath) {
  const result = validateSkillDirectory(targetPath);
  const label = targetPath ? expandPath(targetPath) : process.cwd();

  log(`\n${colors.bold}Validate Skill${colors.reset}`);
  log(`${colors.dim}${label}${colors.reset}\n`);

  if (!result.summary) {
    result.errors.forEach((message) => log(`  ${colors.red}${colors.bold}ERROR${colors.reset} ${message}`));
    log('');
    process.exitCode = 1;
    return;
  }

  result.errors.forEach((message) => log(`  ${colors.red}${colors.bold}ERROR${colors.reset} ${message}`));
  result.warnings.forEach((message) => log(`  ${colors.yellow}${colors.bold}WARN${colors.reset}  ${message}`));

  if (result.errors.length === 0 && result.warnings.length === 0) {
    log(`  ${colors.green}${colors.bold}PASS${colors.reset} Skill is valid`);
  }

  log('');
  log(`  ${colors.bold}Name:${colors.reset} ${result.summary.name || 'n/a'}`);
  log(`  ${colors.bold}Description:${colors.reset} ${result.summary.description || 'n/a'}`);
  log(`  ${colors.bold}Size:${colors.reset} ${(result.summary.totalSize / 1024).toFixed(1)}KB`);
  log(`  ${colors.bold}Path:${colors.reset} ${result.skillDir}`);
  log('');

  if (!result.ok) {
    process.exitCode = 1;
  }
}

// Update from bundled registry
function updateFromRegistry(skillName, targetLabel, destPath, dryRun) {
  const sourcePath = path.join(SKILLS_DIR, skillName);

  if (!fs.existsSync(sourcePath)) {
    error(`Skill "${skillName}" not found in repository.`);
    return false;
  }

  if (dryRun) {
    log(`\n${colors.bold}Dry Run${colors.reset} (no changes made)\n`);
    info(`Would update: ${skillName} (from registry)`);
    info(`Target: ${targetLabel}`);
    info(`Path: ${destPath}`);
    return true;
  }

  try {
    fs.rmSync(destPath, { recursive: true });
    copyDir(sourcePath, destPath);

    // Write metadata
    writeSkillMeta(destPath, {
      sourceType: 'registry',
      source: 'registry',
      repo: 'MoizIbnYousaf/Ai-Agent-Skills',
      url: 'https://github.com/MoizIbnYousaf/Ai-Agent-Skills',
      skillName,
      scope: resolveScopeLabel(path.dirname(destPath)),
    });

    success(`\nUpdated: ${skillName}`);
    info(`Target: ${targetLabel}`);
    info(`Location: ${destPath}`);
    return true;
  } catch (e) {
    error(`Failed to update skill: ${e.message}`);
    return false;
  }
}

function updateFromRemoteSource(meta, skillName, targetLabel, destPath, dryRun) {
  const sourceType = meta.sourceType || meta.source;
  const scopeLabel = meta.scope || resolveScopeLabel(path.dirname(destPath));

  let parsed;
  let sourceLabel;

  if (sourceType === 'github') {
    if (!meta.repo || typeof meta.repo !== 'string' || !meta.repo.includes('/')) {
      error(`Invalid repository in metadata: ${meta.repo}`);
      error('Try reinstalling the skill from GitHub.');
      return false;
    }

    const [owner, repo] = meta.repo.split('/');
    parsed = {
      type: 'github',
      url: `https://github.com/${meta.repo}`,
      owner,
      repo,
      ref: meta.ref || null,
      subpath: meta.subpath || null,
    };
    sourceLabel = `github:${meta.repo}`;
  } else if (sourceType === 'git') {
    if (!meta.url || typeof meta.url !== 'string') {
      error('Invalid git URL in metadata. Try reinstalling the skill.');
      return false;
    }

    try {
      validateGitUrl(meta.url);
    } catch (e) {
      error(`Invalid git URL in metadata: ${e.message}. Try reinstalling the skill.`);
      return false;
    }

    parsed = {
      type: 'git',
      url: meta.url,
      ref: meta.ref || null,
      subpath: meta.subpath || null,
    };
    sourceLabel = `git:${sanitizeGitUrl(meta.url)}${meta.ref ? `#${meta.ref}` : ''}`;
  } else {
    error(`Unsupported remote source type: ${sourceType}`);
    return false;
  }

  if (dryRun) {
    log(`\n${colors.bold}Dry Run${colors.reset} (no changes made)\n`);
    info(`Would update: ${skillName} (from ${sourceLabel})`);
    info(`Target: ${targetLabel}`);
    info(`Path: ${destPath}`);
    return true;
  }

  let prepared = null;

  try {
    info(`Updating ${skillName} from ${sourceLabel}...`);
    prepared = prepareSourceLib(buildInstallSourceRef(parsed, parsed.subpath || null) || parsed.url, {
      parsed,
      sparseSubpath: parsed.subpath || null,
    });

    const discovered = maybeRenameRootSkill(
      discoverSkills(prepared.rootDir, prepared.repoRoot),
      parsed,
      prepared.rootDir,
      prepared.repoRoot,
    );

    let match = findDiscoveredSkill(discovered, skillName);
    if (!match && meta.subpath) {
      match = discovered.find((skill) => skill.relativeDir === meta.subpath) || null;
    }
    if (!match && discovered.length === 1) {
      match = discovered[0];
    }

    if (!match) {
      error(`Skill "${skillName}" not found in source ${sourceLabel}`);
      return false;
    }

    fs.rmSync(destPath, { recursive: true, force: true });
    copyDir(match.dir, destPath);

    writeSkillMeta(destPath, {
      ...meta,
      sourceType,
      source: sourceType,
      url: parsed.type === 'git' ? sanitizeGitUrl(parsed.url) : parsed.url,
      repo: buildRepoId(parsed) || meta.repo || null,
      ref: parsed.ref || null,
      subpath: match.relativeDir && match.relativeDir !== '.' ? match.relativeDir : null,
      installSource: buildInstallSourceRef(parsed, match.relativeDir === '.' ? null : match.relativeDir),
      skillName: match.name,
      scope: scopeLabel,
    });

    success(`\nUpdated: ${match.name}`);
    info(`Source: ${sourceLabel}`);
    info(`Target: ${targetLabel}`);
    info(`Location: ${destPath}`);
    return true;
  } catch (e) {
    error(`Failed to update from ${sourceType}: ${e.message}`);
    return false;
  } finally {
    if (prepared) {
      prepared.cleanup();
    }
  }
}

// Update from GitHub repository
function updateFromGitHub(meta, skillName, targetLabel, destPath, dryRun) {
  return updateFromRemoteSource(meta, skillName, targetLabel, destPath, dryRun);
}

function updateFromGitUrl(meta, skillName, targetLabel, destPath, dryRun) {
  return updateFromRemoteSource(meta, skillName, targetLabel, destPath, dryRun);
}

// Update from local path
function updateFromLocalPath(meta, skillName, targetLabel, destPath, dryRun) {
  const sourcePath = meta.path;

  if (!sourcePath || typeof sourcePath !== 'string') {
    error(`Invalid path in metadata.`);
    error(`Try reinstalling the skill from the local path.`);
    return false;
  }

  if (!fs.existsSync(sourcePath)) {
    error(`Source path no longer exists: ${sourcePath}`);
    return false;
  }

  // Verify it's still a valid skill directory
  if (!fs.existsSync(path.join(sourcePath, 'SKILL.md'))) {
    error(`Source is no longer a valid skill (missing SKILL.md): ${sourcePath}`);
    return false;
  }

  if (dryRun) {
    log(`\n${colors.bold}Dry Run${colors.reset} (no changes made)\n`);
    info(`Would update: ${skillName} (from local:${sourcePath})`);
    info(`Target: ${targetLabel}`);
    info(`Path: ${destPath}`);
    return true;
  }

  try {
    fs.rmSync(destPath, { recursive: true });
    copyDir(sourcePath, destPath);

    // Preserve metadata
    writeSkillMeta(destPath, meta);

    success(`\nUpdated: ${skillName}`);
    info(`Source: local:${sourcePath}`);
    info(`Target: ${targetLabel}`);
    info(`Location: ${destPath}`);
    return true;
  } catch (e) {
    error(`Failed to update from local path: ${e.message}`);
    return false;
  }
}

function updateSkill(skillName, agent = 'claude', dryRun = false) {
  const destDir = AGENT_PATHS[agent] || AGENT_PATHS.claude;
  return updateSkillInPath(skillName, destDir, agent, dryRun);
}

function updateSkillInPath(skillName, destDir, targetLabel = 'global', dryRun = false) {
  try {
    validateSkillName(skillName);
  } catch (e) {
    error(e.message);
    return false;
  }

  const destPath = path.join(destDir, skillName);

  if (!fs.existsSync(destPath)) {
    error(`Skill "${skillName}" is not installed in ${targetLabel}.`);
    log(`\nUse 'install' to add it first.`);
    return false;
  }

  // Read metadata to determine source
  const meta = readSkillMeta(destPath);

  if (!meta) {
    // Legacy skill without metadata - try registry
    return updateFromRegistry(skillName, targetLabel, destPath, dryRun);
  }

  // Route to correct update method based on source
  switch (meta.sourceType || meta.source) {
    case 'github':
      return updateFromGitHub(meta, skillName, targetLabel, destPath, dryRun);
    case 'git':
      return updateFromGitUrl(meta, skillName, targetLabel, destPath, dryRun);
    case 'local':
      return updateFromLocalPath(meta, skillName, targetLabel, destPath, dryRun);
    case 'catalog':
    case 'registry':
    default:
      return updateFromRegistry(skillName, targetLabel, destPath, dryRun);
  }
}

function updateAllSkills(agent = 'claude', dryRun = false) {
  const destDir = AGENT_PATHS[agent] || AGENT_PATHS.claude;
  return updateAllSkillsInPath(destDir, agent, dryRun);
}

function updateAllSkillsInPath(destDir, targetLabel = 'global', dryRun = false) {
  const installed = getInstalledSkillsInPath(destDir);

  if (installed.length === 0) {
    warn(`No skills installed in ${targetLabel}`);
    return;
  }

  log(`\n${colors.bold}Updating ${installed.length} skill(s) in ${targetLabel}...${colors.reset}\n`);

  let updated = 0;
  let failed = 0;

  for (const skillName of installed) {
    if (updateSkillInPath(skillName, destDir, targetLabel, dryRun)) {
      updated++;
    } else {
      failed++;
    }
  }

  log(`\n${colors.bold}Summary:${colors.reset} ${updated} updated, ${failed} failed`);
}

// ============ LISTING AND SEARCH ============

function listSkills(category = null, tags = null, collectionId = null, workArea = null) {
  const data = loadSkillsJson();
  let skills = data.skills || [];

  // Filter by category
  if (category) {
    skills = skills.filter(s => s.category === category.toLowerCase());
  }

  if (workArea) {
    skills = skills.filter(s => (s.workArea || '').toLowerCase() === workArea.toLowerCase());
  }

  // Filter by tags
  if (tags) {
    const tagList = tags.split(',').map(t => t.trim().toLowerCase());
    skills = skills.filter(s =>
      s.tags && tagList.some(t => s.tags.includes(t))
    );
  }

  const collectionResult = filterSkillsByCollection(data, skills, collectionId);
  if (collectionId && !collectionResult.collection) {
    warn(collectionResult.message);
    if (collectionResult.unknown) {
      printCollectionSuggestions(data);
    }
    return;
  }
  if (collectionResult.message) {
    info(collectionResult.message);
  }
  skills = collectionResult.skills;

  if (!collectionResult.collection) {
    skills = sortSkillsByCuration(data, skills);
  }

  if (skills.length === 0) {
    if (category || workArea || tags || collectionId) {
      warn(`No skills found matching filters`);
      log(`\n${colors.dim}Try: npx ai-agent-skills list${colors.reset}`);
    } else {
      warn('No skills found in skills.json');
    }
    return;
  }

  if (collectionResult.collection) {
    const startHere = getCollectionStartHere(collectionResult.collection);
    const collectionShelves = new Set(skills.map((skill) => getSkillWorkArea(skill)).filter(Boolean));
    const collectionSources = new Set(skills.map((skill) => skill.source).filter(Boolean));
    log(`${colors.blue}${colors.bold}${collectionResult.collection.title}${colors.reset} ${colors.dim}[${collectionResult.collection.id}]${colors.reset}`);
    log(`${colors.dim}${collectionResult.collection.description}${colors.reset}\n`);
    log(`${colors.dim}Start here:${colors.reset} ${startHere.join(', ')}`);
    log(`${colors.dim}${formatCount(skills.length, 'pick')} · ${formatCount(collectionShelves.size, 'shelf', 'shelves')} · ${formatCount(collectionSources.size, 'source repo', 'source repos')}${colors.reset}\n`);

    skills.forEach(skill => {
      const featured = skill.featured ? ` ${colors.yellow}*${colors.reset}` : '';
      const verified = skill.verified ? ` ${colors.green}✓${colors.reset}` : '';
      const tierBadge = ` ${getTierBadge(skill)}`;
      const tagStr = skill.tags && skill.tags.length > 0
        ? ` ${colors.dim}[${skill.tags.slice(0, 3).join(', ')}]${colors.reset}`
        : '';
      const collectionBadge = getCollectionBadgeText(data, skill)
        ? ` ${colors.dim}{${getCollectionBadgeText(data, skill)}}${colors.reset}`
        : '';

      log(`  ${colors.green}${skill.name}${colors.reset}${featured}${verified}${tierBadge}${tagStr}${collectionBadge}`);
      log(`    ${colors.dim}${getSkillMeta(skill, false)}${colors.reset}`);

      const shelfNote = skill.whyHere || skill.description;
      const desc = shelfNote.length > 88
        ? shelfNote.slice(0, 88) + '...'
        : shelfNote;
      log(`    ${colors.dim}Why:${colors.reset} ${desc}`);
    });
  } else {
    const byWorkArea = {};
    skills.forEach(skill => {
      const area = getSkillWorkArea(skill) || 'other';
      if (!byWorkArea[area]) byWorkArea[area] = [];
      byWorkArea[area].push(skill);
    });

    const orderedAreas = [
      ...getWorkAreas(data).map(area => area.id),
      ...Object.keys(byWorkArea).filter(area => !getWorkAreaMeta(data, area)).sort()
    ].filter((area, index, array) => array.indexOf(area) === index && byWorkArea[area]);

    const counts = getCatalogCounts(data);
    log(`\n${colors.bold}Curated Library${colors.reset}`);
    log(`${colors.dim}${formatCount(counts.total, 'pick')} on ${formatCount(orderedAreas.length, 'shelf', 'shelves')} · ${formatCount(counts.house, 'house copy', 'house copies')} · ${formatCount(counts.upstream, 'cataloged upstream pick', 'cataloged upstream picks')}${colors.reset}`);
    log(`${colors.dim}Small enough to scan. Opinionated enough to trust.${colors.reset}\n`);

    orderedAreas.forEach(areaId => {
      const meta = getWorkAreaMeta(data, areaId);
      const title = meta ? meta.title : formatWorkAreaTitle(areaId);
      const shelfSkills = sortSkillsByCuration(data, byWorkArea[areaId]);
      const houseCount = shelfSkills.filter((skill) => getTier(skill) === 'house').length;
      const upstreamCount = shelfSkills.length - houseCount;
      log(`${colors.blue}${colors.bold}${title.toUpperCase()}${colors.reset} ${colors.dim}${formatCount(shelfSkills.length, 'pick')} · ${formatCount(houseCount, 'house copy', 'house copies')} · ${formatCount(upstreamCount, 'upstream pick', 'upstream picks')}${colors.reset}`);
      if (meta && meta.description) {
        log(`${colors.dim}${meta.description}${colors.reset}`);
      }
      shelfSkills.forEach(skill => {
        const featured = skill.featured ? ` ${colors.yellow}*${colors.reset}` : '';
        const verified = skill.verified ? ` ${colors.green}✓${colors.reset}` : '';
        const tierBadge = ` ${getTierBadge(skill)}`;
        const tagStr = skill.tags && skill.tags.length > 0
          ? ` ${colors.dim}[${skill.tags.slice(0, 3).join(', ')}]${colors.reset}`
          : '';
        const collectionBadge = getCollectionBadgeText(data, skill)
          ? ` ${colors.dim}{${getCollectionBadgeText(data, skill)}}${colors.reset}`
          : '';

        log(`  ${colors.green}${skill.name}${colors.reset}${featured}${verified}${tierBadge}${tagStr}${collectionBadge}`);
        log(`    ${colors.dim}${getSkillMeta(skill, false)}${colors.reset}`);

        const shelfNote = skill.whyHere || skill.description;
        const desc = shelfNote.length > 88
          ? shelfNote.slice(0, 88) + '...'
          : shelfNote;
        log(`    ${colors.dim}Why:${colors.reset} ${desc}`);
      });
      log('');
    });
  }

  log(`${colors.dim}* = featured  ✓ = verified${colors.reset}`);
  log(`\nInstall: ${colors.cyan}npx ai-agent-skills install <skill-name>${colors.reset}`);
  log(`Work areas: ${colors.cyan}npx ai-agent-skills list --work-area frontend${colors.reset}`);
  log(`Filter:  ${colors.cyan}npx ai-agent-skills list --category development${colors.reset}`);
  log(`Collections: ${colors.cyan}npx ai-agent-skills collections${colors.reset}`);
}

function searchSkills(query, category = null, collectionId = null, workArea = null) {
  const data = loadSkillsJson();
  let skills = data.skills || [];
  const q = query.toLowerCase();

  // Filter by category first
  if (category) {
    skills = skills.filter(s => s.category === category.toLowerCase());
  }

  if (workArea) {
    skills = skills.filter(s => (s.workArea || '').toLowerCase() === workArea.toLowerCase());
  }

  const collectionResult = filterSkillsByCollection(data, skills, collectionId);
  if (collectionId && !collectionResult.collection) {
    warn(collectionResult.message);
    if (collectionResult.unknown) {
      printCollectionSuggestions(data);
    }
    return;
  }
  if (collectionResult.message) {
    info(collectionResult.message);
  }
  skills = collectionResult.skills;

  // Search in name, description, and tags
  const matches = skills.filter(s =>
    s.name.toLowerCase().includes(q) ||
    s.description.toLowerCase().includes(q) ||
    (s.workArea && s.workArea.toLowerCase().includes(q)) ||
    (s.branch && s.branch.toLowerCase().includes(q)) ||
    (s.category && s.category.toLowerCase().includes(q)) ||
    (s.tags && s.tags.some(t => t.toLowerCase().includes(q)))
  );

  const rankedMatches = sortSkillsForSearch(data, matches, query);

  if (rankedMatches.length === 0) {
    warn(`No skills found matching "${query}"`);

    // Suggest similar
    const allSkills = data.skills || [];
    const similar = allSkills
      .map(s => ({ name: s.name, dist: levenshteinDistance(s.name, query) }))
      .filter(s => s.dist <= 4)
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 3);

    if (similar.length > 0) {
      log(`\n${colors.dim}Did you mean: ${similar.map(s => s.name).join(', ')}?${colors.reset}`);
    }
    return;
  }

  const scope = collectionResult.collection
    ? ` in ${collectionResult.collection.title}`
    : '';

  log(`\n${colors.bold}Search Results${colors.reset} (${rankedMatches.length} matches${scope})\n`);

  rankedMatches.forEach(skill => {
    const tagStr = skill.tags && skill.tags.length > 0
      ? ` ${colors.magenta}[${skill.tags.slice(0, 3).join(', ')}]${colors.reset}`
      : '';
    const collectionBadge = getCollectionBadgeText(data, skill)
      ? ` ${colors.dim}{${getCollectionBadgeText(data, skill)}}${colors.reset}`
      : '';

    const label = getSkillWorkArea(skill) && getSkillBranch(skill)
      ? `${formatWorkAreaTitle(getSkillWorkArea(skill))} / ${getSkillBranch(skill)}`
      : skill.category;
    log(`${colors.green}${skill.name}${colors.reset} ${colors.dim}[${label}]${colors.reset}${tagStr}${collectionBadge}`);
    log(`  ${colors.dim}${getOrigin(skill)} · ${getTrust(skill)} · ${skill.source}${colors.reset}`);

    const desc = skill.description.length > 75
      ? skill.description.slice(0, 75) + '...'
      : skill.description;
    log(`  ${desc}`);
    log('');
  });
}

function showCollections() {
  const data = loadSkillsJson();
  const collections = getCollections(data);

  if (collections.length === 0) {
    warn('No curated collections found in skills.json');
    return;
  }

  log(`\n${colors.bold}Curated Collections${colors.reset} (${collections.length} total)\n`);
  log(`${colors.dim}These are cross-shelf reading lists layered on top of the main work-area shelves.${colors.reset}\n`);

  collections.forEach(collection => {
    const startHere = getCollectionStartHere(collection);
    const sample = collection.skills.slice(0, 4).join(', ');
    const more = collection.skills.length > 4 ? ', ...' : '';

    log(`${colors.blue}${colors.bold}${collection.title}${colors.reset} ${colors.dim}[${collection.id}]${colors.reset}`);
    log(`  ${colors.dim}${collection.description}${colors.reset}`);
    log(`  ${colors.dim}Start here:${colors.reset} ${startHere.join(', ')}`);
    log(`  ${colors.green}${collection.skills.length} skills${colors.reset} · ${sample}${more}`);
    log(`  ${colors.dim}npx ai-agent-skills list --collection ${collection.id}${colors.reset}\n`);
  });
}

function getBundledSkillFilePath(skillName) {
  try {
    validateSkillName(skillName);
  } catch (e) {
    return null;
  }

  const skillPath = path.join(SKILLS_DIR, skillName, 'SKILL.md');
  if (!fs.existsSync(skillPath)) {
    return null;
  }

  return skillPath;
}

function showPreview(skillName) {
  const skillPath = getBundledSkillFilePath(skillName);

  if (!skillPath) {
    // Check if it's a non-vendored cataloged skill
    try {
      const data = loadSkillsJson();
      const cataloged = data.skills.find(s => s.name === skillName && s.tier === 'upstream');
      if (cataloged) {
        log(`\n${colors.bold}Preview:${colors.reset} ${skillName}\n`);
        log(cataloged.description);
        if (cataloged.whyHere) {
          log(`\n${colors.dim}${cataloged.whyHere}${colors.reset}`);
        }
        const src = cataloged.installSource || cataloged.source;
        log(`\n${colors.dim}Cataloged upstream skill. Install pulls live from: ${src}${colors.reset}`);
        return;
      }
    } catch {}
    error(`Skill "${skillName}" not found.`);
    return;
  }

  log(`\n${colors.bold}Preview:${colors.reset} ${skillName}\n`);
  log(fs.readFileSync(skillPath, 'utf8'));
}

function isInteractiveTerminal() {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

async function launchBrowser({agent = null, scope = 'global'} = {}) {
  const tuiUrl = pathToFileURL(path.join(__dirname, 'tui', 'index.mjs')).href;
  const tuiModule = await import(tuiUrl);
  return tuiModule.launchTui({ agent, scope });
}

function runExternalInstallAction(action) {
  const { spawnSync } = require('child_process');

  if (!action || action.type !== 'skills-install') {
    return false;
  }

  const result = spawnSync(action.binary, action.args, {
    stdio: 'inherit'
  });

  if (result.status !== 0) {
    error('skills.sh install failed.');
    if (action.command) {
      log(`Retry manually:\n  ${action.command}`);
    }
    process.exit(result.status || 1);
  }

  return true;
}

// Simple Levenshtein distance for "did you mean" suggestions
function levenshteinDistance(a, b) {
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const matrix = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

// ============ EXTERNAL INSTALL (GitHub/Local) ============

function sanitizeSubpath(subpath) { return sanitizeSubpathLib(subpath); }
function parseSource(source) { return parseSourceLib(source); }

function isGitHubUrl(source) {
  // Must have owner/repo format, not start with path indicators
  return source.includes('/') &&
         !source.startsWith('./') &&
         !source.startsWith('../') &&
         !source.startsWith('/') &&
         !source.startsWith('~') &&
         !isWindowsPath(source);
}

function isGitUrl(source) { return isGitUrlLib(source); }
function parseGitUrl(source) { return parseGitUrlLib(source); }
function getRepoNameFromUrl(url) { return getRepoNameFromUrlLib(url); }
function validateGitUrl(url) { return validateGitUrlLib(url); }
function sanitizeGitUrl(url) { return sanitizeGitUrlLib(url); }
function isWindowsPath(source) { return isWindowsPathLib(source); }
function isLocalPath(source) { return isLocalPathLib(source); }
function expandPath(p) { return expandPathLib(p); }

function getArgValue(argv, flag) {
  const i = argv.indexOf(flag);
  return i !== -1 && i + 1 < argv.length ? argv[i + 1] : null;
}

function createPromptInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function promptLine(rl, label, defaultValue = '') {
  const suffix = defaultValue ? ` [${defaultValue}]` : '';
  return new Promise((resolve) => {
    rl.question(`${label}${suffix}: `, (answer) => {
      const value = String(answer || '').trim();
      resolve(value || String(defaultValue || '').trim());
    });
  });
}

async function promptForEditorialFields(initialFields, options = {}) {
  const data = loadSkillsJson();
  const fields = { ...initialFields };
  const placementErrors = ensureRequiredPlacement(fields, data);

  if (placementErrors.length === 0) {
    return fields;
  }

  if (!isInteractiveTerminal()) {
    throw new Error(`${options.mode || 'catalog'} requires --area, --branch, and --why when not running in a TTY`);
  }

  const rl = createPromptInterface();
  const workAreas = getWorkAreas(data);
  const shelfGuide = workAreas.map((area) => `${area.id} (${area.title})`).join(', ');

  log(`\n${colors.bold}${options.title || 'Complete the catalog entry'}${colors.reset}`);
  if (options.skillName) {
    log(`${colors.dim}${options.skillName}${options.sourceLabel ? ` from ${options.sourceLabel}` : ''}${colors.reset}`);
  }
  if (shelfGuide) {
    log(`${colors.dim}Shelves: ${shelfGuide}${colors.reset}\n`);
  }

  try {
    fields.workArea = await promptLine(rl, 'Shelf id', fields.workArea || '');
    fields.branch = await promptLine(rl, 'Branch', fields.branch || '');
    fields.whyHere = await promptLine(rl, 'Why it belongs', fields.whyHere || '');

    if (options.promptOptional) {
      fields.category = await promptLine(rl, 'Category', fields.category || 'development');
      fields.tags = await promptLine(
        rl,
        'Tags (comma-separated)',
        Array.isArray(fields.tags) ? fields.tags.join(', ') : fields.tags || ''
      );
      fields.labels = await promptLine(
        rl,
        'Labels (comma-separated)',
        Array.isArray(fields.labels) ? fields.labels.join(', ') : fields.labels || ''
      );
      fields.notes = await promptLine(rl, 'Notes', fields.notes || '');
      fields.trust = await promptLine(rl, 'Trust', fields.trust || 'listed');
      if (!fields.description && options.allowDescriptionPrompt) {
        fields.description = await promptLine(rl, 'Description override (optional)', '');
      }
    }
  } finally {
    rl.close();
  }

  const errors = ensureRequiredPlacement(fields, data);
  if (errors.length > 0) {
    throw new Error(errors.join('; '));
  }

  return fields;
}

function formatReviewQueue(queue) {
  if (!Array.isArray(queue) || queue.length === 0) {
    return `${colors.green}Review queue is empty.${colors.reset}`;
  }

  const grouped = new Map();
  for (const entry of queue) {
    for (const reason of entry.reasons) {
      if (!grouped.has(reason)) grouped.set(reason, []);
      grouped.get(reason).push(entry.skill);
    }
  }

  const blocks = [];
  [...grouped.entries()]
    .sort((left, right) => right[1].length - left[1].length || left[0].localeCompare(right[0]))
    .forEach(([reason, skills]) => {
      blocks.push(`${colors.bold}${reason}${colors.reset}`);
      skills
        .sort((left, right) => left.name.localeCompare(right.name))
        .forEach((skill) => {
          const meta = [formatWorkAreaTitle(skill.workArea), skill.branch].filter(Boolean).join(' / ');
          blocks.push(`  ${colors.green}${skill.name}${colors.reset}${meta ? ` ${colors.dim}(${meta})${colors.reset}` : ''}`);
        });
      blocks.push('');
    });

  return blocks.join('\n').trimEnd();
}

function buildCurateChanges(parsed) {
  const changes = {};

  if (parsed.workArea !== null) changes.workArea = parsed.workArea;
  if (parsed.branch !== null) changes.branch = parsed.branch;
  if (parsed.description !== null) changes.description = parsed.description;
  if (parsed.why !== null) changes.whyHere = parsed.why;
  if (parsed.notes !== null) changes.notes = parsed.notes;
  if (parsed.tags !== null) changes.tags = parsed.tags;
  if (parsed.labels !== null) changes.labels = parsed.labels;
  if (parsed.trust !== null) changes.trust = parsed.trust;
  if (parsed.featured !== null) changes.featured = parsed.featured;
  if (parsed.lastVerified !== null) changes.lastVerified = parsed.lastVerified;
  if (parsed.clearVerified) changes.clearVerified = true;

  return changes;
}

// Validate GitHub owner/repo names (alphanumeric, hyphens, underscores, dots)
function validateGitHubName(name, type = 'name') {
  if (!name || typeof name !== 'string') {
    throw new Error(`Invalid GitHub ${type}`);
  }
  // GitHub allows: alphanumeric, hyphens, underscores, dots (no leading/trailing dots for repos)
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name)) {
    throw new Error(`Invalid GitHub ${type}: "${name}" contains invalid characters`);
  }
  if (name.length > 100) {
    throw new Error(`GitHub ${type} too long: ${name.length} > 100 characters`);
  }
  return true;
}

function findNearestExistingParent(targetPath) {
  let current = targetPath;
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
  return current;
}

function getPathAccessStatus(targetPath) {
  const existing = fs.existsSync(targetPath);
  const inspectPath = existing ? targetPath : findNearestExistingParent(targetPath);

  if (!inspectPath) {
    return {
      pass: false,
      detail: `Cannot resolve writable parent for ${targetPath}`,
    };
  }

  try {
    fs.accessSync(inspectPath, fs.constants.W_OK);
    return {
      pass: true,
      detail: existing
        ? `Writable at ${targetPath}`
        : `Missing but creatable under ${inspectPath}`,
    };
  } catch {
    return {
      pass: false,
      detail: existing
        ? `Not writable: ${targetPath}`
        : `Parent is not writable: ${inspectPath}`,
    };
  }
}

function getBrokenInstalledEntries(agent = 'claude') {
  const destDir = AGENT_PATHS[agent] || AGENT_PATHS.claude;
  if (!fs.existsSync(destDir)) return [];

  try {
    return fs.readdirSync(destDir).filter((name) => {
      const skillPath = path.join(destDir, name);
      try {
        return fs.statSync(skillPath).isDirectory() &&
          !fs.existsSync(path.join(skillPath, 'SKILL.md'));
      } catch {
        return false;
      }
    });
  } catch {
    return [];
  }
}

function validateSkillDirectory(skillTarget) {
  const rawTarget = skillTarget ? expandPath(skillTarget) : process.cwd();
  const skillDir = fs.existsSync(rawTarget) && fs.statSync(rawTarget).isFile()
    ? path.dirname(rawTarget)
    : rawTarget;
  const skillMarkdownPath = path.join(skillDir, 'SKILL.md');

  if (!fs.existsSync(skillMarkdownPath)) {
    return {
      ok: false,
      skillDir,
      errors: ['No SKILL.md found'],
      warnings: [],
      summary: null,
    };
  }

  const issues = [];
  const parsed = readSkillDirectory(skillDir);
  if (!parsed) {
    return {
      ok: false,
      skillDir,
      errors: ['Could not parse SKILL.md frontmatter'],
      warnings: [],
      summary: null,
    };
  }

  const { frontmatter, content, skillMdPath } = parsed;
  const name = String(frontmatter.name || '').trim();
  const description = String(frontmatter.description || '').trim();

  if (!name) {
    issues.push({ level: 'error', message: 'Missing required frontmatter field: name' });
  } else {
    try {
      validateSkillName(name);
    } catch (e) {
      issues.push({ level: 'error', message: e.message });
    }
  }

  if (!description) {
    issues.push({ level: 'error', message: 'Missing required frontmatter field: description' });
  } else {
    if (description.length < 10) {
      issues.push({ level: 'error', message: 'Description is too short (minimum 10 characters)' });
    }
    if (description.length > 500) {
      issues.push({ level: 'warn', message: 'Description is over 500 characters and may route poorly' });
    }
  }

  if (content.length < 50) {
    issues.push({ level: 'warn', message: 'Very little content in SKILL.md' });
  }

  if (!content.includes('#')) {
    issues.push({ level: 'warn', message: 'No headings found; the skill could use more structure' });
  }

  const skillMdSize = fs.statSync(skillMdPath).size;
  if (skillMdSize > MAX_SKILL_SIZE) {
    issues.push({ level: 'error', message: `SKILL.md exceeds ${(MAX_SKILL_SIZE / 1024 / 1024).toFixed(0)}MB` });
  }

  const totalSize = getDirectorySize(skillDir);
  if (totalSize > MAX_SKILL_SIZE) {
    issues.push({ level: 'error', message: `Skill directory is ${(totalSize / 1024 / 1024).toFixed(1)}MB (max ${(MAX_SKILL_SIZE / 1024 / 1024).toFixed(0)}MB)` });
  }

  const dirName = path.basename(skillDir);
  if (name && dirName !== name) {
    issues.push({ level: 'warn', message: `Directory name "${dirName}" does not match skill name "${name}"` });
  }

  return {
    ok: issues.every((issue) => issue.level !== 'error'),
    skillDir,
    errors: issues.filter((issue) => issue.level === 'error').map((issue) => issue.message),
    warnings: issues.filter((issue) => issue.level === 'warn').map((issue) => issue.message),
    summary: {
      name,
      description,
      totalSize,
      skillMdSize,
    },
  };
}

// v3: discover skills in a directory (cloned repo or local path)
function discoverSkills(rootDir, repoRoot = rootDir) {
  return discoverSkillsLib(rootDir, { repoRoot });
}

function buildRepoId(parsed) {
  if (parsed.type === 'github' && parsed.owner && parsed.repo) {
    return `${parsed.owner}/${parsed.repo}`;
  }
  return null;
}

function buildInstallSourceRef(parsed, relativeDir = null) {
  const cleanRelativeDir = relativeDir && relativeDir !== '.' ? relativeDir.replace(/\\/g, '/') : null;

  if (parsed.type === 'github') {
    const repoId = buildRepoId(parsed);
    return cleanRelativeDir ? `${repoId}/${cleanRelativeDir}` : repoId;
  }

  if (parsed.type === 'git') {
    const baseUrl = sanitizeGitUrl(parsed.url);
    const withPath = cleanRelativeDir ? `${baseUrl}/${cleanRelativeDir}` : baseUrl;
    return parsed.ref ? `${withPath}#${parsed.ref}` : withPath;
  }

  if (parsed.type === 'local') {
    const basePath = expandPath(parsed.url);
    return cleanRelativeDir ? path.join(basePath, cleanRelativeDir) : basePath;
  }

  return null;
}

function buildSourceUrl(parsed, relativeDir = null) {
  if (!parsed.url) return '';
  const cleanRelativeDir = relativeDir && relativeDir !== '.' ? relativeDir.replace(/\\/g, '/') : '';

  if (parsed.type === 'github') {
    const ref = parsed.ref || 'main';
    return cleanRelativeDir
      ? `${parsed.url}/tree/${ref}/${cleanRelativeDir}`
      : `${parsed.url}/tree/${ref}`;
  }

  return sanitizeGitUrl(parsed.url);
}

function maybeRenameRootSkill(discovered, parsed, rootDir, repoRoot) {
  if (!Array.isArray(discovered) || discovered.length !== 1) return discovered;
  if (!discovered[0].isRoot) return discovered;
  if (parsed.type === 'local') return discovered;
  if (parsed.subpath) return discovered;
  if (path.resolve(rootDir) !== path.resolve(repoRoot)) return discovered;

  const repoName = parsed.repo || getRepoNameFromUrl(parsed.url);
  if (!repoName) return discovered;

  const cleanName = repoName
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  if (cleanName) {
    discovered[0].name = cleanName;
  }

  return discovered;
}

function findDiscoveredSkill(discovered, filter) {
  const needle = String(filter || '').trim().toLowerCase();
  if (!needle) return null;

  return discovered.find((skill) => skill.name.toLowerCase() === needle)
    || discovered.find((skill) => skill.dirName.toLowerCase() === needle)
    || discovered.find((skill) => skill.relativeDir.toLowerCase() === needle)
    || null;
}

function uniqueSkillFilters(filters = []) {
  const seen = new Set();
  const output = [];
  for (const filter of filters) {
    const value = String(filter || '').trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(value);
  }
  return output;
}

// ============ CATALOG COMMAND ============

async function catalogSkills(source, options = {}) {
  const parsed = parseSource(source);

  if (!parsed || parsed.type !== 'github') {
    error('Catalog only accepts upstream GitHub repos. Use: npx ai-agent-skills catalog owner/repo --skill <name>');
    process.exitCode = 1;
    return false;
  }

  if (!options.list && !options.skillFilter) {
    error('Cataloging requires --skill <name>. Use --list to browse available upstream skills first.');
    process.exitCode = 1;
    return false;
  }

  let prepared = null;

  try {
    info(`Discovering skills in ${source}...`);

    prepared = prepareSourceLib(source, {
      parsed,
      sparseSubpath: parsed.subpath || null,
    });

    const discovered = maybeRenameRootSkill(
      discoverSkills(prepared.rootDir, prepared.repoRoot),
      parsed,
      prepared.rootDir,
      prepared.repoRoot,
    );

    if (discovered.length === 0) {
      warn('No skills found in source.');
      return false;
    }

    const data = loadSkillsJson();
    const existingNames = new Set(data.skills.map(s => s.name));

    if (options.list) {
      log(`\n${colors.bold}Available skills in ${source}${colors.reset} (${discovered.length} found)\n`);
      for (const s of discovered) {
        const badge = existingNames.has(s.name) ? ` ${colors.dim}(already in catalog)${colors.reset}` : '';
        log(`  ${colors.green}${s.name}${colors.reset}${badge}`);
        if (s.description) log(`    ${colors.dim}${s.description.slice(0, 90)}${colors.reset}`);
      }
      log('');
      return true;
    }

    const target = findDiscoveredSkill(discovered, options.skillFilter);
    if (!target) {
      error(`Skill "${options.skillFilter}" not found. Available:`);
      for (const s of discovered) log(`  ${colors.green}${s.name}${colors.reset}`);
      process.exitCode = 1;
      return false;
    }

    if (existingNames.has(target.name)) {
      warn(`"${target.name}" is already in the catalog.`);
      process.exitCode = 1;
      return false;
    }

    validateSkillName(target.name);

    const fields = await promptForEditorialFields({
      description: options.description || target.description || '',
      category: options.category || 'development',
      workArea: options.area || '',
      branch: options.branch || '',
      whyHere: options.whyHere || '',
      tags: options.tags || '',
      labels: options.labels || '',
      notes: options.notes || '',
      trust: options.trust || 'listed',
    }, {
      mode: 'catalog',
      title: 'Add upstream skill to the library',
      promptOptional: true,
      allowDescriptionPrompt: !(options.description || target.description),
      skillName: target.name,
      sourceLabel: buildRepoId(parsed) || source,
    });

    const nextData = addUpstreamSkillFromDiscovery({
      source,
      parsed,
      discoveredSkill: target,
      fields,
    });

    success(`Cataloged ${target.name}`);
    log(`${colors.dim}${formatWorkAreaTitle(fields.workArea)} / ${fields.branch} · ${buildRepoId(parsed)}${colors.reset}`);
    log(`${colors.dim}Library now holds ${nextData.skills.length} skills.${colors.reset}`);
    return true;
  } catch (err) {
    error(err && err.message ? err.message : String(err));
    process.exitCode = 1;
    return false;
  } finally {
    if (prepared) {
      prepared.cleanup();
    }
  }
}

async function vendorSkill(source, options = {}) {
  const parsed = parseSource(source);
  if (!parsed || parsed.type === 'catalog') {
    error('Vendor requires an upstream repo, git URL, or local path.');
    process.exitCode = 1;
    return false;
  }

  let prepared = null;
  let tempDestDir = null;

  try {
    if (!options.list && !options.skillFilter) {
      error('Vendor requires --skill <name> (or use --list to browse the source first).');
      process.exitCode = 1;
      return false;
    }

    if (parsed.type !== 'local') {
      info(`Preparing ${source}...`);
    }

    prepared = prepareSourceLib(source, {
      parsed: options.ref ? { ...parsed, ref: options.ref } : parsed,
      sparseSubpath: parsed.type === 'github' ? parsed.subpath || null : null,
    });

    const discovered = discoverSkills(prepared.rootDir, prepared.repoRoot);
    if (discovered.length === 0) {
      warn('No skills found in source.');
      return false;
    }

    if (options.list) {
      log(`\n${colors.bold}Available skills in ${source}${colors.reset} (${discovered.length} found)\n`);
      for (const skill of discovered) {
        log(`  ${colors.green}${skill.name}${colors.reset}`);
        if (skill.description) log(`    ${colors.dim}${skill.description}${colors.reset}`);
      }
      log('');
      return true;
    }

    const target = findDiscoveredSkill(discovered, options.skillFilter);
    if (!target) {
      error(`Skill "${options.skillFilter}" not found. Available:`);
      for (const skill of discovered) log(`  ${colors.green}${skill.name}${colors.reset}`);
      process.exitCode = 1;
      return false;
    }

    validateSkillName(target.name);

    const sourceLabel = parsed.type === 'github'
      ? buildRepoId(parsed)
      : parsed.type === 'git'
        ? sanitizeGitUrl(parsed.url)
        : expandPath(parsed.url);
    const relPath = target.relativeDir && target.relativeDir !== '.' ? target.relativeDir : null;
    const sourceUrl = parsed.type === 'github' ? buildSourceUrl(parsed, relPath) : '';

    const rawEntry = await promptForEditorialFields({
      name: target.name,
      description: options.description || target.description || '',
      category: options.category || 'development',
      workArea: options.area || '',
      branch: options.branch || '',
      author: target.frontmatter.author || parsed.owner || 'unknown',
      source: sourceLabel,
      license: target.frontmatter.license || 'MIT',
      path: `skills/${target.name}`,
      tier: 'house',
      distribution: 'bundled',
      vendored: true,
      installSource: '',
      tags: options.tags || '',
      featured: false,
      verified: String(options.trust || '').trim() === 'verified',
      origin: 'curated',
      trust: options.trust || 'listed',
      syncMode: 'snapshot',
      sourceUrl,
      whyHere: options.whyHere || '',
      addedDate: currentIsoDay(),
      lastVerified: options.lastVerified || '',
      notes: options.notes || '',
      labels: options.labels || '',
      lastCurated: currentCatalogTimestamp(),
    }, {
      mode: 'vendor',
      title: 'Create house copy',
      promptOptional: true,
      allowDescriptionPrompt: !(options.description || target.description),
      skillName: target.name,
      sourceLabel,
    });

    const catalog = loadCatalogData();
    if (findSkillByName(catalog, rawEntry.name)) {
      throw new Error(`Skill "${rawEntry.name}" already exists in the catalog`);
    }

    const entry = buildHouseCatalogEntry(rawEntry, catalog);
    const destDir = path.join(SKILLS_DIR, entry.name);
    tempDestDir = path.join(SKILLS_DIR, `.${entry.name}.tmp-${Date.now()}`);

    if (fs.existsSync(destDir)) {
      throw new Error(`Folder skills/${entry.name}/ already exists`);
    }

    if (options.dryRun) {
      log('\nDry run. Would do:\n');
      log(`  Copy: ${target.dir}/ -> skills/${entry.name}/`);
      log('  Add to skills.json:');
      log(JSON.stringify(entry, null, 2).split('\n').map((line) => `    ${line}`).join('\n'));
      log(`\n  New total: ${catalog.skills.length + 1}`);
      return true;
    }

    copySkillFiles(target.dir, tempDestDir);
    fs.renameSync(tempDestDir, destDir);

    try {
      addHouseSkillEntry(entry);
    } catch (err) {
      fs.rmSync(destDir, { recursive: true, force: true });
      throw err;
    }

    success(`Vendored ${entry.name} as a house copy`);
    log(`${colors.dim}${formatWorkAreaTitle(entry.workArea)} / ${entry.branch}${colors.reset}`);
    return true;
  } catch (err) {
    if (tempDestDir) {
      fs.rmSync(tempDestDir, { recursive: true, force: true });
    }
    error(err && err.message ? err.message : String(err));
    process.exitCode = 1;
    return false;
  } finally {
    if (prepared) {
      prepared.cleanup();
    }
  }
}

function runCurateCommand(skillName, parsed) {
  if (!skillName) {
    error('Please specify a skill name or "review".');
    log('Usage: npx ai-agent-skills curate <skill-name> [flags]');
    log('       npx ai-agent-skills curate review');
    process.exitCode = 1;
    return false;
  }

  if (skillName === 'review') {
    const queue = buildReviewQueue(loadCatalogData());
    log(`\n${colors.bold}Needs Review${colors.reset}\n`);
    log(formatReviewQueue(queue));
    log('');
    return true;
  }

  if (parsed.remove) {
    if (!parsed.yes) {
      error('Removing a skill from the library requires --yes.');
      process.exitCode = 1;
      return false;
    }
    const data = loadCatalogData();
    const target = findSkillByName(data, skillName);
    if (!target) {
      error(`Skill "${skillName}" not found in catalog.`);
      process.exitCode = 1;
      return false;
    }
    removeSkillFromCatalog(skillName);
    if (target.tier === 'house') {
      const bundledDir = path.join(SKILLS_DIR, skillName);
      if (fs.existsSync(bundledDir)) {
        fs.rmSync(bundledDir, { recursive: true, force: true });
      }
    }
    success(`Removed ${skillName} from the library`);
    return true;
  }

  const changes = buildCurateChanges(parsed);
  if (Object.keys(changes).length === 0) {
    error('No curator edits specified.');
    log('Use flags like --area, --branch, --why, --notes, --tags, --labels, --trust, --feature, or --remove --yes.');
    process.exitCode = 1;
    return false;
  }

  curateSkill(skillName, changes);
  success(`Updated ${skillName}`);
  return true;
}

// v3: classify git clone errors for actionable messages
function classifyGitError(message) {
  return classifyGitErrorLib(message);
}

// v3: copy skill files with appropriate skip list
function copySkillFiles(srcDir, destDir) {
  const skipList = ['.git', 'node_modules', '__pycache__', '__pypackages__', 'metadata.json'];

  if (fs.existsSync(destDir)) {
    fs.rmSync(destDir, { recursive: true });
  }
  fs.mkdirSync(destDir, { recursive: true });

  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    if (skipList.includes(entry.name)) continue;
    // Skip dotfiles (files/dirs starting with .)
    if (entry.name.startsWith('.')) continue;

    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isSymbolicLink()) continue;

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// v3: main source-repo install flow
async function installFromSource(source, parsed, installPaths, skillFilters, listMode, yes, dryRun) {
  let prepared = null;

  try {
    if (parsed.type !== 'local') {
      info(`Cloning ${source}...`);
    }

    prepared = prepareSourceLib(source, {
      parsed,
      sparseSubpath: parsed.subpath || null,
    });

    const discovered = maybeRenameRootSkill(
      discoverSkills(prepared.rootDir, prepared.repoRoot),
      parsed,
      prepared.rootDir,
      prepared.repoRoot,
    );

    if (discovered.length === 0) {
      warn('No skills found in source');
      return false;
    }

    // --list: show available skills and exit
    if (listMode) {
      log(`\n${colors.bold}Available Skills${colors.reset} (${discovered.length} found)\n`);
      for (const skill of discovered) {
        log(`  ${colors.green}${skill.name}${colors.reset}`);
        if (skill.description) {
          log(`    ${colors.dim}${skill.description}${colors.reset}`);
        }
      }
      log(`\n${colors.dim}Install: npx ai-agent-skills install ${source} --skill <name>${colors.reset}`);
      return true;
    }

    // Resolve skill filter (from --skill flags or @skill-name syntax)
    let filters = [...skillFilters];
    if (parsed.skillFilter) {
      filters.push(parsed.skillFilter);
    }
    filters = uniqueSkillFilters(filters);

    // Select skills
    let selected;
    if (filters.includes('*')) {
      selected = discovered;
    } else if (filters.length > 0) {
      selected = [];
      for (const filter of filters) {
        const match = findDiscoveredSkill(discovered, filter);
        if (match) {
          selected.push(match);
        } else {
          error(`Skill "${filter}" not found in source`);
          log(`\n${colors.dim}Available skills:${colors.reset}`);
          for (const s of discovered) {
            log(`  ${colors.green}${s.name}${colors.reset}`);
          }
          return false;
        }
      }
    } else if (discovered.length === 1) {
      selected = discovered;
      info(`Found: ${discovered[0].name}${discovered[0].description ? ' - ' + discovered[0].description : ''}`);
    } else if (yes || !process.stdin.isTTY) {
      selected = discovered;
      info(`Installing all ${discovered.length} skills (non-interactive mode)`);
    } else {
      // Interactive: for now, install all and show what was installed
      selected = discovered;
      info(`Found ${discovered.length} skills, installing all`);
    }

    if (selected.length === 0) {
      warn('No skills selected for install');
      return false;
    }

    if (dryRun) {
      log(`\n${colors.bold}Dry Run${colors.reset} (no changes made)\n`);
      info(`Would install ${selected.length} skill(s) to ${installPaths.length} target(s)`);
      info(`Source: ${parsed.type === 'local' ? 'local path' : parsed.type === 'github' ? `live upstream from ${buildInstallSourceRef(parsed, parsed.subpath || null)}` : `git source ${sanitizeGitUrl(parsed.url)}`}`);
      info(`Targets: ${installPaths.join(', ')}`);
      if (prepared.usedSparse) {
        info('Clone mode: sparse checkout');
      }
      for (const skill of selected) {
        const sourceRef = buildInstallSourceRef(parsed, skill.relativeDir === '.' ? null : skill.relativeDir);
        log(`  ${colors.green}${skill.name}${colors.reset}${sourceRef ? ` ${colors.dim}(${sourceRef})${colors.reset}` : ''}`);
      }
      return true;
    }

    // Install each selected skill to each target path
    let successes = 0;
    let failures = 0;

    for (const skill of selected) {
      for (const targetBase of installPaths) {
        try {
          const destPath = path.join(targetBase, skill.name);

          // Validate path safety
          if (!isSafePath(targetBase, destPath)) {
            error(`Unsafe install path rejected: ${destPath}`);
            failures++;
            continue;
          }

          if (!fs.existsSync(targetBase)) {
            fs.mkdirSync(targetBase, { recursive: true });
          }

          copyDir(skill.dir, destPath);

          // Write .skill-meta.json
          writeSkillMeta(destPath, {
            sourceType: parsed.type,
            source: parsed.type,
            url: parsed.type === 'local' ? null : sanitizeGitUrl(parsed.url),
            repo: buildRepoId(parsed),
            ref: parsed.ref || null,
            subpath: skill.relativeDir && skill.relativeDir !== '.' ? skill.relativeDir : null,
            installSource: buildInstallSourceRef(parsed, skill.relativeDir === '.' ? null : skill.relativeDir),
            skillName: skill.name,
            path: parsed.type === 'local' ? skill.dir : undefined,
            scope: resolveScopeLabel(targetBase),
          });

          log(`  ${colors.green}\u2713${colors.reset} ${skill.name}`);
          successes++;
        } catch (installErr) {
          log(`  ${colors.red}\u2717${colors.reset} ${skill.name}: ${installErr.message}`);
          failures++;
        }
      }
    }

    if (successes > 0) {
      success(`\nInstalled ${successes} skill(s)`);
    }
    if (failures > 0) {
      warn(`${failures} failed`);
    }

    return successes > 0;
  } finally {
    if (prepared) {
      prepared.cleanup();
    }
  }
}

async function installFromGitHub(source, agent = 'claude', dryRun = false) {
  const parsed = parseSource(source);
  const installPaths = [AGENT_PATHS[agent] || SCOPES.global];
  return installFromSource(source, parsed, installPaths, [], false, true, dryRun);
}

async function installFromGitUrl(source, agent = 'claude', dryRun = false) {
  const parsed = parseSource(source);
  const installPaths = [AGENT_PATHS[agent] || SCOPES.global];
  return installFromSource(source, parsed, installPaths, [], false, true, dryRun);
}

function installFromLocalPath(source, agent = 'claude', dryRun = false) {
  const parsed = parseSource(source);
  const installPaths = [AGENT_PATHS[agent] || SCOPES.global];
  return installFromSource(source, parsed, installPaths, [], false, true, dryRun);
}

// ============ INFO AND HELP ============

function showHelp() {
  log(`
${colors.bold}AI Agent Skills${colors.reset} \u2014 My curated agent skills library

${colors.bold}Usage:${colors.reset}
  npx ai-agent-skills [command] [options]

${colors.bold}Commands:${colors.reset}
  ${colors.green}browse${colors.reset}                Browse the library in the terminal
  ${colors.green}install <source>${colors.reset}      Install skills (from library, GitHub, git URL, or local path)
  ${colors.green}list${colors.reset}                  List catalog skills
  ${colors.green}search <query>${colors.reset}        Search the catalog
  ${colors.green}info <name>${colors.reset}           Show skill details and provenance
  ${colors.green}preview <name>${colors.reset}        Preview a skill's content
  ${colors.green}collections${colors.reset}           Browse curated collections
  ${colors.green}curate <name>${colors.reset}         Edit shelf placement and catalog metadata
  ${colors.green}uninstall <name>${colors.reset}      Remove an installed skill
  ${colors.green}update [name]${colors.reset}         Update installed skills
  ${colors.green}check${colors.reset}                 Check for available updates
  ${colors.green}init [name]${colors.reset}           Create a new SKILL.md template
  ${colors.green}config${colors.reset}                Manage CLI settings
  ${colors.green}catalog <repo>${colors.reset}       Add upstream skills to the catalog (no local copy)
  ${colors.green}vendor <source>${colors.reset}       Create a house copy from an explicit source
  ${colors.green}doctor${colors.reset}                Diagnose install issues
  ${colors.green}validate [path]${colors.reset}       Validate a skill directory

${colors.bold}Scopes:${colors.reset}
  ${colors.cyan}(default)${colors.reset}             ~/.claude/skills/        Global, available everywhere
  ${colors.cyan}-p, --project${colors.reset}         .agents/skills/          Project, committed with your repo

${colors.bold}Source formats:${colors.reset}
  install pdf                                    From this library
  install anthropics/skills                      All skills from a GitHub repo
  install anthropics/skills@frontend-design      One skill from a repo
  install anthropics/skills --skill pdf          Select specific skills
  install anthropics/skills --list               List skills without installing
  install ./local-path                           From a local directory

${colors.bold}Options:${colors.reset}
  ${colors.cyan}-g, --global${colors.reset}          Install to global scope (default)
  ${colors.cyan}-p, --project${colors.reset}         Install to project scope (.agents/skills/)
  ${colors.cyan}--skill <name>${colors.reset}        Select specific skills from a source
  ${colors.cyan}--list${colors.reset}                List available skills without installing
  ${colors.cyan}--yes${colors.reset}                 Skip prompts (for CI/CD)
  ${colors.cyan}--all${colors.reset}                 Install to both global and project scopes
  ${colors.cyan}--dry-run${colors.reset}             Show what would be installed
  ${colors.cyan}--agent <name>${colors.reset}        Install to a specific agent path (legacy)

${colors.bold}Categories:${colors.reset}
  development, document, creative, business, productivity

${colors.bold}Work areas:${colors.reset}
  frontend, backend, docs, testing, workflow, research, design, business, ai, devops

${colors.bold}Collections:${colors.reset}
  my-picks, build-apps, build-systems, test-and-debug, docs-and-research

${colors.bold}Examples:${colors.reset}
  npx ai-agent-skills                            Launch the terminal browser
  npx ai-agent-skills install frontend-design    Install to ~/.claude/skills/
  npx ai-agent-skills install pdf -p             Install to .agents/skills/
  npx ai-agent-skills install anthropics/skills  Install all skills from repo
  npx ai-agent-skills search testing             Search the catalog
  npx ai-agent-skills curate frontend-design --branch "UI Craft"
  npx ai-agent-skills curate review
  npx ai-agent-skills vendor ~/repo --skill my-skill --area frontend --branch React --why "I want the local copy."

${colors.bold}Legacy agents:${colors.reset}
  Still supported via --agent <name>: cursor, amp, codex, gemini, goose, opencode, letta, kilocode

${colors.bold}More info:${colors.reset}
  https://github.com/MoizIbnYousaf/Ai-Agent-Skills
`);
}

function showInfo(skillName) {
  const data = loadSkillsJson();
  const skill = data.skills.find(s => s.name === skillName);

  if (!skill) {
    error(`Skill "${skillName}" not found.`);

    // Suggest similar
    const similar = data.skills
      .filter(s => s.name.includes(skillName) || skillName.includes(s.name))
      .slice(0, 3);

    if (similar.length > 0) {
      log(`\n${colors.dim}Did you mean: ${similar.map(s => s.name).join(', ')}?${colors.reset}`);
    }
    return;
  }

  const tagStr = skill.tags && skill.tags.length > 0
    ? skill.tags.join(', ')
    : 'none';
  const collectionStr = getCollectionsForSkill(data, skill.name)
    .map(collection => `${collection.title} [${collection.id}]`)
    .join(', ') || 'none';
  const syncMode = getSyncMode(skill);
  const sourceUrl = skill.sourceUrl || `https://github.com/${skill.source}`;
  const whyHere = skill.whyHere || 'This skill still earns a place in the library.';
  const alsoLookAt = getSiblingRecommendations(data, skill, 3).map(candidate => candidate.name).join(', ') || 'none';
  const upstreamInstall = getGitHubInstallSpec(skill, 'cursor');
  const lastVerifiedLine = skill.lastVerified
    ? `${colors.bold}Last Verified:${colors.reset} ${skill.lastVerified}\n`
    : '';
  const labelsLine = Array.isArray(skill.labels) && skill.labels.length > 0
    ? `${colors.bold}Labels:${colors.reset}      ${skill.labels.join(', ')}\n`
    : '';
  const notesLine = skill.notes
    ? `${colors.bold}Notes:${colors.reset}       ${skill.notes}\n`
    : '';

  log(`
${colors.bold}${skill.name}${colors.reset}${skill.featured ? ` ${colors.yellow}(featured)${colors.reset}` : ''}${skill.verified ? ` ${colors.green}(verified)${colors.reset}` : ''}

${colors.dim}${skill.description}${colors.reset}

${colors.bold}Why Here:${colors.reset}
  ${whyHere}

${colors.bold}Provenance:${colors.reset}
  Shelf: ${skill.workArea ? formatWorkAreaTitle(skill.workArea) : 'n/a'} / ${skill.branch || 'n/a'}
  Tier: ${getTier(skill) === 'house' ? 'House copy' : 'Cataloged upstream'}
  Distribution: ${getDistribution(skill) === 'bundled' ? 'Bundled with this library' : `Live install from ${skill.installSource || skill.source}`}
  Trust: ${getTrust(skill)} · Origin: ${getOrigin(skill)}
  Sync Mode: ${syncMode}
  Collections: ${collectionStr}
  Source Repo: ${skill.source}
  Source URL: ${sourceUrl}

${colors.bold}Catalog Notes:${colors.reset}
  Category: ${skill.category}
  Tags: ${tagStr}
  Author: ${skill.author}
  License: ${skill.license}
${lastVerifiedLine}${skill.lastUpdated ? `${colors.bold}Updated:${colors.reset}     ${skill.lastUpdated}\n` : ''}${labelsLine}${notesLine}${colors.bold}Neighboring Shelf Picks:${colors.reset}
  ${alsoLookAt}

${colors.bold}Install:${colors.reset}
  npx ai-agent-skills install ${skill.name}
  npx ai-agent-skills install ${skill.name} --agent cursor
  npx ai-agent-skills install ${skill.name} --dry-run
${upstreamInstall ? `  ${upstreamInstall.command}\n` : ''}`);
}

function showConfig() {
  const config = loadConfig();

  log(`\n${colors.bold}Configuration${colors.reset}`);
  log(`${colors.dim}File: ${CONFIG_FILE}${colors.reset}\n`);

  log(`${colors.bold}defaultAgent:${colors.reset} ${config.defaultAgent || 'claude'}`);
  log(`${colors.bold}agents:${colors.reset}       ${config.agents ? config.agents.join(', ') : '(not set, uses defaultAgent)'}`);
  log(`${colors.bold}autoUpdate:${colors.reset}   ${config.autoUpdate || false}`);

  log(`\n${colors.dim}Set default agents: npx ai-agent-skills config --agents claude,cursor${colors.reset}`);
}

function setConfig(key, value) {
  const config = loadConfig();
  const validAgents = Object.keys(AGENT_PATHS);

  if (key === 'default-agent' || key === 'defaultAgent') {
    if (!AGENT_PATHS[value]) {
      error(`Invalid agent: ${value}`);
      log(`Valid agents: ${validAgents.join(', ')}`);
      return false;
    }
    config.defaultAgent = value;
  } else if (key === 'agents') {
    // Parse comma-separated agents list
    const agentsList = value.split(',').map(a => a.trim()).filter(a => validAgents.includes(a));
    if (agentsList.length === 0) {
      error(`No valid agents in: ${value}`);
      log(`Valid agents: ${validAgents.join(', ')}`);
      return false;
    }
    config.agents = agentsList;
  } else if (key === 'auto-update' || key === 'autoUpdate') {
    config.autoUpdate = value === 'true' || value === true;
  } else {
    error(`Unknown config key: ${key}`);
    return false;
  }

  if (saveConfig(config)) {
    success(`Config updated: ${key} = ${value}`);
    return true;
  }
  return false;
}

// ============ INIT COMMAND ============

function initSkill(name) {
  const skillName = name || path.basename(process.cwd());
  const targetDir = name ? path.join(process.cwd(), name) : process.cwd();
  const skillMdPath = path.join(targetDir, 'SKILL.md');

  if (fs.existsSync(skillMdPath)) {
    error(`SKILL.md already exists at ${skillMdPath}`);
    process.exitCode = 1;
    return false;
  }

  const safeName = skillName.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

  const template = `---
name: ${safeName}
description: Describe when this skill should trigger, not what it does.
---

# ${safeName}

## When to Use

Describe the conditions that should activate this skill.

## Instructions

What the agent should do when this skill is active.

## Gotchas

Specific failure modes or non-obvious behaviors the agent would hit without this guidance.
`;

  if (name && !fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  fs.writeFileSync(skillMdPath, template);
  success(`Created ${skillMdPath}`);
  log(`\n${colors.dim}Edit the file, then validate:${colors.reset}`);
  log(`  npx ai-agent-skills validate ${name ? name : '.'}`);
  return true;
}

// ============ CHECK COMMAND ============

function checkSkills(scope) {
  const { execFileSync } = require('child_process');

  const targets = [];
  if (!scope || scope === 'global') {
    targets.push({ label: 'global', path: SCOPES.global });
  }
  if (!scope || scope === 'project') {
    targets.push({ label: 'project', path: SCOPES.project });
  }

  log(`\n${colors.bold}Checking installed skills...${colors.reset}\n`);

  let updatesAvailable = 0;
  let checked = 0;

  for (const target of targets) {
    if (!fs.existsSync(target.path)) continue;

    try {
      const entries = fs.readdirSync(target.path, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const skillDir = path.join(target.path, entry.name);
        if (!fs.existsSync(path.join(skillDir, 'SKILL.md'))) continue;

        checked++;
        const meta = readSkillMeta(skillDir);

        if (!meta) {
          log(`  ${colors.dim}?${colors.reset} ${entry.name}${colors.dim}      no source metadata (manually installed)${colors.reset}`);
          continue;
        }

        // For GitHub sources, try to check if updates exist
        const sourceType = meta.sourceType || meta.source;

        if (sourceType === 'github' && (meta.repo || meta.url)) {
          try {
            const repoPath = meta.repo || meta.url.replace('https://github.com/', '').replace(/\.git$/, '');
            execFileSync('git', ['ls-remote', '--exit-code', `https://github.com/${repoPath}.git`, 'HEAD'], {
              stdio: 'pipe',
              timeout: 10000,
              env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
            });
            // If we get here, remote is reachable. We can't cheaply diff without the original SHA,
            // so just report as potentially up to date
            log(`  ${colors.green}\u2713${colors.reset} ${entry.name}${colors.dim}      up to date${colors.reset}`);
          } catch {
            log(`  ${colors.yellow}\u2191${colors.reset} ${entry.name}${colors.dim}      update may be available (${meta.repo || meta.url})${colors.reset}`);
            updatesAvailable++;
          }
        } else if (sourceType === 'catalog' || sourceType === 'registry') {
          // Check against bundled catalog
          const bundledPath = path.join(SKILLS_DIR, entry.name);
          if (fs.existsSync(bundledPath)) {
            log(`  ${colors.green}\u2713${colors.reset} ${entry.name}${colors.dim}      up to date${colors.reset}`);
          } else {
            log(`  ${colors.dim}?${colors.reset} ${entry.name}${colors.dim}      not in current catalog${colors.reset}`);
          }
        } else {
          log(`  ${colors.green}\u2713${colors.reset} ${entry.name}${colors.dim}      ${sourceType}${colors.reset}`);
        }
      }
    } catch (e) {
      // skip unreadable dirs
    }
  }

  if (checked === 0) {
    warn('No installed skills found');
    return;
  }

  log('');
  if (updatesAvailable > 0) {
    log(`${updatesAvailable} update(s) may be available. Run ${colors.cyan}npx ai-agent-skills update${colors.reset} to install.`);
  } else {
    log(`${colors.dim}All ${checked} skill(s) checked.${colors.reset}`);
  }
}

// ============ MAIN CLI ============

async function main() {
  const args = process.argv.slice(2);
  const parsed = parseArgs(args);
  const {
    command,
    param,
    agents,
    explicitAgent,
    installed,
    dryRun,
    category,
    workArea,
    collection,
    tags,
    labels,
    notes,
    why,
    branch,
    trust,
    description,
    lastVerified,
    featured,
    clearVerified,
    remove,
    all,
    scope,
    skillFilters,
    listMode,
    yes,
  } = parsed;
  const ALL_AGENTS = Object.keys(AGENT_PATHS);
  const managedTargets = resolveManagedTargets(parsed);

  if (!command) {
    if (!isInteractiveTerminal()) {
      showHelp();
      return;
    }

    const tuiAgent = explicitAgent ? agents[0] : null;
    const tuiScope = scope || 'global';
    const action = await launchBrowser({agent: tuiAgent, scope: tuiScope});
    if (action && action.type === 'install') {
      if (action.agent) {
        installSkill(action.skillName, action.agent, false);
      } else {
        const scopePath = SCOPES[action.scope || 'global'];
        installSkillToScope(action.skillName, scopePath, action.scope || 'global', false);
      }
    } else if (action && action.type === 'github-install') {
      await installFromGitHub(action.source, agents[0], false);
    } else if (action && action.type === 'skills-install') {
      runExternalInstallAction(action);
    }
    return;
  }

  // Handle config commands specially
  if (command === 'config') {
    const configArgs = args.slice(1);
    if (configArgs.length === 0) {
      showConfig();
    } else {
      for (let i = 0; i < configArgs.length; i++) {
        if (configArgs[i].startsWith('--')) {
          const key = configArgs[i].replace('--', '');
          const value = configArgs[i + 1];
          if (value) {
            setConfig(key, value);
            i++;
          }
        }
      }
    }
    return;
  }

  switch (command) {
    case 'browse':
    case 'b': {
      if (!isInteractiveTerminal()) {
        error('The interactive browser requires a TTY terminal.');
        log('Try: npx ai-agent-skills list, search, info, or preview');
        process.exitCode = 1;
        return;
      }

      const browseAgent = explicitAgent ? agents[0] : null;
      const browseScope = scope || 'global';
      const action = await launchBrowser({agent: browseAgent, scope: browseScope});
      if (action && action.type === 'install') {
        if (action.agent) {
          installSkill(action.skillName, action.agent, false);
        } else {
          const scopePath = SCOPES[action.scope || 'global'];
          installSkillToScope(action.skillName, scopePath, action.scope || 'global', false);
        }
      } else if (action && action.type === 'github-install') {
        await installFromGitHub(action.source, agents[0], false);
      } else if (action && action.type === 'skills-install') {
        runExternalInstallAction(action);
      }
      return;
    }

    case 'list':
    case 'ls':
      if (installed) {
        for (let i = 0; i < managedTargets.length; i++) {
          if (i > 0) log('');
          listInstalledSkillsInPath(managedTargets[i].path, managedTargets[i].label);
        }
      } else {
        listSkills(category, tags, collection, workArea);
      }
      return;

    case 'collections':
      showCollections();
      return;

    case 'install':
    case 'i':
    case 'add': {
      if (!param) {
        error('Please specify a skill name, GitHub repo, or local path.');
        log('Usage: npx ai-agent-skills install <source> [-p]');
        process.exit(1);
      }
      const source = parseSource(param);
      const installPaths = resolveInstallPath(parsed);

      if (source.type === 'catalog') {
        // Install from bundled library (original flow)
        for (const targetPath of installPaths) {
          installSkill(source.name, null, dryRun, targetPath);
        }
      } else {
        // Source-repo install (v3 flow)
        await installFromSource(param, source, installPaths, skillFilters, listMode, yes, dryRun);
      }
      return;
    }

    case 'uninstall':
    case 'remove':
    case 'rm':
      if (!param) {
        error('Please specify a skill name.');
        log('Usage: npx ai-agent-skills uninstall <name> [--agents claude,cursor]');
        process.exit(1);
      }
      for (const target of managedTargets) {
        uninstallSkillFromPath(param, target.path, target.label, dryRun);
      }
      return;

    case 'update':
    case 'upgrade':
      if (all) {
        for (const target of managedTargets) {
          updateAllSkillsInPath(target.path, target.label, dryRun);
        }
      } else if (!param) {
        error('Please specify a skill name or use --all.');
        log('Usage: npx ai-agent-skills update <name> [--agents claude,cursor]');
        log('       npx ai-agent-skills update --all [--agents claude,cursor]');
        process.exit(1);
      } else {
        for (const target of managedTargets) {
          updateSkillInPath(param, target.path, target.label, dryRun);
        }
      }
      return;

    case 'search':
    case 's':
    case 'find':
      if (!param) {
        error('Please specify a search query.');
        log('Usage: npx ai-agent-skills search <query>');
        process.exit(1);
      }
      searchSkills(param, category, collection, workArea);
      return;

    case 'info':
    case 'show':
      if (!param) {
        error('Please specify a skill name.');
        log('Usage: npx ai-agent-skills info <skill-name>');
        process.exit(1);
      }
      showInfo(param);
      return;

    case 'preview':
      if (!param) {
        error('Please specify a skill name.');
        log('Usage: npx ai-agent-skills preview <skill-name>');
        process.exit(1);
      }
      showPreview(param);
      return;

    case 'catalog': {
      if (!param) {
        error('Provide a source: npx ai-agent-skills catalog owner/repo');
        log(`\n${colors.dim}Examples:${colors.reset}`);
        log(`  npx ai-agent-skills catalog openai/skills --list`);
        log(`  npx ai-agent-skills catalog openai/skills --skill linear --area workflow --branch Linear --why "I use it for issue triage."`);
        log(`  npx ai-agent-skills catalog shadcn-ui/ui --skill shadcn --area frontend --branch Components --why "Strong component patterns I actually reach for."`);
        return;
      }
      await catalogSkills(param, {
        list: listMode,
        skillFilter: skillFilters.length > 0 ? skillFilters[0] : null,
        area: workArea,
        branch,
        category,
        tags,
        labels,
        notes,
        trust,
        whyHere: why,
        description,
      });
      return;
    }

    case 'curate':
      runCurateCommand(param, parsed);
      return;

    case 'vendor':
      if (!param) {
        error('Provide a source: npx ai-agent-skills vendor <repo-or-path>');
        log(`\n${colors.dim}Examples:${colors.reset}`);
        log(`  npx ai-agent-skills vendor ~/repo --skill my-skill --area frontend --branch React --why "I want a maintained house copy."`);
        log(`  npx ai-agent-skills vendor openai/skills --list`);
        return;
      }
      await vendorSkill(param, {
        list: listMode,
        skillFilter: skillFilters.length > 0 ? skillFilters[0] : null,
        area: workArea,
        branch,
        category,
        tags,
        labels,
        notes,
        trust,
        whyHere: why,
        description,
        lastVerified,
        featured,
        clearVerified,
        remove,
        ref: getArgValue(process.argv, '--ref'),
        dryRun,
      });
      return;

    case 'doctor': {
      const doctorAgents = explicitAgent ? agents : Object.keys(AGENT_PATHS);
      runDoctor(doctorAgents);
      return;
    }

    case 'validate':
      runValidate(param);
      return;

    case 'init':
      initSkill(param);
      return;

    case 'check':
      checkSkills(scope);
      return;

    case 'help':
    case '--help':
    case '-h':
      showHelp();
      return;

    case 'version':
    case '--version':
    case '-v': {
      const pkg = require('./package.json');
      log(`ai-agent-skills v${pkg.version}`);
      return;
    }

    default:
      if (getAvailableSkills().includes(command)) {
        const defaultPaths = resolveInstallPath(parsed);
        for (const tp of defaultPaths) {
          installSkill(command, null, dryRun, tp);
        }
        return;
      }

      error(`Unknown command: ${command}`);
      showHelp();
      process.exit(1);
  }
}

main().catch((e) => {
  error(e && e.message ? e.message : String(e));
  process.exit(1);
});
