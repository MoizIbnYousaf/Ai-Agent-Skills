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
  SCOPES,
} = require('./lib/paths.cjs');
const {
  createLibraryContext,
  getBundledLibraryContext,
  isManagedWorkspaceRoot,
  resolveLibraryContext,
  readWorkspaceConfig,
} = require('./lib/library-context.cjs');
const {
  addSkillToCollections,
  addUpstreamSkillFromDiscovery,
  applyCurateChanges,
  buildReviewQueue,
  buildHouseCatalogEntry,
  buildUpstreamCatalogEntry,
  commitCatalogData,
  curateSkill,
  ensureCollectionIdsExist,
  removeSkillFromCatalog,
  normalizeListInput,
  ensureRequiredPlacement,
  addHouseSkillEntry,
  currentIsoDay,
  currentCatalogTimestamp,
} = require('./lib/catalog-mutations.cjs');
const {
  findSkillByName,
  loadCatalogData,
  normalizeSkill,
} = require('./lib/catalog-data.cjs');
const { buildDependencyGraph, resolveInstallOrder } = require('./lib/dependency-graph.cjs');
const { buildInstallStateIndex, formatInstallStateLabel, getInstallState, getInstalledSkillNames, listInstalledSkillNamesInDir } = require('./lib/install-state.cjs');
const { README_MARKERS, generatedDocsAreInSync, renderGeneratedDocs, writeGeneratedDocs } = require('./lib/render-docs.cjs');
const { parseSkillMarkdown: parseSkillMarkdownFile } = require('./lib/frontmatter.cjs');
const { readInstalledMeta, writeInstalledMeta } = require('./lib/install-metadata.cjs');
const {
  getCatalogSkillRelativePath,
  hasLocalCatalogSkillFiles,
  resolveCatalogSkillSourcePath,
  shouldTreatCatalogSkillAsHouse,
} = require('./lib/catalog-paths.cjs');
const {
  classifyImportedSkill,
  discoverImportCandidates,
} = require('./lib/workspace-import.cjs');
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

// Security posture: The agent is not a trusted operator.
// All inputs are validated, outputs are sandboxed to the working directory or
// install target, and skill content is sanitized before display. Never trust
// agent-supplied paths, identifiers, or payloads without validation.

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

const SWIFT_SHORTCUT = 'swift';
const UNIVERSAL_DEFAULT_AGENTS = ['claude', 'codex'];
const FORMAT_ENUM = ['text', 'json'];
const WORK_AREA_ENUM = ['frontend', 'backend', 'mobile', 'workflow', 'agent-engineering'];
const CATEGORY_ENUM = ['development', 'document', 'creative', 'business', 'productivity'];
const TRUST_ENUM = ['listed', 'verified'];
const TIER_ENUM = ['house', 'upstream'];
const DISTRIBUTION_ENUM = ['bundled', 'live'];
const ORIGIN_ENUM = ['authored', 'curated', 'adapted'];
const SYNC_MODE_ENUM = ['snapshot', 'live', 'authored', 'adapted'];

const FLAG_DEFINITIONS = {
  format: { type: 'enum', enum: FORMAT_ENUM, default: null, description: 'Output format.' },
  project: { type: 'boolean', alias: '-p', default: false, description: 'Target project scope.' },
  global: { type: 'boolean', alias: '-g', default: false, description: 'Target global scope.' },
  skill: { type: 'string[]', default: [], description: 'Select named skills from a source.' },
  list: { type: 'boolean', default: false, description: 'List skills without installing or mutating.' },
  yes: { type: 'boolean', alias: '-y', default: false, description: 'Skip interactive confirmation.' },
  all: { type: 'boolean', default: false, description: 'Apply to both global and project scope.' },
  dryRun: { type: 'boolean', alias: '-n', default: false, description: 'Show what would happen without changing files.' },
  noDeps: { type: 'boolean', default: false, description: 'Skip dependency expansion for catalog installs.' },
  agent: { type: 'string', alias: '-a', default: null, description: 'Legacy explicit agent target.' },
  agents: { type: 'string[]', default: [], description: 'Legacy explicit agent targets.' },
  installed: { type: 'boolean', alias: '-i', default: false, description: 'Show installed skills instead of the catalog.' },
  category: { type: 'enum', alias: '-c', enum: CATEGORY_ENUM, default: null, description: 'Filter by category.' },
  area: { type: 'string', default: null, description: 'Filter or place a skill into a work area shelf.' },
  areas: { type: 'string', default: null, description: 'Comma-separated work area ids for init-library.' },
  collection: { type: 'string', default: null, description: 'Filter or target a curated collection.' },
  removeFromCollection: { type: 'string', default: null, description: 'Remove a skill from a curated collection.' },
  tags: { type: 'string', alias: '-t', default: null, description: 'Comma-separated tags.' },
  labels: { type: 'string', default: null, description: 'Comma-separated labels.' },
  notes: { type: 'string', default: null, description: 'Curator notes.' },
  why: { type: 'string', default: null, description: 'Why the skill belongs in the library.' },
  branch: { type: 'string', default: null, description: 'Shelf branch label.' },
  trust: { type: 'enum', enum: TRUST_ENUM, default: null, description: 'Trust level.' },
  description: { type: 'string', default: null, description: 'Skill description override.' },
  lastVerified: { type: 'string', default: null, description: 'Last verification date.' },
  feature: { type: 'boolean', default: false, description: 'Mark a skill as featured.' },
  unfeature: { type: 'boolean', default: false, description: 'Remove featured state.' },
  verify: { type: 'boolean', default: false, description: 'Mark a skill as verified.' },
  clearVerified: { type: 'boolean', default: false, description: 'Clear verified state.' },
  remove: { type: 'boolean', default: false, description: 'Remove a skill from the catalog.' },
  json: { type: 'boolean', default: false, description: 'Help/describe: emit schema JSON. Mutations: read a JSON payload from stdin.' },
  fields: { type: 'string', default: null, description: 'Comma-separated field mask for JSON read output.' },
  limit: { type: 'integer', default: null, description: 'Limit JSON read results.' },
  offset: { type: 'integer', default: null, description: 'Offset JSON read results.' },
  import: { type: 'boolean', default: false, description: 'Import discovered skills into a workspace.' },
  autoClassify: { type: 'boolean', default: false, description: 'Attempt heuristic work area assignment during import.' },
};

const COMMAND_REGISTRY = {
  browse: {
    aliases: ['b'],
    summary: 'Browse the library in the terminal.',
    args: [],
    flags: ['project', 'global', 'agent', 'format'],
  },
  [SWIFT_SHORTCUT]: {
    aliases: [],
    summary: 'Install the curated Swift hub.',
    args: [],
    flags: ['project', 'global', 'all', 'list', 'dryRun', 'format'],
  },
  list: {
    aliases: ['ls'],
    summary: 'List catalog skills.',
    args: [],
    flags: ['installed', 'category', 'tags', 'collection', 'area', 'project', 'global', 'fields', 'limit', 'offset', 'format'],
  },
  collections: {
    aliases: [],
    summary: 'Browse curated collections.',
    args: [],
    flags: ['fields', 'limit', 'offset', 'format'],
  },
  install: {
    aliases: ['i'],
    summary: 'Install skills from the library or an external source.',
    args: [{ name: 'source', required: false, type: 'string' }],
    flags: ['project', 'global', 'collection', 'skill', 'list', 'yes', 'all', 'dryRun', 'noDeps', 'agent', 'agents', 'fields', 'limit', 'offset', 'format'],
  },
  add: {
    aliases: [],
    summary: 'Add a bundled pick, upstream repo skill, or house copy to a workspace.',
    args: [{ name: 'source', required: true, type: 'string' }],
    flags: ['list', 'skill', 'area', 'branch', 'category', 'tags', 'labels', 'notes', 'trust', 'why', 'description', 'collection', 'lastVerified', 'feature', 'clearVerified', 'remove', 'dryRun', 'json', 'format'],
  },
  uninstall: {
    aliases: ['remove', 'rm'],
    summary: 'Remove an installed skill.',
    args: [{ name: 'name', required: true, type: 'string' }],
    flags: ['project', 'global', 'agent', 'agents', 'dryRun', 'json', 'format'],
  },
  sync: {
    aliases: ['update', 'upgrade'],
    summary: 'Refresh installed skills.',
    args: [{ name: 'name', required: false, type: 'string' }],
    flags: ['all', 'project', 'global', 'agent', 'agents', 'dryRun', 'format'],
  },
  search: {
    aliases: ['s', 'find'],
    summary: 'Search the catalog.',
    args: [{ name: 'query', required: true, type: 'string' }],
    flags: ['category', 'collection', 'area', 'fields', 'limit', 'offset', 'format'],
  },
  info: {
    aliases: ['show'],
    summary: 'Show skill details and provenance.',
    args: [{ name: 'name', required: true, type: 'string' }],
    flags: ['fields', 'format'],
  },
  preview: {
    aliases: [],
    summary: 'Preview a skill body or upstream summary.',
    args: [{ name: 'name', required: true, type: 'string' }],
    flags: ['fields', 'format'],
  },
  catalog: {
    aliases: [],
    summary: 'Add upstream skills to the catalog without vendoring files.',
    args: [{ name: 'repo', required: true, type: 'string' }],
    flags: ['list', 'skill', 'area', 'branch', 'category', 'tags', 'labels', 'notes', 'trust', 'why', 'description', 'collection', 'dryRun', 'json', 'format'],
  },
  curate: {
    aliases: [],
    summary: 'Edit catalog metadata and placement.',
    args: [{ name: 'name', required: true, type: 'string' }],
    flags: ['area', 'branch', 'category', 'tags', 'labels', 'notes', 'trust', 'why', 'description', 'collection', 'removeFromCollection', 'feature', 'unfeature', 'verify', 'clearVerified', 'remove', 'yes', 'dryRun', 'json', 'format'],
  },
  vendor: {
    aliases: [],
    summary: 'Create a house copy from an explicit source.',
    args: [{ name: 'source', required: true, type: 'string' }],
    flags: ['list', 'skill', 'area', 'branch', 'category', 'tags', 'labels', 'notes', 'trust', 'why', 'description', 'collection', 'lastVerified', 'feature', 'clearVerified', 'remove', 'dryRun', 'json', 'format'],
  },
  check: {
    aliases: [],
    summary: 'Check installed skills for potential updates.',
    args: [],
    flags: ['project', 'global', 'format'],
  },
  doctor: {
    aliases: [],
    summary: 'Diagnose install issues.',
    args: [],
    flags: ['agent', 'agents', 'format'],
  },
  validate: {
    aliases: [],
    summary: 'Validate a skill directory.',
    args: [{ name: 'path', required: false, type: 'string' }],
    flags: ['format'],
  },
  init: {
    aliases: [],
    summary: 'Create a new SKILL.md template.',
    args: [{ name: 'name', required: false, type: 'string' }],
    flags: ['dryRun', 'format'],
  },
  'init-library': {
    aliases: [],
    summary: 'Create a managed library workspace.',
    args: [{ name: 'name', required: true, type: 'string' }],
    flags: ['areas', 'import', 'autoClassify', 'dryRun', 'json', 'format'],
  },
  import: {
    aliases: [],
    summary: 'Import local skills into the active managed workspace.',
    args: [{ name: 'path', required: false, type: 'string' }],
    flags: ['autoClassify', 'dryRun', 'format'],
  },
  'build-docs': {
    aliases: [],
    summary: 'Regenerate README.md and WORK_AREAS.md in a workspace.',
    args: [],
    flags: ['dryRun', 'format'],
  },
  config: {
    aliases: [],
    summary: 'Manage CLI settings.',
    args: [],
    flags: ['format'],
  },
  help: {
    aliases: ['--help', '-h'],
    summary: 'Show CLI help.',
    args: [{ name: 'command', required: false, type: 'string' }],
    flags: ['format', 'json'],
  },
  describe: {
    aliases: [],
    summary: 'Show machine-readable schema for one command.',
    args: [{ name: 'command', required: true, type: 'string' }],
    flags: ['format', 'json'],
  },
  version: {
    aliases: ['--version', '-v'],
    summary: 'Show CLI version.',
    args: [],
    flags: ['format'],
  },
};

const COMMAND_ALIAS_MAP = Object.entries(COMMAND_REGISTRY).reduce((map, [name, definition]) => {
  map.set(name, name);
  for (const alias of definition.aliases || []) {
    map.set(alias, name);
  }
  return map;
}, new Map());

function resolveCommandAlias(command) {
  return COMMAND_ALIAS_MAP.get(command) || command;
}

function getCommandDefinition(command) {
  const canonical = resolveCommandAlias(command);
  return COMMAND_REGISTRY[canonical] || null;
}

function getFlagSchema(flagName) {
  const definition = FLAG_DEFINITIONS[flagName];
  if (!definition) return null;
  return {
    name: flagName,
    ...definition,
  };
}

function stringSchema(description = null, extra = {}) {
  return {
    type: 'string',
    ...(description ? { description } : {}),
    ...extra,
  };
}

function booleanSchema(description = null, extra = {}) {
  return {
    type: 'boolean',
    ...(description ? { description } : {}),
    ...extra,
  };
}

function integerSchema(description = null, extra = {}) {
  return {
    type: 'integer',
    ...(description ? { description } : {}),
    ...extra,
  };
}

function enumSchema(values, description = null, extra = {}) {
  return {
    type: 'string',
    enum: values,
    ...(description ? { description } : {}),
    ...extra,
  };
}

function arraySchema(items, description = null, extra = {}) {
  return {
    type: 'array',
    items,
    ...(description ? { description } : {}),
    ...extra,
  };
}

function objectSchema(properties, required = [], description = null, extra = {}) {
  return {
    type: 'object',
    properties,
    required,
    additionalProperties: false,
    ...(description ? { description } : {}),
    ...extra,
  };
}

function oneOfSchema(variants, description = null, extra = {}) {
  return {
    oneOf: variants,
    ...(description ? { description } : {}),
    ...extra,
  };
}

function nullableSchema(schema) {
  return {
    ...schema,
    nullable: true,
  };
}

function buildEnvelopeSchema(commandName, dataSchema, description = null) {
  return {
    format: 'json-envelope',
    schema: objectSchema({
      command: stringSchema('Resolved command name.', { const: resolveCommandAlias(commandName) }),
      status: enumSchema(['ok', 'error'], 'Command status.'),
      data: dataSchema,
      errors: arraySchema(
        objectSchema({
          code: stringSchema('Stable machine-readable error code.'),
          message: stringSchema('Human-readable error message.'),
          hint: nullableSchema(stringSchema('Optional recovery hint.')),
        }, ['code', 'message']),
        'Structured errors.'
      ),
    }, ['command', 'status', 'data', 'errors'], description),
  };
}

function buildNdjsonSchema(commandName, summarySchema, itemSchema, description = null, extraKinds = {}) {
  return {
    format: 'ndjson',
    stream: true,
    recordSchema: objectSchema({
      command: stringSchema('Resolved command name.', { const: resolveCommandAlias(commandName) }),
      status: enumSchema(['ok', 'error'], 'Command status.'),
      data: objectSchema({
        kind: stringSchema('Record type discriminator.'),
      }, ['kind'], 'Per-record payload.'),
      errors: arraySchema(
        objectSchema({
          code: stringSchema('Stable machine-readable error code.'),
          message: stringSchema('Human-readable error message.'),
          hint: nullableSchema(stringSchema('Optional recovery hint.')),
        }, ['code', 'message'])
      ),
    }, ['command', 'status', 'data', 'errors'], description),
    records: {
      summary: summarySchema,
      item: itemSchema,
      ...extraKinds,
    },
  };
}

const STRING_OR_STRING_ARRAY_SCHEMA = oneOfSchema([
  stringSchema('Comma-separated string form.'),
  arraySchema(stringSchema('Individual value.'), 'Array form.'),
], 'Accepts either a comma-separated string or an array of strings.');

const COLLECTION_INPUT_SCHEMA = oneOfSchema([
  stringSchema('Collection id.'),
  arraySchema(stringSchema('Collection id.'), 'Collection ids.'),
], 'Accepts one collection id or an array of collection ids.');

const WORK_AREA_INPUT_SCHEMA = oneOfSchema([
  stringSchema('Work area id.'),
  objectSchema({
    id: stringSchema('Work area id.'),
    title: stringSchema('Display title.'),
    description: stringSchema('Optional description.'),
  }, ['id']),
], 'Accepts a work area id or a full work area object.');

const STARTER_COLLECTION_INPUT_SCHEMA = oneOfSchema([
  stringSchema('Collection id.'),
  objectSchema({
    id: stringSchema('Collection id.'),
    title: stringSchema('Display title.'),
    description: stringSchema('Optional description.'),
    skills: arraySchema(stringSchema('Skill name.'), 'Optional starter skill ids.'),
  }, ['id']),
], 'Accepts a collection id or a full collection object.');

const SERIALIZED_SKILL_SCHEMA = objectSchema({
  name: stringSchema('Skill name.'),
  description: stringSchema('Skill description after sanitization.'),
  workArea: nullableSchema(stringSchema('Work area id.')),
  branch: nullableSchema(stringSchema('Branch label.')),
  category: nullableSchema(stringSchema('Category id.')),
  tier: enumSchema(TIER_ENUM, 'Catalog tier.'),
  distribution: enumSchema(DISTRIBUTION_ENUM, 'Distribution mode.'),
  source: nullableSchema(stringSchema('Source repo or source reference.')),
  installSource: nullableSchema(stringSchema('Install source reference.')),
  trust: nullableSchema(stringSchema('Trust level.')),
  origin: nullableSchema(stringSchema('Origin label.')),
  featured: booleanSchema('Featured flag.'),
  verified: booleanSchema('Verified flag.'),
  tags: arraySchema(stringSchema('Tag.')),
  collections: arraySchema(stringSchema('Collection id.')),
  installState: nullableSchema(stringSchema('Install state label.')),
  whyHere: stringSchema('Curator note after sanitization.'),
}, ['name', 'description', 'tier', 'distribution', 'featured', 'verified', 'tags', 'collections', 'whyHere']);

function buildMutationStdinSchema(commandName) {
  if (commandName === 'init-library') {
    return objectSchema({
      name: stringSchema('Library name.'),
      workAreas: arraySchema(WORK_AREA_INPUT_SCHEMA, 'Optional custom starter work areas.'),
      collections: arraySchema(STARTER_COLLECTION_INPUT_SCHEMA, 'Optional starter collections.'),
      import: booleanSchema('Import discovered skills immediately after bootstrap.'),
      autoClassify: booleanSchema('Attempt heuristic work area assignment during import.'),
      dryRun: booleanSchema('Preview without writing files.'),
    }, ['name'], 'Read from stdin when `--json` is passed.');
  }

  if (commandName === 'uninstall') {
    return objectSchema({
      name: stringSchema('Installed skill name to remove.'),
      dryRun: booleanSchema('Preview without deleting files.'),
    }, ['name'], 'Read from stdin when `--json` is passed.');
  }

  if (commandName === 'curate') {
    return objectSchema({
      name: stringSchema('Catalog skill name to edit.'),
      workArea: stringSchema('Work area shelf id.'),
      branch: stringSchema('Branch label.'),
      category: enumSchema(CATEGORY_ENUM, 'Category id.'),
      tags: STRING_OR_STRING_ARRAY_SCHEMA,
      labels: STRING_OR_STRING_ARRAY_SCHEMA,
      notes: stringSchema('Curator notes.'),
      trust: enumSchema(TRUST_ENUM, 'Trust level.'),
      whyHere: stringSchema('Why the skill belongs in the library.'),
      description: stringSchema('Description override.'),
      collections: COLLECTION_INPUT_SCHEMA,
      removeFromCollection: stringSchema('Collection id to remove membership from.'),
      featured: booleanSchema('Mark as featured.'),
      clearVerified: booleanSchema('Clear verified flag.'),
      remove: booleanSchema('Remove the skill from the catalog.'),
      yes: booleanSchema('Skip confirmation for destructive actions.'),
      dryRun: booleanSchema('Preview the edit without writing files.'),
    }, ['name'], 'Read from stdin when `--json` is passed.');
  }

  if (commandName === 'add' || commandName === 'catalog' || commandName === 'vendor') {
    return objectSchema({
      source: stringSchema(commandName === 'add'
        ? 'Bundled skill name, GitHub repo, git URL, or local path.'
        : 'GitHub repo, git URL, or local path.'),
      name: stringSchema('Skill name or fallback selector when the source is a bundled catalog entry.'),
      skill: stringSchema('Explicit discovered skill name inside the source.'),
      list: booleanSchema('List discovered skills without mutating the workspace.'),
      workArea: stringSchema('Work area shelf id from skills.json.'),
      branch: stringSchema('Branch label from skills.json.'),
      category: enumSchema(CATEGORY_ENUM, 'Category id from skills.json.'),
      tags: STRING_OR_STRING_ARRAY_SCHEMA,
      labels: STRING_OR_STRING_ARRAY_SCHEMA,
      notes: stringSchema('Curator notes.'),
      trust: enumSchema(TRUST_ENUM, 'Trust level.'),
      whyHere: stringSchema('Curator note stored as `whyHere` in skills.json.'),
      description: stringSchema('Description override stored in skills.json.'),
      collections: COLLECTION_INPUT_SCHEMA,
      lastVerified: stringSchema('Last verification date.'),
      featured: booleanSchema('Mark as featured.'),
      clearVerified: booleanSchema('Clear verified flag.'),
      remove: booleanSchema('Remove the matching catalog entry.'),
      ref: stringSchema('Optional Git ref for upstream sources.'),
      dryRun: booleanSchema('Preview the mutation without writing files.'),
    }, commandName === 'add' ? [] : ['source'], 'Read from stdin when `--json` is passed. Field names match the editable skills.json entry shape.');
  }

  return null;
}

