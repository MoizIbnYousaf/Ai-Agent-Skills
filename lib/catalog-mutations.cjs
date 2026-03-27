const fs = require('fs');

const {
  findSkillByName,
  loadCatalogData,
  normalizeCatalogData,
  normalizeSkill,
  validateCatalogData,
} = require('./catalog-data.cjs');
const {
  README_PATH,
  SKILLS_JSON_PATH,
  WORK_AREAS_PATH,
} = require('./paths.cjs');
const { renderGeneratedDocs, generatedDocsAreInSync } = require('./render-docs.cjs');

const VALID_TRUST = ['listed', 'reviewed', 'verified'];
const CURATION_STALE_DAYS = 180;
const SUSPICIOUS_BRANCHES = new Set(['general', 'misc', 'other', 'default', 'todo', 'test']);

function currentIsoDay() {
  return new Date().toISOString().split('T')[0];
}

function currentCatalogTimestamp() {
  return `${currentIsoDay()}T00:00:00Z`;
}

function normalizeListInput(value) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => String(entry || '').trim())
      .filter(Boolean);
  }

  return String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function ensureRequiredPlacement(fields, data) {
  const errors = [];
  const workAreaIds = new Set((data.workAreas || []).map((area) => area.id));

  if (!fields.workArea || !String(fields.workArea).trim()) {
    errors.push('workArea is required');
  } else if (workAreaIds.size > 0 && !workAreaIds.has(String(fields.workArea).trim())) {
    errors.push(`Invalid workArea "${fields.workArea}"`);
  }

  if (!fields.branch || !String(fields.branch).trim()) {
    errors.push('branch is required');
  }

  if (!fields.whyHere || String(fields.whyHere).trim().length < 20) {
    errors.push('whyHere is required and must be at least 20 characters');
  }

  return errors;
}

function ensureCollectionIdsExist(collectionIds, data) {
  const requested = normalizeListInput(collectionIds);
  if (requested.length === 0) return [];

  const known = new Set((data.collections || []).map((collection) => collection.id));
  const missing = requested.filter((id) => !known.has(id));
  if (missing.length > 0) {
    throw new Error(`Unknown collection${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}`);
  }

  return requested;
}

function ensureValidTrust(trust) {
  if (!VALID_TRUST.includes(trust)) {
    throw new Error(`Invalid trust "${trust}". Expected one of: ${VALID_TRUST.join(', ')}`);
  }
}

function buildRepoId(parsed, fallbackSource = '') {
  if (parsed?.owner && parsed?.repo) {
    return `${parsed.owner}/${parsed.repo}`;
  }
  return String(fallbackSource || '').trim();
}

function buildInstallSourceRef(parsed, relativeDir) {
  const repoId = buildRepoId(parsed);
  if (!repoId) return '';
  if (!relativeDir || relativeDir === '.') return repoId;
  return `${repoId}/${relativeDir.replace(/^\/+/, '')}`;
}

function buildSourceUrl(parsed, relativeDir) {
  const repoId = buildRepoId(parsed);
  if (!repoId) return '';
  const suffix = !relativeDir || relativeDir === '.'
    ? ''
    : `/tree/main/${relativeDir.replace(/^\/+/, '')}`;
  return `https://github.com/${repoId}${suffix}`;
}

function buildUpstreamCatalogEntry({ source, parsed, discoveredSkill, fields, existingCatalog }) {
  const placementErrors = ensureRequiredPlacement(fields, existingCatalog);
  if (placementErrors.length > 0) {
    throw new Error(placementErrors.join('; '));
  }

  return normalizeSkill({
    name: discoveredSkill.name,
    description: String(fields.description || discoveredSkill.description || '').trim(),
    category: String(fields.category || 'development').trim(),
    workArea: String(fields.workArea).trim(),
    branch: String(fields.branch).trim(),
    author: discoveredSkill.frontmatter?.author || parsed.owner || 'unknown',
    source: buildRepoId(parsed, source),
    license: discoveredSkill.frontmatter?.license || 'MIT',
    tier: 'upstream',
    distribution: 'live',
    vendored: false,
    installSource: buildInstallSourceRef(parsed, discoveredSkill.relativeDir && discoveredSkill.relativeDir !== '.' ? discoveredSkill.relativeDir : null),
    tags: normalizeListInput(fields.tags),
    featured: Boolean(fields.featured),
    verified: Boolean(fields.verified) || String(fields.trust || '').trim() === 'verified',
    origin: 'curated',
    trust: normalizeTrust(fields.trust),
    syncMode: 'live',
    sourceUrl: buildSourceUrl(parsed, discoveredSkill.relativeDir && discoveredSkill.relativeDir !== '.' ? discoveredSkill.relativeDir : null),
    whyHere: String(fields.whyHere || '').trim(),
    lastVerified: resolveLastVerified(fields),
    notes: String(fields.notes || '').trim(),
    labels: normalizeListInput(fields.labels),
    addedDate: currentIsoDay(),
    lastCurated: currentCatalogTimestamp(),
  });
}

