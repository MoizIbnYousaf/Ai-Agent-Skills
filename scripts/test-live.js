#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const { loadCatalogData, getCatalogCounts } = require('../lib/catalog-data.cjs');
const { parseSkillMarkdown } = require('../lib/frontmatter.cjs');
const { ROOT_DIR, SKILLS_DIR, SKILL_META_FILE } = require('../lib/paths.cjs');
const { parseSource, prepareSource } = require('../lib/source.cjs');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
};

function info(message) {
  console.log(`${colors.cyan}›${colors.reset} ${message}`);
}

function pass(message) {
  console.log(`${colors.green}✓${colors.reset} ${message}`);
}

function warn(message) {
  console.log(`${colors.yellow}!${colors.reset} ${message}`);
}

function fail(message) {
  console.error(`${colors.red}✗${colors.reset} ${message}`);
}

function parseArgs(argv) {
  const options = {
    quick: false,
    skipTui: false,
    skills: [],
    reportPath: path.join(ROOT_DIR, 'tmp', 'live-test-report.json'),
    fullScopes: true,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--quick') {
      options.quick = true;
      options.fullScopes = false;
      continue;
    }
    if (arg === '--skip-tui') {
      options.skipTui = true;
      continue;
    }
    if (arg === '--skill') {
      const value = argv[index + 1];
      if (value) {
        options.skills.push(value);
        index += 1;
      }
      continue;
    }
    if (arg === '--report') {
      const value = argv[index + 1];
      if (value) {
        options.reportPath = path.resolve(ROOT_DIR, value);
        index += 1;
      }
      continue;
    }
    if (arg === '--project-only') {
      options.fullScopes = false;
      continue;
    }
  }

  return options;
}