function buildCommandInputSchema(commandName) {
  const stdin = buildMutationStdinSchema(commandName);
  return {
    stdin,
  };
}

const IMPORT_RESULT_SCHEMA = objectSchema({
  rootDir: stringSchema('Import root directory.'),
  importedCount: integerSchema('Imported skills.'),
  copiedCount: integerSchema('Copied skills.'),
  inPlaceCount: integerSchema('In-place imported skills.'),
  autoClassifiedCount: integerSchema('Auto-classified skills.'),
  needsCurationCount: integerSchema('Skills still needing manual review.'),
  skippedCount: integerSchema('Skipped candidates.'),
  failedCount: integerSchema('Failed candidates.'),
  imported: arraySchema(objectSchema({
    name: stringSchema('Skill name.'),
    path: stringSchema('Catalog path.'),
    workArea: stringSchema('Assigned work area.'),
    copied: booleanSchema('Whether files were copied into the workspace.'),
    autoClassified: booleanSchema('Whether work area was inferred heuristically.'),
    needsCuration: booleanSchema('Whether the skill should be reviewed manually.'),
  }, ['name', 'path', 'workArea', 'copied', 'autoClassified', 'needsCuration'])),
  skipped: arraySchema(objectSchema({
    name: nullableSchema(stringSchema('Skill name.')),
    path: stringSchema('Original path.'),
    reason: stringSchema('Skip reason.'),
  }, ['path', 'reason'])),
  failures: arraySchema(objectSchema({
    path: stringSchema('Original path.'),
    reason: stringSchema('Failure reason.'),
  }, ['path', 'reason'])),
}, ['rootDir', 'importedCount', 'copiedCount', 'inPlaceCount', 'autoClassifiedCount', 'needsCurationCount', 'skippedCount', 'failedCount', 'imported', 'skipped', 'failures']);

function buildCommandOutputSchema(commandName) {
  if (commandName === 'list') {
    return buildNdjsonSchema(
      'list',
      objectSchema({
        kind: enumSchema(['summary']),
        total: integerSchema('Total matching skills.'),
        returned: integerSchema('Returned skills after pagination.'),
        limit: nullableSchema(integerSchema('Requested page size.')),
        offset: integerSchema('Requested offset.'),
        fields: arraySchema(stringSchema('Requested field.')),
        filters: objectSchema({
          category: nullableSchema(stringSchema('Category filter.')),
          tags: nullableSchema(stringSchema('Tags filter.')),
          collection: nullableSchema(stringSchema('Collection filter.')),
          workArea: nullableSchema(stringSchema('Work area filter.')),
        }, []),
        collection: nullableSchema(objectSchema({
          id: stringSchema('Collection id.'),
          title: stringSchema('Collection title.'),
          description: stringSchema('Collection description.'),
        }, ['id', 'title', 'description'])),
      }, ['kind', 'total', 'returned', 'offset', 'fields', 'filters', 'collection']),
      objectSchema({
        kind: enumSchema(['item']),
        skill: SERIALIZED_SKILL_SCHEMA,
      }, ['kind', 'skill']),
      'One record per line in JSON mode.'
    );
  }

  if (commandName === 'search') {
    return buildNdjsonSchema(
      'search',
      objectSchema({
        kind: enumSchema(['summary']),
        query: stringSchema('Search query.'),
        total: integerSchema('Total matching skills.'),
        returned: integerSchema('Returned skills after pagination.'),
        limit: nullableSchema(integerSchema('Requested page size.')),
        offset: integerSchema('Requested offset.'),
        fields: arraySchema(stringSchema('Requested field.')),
        filters: objectSchema({
          category: nullableSchema(stringSchema('Category filter.')),
          collection: nullableSchema(stringSchema('Collection filter.')),
          workArea: nullableSchema(stringSchema('Work area filter.')),
        }, []),
        suggestions: arraySchema(stringSchema('Fuzzy suggestion.')),
      }, ['kind', 'query', 'total', 'returned', 'offset', 'fields', 'filters', 'suggestions']),
      objectSchema({
        kind: enumSchema(['item']),
        skill: SERIALIZED_SKILL_SCHEMA,
      }, ['kind', 'skill']),
      'One record per line in JSON mode.'
    );
  }

  if (commandName === 'collections') {
    return buildNdjsonSchema(
      'collections',
      objectSchema({
        kind: enumSchema(['summary']),
        total: integerSchema('Total collections.'),
      }, ['kind', 'total']),
      objectSchema({
        kind: enumSchema(['item']),
        collection: objectSchema({
          id: stringSchema('Collection id.'),
          title: stringSchema('Collection title.'),
          description: stringSchema('Collection description.'),
          skillCount: integerSchema('Number of skills in the collection.'),
          installedCount: integerSchema('Installed skills in the collection.'),
          startHere: arraySchema(stringSchema('Recommended first skill.')),
          skills: arraySchema(stringSchema('Skill name.')),
        }, ['id', 'title', 'description', 'skillCount', 'installedCount', 'startHere', 'skills']),
      }, ['kind', 'collection']),
      'One record per line in JSON mode.'
    );
  }

  if (commandName === 'info') {
    return buildEnvelopeSchema(
      'info',
      objectSchema({
        name: stringSchema('Requested skill name.'),
        description: stringSchema('Skill description.'),
        fields: arraySchema(stringSchema('Requested top-level field.'), 'Present only when `--fields` is used.', { nullable: true }),
        skill: objectSchema({
          ...SERIALIZED_SKILL_SCHEMA.properties,
          sourceUrl: nullableSchema(stringSchema('Canonical source URL.')),
          syncMode: stringSchema('Sync mode.'),
          author: nullableSchema(stringSchema('Author.')),
          license: nullableSchema(stringSchema('License.')),
          labels: arraySchema(stringSchema('Label.')),
          notes: stringSchema('Curator notes.'),
          lastVerified: nullableSchema(stringSchema('Last verification date.')),
          lastUpdated: nullableSchema(stringSchema('Last updated date.')),
        }, ['syncMode', 'labels', 'notes']),
        collections: arraySchema(objectSchema({
          id: stringSchema('Collection id.'),
          title: stringSchema('Collection title.'),
        }, ['id', 'title'])),
        dependencies: objectSchema({
          dependsOn: arraySchema(stringSchema('Dependency skill.')),
          usedBy: arraySchema(stringSchema('Reverse dependency skill.')),
        }, ['dependsOn', 'usedBy']),
        neighboringShelfPicks: arraySchema(stringSchema('Nearby recommendation.')),
        installCommands: arraySchema(stringSchema('Ready-to-run install command.')),
      }, ['name', 'description', 'skill', 'collections', 'dependencies', 'neighboringShelfPicks', 'installCommands'])
    );
  }

  if (commandName === 'preview') {
    return buildEnvelopeSchema(
      'preview',
      objectSchema({
        name: stringSchema('Skill name.'),
        sourceType: enumSchema(['house', 'upstream'], 'Preview source type.'),
        path: nullableSchema(stringSchema('Local SKILL.md path for house copies.')),
        installSource: nullableSchema(stringSchema('Install source for upstream skills.')),
        content: nullableSchema(stringSchema('Sanitized preview body.')),
        sanitized: booleanSchema('Whether suspicious content was stripped.'),
      }, ['name', 'sourceType', 'content', 'sanitized'])
    );
  }

  if (commandName === 'install') {
    return {
      variants: [
        buildEnvelopeSchema('install', objectSchema({
          messages: arraySchema(objectSchema({
            level: stringSchema('Captured log level.'),
            message: stringSchema('Captured message.'),
          }, ['level', 'message'])),
        }, ['messages']), 'Default JSON envelope in non-streaming install flows.'),
        buildNdjsonSchema(
          'install',
          objectSchema({
            kind: enumSchema(['summary', 'plan']),
            source: nullableSchema(stringSchema('Remote workspace source when listing.')),
            total: nullableSchema(integerSchema('Total discovered skills when listing.')),
            requested: nullableSchema(integerSchema('Requested skills in a plan.')),
            resolved: nullableSchema(integerSchema('Resolved skills in a plan.')),
            targets: arraySchema(stringSchema('Install target path.'), 'Present for plan rows.', { nullable: true }),
          }, ['kind']),
          objectSchema({
            kind: enumSchema(['item', 'install']),
            skill: objectSchema({
              name: stringSchema('Skill name.'),
              tier: enumSchema(TIER_ENUM, 'Skill tier.'),
              workArea: nullableSchema(stringSchema('Work area when listing.')),
              branch: nullableSchema(stringSchema('Branch when listing.')),
              whyHere: nullableSchema(stringSchema('Curator note when listing.')),
              source: nullableSchema(stringSchema('Resolved source reference when planning.')),
            }, ['name', 'tier']),
          }, ['kind', 'skill']),
          'Streamed rows for remote workspace listing and parseable install plans.'
        ),
      ],
    };
  }

  if (commandName === 'help' || commandName === 'describe') {
    return buildEnvelopeSchema(
      commandName,
      objectSchema({
        binary: stringSchema('CLI binary name.'),
        version: stringSchema('CLI version.'),
        defaults: objectSchema({
          interactiveOutput: stringSchema('TTY default output format.'),
          nonTtyOutput: stringSchema('Non-TTY default output format.'),
        }, ['interactiveOutput', 'nonTtyOutput']),
        sharedEnums: objectSchema({
          format: arraySchema(stringSchema('Format value.')),
          workArea: arraySchema(stringSchema('Work area enum.')),
          category: arraySchema(stringSchema('Category enum.')),
          trust: arraySchema(stringSchema('Trust enum.')),
          tier: arraySchema(stringSchema('Tier enum.')),
          distribution: arraySchema(stringSchema('Distribution enum.')),
          origin: arraySchema(stringSchema('Origin enum.')),
          syncMode: arraySchema(stringSchema('Sync mode enum.')),
        }, ['format', 'workArea', 'category', 'trust', 'tier', 'distribution', 'origin', 'syncMode']),
        globalFlags: arraySchema(objectSchema({
          name: stringSchema('Flag name.'),
          type: stringSchema('Flag type.'),
        }, ['name', 'type'])),
        commands: arraySchema(objectSchema({
          name: stringSchema('Command name.'),
          summary: stringSchema('Command summary.'),
          inputSchema: objectSchema({
            stdin: nullableSchema(objectSchema({}, [])),
          }, []),
          outputSchema: objectSchema({}, []),
        }, ['name', 'summary', 'inputSchema', 'outputSchema']), 'Command schemas.'),
      }, ['binary', 'version', 'defaults', 'sharedEnums', 'globalFlags', 'commands'])
    );
  }

  if (commandName === 'init-library') {
    return {
      variants: [
        buildEnvelopeSchema('init-library', objectSchema({
          libraryName: stringSchema('Library name.'),
          librarySlug: stringSchema('Slugified directory name.'),
          targetDir: stringSchema('Workspace directory.'),
          files: objectSchema({
            config: stringSchema('Workspace config path.'),
            readme: stringSchema('README path.'),
            skillsJson: stringSchema('skills.json path.'),
            workAreas: stringSchema('WORK_AREAS.md path.'),
          }, ['config', 'readme', 'skillsJson', 'workAreas']),
          workAreas: arraySchema(stringSchema('Seeded work area id.')),
          import: nullableSchema(objectSchema({
            rootDir: stringSchema('Import root.'),
            discovered: integerSchema('Discovered skills.'),
            skipped: integerSchema('Skipped skills.'),
            failed: integerSchema('Failed candidates.'),
          }, ['rootDir', 'discovered', 'skipped', 'failed'])),
        }, ['libraryName', 'librarySlug', 'targetDir', 'files', 'workAreas'])),
        buildEnvelopeSchema('init-library', IMPORT_RESULT_SCHEMA, 'Returned when `init-library` chains directly into `--import`.'),
        buildEnvelopeSchema('init-library', objectSchema({
          dryRun: booleanSchema('Always true in this variant.', { const: true }),
          actions: arraySchema(objectSchema({
            type: stringSchema('Planned action type.'),
            target: stringSchema('Human-readable target.'),
            detail: nullableSchema(stringSchema('Action detail.')),
          }, ['type', 'target'])),
        }, ['dryRun', 'actions']), 'Dry-run response variant.'),
      ],
    };
  }

  if (commandName === 'import') {
    return buildEnvelopeSchema('import', IMPORT_RESULT_SCHEMA);
  }

  if (commandName === 'check') {
    return buildEnvelopeSchema('check', objectSchema({
      checked: integerSchema('Installed skills checked.'),
      updatesAvailable: integerSchema('Potential updates found.'),
      results: arraySchema(objectSchema({
        scope: stringSchema('Install scope.'),
        name: stringSchema('Skill name.'),
        status: stringSchema('Check result status.'),
        detail: stringSchema('Human-readable detail.'),
        sourceType: nullableSchema(stringSchema('Recorded source type.')),
      }, ['scope', 'name', 'status', 'detail', 'sourceType'])),
    }, ['checked', 'updatesAvailable', 'results']));
  }

  if (commandName === 'doctor') {
    return buildEnvelopeSchema('doctor', objectSchema({
      checks: arraySchema(objectSchema({
        name: stringSchema('Check name.'),
        ok: booleanSchema('Pass/fail.'),
        detail: stringSchema('Check detail.'),
      }, ['name', 'ok', 'detail'])),
      summary: objectSchema({
        passed: integerSchema('Passed checks.'),
        failed: integerSchema('Failed checks.'),
      }, ['passed', 'failed']),
    }, ['checks', 'summary']));
  }

  if (commandName === 'validate') {
    return buildEnvelopeSchema('validate', objectSchema({
      ok: booleanSchema('Validation result.'),
      summary: objectSchema({
        name: stringSchema('Skill name.'),
      }, ['name']),
      warnings: arraySchema(stringSchema('Validation warning.')),
    }, ['ok', 'summary', 'warnings']));
  }

  if (commandName === 'build-docs') {
    return buildEnvelopeSchema('build-docs', objectSchema({
      readmePath: stringSchema('README path.'),
      workAreasPath: stringSchema('WORK_AREAS.md path.'),
    }, ['readmePath', 'workAreasPath']));
  }

  if (commandName === 'config') {
    return buildEnvelopeSchema('config', objectSchema({
      path: stringSchema('Resolved config path.'),
      config: objectSchema({}, []),
    }, ['path', 'config']));
  }

  if (commandName === 'version') {
    return buildEnvelopeSchema('version', objectSchema({
      version: stringSchema('CLI version.'),
    }, ['version']));
  }

  if (['add', 'catalog', 'vendor', 'curate', 'uninstall', 'sync', 'browse', 'swift', 'init'].includes(commandName)) {
    return {
      variants: [
        buildEnvelopeSchema(commandName, objectSchema({
          messages: arraySchema(objectSchema({
            level: stringSchema('Captured log level.'),
            message: stringSchema('Captured message.'),
          }, ['level', 'message'])),
        }, ['messages'])),
        buildEnvelopeSchema(commandName, objectSchema({
          dryRun: booleanSchema('Always true in this variant.', { const: true }),
          actions: arraySchema(objectSchema({
            type: stringSchema('Planned action type.'),
            target: stringSchema('Human-readable target.'),
            detail: nullableSchema(stringSchema('Action detail.')),
          }, ['type', 'target'])),
        }, ['dryRun', 'actions']), 'Dry-run response variant when supported.'),
      ],
    };
  }

  return buildEnvelopeSchema(commandName, objectSchema({
    messages: arraySchema(objectSchema({
      level: stringSchema('Captured log level.'),
      message: stringSchema('Captured message.'),
    }, ['level', 'message'])),
  }, ['messages']));
}

function getCommandSchema(command) {
  const canonical = resolveCommandAlias(command);
  const definition = getCommandDefinition(canonical);
  if (!definition) return null;

  return {
    name: canonical,
    aliases: definition.aliases || [],
    summary: definition.summary,
    args: definition.args || [],
    flags: (definition.flags || [])
      .map((flagName) => getFlagSchema(flagName))
      .filter(Boolean),
    inputSchema: buildCommandInputSchema(canonical),
    outputSchema: buildCommandOutputSchema(canonical),
  };
}

function buildHelpSchema(command = null) {
  const pkg = require('./package.json');
  const selected = command ? resolveCommandAlias(command) : null;
  const commandSchema = selected ? getCommandSchema(selected) : null;

  return {
    binary: 'ai-agent-skills',
    version: pkg.version,
    defaults: {
      interactiveOutput: 'text',
      nonTtyOutput: 'json',
    },
    sharedEnums: {
      format: FORMAT_ENUM,
      workArea: WORK_AREA_ENUM,
      category: CATEGORY_ENUM,
      trust: TRUST_ENUM,
      tier: TIER_ENUM,
      distribution: DISTRIBUTION_ENUM,
      origin: ORIGIN_ENUM,
      syncMode: SYNC_MODE_ENUM,
    },
    globalFlags: ['format', 'json', 'project', 'global', 'agent', 'agents', 'dryRun']
      .map((flagName) => getFlagSchema(flagName))
      .filter(Boolean),
    commands: commandSchema
      ? [commandSchema]
      : Object.keys(COMMAND_REGISTRY).map((name) => getCommandSchema(name)),
  };
}

function emitSchemaHelp(command = null) {
  const schema = buildHelpSchema(command);
  emitJsonEnvelope('help', schema);
}