function buildHouseCatalogEntry(fields, data) {
  const placementErrors = ensureRequiredPlacement(fields, data);
  if (placementErrors.length > 0) {
    throw new Error(placementErrors.join('; '));
  }
  return normalizeSkill({
    ...fields,
    description: String(fields.description || '').trim(),
    category: String(fields.category || 'development').trim(),
    workArea: String(fields.workArea).trim(),
    branch: String(fields.branch).trim(),
    author: String(fields.author || 'unknown').trim(),
    source: String(fields.source || '').trim(),
    license: String(fields.license || 'MIT').trim(),
    path: String(fields.path || `skills/${fields.name || ''}`).trim(),
    tier: 'house',
    distribution: 'bundled',
    vendored: true,
    installSource: '',
    tags: normalizeListInput(fields.tags),
    featured: Boolean(fields.featured),
    verified: Boolean(fields.verified) || String(fields.trust || '').trim() === 'verified',
    origin: String(fields.origin || 'curated').trim(),
    trust: normalizeTrust(fields.trust),
    syncMode: String(fields.syncMode || 'snapshot').trim(),
    sourceUrl: String(fields.sourceUrl || '').trim(),
    whyHere: String(fields.whyHere || '').trim(),
    lastVerified: resolveLastVerified(fields),
    notes: String(fields.notes || '').trim(),
    labels: normalizeListInput(fields.labels),
    addedDate: String(fields.addedDate || currentIsoDay()).trim(),
    lastCurated: String(fields.lastCurated || currentCatalogTimestamp()).trim(),
  });
}

function normalizeTrust(trust) {
  const value = String(trust || 'listed').trim() || 'listed';
  ensureValidTrust(value);
  return value;
}

function resolveLastVerified(fields, existingSkill = null) {
  if (fields.clearVerified) return '';
  if (typeof fields.lastVerified === 'string') {
    return fields.lastVerified.trim();
  }
  const incomingTrust = fields.trust !== undefined ? normalizeTrust(fields.trust) : null;
  const explicitVerified = incomingTrust === 'verified' || fields.verified === true;
  if (explicitVerified) {
    return existingSkill?.lastVerified || currentIsoDay();
  }
  if (incomingTrust && incomingTrust !== 'verified') {
    return '';
  }
  return existingSkill?.lastVerified || '';
}

function addSkillToCollections(collections, skillName, collectionIds) {
  const targetIds = new Set(normalizeListInput(collectionIds));
  if (targetIds.size === 0) return collections || [];

  return (collections || []).map((collection) => {
    if (!targetIds.has(collection.id)) {
      return collection;
    }

    const nextSkills = Array.isArray(collection.skills) ? [...collection.skills] : [];
    if (!nextSkills.includes(skillName)) {
      nextSkills.push(skillName);
    }

    return {
      ...collection,
      skills: nextSkills,
    };
  });
}

function removeSkillFromSelectedCollections(collections, skillName, collectionIds) {
  const targetIds = new Set(normalizeListInput(collectionIds));
  if (targetIds.size === 0) return collections || [];

  return (collections || []).map((collection) => (
    !targetIds.has(collection.id)
      ? collection
      : {
          ...collection,
          skills: (collection.skills || []).filter((name) => name !== skillName),
        }
  ));
}

