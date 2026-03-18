const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const SKILLS_JSON = path.join(ROOT_DIR, 'skills.json');
const SKILLS_DIR = path.join(ROOT_DIR, 'skills');
const SKILLS_CLI_VERSION = 'skills@1.4.5';

const SOURCE_TITLES = {
  'MoizIbnYousaf/Ai-Agent-Skills': 'Moiz',
  'anthropics/skills': 'Anthropic',
  'anthropics/claude-code': 'Anthropic Claude Code',
  'openai/skills': 'OpenAI',
  'wshobson/agents': 'wshobson',
  'ComposioHQ/awesome-claude-skills': 'Composio',
};

const SKILLS_AGENT_MAP = {
  claude: 'claude-code',
  cursor: 'cursor',
  amp: 'amp',
  vscode: 'github-copilot',
  copilot: 'github-copilot',
  codex: 'codex',
  kilocode: 'kilo',
  gemini: 'gemini-cli',
  goose: 'goose',
  opencode: 'opencode',
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

function buildCollectionPlacementMap(collections) {
  const placement = new Map();
  (Array.isArray(collections) ? collections : []).forEach((collection, collectionIndex) => {
    (collection.skills || []).forEach((skillName, skillIndex) => {
      if (!placement.has(skillName)) {
        placement.set(skillName, {collectionIndex, skillIndex});
      }
    });
  });
  return placement;
}

function getSkillOriginRank(skill) {
  if (skill.origin === 'authored') return 3;
  if (skill.origin === 'adapted') return 2;
  return 1;
}

function getSkillTrustRank(skill) {
  if (skill.verified || skill.trust === 'verified') return 2;
  if (skill.featured) return 1;
  return 0;
}

function getSkillCurationScore(collectionPlacement, skill) {
  let score = 0;

  if (collectionPlacement.has(skill.name)) score += 1000;
  if (skill.featured) score += 400;
  score += getSkillTrustRank(skill) * 180;
  score += getSkillOriginRank(skill) * 80;

  return score;
}

function compareSkillsByCuration(collectionPlacement, left, right) {
  const scoreDiff = getSkillCurationScore(collectionPlacement, right) - getSkillCurationScore(collectionPlacement, left);
  if (scoreDiff !== 0) return scoreDiff;

  const leftPlacement = collectionPlacement.get(left.name);
  const rightPlacement = collectionPlacement.get(right.name);
  if (leftPlacement && rightPlacement) {
    if (leftPlacement.collectionIndex !== rightPlacement.collectionIndex) {
      return leftPlacement.collectionIndex - rightPlacement.collectionIndex;
    }
    if (leftPlacement.skillIndex !== rightPlacement.skillIndex) {
      return leftPlacement.skillIndex - rightPlacement.skillIndex;
    }
  } else if (leftPlacement || rightPlacement) {
    return leftPlacement ? -1 : 1;
  }

  const leftTitle = left.title || humanizeSlug(left.name);
  const rightTitle = right.title || humanizeSlug(right.name);
  return leftTitle.localeCompare(rightTitle);
}

function sortSkillsByCuration(data, skills) {
  const collectionPlacement = buildCollectionPlacementMap(Array.isArray(data?.collections) ? data.collections : []);
  return [...skills].sort((left, right) => compareSkillsByCuration(collectionPlacement, left, right));
}

function compareSkillsByCurationData(data, left, right) {
  const collectionPlacement = buildCollectionPlacementMap(Array.isArray(data?.collections) ? data.collections : []);
  return compareSkillsByCuration(collectionPlacement, left, right);
}

function getSiblingRecommendations(data, skill, limit = 3) {
  if (!skill) return [];

  const allSkills = Array.isArray(data?.skills) ? data.skills : [];
  const collectionPlacement = buildCollectionPlacementMap(Array.isArray(data?.collections) ? data.collections : []);
  const collectionMembers = new Set();
  const skillCollections = [];

  (Array.isArray(data?.collections) ? data.collections : []).forEach((collection) => {
    if ((collection.skills || []).includes(skill.name)) {
      skillCollections.push(collection.id);
      (collection.skills || []).forEach((skillName) => {
        if (skillName !== skill.name) collectionMembers.add(skillName);
      });
    }
  });

  const siblings = allSkills.filter((candidate) =>
    candidate.name !== skill.name &&
    (collectionMembers.has(candidate.name) || candidate.workArea === skill.workArea)
  );

  return siblings
    .sort((left, right) => {
      const score = (candidate) => {
        let value = 0;
        if (candidate.workArea === skill.workArea) value += 2000;
        if (collectionMembers.has(candidate.name)) value += 1200;
        if (candidate.source === skill.source) value += 250;

        const candidateCollections = (Array.isArray(data?.collections) ? data.collections : [])
          .filter((collection) => (collection.skills || []).includes(candidate.name))
          .map((collection) => collection.id);
        if (candidateCollections.some((collectionId) => skillCollections.includes(collectionId))) value += 200;

        return value;
      };

      const scoreDiff = score(right) - score(left);
      if (scoreDiff !== 0) return scoreDiff;
      return compareSkillsByCuration(collectionPlacement, left, right);
    })
    .slice(0, limit);
}

function shellQuote(value) {
  const stringValue = String(value);
  if (/^[a-zA-Z0-9._:/=@-]+$/.test(stringValue)) return stringValue;
  return `'${stringValue.replace(/'/g, `'\\''`)}'`;
}

function getSkillsAgent(agent) {
  return SKILLS_AGENT_MAP[agent] || null;
}

function getSkillsInstallSpec(skill, agent) {
  if (!skill || !skill.source || !skill.sourceUrl) {
    return null;
  }

  const mappedAgent = getSkillsAgent(agent);
  if (!mappedAgent) {
    return null;
  }

  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(skill.source)) {
    return null;
  }

  let sourceUrl;
  try {
    const url = new URL(skill.sourceUrl);
    if (url.hostname !== 'github.com') return null;
    sourceUrl = `https://github.com/${skill.source}`;
  } catch {
    return null;
  }

  const args = [
    'exec',
    '--yes',
    `--package=${SKILLS_CLI_VERSION}`,
    'skills',
    '--',
    'add',
    sourceUrl,
    '--skill',
    skill.name,
    '--agent',
    mappedAgent,
    '-y',
  ];

  return {
    binary: 'npm',
    args,
    agent: mappedAgent,
    command: ['npx', '--yes', SKILLS_CLI_VERSION, 'add', sourceUrl, '--skill', skill.name, '--agent', mappedAgent, '-y']
      .map(shellQuote)
      .join(' '),
  };
}

