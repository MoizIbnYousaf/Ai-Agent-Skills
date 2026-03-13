#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');
const { pathToFileURL } = require('url');

// Version check
const [NODE_MAJOR, NODE_MINOR] = process.versions.node.split('.').map(Number);
if (NODE_MAJOR < 14 || (NODE_MAJOR === 14 && NODE_MINOR < 16)) {
  console.error(`Error: Node.js 14.16+ required (you have ${process.versions.node})`);
  process.exit(1);
}

const SKILLS_DIR = path.join(__dirname, 'skills');
const CONFIG_FILE = path.join(os.homedir(), '.agent-skills.json');
const MAX_SKILL_SIZE = 50 * 1024 * 1024; // 50MB limit

// Agent-specific skill directories
const AGENT_PATHS = {
  claude: path.join(os.homedir(), '.claude', 'skills'),
  cursor: path.join(process.cwd(), '.cursor', 'skills'),
  amp: path.join(os.homedir(), '.amp', 'skills'),
  vscode: path.join(process.cwd(), '.github', 'skills'),
  copilot: path.join(process.cwd(), '.github', 'skills'),
  project: path.join(process.cwd(), '.skills'),
  goose: path.join(os.homedir(), '.config', 'goose', 'skills'),
  opencode: path.join(os.homedir(), '.config', 'opencode', 'skill'),
  codex: path.join(os.homedir(), '.codex', 'skills'),
  letta: path.join(os.homedir(), '.letta', 'skills'),
  kilocode: path.join(os.homedir(), '.kilocode', 'skills'),
  gemini: path.join(os.homedir(), '.gemini', 'skills'),
};

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

const SKILL_META_FILE = '.skill-meta.json';

function writeSkillMeta(skillPath, meta) {
  try {
    const metaPath = path.join(skillPath, SKILL_META_FILE);
    const now = new Date().toISOString();
    const metadata = {
      ...meta,
      // Preserve original installedAt if it exists, otherwise set it
      installedAt: meta.installedAt || now,
      // Always update the updatedAt timestamp
      updatedAt: now
    };
    fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2));
    return true;
  } catch (e) {
    // Non-fatal - skill still works without metadata
    return false;
  }
}

