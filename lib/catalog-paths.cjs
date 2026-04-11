const fs = require('fs');
const path = require('path');

function getCatalogSkillRelativePath(skill) {
  if (skill && typeof skill.path === 'string' && skill.path.trim()) {
    return skill.path.trim().replace(/\\/g, '/');
  }
  return `skills/${skill?.name || ''}`;
}

function resolveCatalogSkillSourcePath(skillName, { sourceContext, skill = null } = {}) {
  if (!sourceContext || !sourceContext.rootDir) {
    throw new Error('A sourceContext with rootDir is required to resolve catalog skill paths.');
  }

  return path.join(sourceContext.rootDir, getCatalogSkillRelativePath(skill || { name: skillName }));
}

function hasLocalCatalogSkillFiles(skill, sourceContext) {
  if (!skill || !sourceContext) return false;
  return fs.existsSync(resolveCatalogSkillSourcePath(skill.name, { sourceContext, skill }));
}

function shouldTreatCatalogSkillAsHouse(skill, sourceContext) {
  if (!skill) return false;
  if (sourceContext && hasLocalCatalogSkillFiles(skill, sourceContext)) return true;
  return skill.tier !== 'upstream' || !skill.source;
}

module.exports = {
  getCatalogSkillRelativePath,
  resolveCatalogSkillSourcePath,
  hasLocalCatalogSkillFiles,
  shouldTreatCatalogSkillAsHouse,
};
