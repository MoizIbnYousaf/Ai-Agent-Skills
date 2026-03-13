#!/usr/bin/env node

/**
 * Test suite for ai-agent-skills CLI
 * Run with: node test.js
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, execFileSync } = require('child_process');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  dim: '\x1b[2m'
};

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`${colors.green}✓${colors.reset} ${name}`);
    passed++;
  } catch (e) {
    console.log(`${colors.red}✗${colors.reset} ${name}`);
    console.log(`  ${colors.dim}${e.message}${colors.reset}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function assertEqual(a, b, message) {
  if (a !== b) throw new Error(message || `Expected ${b}, got ${a}`);
}

function assertContains(str, substr, message) {
  if (!str.includes(substr)) throw new Error(message || `Expected "${str}" to contain "${substr}"`);
}

function run(cmd) {
  try {
    return execSync(`node cli.js ${cmd}`, { encoding: 'utf8', cwd: __dirname });
  } catch (e) {
    return e.stdout || e.message;
  }
}

function runArgs(args) {
  try {
    return execFileSync(process.execPath, ['cli.js', ...args], { encoding: 'utf8', cwd: __dirname });
  } catch (e) {
    return e.stdout || e.message;
  }
}

console.log('\n🧪 Running tests...\n');

// ============ SKILLS.JSON TESTS ============

test('skills.json exists and is valid JSON', () => {
  const content = fs.readFileSync(path.join(__dirname, 'skills.json'), 'utf8');
  const data = JSON.parse(content);
  assert(Array.isArray(data.skills), 'skills should be an array');
});

test('skills.json has skills with required fields', () => {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'skills.json'), 'utf8'));
  const required = ['name', 'description', 'category', 'workArea', 'branch', 'author', 'license', 'source', 'sourceUrl', 'origin', 'trust', 'syncMode', 'whyHere'];

  data.skills.forEach(skill => {
    required.forEach(field => {
      assert(skill[field], `Skill ${skill.name} missing ${field}`);
    });
  });
});

test('skills.json provenance metadata is valid', () => {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'skills.json'), 'utf8'));
  const validOrigins = ['authored', 'curated', 'adapted'];
  const validSyncModes = ['authored', 'mirror', 'snapshot', 'adapted'];

  data.skills.forEach(skill => {
    assert(validOrigins.includes(skill.origin), `Invalid origin "${skill.origin}" for ${skill.name}`);
    assert(validSyncModes.includes(skill.syncMode), `Invalid syncMode "${skill.syncMode}" for ${skill.name}`);
    assert(
      typeof skill.sourceUrl === 'string' && skill.sourceUrl.startsWith('https://github.com/'),
      `Invalid sourceUrl for ${skill.name}`
    );
    assert(
      typeof skill.whyHere === 'string' && skill.whyHere.trim().length >= 20,
      `whyHere is too thin for ${skill.name}`
    );

    if (skill.verified) {
      assert(skill.lastVerified, `Verified skill ${skill.name} missing lastVerified`);
    }
  });
});

test('skills.json does not carry stale popularity metrics', () => {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'skills.json'), 'utf8'));

  data.skills.forEach(skill => {
    assert(!('stars' in skill), `Skill ${skill.name} should not include stars`);
    assert(!('downloads' in skill), `Skill ${skill.name} should not include downloads`);
  });
});

test('skill names match folder names', () => {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'skills.json'), 'utf8'));
  const skillsDir = path.join(__dirname, 'skills');

  data.skills.forEach(skill => {
    const skillPath = path.join(skillsDir, skill.name);
    assert(fs.existsSync(skillPath), `Folder missing for skill: ${skill.name}`);
    assert(fs.existsSync(path.join(skillPath, 'SKILL.md')), `SKILL.md missing for: ${skill.name}`);
  });
});

test('no duplicate skill names', () => {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'skills.json'), 'utf8'));
  const names = data.skills.map(s => s.name);
  const unique = [...new Set(names)];
  assertEqual(names.length, unique.length, 'Duplicate skill names found');
});

test('all categories are valid', () => {
  const validCategories = ['development', 'document', 'creative', 'business', 'productivity'];
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'skills.json'), 'utf8'));

  data.skills.forEach(skill => {
    assert(
      validCategories.includes(skill.category),
      `Invalid category "${skill.category}" for skill ${skill.name}`
    );
  });
});

test('collections metadata is valid', () => {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'skills.json'), 'utf8'));
  const names = new Set(data.skills.map(s => s.name));

  assert(Array.isArray(data.collections), 'collections should be an array');

  data.collections.forEach(collection => {
    assert(collection.id, 'collection missing id');
    assert(collection.title, `collection ${collection.id} missing title`);
    assert(Array.isArray(collection.skills), `collection ${collection.id} missing skills array`);

    collection.skills.forEach(skillName => {
      assert(names.has(skillName), `collection ${collection.id} references unknown skill ${skillName}`);
    });
  });
});

test('work area metadata is valid', () => {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'skills.json'), 'utf8'));
  const workAreas = data.workAreas || [];
  const ids = new Set(workAreas.map(area => area.id));

  assert(Array.isArray(workAreas), 'workAreas should be an array');
  assert(workAreas.length > 0, 'workAreas should not be empty');

  workAreas.forEach(area => {
    assert(area.id, 'work area missing id');
    assert(area.title, `work area ${area.id} missing title`);
    assert(area.description, `work area ${area.id} missing description`);
  });

  data.skills.forEach(skill => {
    assert(ids.has(skill.workArea), `Skill ${skill.name} has invalid workArea ${skill.workArea}`);
    assert(typeof skill.branch === 'string' && skill.branch.trim(), `Skill ${skill.name} missing branch`);
  });
});

// ============ CLI TESTS ============

test('help command works', () => {
  const output = run('help');
  assertContains(output, 'AI Agent Skills');
  assertContains(output, 'install');
  assertContains(output, 'uninstall');
  assertContains(output, 'collections');
  assertContains(output, 'preview');
});

test('list command works', () => {
  const output = run('list');
  assertContains(output, 'Available Skills');
  assertContains(output, 'FRONTEND');
});

test('no-arg command falls back to help outside a TTY', () => {
  const output = runArgs([]);
  assertContains(output, 'AI Agent Skills');
  assertContains(output, 'browse');
});

test('collections command works', () => {
  const output = run('collections');
  assertContains(output, 'Curated Collections');
  assertContains(output, 'My Picks');
  assertContains(output, 'build-apps');
});

test('search command works', () => {
  const output = run('search pdf');
  assertContains(output, 'pdf');
});

test('info command works', () => {
  const output = run('info pdf');
  assertContains(output, 'pdf');
  assertContains(output, 'Work Area:');
  assertContains(output, 'Branch:');
  assertContains(output, 'Category:');
  assertContains(output, 'Trust:');
  assertContains(output, 'Source Repo:');
  assertContains(output, 'Source URL:');
  assertContains(output, 'Sync Mode:');
  assertContains(output, 'Why Here:');
  assertContains(output, 'Collections:');
});

test('preview command works', () => {
  const output = run('preview pdf');
  assertContains(output, 'Preview:');
  assertContains(output, 'pdf');
  assertContains(output, '# PDF Processing Guide');
});

test('browse command shows tty guidance outside a TTY', () => {
  const output = runArgs(['browse']);
  assertContains(output, 'requires a TTY terminal');
});

test('invalid skill name rejected', () => {
  const output = run('install "test;echo hacked"');
  assertContains(output, 'Invalid skill name');
});

test('dry-run shows preview', () => {
  const output = run('install pdf --dry-run');
  assertContains(output, 'Dry Run');
  assertContains(output, 'Would install');
});

test('git url install works', () => {
  // Use mkdtempSync for both temp directories
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-work-'));
  const skillFile = path.join(workDir, 'SKILL.md');
  fs.writeFileSync(skillFile, '# Test Skill');

  execSync('git init', { cwd: workDir, stdio: 'pipe' });
  execSync('git add SKILL.md', { cwd: workDir, stdio: 'pipe' });
  execSync('git -c user.email="test@example.com" -c user.name="Test User" commit -m "init"', { cwd: workDir, stdio: 'pipe' });

  // Use mkdtempSync for bare repo too (more secure than Date.now())
  const bareRepoBase = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-bare-'));
  const bareRepo = bareRepoBase + '.git';
  fs.renameSync(bareRepoBase, bareRepo);
  execSync(`git clone --bare ${workDir} ${bareRepo}`, { stdio: 'pipe' });

  const gitUrl = `file://${bareRepo}`;
  const expectedSkillName = path.basename(bareRepo).replace(/\.git$/, '');
  const installedPath = path.join(__dirname, '.skills', expectedSkillName);

  // Ensure clean slate
  fs.rmSync(installedPath, { recursive: true, force: true });

  const output = runArgs(['install', gitUrl, '--agent', 'project']);
  assertContains(output, 'Installed');

  assert(
    fs.existsSync(path.join(installedPath, 'SKILL.md')),
    `Skill should be installed from git url. Expected ${installedPath}, got output: ${output}`
  );
  const metaPath = path.join(installedPath, '.skill-meta.json');
  assert(fs.existsSync(metaPath), 'Metadata file should exist for git install');
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  assertEqual(meta.source, 'git');
  assertContains(meta.url, 'file://');

  // Cleanup
  fs.rmSync(installedPath, { recursive: true, force: true });
  fs.rmSync(bareRepo, { recursive: true, force: true });
  fs.rmSync(workDir, { recursive: true, force: true });
});

test('config command works', () => {
  const output = run('config');
  assertContains(output, 'Configuration');
  assertContains(output, 'defaultAgent');
});

test('unknown command shows error', () => {
  const output = run('notacommand');
  assertContains(output, 'Unknown command');
});

test('category filter works', () => {
  const output = run('list --category document');
  assertContains(output, 'DOCS');
});

test('work area filter works', () => {
  const output = run('list --work-area testing');
  assertContains(output, 'TESTING');
  assertContains(output, 'qa-regression');
});

test('collection filter works', () => {
  const output = run('list --collection build-apps');
  assertContains(output, 'Build Apps');
  assertContains(output, 'frontend-design');
});

test('legacy collection alias works', () => {
  const output = run('list --collection web-product');
  assertContains(output, 'now maps to "build-apps"');
  assertContains(output, 'Build Apps');
});

test('retired collection shows guidance', () => {
  const output = run('list --collection creative-media');
  assertContains(output, 'no longer a top-level collection');
});

test('uncurated skill info shows no collections', () => {
  const output = run('info internal-comms');
  assertContains(output, 'Collections:');
  assertContains(output, 'none');
});

// ============ SECURITY TESTS ============

test('path traversal blocked in skill names', () => {
  // Path traversal in skill names should be rejected
  const output = run('install "..passwd"');
  assertContains(output, 'Invalid skill name');
});

test('backslash path traversal blocked', () => {
  const output = run('install ..\\..\\etc');
  assertContains(output, 'Invalid skill name');
});

// ============ SUMMARY ============

console.log('\n' + '─'.repeat(40));
console.log(`${colors.green}Passed: ${passed}${colors.reset}`);
if (failed > 0) {
  console.log(`${colors.red}Failed: ${failed}${colors.reset}`);
}
console.log('─'.repeat(40) + '\n');

process.exit(failed > 0 ? 1 : 0);