function getGitHubTreePath(sourceUrl, source) {
  if (!sourceUrl || !source) return null;

  try {
    const url = new URL(sourceUrl);
    if (url.hostname !== 'github.com') return null;

    const parts = url.pathname.split('/').filter(Boolean);
    const [owner, repo] = String(source).split('/');
    if (!owner || !repo) return null;
    if (parts[0] !== owner || parts[1] !== repo) return null;

    if (parts.length === 2) return '';
    if (parts.length < 5) return null;
    if (parts[2] !== 'tree' && parts[2] !== 'blob') return null;

    return parts.slice(4).join('/');
  } catch {
    return null;
  }
}

function getGitHubInstallSource(skill) {
  if (!skill || !skill.source || !skill.sourceUrl) return null;
  if (skill.source === 'MoizIbnYousaf/Ai-Agent-Skills') return null;
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(skill.source)) return null;

  const upstreamPath = getGitHubTreePath(skill.sourceUrl, skill.source);
  if (upstreamPath === null) return null;

  const normalizedPath = upstreamPath.startsWith('skills/')
    ? upstreamPath.slice('skills/'.length)
    : upstreamPath;

  if (!normalizedPath) return skill.source;
  return `${skill.source}/${normalizedPath}`;
}

function getGitHubInstallSpec(skill, agent) {
  const source = getGitHubInstallSource(skill);
  if (!source) return null;

  return {
    source,
    command: `npx ai-agent-skills install ${shellQuote(source)} --agent ${shellQuote(agent)}`,
  };
}

function buildCatalog() {
  const data = readSkillsJson();
  const collectionPlacement = buildCollectionPlacementMap(Array.isArray(data.collections) ? data.collections : []);
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
      repoUrl: `https://github.com/${source}`,
      sourceTitle: sourceTitle(source),
      collections: collectionTitlesBySkill.get(skill.name) || [],
      isShelved: collectionPlacement.has(skill.name),
      curationScore: getSkillCurationScore(collectionPlacement, skill),
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
        (collectionTitlesBySkill.get(skill.name) || []).join(' '),
        skill.whyHere,
      ]),
    };
  });

  const skillLookup = new Map(skills.map((skill) => [skill.name, skill]));

  const collections = [...collectionLookup.values()]
    .map((collection) => {
      const collectionSkills = (collection.skills || [])
        .map((skillName) => skillLookup.get(skillName))
        .filter(Boolean);

      const workAreaTitles = [...new Set(collectionSkills.map((skill) => skill.workAreaTitle))];
      const sourceTitles = [...new Set(collectionSkills.map((skill) => skill.sourceTitle))];
      const verifiedCount = collectionSkills.filter((skill) => skill.trust === 'verified').length;
      const authoredCount = collectionSkills.filter((skill) => skill.origin === 'authored').length;

      return {
        id: collection.id,
        title: collection.title,
        description: collection.description || '',
        skills: collectionSkills,
        skillCount: collectionSkills.length,
        verifiedCount,
        authoredCount,
        workAreaTitles,
        sourceTitles,
        searchText: buildSearchText([
          collection.id,
          collection.title,
          collection.description,
          workAreaTitles.join(' '),
          sourceTitles.join(' '),
          collectionSkills.map((skill) => `${skill.title} ${skill.description}`).join(' '),
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
        skills: sortSkillsByCuration(data, branch.skills),
        skillCount: branch.skills.length,
        repoCount: branch.repoTitles.size,
        repoTitles: [...branch.repoTitles].sort(),
      }))
      .sort((left, right) => {
        const scoreDiff = right.skillCount - left.skillCount;
        if (scoreDiff !== 0) return scoreDiff;
        return left.title.localeCompare(right.title);
      });

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
      skills: sortSkillsByCuration(data, sourceSkills),
      branches: [...branchMap.values()]
        .map((branch) => ({
          ...branch,
          skills: sortSkillsByCuration(data, branch.skills),
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
    skills: sortSkillsByCuration(data, skills),
    collections,
    areas,
    sources,
  };
}

function getInstallCommand(skill, scope) {
  const scopeFlag = scope === 'project' ? ' -p' : '';
  return `npx ai-agent-skills install ${shellQuote(skill.name)}${scopeFlag}`;
}

function getInstallCommandForAgent(skill, agent) {
  return `npx ai-agent-skills install ${shellQuote(skill.name)} --agent ${shellQuote(agent)}`;
}

module.exports = {
  buildCatalog,
  compareSkillsByCurationData,
  getGitHubInstallSpec,
  getInstallCommand,
  getInstallCommandForAgent,
  getSiblingRecommendations,
  getSkillsAgent,
  getSkillsInstallSpec,
  humanizeSlug,
  sortSkillsByCuration,
};
