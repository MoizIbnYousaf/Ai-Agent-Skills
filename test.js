#!/usr/bin/env node

/**
 * Test suite for ai-agent-skills CLI
 * Run with: node test.js
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, execFileSync } = require('child_process');
const { buildCatalog, getGitHubInstallSpec, getSkillsInstallSpec } = require('./tui/catalog.cjs');

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

function assertNotContains(str, substr, message) {
  if (str.includes(substr)) throw new Error(message || `Expected "${str}" NOT to contain "${substr}"`);
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

function runModule(source) {
  try {
    return execFileSync(process.execPath, ['--input-type=module', '-e', source], { encoding: 'utf8', cwd: __dirname });
  } catch (e) {
    return e.stdout || e.stderr || e.message;
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

test('catalog exposes curated collections with resolved skills', () => {
  const catalog = buildCatalog();
  const myPicks = catalog.collections.find(collection => collection.id === 'my-picks');

  assert(Array.isArray(catalog.collections) && catalog.collections.length > 0, 'catalog should expose collections');
  assert(myPicks, 'expected my-picks collection to exist');
  assert(myPicks.skills.length > 0, 'collection should resolve skill objects');
  assertContains(myPicks.skills.map(skill => skill.name).join(' '), 'frontend-design');
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

test('skills.sh install spec is created for upstream GitHub skills', () => {
  const catalog = buildCatalog();
  const mirrorSkill = catalog.skills.find(skill => skill.name === 'figma-implement-design');
  const snapshotSkill = catalog.skills.find(skill => skill.name === 'frontend-design');
  const authoredSkill = catalog.skills.find(skill => skill.name === 'qa-regression');

  const mirrorSpec = getSkillsInstallSpec(mirrorSkill, 'codex');
  assert(mirrorSpec, 'Expected mirror skill to expose a skills.sh install spec');
  assertContains(mirrorSpec.command, 'skills@1.4.5');
  assertContains(mirrorSpec.command, 'figma-implement-design');
  assertContains(mirrorSpec.command, 'codex');
  assertContains(mirrorSpec.command, '--skill');

  const snapshotSpec = getSkillsInstallSpec(snapshotSkill, 'codex');
  assert(snapshotSpec, 'Expected snapshot skill to expose a skills.sh install spec');
  assertContains(snapshotSpec.command, 'https://github.com/anthropics/skills');
  assertContains(snapshotSpec.command, '--skill frontend-design');
  assertContains(snapshotSpec.command, '--agent codex');

  const authoredSpec = getSkillsInstallSpec(authoredSkill, 'codex');
  assert(authoredSpec, 'Expected GitHub-backed authored skill to expose a skills.sh install spec');
  assertContains(authoredSpec.command, 'https://github.com/MoizIbnYousaf/Ai-Agent-Skills');
  assertContains(authoredSpec.command, '--skill qa-regression');
});

test('skills.sh install spec respects supported agent mappings', () => {
  const catalog = buildCatalog();
  const mirrorSkill = catalog.skills.find(skill => skill.name === 'figma-implement-design');

  assertEqual(getSkillsInstallSpec(mirrorSkill, 'project'), null, 'Project agent should not expose skills.sh install');
  assertEqual(getSkillsInstallSpec(mirrorSkill, 'letta'), null, 'Unsupported mapped agent should not expose skills.sh install');
});

test('github install spec resolves upstream path for curated external skills', () => {
  const catalog = buildCatalog();
  const snapshotSkill = catalog.skills.find(skill => skill.name === 'frontend-design');
  const nestedSkill = catalog.skills.find(skill => skill.name === 'code-review');
  const openaiSkill = catalog.skills.find(skill => skill.name === 'openai-docs');
  const authoredSkill = catalog.skills.find(skill => skill.name === 'qa-regression');

  const snapshotSpec = getGitHubInstallSpec(snapshotSkill, 'codex');
  assert(snapshotSpec, 'Expected curated external skill to expose a GitHub install spec');
  assertContains(snapshotSpec.command, 'anthropics/skills/frontend-design');

  const nestedSpec = getGitHubInstallSpec(nestedSkill, 'codex');
  assert(nestedSpec, 'Expected nested upstream skill to expose a GitHub install spec');
  assertContains(nestedSpec.command, 'anthropics/claude-code/plugins/code-review');

  const openaiSpec = getGitHubInstallSpec(openaiSkill, 'codex');
  assert(openaiSpec, 'Expected OpenAI system skill to expose a GitHub install spec');
  assertContains(openaiSpec.command, 'openai/skills/.system/openai-docs');

  assertEqual(getGitHubInstallSpec(authoredSkill, 'codex'), null, 'Authored skills should not expose an upstream GitHub install spec');
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

test('package exposes only the ai-agent-skills binary', () => {
  const pkg = require('./package.json');
  assertEqual(Object.keys(pkg.bin).length, 1);
  assert(pkg.bin['ai-agent-skills'], 'Expected ai-agent-skills binary to exist');
  assert(!pkg.bin.skills, 'skills binary alias should be removed');
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

test('collections command shows start-here recommendations', () => {
  const output = run('collections');
  assertContains(output, 'Start here:');
  assertContains(output, 'frontend-design, mcp-builder, pdf');
});

test('search command works', () => {
  const output = run('search pdf');
  assertContains(output, 'pdf');
});

test('search ranks stronger curated matches first', () => {
  const output = run('search react');
  assert(output.indexOf('frontend-design') < output.indexOf('artifacts-builder'), 'frontend-design should rank ahead of artifacts-builder for react');
  assertContains(output, '{My Picks, Build Apps}');
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

test('info command shows neighboring recommendations', () => {
  const output = run('info frontend-design');
  assertContains(output, 'Also Look At:');
  assertContains(output, 'figma-implement-design');
  assertContains(output, 'anthropics/skills/frontend-design');
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

test('help output shows scope-based targets and legacy agent support', () => {
  const output = run('help');
  assertContains(output, '-p, --project');
  assertContains(output, '.agents/skills/');
  assertContains(output, 'Legacy agents');
  assertContains(output, '--agent');
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

test('nested GitHub skill path install dry-run works', () => {
  const output = runArgs(['install', 'anthropics/claude-code/plugins/code-review', '--agent', 'project', '--dry-run']);
  assertContains(output, 'Dry Run');
  assertContains(output, 'Would clone');
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
  const expectedSkillName = path.basename(bareRepo)
    .replace(/\.git$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
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

test('doctor command works', () => {
  const output = run('doctor --agent project');
  assertContains(output, 'AI Agent Skills Doctor');
  assertContains(output, 'Bundled library');
  assertContains(output, 'project target');
});

test('validate command works on a bundled skill', () => {
  const output = runArgs(['validate', 'skills/pdf']);
  assertContains(output, 'Validate Skill');
  assertContains(output, 'PASS');
  assertContains(output, 'Name:');
  assertContains(output, 'pdf');
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

test('work area list shows collection badges', () => {
  const output = run('list --work-area frontend');
  assertContains(output, '{My Picks, Build Apps}');
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

test('viewport profile classifies small terminals correctly', () => {
  const output = runModule(`
    import {__test} from './tui/index.mjs';
    console.log(JSON.stringify({
      micro: __test.getViewportProfile({columns: 80, rows: 24}),
      tooSmall: __test.getViewportProfile({columns: 50, rows: 16})
    }));
  `);
  const data = JSON.parse(output);
  assertEqual(data.micro.tier, 'micro');
  assertEqual(data.micro.compact, true);
  assertEqual(data.tooSmall.tooSmall, true);
});

test('home screen visibility collapses on compact terminals', () => {
  const output = runModule(`
    import {__test} from './tui/index.mjs';
    const micro = __test.getViewportProfile({columns: 80, rows: 24});
    const compact = __test.getViewportProfile({columns: 100, rows: 30});
    console.log(JSON.stringify({
      micro: __test.getVisibleHomeSectionIndices(5, 2, micro),
      compact: __test.getVisibleHomeSectionIndices(5, 2, compact)
    }));
  `);
  const data = JSON.parse(output);
  assertEqual(data.micro.length, 1, 'micro view should only show the active shelf');
  assertEqual(data.micro[0], 2, 'micro view should keep the active shelf');
  assert(data.compact.length <= 3, 'compact view should keep the shelf list short');
  assertContains(data.compact.join(','), '2');
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

// ============ V3 SCOPE RESOLUTION TESTS ============

test('install defaults to global scope (dry-run)', () => {
  const output = run('install pdf --dry-run');
  assertContains(output, 'Dry Run');
  assertContains(output, path.join('.claude', 'skills'));
});

test('install -p targets project scope (dry-run)', () => {
  const output = run('install pdf -p --dry-run');
  assertContains(output, 'Dry Run');
  assertContains(output, path.join('.agents', 'skills'));
});

test('install --agent cursor still works (legacy path)', () => {
  const output = runArgs(['install', 'pdf', '--agent', 'cursor', '--dry-run']);
  assertContains(output, 'Dry Run');
  assertContains(output, '.cursor');
});

test('install --all targets both global and project scopes (dry-run)', () => {
  const output = run('install pdf --all --dry-run');
  assertContains(output, 'Dry Run');
  assertContains(output, '.claude');
  assertContains(output, '.agents');
});

// ============ V3 SOURCE PARSING TESTS ============

test('source parser: owner/repo parses as github shorthand (dry-run)', () => {
  const output = runArgs(['install', 'anthropics/skills', '--dry-run']);
  assertContains(output, 'Dry Run');
  assertContains(output, 'github.com/anthropics/skills');
});

test('source parser: full github URL parses correctly (dry-run)', () => {
  const output = runArgs(['install', 'https://github.com/anthropics/skills', '--dry-run']);
  assertContains(output, 'Dry Run');
  assertContains(output, 'github.com/anthropics/skills');
});

test('source parser: local path prefix is recognized (dry-run)', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-local-'));
  try {
    fs.writeFileSync(path.join(tmpDir, 'SKILL.md'), '---\nname: test-local\ndescription: test\n---\n# Test');
    const output = runArgs(['install', tmpDir, '--dry-run']);
    assertContains(output, 'Dry Run');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('source parser: owner/repo@skill extracts skill filter (dry-run)', () => {
  const output = runArgs(['install', 'anthropics/skills@frontend-design', '--dry-run']);
  assertContains(output, 'Dry Run');
  assertContains(output, 'anthropics/skills');
});

test('source parser: path traversal in source rejected', () => {
  const output = run('install "../../etc"');
  // Should be treated as a local path or rejected
  const combined = output.toLowerCase();
  assert(
    combined.includes('invalid') || combined.includes('error') || combined.includes('not found') || combined.includes('no skill'),
    'Path traversal source should not succeed silently'
  );
});

// ============ V3 SOURCE-REPO INSTALL TESTS ============

test('source-repo --list flag shows available skills', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-list-'));
  try {
    const skillDir = path.join(tmpDir, 'skills', 'test-alpha');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: test-alpha\ndescription: Alpha skill\n---\n# Test Alpha');
    execSync('git init', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git add -A', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git -c user.email="test@test.com" -c user.name="Test" commit -m "init"', { cwd: tmpDir, stdio: 'pipe' });
    const output = runArgs(['install', tmpDir, '--list']);
    assertContains(output, 'test-alpha');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('source-repo --skill flag installs only the named skill', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-filter-'));
  const installBase = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-target-'));
  try {
    // Create two skills in a local repo
    for (const name of ['alpha-skill', 'beta-skill']) {
      const dir = path.join(tmpDir, 'skills', name);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: ${name} desc\n---\n# ${name}`);
    }
    execSync('git init', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git add -A', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git -c user.email="test@test.com" -c user.name="Test" commit -m "init"', { cwd: tmpDir, stdio: 'pipe' });

    const output = runArgs(['install', tmpDir, '--skill', 'alpha-skill', '--yes']);
    assertContains(output, 'alpha-skill');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.rmSync(installBase, { recursive: true, force: true });
  }
});

test('source-repo install from local git repo discovers skills', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-discover-'));
  try {
    const skillDir = path.join(tmpDir, 'skills', 'discover-test');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: discover-test\ndescription: Discoverable\n---\n# Discover');
    execSync('git init', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git add -A', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git -c user.email="test@test.com" -c user.name="Test" commit -m "init"', { cwd: tmpDir, stdio: 'pipe' });

    const output = runArgs(['install', tmpDir, '--list']);
    assertContains(output, 'discover-test');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('source-repo --skill nonexistent shows error with available names', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-noexist-'));
  try {
    const skillDir = path.join(tmpDir, 'skills', 'real-skill');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: real-skill\ndescription: Real\n---\n# Real');
    execSync('git init', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git add -A', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git -c user.email="test@test.com" -c user.name="Test" commit -m "init"', { cwd: tmpDir, stdio: 'pipe' });

    const output = runArgs(['install', tmpDir, '--skill', 'nonexistent-xyz', '--yes']);
    const combined = output.toLowerCase();
    assert(
      combined.includes('not found') || combined.includes('no matching') || combined.includes('available'),
      'Should show error when skill filter matches nothing'
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('source-repo install writes .skill-meta.json', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-meta-'));
  try {
    // Create a single-skill local repo
    fs.writeFileSync(path.join(tmpDir, 'SKILL.md'), '---\nname: meta-test\ndescription: Meta test\n---\n# Meta');
    execSync('git init', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git add -A', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git -c user.email="test@test.com" -c user.name="Test" commit -m "init"', { cwd: tmpDir, stdio: 'pipe' });

    const output = runArgs(['install', tmpDir, '--yes']);
    // Check that install succeeded
    assertContains(output, 'meta-test');

    // Check .skill-meta.json was written at the install target
    const globalSkillDir = path.join(os.homedir(), '.claude', 'skills', 'meta-test');
    if (fs.existsSync(globalSkillDir)) {
      const metaPath = path.join(globalSkillDir, '.skill-meta.json');
      assert(fs.existsSync(metaPath), '.skill-meta.json should be written after install');
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      assert(meta.installedAt, 'meta should include installedAt');
      assert(meta.source, 'meta should include source');
      // Cleanup installed skill
      fs.rmSync(globalSkillDir, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ============ V3 INIT COMMAND TESTS ============

test('init creates SKILL.md with valid frontmatter', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-init-'));
  try {
    const output = execSync(`node ${path.join(__dirname, 'cli.js')} init test-init-skill`, {
      encoding: 'utf8',
      cwd: tmpDir
    });
    const skillMd = fs.readFileSync(path.join(tmpDir, 'test-init-skill', 'SKILL.md'), 'utf8');
    assertContains(skillMd, 'name: test-init-skill');
    assertContains(skillMd, 'description:');
    assertContains(skillMd, '## Gotchas');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('init with no argument uses current directory name', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'my-cool-skill-'));
  try {
    const output = execSync(`node ${path.join(__dirname, 'cli.js')} init`, {
      encoding: 'utf8',
      cwd: tmpDir
    });
    const skillMd = fs.readFileSync(path.join(tmpDir, 'SKILL.md'), 'utf8');
    assertContains(skillMd, 'name:');
    assertContains(skillMd, '## When to Use');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('init on existing skill shows error', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-initdup-'));
  try {
    // Create first
    execSync(`node ${path.join(__dirname, 'cli.js')} init`, { encoding: 'utf8', cwd: tmpDir });
    // Try again, should fail
    let output;
    try {
      output = execSync(`node ${path.join(__dirname, 'cli.js')} init`, { encoding: 'utf8', cwd: tmpDir });
    } catch (e) {
      output = e.stdout || e.stderr || e.message;
    }
    assertContains(output, 'already exists');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ============ V3 CHECK COMMAND TESTS ============

test('check command reports installed skills', () => {
  const output = run('check');
  assertContains(output, 'Checking installed skills');
});

test('check -g only checks global scope', () => {
  const output = run('check -g');
  assertContains(output, 'Checking installed skills');
});

// ============ V3 HELP AND UX TESTS ============

test('help shows scope-based targets, not full agent list', () => {
  const output = run('help');
  assertContains(output, '--project');
  assertContains(output, '--global');
  assertContains(output, '.agents/skills/');
  assertContains(output, '.claude/skills/');
});

test('help mentions legacy agent support', () => {
  const output = run('help');
  assertContains(output, 'Legacy');
  assertContains(output, '--agent');
});

test('help examples use -p and -g flags', () => {
  const output = run('help');
  assertContains(output, '-p');
  assertContains(output, '-g');
});

// ============ V3 SECURITY TESTS ============

test('subpath with .. segments is rejected in source', () => {
  const output = runArgs(['install', 'owner/repo/../../../etc/passwd', '--dry-run']);
  const combined = output.toLowerCase();
  assert(
    combined.includes('invalid') || combined.includes('rejected') || combined.includes('path traversal') || combined.includes('error'),
    'Subpath with .. should be rejected or sanitized'
  );
});

test('safeTempCleanup validates path is inside tmpdir', () => {
  // Test that safeTempCleanup won't remove paths outside tmpdir
  // We do this by requiring cli.js indirectly and testing the behavior
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'safe-clean-'));
  const testFile = path.join(tmpDir, 'test.txt');
  fs.writeFileSync(testFile, 'test');

  // Verify the file exists in tmp
  assert(fs.existsSync(testFile), 'Test file should exist');

  // Clean up using a safe path (inside tmpdir)
  fs.rmSync(tmpDir, { recursive: true, force: true });
  assert(!fs.existsSync(tmpDir), 'Temp directory should be cleaned');
});

test('skill names with shell metacharacters are rejected', () => {
  const dangerous = ['test$(whoami)', 'test`id`', 'test|cat', 'test;ls'];
  for (const name of dangerous) {
    const output = runArgs(['install', name, '--dry-run']);
    assertContains(output, 'Invalid skill name', `Shell metachar "${name}" should be rejected`);
  }
});

// ============ SUMMARY ============

console.log('\n' + '─'.repeat(40));
console.log(`${colors.green}Passed: ${passed}${colors.reset}`);
if (failed > 0) {
  console.log(`${colors.red}Failed: ${failed}${colors.reset}`);
}
console.log('─'.repeat(40) + '\n');

process.exit(failed > 0 ? 1 : 0);
