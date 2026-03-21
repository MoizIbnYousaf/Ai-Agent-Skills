const fs = require('fs');
const path = require('path');

const { SKILL_META_FILE } = require('./paths.cjs');

function parseRepoFromUrl(url) {
  const match = String(url || '').match(/github\.com\/([^/]+)\/([^/#]+)/);
  if (!match) return null;
  return `${match[1]}/${match[2].replace(/\.git$/, '')}`;
}

function normalizeInstalledMeta(meta = {}) {
  const sourceType = meta.sourceType || meta.source || 'catalog';
  const repo = meta.repo || parseRepoFromUrl(meta.url);
  const subpath = meta.subpath || meta.skillPath || null;
  const installSource = meta.installSource
    || (repo ? (subpath ? `${repo}/${subpath}` : repo) : null)
    || null;
  const skillName = meta.skillName || meta.skill || meta.name || null;

  return {
    ...meta,
    sourceType,
    source: sourceType,
    repo: repo || null,
    ref: meta.ref || null,
    subpath,
    installSource,
    skillName,
    scope: meta.scope || 'legacy',
    installedAt: meta.installedAt || null,
    updatedAt: meta.updatedAt || null,
  };
}

function writeInstalledMeta(skillPath, meta) {
  try {
    const metaPath = path.join(skillPath, SKILL_META_FILE);
    const now = new Date().toISOString();
    const normalized = normalizeInstalledMeta({
      ...meta,
      installedAt: meta.installedAt || now,
      updatedAt: now,
    });
    fs.writeFileSync(metaPath, JSON.stringify(normalized, null, 2));
    return true;
  } catch {
    return false;
  }
}

function readInstalledMeta(skillPath) {
  try {
    const metaPath = path.join(skillPath, SKILL_META_FILE);
    if (!fs.existsSync(metaPath)) return null;
    const raw = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    return normalizeInstalledMeta(raw);
  } catch {
    return null;
  }
}

module.exports = {
  normalizeInstalledMeta,
  readInstalledMeta,
  writeInstalledMeta,
};