function applyCurateChanges(skill, changes, data) {
  const next = { ...skill };
  const workAreaIds = new Set((data.workAreas || []).map((area) => area.id));

  if (changes.workArea !== undefined) {
    const value = String(changes.workArea || '').trim();
    if (!value) throw new Error('workArea cannot be blank');
    if (workAreaIds.size > 0 && !workAreaIds.has(value)) {
      throw new Error(`Invalid workArea "${value}"`);
    }
    next.workArea = value;
  }

  if (changes.branch !== undefined) {
    const value = String(changes.branch || '').trim();
    if (!value) throw new Error('branch cannot be blank');
    next.branch = value;
  }

  if (changes.description !== undefined) {
    const value = String(changes.description || '').trim();
    if (!value) throw new Error('description cannot be blank');
    next.description = value;
  }

  if (changes.whyHere !== undefined) {
    const value = String(changes.whyHere || '').trim();
    if (value.length < 20) throw new Error('whyHere must be at least 20 characters');
    next.whyHere = value;
  }

  if (changes.notes !== undefined) {
    next.notes = String(changes.notes || '').trim();
  }

  if (changes.tags !== undefined) {
    next.tags = normalizeListInput(changes.tags);
  }

  if (changes.labels !== undefined) {
    next.labels = normalizeListInput(changes.labels);
  }

  if (changes.featured !== undefined) {
    next.featured = Boolean(changes.featured);
  }

  if (changes.trust !== undefined) {
    next.trust = normalizeTrust(changes.trust);
  }

  if (changes.clearVerified) {
    next.lastVerified = '';
    if (next.trust === 'verified') {
      next.trust = 'reviewed';
    }
  } else if (changes.lastVerified !== undefined) {
    next.lastVerified = String(changes.lastVerified || '').trim();
    next.trust = 'verified';
  } else if (changes.verified === true) {
    next.trust = 'verified';
    next.lastVerified = next.lastVerified || currentIsoDay();
  } else if (changes.verified === false && next.trust === 'verified') {
    next.trust = 'reviewed';
    next.lastVerified = '';
  }

  if (next.trust === 'verified' && !next.lastVerified) {
    next.lastVerified = currentIsoDay();
  }

  next.lastCurated = currentCatalogTimestamp();
  return normalizeSkill(next);
}

function removeSkillFromCollections(collections, skillName) {
  return (collections || []).map((collection) => ({
    ...collection,
    skills: (collection.skills || []).filter((name) => name !== skillName),
  }));
}

function commitCatalogData(rawData) {
  const data = normalizeCatalogData({
    ...rawData,
    total: (rawData.skills || []).length,
  });
  const validation = validateCatalogData(data);
  if (validation.errors.length > 0) {
    throw new Error(validation.errors.join('; '));
  }

  const readmeSource = fs.readFileSync(README_PATH, 'utf8');
  const rendered = renderGeneratedDocs(data, readmeSource);

  fs.writeFileSync(SKILLS_JSON_PATH, `${JSON.stringify(data, null, 2)}\n`);
  fs.writeFileSync(README_PATH, rendered.readme);
  fs.writeFileSync(WORK_AREAS_PATH, rendered.workAreas);

  return data;
}

function addUpstreamSkillFromDiscovery({ source, parsed, discoveredSkill, fields }) {
  const data = loadCatalogData();
  if (findSkillByName(data, discoveredSkill.name)) {
    throw new Error(`Skill "${discoveredSkill.name}" already exists in the catalog`);
  }

  const collectionIds = ensureCollectionIdsExist(fields.collections, data);

  const entry = buildUpstreamCatalogEntry({
    source,
    parsed,
    discoveredSkill,
    fields,
    existingCatalog: data,
  });

  return commitCatalogData({
    ...data,
    updated: currentCatalogTimestamp(),
    skills: [...data.skills, entry],
    collections: addSkillToCollections(data.collections, entry.name, collectionIds),
  });
}

function addHouseSkillEntry(entry) {
  const data = loadCatalogData();
  if (findSkillByName(data, entry.name)) {
    throw new Error(`Skill "${entry.name}" already exists in the catalog`);
  }
  const collectionIds = ensureCollectionIdsExist(entry.collections, data);
  const normalizedEntry = buildHouseCatalogEntry(entry, data);
  return commitCatalogData({
    ...data,
    updated: currentCatalogTimestamp(),
    skills: [...data.skills, normalizedEntry],
    collections: addSkillToCollections(data.collections, normalizedEntry.name, collectionIds),
  });
}