function ensure(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function sanitizeForReport(text) {
  return String(text || '')
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
    .replace(/\r/g, '');
}

function runCommand(command, args, options = {}) {
  const startedAt = Date.now();
  const result = spawnSync(command, args, {
    cwd: options.cwd || ROOT_DIR,
    env: options.env || process.env,
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
    timeout: options.timeout || 180000,
  });
  const combined = `${result.stdout || ''}${result.stderr || ''}`;
  return {
    command,
    args,
    cwd: options.cwd || ROOT_DIR,
    code: typeof result.status === 'number' ? result.status : 1,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    combined,
    durationMs: Date.now() - startedAt,
  };
}

function runCli(args, options = {}) {
  return runCommand(process.execPath, [path.join(ROOT_DIR, 'cli.js'), ...args], options);
}

function runExpect(script, options = {}) {
  return runCommand('expect', ['-c', script], options);
}

function maybeMkdir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function removeDir(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
}

function listFilesRecursive(rootDir, relativePrefix = '') {
  const entries = fs.readdirSync(path.join(rootDir, relativePrefix), { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const relativePath = path.join(relativePrefix, entry.name);
    const absolutePath = path.join(rootDir, relativePath);
    if (entry.isDirectory()) {
      files.push(...listFilesRecursive(rootDir, relativePath));
      continue;
    }
    if (!entry.isFile()) continue;
    files.push({
      path: relativePath.replace(/\\/g, '/'),
      absolutePath,
    });
  }

  return files.sort((left, right) => left.path.localeCompare(right.path));
}

function snapshotDirectory(dirPath, { excludeMeta = false } = {}) {
  const files = listFilesRecursive(dirPath)
    .filter((file) => !(excludeMeta && file.path === SKILL_META_FILE))
    .map((file) => {
      const bytes = fs.readFileSync(file.absolutePath);
      return {
        path: file.path,
        size: bytes.length,
        sha256: sha256(bytes),
      };
    });

  const manifestHash = sha256(
    files.map((file) => `${file.path}:${file.size}:${file.sha256}`).join('\n')
  );

  return {
    root: dirPath,
    fileCount: files.length,
    totalBytes: files.reduce((sum, file) => sum + file.size, 0),
    manifestHash,
    files,
  };
}

function compareSnapshots(sourceSnapshot, installedSnapshot, contextLabel) {
  ensure(
    sourceSnapshot.manifestHash === installedSnapshot.manifestHash,
    `${contextLabel}: manifest hash mismatch (${sourceSnapshot.manifestHash} vs ${installedSnapshot.manifestHash})`
  );
  ensure(
    sourceSnapshot.fileCount === installedSnapshot.fileCount,
    `${contextLabel}: file count mismatch (${sourceSnapshot.fileCount} vs ${installedSnapshot.fileCount})`
  );

  for (let index = 0; index < sourceSnapshot.files.length; index += 1) {
    const expected = sourceSnapshot.files[index];
    const actual = installedSnapshot.files[index];
    ensure(Boolean(actual), `${contextLabel}: installed snapshot missing file for ${expected.path}`);
    ensure(expected.path === actual.path, `${contextLabel}: path mismatch (${expected.path} vs ${actual.path})`);
    ensure(expected.size === actual.size, `${contextLabel}: size mismatch for ${expected.path}`);
    ensure(expected.sha256 === actual.sha256, `${contextLabel}: content hash mismatch for ${expected.path}`);
  }
}

function repoIdFromSource(source) {
  const parsed = parseSource(source);
  if (parsed.type === 'github') {
    return `${parsed.owner}/${parsed.repo}`;
  }
  return source;
}

function getSkillSourceDir(skill, repoCache) {
  if (skill.tier === 'house') {
    const sourceDir = path.join(SKILLS_DIR, skill.name);
    return {
      sourceDir,
      repoId: 'MoizIbnYousaf/Ai-Agent-Skills',
      commitSha: execFileSync('git', ['-C', ROOT_DIR, 'rev-parse', 'HEAD'], {
        encoding: 'utf8',
      }).trim(),
      relativeDir: `skills/${skill.name}`,
      rawSource: 'bundled-house-copy',
    };
  }

  const repoId = repoIdFromSource(skill.source);
  const cached = repoCache.get(repoId);
  ensure(cached, `Missing cached repo for ${repoId}`);

  const parsedInstallSource = parseSource(skill.installSource);
  const relativeDir = parsedInstallSource.subpath || '.';
  const sourceDir = relativeDir === '.'
    ? cached.repoRoot
    : path.join(cached.repoRoot, relativeDir);

  ensure(fs.existsSync(sourceDir), `Source dir missing for ${skill.name}: ${sourceDir}`);

  return {
    sourceDir,
    repoId,
    commitSha: cached.commitSha,
    relativeDir,
    rawSource: skill.installSource,
  };
}

function collectSourceSnapshot(skill, repoCache) {
  const located = getSkillSourceDir(skill, repoCache);
  const skillMdPath = path.join(located.sourceDir, 'SKILL.md');
  ensure(fs.existsSync(skillMdPath), `SKILL.md missing for ${skill.name} at ${located.sourceDir}`);

  const markdown = fs.readFileSync(skillMdPath, 'utf8');
  const parsed = parseSkillMarkdown(markdown);
  const snapshot = snapshotDirectory(located.sourceDir);

  ensure(
    typeof parsed.frontmatter.name === 'string' && parsed.frontmatter.name.trim().length > 0,
    `Frontmatter name missing for ${skill.name}`
  );
  ensure(
    typeof parsed.frontmatter.description === 'string' && parsed.frontmatter.description.trim().length > 0,
    `Frontmatter description missing for ${skill.name}`
  );

  return {
    skillName: skill.name,
    tier: skill.tier,
    repoId: located.repoId,
    commitSha: located.commitSha,
    relativeDir: located.relativeDir,
    rawSource: located.rawSource,
    frontmatter: parsed.frontmatter,
    markdown,
    markdownSha256: sha256(markdown),
    markdownBytes: Buffer.byteLength(markdown),
    snapshot,
  };
}

function pickQuickSkills(catalog) {
  const quickNames = new Set([
    'best-practices',
    'frontend-design',
    'frontend-skill',
    'shadcn',
  ]);
  return catalog.skills.filter((skill) => quickNames.has(skill.name));
}

function selectSkills(catalog, options) {
  if (options.skills.length > 0) {
    const wanted = new Set(options.skills);
    return catalog.skills.filter((skill) => wanted.has(skill.name));
  }

  if (options.quick) {
    return pickQuickSkills(catalog);
  }

  return catalog.skills;
}

function createIsolatedContext() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-skills-live-'));
  const homeDir = path.join(root, 'home');
  const projectDir = path.join(root, 'project');
  maybeMkdir(homeDir);
  maybeMkdir(projectDir);
  return {
    root,
    homeDir,
    projectDir,
    env: {
      ...process.env,
      HOME: homeDir,
    },
    cleanup() {
      removeDir(root);
    },
  };
}

function expectedInstallDir(scope, context, skillName) {
  if (scope === 'project') {
    return path.join(context.projectDir, '.agents', 'skills', skillName);
  }
  return path.join(context.homeDir, '.claude', 'skills', skillName);
}

function verifyInstalledMeta(skill, scope, meta) {
  ensure(meta.skillName === skill.name, `Installed metadata skillName mismatch for ${skill.name}`);
  ensure(meta.scope === scope, `Installed metadata scope mismatch for ${skill.name}`);

  if (skill.tier === 'house') {
    ensure(meta.sourceType === 'registry', `Expected registry sourceType for house skill ${skill.name}`);
    return;
  }

  ensure(meta.sourceType === 'github', `Expected github sourceType for upstream skill ${skill.name}`);
  ensure(meta.installSource === skill.installSource, `installSource mismatch for ${skill.name}`);
  ensure(typeof meta.repo === 'string' && meta.repo.includes('/'), `repo missing in metadata for ${skill.name}`);
}

function runPreviewFlow(skill) {
  const result = runCli(['preview', skill.name], { cwd: ROOT_DIR });
  ensure(result.code === 0, `preview failed for ${skill.name}`);
  ensure(result.combined.includes('Preview:'), `preview header missing for ${skill.name}`);
  ensure(!result.combined.includes(`Skill "${skill.name}" not found.`), `false missing-skill message shown for ${skill.name}`);
  return {
    command: ['preview', skill.name],
    code: result.code,
    durationMs: result.durationMs,
    output: sanitizeForReport(result.combined),
  };
}

function runCatalogListFlow(sourceRepo, expectedSkills) {
  const result = runCli(['catalog', sourceRepo, '--list'], { cwd: ROOT_DIR, timeout: 180000 });
  ensure(result.code === 0, `catalog --list failed for ${sourceRepo}`);
  for (const skillName of expectedSkills) {
    ensure(result.combined.includes(skillName), `catalog --list for ${sourceRepo} missed ${skillName}`);
  }
  return {
    sourceRepo,
    code: result.code,
    durationMs: result.durationMs,
    expectedSkills,
    output: sanitizeForReport(result.combined),
  };
}

function runInstallLifecycle(skill, sourceSnapshot, scope) {
  const context = createIsolatedContext();

  try {
    const scopeFlag = scope === 'project' ? '--project' : '--global';
    const installResult = runCli(['install', skill.name, scopeFlag], {
      cwd: context.projectDir,
      env: context.env,
      timeout: 240000,
    });
    ensure(installResult.code === 0, `install failed for ${skill.name} (${scope})`);

    const installDir = expectedInstallDir(scope, context, skill.name);
    ensure(fs.existsSync(path.join(installDir, 'SKILL.md')), `Installed SKILL.md missing for ${skill.name} (${scope})`);

    const metaPath = path.join(installDir, SKILL_META_FILE);
    ensure(fs.existsSync(metaPath), `Installed metadata missing for ${skill.name} (${scope})`);
    const installMeta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    verifyInstalledMeta(skill, scope, installMeta);

    const installedSnapshot = snapshotDirectory(installDir, { excludeMeta: true });
    compareSnapshots(sourceSnapshot.snapshot, installedSnapshot, `${skill.name} ${scope} install`);

    const updateResult = runCli(['update', skill.name, scopeFlag], {
      cwd: context.projectDir,
      env: context.env,
      timeout: 240000,
    });
    ensure(updateResult.code === 0, `update failed for ${skill.name} (${scope})`);

    const updatedMeta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    verifyInstalledMeta(skill, scope, updatedMeta);
    ensure(updatedMeta.updatedAt, `updatedAt missing for ${skill.name} (${scope})`);

    const updatedSnapshot = snapshotDirectory(installDir, { excludeMeta: true });
    compareSnapshots(sourceSnapshot.snapshot, updatedSnapshot, `${skill.name} ${scope} update`);

    const uninstallResult = runCli(['uninstall', skill.name, scopeFlag], {
      cwd: context.projectDir,
      env: context.env,
      timeout: 120000,
    });
    ensure(uninstallResult.code === 0, `uninstall failed for ${skill.name} (${scope})`);
    ensure(!fs.existsSync(installDir), `Install dir still exists after uninstall for ${skill.name} (${scope})`);

    return {
      scope,
      install: {
        code: installResult.code,
        durationMs: installResult.durationMs,
        output: sanitizeForReport(installResult.combined),
        meta: installMeta,
        installedManifestHash: installedSnapshot.manifestHash,
      },
      update: {
        code: updateResult.code,
        durationMs: updateResult.durationMs,
        output: sanitizeForReport(updateResult.combined),
        meta: updatedMeta,
        updatedManifestHash: updatedSnapshot.manifestHash,
      },
      uninstall: {
        code: uninstallResult.code,
        durationMs: uninstallResult.durationMs,
        output: sanitizeForReport(uninstallResult.combined),
      },
    };
  } finally {
    context.cleanup();
  }
}

function resolveExpectBinary() {
  const result = runCommand('which', ['expect']);
  if (result.code !== 0) return null;
  const found = String(result.stdout || '').trim();
  return found || null;
}

function runTuiSmoke(env) {
  const script = `
    log_user 1
    set timeout 20
    spawn node ${path.join(ROOT_DIR, 'cli.js')}
    expect "Shelves, not search results."
    expect "Frontend"
    send "q"
    expect eof
  `;
  return runExpect(script, { cwd: ROOT_DIR, env, timeout: 30000 });
}

function runTuiHomeSnapshot(env, { columns, rows, expectedLines }) {
  const expectations = expectedLines.map((line) => `expect "${line}"`).join('\n    ');
  const script = `
    log_user 1
    set timeout 20
    spawn sh -lc "stty rows ${rows} columns ${columns}; node ${path.join(ROOT_DIR, 'cli.js')}"
    expect "Shelves, not search results."
    ${expectations}
    send "q"
    expect eof
  `;

  return runExpect(script, { cwd: ROOT_DIR, env, timeout: 30000 });
}

function runTuiDetailSnapshot(skillName, env, cwd) {
  const title = skillName
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
  const script = `
    log_user 1
    set timeout 30
    spawn sh -lc "stty rows 24 columns 80; node ${path.join(ROOT_DIR, 'cli.js')}"
    expect "Shelves, not search results."
    send "/"
    expect "Search the library"
    send -- "${skillName}"
    expect "${title}"
    send "\\r"
    expect "Why it belongs"
    expect "Install"
    expect {
      "Cataloged upstream / Live install" {}
      "House copy / Bundled install" {}
      timeout { exit 5 }
    }
    send "i"
    expect "Install ${title}"
    expect "Global install"
    expect "Project install"
    expect "Command"
    send "q"
    expect eof
  `;

  return runExpect(script, { cwd, env, timeout: 60000 });
}

function runTuiInstall(skillName, scope, env, cwd) {
  const title = skillName
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
  const down = scope === 'project' ? 'j' : '';
  const script = `
    log_user 1
    set timeout 30
    spawn node ${path.join(ROOT_DIR, 'cli.js')}
    expect "Shelves, not search results."
    send "/"
    expect "Search the library"
    send -- "${skillName}"
    expect {
      "${title}" {}
      timeout { exit 2 }
    }
    send "\\r"
    expect {
      "Why it belongs" {}
      timeout { exit 3 }
    }
    send "i"
    expect {
      "Install ${title}" {}
      timeout { exit 4 }
    }
    expect "Global install"
    expect "Project install"
    ${down
      ? `send "${down}"
    expect "${skillName} -p"`
      : ''}
    send "\\r"
    expect eof
  `;

  return runExpect(script, {
    cwd,
    env,
    timeout: 60000,
  });
}

function runPackSmoke() {
  const result = runCommand('npm', ['pack', '--dry-run'], { cwd: ROOT_DIR, timeout: 180000 });
  ensure(result.code === 0, 'npm pack --dry-run failed');
  ensure(!result.combined.includes('tmp/live-test-report.json'), 'npm pack should not include tmp/live-test-report.json');
  ensure(!result.combined.includes('tmp/live-quick-report.json'), 'npm pack should not include tmp/live-quick-report.json');
  return {
    code: result.code,
    durationMs: result.durationMs,
    output: sanitizeForReport(result.combined),
  };
}

function cacheUpstreamRepos(skills, report) {
  const repoCache = new Map();
  const upstreamSources = Array.from(
    new Set(
      skills
        .filter((skill) => skill.tier === 'upstream')
        .map((skill) => skill.source)
    )
  );

  for (const source of upstreamSources) {
    info(`Cloning live source ${source}`);
    const parsed = parseSource(source);
    const prepared = prepareSource(source, { parsed });
    const commitSha = execFileSync('git', ['-C', prepared.repoRoot, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
    const repoId = repoIdFromSource(source);
    repoCache.set(repoId, {
      source,
      repoRoot: prepared.repoRoot,
      cleanup: prepared.cleanup,
      commitSha,
    });
    report.repos.push({
      repoId,
      source,
      commitSha,
    });
    pass(`Captured ${repoId} @ ${commitSha.slice(0, 12)}`);
  }

  return repoCache;
}

function cleanupRepoCache(repoCache) {
  for (const cached of repoCache.values()) {
    try {
      cached.cleanup();
    } catch {}
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const catalog = loadCatalogData();
  const selectedSkills = selectSkills(catalog, options);
  ensure(selectedSkills.length > 0, 'No skills matched the live test selection');

  const report = {
    startedAt: new Date().toISOString(),
    node: process.version,
    quick: options.quick,
    fullScopes: options.fullScopes,
    selectedSkillCount: selectedSkills.length,
    catalog: {
      version: catalog.version,
      counts: getCatalogCounts(catalog),
    },
    repos: [],
    catalogDiscovery: [],
    previews: [],
    skills: [],
    tui: {
      enabled: !options.skipTui,
      available: false,
      smoke: null,
      flows: [],
    },
    releasePack: null,
    failures: [],
  };

  let fatalError = null;
  const repoCache = cacheUpstreamRepos(selectedSkills, report);

  try {
    info(`Running live verification for ${selectedSkills.length} skills`);

    const skillsBySource = new Map();
    for (const skill of selectedSkills.filter((entry) => entry.tier === 'upstream')) {
      const list = skillsBySource.get(skill.source) || [];
      list.push(skill.name);
      skillsBySource.set(skill.source, list);
    }

    for (const [sourceRepo, expectedSkills] of skillsBySource.entries()) {
      info(`Listing live catalog source ${sourceRepo}`);
      const discovery = runCatalogListFlow(sourceRepo, expectedSkills.sort());
      report.catalogDiscovery.push(discovery);
      pass(`Catalog list proved ${sourceRepo}`);
    }

    for (const skill of selectedSkills) {
      try {
        info(`Snapshotting ${skill.name}`);
        const sourceSnapshot = collectSourceSnapshot(skill, repoCache);

        info(`Previewing ${skill.name}`);
        const preview = runPreviewFlow(skill);
        report.previews.push(preview);

        const scopes = options.fullScopes ? ['global', 'project'] : ['project'];
        const lifecycles = [];
        for (const scope of scopes) {
          info(`Running ${scope} lifecycle for ${skill.name}`);
          lifecycles.push(runInstallLifecycle(skill, sourceSnapshot, scope));
          pass(`${skill.name} ${scope} lifecycle matched source manifest ${sourceSnapshot.snapshot.manifestHash.slice(0, 12)}`);
        }

        report.skills.push({
          name: skill.name,
          tier: skill.tier,
          source: skill.source,
          installSource: skill.installSource,
          sourceSnapshot: {
            repoId: sourceSnapshot.repoId,
            commitSha: sourceSnapshot.commitSha,
            relativeDir: sourceSnapshot.relativeDir,
            rawSource: sourceSnapshot.rawSource,
            frontmatter: sourceSnapshot.frontmatter,
            markdownSha256: sourceSnapshot.markdownSha256,
            markdownBytes: sourceSnapshot.markdownBytes,
            markdown: sourceSnapshot.markdown,
            manifestHash: sourceSnapshot.snapshot.manifestHash,
            fileCount: sourceSnapshot.snapshot.fileCount,
            totalBytes: sourceSnapshot.snapshot.totalBytes,
            files: sourceSnapshot.snapshot.files,
          },
          lifecycles,
        });
      } catch (error) {
        report.failures.push({
          skill: skill.name,
          message: error.message,
        });
        throw error;
      }
    }

    const expectBinary = options.skipTui ? null : resolveExpectBinary();
    report.tui.available = Boolean(expectBinary);

    if (!options.skipTui) {
      if (!expectBinary) {
        warn('Skipping TUI live flows because expect is not installed');
      } else {
        const smokeContext = createIsolatedContext();
        try {
          info('Running TUI smoke boot');
          const smoke = runTuiSmoke(smokeContext.env);
          ensure(smoke.code === 0, 'TUI smoke boot failed');
          report.tui.smoke = {
            code: smoke.code,
            durationMs: smoke.durationMs,
            output: sanitizeForReport(smoke.combined),
          };
          pass('TUI booted to the dedicated home from the top');
        } finally {
          smokeContext.cleanup();
        }

        const viewportScenarios = [
          { columns: 80, rows: 24, expectedLines: ['Frontend', 'My Picks', 'House Copies'] },
          { columns: 100, rows: 30, expectedLines: ['Frontend', 'My Picks', 'Cataloged Upstream'] },
          { columns: 140, rows: 40, expectedLines: ['Frontend', 'Cataloged Upstream', 'Source Repos'] },
        ];

        report.tui.viewports = [];
        for (const scenario of viewportScenarios) {
          const context = createIsolatedContext();
          try {
            info(`Capturing TUI home at ${scenario.columns}x${scenario.rows}`);
            const result = runTuiHomeSnapshot(context.env, scenario);
            ensure(result.code === 0, `TUI home snapshot failed for ${scenario.columns}x${scenario.rows}`);
            report.tui.viewports.push({
              columns: scenario.columns,
              rows: scenario.rows,
              code: result.code,
              durationMs: result.durationMs,
              output: sanitizeForReport(result.combined),
            });
            pass(`TUI home hierarchy rendered at ${scenario.columns}x${scenario.rows}`);
          } finally {
            context.cleanup();
          }
        }

        const detailContext = createIsolatedContext();
        try {
          info('Running TUI detail and chooser hierarchy check');
          const result = runTuiDetailSnapshot('frontend-design', detailContext.env, detailContext.projectDir);
          ensure(result.code === 0, 'TUI detail snapshot failed');
          report.tui.detail = {
            code: result.code,
            durationMs: result.durationMs,
            output: sanitizeForReport(result.combined),
          };
          pass('TUI detail view kept editorial note ahead of install and showed the chooser hierarchy');
        } finally {
          detailContext.cleanup();
        }

        const tuiScenarios = [
          { skillName: 'best-practices', scope: 'global' },
          { skillName: 'frontend-design', scope: 'project' },
        ];

        for (const scenario of tuiScenarios) {
          const context = createIsolatedContext();
          try {
            info(`Running TUI install flow for ${scenario.skillName} (${scenario.scope})`);
            const result = runTuiInstall(scenario.skillName, scenario.scope, context.env, context.projectDir);
            ensure(result.code === 0, `TUI install flow failed for ${scenario.skillName}`);
            const installDir = expectedInstallDir(scenario.scope, context, scenario.skillName);
            ensure(fs.existsSync(path.join(installDir, 'SKILL.md')), `TUI install did not create ${scenario.skillName} in ${scenario.scope}`);
            report.tui.flows.push({
              skillName: scenario.skillName,
              scope: scenario.scope,
              code: result.code,
              durationMs: result.durationMs,
              output: sanitizeForReport(result.combined),
            });
            pass(`TUI installed ${scenario.skillName} to ${scenario.scope}`);
          } finally {
            context.cleanup();
          }
        }
      }
    }

    info('Packing the npm artifact');
    report.releasePack = runPackSmoke();
    pass('npm pack --dry-run succeeded');
  } catch (error) {
    fatalError = error;
    report.failures.push({
      skill: null,
      message: error.message,
    });
  } finally {
    cleanupRepoCache(repoCache);
    report.finishedAt = new Date().toISOString();
    maybeMkdir(path.dirname(options.reportPath));
    fs.writeFileSync(options.reportPath, JSON.stringify(report, null, 2) + '\n');
  }

  if (fatalError || report.failures.length > 0) {
    fail(`Live verification failed. Report written to ${options.reportPath}`);
    if (fatalError) {
      throw fatalError;
    }
    process.exit(1);
  }

  pass(`Live verification passed. Report written to ${options.reportPath}`);
}

main().catch((error) => {
  fail(error.stack || error.message);
  process.exit(1);
});
