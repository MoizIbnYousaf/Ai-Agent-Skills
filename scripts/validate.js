#!/usr/bin/env node

/**
 * Catalog validation for ai-agent-skills.
 * Checks skills.json integrity, folder structure, and SKILL.md frontmatter.
 */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const skillsDir = path.join(root, 'skills');

let errors = 0;
let warnings = 0;

function error(msg) { console.error(`  \x1b[31m✗\x1b[0m ${msg}`); errors++; }
function warn(msg) { console.warn(`  \x1b[33m!\x1b[0m ${msg}`); warnings++; }
function pass(msg) { console.log(`  \x1b[32m✓\x1b[0m ${msg}`); }

// ── Load skills.json ──

let data;
try {
  data = JSON.parse(fs.readFileSync(path.join(root, 'skills.json'), 'utf8'));
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

const baseRequired = ['name', 'description', 'category', 'workArea', 'branch', 'author', 'license', 'source', 'sourceUrl', 'origin', 'trust', 'syncMode'];
const vendoredRequired = [...baseRequired, 'whyHere'];
const validCategories = ['development', 'document', 'creative', 'business', 'productivity'];
const validOrigins = ['authored', 'curated', 'adapted'];
const validSyncModes = ['authored', 'mirror', 'snapshot', 'adapted', 'live'];
const validTrust = ['verified', 'reviewed', 'listed'];
const names = new Set();

const workAreaIds = (data.workAreas || []).map(a => a.id);

data.skills.forEach(skill => {
  const isVendored = skill.vendored !== false;
  const fields = isVendored ? vendoredRequired : baseRequired;
  fields.forEach(field => {
    if (!skill[field]) error(`${skill.name || '(unnamed)'} missing ${field}`);
  });

  if (skill.category && !validCategories.includes(skill.category)) {
    error(`Invalid category "${skill.category}" for ${skill.name}`);
  }

  if (skill.origin && !validOrigins.includes(skill.origin)) {
    error(`Invalid origin "${skill.origin}" for ${skill.name}`);
  }

  if (skill.syncMode && !validSyncModes.includes(skill.syncMode)) {
    error(`Invalid syncMode "${skill.syncMode}" for ${skill.name}`);
  }

  if (skill.trust && !validTrust.includes(skill.trust)) {
    error(`Invalid trust "${skill.trust}" for ${skill.name}`);
  }

  if (skill.workArea && workAreaIds.length > 0 && !workAreaIds.includes(skill.workArea)) {
    error(`Invalid workArea "${skill.workArea}" for ${skill.name}`);
  }

  if (names.has(skill.name)) {
    error(`Duplicate skill name: ${skill.name}`);
  }
  names.add(skill.name);

  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(skill.name)) {
    error(`Invalid name format: ${skill.name}`);
  }

  if (skill.whyHere && skill.whyHere.trim().length < 20) {
    warn(`whyHere is thin for ${skill.name}`);
  }

  if (skill.sourceUrl && !skill.sourceUrl.startsWith('https://github.com/')) {
    error(`Invalid sourceUrl for ${skill.name}`);
  }

  if (skill.verified && !skill.lastVerified) {
    warn(`Verified skill ${skill.name} has no lastVerified date`);
  }

  // Description quality check: descriptions should tell the model WHEN to trigger,
  // not just summarize what the skill does. Action-oriented descriptions contain
  // words like "when", "use", "trigger", "if", "before", "after", "during".
  if (skill.description) {
    const desc = skill.description.toLowerCase();
    const actionPatterns = /\b(when|use |use$|trigger|if |before|after|during|whenever|upon|while)\b/;
    if (!actionPatterns.test(desc)) {
      warn(`${skill.name}: description reads like a summary, not a trigger condition. Consider starting with "Use when..." or similar action-oriented language.`);
    }
  }
});

pass(`${data.skills.length} skills, all required fields present`);

// ── Metadata checks ──

if (data.total !== data.skills.length) {
  error(`skills.json "total" is ${data.total} but actual count is ${data.skills.length}`);
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (data.version !== pkg.version) {
  error(`skills.json version "${data.version}" does not match package.json version "${pkg.version}"`);
}

// ── Folder checks ──

console.log('\nValidating skill folders\n');

const vendoredNames = new Set();
const catalogedNames = new Set();
data.skills.forEach(skill => {
  if (skill.vendored === false) {
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
  if (!skill.installSource && !skill.source) {
    error(`Cataloged skill "${name}" has no installSource or source`);
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
