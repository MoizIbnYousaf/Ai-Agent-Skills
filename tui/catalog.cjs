const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const SKILLS_JSON = path.join(ROOT_DIR, 'skills.json');
const SKILLS_DIR = path.join(ROOT_DIR, 'skills');

const SOURCE_TITLES = {
  'MoizIbnYousaf/Ai-Agent-Skills': 'Moiz',
  'anthropics/skills': 'Anthropic',
  'anthropics/claude-code': 'Anthropic Claude Code',
  'openai/skills': 'OpenAI',
  'wshobson/agents': 'wshobson',
  'ComposioHQ/awesome-claude-skills': 'Composio',
};

const TOKEN_TITLES = {
  ai: 'AI',
  ci: 'CI',
  docs: 'Docs',
  docx: 'DOCX',
  figma: 'Figma',
  jira: 'Jira',
  llms: 'LLMs',
  mcp: 'MCP',
  openai: 'OpenAI',
  pdf: 'PDF',
  pptx: 'PPTX',
  qa: 'QA',
  ui: 'UI',
  xlsx: 'XLSX',
};

function titleizeToken(token) {
  if (!token) return '';
  const lower = token.toLowerCase();
  if (TOKEN_TITLES[lower]) return TOKEN_TITLES[lower];
  return token.charAt(0).toUpperCase() + token.slice(1);
}

function humanizeSlug(slug) {
  return String(slug || '')
    .split('-')
    .filter(Boolean)
    .map(titleizeToken)
    .join(' ');
}

function sourceTitle(source) {
  return SOURCE_TITLES[source] || humanizeSlug(String(source || '').split('/').pop() || source);
}

function readSkillsJson() {
  return JSON.parse(fs.readFileSync(SKILLS_JSON, 'utf8'));
}

function readSkillMarkdown(skillName) {
  const skillPath = path.join(SKILLS_DIR, skillName, 'SKILL.md');
  return fs.readFileSync(skillPath, 'utf8');
}

function buildSearchText(parts) {
  return parts
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function buildCatalog() {
  const data = readSkillsJson();
  const collectionLookup = new Map(
    (Array.isArray(data.collections) ? data.collections : []).map((collection) => [
      collection.id,
      collection,
    ])
  );

  const collectionTitlesBySkill = new Map();
  for (const collection of collectionLookup.values()) {
    for (const skillName of collection.skills || []) {
      if (!collectionTitlesBySkill.has(skillName)) {
        collectionTitlesBySkill.set(skillName, []);
      }
      collectionTitlesBySkill.get(skillName).push(collection.title);
    }
  }

  const workAreaMeta = new Map(
    (Array.isArray(data.workAreas) ? data.workAreas : []).map((area) => [area.id, area])
  );

  const skills = (data.skills || []).map((skill) => {
    const workArea = workAreaMeta.get(skill.workArea) || {
      id: skill.workArea || 'other',
      title: humanizeSlug(skill.workArea || 'other'),
      description: '',
    };
    const branchTitle = humanizeSlug(skill.branch || 'misc');
    const markdown = readSkillMarkdown(skill.name);
    const source = skill.source;
    const title = humanizeSlug(skill.name);

    return {
      ...skill,
      title,
      workAreaTitle: workArea.title,
      workAreaDescription: workArea.description,
      branchTitle,
      sourceTitle: sourceTitle(source),
      collections: collectionTitlesBySkill.get(skill.name) || [],
      markdown,
      searchText: buildSearchText([
        skill.name,
        title,
        skill.description,
        skill.workArea,
        workArea.title,
        skill.branch,
        branchTitle,
        skill.source,
        sourceTitle(source),
        skill.tags && skill.tags.join(' '),
        skill.whyHere,
      ]),
    };
  });

  const areas = [];
  for (const meta of workAreaMeta.values()) {
    const areaSkills = skills.filter((skill) => skill.workArea === meta.id);
    const branchMap = new Map();

    for (const skill of areaSkills) {
      if (!branchMap.has(skill.branch)) {
        branchMap.set(skill.branch, {
          id: skill.branch,
          title: skill.branchTitle,
          skills: [],
          repoTitles: new Set(),
        });
      }
      const branch = branchMap.get(skill.branch);
      branch.skills.push(skill);
      branch.repoTitles.add(skill.sourceTitle);
    }

    const branches = [...branchMap.values()]
      .map((branch) => ({
        ...branch,
        skillCount: branch.skills.length,
        repoCount: branch.repoTitles.size,
        repoTitles: [...branch.repoTitles].sort(),
      }))
      .sort((left, right) => right.skillCount - left.skillCount || left.title.localeCompare(right.title));

    areas.push({
      id: meta.id,
      title: meta.title,
      description: meta.description,
      skillCount: areaSkills.length,
      repoCount: new Set(areaSkills.map((skill) => skill.source)).size,
      branches,
      searchText: buildSearchText([
        meta.title,
        meta.description,
        branches.map((branch) => `${branch.title} ${branch.repoTitles.join(' ')}`).join(' '),
      ]),
    });
  }

  const sources = [...new Set(skills.map((skill) => skill.source))].map((source) => {
    const sourceSkills = skills.filter((skill) => skill.source === source);
    const branchTitles = new Set();
    const areaTitles = new Set();
    const branchMap = new Map();

    for (const skill of sourceSkills) {
      branchTitles.add(skill.branchTitle);
      areaTitles.add(skill.workAreaTitle);
      const branchKey = `${skill.workArea}:${skill.branch}`;
      if (!branchMap.has(branchKey)) {
        branchMap.set(branchKey, {
          id: branchKey,
          title: skill.branchTitle,
          areaTitle: skill.workAreaTitle,
          skills: [],
        });
      }
      branchMap.get(branchKey).skills.push(skill);
    }

    return {
      slug: source,
      title: sourceTitle(source),
      skillCount: sourceSkills.length,
      branchCount: branchTitles.size,
      areaCount: areaTitles.size,
      mirrorCount: sourceSkills.filter((skill) => skill.syncMode === 'mirror').length,
      snapshotCount: sourceSkills.filter((skill) => skill.syncMode === 'snapshot').length,
      skills: sourceSkills.sort((left, right) => left.title.localeCompare(right.title)),
      branches: [...branchMap.values()]
        .map((branch) => ({
          ...branch,
          skillCount: branch.skills.length,
        }))
        .sort((left, right) => right.skillCount - left.skillCount || left.title.localeCompare(right.title)),
      searchText: buildSearchText([
        source,
        sourceTitle(source),
        [...branchTitles].join(' '),
        [...areaTitles].join(' '),
      ]),
    };
  }).sort((left, right) => right.skillCount - left.skillCount || left.title.localeCompare(right.title));

  return {
    updated: data.updated,
    total: data.total,
    skills,
    areas,
    sources,
  };
}

module.exports = {
  buildCatalog,
  humanizeSlug,
};