function readSkillMeta(skillPath) {
  try {
    const metaPath = path.join(skillPath, SKILL_META_FILE);
    if (fs.existsSync(metaPath)) {
      return JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    }
  } catch (e) {
    // Ignore - treat as legacy skill
  }
  return null;
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

// ============ ERROR-SAFE JSON LOADING ============

function loadSkillsJson() {
  const skillsJsonPath = path.join(__dirname, 'skills.json');

  if (!fs.existsSync(skillsJsonPath)) {
    warn('skills.json not found, using empty list');
    return { skills: [] };
  }

  try {
    const content = fs.readFileSync(skillsJsonPath, 'utf8');
    const data = JSON.parse(content);

    if (!data.skills || !Array.isArray(data.skills)) {
      throw new Error('Invalid skills.json: missing skills array');
    }

    return data;
  } catch (e) {
    if (e instanceof SyntaxError) {
      error(`Failed to parse skills.json: ${e.message}`);
    } else {
      error(`Failed to load skills.json: ${e.message}`);
    }
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
  if (!fs.existsSync(SKILLS_DIR)) return [];

  try {
    return fs.readdirSync(SKILLS_DIR).filter(name => {
      const skillPath = path.join(SKILLS_DIR, name);
      return fs.statSync(skillPath).isDirectory() &&
             fs.existsSync(path.join(skillPath, 'SKILL.md'));
    });
  } catch (e) {
    error(`Failed to read skills directory: ${e.message}`);
    return [];
  }
}

// ============ ARGUMENT PARSING ============

function parseArgs(args) {
  const config = loadConfig();
  const validAgents = Object.keys(AGENT_PATHS);
  const defaultAgent = config.defaultAgent || 'claude';

  const result = {
    command: null,
    param: null,
    agents: [],           // New: array of agents
    allAgents: false,     // New: --all-agents flag
    explicitAgent: false, // Track if user explicitly specified agent(s)
    installed: false,
    all: false,
    dryRun: false,
    tags: null,
    category: null,
    workArea: null,
    collection: null
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    // --agents claude,cursor,codex (multiple agents)
    if (arg === '--agents') {
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
      let agentValue = args[i + 1] || defaultAgent;
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
    else if (arg === '--tag' || arg === '-t') {
      result.tags = args[i + 1];
      i++;
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
    result.agents = configAgents.length > 0 ? configAgents : [defaultAgent];
  }

  return result;
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

function installSkill(skillName, agent = 'claude', dryRun = false) {
  try {
    validateSkillName(skillName);
  } catch (e) {
    error(e.message);
    return false;
  }

  const sourcePath = path.join(SKILLS_DIR, skillName);

  if (!fs.existsSync(sourcePath)) {
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

  const destDir = AGENT_PATHS[agent] || AGENT_PATHS.claude;
  const destPath = path.join(destDir, skillName);
  const skillSize = getDirectorySize(sourcePath);

  if (dryRun) {
    log(`\n${colors.bold}Dry Run${colors.reset} (no changes made)\n`);
    info(`Would install: ${skillName}`);
    info(`Agent: ${agent}`);
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
      source: 'registry',
      name: skillName
    });

    success(`\nInstalled: ${skillName}`);
    info(`Agent: ${agent}`);
    info(`Location: ${destPath}`);
    info(`Size: ${(skillSize / 1024).toFixed(1)} KB`);

    log('');
    showAgentInstructions(agent, skillName, destPath);

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
  try {
    validateSkillName(skillName);
  } catch (e) {
    error(e.message);
    return false;
  }

  const destDir = AGENT_PATHS[agent] || AGENT_PATHS.claude;
  const skillPath = path.join(destDir, skillName);

  if (!fs.existsSync(skillPath)) {
    error(`Skill "${skillName}" is not installed for ${agent}.`);
    log(`\nInstalled skills for ${agent}:`);
    listInstalledSkills(agent);
    return false;
  }

  if (dryRun) {
    log(`\n${colors.bold}Dry Run${colors.reset} (no changes made)\n`);
    info(`Would uninstall: ${skillName}`);
    info(`Agent: ${agent}`);
    info(`Path: ${skillPath}`);
    return true;
  }

  try {
    fs.rmSync(skillPath, { recursive: true });
    success(`\nUninstalled: ${skillName}`);
    info(`Agent: ${agent}`);
    info(`Removed from: ${skillPath}`);
    return true;
  } catch (e) {
    error(`Failed to uninstall skill: ${e.message}`);
    return false;
  }
}

function getInstalledSkills(agent = 'claude') {
  const destDir = AGENT_PATHS[agent] || AGENT_PATHS.claude;

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

  if (installed.length === 0) {
    warn(`No skills installed for ${agent}`);
    info(`Location: ${destDir}`);
    return;
  }

  log(`\n${colors.bold}Installed Skills${colors.reset} (${installed.length} for ${agent})\n`);
  log(`${colors.dim}Location: ${destDir}${colors.reset}\n`);

  installed.forEach(name => {
    log(`  ${colors.green}${name}${colors.reset}`);
  });

  log(`\n${colors.dim}Update:    npx ai-agent-skills update <name> --agent ${agent}${colors.reset}`);
  log(`${colors.dim}Uninstall: npx ai-agent-skills uninstall <name> --agent ${agent}${colors.reset}`);
}

// Update from bundled registry
function updateFromRegistry(skillName, agent, destPath, dryRun) {
  const sourcePath = path.join(SKILLS_DIR, skillName);

  if (!fs.existsSync(sourcePath)) {
    error(`Skill "${skillName}" not found in repository.`);
    return false;
  }

  if (dryRun) {
    log(`\n${colors.bold}Dry Run${colors.reset} (no changes made)\n`);
    info(`Would update: ${skillName} (from registry)`);
    info(`Agent: ${agent}`);
    info(`Path: ${destPath}`);
    return true;
  }

  try {
    fs.rmSync(destPath, { recursive: true });
    copyDir(sourcePath, destPath);

    // Write metadata
    writeSkillMeta(destPath, {
      source: 'registry',
      name: skillName
    });

    success(`\nUpdated: ${skillName}`);
    info(`Agent: ${agent}`);
    info(`Location: ${destPath}`);
    return true;
  } catch (e) {
    error(`Failed to update skill: ${e.message}`);
    return false;
  }
}

// Update from GitHub repository
function updateFromGitHub(meta, skillName, agent, destPath, dryRun) {
  const { execFileSync } = require('child_process');
  const repo = meta.repo;

  // Validate repo format
  if (!repo || typeof repo !== 'string' || !repo.includes('/')) {
    error(`Invalid repository in metadata: ${repo}`);
    error(`Try reinstalling the skill from GitHub.`);
    return false;
  }

  if (dryRun) {
    log(`\n${colors.bold}Dry Run${colors.reset} (no changes made)\n`);
    info(`Would update: ${skillName} (from github:${repo})`);
    info(`Agent: ${agent}`);
    info(`Path: ${destPath}`);
    return true;
  }

  const tempDir = path.join(os.tmpdir(), `ai-skills-update-${Date.now()}`);

  try {
    info(`Updating ${skillName} from ${repo}...`);
    const repoUrl = `https://github.com/${repo}.git`;
    execFileSync('git', ['clone', '--depth', '1', repoUrl, tempDir], { stdio: 'pipe' });

    // Determine source path in cloned repo
    let sourcePath;
    if (meta.isRootSkill) {
      sourcePath = tempDir;
    } else if (meta.skillPath) {
      // Check if skills/ subdirectory exists
      const skillsSubdir = path.join(tempDir, 'skills', meta.skillPath);
      const directPath = path.join(tempDir, meta.skillPath);
      sourcePath = fs.existsSync(skillsSubdir) ? skillsSubdir : directPath;
    } else {
      sourcePath = tempDir;
    }

    if (!fs.existsSync(sourcePath) || !fs.existsSync(path.join(sourcePath, 'SKILL.md'))) {
      error(`Skill not found in repository ${repo}`);
      fs.rmSync(tempDir, { recursive: true });
      return false;
    }

    fs.rmSync(destPath, { recursive: true });
    copyDir(sourcePath, destPath);

    // Preserve metadata
    writeSkillMeta(destPath, meta);

    fs.rmSync(tempDir, { recursive: true });

    success(`\nUpdated: ${skillName}`);
    info(`Source: github:${repo}`);
    info(`Agent: ${agent}`);
    info(`Location: ${destPath}`);
    return true;
  } catch (e) {
    error(`Failed to update from GitHub: ${e.message}`);
    try { fs.rmSync(tempDir, { recursive: true }); } catch {}
    return false;
  }
}

function updateFromGitUrl(meta, skillName, agent, destPath, dryRun) {
  const { execFileSync } = require('child_process');
  const parsed = parseGitUrl(meta.url);
  const url = parsed.url;
  const ref = meta.ref || parsed.ref;

  // Validate URL from metadata
  try {
    validateGitUrl(url);
  } catch (e) {
    error(`Invalid git URL in metadata: ${e.message}. Try reinstalling the skill.`);
    return false;
  }

  if (dryRun) {
    log(`\n${colors.bold}Dry Run${colors.reset} (no changes made)\n`);
    info(`Would update: ${skillName} (from git:${url}${ref ? `#${ref}` : ''})`);
    info(`Agent: ${agent}`);
    info(`Path: ${destPath}`);
    return true;
  }

  // Use secure temp directory creation
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-skills-update-'));

  try {
    info(`Updating ${skillName} from ${url}${ref ? `#${ref}` : ''}...`);
    const cloneArgs = ['clone', '--depth', '1'];
    if (ref) {
      cloneArgs.push('--branch', ref);
    }
    cloneArgs.push(url, tempDir);
    execFileSync('git', cloneArgs, { stdio: 'pipe' });

    let sourcePath;
    if (meta.isRootSkill) {
      sourcePath = tempDir;
    } else if (meta.skillPath) {
      const skillsSubdir = path.join(tempDir, 'skills', meta.skillPath);
      const directPath = path.join(tempDir, meta.skillPath);
      sourcePath = fs.existsSync(skillsSubdir) ? skillsSubdir : directPath;
    } else {
      sourcePath = tempDir;
    }

    if (!fs.existsSync(sourcePath) || !fs.existsSync(path.join(sourcePath, 'SKILL.md'))) {
      error(`Skill not found in repository ${url}`);
      fs.rmSync(tempDir, { recursive: true });
      return false;
    }

    fs.rmSync(destPath, { recursive: true });
    copyDir(sourcePath, destPath);

    // Sanitize URL before storing
    const sanitizedUrl = sanitizeGitUrl(url);

    writeSkillMeta(destPath, {
      ...meta,
      source: 'git',
      url: sanitizedUrl,
      ref: ref || null
    });

    fs.rmSync(tempDir, { recursive: true });

    success(`\nUpdated: ${skillName}`);
    info(`Source: git:${url}${ref ? `#${ref}` : ''}`);
    info(`Agent: ${agent}`);
    info(`Location: ${destPath}`);
    return true;
  } catch (e) {
    // Provide more helpful error messages for common git failures
    let errorMsg = e.message;
    if (e.message.includes('not found') || e.message.includes('Repository not found')) {
      errorMsg = `Repository not found. The URL may have changed or been removed.`;
    } else if (e.message.includes('Authentication failed') || e.message.includes('Permission denied')) {
      errorMsg = `Authentication failed. Check your credentials or SSH key.`;
    } else if (e.message.includes('Could not resolve host')) {
      errorMsg = `Could not resolve host. Check your network connection.`;
    }
    error(`Failed to update from git: ${errorMsg}`);
    try { fs.rmSync(tempDir, { recursive: true }); } catch {}
    return false;
  }
}

// Update from local path
function updateFromLocalPath(meta, skillName, agent, destPath, dryRun) {
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
    info(`Agent: ${agent}`);
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
    info(`Agent: ${agent}`);
    info(`Location: ${destPath}`);
    return true;
  } catch (e) {
    error(`Failed to update from local path: ${e.message}`);
    return false;
  }
}

function updateSkill(skillName, agent = 'claude', dryRun = false) {
  try {
    validateSkillName(skillName);
  } catch (e) {
    error(e.message);
    return false;
  }

  const destDir = AGENT_PATHS[agent] || AGENT_PATHS.claude;
  const destPath = path.join(destDir, skillName);

  if (!fs.existsSync(destPath)) {
    error(`Skill "${skillName}" is not installed for ${agent}.`);
    log(`\nUse 'install' to add it first.`);
    return false;
  }

  // Read metadata to determine source
  const meta = readSkillMeta(destPath);

  if (!meta) {
    // Legacy skill without metadata - try registry
    return updateFromRegistry(skillName, agent, destPath, dryRun);
  }

  // Route to correct update method based on source
  switch (meta.source) {
    case 'github':
      return updateFromGitHub(meta, skillName, agent, destPath, dryRun);
    case 'git':
      return updateFromGitUrl(meta, skillName, agent, destPath, dryRun);
    case 'local':
      return updateFromLocalPath(meta, skillName, agent, destPath, dryRun);
    case 'registry':
    default:
      return updateFromRegistry(skillName, agent, destPath, dryRun);
  }
}

function updateAllSkills(agent = 'claude', dryRun = false) {
  const installed = getInstalledSkills(agent);

  if (installed.length === 0) {
    warn(`No skills installed for ${agent}`);
    return;
  }

  log(`\n${colors.bold}Updating ${installed.length} skill(s)...${colors.reset}\n`);

  let updated = 0;
  let failed = 0;

  for (const skillName of installed) {
    if (updateSkill(skillName, agent, dryRun)) {
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

  if (skills.length === 0) {
    if (category || workArea || tags || collectionId) {
      warn(`No skills found matching filters`);
      log(`\n${colors.dim}Try: npx ai-agent-skills list${colors.reset}`);
    } else {
      warn('No skills found in skills.json');
    }
    return;
  }

  log(`\n${colors.bold}Available Skills${colors.reset} (${skills.length} total)\n`);

  if (collectionResult.collection) {
    log(`${colors.blue}${colors.bold}${collectionResult.collection.title}${colors.reset} ${colors.dim}[${collectionResult.collection.id}]${colors.reset}`);
    log(`${colors.dim}${collectionResult.collection.description}${colors.reset}\n`);

    skills.forEach(skill => {
      const featured = skill.featured ? ` ${colors.yellow}*${colors.reset}` : '';
      const verified = skill.verified ? ` ${colors.green}✓${colors.reset}` : '';
      const tagStr = skill.tags && skill.tags.length > 0
        ? ` ${colors.dim}[${skill.tags.slice(0, 3).join(', ')}]${colors.reset}`
        : '';

      log(`  ${colors.green}${skill.name}${colors.reset}${featured}${verified}${tagStr}`);
      log(`    ${colors.dim}${getSkillMeta(skill)}${colors.reset}`);

      const desc = skill.description.length > 80
        ? skill.description.slice(0, 80) + '...'
        : skill.description;
      log(`    ${colors.dim}${desc}${colors.reset}`);
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

    orderedAreas.forEach(areaId => {
      const meta = getWorkAreaMeta(data, areaId);
      const title = meta ? meta.title : formatWorkAreaTitle(areaId);
      log(`${colors.blue}${colors.bold}${title.toUpperCase()}${colors.reset}`);
      if (meta && meta.description) {
        log(`${colors.dim}${meta.description}${colors.reset}`);
      }
      byWorkArea[areaId].forEach(skill => {
        const featured = skill.featured ? ` ${colors.yellow}*${colors.reset}` : '';
        const verified = skill.verified ? ` ${colors.green}✓${colors.reset}` : '';
        const tagStr = skill.tags && skill.tags.length > 0
          ? ` ${colors.dim}[${skill.tags.slice(0, 3).join(', ')}]${colors.reset}`
          : '';

        log(`  ${colors.green}${skill.name}${colors.reset}${featured}${verified}${tagStr}`);
        log(`    ${colors.dim}${getSkillMeta(skill, false)}${colors.reset}`);

        const desc = skill.description.length > 65
          ? skill.description.slice(0, 65) + '...'
          : skill.description;
        log(`    ${colors.dim}${desc}${colors.reset}`);
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

  if (matches.length === 0) {
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

  log(`\n${colors.bold}Search Results${colors.reset} (${matches.length} matches${scope})\n`);

  matches.forEach(skill => {
    const tagStr = skill.tags && skill.tags.length > 0
      ? ` ${colors.magenta}[${skill.tags.slice(0, 3).join(', ')}]${colors.reset}`
      : '';

    const label = getSkillWorkArea(skill) && getSkillBranch(skill)
      ? `${formatWorkAreaTitle(getSkillWorkArea(skill))} / ${getSkillBranch(skill)}`
      : skill.category;
    log(`${colors.green}${skill.name}${colors.reset} ${colors.dim}[${label}]${colors.reset}${tagStr}`);
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
  log(`${colors.dim}These are the main shelves. Search and tags cover the rest.${colors.reset}\n`);

  collections.forEach(collection => {
    const sample = collection.skills.slice(0, 4).join(', ');
    const more = collection.skills.length > 4 ? ', ...' : '';

    log(`${colors.blue}${colors.bold}${collection.title}${colors.reset} ${colors.dim}[${collection.id}]${colors.reset}`);
    log(`  ${colors.dim}${collection.description}${colors.reset}`);
    log(`  ${colors.green}${collection.skills.length} skills${colors.reset} · ${sample}${more}`);
    log(`  ${colors.dim}npx ai-agent-skills list --collection ${collection.id}${colors.reset}\n`);
  });
}

function getSkillFilePath(skillName) {
  try {
    validateSkillName(skillName);
  } catch (e) {
    error(e.message);
    return null;
  }

  const skillPath = path.join(SKILLS_DIR, skillName, 'SKILL.md');
  if (!fs.existsSync(skillPath)) {
    error(`Skill "${skillName}" not found.`);
    return null;
  }

  return skillPath;
}

function showPreview(skillName) {
  const skillPath = getSkillFilePath(skillName);
  if (!skillPath) return;

  log(`\n${colors.bold}Preview:${colors.reset} ${skillName}\n`);
  log(fs.readFileSync(skillPath, 'utf8'));
}

function isInteractiveTerminal() {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

async function launchBrowser(agent = 'claude') {
  const tuiUrl = pathToFileURL(path.join(__dirname, 'tui', 'index.mjs')).href;
  const tuiModule = await import(tuiUrl);
  return tuiModule.launchTui({ agent });
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

function isGitHubUrl(source) {
  // Must have owner/repo format, not start with path indicators
  return source.includes('/') &&
         !source.startsWith('./') &&
         !source.startsWith('../') &&
         !source.startsWith('/') &&
         !source.startsWith('~') &&
         !isWindowsPath(source);
}

function isGitUrl(source) {
  if (!source || typeof source !== 'string') return false;

  // Avoid treating local filesystem paths as git URLs
  if (isLocalPath(source)) return false;

  // SSH-style: git@host:path (with optional .git suffix and #ref)
  const sshLike = /^git@[a-zA-Z0-9._-]+:[a-zA-Z0-9._\/-]+(?:\.git)?(?:#[a-zA-Z0-9._\/-]+)?$/;
  // Protocol URLs: https://, git://, ssh://, file:// (allows @ for user in ssh://git@host)
  const protocolLike = /^(https?|git|ssh|file):\/\/[a-zA-Z0-9._@:\/-]+(?:#[a-zA-Z0-9._\/-]+)?$/;

  return sshLike.test(source) || protocolLike.test(source);
}

function parseGitUrl(source) {
  if (!source || typeof source !== 'string') return { url: null, ref: null };
  // Split on first # only (ref might contain special chars)
  const hashIndex = source.indexOf('#');
  if (hashIndex === -1) {
    return { url: source, ref: null };
  }
  return {
    url: source.slice(0, hashIndex),
    ref: source.slice(hashIndex + 1) || null
  };
}

function getRepoNameFromUrl(url) {
  if (!url || typeof url !== 'string') return null;

  // Remove trailing slashes and .git suffix
  let cleaned = url.replace(/\/+$/, '').replace(/\.git$/, '');

  // Handle SSH URLs: git@host:org/repo -> extract 'repo'
  if (cleaned.includes('@') && cleaned.includes(':')) {
    const colonIndex = cleaned.lastIndexOf(':');
    const pathPart = cleaned.slice(colonIndex + 1);
    const segments = pathPart.split('/').filter(Boolean);
    return segments.length > 0 ? segments[segments.length - 1] : null;
  }

  // Handle protocol URLs: extract last path segment
  const segments = cleaned.split('/').filter(Boolean);
  return segments.length > 0 ? segments[segments.length - 1] : null;
}

// Validate git URL to prevent malformed/malicious input
function validateGitUrl(url) {
  if (!url || typeof url !== 'string') {
    throw new Error('Invalid git URL: empty or not a string');
  }

  // Max reasonable URL length
  if (url.length > 2048) {
    throw new Error('Git URL too long (max 2048 characters)');
  }

  // Check for dangerous characters that could cause issues
  const dangerousChars = /[\x00-\x1f\x7f`$\\]/;
  if (dangerousChars.test(url)) {
    throw new Error('Git URL contains invalid characters');
  }

  // Must match expected patterns
  if (!isGitUrl(url)) {
    throw new Error('Invalid git URL format');
  }

  return true;
}

// Sanitize URL for storage (remove credentials if present)
function sanitizeGitUrl(url) {
  if (!url) return url;
  try {
    // Handle protocol URLs
    if (url.includes('://')) {
      const parsed = new URL(url);
      // Remove any embedded credentials
      parsed.username = '';
      parsed.password = '';
      return parsed.toString();
    }
    // SSH URLs don't typically have credentials embedded
    return url;
  } catch {
    return url;
  }
}

function isWindowsPath(source) {
  // Match Windows absolute paths like C:\, D:\, etc.
  return /^[a-zA-Z]:[\\\/]/.test(source);
}

function isLocalPath(source) {
  // Explicit local paths: ./ or / or ~/ or Windows paths like C:\
  // Also accept ../ as local path (will be resolved)
  return source.startsWith('./') ||
         source.startsWith('../') ||
         source.startsWith('/') ||
         source.startsWith('~/') ||
         isWindowsPath(source);
}

function expandPath(p) {
  if (p.startsWith('~')) {
    return path.join(os.homedir(), p.slice(1));
  }
  return path.resolve(p);
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

async function installFromGitHub(source, agent = 'claude', dryRun = false) {
  const { execFileSync } = require('child_process');

  // Parse owner/repo format
  const parts = source.split('/');
  if (parts.length < 2) {
    error('Invalid GitHub source. Use format: owner/repo or owner/repo/skill-name');
    return false;
  }

  const owner = parts[0];
  const repo = parts[1];
  const skillName = parts[2]; // Optional specific skill

  // Validate owner and repo to prevent injection attacks
  try {
    validateGitHubName(owner, 'owner');
    validateGitHubName(repo, 'repository');
    if (skillName) {
      validateSkillName(skillName);
    }
  } catch (e) {
    error(e.message);
    return false;
  }

  const repoUrl = `https://github.com/${owner}/${repo}.git`;
  const tempDir = path.join(os.tmpdir(), `ai-skills-${Date.now()}`);

  if (dryRun) {
    log(`\n${colors.bold}Dry Run${colors.reset} (no changes made)\n`);
    info(`Would clone: ${repoUrl}`);
    info(`Would install ${skillName ? `skill: ${skillName}` : 'all skills from repo'}`);
    info(`Agent: ${agent}`);
    return true;
  }

  try {
    info(`Cloning ${owner}/${repo}...`);
    // Use execFileSync with args array to prevent shell injection
    execFileSync('git', ['clone', '--depth', '1', repoUrl, tempDir], { stdio: 'pipe' });

    // Find skills in the cloned repo
    const skillsDir = fs.existsSync(path.join(tempDir, 'skills'))
      ? path.join(tempDir, 'skills')
      : tempDir;

    // Check if repo root IS a skill (has SKILL.md at root)
    const isRootSkill = fs.existsSync(path.join(tempDir, 'SKILL.md'));

    if (skillName) {
      // Install specific skill
      const skillPath = path.join(skillsDir, skillName);
      if (!fs.existsSync(skillPath) || !fs.existsSync(path.join(skillPath, 'SKILL.md'))) {
        error(`Skill "${skillName}" not found in ${owner}/${repo}`);
        fs.rmSync(tempDir, { recursive: true });
        return false;
      }

      const destDir = AGENT_PATHS[agent] || AGENT_PATHS.claude;
      const destPath = path.join(destDir, skillName);

      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      copyDir(skillPath, destPath);

      // Write metadata for update tracking
      writeSkillMeta(destPath, {
        source: 'github',
        repo: `${owner}/${repo}`,
        skillPath: skillName
      });

      success(`\nInstalled: ${skillName} from ${owner}/${repo}`);
      info(`Location: ${destPath}`);
    } else if (isRootSkill) {
      // Repo itself is a single skill
      // Sanitize repo name to valid skill name (lowercase, alphanumeric + hyphens)
      const skillName = repo.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

      try {
        validateSkillName(skillName);
      } catch (e) {
        error(`Cannot install: repo name "${repo}" cannot be converted to valid skill name`);
        fs.rmSync(tempDir, { recursive: true });
        return false;
      }

      const destDir = AGENT_PATHS[agent] || AGENT_PATHS.claude;
      const destPath = path.join(destDir, skillName);

      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      copyDir(tempDir, destPath);

      // Write metadata for update tracking
      writeSkillMeta(destPath, {
        source: 'github',
        repo: `${owner}/${repo}`,
        isRootSkill: true
      });

      success(`\nInstalled: ${skillName} from ${owner}/${repo}`);
      info(`Location: ${destPath}`);
    } else {
      // Install all skills from repo
      const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
      let installed = 0;

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const skillPath = path.join(skillsDir, entry.name);
          if (fs.existsSync(path.join(skillPath, 'SKILL.md'))) {
            const destDir = AGENT_PATHS[agent] || AGENT_PATHS.claude;
            const destPath = path.join(destDir, entry.name);

            if (!fs.existsSync(destDir)) {
              fs.mkdirSync(destDir, { recursive: true });
            }

            copyDir(skillPath, destPath);

            // Write metadata for update tracking
            writeSkillMeta(destPath, {
              source: 'github',
              repo: `${owner}/${repo}`,
              skillPath: entry.name
            });

            log(`  ${colors.green}✓${colors.reset} ${entry.name}`);
            installed++;
          }
        }
      }

      if (installed > 0) {
        success(`\nInstalled ${installed} skill(s) from ${owner}/${repo}`);
      } else {
        warn('No skills found in repository');
      }
    }

    // Cleanup
    fs.rmSync(tempDir, { recursive: true });
    return true;
  } catch (e) {
    error(`Failed to install from GitHub: ${e.message}`);
    try { fs.rmSync(tempDir, { recursive: true }); } catch {}
    return false;
  }
}

async function installFromGitUrl(source, agent = 'claude', dryRun = false) {
  const { execFileSync } = require('child_process');
  const { url, ref } = parseGitUrl(source);

  // Validate URL format and safety
  try {
    validateGitUrl(url);
    if (ref && !/^[a-zA-Z0-9._\/-]+$/.test(ref)) {
      throw new Error('Invalid ref format');
    }
  } catch (e) {
    error(`Invalid git URL: ${e.message}`);
    return false;
  }

  const repoName = getRepoNameFromUrl(url);
  if (!repoName) {
    error('Could not determine repository name from git URL');
    return false;
  }

  // Use secure temp directory creation
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-skills-'));

  if (dryRun) {
    log(`\n${colors.bold}Dry Run${colors.reset} (no changes made)\n`);
    info(`Would clone: ${url}${ref ? `#${ref}` : ''}`);
    info('Would install skills discovered in repository');
    info(`Agent: ${agent}`);
    return true;
  }

  try {
    info(`Cloning ${url}${ref ? `#${ref}` : ''}...`);
    const cloneArgs = ['clone'];
    if (!url.startsWith('file://')) {
      cloneArgs.push('--depth', '1');
    }
    if (ref) {
      cloneArgs.push('--branch', ref);
    }
    cloneArgs.push(url, tempDir);
    execFileSync('git', cloneArgs, { stdio: 'pipe' });

    const skillsDir = fs.existsSync(path.join(tempDir, 'skills'))
      ? path.join(tempDir, 'skills')
      : tempDir;

    const isRootSkill = fs.existsSync(path.join(tempDir, 'SKILL.md'));

    if (isRootSkill) {
      const skillName = repoName.toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

      try {
        validateSkillName(skillName);
      } catch (e) {
        error(`Cannot install: repo name "${repoName}" cannot be converted to valid skill name`);
        fs.rmSync(tempDir, { recursive: true });
        return false;
      }

      const destDir = AGENT_PATHS[agent] || AGENT_PATHS.claude;
      const destPath = path.join(destDir, skillName);

      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      copyDir(tempDir, destPath);

      // Sanitize URL before storing in metadata
      const sanitizedUrl = sanitizeGitUrl(url);

      writeSkillMeta(destPath, {
        source: 'git',
        url: sanitizedUrl,
        ref: ref || null,
        isRootSkill: true
      });

      success(`\nInstalled: ${skillName} from ${url}`);
      info(`Location: ${destPath}`);
    } else {
      const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
      let installed = 0;

      // Sanitize URL before storing in metadata
      const sanitizedUrl = sanitizeGitUrl(url);

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const skillPath = path.join(skillsDir, entry.name);
          if (fs.existsSync(path.join(skillPath, 'SKILL.md'))) {
            const destDir = AGENT_PATHS[agent] || AGENT_PATHS.claude;
            const destPath = path.join(destDir, entry.name);

            if (!fs.existsSync(destDir)) {
              fs.mkdirSync(destDir, { recursive: true });
            }

            copyDir(skillPath, destPath);

            writeSkillMeta(destPath, {
              source: 'git',
              url: sanitizedUrl,
              ref: ref || null,
              skillPath: entry.name
            });

            log(`  ${colors.green}✓${colors.reset} ${entry.name}`);
            installed++;
          }
        }
      }

      if (installed > 0) {
        success(`\nInstalled ${installed} skill(s) from ${url}`);
      } else {
        warn('No skills found in repository');
      }
    }

    fs.rmSync(tempDir, { recursive: true });
    return true;
  } catch (e) {
    // Provide more helpful error messages for common git failures
    let errorMsg = e.message;
    if (e.message.includes('not found') || e.message.includes('Repository not found')) {
      errorMsg = `Repository not found. Check the URL is correct and you have access.`;
    } else if (e.message.includes('Authentication failed') || e.message.includes('Permission denied')) {
      errorMsg = `Authentication failed. For SSH URLs, ensure your SSH key is configured. For HTTPS, check credentials.`;
    } else if (e.message.includes('Could not resolve host')) {
      errorMsg = `Could not resolve host. Check your network connection and the URL.`;
    } else if (e.message.includes('Connection refused') || e.message.includes('Connection timed out')) {
      errorMsg = `Connection failed. Check your network connection.`;
    }
    error(`Failed to install from git: ${errorMsg}`);
    try { fs.rmSync(tempDir, { recursive: true }); } catch {}
    return false;
  }
}

function installFromLocalPath(source, agent = 'claude', dryRun = false) {
  const sourcePath = expandPath(source);

  if (!fs.existsSync(sourcePath)) {
    error(`Path not found: ${sourcePath}`);
    return false;
  }

  const stat = fs.statSync(sourcePath);
  if (!stat.isDirectory()) {
    error('Source must be a directory');
    return false;
  }

  // Check if it's a single skill or a directory of skills
  const hasSkillMd = fs.existsSync(path.join(sourcePath, 'SKILL.md'));

  if (dryRun) {
    log(`\n${colors.bold}Dry Run${colors.reset} (no changes made)\n`);
    info(`Would install from: ${sourcePath}`);
    info(`Agent: ${agent}`);
    return true;
  }

  if (hasSkillMd) {
    // Single skill
    const skillName = path.basename(sourcePath);
    const destDir = AGENT_PATHS[agent] || AGENT_PATHS.claude;
    const destPath = path.join(destDir, skillName);

    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    copyDir(sourcePath, destPath);

    // Write metadata for update tracking
    writeSkillMeta(destPath, {
      source: 'local',
      path: sourcePath
    });

    success(`\nInstalled: ${skillName} from local path`);
    info(`Location: ${destPath}`);
  } else {
    // Directory of skills
    const entries = fs.readdirSync(sourcePath, { withFileTypes: true });
    let installed = 0;

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skillPath = path.join(sourcePath, entry.name);
        if (fs.existsSync(path.join(skillPath, 'SKILL.md'))) {
          const destDir = AGENT_PATHS[agent] || AGENT_PATHS.claude;
          const destPath = path.join(destDir, entry.name);

          if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
          }

          copyDir(skillPath, destPath);

          // Write metadata for update tracking
          writeSkillMeta(destPath, {
            source: 'local',
            path: skillPath
          });

          log(`  ${colors.green}✓${colors.reset} ${entry.name}`);
          installed++;
        }
      }
    }

    if (installed > 0) {
      success(`\nInstalled ${installed} skill(s) from local path`);
    } else {
      warn('No skills found in directory');
    }
  }

  return true;
}

// ============ INFO AND HELP ============

function showHelp() {
  log(`
${colors.bold}AI Agent Skills${colors.reset}
The agent skills I actually keep around.

${colors.bold}Usage:${colors.reset}
  npx ai-agent-skills [command] [options]

${colors.bold}Commands:${colors.reset}
  ${colors.green}(no command)${colors.reset}                     Launch the interactive browser (TTY only)
  ${colors.green}browse${colors.reset}                           Interactive skill browser (TUI)
  ${colors.green}list${colors.reset}                             List all available skills
  ${colors.green}list --installed${colors.reset}                 List installed skills for an agent
  ${colors.green}list --work-area <area>${colors.reset}          Filter by work area
  ${colors.green}list --category <cat>${colors.reset}            Filter by category
  ${colors.green}list --collection <id>${colors.reset}           Filter by curated collection
  ${colors.green}collections${colors.reset}                      Show curated collections
  ${colors.green}install <name>${colors.reset}                   Install to ALL agents (default)
  ${colors.green}install <name> --agent cursor${colors.reset}    Install to specific agent only
  ${colors.green}install <owner/repo>${colors.reset}             Install from GitHub repository
  ${colors.green}install <git-url>${colors.reset}                Install from any git URL (ssh/https)
  ${colors.green}install ./path${colors.reset}                   Install from local path
  ${colors.green}install <name> --dry-run${colors.reset}         Preview installation without changes
  ${colors.green}uninstall <name>${colors.reset}                 Remove an installed skill
  ${colors.green}update <name>${colors.reset}                    Update an installed skill to latest
  ${colors.green}update --all${colors.reset}                     Update all installed skills
  ${colors.green}search <query>${colors.reset}                   Search skills by name, description, or tags
  ${colors.green}info <name>${colors.reset}                      Show skill details
  ${colors.green}preview <name>${colors.reset}                   Print the bundled SKILL.md
  ${colors.green}config${colors.reset}                           Show/edit configuration
  ${colors.green}version${colors.reset}                          Show version number
  ${colors.green}help${colors.reset}                             Show this help

${colors.bold}Options:${colors.reset}
  ${colors.cyan}--agent <name>${colors.reset}       Target specific agent (install defaults to ALL)
  ${colors.cyan}--agents <list>${colors.reset}      Target multiple agents (comma-separated)
  ${colors.cyan}--installed${colors.reset}          Show only installed skills (with list)
  ${colors.cyan}--dry-run, -n${colors.reset}        Preview changes without applying
  ${colors.cyan}--work-area <a>${colors.reset}      Filter by work area
  ${colors.cyan}--category <c>${colors.reset}       Filter by category
  ${colors.cyan}--collection <id>${colors.reset}    Filter by curated collection
  ${colors.cyan}--all${colors.reset}                Apply to all (with update)
  ${colors.cyan}--version, -v${colors.reset}        Show version number

${colors.bold}Agents:${colors.reset} (install targets ALL by default)
  ${colors.cyan}claude${colors.reset}   ~/.claude/skills/
  ${colors.cyan}cursor${colors.reset}   .cursor/skills/ (project)
  ${colors.cyan}codex${colors.reset}    ~/.codex/skills/
  ${colors.cyan}amp${colors.reset}      ~/.amp/skills/
  ${colors.cyan}vscode${colors.reset}   .github/skills/ (project)
  ${colors.cyan}copilot${colors.reset}  .github/skills/ (alias for vscode)
  ${colors.cyan}gemini${colors.reset}   ~/.gemini/skills/
  ${colors.cyan}goose${colors.reset}    ~/.config/goose/skills/
  ${colors.cyan}opencode${colors.reset} ~/.opencode/skill/
  ${colors.cyan}letta${colors.reset}    ~/.letta/skills/
  ${colors.cyan}kilocode${colors.reset} ~/.kilocode/skills/
  ${colors.cyan}project${colors.reset}  .skills/ (portable)

${colors.bold}Work Areas:${colors.reset}
  frontend, backend, mobile, docs, testing, workflow, research, design, business

${colors.bold}Categories:${colors.reset}
  development, document, creative, business, productivity

${colors.bold}Collections:${colors.reset}
  my-picks, build-apps, build-systems, test-and-debug, docs-and-research

${colors.bold}Legacy collection aliases:${colors.reset}
  web-product, mobile-expo, backend-systems, quality-workflows, docs-files

${colors.bold}Examples:${colors.reset}
  npx ai-agent-skills                                       # Launch the terminal browser
  npx ai-agent-skills browse                                # Interactive browser
  npx ai-agent-skills collections                           # Browse curated collections
  npx ai-agent-skills list --work-area frontend
  npx ai-agent-skills preview pdf
  npx ai-agent-skills install frontend-design               # Install to ALL agents
  npx ai-agent-skills install pdf --agent cursor            # Install to Cursor only
  npx ai-agent-skills install pdf --agents claude,cursor    # Install to specific agents
  npx ai-agent-skills install anthropics/skills             # Install from GitHub
  npx ai-agent-skills install git@example.com:user/repo.git # Install from any git URL (ssh/https)
  npx ai-agent-skills install ./my-skill                    # Install from local path
  npx ai-agent-skills install pdf --dry-run                 # Preview install
  npx ai-agent-skills list --category development
  npx ai-agent-skills list --collection my-picks
  npx ai-agent-skills list --collection build-apps
  npx ai-agent-skills search testing
  npx ai-agent-skills update --all

${colors.bold}Config:${colors.reset}
  Config file: ~/.agent-skills.json
  Set default agent: npx ai-agent-skills config --default-agent cursor

${colors.bold}More info:${colors.reset}
  https://github.com/MoizIbnYousaf/Ai-Agent-Skills
  https://github.com/MoizIbnYousaf/Ai-Agent-Skills/issues
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
  const lastVerifiedLine = skill.lastVerified
    ? `${colors.bold}Last Verified:${colors.reset} ${skill.lastVerified}\n`
    : '';

  log(`
${colors.bold}${skill.name}${colors.reset}${skill.featured ? ` ${colors.yellow}(featured)${colors.reset}` : ''}${skill.verified ? ` ${colors.green}(verified)${colors.reset}` : ''}

${colors.dim}${skill.description}${colors.reset}

${colors.bold}Work Area:${colors.reset}   ${skill.workArea ? formatWorkAreaTitle(skill.workArea) : 'n/a'}
${colors.bold}Branch:${colors.reset}      ${skill.branch || 'n/a'}
${colors.bold}Category:${colors.reset}    ${skill.category}
${colors.bold}Trust:${colors.reset}       ${getTrust(skill)}
${colors.bold}Origin:${colors.reset}      ${getOrigin(skill)}
${colors.bold}Sync Mode:${colors.reset}   ${syncMode}
${colors.bold}Tags:${colors.reset}        ${tagStr}
${colors.bold}Collections:${colors.reset} ${collectionStr}
${colors.bold}Author:${colors.reset}      ${skill.author}
${colors.bold}License:${colors.reset}     ${skill.license}
${colors.bold}Source Repo:${colors.reset} ${skill.source}
${colors.bold}Source URL:${colors.reset}  ${sourceUrl}
${lastVerifiedLine}${skill.lastUpdated ? `${colors.bold}Updated:${colors.reset}     ${skill.lastUpdated}\n` : ''}${colors.bold}Why Here:${colors.reset}    ${whyHere}

${colors.bold}Install:${colors.reset}
  npx ai-agent-skills install ${skill.name}
  npx ai-agent-skills install ${skill.name} --agent cursor
  npx ai-agent-skills install ${skill.name} --dry-run
`);
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

// ============ MAIN CLI ============

async function main() {
  const args = process.argv.slice(2);
  const { command, param, agents, explicitAgent, installed, dryRun, category, workArea, collection, tags, all } = parseArgs(args);
  const ALL_AGENTS = Object.keys(AGENT_PATHS);

  if (!command) {
    if (!isInteractiveTerminal()) {
      showHelp();
      return;
    }

    const action = await launchBrowser(agents[0]);
    if (action && action.type === 'install') {
      installSkill(action.skillName, agents[0], false);
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

      const action = await launchBrowser(agents[0]);
      if (action && action.type === 'install') {
        installSkill(action.skillName, agents[0], false);
      }
      return;
    }

    case 'list':
    case 'ls':
      if (installed) {
        for (let i = 0; i < agents.length; i++) {
          if (i > 0) log('');
          listInstalledSkills(agents[i]);
        }
      } else {
        listSkills(category, tags, collection, workArea);
      }
      return;

    case 'collections':
    case 'catalog':
      showCollections();
      return;

    case 'install':
    case 'i':
    case 'add': {
      if (!param) {
        error('Please specify a skill name, GitHub repo, or local path.');
        log('Usage: npx ai-agent-skills install <name> [--agent cursor]');
        process.exit(1);
      }
      const installTargets = explicitAgent ? agents : ALL_AGENTS;
      for (const agent of installTargets) {
        if (isLocalPath(param)) {
          await installFromLocalPath(param, agent, dryRun);
        } else if (isGitUrl(param)) {
          await installFromGitUrl(param, agent, dryRun);
        } else if (isGitHubUrl(param)) {
          await installFromGitHub(param, agent, dryRun);
        } else {
          installSkill(param, agent, dryRun);
        }
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
      for (const agent of agents) {
        uninstallSkill(param, agent, dryRun);
      }
      return;

    case 'update':
    case 'upgrade':
      if (all) {
        for (const agent of agents) {
          updateAllSkills(agent, dryRun);
        }
      } else if (!param) {
        error('Please specify a skill name or use --all.');
        log('Usage: npx ai-agent-skills update <name> [--agents claude,cursor]');
        log('       npx ai-agent-skills update --all [--agents claude,cursor]');
        process.exit(1);
      } else {
        for (const agent of agents) {
          updateSkill(param, agent, dryRun);
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
        for (const agent of agents) {
          installSkill(command, agent, dryRun);
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
