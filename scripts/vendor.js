#!/usr/bin/env node

/**
 * Vendor a skill into the library from an upstream source.
 *
 * Usage:
 *   node scripts/vendor.js <source> --skill <name> [options]
 *
 * Examples:
 *   node scripts/vendor.js AvdLee/SwiftUI-Agent-Skill --skill swiftui-expert-skill
 *   node scripts/vendor.js callstack/react-native-best-practices --skill react-native-best-practices --area mobile --branch "React Native"
 *   node scripts/vendor.js ~/local-repo --skill my-skill --area frontend --branch React
 *   node scripts/vendor.js AvdLee/SwiftUI-Agent-Skill --list
 *
 * Options:
 *   --skill <name>       Skill to vendor (required unless --list)
 *   --list               List available skills in the source
 *   --area <id>          Work area id (e.g. frontend, backend, mobile)
 *   --branch <name>      Branch/shelf name (e.g. "Swift", "React Native")
 *   --category <cat>     Category: development, document, creative, business, productivity
 *   --tags <t1,t2>       Comma-separated tags
 *   --ref <branch>       Git branch/tag to clone (default: default branch)
 *   --dry-run            Show what would happen without writing
 */

const fs = require('fs');
const path = require('path');
const {
  loadCatalogData,
  normalizeSkill,
  writeCatalogData,
} = require('../lib/catalog-data.cjs');
const { ROOT_DIR, SKILLS_DIR } = require('../lib/paths.cjs');
const { discoverSkills, parseSource, prepareSource } = require('../lib/source.cjs');

const root = ROOT_DIR;
const skillsDir = SKILLS_DIR;

// ── Argument parsing ──

const args = process.argv.slice(2);

function getFlag(name) {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return null;
  return args[i + 1] || null;
}

function hasFlag(name) {
  return args.includes(`--${name}`);
}

const source = args[0];
const skillFilter = getFlag('skill');
const listMode = hasFlag('list');
const areaFlag = getFlag('area');
const branchFlag = getFlag('branch');
const categoryFlag = getFlag('category');
const tagsFlag = getFlag('tags');
const refFlag = getFlag('ref');
const dryRun = hasFlag('dry-run');

if (!source || source.startsWith('--')) {
  console.error('Usage: node scripts/vendor.js <source> --skill <name> [options]');
  console.error('       node scripts/vendor.js <source> --list');
  process.exit(1);
}

if (!listMode && !skillFilter) {
  console.error('Error: --skill <name> is required (or use --list to see available skills)');
  process.exit(1);
}

const parsed = parseSource(source);

// ── Main ──

const prepared = prepareSource(source, {
  parsed: refFlag ? { ...parsed, ref: refFlag } : parsed,
});

try {
  const discovered = discoverSkills(prepared.rootDir, { repoRoot: prepared.repoRoot });

  if (discovered.length === 0) {
    console.error('No skills found in source.');
    process.exit(1);
  }

  // --list mode
  if (listMode) {
    console.log(`\nAvailable skills in ${source} (${discovered.length} found):\n`);
    for (const s of discovered) {
      console.log(`  ${s.name}`);
      if (s.description) console.log(`    ${s.description}`);
    }
    console.log();
    process.exit(0);
  }

  // Find the target skill
  const target = discovered.find(s => s.name.toLowerCase() === skillFilter.toLowerCase());
  if (!target) {
    console.error(`Skill "${skillFilter}" not found. Available:`);
    for (const s of discovered) console.error(`  ${s.name}`);
    process.exit(1);
  }

  // Check if already in catalog
  const catalog = loadCatalogData();
  const existing = catalog.skills.find(s => s.name === target.name);
  if (existing) {
    console.error(`Skill "${target.name}" already exists in skills.json. To re-vendor, remove it first.`);
    process.exit(1);
  }

  // Determine the target folder name
  const folderName = target.name;
  const destDir = path.join(skillsDir, folderName);

  if (fs.existsSync(destDir)) {
    console.error(`Folder skills/${folderName}/ already exists.`);
    process.exit(1);
  }

  // Build the catalog entry
  const author = parsed.owner || target.frontmatter.author || 'unknown';
  const sourceLabel = parsed.owner && parsed.repo ? `${parsed.owner}/${parsed.repo}` : source;
  // Build source URL by figuring out the relative path from clone root
  let sourceUrl = '';
  if (parsed.url && parsed.type !== 'local') {
    if (target.isRoot) {
      sourceUrl = parsed.url;
    } else {
      const relPath = target.relativeDir;
      sourceUrl = `${parsed.url}/tree/main/${relPath}`;
    }
  }

  const entry = normalizeSkill({
    name: target.name,
    description: target.description || 'TODO: write description',
    category: categoryFlag || 'development',
    workArea: areaFlag || 'TODO',
    branch: branchFlag || 'TODO',
    author,
    source: sourceLabel,
    license: target.frontmatter.license || 'MIT',
    path: `skills/${folderName}`,
    tier: 'house',
    distribution: 'bundled',
    vendored: true,
    installSource: '',
    tags: tagsFlag ? tagsFlag.split(',').map(t => t.trim()) : [],
    featured: false,
    verified: false,
    origin: 'curated',
    trust: 'listed',
    syncMode: 'snapshot',
    sourceUrl: sourceUrl.startsWith('https://') ? sourceUrl : '',
    whyHere: '',
    addedDate: new Date().toISOString().split('T')[0],
    lastVerified: '',
    notes: '',
    labels: [],
  });

  if (dryRun) {
    console.log('\nDry run. Would do:\n');
    console.log(`  Copy: ${target.dir}/ -> skills/${folderName}/`);
    console.log(`  Add to skills.json:`);
    console.log(JSON.stringify(entry, null, 2).split('\n').map(l => `    ${l}`).join('\n'));
    console.log(`\n  New total: ${catalog.skills.length + 1}`);
    process.exit(0);
  }

  // Copy the skill folder
  console.log(`Copying ${target.name} -> skills/${folderName}/`);
  copyDirSync(target.dir, destDir);

  // Add to catalog
  catalog.skills.push(entry);
  catalog.total = catalog.skills.length;
  catalog.updated = new Date().toISOString().split('T')[0] + 'T00:00:00Z';

  writeCatalogData(catalog);

  console.log(`Added to skills.json (${catalog.skills.length} total)`);
  console.log();
  console.log('Next steps:');
  console.log(`  1. Write the whyHere in skills.json`);
  console.log(`  2. Set workArea and branch if you used TODO placeholders`);
  console.log(`  3. Review the SKILL.md in skills/${folderName}/`);
  console.log(`  4. Run: node scripts/validate.js`);
  console.log(`  5. When verified, set trust to "reviewed" or "verified"`);

} finally {
  prepared.cleanup();
}

// ── Helpers ──

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.name === '.git') continue;
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
