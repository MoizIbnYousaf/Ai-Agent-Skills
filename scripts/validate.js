#!/usr/bin/env node

/**
 * Catalog validation for ai-agent-skills.
 * Checks skills.json integrity, folder structure, and SKILL.md frontmatter.
 */

const path = require('path');

const { loadCatalogData, validateCatalogData } = require('../lib/catalog-data.cjs');
const { SKILLS_DIR, ROOT_DIR, SKILLS_JSON_PATH } = require('../lib/paths.cjs');

const root = ROOT_DIR;
const skillsDir = SKILLS_DIR;
const fs = require('fs');

let errors = 0;
let warnings = 0;

function error(msg) { console.error(`  \x1b[31m✗\x1b[0m ${msg}`); errors++; }
function warn(msg) { console.warn(`  \x1b[33m!\x1b[0m ${msg}`); warnings++; }
function pass(msg) { console.log(`  \x1b[32m✓\x1b[0m ${msg}`); }

// ── Load skills.json ──

let data;
let validation;
try {
  const rawData = JSON.parse(fs.readFileSync(SKILLS_JSON_PATH, 'utf8'));
  validation = validateCatalogData(rawData);
  data = validation.data;
} catch (e) {
  console.error('Failed to parse skills.json:', e.message);
  process.exit(1);
}

console.log('\nValidating skills.json\n');

if (!Array.isArray(data.skills)) {
  error('skills must be an array');
  process.exit(1);
}

// ── Schema checks ──

const names = new Set();
validation.errors.forEach(error);
validation.warnings.forEach(warn);
data.skills.forEach((skill) => names.add(skill.name));

pass(`${data.skills.length} skills, all required fields present`);

// ── Metadata checks ──

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (data.version !== pkg.version) {
  error(`skills.json version "${data.version}" does not match package.json version "${pkg.version}"`);
}

// ── Folder checks ──

console.log('\nValidating skill folders\n');

const vendoredNames = new Set();
const catalogedNames = new Set();
data.skills.forEach(skill => {
  if (skill.tier === 'upstream') {
    catalogedNames.add(skill.name);
  } else {
    vendoredNames.add(skill.name);
  }
});

const folders = fs.readdirSync(skillsDir).filter(f =>
  fs.statSync(path.join(skillsDir, f)).isDirectory()
);

folders.forEach(folder => {
  if (!vendoredNames.has(folder)) {
    error(`Folder "${folder}" exists but not in skills.json as vendored`);
  }

  const skillMd = path.join(skillsDir, folder, 'SKILL.md');
  if (!fs.existsSync(skillMd)) {
    error(`Missing SKILL.md in ${folder}`);
  }
});

vendoredNames.forEach(name => {
  if (!folders.includes(name)) {
    error(`Vendored skill "${name}" but folder missing`);
  }
});

// Non-vendored skills must have an install source
catalogedNames.forEach(name => {
  const skill = data.skills.find(s => s.name === name);
  if (!skill.installSource) {
    error(`Cataloged skill "${name}" has no installSource`);
  }
});

pass(`${folders.length} vendored folders, ${catalogedNames.size} cataloged upstream`);

// ── Rich skills count ──

let richCount = 0;
folders.forEach(folder => {
  const folderPath = path.join(skillsDir, folder);
  const hasScripts = fs.existsSync(path.join(folderPath, 'scripts'));
  const hasReferences = fs.existsSync(path.join(folderPath, 'references'));
  if (hasScripts || hasReferences) richCount++;
});

// ── Frontmatter checks ──

console.log('\nValidating SKILL.md frontmatter\n');

folders.forEach(folder => {
  const skillMd = path.join(skillsDir, folder, 'SKILL.md');
  if (!fs.existsSync(skillMd)) return;

  const content = fs.readFileSync(skillMd, 'utf8');

  if (!content.startsWith('---')) {
    error(`${folder}/SKILL.md missing frontmatter`);
    return;
  }

  const endIndex = content.indexOf('---', 3);
  if (endIndex === -1) {
    error(`${folder}/SKILL.md has unclosed frontmatter`);
    return;
  }

  const frontmatter = content.slice(3, endIndex);

  if (!frontmatter.includes('name:')) {
    error(`${folder}/SKILL.md missing name in frontmatter`);
  }

  if (!frontmatter.includes('description:')) {
    error(`${folder}/SKILL.md missing description in frontmatter`);
  }
});

pass('All SKILL.md files have valid frontmatter');

// ── Collections checks ──

console.log('\nValidating collections\n');

if (Array.isArray(data.collections)) {
  data.collections.forEach(col => {
    if (!col.id || !col.title) {
      error(`Collection missing id or title`);
    }
    if (Array.isArray(col.skills)) {
      col.skills.forEach(s => {
        if (!names.has(s)) error(`Collection "${col.id}" references unknown skill "${s}"`);
      });
    }
  });
  pass(`${data.collections.length} collections valid`);
}

// ── Summary ──

console.log('\n' + '─'.repeat(40));
console.log(`${data.skills.length} skills (${richCount} rich, ${data.skills.length - richCount} instruction-only)`);
if (errors > 0) {
  console.log(`\x1b[31m${errors} error${errors > 1 ? 's' : ''}\x1b[0m`);
}
if (warnings > 0) {
  console.log(`\x1b[33m${warnings} warning${warnings > 1 ? 's' : ''}\x1b[0m`);
}
if (errors === 0) {
  console.log('\x1b[32mValidation passed.\x1b[0m');
}
console.log('─'.repeat(40) + '\n');

process.exit(errors > 0 ? 1 : 0);
