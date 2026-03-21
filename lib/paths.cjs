const os = require('os');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const SKILLS_DIR = path.join(ROOT_DIR, 'skills');
const SKILLS_JSON_PATH = path.join(ROOT_DIR, 'skills.json');
const README_PATH = path.join(ROOT_DIR, 'README.md');
const WORK_AREAS_PATH = path.join(ROOT_DIR, 'WORK_AREAS.md');
const CONFIG_FILE = path.join(os.homedir(), '.agent-skills.json');
const SKILL_META_FILE = '.skill-meta.json';
const MAX_SKILL_SIZE = 50 * 1024 * 1024;

const SCOPES = {
  global: path.join(os.homedir(), '.claude', 'skills'),
  project: path.join(process.cwd(), '.agents', 'skills'),
};

const LEGACY_AGENTS = {
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

const AGENT_PATHS = {
  claude: SCOPES.global,
  ...LEGACY_AGENTS,
};

module.exports = {
  AGENT_PATHS,
  CONFIG_FILE,
  LEGACY_AGENTS,
  MAX_SKILL_SIZE,
  README_PATH,
  ROOT_DIR,
  SCOPES,
  SKILLS_DIR,
  SKILLS_JSON_PATH,
  SKILL_META_FILE,
  WORK_AREAS_PATH,
};
