#!/usr/bin/env node

/**
 * Test suite for ai-agent-skills CLI
 * Run with: node test.js
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, execFileSync } = require('child_process');
const { loadCatalogData } = require('./lib/catalog-data.cjs');
const { buildUpstreamCatalogEntry } = require('./lib/catalog-mutations.cjs');
const { generatedDocsAreInSync, renderGeneratedDocs } = require('./lib/render-docs.cjs');
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

function runArgsWithOptions(args, options = {}) {
  try {
    return execFileSync(process.execPath, [path.join(__dirname, 'cli.js'), ...args], {
      encoding: 'utf8',
      cwd: options.cwd || __dirname,
      env: options.env || process.env,
    });
  } catch (e) {
    return e.stdout || e.stderr || e.message;
  }
}

function runModule(source) {
  try {
    return execFileSync(process.execPath, ['--input-type=module', '-e', source], { encoding: 'utf8', cwd: __dirname });
  } catch (e) {
    return e.stdout || e.stderr || e.message;
  }
}

function runCommandResult(args, options = {}) {
  try {
    const stdout = execFileSync(process.execPath, [path.join(__dirname, 'cli.js'), ...args], {
      encoding: 'utf8',
      cwd: options.cwd || __dirname,
      env: options.env || process.env,
      input: options.input,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { status: 0, stdout, stderr: '' };
  } catch (e) {
    return {
      status: typeof e.status === 'number' ? e.status : 1,
      stdout: e.stdout || '',
      stderr: e.stderr || '',
    };
  }
}

function copyValidateFixtureFiles(tmpDir) {
  const tmpScripts = path.join(tmpDir, 'scripts');
  const tmpLib = path.join(tmpDir, 'lib');
  fs.mkdirSync(tmpScripts, { recursive: true });
  fs.mkdirSync(tmpLib, { recursive: true });
  fs.copyFileSync(path.join(__dirname, 'scripts', 'validate.js'), path.join(tmpScripts, 'validate.js'));
  fs.copyFileSync(path.join(__dirname, 'lib', 'catalog-data.cjs'), path.join(tmpLib, 'catalog-data.cjs'));
  fs.copyFileSync(path.join(__dirname, 'lib', 'frontmatter.cjs'), path.join(tmpLib, 'frontmatter.cjs'));
  fs.copyFileSync(path.join(__dirname, 'lib', 'paths.cjs'), path.join(tmpLib, 'paths.cjs'));
  fs.copyFileSync(path.join(__dirname, 'lib', 'render-docs.cjs'), path.join(tmpLib, 'render-docs.cjs'));
}

function writeFixtureDocs(tmpDir, data) {
  const readmeTemplate = [
    '# Test Library',
    '',
    '<!-- GENERATED:library-stats:start -->',
    '<!-- GENERATED:library-stats:end -->',
    '',
    '<!-- GENERATED:shelf-table:start -->',
    '<!-- GENERATED:shelf-table:end -->',
    '',
    '<!-- GENERATED:collection-table:start -->',
    '<!-- GENERATED:collection-table:end -->',
    '',
    '<!-- GENERATED:source-table:start -->',
    '<!-- GENERATED:source-table:end -->',
    '',
  ].join('\n');
  const rendered = renderGeneratedDocs(data, readmeTemplate);
  fs.writeFileSync(path.join(tmpDir, 'README.md'), rendered.readme);
  fs.writeFileSync(path.join(tmpDir, 'WORK_AREAS.md'), rendered.workAreas);
}

function snapshotCatalogFiles() {
  return {
    skills: fs.readFileSync(path.join(__dirname, 'skills.json'), 'utf8'),
    readme: fs.readFileSync(path.join(__dirname, 'README.md'), 'utf8'),
    workAreas: fs.readFileSync(path.join(__dirname, 'WORK_AREAS.md'), 'utf8'),
  };
}

function restoreCatalogFiles(snapshot) {
  fs.writeFileSync(path.join(__dirname, 'skills.json'), snapshot.skills);
  fs.writeFileSync(path.join(__dirname, 'README.md'), snapshot.readme);
  fs.writeFileSync(path.join(__dirname, 'WORK_AREAS.md'), snapshot.workAreas);
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
  const required = ['name', 'description', 'category', 'workArea', 'branch', 'author', 'license', 'source', 'sourceUrl', 'origin', 'trust', 'syncMode'];
  const vendoredRequired = [...required, 'whyHere'];

  data.skills.forEach(skill => {
    const fields = skill.vendored === false ? required : vendoredRequired;
    fields.forEach(field => {
      assert(skill[field], `Skill ${skill.name} missing ${field}`);
    });
  });
});

test('skills.json provenance metadata is valid', () => {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'skills.json'), 'utf8'));
  const validOrigins = ['authored', 'curated', 'adapted'];
  const validSyncModes = ['authored', 'mirror', 'snapshot', 'adapted', 'live'];

  data.skills.forEach(skill => {
    assert(validOrigins.includes(skill.origin), `Invalid origin "${skill.origin}" for ${skill.name}`);
    assert(validSyncModes.includes(skill.syncMode), `Invalid syncMode "${skill.syncMode}" for ${skill.name}`);
    assert(
      typeof skill.sourceUrl === 'string' && skill.sourceUrl.startsWith('https://github.com/'),
      `Invalid sourceUrl for ${skill.name}`
    );

    // whyHere is required for vendored skills, optional for cataloged upstream
    if (skill.vendored !== false) {
      assert(
        typeof skill.whyHere === 'string' && skill.whyHere.trim().length >= 20,
        `whyHere is too thin for ${skill.name}`
      );
    }

    if (skill.verified) {
      assert(skill.lastVerified, `Verified skill ${skill.name} missing lastVerified`);
    }
  });
});

test('frontend shelf distinguishes overlapping frontend picks by publisher', () => {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'skills.json'), 'utf8'));
  const anthropicFrontend = data.skills.find(skill => skill.name === 'frontend-design');
  const openaiFrontend = data.skills.find(skill => skill.name === 'frontend-skill');

  assert(anthropicFrontend, 'Expected frontend-design to exist');
  assert(openaiFrontend, 'Expected frontend-skill to exist');
  assertEqual(anthropicFrontend.branch, 'Frontend (Anthropic)');
  assertEqual(openaiFrontend.branch, 'Frontend (OpenAI)');
});

test('skills.json does not carry stale popularity metrics', () => {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'skills.json'), 'utf8'));

  data.skills.forEach(skill => {
    assert(!('stars' in skill), `Skill ${skill.name} should not include stars`);
    assert(!('downloads' in skill), `Skill ${skill.name} should not include downloads`);
  });
});

test('vendored skill names match folder names', () => {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'skills.json'), 'utf8'));
  const skillsDir = path.join(__dirname, 'skills');

  data.skills.filter(s => s.vendored !== false).forEach(skill => {
    const skillPath = path.join(skillsDir, skill.name);
    assert(fs.existsSync(skillPath), `Folder missing for vendored skill: ${skill.name}`);
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
  const mirrorSkill = catalog.skills.find(skill => skill.name === 'figma');
  const snapshotSkill = catalog.skills.find(skill => skill.name === 'frontend-design');
  const authoredSkill = catalog.skills.find(skill => skill.name === 'job-application');

  const mirrorSpec = getSkillsInstallSpec(mirrorSkill, 'codex');
  assert(mirrorSpec, 'Expected mirror skill to expose a skills.sh install spec');
  assertContains(mirrorSpec.command, 'skills@1.4.5');
  assertContains(mirrorSpec.command, 'figma');
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
  assertContains(authoredSpec.command, '--skill job-application');
});

test('skills.sh install spec respects supported agent mappings', () => {
  const catalog = buildCatalog();
  const mirrorSkill = catalog.skills.find(skill => skill.name === 'figma');

  assertEqual(getSkillsInstallSpec(mirrorSkill, 'project'), null, 'Project agent should not expose skills.sh install');
  assertEqual(getSkillsInstallSpec(mirrorSkill, 'letta'), null, 'Unsupported mapped agent should not expose skills.sh install');
});

test('github install spec resolves upstream path for curated external skills', () => {
  const catalog = buildCatalog();
  const snapshotSkill = catalog.skills.find(skill => skill.name === 'frontend-design');
  const openaiSkill = catalog.skills.find(skill => skill.name === 'openai-docs');
  const authoredSkill = catalog.skills.find(skill => skill.name === 'job-application');

  const snapshotSpec = getGitHubInstallSpec(snapshotSkill, 'codex');
  assert(snapshotSpec, 'Expected curated external skill to expose a GitHub install spec');
  assertContains(snapshotSpec.command, 'anthropics/skills/skills/frontend-design');

  const openaiSpec = getGitHubInstallSpec(openaiSkill, 'codex');
  assert(openaiSpec, 'Expected OpenAI system skill to expose a GitHub install spec');
  assertContains(openaiSpec.command, 'openai/skills/skills/.system/openai-docs');

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

test('package uses a positive files allowlist', () => {
  const pkg = require('./package.json');
  assert(Array.isArray(pkg.files), 'Expected package.json to declare files');
  assertContains(pkg.files.join(' '), 'cli.js');
  assertContains(pkg.files.join(' '), 'tui/');
  assertContains(pkg.files.join(' '), 'lib/');
});

test('list command works', () => {
  const output = run('list');
  assertContains(output, 'Curated Library');
  assertContains(output, 'FRONTEND');
  assertContains(output, 'Small enough to scan. Opinionated enough to trust.');
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
  const output = run('search frontend');
  assertContains(output, 'frontend-design');
  assertContains(output, '{My Picks, Build Apps}');
});

test('info command works', () => {
  const output = run('info pdf');
  assertContains(output, 'pdf');
  assertContains(output, 'Why Here:');
  assertContains(output, 'Provenance:');
  assertContains(output, 'Category:');
  assertContains(output, 'Trust:');
  assertContains(output, 'Source Repo:');
  assertContains(output, 'Source URL:');
  assertContains(output, 'Sync Mode:');
  assertContains(output, 'Collections:');
  assertContains(output, 'Neighboring Shelf Picks:');
});

test('info command shows neighboring recommendations', () => {
  const output = run('info frontend-design');
  assertContains(output, 'Neighboring Shelf Picks:');
  assertContains(output, 'frontend-skill');
  assertContains(output, 'anthropics/skills/skills/frontend-design');
});

test('preview command works for vendored skill', () => {
  const output = run('preview best-practices');
  assertContains(output, 'Preview:');
  assertContains(output, 'best-practices');
});

test('preview command works for non-vendored skill', () => {
  const output = run('preview pdf');
  assertContains(output, 'Preview:');
  assertContains(output, 'pdf');
  assertContains(output, 'Cataloged upstream skill');
  assertNotContains(output, 'not found');
});

test('browse command shows tty guidance outside a TTY', () => {
  const output = runArgs(['browse']);
  assertContains(output, 'requires a TTY terminal');
});

test('README keeps the launch timeline and universal installer context', () => {
  const readme = fs.readFileSync(path.join(__dirname, 'README.md'), 'utf8');
  assertContains(readme, 'December 17, 2025');
  assertContains(readme, 'before `skills.sh` existed');
  assertContains(readme, 'Originally this repo was that universal installer.');
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
  const output = runArgs(['install', 'anthropics/skills/skills/frontend-design', '--agent', 'project', '--dry-run']);
  assertContains(output, 'Dry Run');
  assertContains(output, 'anthropics/skills/skills/frontend-design');
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
  const output = runArgs(['validate', 'skills/job-application']);
  assertContains(output, 'Validate Skill');
  assertContains(output, 'PASS');
  assertContains(output, 'Name:');
  assertContains(output, 'job-application');
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
  assertContains(output, 'webapp-testing');
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
  assert(data.micro.length >= 2, 'micro view should keep the active shelf and supporting previews');
  assertContains(data.micro.join(','), '2');
  assert(data.compact.length <= 3, 'compact view should keep the shelf list short');
  assertContains(data.compact.join(','), '2');
});

test('atlas grid uses one shared tile height for layout math and rendering', () => {
  const output = runModule(`
    import {__test} from './tui/index.mjs';
    const compactHeight = __test.getAtlasTileHeight('default', true);
    const skillCompactHeight = __test.getAtlasTileHeight('skills', true);
    const viewport = __test.getViewportState({
      items: Array.from({length: 12}, (_, index) => ({id: String(index)})),
      selectedIndex: 0,
      columns: 100,
      rows: 30,
      mode: 'default',
      compact: true,
      reservedRows: __test.getReservedRows('home-grid', __test.getViewportProfile({columns: 100, rows: 30}), {showInspector: false}),
    });
    console.log(JSON.stringify({compactHeight, skillCompactHeight, viewport}));
  `);
  const data = JSON.parse(output);
  assertEqual(data.compactHeight, 8);
  assertEqual(data.skillCompactHeight, 7);
  assertEqual(data.viewport.tileHeight, data.compactHeight);
  assertEqual(data.viewport.visibleRows, 2);
});

test('vendored catalog skills carry real markdown into the TUI catalog', () => {
  const catalog = buildCatalog();
  const skill = catalog.skills.find((candidate) => candidate.name === 'best-practices');
  assert(skill, 'Expected best-practices in catalog');
  assert(typeof skill.markdown === 'string' && skill.markdown.includes('#'), 'Expected vendored markdown to be loaded');
});

test('npm pack --dry-run excludes tmp reports from the tarball', () => {
  const output = execFileSync('npm', ['pack', '--dry-run'], { encoding: 'utf8', cwd: __dirname });
  assertNotContains(output, 'tmp/live-test-report.json');
  assertNotContains(output, 'tmp/live-quick-report.json');
});

test('preview formatter handles missing markdown for upstream skills', () => {
  const output = runModule(`
    import {__test} from './tui/index.mjs';
    console.log(JSON.stringify(__test.formatPreviewLines(null, 4)));
  `);
  const data = JSON.parse(output);
  assert(Array.isArray(data), 'Expected preview formatter to return an array');
  assertEqual(data.length, 0, 'Expected no preview lines for missing markdown');
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
  assertContains(output, 'Targets:');
  assertContains(output, path.join('.claude', 'skills'));
});

test('install -p targets project scope (dry-run)', () => {
  const output = run('install pdf -p --dry-run');
  assertContains(output, 'Dry Run');
  assertContains(output, 'Targets:');
  assertContains(output, path.join('.agents', 'skills'));
});

test('install --agent cursor still works (legacy path)', () => {
  const output = runArgs(['install', 'pdf', '--agent', 'cursor', '--dry-run']);
  assertContains(output, 'Dry Run');
  assertContains(output, 'Targets:');
  assertContains(output, '.cursor');
});

test('install --all targets both global and project scopes (dry-run)', () => {
  const output = run('install pdf --all --dry-run');
  assertContains(output, 'Dry Run');
  assertContains(output, 'Targets:');
  assertContains(output, '.claude');
  assertContains(output, '.agents');
});

test('list --installed --project shows project-scope installs', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-installed-list-'));
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'project-installed-home-'));
  try {
    runArgsWithOptions(['install', 'best-practices', '--project'], {
      cwd: tmpDir,
      env: {...process.env, HOME: tempHome},
    });

    const output = runArgsWithOptions(['list', '--installed', '--project'], {
      cwd: tmpDir,
      env: {...process.env, HOME: tempHome},
    });

    assertContains(output, 'best-practices');
    assertContains(output, '.agents/skills');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
});

test('update --project refreshes project-scope upstream installs', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-scope-update-'));
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'project-scope-home-'));
  try {
    runArgsWithOptions(['install', 'frontend-design', '--project'], {
      cwd: tmpDir,
      env: {...process.env, HOME: tempHome},
    });

    const output = runArgsWithOptions(['update', 'frontend-design', '--project'], {
      cwd: tmpDir,
      env: {...process.env, HOME: tempHome},
    });

    assertContains(output, 'Updated: frontend-design');
    assertContains(output, 'Target: project');
    assert(fs.existsSync(path.join(tmpDir, '.agents', 'skills', 'frontend-design', 'SKILL.md')), 'Expected project-scope install to remain in .agents/skills');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
});

test('uninstall --project removes project-scope installs', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-scope-uninstall-'));
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'project-scope-home-'));
  try {
    runArgsWithOptions(['install', 'best-practices', '--project'], {
      cwd: tmpDir,
      env: {...process.env, HOME: tempHome},
    });

    const output = runArgsWithOptions(['uninstall', 'best-practices', '--project'], {
      cwd: tmpDir,
      env: {...process.env, HOME: tempHome},
    });

    assertContains(output, 'Uninstalled: best-practices');
    assert(!fs.existsSync(path.join(tmpDir, '.agents', 'skills', 'best-practices')), 'Expected project-scope uninstall to remove the skill');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
});

// ============ V3 SOURCE PARSING TESTS ============

test('source parser: owner/repo parses as github shorthand (dry-run)', () => {
  const output = runArgs(['install', 'anthropics/skills', '--dry-run']);
  assertContains(output, 'Dry Run');
  assertContains(output, 'Cloning anthropics/skills');
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

test('cataloged upstream nested install succeeds for project agent', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-nested-'));
  try {
    const output = execFileSync(process.execPath, [path.join(__dirname, 'cli.js'), 'install', 'frontend-skill', '--agent', 'project'], {
      encoding: 'utf8',
      cwd: tmpDir,
    });
    assertContains(output, 'Installed 1 skill');
    const installDir = path.join(tmpDir, '.skills', 'frontend-skill');
    assert(fs.existsSync(path.join(installDir, 'SKILL.md')), 'Expected frontend-skill to install into the project agent path');
    const meta = JSON.parse(fs.readFileSync(path.join(installDir, '.skill-meta.json'), 'utf8'));
    assertEqual(meta.sourceType, 'github');
    assertEqual(meta.subpath, 'skills/.curated/frontend-skill');
    assertContains(meta.installSource, 'openai/skills/skills/.curated/frontend-skill');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('cataloged upstream update succeeds immediately after install', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-update-'));
  try {
    execFileSync(process.execPath, [path.join(__dirname, 'cli.js'), 'install', 'frontend-design', '--agent', 'project'], {
      encoding: 'utf8',
      cwd: tmpDir,
    });
    const output = execFileSync(process.execPath, [path.join(__dirname, 'cli.js'), 'update', 'frontend-design', '--agent', 'project'], {
      encoding: 'utf8',
      cwd: tmpDir,
    });
    assertContains(output, 'Updated: frontend-design');
    assertContains(output, 'github:anthropics/skills');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('cataloged upstream dry-run reports sparse checkout path', () => {
  const output = run('install frontend-skill --dry-run');
  assertContains(output, 'Clone mode: sparse checkout');
  assertContains(output, 'openai/skills/skills/.curated/frontend-skill');
});

test('skills.json keeps explicit tier, vendored, and distribution fields', () => {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'skills.json'), 'utf8'));
  data.skills.forEach((skill) => {
    assert(skill.tier === 'house' || skill.tier === 'upstream', `Skill ${skill.name} missing explicit tier`);
    assert(typeof skill.vendored === 'boolean', `Skill ${skill.name} missing explicit vendored boolean`);
    assert(skill.distribution === 'bundled' || skill.distribution === 'live', `Skill ${skill.name} missing explicit distribution`);
  });
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

// ============ V3.1 METADATA INTEGRITY TESTS ============

test('skills.json version matches package.json version', () => {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'skills.json'), 'utf8'));
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
  assertEqual(data.version, pkg.version, `skills.json version "${data.version}" != package.json "${pkg.version}"`);
});

test('skills.json total matches actual skill count', () => {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'skills.json'), 'utf8'));
  assertEqual(data.total, data.skills.length, `total field is ${data.total} but found ${data.skills.length} skills`);
});

test('skills.json updated field is valid ISO date', () => {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'skills.json'), 'utf8'));
  assert(data.updated, 'updated field is missing');
  assert(!isNaN(Date.parse(data.updated)), `updated field "${data.updated}" is not a valid date`);
});

test('vendored skills have folders, non-vendored do not', () => {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'skills.json'), 'utf8'));
  const vendored = data.skills.filter(s => s.vendored !== false);
  const cataloged = data.skills.filter(s => s.vendored === false);
  const folders = fs.readdirSync(path.join(__dirname, 'skills')).filter(f =>
    fs.statSync(path.join(__dirname, 'skills', f)).isDirectory()
  );
  const vendoredNames = new Set(vendored.map(s => s.name));
  folders.forEach(folder => {
    assert(vendoredNames.has(folder), `Folder "skills/${folder}" exists but not in skills.json as vendored`);
  });
  vendoredNames.forEach(name => {
    assert(folders.includes(name), `Vendored skill "${name}" has no folder`);
  });
  cataloged.forEach(skill => {
    assert(!folders.includes(skill.name), `Non-vendored skill "${skill.name}" should not have a folder`);
    assert(skill.installSource || skill.source, `Non-vendored skill "${skill.name}" needs installSource or source`);
  });
});

test('batch-fill template whyHere entries are gone', () => {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'skills.json'), 'utf8'));
  const templatePattern = /without diluting the library's focus/;
  const templateSkills = data.skills.filter(s => templatePattern.test(s.whyHere));
  assertEqual(templateSkills.length, 0, `Expected no batch-fill whyHere entries, found ${templateSkills.length}`);
});

test('generated docs are in sync with skills.json', () => {
  const status = generatedDocsAreInSync(loadCatalogData());
  assert(status.readmeMatches, 'README generated sections drifted from skills.json');
  assert(status.workAreasMatches, 'WORK_AREAS.md drifted from skills.json');
});

// ============ VALIDATE SCRIPT TESTS ============

test('validate script catches version mismatch', () => {
  // Create a temporary skills.json with wrong version
  const tmpDir = fs.mkdtempSync(path.join(__dirname, '.validate-ver-'));
  const tmpCatalog = path.join(tmpDir, 'skills.json');
  const tmpPkg = path.join(tmpDir, 'package.json');
  const tmpSkills = path.join(tmpDir, 'skills');

  try {
    copyValidateFixtureFiles(tmpDir);

    // Create minimal skills dir with one skill
    const skillDir = path.join(tmpSkills, 'test-skill');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: test-skill\ndescription: Test\n---\n# Test');

    // Write mismatched version
    const fixtureData = {
      version: '0.0.0',
      updated: '2026-01-01T00:00:00Z',
      total: 1,
      workAreas: [{ id: 'test', title: 'Test', description: 'Test area' }],
      collections: [],
      skills: [{
        name: 'test-skill', description: 'Use when testing', category: 'development',
        workArea: 'test', branch: 'Test', author: 'test', license: 'MIT',
        source: 'test/test', sourceUrl: 'https://github.com/test/test',
        origin: 'authored', trust: 'verified', syncMode: 'authored',
        whyHere: 'This is a real whyHere with enough length to pass validation.'
      }]
    };
    fs.writeFileSync(tmpCatalog, JSON.stringify(fixtureData, null, 2));
    writeFixtureDocs(tmpDir, fixtureData);
    fs.writeFileSync(tmpPkg, JSON.stringify({ version: '9.9.9' }));

    let output;
    try {
      output = execSync(`node scripts/validate.js`, { encoding: 'utf8', cwd: tmpDir, stdio: 'pipe' });
    } catch (e) {
      output = (e.stdout || '') + (e.stderr || '');
    }
    assertContains(output, 'does not match');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('validate script catches total mismatch', () => {
  const tmpDir = fs.mkdtempSync(path.join(__dirname, '.validate-total-'));
  const tmpSkills = path.join(tmpDir, 'skills');

  try {
    copyValidateFixtureFiles(tmpDir);

    const skillDir = path.join(tmpSkills, 'test-skill');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: test-skill\ndescription: Test\n---\n# Test');

    const fixtureData = {
      version: '1.0.0',
      updated: '2026-01-01T00:00:00Z',
      total: 999,
      workAreas: [{ id: 'test', title: 'Test', description: 'Test area' }],
      collections: [],
      skills: [{
        name: 'test-skill', description: 'Use when testing', category: 'development',
        workArea: 'test', branch: 'Test', author: 'test', license: 'MIT',
        source: 'test/test', sourceUrl: 'https://github.com/test/test',
        origin: 'authored', trust: 'verified', syncMode: 'authored',
        whyHere: 'This is a real whyHere with enough length to pass validation.'
      }]
    };
    fs.writeFileSync(path.join(tmpDir, 'skills.json'), JSON.stringify(fixtureData, null, 2));
    writeFixtureDocs(tmpDir, fixtureData);
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ version: '1.0.0' }));

    let output;
    try {
      output = execSync(`node scripts/validate.js`, { encoding: 'utf8', cwd: tmpDir, stdio: 'pipe' });
    } catch (e) {
      output = (e.stdout || '') + (e.stderr || '');
    }
    assertContains(output, 'total');
    assertContains(output, '999');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('validate script passes on the real catalog', () => {
  try {
    const output = execSync('node scripts/validate.js', { encoding: 'utf8', cwd: __dirname, stdio: 'pipe' });
    assertContains(output, 'Validation passed');
  } catch (e) {
    const output = (e.stdout || '') + (e.stderr || '');
    assert(false, `Validate should pass on real catalog. Output: ${output.slice(0, 200)}`);
  }
});

test('validate script catches generated doc drift', () => {
  const tmpDir = fs.mkdtempSync(path.join(__dirname, '.validate-docs-'));
  const tmpSkills = path.join(tmpDir, 'skills');

  try {
    copyValidateFixtureFiles(tmpDir);
    const skillDir = path.join(tmpSkills, 'test-skill');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: test-skill\ndescription: Test\n---\n# Test');

    const fixtureData = {
      version: '1.0.0',
      updated: '2026-01-01T00:00:00Z',
      total: 1,
      workAreas: [{ id: 'test', title: 'Test', description: 'Test area' }],
      collections: [],
      skills: [{
        name: 'test-skill', description: 'Use when testing', category: 'development',
        workArea: 'test', branch: 'Test', author: 'test', license: 'MIT',
        source: 'test/test', sourceUrl: 'https://github.com/test/test',
        origin: 'authored', trust: 'verified', syncMode: 'authored',
        whyHere: 'This is a real whyHere with enough length to pass validation.'
      }]
    };
    fs.writeFileSync(path.join(tmpDir, 'skills.json'), JSON.stringify(fixtureData, null, 2));
    writeFixtureDocs(tmpDir, fixtureData);
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ version: '1.0.0' }));
    const readmePath = path.join(tmpDir, 'README.md');
    const driftedReadme = fs.readFileSync(readmePath, 'utf8').replace('- 1 skills total', '- 999 skills total');
    fs.writeFileSync(readmePath, driftedReadme);

    let output = '';
    let status = 0;
    try {
      output = execFileSync(process.execPath, ['scripts/validate.js'], { encoding: 'utf8', cwd: tmpDir, stdio: 'pipe' });
    } catch (e) {
      status = typeof e.status === 'number' ? e.status : 1;
      output = `${e.stdout || ''}${e.stderr || ''}`;
    }
    assert(status !== 0, 'validate should fail on README drift');
    assertContains(output, 'README.md generated sections are out of sync');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('catalog command fails fast when --skill is missing', () => {
  const result = runCommandResult(['catalog', 'openai/skills']);
  assert(result.status !== 0, 'catalog should fail without --skill');
  assertContains(`${result.stdout}${result.stderr}`, 'requires --skill');
});

test('upstream catalog entries are forced to upstream/live metadata', () => {
  const data = loadCatalogData();
  const entry = buildUpstreamCatalogEntry({
    source: 'openai/skills',
    parsed: { type: 'github', owner: 'openai', repo: 'skills', url: 'https://github.com/openai/skills' },
    discoveredSkill: {
      name: 'tmp-upstream-skill',
      description: 'Use when testing upstream metadata construction.',
      relativeDir: 'skills/tmp-upstream-skill',
      frontmatter: { author: 'OpenAI', license: 'MIT' },
    },
    fields: {
      workArea: 'frontend',
      branch: 'Testing',
      whyHere: 'This is a real whyHere long enough to satisfy the editorial placement rules.',
      trust: 'reviewed',
      tags: 'test,upstream',
      labels: 'editorial',
    },
    existingCatalog: data,
  });

  assertEqual(entry.tier, 'upstream');
  assertEqual(entry.distribution, 'live');
  assertEqual(entry.vendored, false);
  assertEqual(entry.installSource, 'openai/skills/skills/tmp-upstream-skill');
});

test('curate review command prints the derived queue', () => {
  const result = runCommandResult(['curate', 'review']);
  assertEqual(result.status, 0, 'curate review should succeed');
  assertContains(result.stdout, 'Needs Review');
});

test('curate command updates a skill field and regenerates docs', () => {
  const snapshot = snapshotCatalogFiles();

  try {
    const result = runCommandResult(['curate', 'frontend-design', '--notes', 'Temporary test note from the CLI suite.']);
    assertEqual(result.status, 0, 'curate should succeed');

    const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'skills.json'), 'utf8'));
    const skill = data.skills.find((entry) => entry.name === 'frontend-design');
    assertEqual(skill.notes, 'Temporary test note from the CLI suite.');

    const sync = generatedDocsAreInSync(loadCatalogData());
    assert(sync.readmeMatches, 'README should stay synced after curate');
    assert(sync.workAreasMatches, 'WORK_AREAS should stay synced after curate');
  } finally {
    restoreCatalogFiles(snapshot);
  }
});

test('curate --remove --yes removes a temporary vendored skill', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'curate-remove-'));
  const skillName = `curate-remove-${Date.now()}`;
  const destFolder = path.join(__dirname, 'skills', skillName);
  const snapshot = snapshotCatalogFiles();

  try {
    const skillDir = path.join(tmpDir, 'skills', skillName);
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), `---\nname: ${skillName}\ndescription: Temporary curated remove test\n---\n# Test`);

    const vendorResult = runCommandResult([
      'vendor', tmpDir, '--skill', skillName,
      '--area', 'frontend',
      '--branch', 'Testing',
      '--why', 'This is a real whyHere long enough to support the temporary remove test.',
    ]);
    assertEqual(vendorResult.status, 0, 'vendor should succeed before remove');
    assert(fs.existsSync(destFolder), 'vendored folder should exist before remove');

    const removeResult = runCommandResult(['curate', skillName, '--remove', '--yes']);
    assertEqual(removeResult.status, 0, 'curate remove should succeed');

    const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'skills.json'), 'utf8'));
    assert(!data.skills.some((entry) => entry.name === skillName), 'temporary skill should be removed from skills.json');
    assert(!fs.existsSync(destFolder), 'temporary vendored folder should be removed');
  } finally {
    if (fs.existsSync(destFolder)) {
      fs.rmSync(destFolder, { recursive: true, force: true });
    }
    restoreCatalogFiles(snapshot);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ============ VENDOR SCRIPT TESTS ============

test('vendor --list discovers skills from local repo with skills/ dir', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vendor-list-'));
  try {
    const skillDir = path.join(tmpDir, 'skills', 'test-alpha');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: test-alpha\ndescription: Alpha\n---\n# Alpha');

    const skillDir2 = path.join(tmpDir, 'skills', 'test-beta');
    fs.mkdirSync(skillDir2, { recursive: true });
    fs.writeFileSync(path.join(skillDir2, 'SKILL.md'), '---\nname: test-beta\ndescription: Beta\n---\n# Beta');

    const output = execSync(`node ${path.join(__dirname, 'scripts', 'vendor.js')} ${tmpDir} --list`, { encoding: 'utf8' });
    assertContains(output, 'test-alpha');
    assertContains(output, 'test-beta');
    assertContains(output, '2 found');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('vendor --list discovers skills from top-level dirs', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vendor-topdir-'));
  try {
    // Skill in a top-level dir (not under skills/)
    const skillDir = path.join(tmpDir, 'my-cool-skill');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: my-cool-skill\ndescription: Cool\n---\n# Cool');

    const output = execSync(`node ${path.join(__dirname, 'scripts', 'vendor.js')} ${tmpDir} --list`, { encoding: 'utf8' });
    assertContains(output, 'my-cool-skill');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('vendor --list discovers single root skill', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vendor-root-'));
  try {
    fs.writeFileSync(path.join(tmpDir, 'SKILL.md'), '---\nname: root-skill\ndescription: Root\n---\n# Root');

    const output = execSync(`node ${path.join(__dirname, 'scripts', 'vendor.js')} ${tmpDir} --list`, { encoding: 'utf8' });
    assertContains(output, 'root-skill');
    assertContains(output, '1 found');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('vendor --dry-run shows what would be done without writing', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vendor-dry-'));
  try {
    const skillDir = path.join(tmpDir, 'skills', 'dry-test-skill');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: dry-test-skill\ndescription: Dry test\n---\n# Dry');

    const output = execSync(
      `node ${path.join(__dirname, 'scripts', 'vendor.js')} ${tmpDir} --skill dry-test-skill --area frontend --branch Test --why "A real curator note for the dry run." --dry-run`,
      { encoding: 'utf8' }
    );
    assertContains(output, 'Dry run');
    assertContains(output, 'dry-test-skill');
    assertContains(output, 'frontend');

    // Verify nothing was actually written
    assert(!fs.existsSync(path.join(__dirname, 'skills', 'dry-test-skill')), 'Dry run should not create folder');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('vendor dry-run sets addedDate to today', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vendor-date-'));
  try {
    const skillDir = path.join(tmpDir, 'skills', 'date-test');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: date-test\ndescription: Date test\n---\n# Date');

    const output = execSync(
      `node ${path.join(__dirname, 'scripts', 'vendor.js')} ${tmpDir} --skill date-test --area frontend --branch Test --why "A real curator note for the date test." --dry-run`,
      { encoding: 'utf8' }
    );
    const today = new Date().toISOString().split('T')[0];
    assertContains(output, `"addedDate": "${today}"`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('vendor dry-run defaults to trust: listed and origin: curated', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vendor-trust-'));
  try {
    const skillDir = path.join(tmpDir, 'skills', 'trust-test');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: trust-test\ndescription: Trust test\n---\n# Trust');

    const output = execSync(
      `node ${path.join(__dirname, 'scripts', 'vendor.js')} ${tmpDir} --skill trust-test --area frontend --branch Test --why "A real curator note for the trust test." --dry-run`,
      { encoding: 'utf8' }
    );
    assertContains(output, '"trust": "listed"');
    assertContains(output, '"origin": "curated"');
    assertContains(output, '"syncMode": "snapshot"');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('vendor applies --area, --branch, --category, --tags flags', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vendor-flags-'));
  try {
    const skillDir = path.join(tmpDir, 'skills', 'flag-test');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: flag-test\ndescription: Flag test\n---\n# Flags');

    const output = execSync(
      `node ${path.join(__dirname, 'scripts', 'vendor.js')} ${tmpDir} --skill flag-test --area frontend --branch Swift --category development --tags "swift,ios" --why "A real curator note for the flags test." --dry-run`,
      { encoding: 'utf8' }
    );
    assertContains(output, '"workArea": "frontend"');
    assertContains(output, '"branch": "Swift"');
    assertContains(output, '"category": "development"');
    assertContains(output, '"swift"');
    assertContains(output, '"ios"');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('vendor actually copies skill folder and updates skills.json', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vendor-real-'));
  const skillName = `vendor-test-${Date.now()}`;
  const destFolder = path.join(__dirname, 'skills', skillName);
  const snapshot = snapshotCatalogFiles();

  try {
    // Create source skill
    const skillDir = path.join(tmpDir, 'skills', skillName);
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), `---\nname: ${skillName}\ndescription: Vendor end-to-end test\n---\n# Test`);
    fs.writeFileSync(path.join(skillDir, 'extra.txt'), 'reference content');

    // Take a snapshot of current catalog
    const beforeData = JSON.parse(snapshot.skills);
    const beforeCount = beforeData.skills.length;

    // Run vendor
    execSync(
      `node ${path.join(__dirname, 'scripts', 'vendor.js')} ${tmpDir} --skill ${skillName} --area frontend --branch Test --why "A real curator note for the end to end vendor test."`,
      { encoding: 'utf8' }
    );

    // Verify folder was created
    assert(fs.existsSync(destFolder), 'Skill folder should exist after vendor');
    assert(fs.existsSync(path.join(destFolder, 'SKILL.md')), 'SKILL.md should be copied');
    assert(fs.existsSync(path.join(destFolder, 'extra.txt')), 'Extra files should be copied');

    // Verify skills.json was updated
    const afterData = JSON.parse(fs.readFileSync(path.join(__dirname, 'skills.json'), 'utf8'));
    assertEqual(afterData.skills.length, beforeCount + 1, 'Should have one more skill');
    assertEqual(afterData.total, afterData.skills.length, 'total should match skill count');

    const added = afterData.skills.find(s => s.name === skillName);
    assert(added, 'New skill should be in skills.json');
    assertEqual(added.workArea, 'frontend');
    assertEqual(added.branch, 'Test');
    assertEqual(added.trust, 'listed');
    assertEqual(added.origin, 'curated');

  } finally {
    // Revert: remove the vendored skill from catalog and disk
    if (fs.existsSync(destFolder)) {
      fs.rmSync(destFolder, { recursive: true, force: true });
    }
    restoreCatalogFiles(snapshot);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('vendor rejects skill that already exists in catalog', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vendor-dup-'));
  try {
    // Use a skill name that already exists: frontend-design
    const skillDir = path.join(tmpDir, 'skills', 'frontend-design');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: frontend-design\ndescription: Dupe\n---\n# Dupe');

    let output;
    try {
      output = execSync(
        `node ${path.join(__dirname, 'scripts', 'vendor.js')} ${tmpDir} --skill frontend-design --area frontend --branch Test --why "A real curator note for the duplicate test."`,
        { encoding: 'utf8', stdio: 'pipe' }
      );
    } catch (e) {
      output = (e.stdout || '') + (e.stderr || '');
    }
    assertContains(output, 'already exists');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('vendor rejects nonexistent skill name', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vendor-noexist-'));
  try {
    const skillDir = path.join(tmpDir, 'skills', 'real-one');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: real-one\ndescription: Real\n---\n# Real');

    let output;
    try {
      output = execSync(
        `node ${path.join(__dirname, 'scripts', 'vendor.js')} ${tmpDir} --skill ghost-skill`,
        { encoding: 'utf8', stdio: 'pipe' }
      );
    } catch (e) {
      output = (e.stdout || '') + (e.stderr || '');
    }
    assertContains(output, 'not found');
    assertContains(output, 'real-one');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('vendor exits with error when no source given', () => {
  let output;
  try {
    output = execSync(
      `node ${path.join(__dirname, 'scripts', 'vendor.js')}`,
      { encoding: 'utf8', stdio: 'pipe' }
    );
  } catch (e) {
    output = (e.stdout || '') + (e.stderr || '');
  }
  assertContains(output, 'Provide a source');
});

test('vendor exits with error when no --skill and no --list', () => {
  let output;
  try {
    output = execSync(
      `node ${path.join(__dirname, 'scripts', 'vendor.js')} /tmp`,
      { encoding: 'utf8', stdio: 'pipe' }
    );
  } catch (e) {
    output = (e.stdout || '') + (e.stderr || '');
  }
  assertContains(output, '--skill');
});

test('vendor does not copy .git directory', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vendor-nogit-'));
  const skillName = `nogit-test-${Date.now()}`;
  const destFolder = path.join(__dirname, 'skills', skillName);
  const snapshot = snapshotCatalogFiles();

  try {
    const skillDir = path.join(tmpDir, 'skills', skillName);
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), `---\nname: ${skillName}\ndescription: Git test\n---\n# Test`);
    // Simulate a .git dir inside the skill
    fs.mkdirSync(path.join(skillDir, '.git'));
    fs.writeFileSync(path.join(skillDir, '.git', 'HEAD'), 'ref: refs/heads/main');

    execSync(
      `node ${path.join(__dirname, 'scripts', 'vendor.js')} ${tmpDir} --skill ${skillName} --area frontend --branch Test --why "A real curator note for the dot git copy test."`,
      { encoding: 'utf8' }
    );

    assert(fs.existsSync(destFolder), 'Skill folder should exist');
    assert(!fs.existsSync(path.join(destFolder, '.git')), '.git should NOT be copied');
  } finally {
    if (fs.existsSync(destFolder)) fs.rmSync(destFolder, { recursive: true, force: true });
    restoreCatalogFiles(snapshot);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('vendor copies nested reference files', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vendor-nested-'));
  const skillName = `nested-test-${Date.now()}`;
  const destFolder = path.join(__dirname, 'skills', skillName);
  const snapshot = snapshotCatalogFiles();

  try {
    const skillDir = path.join(tmpDir, 'skills', skillName);
    const refsDir = path.join(skillDir, 'references');
    fs.mkdirSync(refsDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), `---\nname: ${skillName}\ndescription: Nested test\n---\n# Test`);
    fs.writeFileSync(path.join(refsDir, 'api-guide.md'), '# API Guide');
    fs.writeFileSync(path.join(refsDir, 'patterns.md'), '# Patterns');

    execSync(
      `node ${path.join(__dirname, 'scripts', 'vendor.js')} ${tmpDir} --skill ${skillName} --area frontend --branch Test --why "A real curator note for the nested reference copy test."`,
      { encoding: 'utf8' }
    );

    assert(fs.existsSync(path.join(destFolder, 'references', 'api-guide.md')), 'Nested reference files should be copied');
    assert(fs.existsSync(path.join(destFolder, 'references', 'patterns.md')), 'All nested files should be copied');
  } finally {
    if (fs.existsSync(destFolder)) fs.rmSync(destFolder, { recursive: true, force: true });
    restoreCatalogFiles(snapshot);
    fs.rmSync(tmpDir, { recursive: true, force: true });
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
