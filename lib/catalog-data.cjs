const fs = require('fs');

const { SKILLS_JSON_PATH } = require('./paths.cjs');

const VALID_CATEGORIES = ['development', 'document', 'creative', 'business', 'productivity'];
const VALID_DISTRIBUTIONS = ['bundled', 'live'];
const VALID_ORIGINS = ['authored', 'curated', 'adapted'];
const VALID_SYNC_MODES = ['authored', 'mirror', 'snapshot', 'adapted', 'live'];
const VALID_TIERS = ['house', 'upstream'];
const VALID_TRUST = ['verified', 'reviewed', 'listed'];

function deriveTier(skill) {
  if (skill.tier === 'house' || skill.tier === 'upstream') return skill.tier;
  return skill.vendored === false ? 'upstream' : 'house';
}

function deriveDistribution(skill, tier) {
  if (skill.distribution === 'bundled' || skill.distribution === 'live') {
    return skill.distribution;
  }
  return tier === 'house' ? 'bundled' : 'live';
}

function normalizeSkill(skill) {
  const tier = deriveTier(skill);
  const distribution = deriveDistribution(skill, tier);
  const vendored = tier === 'house';
  const installSource = tier === 'upstream'
    ? String(skill.installSource || skill.source || '').trim()
    : String(skill.installSource || '').trim();

  return {
    ...skill,
    tier,
    vendored,
    distribution,
    installSource,
    featured: Boolean(skill.featured),
    verified: Boolean(skill.verified),
    notes: typeof skill.notes === 'string' ? skill.notes : '',
    labels: Array.isArray(skill.labels) ? skill.labels : [],
    whyHere: typeof skill.whyHere === 'string' ? skill.whyHere : '',
    path: typeof skill.path === 'string' ? skill.path : vendored ? `skills/${skill.name}` : '',
  };
}

function normalizeCatalogData(data) {
  const skills = Array.isArray(data.skills) ? data.skills.map(normalizeSkill) : [];
  return {
    ...data,
    total: skills.length,
    skills,
  };
}

function loadCatalogData() {
  const raw = JSON.parse(fs.readFileSync(SKILLS_JSON_PATH, 'utf8'));
  return normalizeCatalogData(raw);
}

function writeCatalogData(data) {
  const normalized = normalizeCatalogData(data);
  fs.writeFileSync(SKILLS_JSON_PATH, JSON.stringify(normalized, null, 2) + '\n');
  return normalized;
}

function findSkillByName(data, skillName) {
  return (data.skills || []).find((skill) => skill.name === skillName) || null;
}

function getCatalogCounts(data) {
  const skills = data.skills || [];
  const house = skills.filter((skill) => skill.tier === 'house').length;
  const upstream = skills.filter((skill) => skill.tier === 'upstream').length;
  return {
    total: skills.length,
    house,
    upstream,
  };
}

function validateCatalogData(data) {
  const rawTotal = data.total;
  const normalized = normalizeCatalogData(data);
  const errors = [];
  const warnings = [];
  const names = new Set();
  const workAreaIds = new Set((normalized.workAreas || []).map((area) => area.id));

  for (const skill of normalized.skills) {
    const required = ['name', 'description', 'category', 'workArea', 'branch', 'author', 'license', 'source', 'origin', 'trust', 'syncMode', 'tier', 'distribution'];
    for (const field of required) {
      if (!skill[field]) errors.push(`${skill.name || '(unnamed)'} missing ${field}`);
    }

    if (!VALID_CATEGORIES.includes(skill.category)) errors.push(`Invalid category "${skill.category}" for ${skill.name}`);
    if (!VALID_ORIGINS.includes(skill.origin)) errors.push(`Invalid origin "${skill.origin}" for ${skill.name}`);
    if (!VALID_TRUST.includes(skill.trust)) errors.push(`Invalid trust "${skill.trust}" for ${skill.name}`);
    if (!VALID_SYNC_MODES.includes(skill.syncMode)) errors.push(`Invalid syncMode "${skill.syncMode}" for ${skill.name}`);
    if (!VALID_TIERS.includes(skill.tier)) errors.push(`Invalid tier "${skill.tier}" for ${skill.name}`);
    if (!VALID_DISTRIBUTIONS.includes(skill.distribution)) errors.push(`Invalid distribution "${skill.distribution}" for ${skill.name}`);
    if (skill.workArea && workAreaIds.size > 0 && !workAreaIds.has(skill.workArea)) errors.push(`Invalid workArea "${skill.workArea}" for ${skill.name}`);

    if (names.has(skill.name)) {
      errors.push(`Duplicate skill name: ${skill.name}`);
    }
    names.add(skill.name);

    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(skill.name)) {
      errors.push(`Invalid name format: ${skill.name}`);
    }

    if (skill.sourceUrl && !skill.sourceUrl.startsWith('https://github.com/')) {
      errors.push(`Invalid sourceUrl for ${skill.name}`);
    }

    if (skill.tier === 'upstream' && !skill.sourceUrl) {
      errors.push(`Upstream skill "${skill.name}" missing sourceUrl`);
    }

    if (skill.verified && !skill.lastVerified) {
      warnings.push(`Verified skill ${skill.name} has no lastVerified date`);
    }

    if (skill.tier === 'upstream' && !skill.installSource) {
      errors.push(`Upstream skill "${skill.name}" missing installSource`);
    }

    if ((skill.tier === 'house' || skill.featured) && (!skill.whyHere || skill.whyHere.trim().length < 20)) {
      errors.push(`whyHere is required and too thin for ${skill.name}`);
    } else if (skill.whyHere && skill.whyHere.trim().length < 20) {
      warnings.push(`whyHere is thin for ${skill.name}`);
    }

    if (skill.description) {
      const desc = skill.description.toLowerCase();
      const actionPatterns = /\b(when|use |use$|trigger|if |before|after|during|whenever|upon|while)\b/;
      if (!actionPatterns.test(desc)) {
        warnings.push(`${skill.name}: description reads like a summary, not a trigger condition. Consider starting with "Use when..." or similar action-oriented language.`);
      }
    }
  }

  if (rawTotal !== normalized.skills.length) {
    errors.push(`skills.json "total" is ${rawTotal} but actual count is ${normalized.skills.length}`);
  }

  return {
    data: normalized,
    errors,
    warnings,
  };
}

module.exports = {
  findSkillByName,
  getCatalogCounts,
  loadCatalogData,
  normalizeCatalogData,
  normalizeSkill,
  validateCatalogData,
  writeCatalogData,
};