const ANSI_PATTERN = /\x1b\[[0-9;]*m/g;
let OUTPUT_STATE = {
  format: 'text',
  explicitFormat: false,
  command: null,
  emitted: false,
  data: null,
  messages: [],
  errors: [],
};

function stripAnsi(value) {
  return String(value == null ? '' : value).replace(ANSI_PATTERN, '');
}

function resolveOutputFormat(parsed = {}) {
  if (!parsed.format) return process.stdout.isTTY ? 'text' : 'json';
  if (!FORMAT_ENUM.includes(parsed.format)) {
    throw new Error(`Invalid format "${parsed.format}". Expected one of: ${FORMAT_ENUM.join(', ')}`);
  }
  return parsed.format;
}

function resetOutputState(format = 'text', command = null, explicitFormat = false) {
  OUTPUT_STATE = {
    format,
    explicitFormat,
    command,
    emitted: false,
    data: null,
    messages: [],
    errors: [],
  };
}

function isJsonOutput() {
  return OUTPUT_STATE.format === 'json';
}

function captureMessage(level, value) {
  const message = stripAnsi(value);
  OUTPUT_STATE.messages.push({ level, message });
  if (level === 'error') {
    OUTPUT_STATE.errors.push({ code: 'ERROR', message, hint: null });
  }
}

function log(msg) {
  if (isJsonOutput()) {
    captureMessage('log', msg);
    return;
  }
  console.log(msg);
}

function success(msg) {
  if (isJsonOutput()) {
    captureMessage('success', msg);
    return;
  }
  console.log(`${colors.green}${colors.bold}${msg}${colors.reset}`);
}

function info(msg) {
  if (isJsonOutput()) {
    captureMessage('info', msg);
    return;
  }
  console.log(`${colors.cyan}${msg}${colors.reset}`);
}

function warn(msg) {
  if (isJsonOutput()) {
    captureMessage('warn', msg);
    return;
  }
  console.log(`${colors.yellow}${msg}${colors.reset}`);
}

function error(msg) {
  if (isJsonOutput()) {
    captureMessage('error', msg);
    return;
  }
  console.log(`${colors.red}${msg}${colors.reset}`);
}

function setJsonResultData(data) {
  OUTPUT_STATE.data = data;
}

function emitJsonEnvelope(command, data = null, errors = null, options = {}) {
  const payload = {
    command: resolveCommandAlias(command || OUTPUT_STATE.command || 'help'),
    status: options.status || (process.exitCode ? 'error' : 'ok'),
    data: data != null ? data : (OUTPUT_STATE.data != null ? OUTPUT_STATE.data : { messages: OUTPUT_STATE.messages }),
    errors: errors != null ? errors : OUTPUT_STATE.errors,
  };
  console.log(JSON.stringify(payload, null, 2));
  OUTPUT_STATE.emitted = true;
}

function emitJsonRecord(command, data = null, errors = null, options = {}) {
  const payload = {
    command: resolveCommandAlias(command || OUTPUT_STATE.command || 'help'),
    status: options.status || (process.exitCode ? 'error' : 'ok'),
    data: data != null ? data : null,
    errors: errors != null ? errors : [],
  };
  console.log(JSON.stringify(payload));
  OUTPUT_STATE.emitted = true;
}

function finalizeJsonOutput() {
  if (!isJsonOutput() || OUTPUT_STATE.emitted) return;
  emitJsonEnvelope(OUTPUT_STATE.command);
}

function isMachineReadableOutput() {
  return isJsonOutput() || (!process.stdout.isTTY && !OUTPUT_STATE.explicitFormat);
}

function sanitizeMachineField(value) {
  return String(value == null ? '' : value)
    .replace(/\t/g, ' ')
    .replace(/\r?\n/g, ' ')
    .trim();
}

function emitMachineLine(kind, fields = []) {
  log([kind, ...fields.map(sanitizeMachineField)].join('\t'));
}

function emitActionableError(message, hint = '', options = {}) {
  if (isJsonOutput()) {
    OUTPUT_STATE.errors.push({
      code: options.code || 'ERROR',
      message: stripAnsi(message),
      hint: hint ? stripAnsi(hint) : null,
    });
    return;
  }

  if (options.machine || isMachineReadableOutput()) {
    emitMachineLine('ERROR', [options.code || 'ERROR', message]);
    if (hint) {
      emitMachineLine('HINT', [hint]);
    }
    return;
  }

  error(message);
  if (hint) {
    log(`${colors.dim}${hint}${colors.reset}`);
  }
}

function emitDryRunResult(command, actions = [], extra = {}) {
  if (isJsonOutput()) {
    setJsonResultData({
      dryRun: true,
      actions,
      ...extra,
    });
    return;
  }

  log(`\n${colors.bold}Dry Run${colors.reset} (no changes made)\n`);
  for (const action of actions) {
    const target = action.target ? `${action.target}` : action.type;
    const detail = action.detail ? ` ${colors.dim}${action.detail}${colors.reset}` : '';
    log(`  ${colors.green}${target}${colors.reset}${detail}`);
  }
}

let ACTIVE_LIBRARY_CONTEXT = getBundledLibraryContext();

function setActiveLibraryContext(context) {
  ACTIVE_LIBRARY_CONTEXT = context || getBundledLibraryContext();
  return ACTIVE_LIBRARY_CONTEXT;
}

function getActiveLibraryContext() {
  return ACTIVE_LIBRARY_CONTEXT || getBundledLibraryContext();
}

function getActiveSkillsDir() {
  return getActiveLibraryContext().skillsDir;
}

function getLibraryDisplayName(context = getActiveLibraryContext()) {
  if (context.mode === 'workspace') {
    const config = readWorkspaceConfig(context);
    return config?.libraryName || path.basename(context.rootDir);
  }
  return 'AI Agent Skills';
}

function getLibraryModeHint(context = getActiveLibraryContext()) {
  if (context.mode === 'workspace') {
    return `${colors.dim}Using workspace library at ${context.rootDir}${colors.reset}`;
  }
  return null;
}

function requireWorkspaceContext(actionLabel = 'This command') {
  const context = getActiveLibraryContext();
  if (context.mode !== 'workspace') {
    error(`${actionLabel} only works inside an initialized library workspace.`);
    log(`${colors.dim}Create one with: npx ai-agent-skills init-library <name>${colors.reset}`);
    process.exitCode = 1;
    return null;
  }
  return context;
}

function slugifyLibraryName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function isInsideDirectory(targetPath, candidatePath) {
  const relative = path.relative(path.resolve(targetPath), path.resolve(candidatePath));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function isMaintainerRepoContext(context) {
  return context.mode === 'bundled'
    && fs.existsSync(path.join(context.rootDir, '.git'))
    && isInsideDirectory(context.rootDir, process.cwd());
}

function requireEditableLibraryContext(actionLabel = 'This command') {
  const context = getActiveLibraryContext();
  if (context.mode === 'workspace') {
    return context;
  }

  if (isMaintainerRepoContext(context)) {
    return context;
  }

  error(`${actionLabel} only works inside a managed workspace or the maintainer repo.`);
  log(`${colors.dim}Create one with: npx ai-agent-skills init-library <name>${colors.reset}`);
  process.exitCode = 1;
  return null;
}

function getCatalogContextFromMeta(meta) {
  if (!meta || !meta.libraryMode) {
    return getBundledLibraryContext();
  }

  if (meta.libraryMode === 'workspace') {
    if (meta.libraryRoot && isManagedWorkspaceRoot(meta.libraryRoot)) {
      return createLibraryContext(meta.libraryRoot, 'workspace');
    }

    const currentContext = resolveLibraryContext(process.cwd());
    if (currentContext.mode === 'workspace') {
      const currentConfig = readWorkspaceConfig(currentContext);
      const currentSlug = currentConfig?.librarySlug || path.basename(currentContext.rootDir);
      if (!meta.librarySlug || meta.librarySlug === currentSlug) {
        return currentContext;
      }
    }

    return null;
  }

  return getBundledLibraryContext();
}

function buildCatalogInstallMeta(skillName, targetDir, context = getActiveLibraryContext()) {
  const workspaceConfig = context.mode === 'workspace' ? readWorkspaceConfig(context) : null;
  return {
    sourceType: 'catalog',
    source: 'catalog',
    skillName,
    scope: resolveScopeLabel(targetDir),
    libraryMode: context.mode,
    libraryRoot: context.rootDir,
    librarySlug: workspaceConfig?.librarySlug || (context.mode === 'workspace' ? path.basename(context.rootDir) : null),
    libraryName: getLibraryDisplayName(context),
  };
}

function getBundledCatalogData() {
  return loadCatalogData(getBundledLibraryContext());
}

function getBundledCatalogSkill(skillName) {
  const bundledData = getBundledCatalogData();
  return bundledData.skills.find((skill) => skill.name === skillName) || null;
}

function inferInstallSourceFromCatalogSkill(skill) {
  if (!skill) return '';
  if (skill.installSource) return skill.installSource;
  if (!skill.source) return '';

  const normalizedPath = String(skill.path || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');

  if (!normalizedPath) return skill.source;
  return `${skill.source}/${normalizedPath}`;
}

function buildImportedCatalogEntryFromBundledSkill(skill, fields) {
  return normalizeSkill({
    name: skill.name,
    description: String(skill.description || '').trim(),
    category: String(fields.category || skill.category || 'development').trim(),
    workArea: String(fields.workArea || '').trim(),
    branch: String(fields.branch || '').trim(),
    author: String(skill.author || 'unknown').trim(),
    source: String(skill.source || '').trim(),
    license: String(skill.license || 'MIT').trim(),
    tier: 'upstream',
    distribution: 'live',
    vendored: false,
    installSource: inferInstallSourceFromCatalogSkill(skill),
    tags: Array.isArray(skill.tags) ? skill.tags : [],
    labels: Array.isArray(skill.labels) ? skill.labels : [],
    requires: Array.isArray(skill.requires) ? skill.requires : [],
    featured: false,
    verified: false,
    origin: 'curated',
    trust: String(fields.trust || 'listed').trim() || 'listed',
    syncMode: 'live',
    sourceUrl: String(skill.sourceUrl || '').trim(),
    whyHere: String(fields.whyHere || '').trim(),
    lastVerified: '',
    notes: String(fields.notes || '').trim(),
    addedDate: currentIsoDay(),
    lastCurated: currentCatalogTimestamp(),
  });
}

function getCatalogInstallOrder(data, requestedSkillNames, noDeps = false) {
  const names = Array.isArray(requestedSkillNames) ? requestedSkillNames : [requestedSkillNames];
  if (noDeps) {
    return [...new Set(names.filter(Boolean))];
  }
  return resolveInstallOrder(data, names);
}

function getCatalogInstallPlan(data, requestedSkillNames, noDeps = false) {
  const orderedNames = getCatalogInstallOrder(data, requestedSkillNames, noDeps);
  const requested = new Set((Array.isArray(requestedSkillNames) ? requestedSkillNames : [requestedSkillNames]).filter(Boolean));
  const skills = orderedNames
    .map((name) => findSkillByName(data, name))
    .filter(Boolean);

  return {
    orderedNames,
    requested,
    skills,
  };
}

function getInstallStateText(skillName, index = buildInstallStateIndex()) {
  return formatInstallStateLabel(getInstallState(index, skillName));
}

function serializeSkillForJson(data, skill, installStateIndex = null) {
  const safeDescription = sanitizeSkillContent(skill.description || '').content;
  const safeWhyHere = sanitizeSkillContent(skill.whyHere || '').content;
  return {
    name: skill.name,
    description: safeDescription,
    workArea: getSkillWorkArea(skill) || null,
    branch: getSkillBranch(skill) || null,
    category: skill.category || null,
    tier: getTier(skill),
    distribution: getDistribution(skill),
    source: skill.source || null,
    installSource: skill.installSource || null,
    trust: getTrust(skill),
    origin: getOrigin(skill),
    featured: !!skill.featured,
    verified: !!skill.verified,
    tags: Array.isArray(skill.tags) ? skill.tags : [],
    collections: getCollectionsForSkill(data, skill.name).map((collection) => collection.id),
    installState: installStateIndex ? (getInstallStateText(skill.name, installStateIndex) || null) : null,
    whyHere: safeWhyHere,
  };
}

const DEFAULT_LIST_JSON_FIELDS = ['name', 'tier', 'workArea', 'description'];
const DEFAULT_COLLECTIONS_JSON_FIELDS = ['id', 'title', 'description', 'skillCount', 'installedCount', 'startHere'];
const DEFAULT_PREVIEW_JSON_FIELDS = ['name', 'sourceType', 'content', 'sanitized'];
const DEFAULT_INSTALL_LIST_JSON_FIELDS = ['name', 'description'];
const DEFAULT_REMOTE_INSTALL_LIST_JSON_FIELDS = ['name', 'tier', 'workArea', 'branch', 'whyHere'];

function parseFieldMask(value, fallback = null) {
  if (value == null) return fallback;
  const fields = String(value)
    .split(',')
    .map((field) => field.trim())
    .filter(Boolean);
  return fields.length > 0 ? [...new Set(fields)] : fallback;
}

function selectObjectFields(record, fields) {
  if (!fields || fields.length === 0) return record;
  return fields.reduce((selected, field) => {
    if (Object.prototype.hasOwnProperty.call(record, field)) {
      selected[field] = record[field];
    }
    return selected;
  }, {});
}

function paginateItems(items, limit = null, offset = null) {
  const normalizedOffset = offset == null ? 0 : offset;
  const normalizedLimit = limit == null ? null : limit;
  const paged = normalizedLimit == null
    ? items.slice(normalizedOffset)
    : items.slice(normalizedOffset, normalizedOffset + normalizedLimit);

  return {
    items: paged,
    limit: normalizedLimit,
    offset: normalizedOffset,
    returned: paged.length,
    total: items.length,
  };
}

function applyTopLevelFieldMask(payload, fields, fallback = null) {
  const resolvedFields = parseFieldMask(fields, fallback);
  if (!resolvedFields || resolvedFields.length === 0) {
    return payload;
  }

  return {
    ...selectObjectFields(payload, resolvedFields),
    fields: resolvedFields,
  };
}

function resolveReadJsonOptions(parsed, commandName) {
  const fields = parseFieldMask(parsed.fields);
  const limit = parsed.limit;
  const offset = parsed.offset;

  if (limit != null && (!Number.isInteger(limit) || limit < 0)) {
    emitActionableError(
      `Invalid --limit value for ${commandName}.`,
      'Use a non-negative integer such as `--limit 10`.',
      { code: 'INVALID_LIMIT' }
    );
    process.exitCode = 1;
    return null;
  }

  if (offset != null && (!Number.isInteger(offset) || offset < 0)) {
    emitActionableError(
      `Invalid --offset value for ${commandName}.`,
      'Use a non-negative integer such as `--offset 20`.',
      { code: 'INVALID_OFFSET' }
    );
    process.exitCode = 1;
    return null;
  }

  return {
    fields,
    limit,
    offset,
  };
}

function colorizeInstallStateLabel(label) {
  if (!label) return '';
  return `${colors.cyan}[${label}]${colors.reset}`;
}

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

const AGENT_INPUT_HINT = 'Remove path traversal (`../`), percent-encoded segments, fragments/query params, and control characters from the input.';
const AGENT_IDENTIFIER_FIELDS = new Set([
  'source',
  'name',
  'skill',
  'skillFilter',
  'collection',
  'removeFromCollection',
  'collectionRemove',
  'workArea',
  'area',
  'category',
  'trust',
  'ref',
  'id',
]);
const AGENT_FREEFORM_FIELDS = new Set([
  'why',
  'whyHere',
  'notes',
  'description',
  'branch',
  'tags',
  'labels',
  'title',
]);
const PROMPT_INJECTION_PATTERNS = [
  /<\/?system>/i,
  /\bignore\s+(?:all\s+)?previous\b/i,
  /\byou are now\b/i,
];
const BASE64ISH_LINE_PATTERN = /^[A-Za-z0-9+/]{80,}={0,2}$/;

function validateAgentInput(value, fieldName, options = {}) {
  if (value === null || value === undefined) return true;
  if (typeof value !== 'string') return true;

  const stringValue = String(value);

  if (/[\x00-\x1f\x7f]/.test(stringValue)) {
    throw new Error(`Invalid ${fieldName}: control characters are not allowed.`);
  }

  if (options.rejectPercentEncoding && /%(?:2e|2f|5c|00|23|3f)/i.test(stringValue)) {
    throw new Error(`Invalid ${fieldName}: percent-encoded path or query segments are not allowed.`);
  }

  if (options.rejectTraversal && /(?:^|[\\/])\.\.(?:[\\/]|$)/.test(stringValue)) {
    throw new Error(`Invalid ${fieldName}: path traversal is not allowed.`);
  }

  if (!options.allowQuery && /[?#]/.test(stringValue)) {
    throw new Error(`Invalid ${fieldName}: embedded query parameters or fragments are not allowed.`);
  }

  return true;
}

function validateAgentValue(value, fieldName, mode = 'text') {
  const options = mode === 'identifier'
    ? { allowQuery: false, rejectTraversal: true, rejectPercentEncoding: true }
    : { allowQuery: true, rejectTraversal: false, rejectPercentEncoding: false };

  if (Array.isArray(value)) {
    value.forEach((item, index) => validateAgentValue(item, `${fieldName}[${index}]`, mode));
    return true;
  }

  return validateAgentInput(value, fieldName, options);
}

function validateAgentPayloadValue(value, fieldName = 'payload', parentKey = '') {
  if (value === null || value === undefined) return;

  if (Array.isArray(value)) {
    value.forEach((item, index) => validateAgentPayloadValue(item, `${fieldName}[${index}]`, parentKey));
    return;
  }

  if (typeof value === 'string') {
    const mode = AGENT_IDENTIFIER_FIELDS.has(parentKey) || parentKey === 'workAreas' || parentKey === 'collections' || parentKey === 'skills'
      ? 'identifier'
      : 'text';
    validateAgentValue(value, fieldName, mode);
    return;
  }

  if (typeof value === 'object') {
    for (const [key, nestedValue] of Object.entries(value)) {
      validateAgentPayloadValue(nestedValue, fieldName === 'payload' ? key : `${fieldName}.${key}`, key);
    }
  }
}

function sandboxOutputPath(target, allowedRoot) {
  const resolved = path.resolve(target);
  const root = path.resolve(allowedRoot);
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    throw new Error(`Output path "${target}" escapes the allowed root "${allowedRoot}".`);
  }
  return resolved;
}

function sanitizeSkillContent(content) {
  const source = String(content == null ? '' : content);
  const lines = source.split(/\r?\n/);
  let sanitized = false;
  const kept = lines.filter((line) => {
    const trimmed = line.trim();
    if (!trimmed) return true;
    if (PROMPT_INJECTION_PATTERNS.some((pattern) => pattern.test(line))) {
      sanitized = true;
      return false;
    }
    if (BASE64ISH_LINE_PATTERN.test(trimmed)) {
      sanitized = true;
      return false;
    }
    return true;
  });

  let safeContent = kept.join('\n');
  if (sanitized) {
    safeContent = safeContent.replace(/\n{3,}/g, '\n\n').trim();
    if (!safeContent) {
      safeContent = '[sanitized suspicious content removed]';
    }
  }

  return {
    content: sanitized ? safeContent : source,
    sanitized,
  };
}

function validateParsedAgentInputs(command, parsed, payload = null) {
  const canonical = resolveCommandAlias(command || parsed.command || '');
  const sourceLikeCommands = new Set(['install', 'add', 'catalog', 'vendor']);
  const nameLikeCommands = new Set(['info', 'show', 'preview', 'uninstall', 'remove', 'rm', 'sync', 'update', 'upgrade', 'curate']);
  const freeformParamCommands = new Set(['search', 'help', 'describe']);

  validateAgentValue(parsed.fields, 'fields', 'text');
  validateAgentValue(parsed.collection, 'collection', 'identifier');
  validateAgentValue(parsed.collectionRemove, 'removeFromCollection', 'identifier');
  validateAgentValue(parsed.workArea, 'workArea', 'identifier');
  validateAgentValue(parsed.category, 'category', 'identifier');
  validateAgentValue(parsed.trust, 'trust', 'identifier');
  validateAgentValue(parsed.lastVerified, 'lastVerified', 'text');
  validateAgentValue(parsed.branch, 'branch', 'text');
  validateAgentValue(parsed.tags, 'tags', 'text');
  validateAgentValue(parsed.labels, 'labels', 'text');
  validateAgentValue(parsed.notes, 'notes', 'text');
  validateAgentValue(parsed.why, 'why', 'text');
  validateAgentValue(parsed.description, 'description', 'text');
  validateAgentValue(parsed.skillFilters, 'skill', 'identifier');

  if (sourceLikeCommands.has(canonical)) {
    validateAgentValue(parsed.param, canonical === 'install' ? 'source' : 'source', 'identifier');
  } else if (nameLikeCommands.has(canonical)) {
    validateAgentValue(parsed.param, 'name', 'identifier');
  } else if (canonical === 'init-library') {
    validateAgentValue(parsed.param, 'name', 'identifier');
  } else if (freeformParamCommands.has(canonical)) {
    validateAgentValue(parsed.param, canonical === 'search' ? 'query' : 'command', 'text');
  }

  if (payload) {
    validateAgentPayloadValue(payload);
  }

  return true;
}

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
    return loadCatalogData(getActiveLibraryContext());
  } catch (e) {
    throw new Error(`Failed to load skills.json: ${e.message}`);
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

function uniquePaths(paths) {
  return [...new Set((paths || []).filter(Boolean))];
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

function validateRemoteWorkspaceCatalog(data) {
  const errors = [];
  const names = new Set();

  for (const skill of data.skills || []) {
    if (!skill || !skill.name) continue;
    if (names.has(skill.name)) {
      errors.push(`Duplicate skill name: ${skill.name}`);
      break;
    }
    names.add(skill.name);
  }

  const dependencyGraph = buildDependencyGraph(data);
  errors.push(...dependencyGraph.errors);

  return errors;
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
  const skillsDir = getActiveSkillsDir();

  // Vendored skills (local folders)
  if (fs.existsSync(skillsDir)) {
    try {
      skills.push(...fs.readdirSync(skillsDir).filter(name => {
        const skillPath = path.join(skillsDir, name);
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
    format: null,
    json: false,
    scope: null,          // v3: 'global', 'project', or null (default)
    agents: [],           // Legacy: array of agents
    allAgents: false,
    explicitAgent: false,
    installed: false,
    all: false,
    dryRun: false,
    noDeps: false,
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
    workAreas: null,
    collection: null,
    collectionRemove: null,
    fields: null,
    limit: null,
    offset: null,
    skillFilters: [],     // v3: --skill flag values
    listMode: false,      // v3: --list flag
    yes: false,           // v3: --yes flag (non-interactive)
    importMode: false,
    autoClassify: false,
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
    else if (arg === '--format') {
      result.format = args[i + 1] || null;
      i++;
    }
    else if (arg === '--json') {
      result.json = true;
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
    else if (arg === '--no-deps') {
      result.noDeps = true;
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
    else if (arg === '--areas') {
      result.workAreas = args[i + 1] || null;
      i++;
    }
    else if (arg === '--collection') {
      result.collection = args[i + 1];
      i++;
    }
    else if (arg === '--remove-from-collection') {
      result.collectionRemove = args[i + 1];
      i++;
    }
    else if (arg === '--fields') {
      result.fields = args[i + 1] || null;
      i++;
    }
    else if (arg === '--limit') {
      const value = args[i + 1];
      result.limit = value == null ? NaN : Number.parseInt(value, 10);
      i++;
    }
    else if (arg === '--offset') {
      const value = args[i + 1];
      result.offset = value == null ? NaN : Number.parseInt(value, 10);
      i++;
    }
    else if (arg === '--import') {
      result.importMode = true;
    }
    else if (arg === '--auto-classify') {
      result.autoClassify = true;
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

const JSON_INPUT_COMMANDS = new Set(['add', 'catalog', 'vendor', 'curate', 'init-library', 'uninstall']);
const INVALID_JSON_INPUT = Symbol('invalid-json-input');

async function readJsonStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) {
    throw new Error('Expected a JSON object on stdin when using --json.');
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid JSON payload: ${error.message}`);
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('JSON payload must be an object.');
  }

  return payload;
}

async function parseJsonInput(command, parsed) {
  const canonical = resolveCommandAlias(command || '');
  if (!parsed.json || !JSON_INPUT_COMMANDS.has(canonical)) {
    return null;
  }

  try {
    return await readJsonStdin();
  } catch (error) {
    emitActionableError(
      error.message,
      'Pipe a JSON object to stdin, for example: echo \'{"name":"frontend-design"}\' | npx ai-agent-skills add --json',
      { code: 'INVALID_JSON_INPUT' }
    );
    process.exitCode = 1;
    return INVALID_JSON_INPUT;
  }
}

function getPayloadValue(payload, ...keys) {
  if (!payload || typeof payload !== 'object') return undefined;
  for (const key of keys) {
    if (payload[key] !== undefined) {
      return payload[key];
    }
  }
  return undefined;
}

function mergeMutationOption(cliValue, payload, ...keys) {
  return cliValue !== null && cliValue !== undefined ? cliValue : getPayloadValue(payload, ...keys);
}

function mergeMutationNullableBoolean(cliValue, payload, ...keys) {
  if (cliValue !== null && cliValue !== undefined) {
    return cliValue;
  }
  const value = getPayloadValue(payload, ...keys);
  return value === undefined ? null : Boolean(value);
}

function mergeMutationBoolean(cliValue, payload, ...keys) {
  if (cliValue) return true;
  const value = getPayloadValue(payload, ...keys);
  return value === undefined ? false : Boolean(value);
}

function resolveMutationSource(param, payload, options = {}) {
  if (param) return param;
  const source = getPayloadValue(payload, 'source');
  if (source !== undefined) return source;
  return options.allowNameFallback ? (getPayloadValue(payload, 'name') || null) : null;
}

function buildWorkspaceMutationOptions(parsed, payload = {}) {
  return {
    list: mergeMutationBoolean(parsed.listMode, payload, 'list'),
    skillFilter: parsed.skillFilters.length > 0 ? parsed.skillFilters[0] : getPayloadValue(payload, 'skill', 'name'),
    area: mergeMutationOption(parsed.workArea, payload, 'workArea', 'area'),
    branch: mergeMutationOption(parsed.branch, payload, 'branch'),
    category: mergeMutationOption(parsed.category, payload, 'category'),
    tags: mergeMutationOption(parsed.tags, payload, 'tags'),
    labels: mergeMutationOption(parsed.labels, payload, 'labels'),
    notes: mergeMutationOption(parsed.notes, payload, 'notes'),
    trust: mergeMutationOption(parsed.trust, payload, 'trust'),
    whyHere: mergeMutationOption(parsed.why, payload, 'whyHere', 'why'),
    description: mergeMutationOption(parsed.description, payload, 'description'),
    collections: mergeMutationOption(parsed.collection, payload, 'collections', 'collection'),
    lastVerified: mergeMutationOption(parsed.lastVerified, payload, 'lastVerified'),
    featured: mergeMutationNullableBoolean(parsed.featured, payload, 'featured'),
    clearVerified: mergeMutationBoolean(parsed.clearVerified, payload, 'clearVerified'),
    remove: mergeMutationBoolean(parsed.remove, payload, 'remove'),
    ref: getArgValue(process.argv, '--ref') || getPayloadValue(payload, 'ref') || null,
    dryRun: mergeMutationBoolean(parsed.dryRun, payload, 'dryRun'),
  };
}

function buildCurateParsed(parsed, payload = {}) {
  return {
    ...parsed,
    workArea: mergeMutationOption(parsed.workArea, payload, 'workArea', 'area'),
    branch: mergeMutationOption(parsed.branch, payload, 'branch'),
    category: mergeMutationOption(parsed.category, payload, 'category'),
    tags: mergeMutationOption(parsed.tags, payload, 'tags'),
    labels: mergeMutationOption(parsed.labels, payload, 'labels'),
    notes: mergeMutationOption(parsed.notes, payload, 'notes'),
    trust: mergeMutationOption(parsed.trust, payload, 'trust'),
    why: mergeMutationOption(parsed.why, payload, 'whyHere', 'why'),
    description: mergeMutationOption(parsed.description, payload, 'description'),
    collection: mergeMutationOption(parsed.collection, payload, 'collections', 'collection'),
    collectionRemove: mergeMutationOption(parsed.collectionRemove, payload, 'removeFromCollection', 'collectionRemove'),
    featured: mergeMutationNullableBoolean(parsed.featured, payload, 'featured'),
    lastVerified: mergeMutationOption(parsed.lastVerified, payload, 'lastVerified'),
    clearVerified: mergeMutationBoolean(parsed.clearVerified, payload, 'clearVerified'),
    remove: mergeMutationBoolean(parsed.remove, payload, 'remove'),
    yes: mergeMutationBoolean(parsed.yes, payload, 'yes'),
    dryRun: mergeMutationBoolean(parsed.dryRun, payload, 'dryRun'),
  };
}

// v3: resolve install target path from scope/agent flags
function resolveInstallPath(parsed, options = {}) {
  // 1. Explicit legacy --agent override
  if (parsed.explicitAgent && parsed.agents.length > 0) {
    return uniquePaths(parsed.agents.map(a => AGENT_PATHS[a] || SCOPES.global));
  }
  // 2. --all installs to both scopes
  if (parsed.all) {
    return uniquePaths([SCOPES.global, SCOPES.project]);
  }
  // 3. Explicit scope flag
  if (parsed.scope === 'project') return [SCOPES.project];
  if (parsed.scope === 'global') return [SCOPES.global];
  // 4. Optional default agents for direct source shortcuts
  if (Array.isArray(options.defaultAgents) && options.defaultAgents.length > 0) {
    return uniquePaths(options.defaultAgents.map((agent) => AGENT_PATHS[agent] || SCOPES.global));
  }
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

function isKnownCommand(command) {
  return COMMAND_ALIAS_MAP.has(command);
}

function isImplicitSourceCommand(command) {
  const parsed = parseSource(command);
  return parsed.type !== 'catalog';
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

function buildHouseSkillInstallMeta(skillName, destDir, {
  sourceContext = getActiveLibraryContext(),
  skill = null,
  sourceParsed = null,
  libraryRepo = null,
} = {}) {
  const relativePath = getCatalogSkillRelativePath(skill || { name: skillName });

  if (!sourceParsed) {
    return buildCatalogInstallMeta(skillName, destDir, sourceContext);
  }

  if (sourceParsed.type === 'local') {
    return {
      sourceType: 'local',
      source: 'local',
      path: resolveCatalogSkillSourcePath(skillName, { sourceContext, skill }),
      skillName,
      scope: resolveScopeLabel(destDir),
      ...(libraryRepo ? { libraryRepo } : {}),
    };
  }

  return {
    sourceType: sourceParsed.type,
    source: sourceParsed.type,
    url: sourceParsed.type === 'git' ? sanitizeGitUrl(sourceParsed.url) : sourceParsed.url,
    repo: buildRepoId(sourceParsed),
    ref: sourceParsed.ref || null,
    subpath: relativePath,
    installSource: buildInstallSourceRef(sourceParsed, relativePath),
    skillName,
    scope: resolveScopeLabel(destDir),
    ...(libraryRepo ? { libraryRepo } : {}),
  };
}

function installSkill(skillName, agent = 'claude', dryRun = false, targetPath = null, options = {}) {
  try {
    validateSkillName(skillName);
  } catch (e) {
    error(e.message);
    return false;
  }

  const sourceContext = options.sourceContext || getActiveLibraryContext();
  const skill = options.skill || null;
  const sourcePath = resolveCatalogSkillSourcePath(skillName, { sourceContext, skill });

  if (!fs.existsSync(sourcePath)) {
    // Check if this is a non-vendored cataloged skill
    try {
      const data = loadCatalogData(sourceContext);
      const cataloged = data.skills.find(s => s.name === skillName) || null;
      if (cataloged && shouldTreatCatalogSkillAsHouse(cataloged, sourceContext)) {
        emitActionableError(
          `House copy files for "${skillName}" are missing in ${sourceContext.rootDir}`,
          'Check the `path` in skills.json and commit the vendored files to the shared library.',
          { code: 'HOUSE_PATH' }
        );
        return false;
      }
      if (cataloged && cataloged.tier === 'upstream') {
        const installSource = cataloged.installSource || cataloged.source;
        if (installSource) {
          info(`"${skillName}" is a cataloged upstream skill. Installing live from ${installSource}...`);
          const parsed = parseSource(installSource);
          const installPaths = targetPath ? [targetPath] : [AGENT_PATHS[agent] || SCOPES.global];
          return installFromSource(installSource, parsed, installPaths, [skillName], false, true, dryRun, {
            additionalInstallMeta: options.additionalInstallMeta || null,
            allowWorkspaceCatalog: options.allowWorkspaceCatalog !== false,
          });
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
  sandboxOutputPath(destPath, destDir);
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
    writeSkillMeta(destPath, options.metadata || buildHouseSkillInstallMeta(skillName, destDir, {
      sourceContext,
      skill,
      sourceParsed: options.sourceParsed || null,
      libraryRepo: options.libraryRepo || null,
    }));

    const scopeLabel = resolveScopeLabel(destDir);
    success(`\nInstalled: ${skillName}`);
    info(`Scope: ${scopeLabel}`);
    info(`Location: ${destPath}`);
    info(`Size: ${(skillSize / 1024).toFixed(1)} KB`);

    log('');
    if (agent && options.includeAgentInstructions !== false) {
      showAgentInstructions(agent, skillName, destPath);
    }

    return true;
  } catch (e) {
    error(`Failed to install skill: ${e.message}`);
    return false;
  }
}

// v3: install a catalog skill to a scope path directly (for TUI scope chooser)
function installSkillToScope(skillName, scopePath, scopeLabel, dryRun = false, options = {}) {
  try { validateSkillName(skillName); } catch (e) { error(e.message); return false; }

  const sourceContext = options.sourceContext || getActiveLibraryContext();
  const skill = options.skill || null;
  const sourcePath = resolveCatalogSkillSourcePath(skillName, { sourceContext, skill });
  if (!fs.existsSync(sourcePath)) {
    try {
      const data = loadCatalogData(sourceContext);
      const cataloged = data.skills.find((skill) => skill.name === skillName && skill.tier === 'upstream');
      if (cataloged && cataloged.installSource) {
        const parsed = parseSource(cataloged.installSource);
        return installFromSource(cataloged.installSource, parsed, [scopePath], [skillName], false, true, dryRun, {
          additionalInstallMeta: options.additionalInstallMeta || null,
          allowWorkspaceCatalog: options.allowWorkspaceCatalog !== false,
        });
      }
    } catch {}

    error(`Skill "${skillName}" not found.`);
    const available = getAvailableSkills();
    const similar = available.filter(s => s.includes(skillName) || skillName.includes(s) || levenshteinDistance(s, skillName) <= 3).slice(0, 3);
    if (similar.length > 0) log(`\n${colors.dim}Did you mean: ${similar.join(', ')}?${colors.reset}`);
    return false;
  }

  const destPath = path.join(scopePath, skillName);
  sandboxOutputPath(destPath, scopePath);
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
      ...(options.metadata || buildHouseSkillInstallMeta(skillName, scopePath, {
        sourceContext,
        skill,
        sourceParsed: options.sourceParsed || null,
        libraryRepo: options.libraryRepo || null,
      })),
      scope: scopeLabel,
    });
    success(`\nInstalled: ${skillName}`);
    info(`Scope: ${scopeLabel}`);
    info(`Location: ${destPath}`);
    info(`Size: ${(skillSize / 1024).toFixed(1)} KB`);
    if (scopeLabel === 'global') {
      log(`${colors.dim}The skill is now available in your default global Agent Skills location.\nCompatible agents can pick it up from there.${colors.reset}`);
    } else {
      log(`${colors.dim}The skill is installed in .agents/skills/ for this project.\nAny Agent Skills-compatible agent in this repo can read it.${colors.reset}`);
    }
    return true;
  } catch (e) {
    error(`Failed to install skill: ${e.message}`);
    return false;
  }
}

function getCollectionSkillsInOrder(data, collection) {
  const orderedSkills = [];
  for (const skillName of collection.skills || []) {
    const skill = findSkillByName(data, skillName);
    if (skill) {
      orderedSkills.push(skill);
    }
  }
  return orderedSkills;
}

function buildCollectionInstallOperations(skills, { sourceContext = getActiveLibraryContext() } = {}) {
  const operations = [];

  for (const skill of skills) {
    if (!skill) continue;

    if (shouldTreatCatalogSkillAsHouse(skill, sourceContext)) {
      operations.push({
        type: 'skill',
        skills: [skill],
      });
      continue;
    }

    const upstreamSourceRef = getCatalogSkillSourceRef(skill, { sourceContext });
    const previous = operations[operations.length - 1];
    if (previous && previous.type === 'upstream' && previous.source === upstreamSourceRef) {
      previous.skills.push(skill);
      continue;
    }

    operations.push({
      type: 'upstream',
      source: upstreamSourceRef,
      skills: [skill],
    });
  }

  return operations;
}

function printCatalogInstallPlan(plan, installPaths, {
  dryRun = false,
  title = 'Install plan',
  summaryLine = null,
  sourceContext = getActiveLibraryContext(),
  sourceParsed = null,
  parseable = false,
} = {}) {
  const requestedCount = plan.requested.size;
  const targetList = installPaths.join(', ');
  const usesSparseCheckout = plan.skills.some((skill) => !shouldTreatCatalogSkillAsHouse(skill, sourceContext) && (skill.installSource || skill.source) !== skill.source);

  if (parseable) {
    if (isJsonOutput()) {
      emitJsonRecord('install', {
        kind: 'plan',
        requested: requestedCount,
        resolved: plan.skills.length,
        targets: installPaths,
      });

      for (const skill of plan.skills) {
        emitJsonRecord('install', {
          kind: 'install',
          skill: {
            name: skill.name,
            tier: shouldTreatCatalogSkillAsHouse(skill, sourceContext) ? 'house' : 'upstream',
            source: getCatalogSkillSourceRef(skill, { sourceContext, sourceParsed }),
          },
        });
      }
      return;
    }

    emitMachineLine('PLAN', [
      `requested=${requestedCount}`,
      `resolved=${plan.skills.length}`,
      `targets=${targetList}`,
    ]);

    for (const skill of plan.skills) {
      emitMachineLine('INSTALL', [
        skill.name,
        shouldTreatCatalogSkillAsHouse(skill, sourceContext) ? 'house' : 'upstream',
        getCatalogSkillSourceRef(skill, { sourceContext, sourceParsed }),
      ]);
    }
    return;
  }

  if (dryRun) {
    log(`\n${colors.bold}Dry Run${colors.reset} (no changes made)\n`);
  } else {
    log(`\n${colors.bold}${title}${colors.reset}`);
  }

  if (summaryLine) {
    info(summaryLine);
  }
  info(`Targets: ${targetList}`);
  info(`Requested: ${requestedCount} skill${requestedCount === 1 ? '' : 's'}`);
  info(`Resolved: ${plan.skills.length} skill${plan.skills.length === 1 ? '' : 's'}`);

  if (plan.skills.length > plan.requested.size) {
    info(`Dependency order: ${plan.orderedNames.join(' -> ')}`);
  }
  if (usesSparseCheckout) {
    info('Clone mode: sparse checkout');
  }

  for (const skill of plan.skills) {
    const sourceLabel = shouldTreatCatalogSkillAsHouse(skill, sourceContext)
      ? `bundled house copy from ${getCatalogSkillSourceRef(skill, { sourceContext, sourceParsed })}`
      : `live from ${skill.installSource || skill.source}`;
    const dependencyLabel = plan.requested.has(skill.name)
      ? ''
      : ` ${colors.dim}(dependency)${colors.reset}`;
    log(`  ${colors.green}${skill.name}${colors.reset}${dependencyLabel} ${colors.dim}(${sourceLabel})${colors.reset}`);
  }
}

async function installCatalogPlan(plan, installPaths, {
  dryRun = false,
  title = 'Installing skills',
  summaryLine = null,
  successLine = null,
  sourceContext = getActiveLibraryContext(),
  sourceParsed = null,
  libraryRepo = null,
  parseable = false,
} = {}) {
  if (dryRun) {
    printCatalogInstallPlan(plan, installPaths, {
      dryRun: true,
      title,
      summaryLine,
      sourceContext,
      sourceParsed,
      parseable,
    });
    return true;
  }

  printCatalogInstallPlan(plan, installPaths, {
    dryRun: false,
    title,
    summaryLine,
    sourceContext,
    sourceParsed,
  });

  const operations = buildCollectionInstallOperations(plan.skills, { sourceContext });
  let completed = 0;
  let failed = 0;

  for (const operation of operations) {
    if (operation.type === 'upstream') {
      const upstreamSource = operation.source;
      const success = await installFromSource(
        upstreamSource,
        parseSource(upstreamSource),
        installPaths,
        operation.skills.map((skill) => skill.name),
        false,
        true,
        false,
        {
          additionalInstallMeta: libraryRepo ? { libraryRepo } : null,
          allowWorkspaceCatalog: false,
        }
      );

      if (success) completed += operation.skills.length;
      else failed += operation.skills.length;
      continue;
    }

    for (const skill of operation.skills) {
      let skillSucceeded = true;
      for (const targetPath of installPaths) {
        if (!installSkill(skill.name, null, false, targetPath, {
          sourceContext,
          sourceParsed,
          skill,
          libraryRepo,
          includeAgentInstructions: false,
          metadata: buildHouseSkillInstallMeta(skill.name, targetPath, {
            sourceContext,
            sourceParsed,
            skill,
            libraryRepo,
          }),
        })) {
          skillSucceeded = false;
        }
      }

      if (skillSucceeded) completed += 1;
      else failed += 1;
    }
  }

  if (completed > 0) {
    success(`\n${successLine || `Finished: ${completed} skill${completed === 1 ? '' : 's'} completed`}`);
  }
  if (failed > 0) {
    emitActionableError(
      `${failed} skill${failed === 1 ? '' : 's'} failed during install`,
      'Run the source again with --dry-run or --list to inspect the install plan and failing source.',
      { code: 'INSTALL', machine: parseable }
    );
    process.exitCode = 1;
  }

  return completed > 0;
}

async function installCatalogSkillFromLibrary(skillName, installPaths, dryRun = false) {
  const data = loadSkillsJson();
  const skill = findSkillByName(data, skillName);
  if (!skill) {
    for (const targetPath of installPaths) {
      installSkill(skillName, null, dryRun, targetPath);
    }
    return false;
  }

  const plan = getCatalogInstallPlan(data, [skillName], false);
  return installCatalogPlan(plan, installPaths, {
    dryRun,
    title: `Installing ${skillName}`,
    summaryLine: `Would install: ${skillName}`,
  });
}

async function installCollection(collectionId, parsed, installPaths) {
  const data = loadSkillsJson();
  const resolution = resolveCollection(data, collectionId);

  if (!resolution.collection) {
    warn(resolution.message);
    if (resolution.unknown) {
      printCollectionSuggestions(data);
    }
    return false;
  }

  if (resolution.message) {
    info(resolution.message);
  }

  const orderedSkills = getCollectionSkillsInOrder(data, resolution.collection);
  if (orderedSkills.length === 0) {
    warn(`Collection "${resolution.collection.id}" has no installable skills.`);
    return false;
  }

  const plan = getCatalogInstallPlan(
    data,
    orderedSkills.map((skill) => skill.name),
    parsed.noDeps,
  );

  return installCatalogPlan(plan, installPaths, {
    dryRun: parsed.dryRun,
    title: 'Installing Collection',
    summaryLine: `Would install collection: ${resolution.collection.title} [${resolution.collection.id}]`,
    successLine: `Collection install finished: ${plan.skills.length} skill${plan.skills.length === 1 ? '' : 's'} completed`,
  });
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
  return listInstalledSkillNamesInDir(destDir);
}

function listInstalledSkills(agent = 'claude') {
  const installed = getInstalledSkills(agent);
  const destDir = AGENT_PATHS[agent] || AGENT_PATHS.claude;
  return listInstalledSkillsInPath(destDir, agent, installed);
}

function listInstalledSkillsInPath(destDir, label = 'global', installed = null) {
  let resolvedInstalled = Array.isArray(installed) ? installed : null;
  if (!resolvedInstalled) {
    if (label === 'global' || label === 'project') {
      const installStateIndex = buildInstallStateIndex();
      resolvedInstalled = getInstalledSkillNames(installStateIndex, label);
    } else {
      resolvedInstalled = getInstalledSkillsInPath(destDir);
    }
  }

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
    log(`\n${colors.dim}Sync:      npx ai-agent-skills sync <name> --project${colors.reset}`);
    log(`${colors.dim}Uninstall: npx ai-agent-skills uninstall <name> --project${colors.reset}`);
    return;
  }

  if (label === 'global') {
    log(`\n${colors.dim}Sync:      npx ai-agent-skills sync <name> --global${colors.reset}`);
    log(`${colors.dim}Uninstall: npx ai-agent-skills uninstall <name> --global${colors.reset}`);
    return;
  }

  log(`\n${colors.dim}Sync:      npx ai-agent-skills sync <name> --agent ${label}${colors.reset}`);
  log(`${colors.dim}Uninstall: npx ai-agent-skills uninstall <name> --agent ${label}${colors.reset}`);
}

function runDoctor(agentsToCheck = Object.keys(AGENT_PATHS)) {
  const checks = [];
  const context = getActiveLibraryContext();

  try {
    const data = loadCatalogData(context);
    const vendoredSkills = (data.skills || []).filter(s => s.tier === 'house');
    const catalogedSkills = (data.skills || []).filter(s => s.tier === 'upstream');
    const missingSkills = vendoredSkills.filter((skill) => {
      const skillPath = path.join(resolveCatalogSkillSourcePath(skill.name, { sourceContext: context, skill }), 'SKILL.md');
      return !fs.existsSync(skillPath);
    });

    const vendoredCount = vendoredSkills.length;
    const catalogedCount = catalogedSkills.length;
    checks.push({
      name: context.mode === 'workspace' ? 'Workspace library' : 'Bundled library',
      pass: missingSkills.length === 0,
      detail: missingSkills.length === 0
        ? `${vendoredCount} vendored + ${catalogedCount} cataloged upstream across ${getCollections(data).length} collections`
        : `Missing SKILL.md for ${missingSkills.map((skill) => skill.name).join(', ')}`,
    });
  } catch (e) {
    checks.push({
      name: context.mode === 'workspace' ? 'Workspace library' : 'Bundled library',
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

  let passed = 0;
  let failed = 0;
  checks.forEach((check) => {
    if (check.pass) passed++;
    else failed++;
  });

  if (isJsonOutput()) {
    setJsonResultData({
      checks,
      summary: {
        passed,
        failed,
      },
    });
    if (failed > 0) {
      process.exitCode = 1;
    }
    return;
  }

  log(`\n${colors.bold}AI Agent Skills Doctor${colors.reset}`);
  log(`${colors.dim}Checking the library, config, and install targets.${colors.reset}\n`);
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

  if (isJsonOutput()) {
    setJsonResultData({
      target: label,
      ok: result.ok,
      skillDir: result.skillDir,
      summary: result.summary,
      errors: result.errors,
      warnings: result.warnings,
    });
    if (!result.ok) {
      process.exitCode = 1;
    }
    return;
  }

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

// Update from the library catalog
function updateFromRegistry(skillName, targetLabel, destPath, dryRun, meta = null) {
  const catalogContext = getCatalogContextFromMeta(meta);
  if (!catalogContext) {
    error('The workspace library for this installed skill is unavailable.');
    log(`${colors.dim}Run this command from inside the workspace or reinstall the skill.${colors.reset}`);
    return false;
  }
  const data = loadCatalogData(catalogContext);
  const skill = findSkillByName(data, skillName);
  const sourcePath = skill
    ? resolveCatalogSkillSourcePath(skillName, { sourceContext: catalogContext, skill })
    : path.join(catalogContext.skillsDir, skillName);

  if (!fs.existsSync(sourcePath)) {
    error(`Skill "${skillName}" not found in ${catalogContext.mode === 'workspace' ? 'workspace' : 'bundled'} library.`);
    return false;
  }

  if (dryRun) {
    log(`\n${colors.bold}Dry Run${colors.reset} (no changes made)\n`);
    info(`Would update: ${skillName} (from catalog)`);
    info(`Target: ${targetLabel}`);
    info(`Path: ${destPath}`);
    return true;
  }

  try {
    fs.rmSync(destPath, { recursive: true });
    copyDir(sourcePath, destPath);

    // Write metadata
    writeSkillMeta(destPath, {
      ...(meta || {}),
      ...buildCatalogInstallMeta(skillName, path.dirname(destPath), catalogContext),
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
      return updateFromRegistry(skillName, targetLabel, destPath, dryRun, meta);
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

  log(`\n${colors.bold}Syncing ${installed.length} skill(s) in ${targetLabel}...${colors.reset}\n`);

  let updated = 0;
  let failed = 0;

  for (const skillName of installed) {
    if (updateSkillInPath(skillName, destDir, targetLabel, dryRun)) {
      updated++;
    } else {
      failed++;
    }
  }

  log(`\n${colors.bold}Summary:${colors.reset} ${updated} refreshed, ${failed} failed`);
}

// ============ LISTING AND SEARCH ============

function resolveCatalogSkillSelection(category = null, tags = null, collectionId = null, workArea = null) {
  const data = loadSkillsJson();
  const installStateIndex = buildInstallStateIndex();
  let skills = data.skills || [];

  if (category) {
    skills = skills.filter((skill) => skill.category === category.toLowerCase());
  }

  if (workArea) {
    skills = skills.filter((skill) => (skill.workArea || '').toLowerCase() === workArea.toLowerCase());
  }

  if (tags) {
    const tagList = tags.split(',').map((tag) => tag.trim().toLowerCase());
    skills = skills.filter((skill) =>
      skill.tags && tagList.some((tag) => skill.tags.includes(tag))
    );
  }

  const collectionResult = filterSkillsByCollection(data, skills, collectionId);
  skills = collectionResult.skills;

  if (!collectionResult.collection) {
    skills = sortSkillsByCuration(data, skills);
  }

  return {
    data,
    installStateIndex,
    collectionResult,
    skills,
  };
}

function emitListJson(category = null, tags = null, collectionId = null, workArea = null, options = {}) {
  const { data, installStateIndex, collectionResult, skills } = resolveCatalogSkillSelection(category, tags, collectionId, workArea);
  const fields = parseFieldMask(options.fields, DEFAULT_LIST_JSON_FIELDS);

  if (collectionId && !collectionResult.collection) {
    process.exitCode = 1;
    emitJsonEnvelope('list', {
      filters: { category, tags, collection: collectionId, workArea },
      fields,
      limit: options.limit == null ? null : options.limit,
      offset: options.offset == null ? 0 : options.offset,
    }, [{
      code: 'COLLECTION',
      message: collectionResult.message,
      hint: collectionResult.unknown ? 'Run `npx ai-agent-skills collections` to inspect valid collection ids.' : null,
    }], { status: 'error' });
    return;
  }

  const serializedSkills = skills.map((skill) =>
    selectObjectFields(serializeSkillForJson(data, skill, installStateIndex), fields)
  );
  const pagination = paginateItems(serializedSkills, options.limit, options.offset);

  emitJsonRecord('list', {
    kind: 'summary',
    total: pagination.total,
    returned: pagination.returned,
    limit: pagination.limit,
    offset: pagination.offset,
    fields,
    filters: { category, tags, collection: collectionId, workArea },
    collection: collectionResult.collection
      ? {
          id: collectionResult.collection.id,
          title: collectionResult.collection.title,
          description: collectionResult.collection.description,
        }
      : null,
  });

  for (const skill of pagination.items) {
    emitJsonRecord('list', {
      kind: 'item',
      skill,
    });
  }
}

function emitSearchJson(query, category = null, collectionId = null, workArea = null, options = {}) {
  const { data, installStateIndex, collectionResult, skills } = resolveCatalogSkillSelection(category, null, collectionId, workArea);
  const loweredQuery = query.toLowerCase();
  const fields = parseFieldMask(options.fields, DEFAULT_LIST_JSON_FIELDS);

  if (collectionId && !collectionResult.collection) {
    process.exitCode = 1;
    emitJsonEnvelope('search', {
      query,
      filters: { category, collection: collectionId, workArea },
      fields,
      limit: options.limit == null ? null : options.limit,
      offset: options.offset == null ? 0 : options.offset,
    }, [{
      code: 'COLLECTION',
      message: collectionResult.message,
      hint: collectionResult.unknown ? 'Run `npx ai-agent-skills collections` to inspect valid collection ids.' : null,
    }], { status: 'error' });
    return;
  }

  const matches = skills.filter((skill) =>
    skill.name.toLowerCase().includes(loweredQuery) ||
    skill.description.toLowerCase().includes(loweredQuery) ||
    (skill.workArea && skill.workArea.toLowerCase().includes(loweredQuery)) ||
    (skill.branch && skill.branch.toLowerCase().includes(loweredQuery)) ||
    (skill.category && skill.category.toLowerCase().includes(loweredQuery)) ||
    (skill.tags && skill.tags.some((tag) => tag.toLowerCase().includes(loweredQuery)))
  );

  const rankedMatches = sortSkillsForSearch(data, matches, query);
  const suggestions = rankedMatches.length === 0
    ? (data.skills || [])
        .map((skill) => ({ name: skill.name, dist: levenshteinDistance(skill.name, query) }))
        .filter((skill) => skill.dist <= 4)
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 3)
        .map((skill) => skill.name)
    : [];
  const serializedMatches = rankedMatches.map((skill) =>
    selectObjectFields(serializeSkillForJson(data, skill, installStateIndex), fields)
  );
  const pagination = paginateItems(serializedMatches, options.limit, options.offset);

  emitJsonRecord('search', {
    kind: 'summary',
    query,
    total: pagination.total,
    returned: pagination.returned,
    limit: pagination.limit,
    offset: pagination.offset,
    fields,
    filters: { category, collection: collectionId, workArea },
    suggestions,
  });

  for (const skill of pagination.items) {
    emitJsonRecord('search', {
      kind: 'item',
      skill,
    });
  }
}

function emitInstalledSkillsJson(targets) {
  const installStateIndex = buildInstallStateIndex();

  for (const target of targets) {
    const installed = target.label === 'global' || target.label === 'project'
      ? getInstalledSkillNames(installStateIndex, target.label)
      : getInstalledSkillsInPath(target.path);

    emitJsonRecord('list', {
      kind: 'scope',
      scope: target.label,
      path: target.path,
      total: installed.length,
    });

    for (const name of installed) {
      emitJsonRecord('list', {
        kind: 'item',
        scope: target.label,
        skill: {
          name,
          installState: 'installed',
        },
      });
    }
  }
}

function listSkills(category = null, tags = null, collectionId = null, workArea = null) {
  const data = loadSkillsJson();
  const installStateIndex = buildInstallStateIndex();
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
      const installStateLabel = getInstallStateText(skill.name, installStateIndex);
      const tagStr = skill.tags && skill.tags.length > 0
        ? ` ${colors.dim}[${skill.tags.slice(0, 3).join(', ')}]${colors.reset}`
        : '';
      const collectionBadge = getCollectionBadgeText(data, skill)
        ? ` ${colors.dim}{${getCollectionBadgeText(data, skill)}}${colors.reset}`
        : '';

      log(`  ${colors.green}${skill.name}${colors.reset}${featured}${verified}${tierBadge}${installStateLabel ? ` ${colorizeInstallStateLabel(installStateLabel)}` : ''}${tagStr}${collectionBadge}`);
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

    const counts = {
      total: skills.length,
      house: skills.filter((skill) => getTier(skill) === 'house').length,
      upstream: skills.filter((skill) => getTier(skill) !== 'house').length,
    };
    log(`\n${colors.bold}Curated Library${colors.reset}`);
    log(`${colors.dim}${formatCount(counts.total, 'pick')} on ${formatCount(orderedAreas.length, 'shelf', 'shelves')} · ${formatCount(counts.house, 'house copy', 'house copies')} · ${formatCount(counts.upstream, 'cataloged upstream pick', 'cataloged upstream picks')}${colors.reset}`);
    log(`${colors.dim}Browse by shelf first.${colors.reset}\n`);

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
        const installStateLabel = getInstallStateText(skill.name, installStateIndex);
        const tagStr = skill.tags && skill.tags.length > 0
          ? ` ${colors.dim}[${skill.tags.slice(0, 3).join(', ')}]${colors.reset}`
          : '';
        const collectionBadge = getCollectionBadgeText(data, skill)
          ? ` ${colors.dim}{${getCollectionBadgeText(data, skill)}}${colors.reset}`
          : '';

        log(`  ${colors.green}${skill.name}${colors.reset}${featured}${verified}${tierBadge}${installStateLabel ? ` ${colorizeInstallStateLabel(installStateLabel)}` : ''}${tagStr}${collectionBadge}`);
        log(`    ${colors.dim}${getSkillMeta(skill, false)}${colors.reset}`);

        const shelfNote = sanitizeSkillContent(skill.whyHere || skill.description).content;
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
  const installStateIndex = buildInstallStateIndex();
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
    const installStateLabel = getInstallStateText(skill.name, installStateIndex);
    const tagStr = skill.tags && skill.tags.length > 0
      ? ` ${colors.magenta}[${skill.tags.slice(0, 3).join(', ')}]${colors.reset}`
      : '';
    const collectionBadge = getCollectionBadgeText(data, skill)
      ? ` ${colors.dim}{${getCollectionBadgeText(data, skill)}}${colors.reset}`
      : '';

    const label = getSkillWorkArea(skill) && getSkillBranch(skill)
      ? `${formatWorkAreaTitle(getSkillWorkArea(skill))} / ${getSkillBranch(skill)}`
      : skill.category;
    log(`${colors.green}${skill.name}${colors.reset} ${colors.dim}[${label}]${colors.reset}${installStateLabel ? ` ${colorizeInstallStateLabel(installStateLabel)}` : ''}${tagStr}${collectionBadge}`);
    log(`  ${colors.dim}${getOrigin(skill)} · ${getTrust(skill)} · ${skill.source}${colors.reset}`);

    const safeDescription = sanitizeSkillContent(skill.description).content;
    const desc = safeDescription.length > 75
      ? safeDescription.slice(0, 75) + '...'
      : safeDescription;
    log(`  ${desc}`);
    log('');
  });
}

function showCollections(options = {}) {
  const data = loadSkillsJson();
  const installStateIndex = buildInstallStateIndex();
  const collections = getCollections(data);

  if (isJsonOutput()) {
    const fields = parseFieldMask(options.fields, DEFAULT_COLLECTIONS_JSON_FIELDS);
    const serializedCollections = collections.map((collection) =>
      selectObjectFields({
        id: collection.id,
        title: collection.title,
        description: collection.description,
        skillCount: collection.skills.length,
        installedCount: collection.skills.filter((skillName) => getInstallState(installStateIndex, skillName).installed).length,
        startHere: getCollectionStartHere(collection),
        skills: collection.skills,
      }, fields)
    );
    const pagination = paginateItems(serializedCollections, options.limit, options.offset);

    emitJsonRecord('collections', {
      kind: 'summary',
      total: pagination.total,
      returned: pagination.returned,
      limit: pagination.limit,
      offset: pagination.offset,
      fields,
    });
    for (const collection of pagination.items) {
      emitJsonRecord('collections', {
        kind: 'item',
        collection,
      });
    }
    return;
  }

  if (collections.length === 0) {
    warn('No curated collections found in skills.json');
    return;
  }

  log(`\n${colors.bold}Curated Collections${colors.reset} (${collections.length} total)\n`);
  log(`${colors.dim}These are curated sets layered on top of the main work-area shelves. Some are starter stacks; some are full installable packs.${colors.reset}\n`);

  collections.forEach(collection => {
    const startHere = getCollectionStartHere(collection);
    const sample = collection.skills.slice(0, 4).join(', ');
    const more = collection.skills.length > 4 ? ', ...' : '';
    const installedCount = collection.skills.filter((skillName) => getInstallState(installStateIndex, skillName).installed).length;

    log(`${colors.blue}${colors.bold}${collection.title}${colors.reset} ${colors.dim}[${collection.id}]${colors.reset}`);
    log(`  ${colors.dim}${collection.description}${colors.reset}`);
    log(`  ${colors.dim}Start here:${colors.reset} ${startHere.join(', ')}`);
    log(`  ${colors.green}${collection.skills.length} skills${colors.reset} · ${installedCount} installed · ${sample}${more}`);
    log(`  ${colors.dim}npx ai-agent-skills list --collection ${collection.id}${colors.reset}\n`);
    log(`  ${colors.dim}npx ai-agent-skills install --collection ${collection.id} -p${colors.reset}\n`);
  });
}

function getBundledSkillFilePath(skillName, options = {}) {
  try {
    validateSkillName(skillName);
  } catch (e) {
    return null;
  }

  const sourceContext = options.sourceContext || getActiveLibraryContext();
  const data = options.data || loadSkillsJson();
  const skill = options.skill || data.skills.find((entry) => entry.name === skillName) || null;
  if (!skill || !shouldTreatCatalogSkillAsHouse(skill, sourceContext)) {
    const fallbackPath = path.join(getActiveSkillsDir(), skillName, 'SKILL.md');
    return fs.existsSync(fallbackPath) ? fallbackPath : null;
  }

  const skillPath = path.join(resolveCatalogSkillSourcePath(skillName, { sourceContext, skill }), 'SKILL.md');
  if (!fs.existsSync(skillPath)) {
    return null;
  }

  return skillPath;
}

function showPreview(skillName, options = {}) {
  const data = loadSkillsJson();
  const sourceContext = getActiveLibraryContext();
  const selectedSkill = data.skills.find((entry) => entry.name === skillName) || null;
  const skillPath = getBundledSkillFilePath(skillName, {
    sourceContext,
    data,
    skill: selectedSkill,
  });

  if (!skillPath) {
    // Check if it's a non-vendored cataloged skill
    try {
      const cataloged = data.skills.find(s => s.name === skillName && s.tier === 'upstream');
      if (cataloged) {
        const safeDescription = sanitizeSkillContent(cataloged.description || '');
        const safeWhyHere = sanitizeSkillContent(cataloged.whyHere || '');
        const sanitized = safeDescription.sanitized || safeWhyHere.sanitized;
        if (isJsonOutput()) {
          setJsonResultData(applyTopLevelFieldMask({
            name: skillName,
            sourceType: 'upstream',
            description: safeDescription.content,
            whyHere: safeWhyHere.content,
            installSource: cataloged.installSource || cataloged.source,
            content: null,
            sanitized,
          }, options.fields));
          return;
        }
        log(`\n${colors.bold}Preview:${colors.reset} ${skillName}\n`);
        if (sanitized) {
          warn('Preview content was sanitized to remove suspicious instructions.');
        }
        log(safeDescription.content);
        if (safeWhyHere.content) {
          log(`\n${colors.dim}${safeWhyHere.content}${colors.reset}`);
        }
        const src = cataloged.installSource || cataloged.source;
        log(`\n${colors.dim}Cataloged upstream skill. Install pulls live from: ${src}${colors.reset}`);
        return;
      }
    } catch {}
    if (isJsonOutput()) {
      process.exitCode = 1;
      emitJsonEnvelope('preview', {
        name: skillName,
      }, [{
        code: 'SKILL',
        message: `Skill "${skillName}" not found.`,
        hint: null,
      }], { status: 'error' });
      return;
    }
    error(`Skill "${skillName}" not found.`);
    return;
  }

  const preview = sanitizeSkillContent(fs.readFileSync(skillPath, 'utf8'));

  if (isJsonOutput()) {
    setJsonResultData(applyTopLevelFieldMask({
      name: skillName,
      sourceType: 'house',
      path: skillPath,
      content: preview.content,
      sanitized: preview.sanitized,
    }, options.fields));
    return;
  }

  log(`\n${colors.bold}Preview:${colors.reset} ${skillName}\n`);
  if (preview.sanitized) {
    warn('Preview content was sanitized to remove suspicious instructions.');
  }
  log(preview.content);
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

function promptConfirm(label, defaultYes = true) {
  if (!isInteractiveTerminal()) {
    return Promise.resolve(defaultYes);
  }

  const rl = createPromptInterface();
  const suffix = defaultYes ? ' [Y/n]' : ' [y/N]';

  return new Promise((resolve) => {
    rl.question(`${label}${suffix}: `, (answer) => {
      rl.close();
      const normalized = String(answer || '').trim().toLowerCase();
      if (!normalized) {
        resolve(defaultYes);
        return;
      }
      resolve(normalized === 'y' || normalized === 'yes');
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
      fields.collections = await promptLine(
        rl,
        'Collections (comma-separated)',
        Array.isArray(fields.collections) ? fields.collections.join(', ') : fields.collections || ''
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
  if (parsed.collection !== null) changes.collectionsAdd = parsed.collection;
  if (parsed.collectionRemove !== null) changes.collectionsRemove = parsed.collectionRemove;

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
    if (parsed.ref) {
      return cleanRelativeDir
        ? `https://github.com/${repoId}/tree/${parsed.ref}/${cleanRelativeDir}`
        : `https://github.com/${repoId}/tree/${parsed.ref}`;
    }
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

function getLibraryRepoProvenance(parsed) {
  if (!parsed) return null;
  if (parsed.type === 'github') {
    return buildRepoId(parsed);
  }
  return null;
}

function getCatalogSkillSourceRef(skill, { sourceContext = getActiveLibraryContext(), sourceParsed = null } = {}) {
  if (shouldTreatCatalogSkillAsHouse(skill, sourceContext)) {
    if (sourceParsed) {
      return buildInstallSourceRef(sourceParsed, getCatalogSkillRelativePath(skill));
    }
    return resolveCatalogSkillSourcePath(skill.name, { sourceContext, skill });
  }
  return skill.installSource || skill.source || '';
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
  const context = requireEditableLibraryContext('catalog');
  if (!context) {
    return false;
  }
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
      collections: options.collections || '',
    }, {
      mode: 'catalog',
      title: 'Add upstream skill to the library',
      promptOptional: true,
      allowDescriptionPrompt: !(options.description || target.description),
      skillName: target.name,
      sourceLabel: buildRepoId(parsed) || source,
    });

    if (options.dryRun) {
      const entry = buildUpstreamCatalogEntry({
        source,
        parsed,
        discoveredSkill: target,
        fields,
        existingCatalog: data,
      });
      const collectionIds = normalizeListInput(fields.collections);
      emitDryRunResult('catalog', [
        {
          type: 'catalog-entry',
          target: `Catalog ${entry.name} from ${entry.source}`,
          detail: `${formatWorkAreaTitle(entry.workArea)} / ${entry.branch}`,
        },
        ...(collectionIds.length > 0 ? [{
          type: 'collection-membership',
          target: `Add ${entry.name} to collections`,
          detail: collectionIds.join(', '),
        }] : []),
      ], {
        command: 'catalog',
        entry,
        collections: collectionIds,
      });
      return true;
    }

    const nextData = addUpstreamSkillFromDiscovery({
      source,
      parsed,
      discoveredSkill: target,
      fields,
    }, context);

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
  const context = requireEditableLibraryContext('vendor');
  if (!context) {
    return false;
  }
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
      collections: options.collections || '',
      lastCurated: currentCatalogTimestamp(),
    }, {
      mode: 'vendor',
      title: 'Create house copy',
      promptOptional: true,
      allowDescriptionPrompt: !(options.description || target.description),
      skillName: target.name,
      sourceLabel,
    });

    const catalog = loadCatalogData(context);
    if (findSkillByName(catalog, rawEntry.name)) {
      throw new Error(`Skill "${rawEntry.name}" already exists in the catalog`);
    }

    const entry = buildHouseCatalogEntry(rawEntry, catalog);
    const destDir = path.join(context.skillsDir, entry.name);
    tempDestDir = path.join(context.skillsDir, `.${entry.name}.tmp-${Date.now()}`);

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
      addHouseSkillEntry(entry, context);
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

async function addBundledSkillToWorkspace(skillName, options = {}) {
  const context = requireWorkspaceContext('add');
  if (!context) {
    return false;
  }

  const bundledSkill = getBundledCatalogSkill(skillName);
  if (!bundledSkill) {
    error(`Bundled skill "${skillName}" not found.`);
    process.exitCode = 1;
    return false;
  }

  const workspaceData = loadCatalogData(context);
  if (findSkillByName(workspaceData, bundledSkill.name)) {
    error(`Skill "${bundledSkill.name}" already exists in this workspace.`);
    process.exitCode = 1;
    return false;
  }

  try {
    const fields = await promptForEditorialFields({
      category: options.category || bundledSkill.category || 'development',
      workArea: options.area || '',
      branch: options.branch || '',
      whyHere: options.whyHere || '',
      tags: Array.isArray(bundledSkill.tags) ? bundledSkill.tags.join(', ') : '',
      labels: Array.isArray(bundledSkill.labels) ? bundledSkill.labels.join(', ') : '',
      notes: options.notes || '',
      trust: options.trust || 'listed',
      collections: options.collections || '',
    }, {
      mode: 'add',
      title: 'Add bundled skill to this workspace',
      promptOptional: true,
      skillName: bundledSkill.name,
      sourceLabel: bundledSkill.source,
    });

    const collectionIds = ensureCollectionIdsExist(fields.collections, workspaceData);
    const entry = buildImportedCatalogEntryFromBundledSkill(bundledSkill, fields);

    if (options.dryRun) {
      emitDryRunResult('add', [
        {
          type: 'catalog-entry',
          target: `Add ${entry.name} to workspace catalog`,
          detail: `${formatWorkAreaTitle(entry.workArea)} / ${entry.branch}`,
        },
        ...(collectionIds.length > 0 ? [{
          type: 'collection-membership',
          target: `Add ${entry.name} to collections`,
          detail: collectionIds.join(', '),
        }] : []),
      ], {
        command: 'add',
        entry,
        collections: collectionIds,
      });
      return true;
    }

    commitCatalogData({
      ...workspaceData,
      updated: currentCatalogTimestamp(),
      skills: [...workspaceData.skills, entry],
      collections: addSkillToCollections(workspaceData.collections, entry.name, collectionIds),
    }, context);

    success(`Added ${entry.name} to the workspace library`);
    log(`${colors.dim}${formatWorkAreaTitle(entry.workArea)} / ${entry.branch} · ${entry.source}${colors.reset}`);
    return true;
  } catch (err) {
    error(err && err.message ? err.message : String(err));
    process.exitCode = 1;
    return false;
  }
}

async function addSkillToWorkspace(source, options = {}) {
  const context = requireWorkspaceContext('add');
  if (!context) {
    return false;
  }

  const parsed = parseSource(source);
  if (!parsed || parsed.type === 'catalog') {
    return addBundledSkillToWorkspace(source, options);
  }

  if (parsed.type === 'github') {
    return catalogSkills(source, options);
  }

  return vendorSkill(source, options);
}

function runCurateCommand(skillName, parsed) {
  const context = requireEditableLibraryContext('curate');
  if (!context) {
    return false;
  }
  if (!skillName) {
    error('Please specify a skill name or "review".');
    log('Usage: npx ai-agent-skills curate <skill-name> [flags]');
    log('       npx ai-agent-skills curate review');
    process.exitCode = 1;
    return false;
  }

  if (skillName === 'review') {
    const queue = buildReviewQueue(loadCatalogData(context));
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
    const data = loadCatalogData(context);
    const target = findSkillByName(data, skillName);
    if (!target) {
      error(`Skill "${skillName}" not found in catalog.`);
      process.exitCode = 1;
      return false;
    }
    if (parsed.dryRun) {
      emitDryRunResult('curate', [
        {
          type: 'remove-skill',
          target: `Remove ${skillName} from the library`,
          detail: target.tier === 'house' ? 'Also delete house-copy files from skills/' : 'Catalog metadata only',
        },
      ], {
        command: 'curate',
        skillName,
        remove: true,
      });
      return true;
    }
    removeSkillFromCatalog(skillName, context);
    if (target.tier === 'house') {
      const bundledDir = resolveCatalogSkillSourcePath(skillName, { sourceContext: context, skill: target });
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
    log('Use flags like --area, --branch, --why, --notes, --tags, --labels, --collection, --remove-from-collection, --trust, --feature, or --remove --yes.');
    process.exitCode = 1;
    return false;
  }

  if (parsed.dryRun) {
    const data = loadCatalogData(context);
    const target = findSkillByName(data, skillName);
    if (!target) {
      error(`Skill "${skillName}" not found in catalog.`);
      process.exitCode = 1;
      return false;
    }
    const next = applyCurateChanges(target, changes, data);
    const actions = [
      {
        type: 'update-skill',
        target: `Update ${skillName}`,
        detail: `${formatWorkAreaTitle(next.workArea)} / ${next.branch}`,
      },
    ];
    if (changes.collectionsAdd) {
      actions.push({
        type: 'collection-membership',
        target: `Add ${skillName} to collections`,
        detail: normalizeListInput(changes.collectionsAdd).join(', '),
      });
    }
    if (changes.collectionsRemove) {
      actions.push({
        type: 'collection-removal',
        target: `Remove ${skillName} from collections`,
        detail: normalizeListInput(changes.collectionsRemove).join(', '),
      });
    }
    emitDryRunResult('curate', actions, {
      command: 'curate',
      skill: next,
      changes,
    });
    return true;
  }

  curateSkill(skillName, changes, context);
  success(`Updated ${skillName}`);
  return true;
}

// v3: classify git clone errors for actionable messages
function classifyGitError(message) {
  return classifyGitErrorLib(message);
}

// v3: copy skill files with appropriate skip list
function copySkillFiles(srcDir, destDir, sandboxRoot) {
  const skipList = ['.git', 'node_modules', '__pycache__', '__pypackages__', 'metadata.json'];

  if (sandboxRoot) sandboxOutputPath(destDir, sandboxRoot);
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

function defaultImportClassification(workAreas) {
  const workAreaIds = new Set((workAreas || []).map((area) => area.id));
  return {
    workArea: workAreaIds.has('workflow') ? 'workflow' : (workAreas[0]?.id || 'workflow'),
    autoClassified: false,
    needsCuration: true,
  };
}

function buildImportedSkillEntry(candidate, workspaceData, options = {}) {
  const classification = options.autoClassify
    ? classifyImportedSkill(candidate, workspaceData.workAreas || [])
    : defaultImportClassification(workspaceData.workAreas || []);
  const labels = ['imported'];
  if (classification.needsCuration) {
    labels.push('needs-curation');
  }

  const sourceLabel = workspaceData.librarySlug || slugifyLibraryName(workspaceData.libraryName || path.basename(options.context.rootDir));
  const notePrefix = options.inPlace
    ? `Imported in place from ${candidate.relativeDir}.`
    : `Copied from ${path.join(options.importRoot, candidate.relativeDir)}.`;
  const whyHere = options.bootstrap
    ? 'Imported from an existing private skill library during workspace bootstrap.'
    : 'Imported from an existing private skill library into this managed workspace.';

  return {
    entry: buildHouseCatalogEntry({
      name: candidate.name,
      description: candidate.description,
      category: 'development',
      workArea: classification.workArea,
      branch: 'Imported',
      author: String(candidate.frontmatter.author || 'workspace').trim(),
      source: sourceLabel,
      license: String(candidate.frontmatter.license || 'MIT').trim(),
      path: options.inPlace ? candidate.relativeDir : `skills/${candidate.name}`,
      tier: 'house',
      distribution: 'bundled',
      vendored: true,
      installSource: '',
      tags: Array.isArray(candidate.frontmatter.tags) ? candidate.frontmatter.tags : [],
      featured: false,
      verified: true,
      origin: 'authored',
      trust: 'verified',
      syncMode: 'authored',
      sourceUrl: '',
      whyHere,
      addedDate: currentIsoDay(),
      lastVerified: currentIsoDay(),
      notes: `${notePrefix}${classification.needsCuration ? ' Needs work area review.' : ''}`,
      labels,
      lastCurated: currentCatalogTimestamp(),
    }, workspaceData),
    classification,
  };
}

function emitImportResult(result, options = {}) {
  if (isJsonOutput()) {
    setJsonResultData(result);
    return;
  }

  if (options.dryRun) {
    log(`\n${colors.bold}Dry Run${colors.reset} (no changes made)\n`);
  }

  log(`${colors.bold}Import Summary${colors.reset}`);
  log(`  Root: ${result.rootDir}`);
  log(`  Imported: ${result.importedCount}`);
  log(`  Copied: ${result.copiedCount}`);
  log(`  In place: ${result.inPlaceCount}`);
  log(`  Auto-classified: ${result.autoClassifiedCount}`);
  log(`  Needs curation: ${result.needsCurationCount}`);
  log(`  Skipped: ${result.skippedCount}`);
  log(`  Failed: ${result.failedCount}`);

  if (result.skipped.length > 0) {
    log(`\n${colors.bold}Skipped${colors.reset}`);
    result.skipped.slice(0, 10).forEach((item) => {
      log(`  ${colors.yellow}${item.name || item.path}${colors.reset} ${colors.dim}- ${item.reason}${colors.reset}`);
    });
    if (result.skipped.length > 10) {
      log(`  ${colors.dim}...and ${result.skipped.length - 10} more${colors.reset}`);
    }
  }

  if (result.failures.length > 0) {
    log(`\n${colors.bold}Failed${colors.reset}`);
    result.failures.slice(0, 10).forEach((item) => {
      log(`  ${colors.red}${item.path}${colors.reset} ${colors.dim}- ${item.reason}${colors.reset}`);
    });
    if (result.failures.length > 10) {
      log(`  ${colors.dim}...and ${result.failures.length - 10} more${colors.reset}`);
    }
  }
}

function importWorkspaceSkills(importPath = null, options = {}) {
  const context = options.context || requireWorkspaceContext('import');
  if (!context) {
    log(`${colors.dim}Hint: run npx ai-agent-skills init-library . --import from the root of an existing skill repo.${colors.reset}`);
    return false;
  }

  try {
    const importRoot = path.resolve(importPath || context.rootDir);
    if (!fs.existsSync(importRoot)) {
      error(`Import path not found: ${importRoot}`);
      process.exitCode = 1;
      return false;
    }

    const workspaceData = loadCatalogData(context);
    const discovery = discoverImportCandidates(importRoot);
    const inPlace = importRoot === context.rootDir;
    const planned = [];
    const skipped = [...discovery.skipped];
    const failures = [...discovery.failures];
    let nextData = workspaceData;

    for (const candidate of discovery.discovered) {
      if (findSkillByName(nextData, candidate.name)) {
        skipped.push({
          name: candidate.name,
          path: candidate.relativeDir,
          reason: 'Skill already exists in the workspace catalog.',
        });
        continue;
      }

      const targetDir = inPlace
        ? resolveCatalogSkillSourcePath(candidate.name, {
            sourceContext: context,
            skill: { name: candidate.name, path: candidate.relativeDir },
          })
        : path.join(context.skillsDir, candidate.name);

      if (!inPlace && fs.existsSync(targetDir)) {
        skipped.push({
          name: candidate.name,
          path: candidate.relativeDir,
          reason: `Destination already exists at skills/${candidate.name}.`,
        });
        continue;
      }

      const built = buildImportedSkillEntry(candidate, nextData, {
        context,
        importRoot,
        inPlace,
        autoClassify: options.autoClassify,
        bootstrap: options.bootstrap,
      });

      planned.push({
        candidate,
        entry: built.entry,
        classification: built.classification,
        targetDir,
      });
      nextData = {
        ...nextData,
        skills: [...nextData.skills, built.entry],
      };
    }

    const summary = {
      command: 'import',
      rootDir: importRoot,
      importedCount: 0,
      copiedCount: 0,
      inPlaceCount: 0,
      autoClassifiedCount: 0,
      needsCurationCount: 0,
      skippedCount: skipped.length,
      failedCount: failures.length,
      imported: [],
      skipped,
      failures,
    };

    if (options.dryRun) {
      for (const item of planned) {
        summary.imported.push({
          name: item.entry.name,
          path: item.entry.path,
          workArea: item.entry.workArea,
          copied: !inPlace,
          autoClassified: item.classification.autoClassified,
          needsCuration: item.classification.needsCuration,
        });
      }
      summary.importedCount = planned.length;
      summary.copiedCount = planned.filter((item) => !inPlace).length;
      summary.inPlaceCount = planned.filter((item) => inPlace).length;
      summary.autoClassifiedCount = planned.filter((item) => item.classification.autoClassified).length;
      summary.needsCurationCount = planned.filter((item) => item.classification.needsCuration).length;
      emitImportResult(summary, { dryRun: true });
      return true;
    }

    const entriesToCommit = [];
    const copiedDirs = [];
    for (const item of planned) {
      if (!inPlace) {
        const tempDestDir = path.join(context.skillsDir, `.${item.entry.name}.tmp-${Date.now()}`);
        try {
          copySkillFiles(item.candidate.dirPath, tempDestDir, context.rootDir);
          fs.renameSync(tempDestDir, item.targetDir);
          copiedDirs.push(item.targetDir);
        } catch (copyError) {
          fs.rmSync(tempDestDir, { recursive: true, force: true });
          failures.push({
            path: item.candidate.relativeDir,
            reason: `Copy failed: ${copyError.message}`,
          });
          continue;
        }
      }

      entriesToCommit.push(item.entry);
      summary.imported.push({
        name: item.entry.name,
        path: item.entry.path,
        workArea: item.entry.workArea,
        copied: !inPlace,
        autoClassified: item.classification.autoClassified,
        needsCuration: item.classification.needsCuration,
      });
    }

    if (entriesToCommit.length > 0) {
      try {
        commitCatalogData({
          ...workspaceData,
          updated: currentCatalogTimestamp(),
          skills: [...workspaceData.skills, ...entriesToCommit],
        }, context, {
          preserveWorkAreas: Boolean(options.preserveWorkAreas),
        });
      } catch (commitError) {
        copiedDirs.forEach((dirPath) => fs.rmSync(dirPath, { recursive: true, force: true }));
        throw commitError;
      }
    }

    summary.importedCount = entriesToCommit.length;
    summary.copiedCount = summary.imported.filter((item) => item.copied).length;
    summary.inPlaceCount = summary.imported.filter((item) => !item.copied).length;
    summary.autoClassifiedCount = summary.imported.filter((item) => item.autoClassified).length;
    summary.needsCurationCount = summary.imported.filter((item) => item.needsCuration).length;
    summary.skippedCount = skipped.length;
    summary.failedCount = failures.length;

    emitImportResult(summary);
    return true;
  } catch (err) {
    error(err && err.message ? err.message : String(err));
    process.exitCode = 1;
    return false;
  }
}

function getSourceLabel(parsed, fallbackSource = '') {
  if (!parsed) return String(fallbackSource || '');
  if (parsed.type === 'github') {
    return buildRepoId(parsed) || String(fallbackSource || '');
  }
  if (parsed.type === 'git') {
    return sanitizeGitUrl(parsed.url);
  }
  if (parsed.type === 'local') {
    return expandPath(parsed.url);
  }
  return String(fallbackSource || '');
}

function printRemoteWorkspaceList(sourceLabel, data, skills, options = {}) {
  const entries = Array.isArray(skills) ? skills : [];

  if (isJsonOutput()) {
    const fields = parseFieldMask(options.fields, DEFAULT_REMOTE_INSTALL_LIST_JSON_FIELDS);
    const serializedSkills = entries.map((skill) =>
      selectObjectFields({
        name: skill.name,
        tier: skill.tier,
        workArea: skill.workArea || '',
        branch: skill.branch || '',
        whyHere: skill.whyHere || '',
        description: skill.description || '',
      }, fields)
    );
    const pagination = paginateItems(serializedSkills, options.limit, options.offset);

    emitJsonRecord('install', {
      kind: 'summary',
      source: sourceLabel,
      total: pagination.total,
      returned: pagination.returned,
      limit: pagination.limit,
      offset: pagination.offset,
      fields,
    });
    for (const skill of pagination.items) {
      emitJsonRecord('install', {
        kind: 'item',
        skill,
      });
    }
    return;
  }

  if (isMachineReadableOutput()) {
    emitMachineLine('LIBRARY', [sourceLabel, entries.length]);
    for (const skill of entries) {
      emitMachineLine('SKILL', [
        skill.name,
        skill.tier,
        skill.workArea || '',
        skill.branch || '',
        skill.whyHere || '',
      ]);
    }
    return;
  }

  log(`\n${colors.bold}${sourceLabel}${colors.reset} (${entries.length} skills)\n`);
  for (const skill of entries) {
    log(`  ${colors.green}${skill.name}${colors.reset}\t${colors.dim}${skill.tier}${colors.reset}\t${skill.workArea || ''}\t${skill.whyHere || ''}`);
  }
}

function emitInstallSourceListJson(sourceLabel, discovered, options = {}) {
  const fields = parseFieldMask(options.fields, DEFAULT_INSTALL_LIST_JSON_FIELDS);
  const serializedSkills = discovered.map((skill) =>
    selectObjectFields({
      name: skill.name,
      description: skill.description || '',
      relativeDir: skill.relativeDir && skill.relativeDir !== '.' ? skill.relativeDir : null,
    }, fields)
  );
  const pagination = paginateItems(serializedSkills, options.limit, options.offset);

  emitJsonRecord('install', {
    kind: 'summary',
    source: sourceLabel,
    total: pagination.total,
    returned: pagination.returned,
    limit: pagination.limit,
    offset: pagination.offset,
    fields,
  });

  for (const skill of pagination.items) {
    emitJsonRecord('install', {
      kind: 'item',
      skill,
    });
  }
}

async function installFromWorkspaceSource(source, parsed, prepared, installPaths, {
  skillFilters = [],
  collectionId = null,
  listMode = false,
  yes = false,
  dryRun = false,
  noDeps = false,
  readOptions = {},
} = {}) {
  const remoteContext = createLibraryContext(prepared.rootDir, 'workspace');
  const remoteData = loadCatalogData(remoteContext);
  const sourceLabel = getSourceLabel(parsed, source);
  const libraryRepo = getLibraryRepoProvenance(parsed);
  const validationErrors = validateRemoteWorkspaceCatalog(remoteData);

  if (validationErrors.length > 0) {
    emitActionableError(
      `Remote library catalog is invalid: ${sourceLabel}`,
      `Run \`npx ai-agent-skills validate\` inside the shared library and fix: ${validationErrors[0]}`,
      { code: 'CATALOG' }
    );
    process.exitCode = 1;
    return false;
  }

  if (collectionId && skillFilters.length > 0) {
    emitActionableError(
      'Cannot combine --collection and --skill',
      'Choose one selection mode and retry.',
      { code: 'INVALID_FLAGS' }
    );
    process.exitCode = 1;
    return false;
  }

  let requestedNames;
  let selectedSkills;

  if (collectionId) {
    const resolution = resolveCollection(remoteData, collectionId);
    if (!resolution.collection) {
      emitActionableError(
        resolution.message || `Unknown collection "${collectionId}"`,
        `Run: npx ai-agent-skills install ${source} --list`,
        { code: 'COLLECTION' }
      );
      process.exitCode = 1;
      return false;
    }
    selectedSkills = getCollectionSkillsInOrder(remoteData, resolution.collection);
    requestedNames = selectedSkills.map((skill) => skill.name);
  } else if (skillFilters.length > 0) {
    selectedSkills = [];
    for (const filter of uniqueSkillFilters(skillFilters)) {
      const match = findSkillByName(remoteData, filter);
      if (!match) {
        emitActionableError(
          `Skill "${filter}" not found in ${sourceLabel}`,
          `Run: npx ai-agent-skills install ${source} --list`,
          { code: 'SKILL' }
        );
        process.exitCode = 1;
        return false;
      }
      selectedSkills.push(match);
    }
    requestedNames = selectedSkills.map((skill) => skill.name);
  } else {
    selectedSkills = remoteData.skills;
    requestedNames = selectedSkills.map((skill) => skill.name);
  }

  selectedSkills = selectedSkills.map((skill) => ({
    ...skill,
    tier: shouldTreatCatalogSkillAsHouse(skill, remoteContext) ? 'house' : 'upstream',
  }));

  if (listMode) {
    printRemoteWorkspaceList(sourceLabel, remoteData, selectedSkills, readOptions);
    return true;
  }

  if (requestedNames.length === 0) {
    emitActionableError(
      `No installable skills found in ${sourceLabel}`,
      'Add skills to the shared library first, then retry.',
      { code: 'EMPTY' }
    );
    process.exitCode = 1;
    return false;
  }

  if (!collectionId && skillFilters.length === 0 && requestedNames.length > 1 && !yes && process.stdin.isTTY) {
    const confirmed = await promptConfirm(`Install all ${requestedNames.length} skills from ${sourceLabel}`, true);
    if (!confirmed) {
      warn('Install cancelled.');
      return false;
    }
  }

  const plan = getCatalogInstallPlan(remoteData, requestedNames, noDeps);
  return installCatalogPlan(plan, installPaths, {
    dryRun,
    title: `Installing ${sourceLabel}`,
    summaryLine: dryRun ? `Would install from ${sourceLabel}` : null,
    sourceContext: remoteContext,
    sourceParsed: parsed,
    libraryRepo,
    parseable: isMachineReadableOutput(),
  });
}

// v3: main source-repo install flow
async function installFromSource(source, parsed, installPaths, skillFilters, listMode, yes, dryRun, options = {}) {
  let prepared = null;

  try {
    const deferCloneInfo = parsed.type !== 'local' && isMachineReadableOutput() && (listMode || dryRun);
    if (parsed.type !== 'local' && !deferCloneInfo) {
      info(`Cloning ${source}...`);
    }

    prepared = prepareSourceLib(source, {
      parsed,
      sparseSubpath: parsed.subpath || null,
    });

    const isWorkspaceSource = options.allowWorkspaceCatalog !== false && isManagedWorkspaceRoot(prepared.rootDir);
    if (deferCloneInfo && !isWorkspaceSource) {
      info(`Cloning ${source}...`);
    }

    if (isWorkspaceSource) {
      return installFromWorkspaceSource(source, parsed, prepared, installPaths, {
        skillFilters,
        collectionId: options.collectionId || null,
        listMode,
        yes,
        dryRun,
        noDeps: options.noDeps || false,
        readOptions: options.readOptions || {},
      });
    }

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
      if (isJsonOutput()) {
        emitInstallSourceListJson(getSourceLabel(parsed, source), discovered, options.readOptions || {});
        return true;
      }
      log(`\n${colors.bold}Available Skills${colors.reset} (${discovered.length} found)\n`);
      for (const skill of discovered) {
        log(`  ${colors.green}${skill.name}${colors.reset}`);
        if (skill.description) {
          log(`    ${colors.dim}${skill.description}${colors.reset}`);
        }
      }
      log(`\n${colors.dim}Install: npx ai-agent-skills ${source} --skill <name>${colors.reset}`);
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
            ...(options.additionalInstallMeta || {}),
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
  } catch (e) {
    const message = e && e.message ? e.message : String(e);
    emitActionableError(
      message,
      message.toLowerCase().includes('credential') || message.toLowerCase().includes('authentication')
        ? 'Check your GitHub credentials or repo access.'
        : 'Retry with --dry-run or --list to inspect the source first.',
      {
        code: message.toLowerCase().includes('credential') || message.toLowerCase().includes('authentication') ? 'AUTH' : 'SOURCE',
      }
    );
    process.exitCode = 1;
    return false;
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
  const libraryHint = getLibraryModeHint();
  const activeLibraryLine = libraryHint ? `\n${libraryHint}\n` : '\n';
  log(`
${colors.bold}AI Agent Skills${colors.reset}
Curated agent skills library and installer${activeLibraryLine}

${colors.bold}Usage:${colors.reset}
  npx ai-agent-skills [command] [options]

${colors.bold}Commands:${colors.reset}
  ${colors.green}browse${colors.reset}                Browse the library in the terminal
  ${colors.green}swift${colors.reset}                 Install the curated Swift hub
  ${colors.green}install <source>${colors.reset}      Install skills from the library, a collection, GitHub, git URL, or a local path
  ${colors.green}add <source>${colors.reset}          Add a bundled pick, upstream repo skill, or house copy to a workspace
  ${colors.green}list${colors.reset}                  List catalog skills
  ${colors.green}search <query>${colors.reset}        Search the catalog
  ${colors.green}info <name>${colors.reset}           Show skill details and provenance
  ${colors.green}preview <name>${colors.reset}        Preview a skill's content
  ${colors.green}collections${colors.reset}           Browse curated collections
  ${colors.green}curate <name>${colors.reset}         Edit shelf placement and catalog metadata
  ${colors.green}uninstall <name>${colors.reset}      Remove an installed skill
  ${colors.green}sync [name]${colors.reset}           Refresh installed skills
  ${colors.green}update [name]${colors.reset}         Compatibility alias for sync
  ${colors.green}check${colors.reset}                 Check for available updates
  ${colors.green}init [name]${colors.reset}           Create a new SKILL.md template
  ${colors.green}init-library <name>${colors.reset}   Create a managed library workspace
  ${colors.green}import [path]${colors.reset}         Import local skills into the active managed workspace
  ${colors.green}build-docs${colors.reset}            Regenerate README.md and WORK_AREAS.md in a workspace
  ${colors.green}config${colors.reset}                Manage CLI settings
  ${colors.green}catalog <repo>${colors.reset}       Add upstream skills to the catalog (no local copy)
  ${colors.green}vendor <source>${colors.reset}       Create a house copy from an explicit source
  ${colors.green}doctor${colors.reset}                Diagnose install issues
  ${colors.green}validate [path]${colors.reset}       Validate a skill directory
  ${colors.green}describe <command>${colors.reset}     Show machine-readable schema for one command

${colors.bold}Scopes:${colors.reset}
  ${colors.cyan}(default)${colors.reset}             ~/.claude/skills/        Global, available everywhere
  ${colors.cyan}-p, --project${colors.reset}         .agents/skills/          Project, committed with your repo

${colors.bold}Source formats:${colors.reset}
  swift                                          Install the Swift hub (default global targets)
  install pdf                                    From this library
  install --collection swift-agent-skills        Install a curated collection
  anthropics/skills                              Direct repo install (default global targets)
  ./local-path                                   Direct local repo install (default global targets)
  install anthropics/skills                      All skills from a GitHub repo
  install anthropics/skills@frontend-design      One skill from a repo
  install anthropics/skills --skill pdf          Select specific skills
  install anthropics/skills --list               List skills without installing
  install ./local-path                           From a local directory

${colors.bold}Options:${colors.reset}
  ${colors.cyan}-g, --global${colors.reset}          Install to global scope (default)
  ${colors.cyan}-p, --project${colors.reset}         Install to project scope (.agents/skills/)
  ${colors.cyan}--collection <id>${colors.reset}     Install or filter a curated collection
  ${colors.cyan}--skill <name>${colors.reset}        Select specific skills from a source
  ${colors.cyan}--list${colors.reset}                List available skills without installing
  ${colors.cyan}--yes${colors.reset}                 Skip prompts (for CI/CD)
  ${colors.cyan}--all${colors.reset}                 Install to both global and project scopes
  ${colors.cyan}--dry-run${colors.reset}             Show what would be installed
  ${colors.cyan}--no-deps${colors.reset}             Skip dependency expansion for catalog installs
  ${colors.cyan}--agent <name>${colors.reset}        Install to a specific agent path (legacy)
  ${colors.cyan}--format <text|json>${colors.reset}  Select output format
  ${colors.cyan}help --json${colors.reset}            Emit machine-readable CLI schema

${colors.bold}Use it from an agent:${colors.reset}
  Any Agent Skills-compatible agent with shell access can run this CLI directly
  Prompts are optional. In non-TTY flows, pass explicit metadata like --area, --branch, and --why

${colors.bold}Categories:${colors.reset}
  development, document, creative, business, productivity

${colors.bold}Examples:${colors.reset}
  npx ai-agent-skills                            Launch the terminal browser
  npx ai-agent-skills swift                      Install the Swift hub to the default global targets
  npx ai-agent-skills install frontend-design    Install to ~/.claude/skills/
  npx ai-agent-skills install pdf -p             Install to .agents/skills/
  npx ai-agent-skills install --collection swift-agent-skills -p
  npx ai-agent-skills init-library my-library    Create a managed workspace
  npx ai-agent-skills init-library . --areas "mobile,workflow,research" --import
  npx ai-agent-skills add frontend-design --area frontend --branch Implementation --why "I want this in my own library."
  npx ai-agent-skills import --auto-classify     Import skills from the active workspace root
  npx ai-agent-skills install frontend-design -p Install one workspace pick to project scope
  npx ai-agent-skills sync frontend-design -p    Refresh one installed skill in project scope
  npx ai-agent-skills build-docs                 Regenerate workspace docs
  npx ai-agent-skills anthropics/skills          Install repo skills to the default global targets
  npx ai-agent-skills install anthropics/skills  Install all skills from repo
  npx ai-agent-skills search workflow            Search the catalog
  npx ai-agent-skills curate frontend-design --branch Implementation
  npx ai-agent-skills curate review
  npx ai-agent-skills vendor ~/repo --skill my-skill --area frontend --branch React --why "I want the local copy."

${colors.bold}Legacy agents:${colors.reset}
  Still supported via --agent <name>: cursor, amp, codex, gemini, goose, opencode, letta, kilocode

${colors.bold}More info:${colors.reset}
  Use ${colors.cyan}list${colors.reset} and ${colors.cyan}collections${colors.reset} to inspect the active library
  https://github.com/MoizIbnYousaf/Ai-Agent-Skills
`);
}

function showInfo(skillName, options = {}) {
  const data = loadSkillsJson();
  const installStateIndex = buildInstallStateIndex();
  const dependencyGraph = buildDependencyGraph(data);
  const skill = data.skills.find(s => s.name === skillName);
  const similar = !skill
    ? data.skills
        .filter(s => s.name.includes(skillName) || skillName.includes(s.name))
        .slice(0, 3)
        .map((candidate) => candidate.name)
    : [];

  if (!skill) {
    if (isJsonOutput()) {
      process.exitCode = 1;
      emitJsonEnvelope('info', {
        name: skillName,
        suggestions: similar,
      }, [{
        code: 'SKILL',
        message: `Skill "${skillName}" not found.`,
        hint: similar.length > 0 ? `Did you mean: ${similar.join(', ')}?` : null,
      }], { status: 'error' });
      return;
    }

    error(`Skill "${skillName}" not found.`);
    if (similar.length > 0) {
      log(`\n${colors.dim}Did you mean: ${similar.join(', ')}?${colors.reset}`);
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
  const sourceUrl = skill.sourceUrl || null;
  const safeDescription = sanitizeSkillContent(skill.description || '');
  const safeWhyHere = sanitizeSkillContent(skill.whyHere || 'This skill still earns a place in the library.');
  const safeNotes = sanitizeSkillContent(skill.notes || '');
  const whyHere = safeWhyHere.content;
  const alsoLookAt = getSiblingRecommendations(data, skill, 3).map(candidate => candidate.name).join(', ') || 'none';
  const alsoLookAtList = getSiblingRecommendations(data, skill, 3).map(candidate => candidate.name);
  const upstreamInstall = getGitHubInstallSpec(skill, 'cursor');
  const installStateLabel = getInstallStateText(skill.name, installStateIndex) || 'not installed in the standard scopes';
  const dependsOn = dependencyGraph.requiresMap.get(skill.name) || [];
  const usedBy = dependencyGraph.requiredByMap.get(skill.name) || [];
  const lastVerifiedLine = skill.lastVerified
    ? `${colors.bold}Last Verified:${colors.reset} ${skill.lastVerified}\n`
    : '';
  const labelsLine = Array.isArray(skill.labels) && skill.labels.length > 0
    ? `${colors.bold}Labels:${colors.reset}      ${skill.labels.join(', ')}\n`
    : '';
  const notesLine = skill.notes
    ? `${colors.bold}Notes:${colors.reset}       ${safeNotes.content}\n`
    : '';
  const infoFieldMask = parseFieldMask(options.fields);

  if (isJsonOutput()) {
    const payload = {
      name: skill.name,
      description: safeDescription.content,
      skill: {
        ...serializeSkillForJson(data, skill, installStateIndex),
        sourceUrl,
        syncMode,
        author: skill.author || null,
        license: skill.license || null,
        labels: Array.isArray(skill.labels) ? skill.labels : [],
        notes: safeNotes.content,
        lastVerified: skill.lastVerified || null,
        lastUpdated: skill.lastUpdated || null,
      },
      collections: getCollectionsForSkill(data, skill.name).map((collection) => ({
        id: collection.id,
        title: collection.title,
      })),
      dependencies: {
        dependsOn,
        usedBy,
      },
      neighboringShelfPicks: alsoLookAtList,
      installCommands: [
        `npx ai-agent-skills install ${skill.name}`,
        `npx ai-agent-skills install ${skill.name} --agent cursor`,
        `npx ai-agent-skills install ${skill.name} --dry-run`,
        ...(upstreamInstall ? [upstreamInstall.command] : []),
      ],
    };

    if (infoFieldMask && infoFieldMask.length > 0) {
      const masked = {};
      const topLevelFieldSet = new Set(['name', 'description', 'collections', 'dependencies', 'neighboringShelfPicks', 'installCommands']);
      const maskedSkill = selectObjectFields(
        payload.skill,
        infoFieldMask.filter((field) => !topLevelFieldSet.has(field))
      );
      for (const field of infoFieldMask) {
        if (field === 'name' || field === 'description') {
          masked[field] = payload[field];
        } else if (Object.prototype.hasOwnProperty.call(payload, field) && field !== 'skill') {
          masked[field] = payload[field];
        }
      }
      if (Object.keys(maskedSkill).length > 0) {
        masked.skill = maskedSkill;
      }
      masked.fields = infoFieldMask;
      setJsonResultData(masked);
    } else {
      setJsonResultData(payload);
    }
    return;
  }

  log(`
${colors.bold}${skill.name}${colors.reset}${skill.featured ? ` ${colors.yellow}(featured)${colors.reset}` : ''}${skill.verified ? ` ${colors.green}(verified)${colors.reset}` : ''}

${colors.dim}${safeDescription.content}${colors.reset}

${colors.bold}Why Here:${colors.reset}
  ${whyHere}

${colors.bold}Provenance:${colors.reset}
  Shelf: ${skill.workArea ? formatWorkAreaTitle(skill.workArea) : 'n/a'} / ${skill.branch || 'n/a'}
  Tier: ${getTier(skill) === 'house' ? 'House copy' : 'Cataloged upstream'}
  Distribution: ${getDistribution(skill) === 'bundled' ? 'Bundled with this library' : `Live install from ${skill.installSource || skill.source}`}
  Trust: ${getTrust(skill)} · Origin: ${getOrigin(skill)}
  Sync Mode: ${syncMode}
  Install Status: ${installStateLabel}
  Collections: ${collectionStr}
  Depends On: ${dependsOn.length > 0 ? dependsOn.join(', ') : 'none'}
  Used By: ${usedBy.length > 0 ? usedBy.join(', ') : 'none'}
  Source: ${skill.source || 'local library'}
${sourceUrl ? `  Source URL: ${sourceUrl}\n` : ''}

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

  if (isJsonOutput()) {
    setJsonResultData({
      path: CONFIG_FILE,
      config: {
        defaultAgent: config.defaultAgent || 'claude',
        agents: config.agents || null,
        autoUpdate: config.autoUpdate || false,
      },
    });
    return;
  }

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
    if (isJsonOutput()) {
      setJsonResultData({
        key,
        value,
        path: CONFIG_FILE,
        config,
      });
      return true;
    }
    success(`Config updated: ${key} = ${value}`);
    return true;
  }
  return false;
}

// ============ INIT COMMAND ============

function initSkill(name, options = {}) {
  const skillName = name || path.basename(process.cwd());
  const targetDir = name ? path.join(process.cwd(), name) : process.cwd();
  sandboxOutputPath(targetDir, process.cwd());
  const skillMdPath = path.join(targetDir, 'SKILL.md');

  if (fs.existsSync(skillMdPath)) {
    error(`SKILL.md already exists at ${skillMdPath}`);
    process.exitCode = 1;
    return false;
  }

  const safeName = skillName.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

  if (options.dryRun) {
    emitDryRunResult('init', [
      {
        type: 'create-skill',
        target: `Create ${safeName}/SKILL.md`,
        detail: skillMdPath,
      },
    ], {
      command: 'init',
      name: safeName,
      targetDir,
      skillMdPath,
    });
    return true;
  }

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
  if (isJsonOutput()) {
    setJsonResultData({
      name: safeName,
      targetDir,
      skillMdPath,
    });
  }
  success(`Created ${skillMdPath}`);
  log(`\n${colors.dim}Edit the file, then validate:${colors.reset}`);
  log(`  npx ai-agent-skills validate ${name ? name : '.'}`);
  return true;
}

function buildWorkspaceReadmeTemplate(libraryName) {
  return `<h1 align="center">${libraryName}</h1>

<p align="center">
  <strong>A personal library of agent skills.</strong>
</p>

<p align="center">
  Your own shelves, managed with ai-agent-skills.
</p>

<!-- GENERATED:library-stats:start -->
<!-- GENERATED:library-stats:end -->

## Library

This workspace is your library root.

Use \`ai-agent-skills\` to keep the catalog, house copies, and generated docs in sync.

## Shelves

<!-- GENERATED:shelf-table:start -->
<!-- GENERATED:shelf-table:end -->

## Collections

<!-- GENERATED:collection-table:start -->
<!-- GENERATED:collection-table:end -->

## Sources

<!-- GENERATED:source-table:start -->
<!-- GENERATED:source-table:end -->
`;
}

const DEFAULT_WORKSPACE_WORK_AREAS = [
  {
    id: 'frontend',
    title: 'Frontend',
    description: 'Interfaces, design systems, browser work, and product polish.',
  },
  {
    id: 'backend',
    title: 'Backend',
    description: 'Systems, data, security, and runtime operations.',
  },
  {
    id: 'mobile',
    title: 'Mobile',
    description: 'Native apps, React Native, device testing, and mobile delivery.',
  },
  {
    id: 'workflow',
    title: 'Workflow',
    description: 'Files, docs, planning, and release work.',
  },
  {
    id: 'agent-engineering',
    title: 'Agent Engineering',
    description: 'Prompts, tools, evaluation, orchestration, and agent runtime design.',
  },
];

function normalizeWorkspaceWorkAreas(workAreas) {
  if (workAreas === undefined) {
    return DEFAULT_WORKSPACE_WORK_AREAS.map((area) => ({ ...area }));
  }

  if (!Array.isArray(workAreas) || workAreas.length === 0) {
    throw new Error('init-library JSON payload requires workAreas to be a non-empty array when provided.');
  }

  return workAreas.map((area) => {
    if (typeof area === 'string') {
      const id = String(area).trim();
      if (!id) {
        throw new Error('workAreas entries must not be blank.');
      }
      const existing = DEFAULT_WORKSPACE_WORK_AREAS.find((candidate) => candidate.id === id);
      return existing ? { ...existing } : { id, title: formatWorkAreaTitle(id), description: '' };
    }

    if (!area || typeof area !== 'object' || Array.isArray(area)) {
      throw new Error('workAreas entries must be strings or objects.');
    }

    const id = String(area.id || '').trim();
    if (!id) {
      throw new Error('Each workAreas object must include an id.');
    }

    const existing = DEFAULT_WORKSPACE_WORK_AREAS.find((candidate) => candidate.id === id);
    return {
      id,
      title: String(area.title || existing?.title || formatWorkAreaTitle(id)).trim(),
      description: String(area.description || existing?.description || '').trim(),
    };
  });
}

function normalizeStarterCollections(collections) {
  if (collections === undefined) {
    return [];
  }

  if (!Array.isArray(collections)) {
    throw new Error('init-library JSON payload requires collections to be an array when provided.');
  }

  return collections.map((collection) => {
    if (typeof collection === 'string') {
      const id = String(collection).trim();
      if (!id) {
        throw new Error('collections entries must not be blank.');
      }
      return {
        id,
        title: formatWorkAreaTitle(id),
        description: '',
        skills: [],
      };
    }

    if (!collection || typeof collection !== 'object' || Array.isArray(collection)) {
      throw new Error('collections entries must be strings or objects.');
    }

    const id = String(collection.id || '').trim();
    if (!id) {
      throw new Error('Each collections object must include an id.');
    }

    return {
      id,
      title: String(collection.title || formatWorkAreaTitle(id)).trim(),
      description: String(collection.description || '').trim(),
      skills: Array.isArray(collection.skills) ? collection.skills : [],
    };
  });
}

function normalizeAreasFlag(value) {
  if (value == null) return undefined;
  const parsed = normalizeListInput(value);
  if (parsed.length === 0) {
    throw new Error('--areas requires at least one non-empty work area id.');
  }
  return parsed;
}

function readIfExists(targetPath) {
  try {
    return fs.readFileSync(targetPath, 'utf8');
  } catch {
    return null;
  }
}

function hasGeneratedReadmeMarkers(content) {
  if (!content) return false;
  return Object.values(README_MARKERS).every(([start, end]) => content.includes(start) && content.includes(end));
}

function buildManagedReadmeSection() {
  return [
    '## Managed Library',
    '',
    'This repo is initialized as an `ai-agent-skills` workspace.',
    '',
    'Use `ai-agent-skills` to keep the catalog, shelf docs, and house copies in sync.',
    '',
    '<!-- GENERATED:library-stats:start -->',
    '<!-- GENERATED:library-stats:end -->',
    '',
    '### Shelves',
    '',
    '<!-- GENERATED:shelf-table:start -->',
    '<!-- GENERATED:shelf-table:end -->',
    '',
    '### Collections',
    '',
    '<!-- GENERATED:collection-table:start -->',
    '<!-- GENERATED:collection-table:end -->',
    '',
    '### Sources',
    '',
    '<!-- GENERATED:source-table:start -->',
    '<!-- GENERATED:source-table:end -->',
    '',
  ].join('\n');
}

function ensureWorkspaceReadme(context, libraryName) {
  const existing = readIfExists(context.readmePath);
  if (!existing) {
    fs.writeFileSync(context.readmePath, buildWorkspaceReadmeTemplate(libraryName));
    return { created: true, appended: false, preserved: false };
  }

  if (hasGeneratedReadmeMarkers(existing)) {
    return { created: false, appended: false, preserved: false };
  }

  const trimmed = existing.endsWith('\n') ? existing : `${existing}\n`;
  fs.writeFileSync(context.readmePath, `${trimmed}\n${buildManagedReadmeSection()}`);
  return { created: false, appended: true, preserved: false };
}

function ensureWorkspaceWorkAreasFile(context, starterData) {
  if (fs.existsSync(context.workAreasPath)) {
    return { created: false, preserved: true };
  }

  writeGeneratedDocs(starterData, context);
  return { created: true, preserved: false };
}

function createStarterLibraryData(libraryName, librarySlug, options = {}) {
  const pkg = require('./package.json');
  return {
    version: pkg.version,
    updated: currentCatalogTimestamp(),
    total: 0,
    workAreas: normalizeWorkspaceWorkAreas(options.workAreas),
    collections: normalizeStarterCollections(options.collections),
    skills: [],
    libraryName,
    librarySlug,
  };
}

function initLibrary(name, options = {}) {
  const rawName = String(name || '').trim();
  if (!rawName) {
    error('Please provide a workspace name.');
    log('Usage: npx ai-agent-skills init-library <name>');
    process.exitCode = 1;
    return false;
  }

  const inPlace = rawName === '.';
  const targetDir = inPlace ? process.cwd() : path.resolve(process.cwd(), slugifyLibraryName(rawName));
  const derivedName = inPlace ? path.basename(targetDir) : rawName;
  const libraryName = derivedName;
  const librarySlug = slugifyLibraryName(derivedName);
  if (!librarySlug) {
    error('The workspace name needs at least one letter or number.');
    process.exitCode = 1;
    return false;
  }

  sandboxOutputPath(targetDir, inPlace ? targetDir : process.cwd());
  if (isManagedWorkspaceRoot(targetDir)) {
    error(`Workspace already initialized at ${targetDir}`);
    process.exitCode = 1;
    return false;
  }

  if (fs.existsSync(targetDir)) {
    const existing = fs.readdirSync(targetDir);
    if (!inPlace && existing.length > 0) {
      error(`Refusing to overwrite existing directory: ${targetDir}`);
      process.exitCode = 1;
      return false;
    }
  } else {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const workspaceContext = createLibraryContext(targetDir, 'workspace');
  const starterData = createStarterLibraryData(libraryName, librarySlug, options);
  const workspaceConfig = {
    libraryName,
    librarySlug,
    mode: 'workspace',
  };

  if (options.dryRun) {
    const importRoot = options.importMode ? path.resolve(options.importPath || targetDir) : null;
    const importDiscovery = options.importMode ? discoverImportCandidates(importRoot) : null;
    emitDryRunResult('init-library', [
      {
        type: 'create-workspace',
        target: inPlace ? `Initialize workspace in ${targetDir}` : `Create workspace ${librarySlug}`,
        detail: targetDir,
      },
      {
        type: 'seed-work-areas',
        target: 'Seed work areas',
        detail: starterData.workAreas.map((area) => area.id).join(', '),
      },
      {
        type: 'seed-collections',
        target: 'Seed collections',
        detail: starterData.collections.length > 0 ? starterData.collections.map((collection) => collection.id).join(', ') : 'none',
      },
      ...(options.importMode ? [{
        type: 'import-skills',
        target: `Import discovered skills from ${importRoot}`,
        detail: `${importDiscovery.discovered.length} importable, ${importDiscovery.skipped.length} skipped, ${importDiscovery.failures.length} failed`,
      }] : []),
    ], {
      command: 'init-library',
      libraryName,
      librarySlug,
      targetDir,
      workAreas: starterData.workAreas.map((area) => area.id),
      collections: starterData.collections.map((collection) => collection.id),
      import: options.importMode ? {
        rootDir: importRoot,
        discovered: importDiscovery.discovered.length,
        skipped: importDiscovery.skipped.length,
        failed: importDiscovery.failures.length,
      } : null,
    });
    return true;
  }

  fs.mkdirSync(workspaceContext.workspaceDir, { recursive: true });
  fs.mkdirSync(workspaceContext.skillsDir, { recursive: true });
  if (!fs.existsSync(path.join(workspaceContext.skillsDir, '.gitkeep'))) {
    fs.writeFileSync(path.join(workspaceContext.skillsDir, '.gitkeep'), '');
  }
  fs.writeFileSync(workspaceContext.workspaceConfigPath, `${JSON.stringify(workspaceConfig, null, 2)}\n`);
  fs.writeFileSync(workspaceContext.skillsJsonPath, `${JSON.stringify(starterData, null, 2)}\n`);
  const readmeStatus = ensureWorkspaceReadme(workspaceContext, libraryName);
  const workAreasStatus = ensureWorkspaceWorkAreasFile(workspaceContext, starterData);
  const rendered = renderGeneratedDocs(starterData, {
    context: workspaceContext,
    readmeSource: fs.readFileSync(workspaceContext.readmePath, 'utf8'),
  });
  fs.writeFileSync(workspaceContext.readmePath, rendered.readme);
  if (!workAreasStatus.preserved) {
    fs.writeFileSync(workspaceContext.workAreasPath, rendered.workAreas);
  }

  if (isJsonOutput()) {
    setJsonResultData({
      libraryName,
      librarySlug,
      targetDir,
      files: {
        config: workspaceContext.workspaceConfigPath,
        readme: workspaceContext.readmePath,
        skillsJson: workspaceContext.skillsJsonPath,
        workAreas: workspaceContext.workAreasPath,
      },
      workAreas: starterData.workAreas.map((area) => area.id),
      import: null,
    });
  }
  success(`Created library workspace: ${libraryName}`);
  info(`Path: ${targetDir}`);
  if (readmeStatus.appended) {
    info('README.md already existed. Appended a managed-library section with generated markers.');
  }
  if (workAreasStatus.preserved) {
    info('WORK_AREAS.md already existed. Preserved it as-is; run build-docs later if you want to replace it.');
  }
  log(`\n${colors.dim}Next steps:${colors.reset}`);
  if (!inPlace) log(`  cd ${librarySlug}`);
  log(`  npx ai-agent-skills list --area frontend`);
  log(`  npx ai-agent-skills search react-native`);
  log(`  npx ai-agent-skills add frontend-design --area frontend --branch Implementation --why "Anchors the frontend shelf with stronger UI craft and production-ready interface direction."`);
  log(`  npx ai-agent-skills build-docs`);
  log(`  git init`);
  log(`  git add .`);
  log(`  git commit -m "Initialize skills library"`);
  log(`  gh repo create <owner>/${librarySlug} --public --source=. --remote=origin --push`);
  log(`  npx ai-agent-skills install <owner>/${librarySlug} --collection starter-pack -p`);

  if (options.importMode) {
    return importWorkspaceSkills(options.importPath || targetDir, {
      context: workspaceContext,
      autoClassify: options.autoClassify,
      preserveWorkAreas: workAreasStatus.preserved,
      bootstrap: true,
    });
  }

  return true;
}

function buildDocs(options = {}) {
  const context = requireWorkspaceContext('build-docs');
  if (!context) return false;

  try {
    const data = loadCatalogData(context);

    if (options.dryRun) {
      const inSync = generatedDocsAreInSync(data, context);
      emitDryRunResult('build-docs', [
        {
          type: 'write-readme',
          target: `Write ${path.basename(context.readmePath)}`,
          detail: context.readmePath,
        },
        {
          type: 'write-work-areas',
          target: `Write ${path.basename(context.workAreasPath)}`,
          detail: context.workAreasPath,
        },
      ], {
        command: 'build-docs',
        readmePath: context.readmePath,
        workAreasPath: context.workAreasPath,
        currentlyInSync: inSync,
      });
      return true;
    }

    writeGeneratedDocs(data, context);
    if (isJsonOutput()) {
      setJsonResultData({
        readmePath: context.readmePath,
        workAreasPath: context.workAreasPath,
      });
    }
    success('Regenerated workspace docs');
    info(`README: ${context.readmePath}`);
    info(`Work areas: ${context.workAreasPath}`);
    return true;
  } catch (e) {
    error(`Failed to build docs: ${e.message}`);
    process.exitCode = 1;
    return false;
  }
}

// ============ CHECK COMMAND ============

function collectCheckResults(scope) {
  const { execFileSync } = require('child_process');
  const targets = [];

  if (!scope || scope === 'global') {
    targets.push({ label: 'global', path: SCOPES.global });
  }
  if (!scope || scope === 'project') {
    targets.push({ label: 'project', path: SCOPES.project });
  }

  const results = [];
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
          results.push({
            scope: target.label,
            name: entry.name,
            status: 'unknown',
            detail: 'no source metadata (manually installed)',
            meta: null,
          });
          continue;
        }

        const sourceType = meta.sourceType || meta.source;

        if (sourceType === 'github' && (meta.repo || meta.url)) {
          try {
            const repoPath = meta.repo || meta.url.replace('https://github.com/', '').replace(/\.git$/, '');
            execFileSync('git', ['ls-remote', '--exit-code', `https://github.com/${repoPath}.git`, 'HEAD'], {
              stdio: 'pipe',
              timeout: 10000,
              env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
            });
            results.push({
              scope: target.label,
              name: entry.name,
              status: 'ok',
              detail: 'up to date',
              meta,
            });
          } catch {
            updatesAvailable++;
            results.push({
              scope: target.label,
              name: entry.name,
              status: 'warning',
              detail: `update may be available (${meta.repo || meta.url})`,
              meta,
            });
          }
        } else if (sourceType === 'catalog' || sourceType === 'registry') {
          const catalogContext = getCatalogContextFromMeta(meta);
          if (!catalogContext) {
            results.push({
              scope: target.label,
              name: entry.name,
              status: 'unknown',
              detail: 'workspace source unavailable (run from inside the workspace or reinstall)',
              meta,
            });
            continue;
          }
          const workspaceData = loadCatalogData(catalogContext);
          const workspaceSkill = findSkillByName(workspaceData, entry.name);
          const catalogPath = workspaceSkill
            ? resolveCatalogSkillSourcePath(entry.name, { sourceContext: catalogContext, skill: workspaceSkill })
            : path.join(catalogContext.skillsDir, entry.name);
          results.push({
            scope: target.label,
            name: entry.name,
            status: fs.existsSync(catalogPath) ? 'ok' : 'unknown',
            detail: fs.existsSync(catalogPath) ? 'up to date' : 'not in current catalog',
            meta,
          });
        } else {
          results.push({
            scope: target.label,
            name: entry.name,
            status: 'ok',
            detail: sourceType,
            meta,
          });
        }
      }
    } catch {
      continue;
    }
  }

  return { targets, checked, updatesAvailable, results };
}

function checkSkills(scope) {
  const { checked, updatesAvailable, results } = collectCheckResults(scope);

  if (isJsonOutput()) {
    setJsonResultData({
      checked,
      updatesAvailable,
      results: results.map((entry) => ({
        scope: entry.scope,
        name: entry.name,
        status: entry.status,
        detail: entry.detail,
        sourceType: entry.meta ? (entry.meta.sourceType || entry.meta.source || null) : null,
      })),
    });
    return;
  }

  log(`\n${colors.bold}Checking installed skills...${colors.reset}\n`);

  for (const entry of results) {
    if (entry.status === 'warning') {
      log(`  ${colors.yellow}\u2191${colors.reset} ${entry.name}${colors.dim}      ${entry.detail}${colors.reset}`);
      continue;
    }
    if (entry.status === 'unknown') {
      log(`  ${colors.dim}?${colors.reset} ${entry.name}${colors.dim}      ${entry.detail}${colors.reset}`);
      continue;
    }
    log(`  ${colors.green}\u2713${colors.reset} ${entry.name}${colors.dim}      ${entry.detail}${colors.reset}`);
  }

  if (checked === 0) {
    warn('No installed skills found');
    return;
  }

  log('');
  if (updatesAvailable > 0) {
    log(`${updatesAvailable} update(s) may be available. Run ${colors.cyan}npx ai-agent-skills sync${colors.reset} to refresh them.`);
  } else {
    log(`${colors.dim}All ${checked} skill(s) checked.${colors.reset}`);
    log(`${colors.dim}Use npx ai-agent-skills sync when you want to refresh installed skills anyway.${colors.reset}`);
  }
}

// ============ MAIN CLI ============

async function main() {
  const args = process.argv.slice(2);
  setActiveLibraryContext(resolveLibraryContext(process.cwd()));
  const parsed = parseArgs(args);
  resetOutputState(resolveOutputFormat(parsed), resolveCommandAlias(parsed.command || 'help'), parsed.format != null);
  const {
    command,
    param,
    format,
    json,
    agents,
    explicitAgent,
    installed,
    dryRun,
    noDeps,
    category,
    workArea,
    workAreas,
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
    importMode,
    autoClassify,
  } = parsed;
  const managedTargets = resolveManagedTargets(parsed);

  try {
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
          await installCatalogSkillFromLibrary(action.skillName, [AGENT_PATHS[action.agent] || SCOPES.global], false);
        } else {
          const scopePath = SCOPES[action.scope || 'global'];
          await installCatalogSkillFromLibrary(action.skillName, [scopePath], false);
        }
      } else if (action && action.type === 'github-install') {
        await installFromGitHub(action.source, agents[0], false);
      } else if (action && action.type === 'skills-install') {
        runExternalInstallAction(action);
      }
      return;
    }

    if (command === SWIFT_SHORTCUT) {
      const previousContext = getActiveLibraryContext();
      setActiveLibraryContext(getBundledLibraryContext());
      try {
        if (listMode) {
          listSkills(category, tags, 'swift-agent-skills', workArea);
          return;
        }

        const swiftInstallPaths = resolveInstallPath(parsed, { defaultAgents: UNIVERSAL_DEFAULT_AGENTS });
        await installCollection('swift-agent-skills', parsed, swiftInstallPaths);
      } finally {
        setActiveLibraryContext(previousContext);
      }
      return;
    }

    if (!isKnownCommand(command)) {
      try {
        validateAgentValue(command, 'source', 'identifier');
      } catch (error) {
        emitActionableError(error.message, AGENT_INPUT_HINT, { code: 'INVALID_INPUT' });
        process.exitCode = 1;
        return;
      }
    }

    if (!isKnownCommand(command) && isImplicitSourceCommand(command)) {
      const source = parseSource(command);
      const installPaths = resolveInstallPath(parsed, { defaultAgents: UNIVERSAL_DEFAULT_AGENTS });
      await installFromSource(command, source, installPaths, skillFilters, listMode, yes, dryRun, {
        collectionId: collection || null,
        noDeps,
      });
      return;
    }

    // Handle config commands specially
    if (command === 'config') {
      const configArgs = [];
      for (let i = 1; i < args.length; i++) {
        if (args[i] === '--format') {
          i++;
          continue;
        }
        if (args[i] === '--json') {
          continue;
        }
        configArgs.push(args[i]);
      }
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

    const mutationPayload = await parseJsonInput(command, parsed);
    if (mutationPayload === INVALID_JSON_INPUT) {
      return;
    }

    try {
      validateParsedAgentInputs(command, parsed, mutationPayload || null);
    } catch (error) {
      emitActionableError(error.message, AGENT_INPUT_HINT, { code: 'INVALID_INPUT' });
      process.exitCode = 1;
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
          await installCatalogSkillFromLibrary(action.skillName, [AGENT_PATHS[action.agent] || SCOPES.global], false);
        } else {
          const scopePath = SCOPES[action.scope || 'global'];
          await installCatalogSkillFromLibrary(action.skillName, [scopePath], false);
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
        if (isJsonOutput()) {
          emitInstalledSkillsJson(managedTargets);
        } else {
          for (let i = 0; i < managedTargets.length; i++) {
            if (i > 0) log('');
            listInstalledSkillsInPath(managedTargets[i].path, managedTargets[i].label);
          }
        }
      } else if (isJsonOutput()) {
        const readOptions = resolveReadJsonOptions(parsed, 'list');
        if (!readOptions) return;
        emitListJson(category, tags, collection, workArea, readOptions);
      } else {
        listSkills(category, tags, collection, workArea);
      }
      return;

    case 'collections':
      if (isJsonOutput()) {
        const readOptions = resolveReadJsonOptions(parsed, 'collections');
        if (!readOptions) return;
        showCollections(readOptions);
      } else {
        showCollections();
      }
      return;

    case 'install':
    case 'i': {
      if (!param && !collection) {
        error('Please specify a skill name, collection, GitHub repo, or local path.');
        log('Usage: npx ai-agent-skills install <source> [-p]');
        log('       npx ai-agent-skills install --collection <id> [-p]');
        process.exitCode = 1;
        return;
      }
      const installPaths = resolveInstallPath(parsed);
      const installReadOptions = listMode && isJsonOutput()
        ? resolveReadJsonOptions(parsed, 'install --list')
        : null;
      if (listMode && isJsonOutput() && !installReadOptions) {
        return;
      }

      if (collection && !param) {
        await installCollection(collection, parsed, installPaths);
        return;
      }

      const source = parseSource(param);

      if (collection && source.type === 'catalog') {
        emitActionableError(
          'Cannot combine --collection with a local catalog skill name.',
          'Use either `install --collection <id>` for the active library, or `install <source> --collection <id>` for a shared library source.',
          { code: 'INVALID_FLAGS' }
        );
        process.exitCode = 1;
        return;
      }

      if (source.type === 'catalog') {
        const data = loadSkillsJson();
        const skill = findSkillByName(data, source.name);
        if (!skill) {
          for (const targetPath of installPaths) {
            installSkill(source.name, null, dryRun, targetPath);
          }
          return;
        }
        const plan = getCatalogInstallPlan(data, [source.name], noDeps);
        await installCatalogPlan(plan, installPaths, {
          dryRun,
          title: `Installing ${source.name}`,
          summaryLine: `Would install: ${source.name}`,
        });
      } else {
        // Source-repo install (v3 flow)
        await installFromSource(param, source, installPaths, skillFilters, listMode, yes, dryRun, {
          collectionId: collection || null,
          noDeps,
          readOptions: installReadOptions || undefined,
        });
      }
      return;
    }

    case 'add': {
      const addSource = resolveMutationSource(param, mutationPayload, { allowNameFallback: true });
      if (!addSource) {
        error('Please specify a bundled skill name, GitHub repo, git URL, or local path.');
        log('Usage: npx ai-agent-skills add <source>');
        log('       npx ai-agent-skills add <catalog-skill-name> --area <shelf> --branch <branch> --why "Why it belongs."');
        process.exitCode = 1;
        return;
      }

      await addSkillToWorkspace(addSource, buildWorkspaceMutationOptions(parsed, mutationPayload || {}));
      return;
    }

    case 'uninstall':
    case 'remove':
    case 'rm':
      {
      const uninstallName = param || getPayloadValue(mutationPayload || {}, 'name');
      const uninstallDryRun = mergeMutationBoolean(parsed.dryRun, mutationPayload || {}, 'dryRun');
      if (!uninstallName) {
        error('Please specify a skill name.');
        log('Usage: npx ai-agent-skills uninstall <name> [--agents claude,cursor]');
        process.exitCode = 1;
        return;
      }
      for (const target of managedTargets) {
        uninstallSkillFromPath(uninstallName, target.path, target.label, uninstallDryRun);
      }
      return;
      }

    case 'sync':
    case 'update':
    case 'upgrade':
      if (all) {
        for (const target of managedTargets) {
          updateAllSkillsInPath(target.path, target.label, dryRun);
        }
      } else if (!param) {
        error('Please specify a skill name or use --all.');
        log('Usage: npx ai-agent-skills sync <name> [--agents claude,cursor]');
        log('       npx ai-agent-skills sync --all [--agents claude,cursor]');
        process.exitCode = 1;
        return;
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
        process.exitCode = 1;
        return;
      }
      if (isJsonOutput()) {
        const readOptions = resolveReadJsonOptions(parsed, 'search');
        if (!readOptions) return;
        emitSearchJson(param, category, collection, workArea, readOptions);
      } else {
        searchSkills(param, category, collection, workArea);
      }
      return;

    case 'info':
    case 'show':
      if (!param) {
        error('Please specify a skill name.');
        log('Usage: npx ai-agent-skills info <skill-name>');
        process.exitCode = 1;
        return;
      }
      showInfo(param, { fields: parsed.fields });
      return;

    case 'preview':
      if (!param) {
        error('Please specify a skill name.');
        log('Usage: npx ai-agent-skills preview <skill-name>');
        process.exitCode = 1;
        return;
      }
      showPreview(param, { fields: parsed.fields });
      return;

    case 'catalog': {
      const catalogSource = resolveMutationSource(param, mutationPayload);
      if (!catalogSource) {
        error('Provide a source: npx ai-agent-skills catalog owner/repo');
        log(`\n${colors.dim}Examples:${colors.reset}`);
        log(`  npx ai-agent-skills catalog openai/skills --list`);
        log(`  npx ai-agent-skills catalog openai/skills --skill linear --area workflow --branch Linear --why "I use it for issue triage."`);
        log(`  npx ai-agent-skills catalog shadcn-ui/ui --skill shadcn --area frontend --branch Components --why "Strong component patterns I actually reach for."`);
        return;
      }
      await catalogSkills(catalogSource, buildWorkspaceMutationOptions(parsed, mutationPayload || {}));
      return;
    }

    case 'curate': {
      const curateTarget = param || getPayloadValue(mutationPayload || {}, 'name');
      runCurateCommand(curateTarget, buildCurateParsed(parsed, mutationPayload || {}));
      return;
    }

    case 'vendor':
      {
      const vendorSource = resolveMutationSource(param, mutationPayload);
      if (!vendorSource) {
        error('Provide a source: npx ai-agent-skills vendor <repo-or-path>');
        log(`\n${colors.dim}Examples:${colors.reset}`);
        log(`  npx ai-agent-skills vendor ~/repo --skill my-skill --area frontend --branch React --why "I want a maintained house copy."`);
        log(`  npx ai-agent-skills vendor openai/skills --list`);
        return;
      }
      await vendorSkill(vendorSource, buildWorkspaceMutationOptions(parsed, mutationPayload || {}));
      return;
      }

    case 'doctor': {
      const doctorAgents = explicitAgent ? agents : Object.keys(AGENT_PATHS);
      runDoctor(doctorAgents);
      return;
    }

    case 'validate':
      runValidate(param);
      return;

    case 'init':
      initSkill(param, { dryRun });
      return;

    case 'init-library':
      initLibrary(param || getPayloadValue(mutationPayload || {}, 'name'), {
        workAreas: getPayloadValue(mutationPayload || {}, 'workAreas') || normalizeAreasFlag(parsed.workAreas),
        collections: getPayloadValue(mutationPayload || {}, 'collections'),
        importMode: mergeMutationBoolean(parsed.importMode, mutationPayload || {}, 'import'),
        autoClassify: mergeMutationBoolean(parsed.autoClassify, mutationPayload || {}, 'autoClassify'),
        importPath: getPayloadValue(mutationPayload || {}, 'importPath') || null,
        dryRun: mergeMutationBoolean(parsed.dryRun, mutationPayload || {}, 'dryRun'),
      });
      return;

    case 'import':
      importWorkspaceSkills(param || null, {
        autoClassify,
        dryRun,
      });
      return;

    case 'build-docs':
      buildDocs({ dryRun });
      return;

    case 'check':
      checkSkills(scope);
      return;

    case 'help':
    case '--help':
    case '-h':
      if (json || format === 'json') {
        if (param && !getCommandDefinition(param)) {
          error(`Unknown command: ${param}`);
          process.exitCode = 1;
          return;
        }
        emitSchemaHelp(param || null);
        return;
      }
      showHelp();
      return;

    case 'describe':
      if (!param) {
        error('Please specify a command name.');
        log('Usage: npx ai-agent-skills describe <command>');
        process.exitCode = 1;
        return;
      }
      if (!getCommandDefinition(param)) {
        error(`Unknown command: ${param}`);
        process.exitCode = 1;
        return;
      }
      emitSchemaHelp(param);
      return;

    case 'version':
    case '--version':
    case '-v': {
      const pkg = require('./package.json');
      if (isJsonOutput()) {
        setJsonResultData({ version: pkg.version });
        return;
      }
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
      process.exitCode = 1;
      return;
    }
  } finally {
    finalizeJsonOutput();
  }
}

main().catch((e) => {
  error(e && e.message ? e.message : String(e));
  finalizeJsonOutput();
  process.exit(1);
});