function curateSkill(skillName, changes) {
  const data = loadCatalogData();
  const target = findSkillByName(data, skillName);
  if (!target) {
    throw new Error(`Skill "${skillName}" not found in catalog`);
  }

  const collectionIdsToAdd = ensureCollectionIdsExist(changes.collectionsAdd, data);
  const collectionIdsToRemove = ensureCollectionIdsExist(changes.collectionsRemove, data);

  const nextSkills = data.skills.map((skill) => (
    skill.name === skillName
      ? applyCurateChanges(skill, changes, data)
      : skill
  ));

  return commitCatalogData({
    ...data,
    updated: currentCatalogTimestamp(),
    skills: nextSkills,
    collections: removeSkillFromSelectedCollections(
      addSkillToCollections(data.collections, skillName, collectionIdsToAdd),
      skillName,
      collectionIdsToRemove,
    ),
  });
}

function removeSkillFromCatalog(skillName) {
  const data = loadCatalogData();
  const target = findSkillByName(data, skillName);
  if (!target) {
    throw new Error(`Skill "${skillName}" not found in catalog`);
  }

  return commitCatalogData({
    ...data,
    updated: currentCatalogTimestamp(),
    skills: data.skills.filter((skill) => skill.name !== skillName),
    collections: removeSkillFromCollections(data.collections, skillName),
  });
}

function buildReviewQueue(rawData, now = new Date()) {
  const data = normalizeCatalogData(rawData);
  const collectionMembers = new Set(
    (data.collections || []).flatMap((collection) => collection.skills || [])
  );
  const staleThreshold = new Date(now.getTime() - CURATION_STALE_DAYS * 24 * 60 * 60 * 1000);

  return data.skills
    .map((skill) => {
      const reasons = [];
      if (skill.trust === 'listed') reasons.push('listed trust');
      if (!Array.isArray(skill.tags) || skill.tags.length === 0) reasons.push('missing tags');
      if (!Array.isArray(skill.labels) || skill.labels.length === 0) reasons.push('missing labels');
      if (!collectionMembers.has(skill.name)) reasons.push('not in any collection');
      if (!skill.lastCurated) reasons.push('never curated');
      else if (new Date(skill.lastCurated) < staleThreshold) reasons.push('stale curation');

      const normalizedBranch = String(skill.branch || '').trim().toLowerCase();
      const normalizedArea = String(skill.workArea || '').trim().toLowerCase();
      const normalizedName = String(skill.name || '').trim().toLowerCase();
      if (
        normalizedBranch
        && (
          SUSPICIOUS_BRANCHES.has(normalizedBranch)
          || normalizedBranch === normalizedArea
          || normalizedBranch === normalizedName
        )
      ) {
        reasons.push('suspicious branch');
      }

      return {
        skill,
        reasons,
      };
    })
    .filter((entry) => entry.reasons.length > 0)
    .sort((left, right) => {
      const diff = right.reasons.length - left.reasons.length;
      if (diff !== 0) return diff;
      return left.skill.name.localeCompare(right.skill.name);
    });
}

function generatedDocsStatus() {
  return generatedDocsAreInSync(loadCatalogData(), {
    readmeSource: fs.readFileSync(README_PATH, 'utf8'),
    workAreasSource: fs.readFileSync(WORK_AREAS_PATH, 'utf8'),
  });
}

module.exports = {
  CURATION_STALE_DAYS,
  addHouseSkillEntry,
  addUpstreamSkillFromDiscovery,
  addSkillToCollections,
  applyCurateChanges,
  buildHouseCatalogEntry,
  buildReviewQueue,
  buildUpstreamCatalogEntry,
  commitCatalogData,
  currentCatalogTimestamp,
  currentIsoDay,
  curateSkill,
  ensureRequiredPlacement,
  ensureCollectionIdsExist,
  generatedDocsStatus,
  normalizeListInput,
  removeSkillFromSelectedCollections,
  removeSkillFromCatalog,
};
