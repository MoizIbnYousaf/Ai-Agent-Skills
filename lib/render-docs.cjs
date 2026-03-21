const fs = require('fs');

const {
  README_PATH,
  WORK_AREAS_PATH,
} = require('./paths.cjs');
const { normalizeCatalogData } = require('./catalog-data.cjs');

const README_MARKERS = {
  stats: ['<!-- GENERATED:library-stats:start -->', '<!-- GENERATED:library-stats:end -->'],
  shelves: ['<!-- GENERATED:shelf-table:start -->', '<!-- GENERATED:shelf-table:end -->'],
  collections: ['<!-- GENERATED:collection-table:start -->', '<!-- GENERATED:collection-table:end -->'],
  sources: ['<!-- GENERATED:source-table:start -->', '<!-- GENERATED:source-table:end -->'],
};

function formatTable(headers, rows) {
  const headerLine = `| ${headers.join(' | ')} |`;
  const dividerLine = `| ${headers.map(() => '---').join(' | ')} |`;
  const bodyLines = rows.map((row) => `| ${row.join(' | ')} |`);
  return [headerLine, dividerLine, ...bodyLines].join('\n');
}

function escapeCell(value) {
  return String(value || '').replace(/\|/g, '\\|');
}

function sortSources(skills) {
  return [...new Set(skills.map((skill) => skill.source))]
    .map((source) => ({
      source,
      count: skills.filter((skill) => skill.source === source).length,
    }))
    .sort((left, right) => right.count - left.count || left.source.localeCompare(right.source));
}

function buildLibraryStatsSection(data) {
  const total = data.skills.length;
  const house = data.skills.filter((skill) => skill.tier === 'house').length;
  const upstream = total - house;
  return [
    `- ${total} skills total`,
    `- ${data.workAreas.length} shelves`,
    `- ${house} house copies`,
    `- ${upstream} cataloged upstream`,
  ].join('\n');
}

function buildShelfTableSection(data) {
  const rows = (data.workAreas || []).map((area) => {
    const count = data.skills.filter((skill) => skill.workArea === area.id).length;
    return [escapeCell(area.title), String(count), escapeCell(area.description)];
  });
  return formatTable(['Shelf', 'Skills', 'What it covers'], rows);
}

function buildCollectionTableSection(data) {
  const lookup = new Map((data.skills || []).map((skill) => [skill.name, skill]));
  const rows = (data.collections || []).map((collection) => {
    const startHere = (collection.skills || [])
      .slice(0, 3)
      .map((name) => `\`${lookup.get(name)?.name || name}\``)
      .join(', ');
    return [
      `\`${escapeCell(collection.id)}\``,
      escapeCell(collection.description || ''),
      startHere || 'n/a',
    ];
  });
  return formatTable(['Collection', 'Why it exists', 'Start here'], rows);
}

function buildSourceTableSection(data) {
  const rows = sortSources(data.skills).map((entry) => [
    `\`${escapeCell(entry.source)}\``,
    String(entry.count),
  ]);
  return formatTable(['Source repo', 'Skills'], rows);
}

function replaceSection(content, markers, replacement) {
  const [start, end] = markers;
  const pattern = new RegExp(`${escapeRegex(start)}[\\s\\S]*?${escapeRegex(end)}`);
  if (!pattern.test(content)) {
    throw new Error(`Missing generated doc markers: ${start}`);
  }
  return content.replace(pattern, `${start}\n${replacement}\n${end}`);
}

function renderReadme(data, source = fs.readFileSync(README_PATH, 'utf8')) {
  let content = source;
  content = replaceSection(content, README_MARKERS.stats, buildLibraryStatsSection(data));
  content = replaceSection(content, README_MARKERS.shelves, buildShelfTableSection(data));
  content = replaceSection(content, README_MARKERS.collections, buildCollectionTableSection(data));
  content = replaceSection(content, README_MARKERS.sources, buildSourceTableSection(data));
  return ensureTrailingNewline(content);
}

function renderWorkAreas(data) {
  const sections = [];

  for (const area of data.workAreas || []) {
    const areaSkills = data.skills.filter((skill) => skill.workArea === area.id);
    const branchMap = new Map();

    for (const skill of areaSkills) {
      if (!branchMap.has(skill.branch)) {
        branchMap.set(skill.branch, []);
      }
      branchMap.get(skill.branch).push(skill);
    }

    const rows = [...branchMap.entries()]
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([branch, skills]) => [
        escapeCell(branch),
        skills.map((skill) => `\`${skill.name}\``).join(', '),
        escapeCell([...new Set(skills.map((skill) => skill.author || skill.source))].join(', ')),
      ]);

    sections.push(`## ${area.title}\n`);
    sections.push(`${areaSkills.length} skills. ${area.description}\n`);
    sections.push(formatTable(['Branch', 'Skills', 'Source'], rows));
    sections.push('');
  }

  return ensureTrailingNewline([
    '# Work Areas',
    '',
    'This is the shelf map for the library.',
    '',
    'The repo folders stay flat under `skills/<name>/` for house copies. The catalog carries the real organization.',
    '',
    sections.join('\n'),
  ].join('\n'));
}

function renderGeneratedDocs(rawData, readmeSource) {
  const data = normalizeCatalogData(rawData);
  return {
    readme: renderReadme(data, readmeSource),
    workAreas: renderWorkAreas(data),
  };
}

function generatedDocsAreInSync(rawData, options = {}) {
  const readmeSource = options.readmeSource || fs.readFileSync(README_PATH, 'utf8');
  const workAreasSource = options.workAreasSource || fs.readFileSync(WORK_AREAS_PATH, 'utf8');
  const rendered = renderGeneratedDocs(rawData, readmeSource);
  return {
    readmeMatches: rendered.readme === ensureTrailingNewline(readmeSource),
    workAreasMatches: rendered.workAreas === ensureTrailingNewline(workAreasSource),
    rendered,
  };
}

function writeGeneratedDocs(rawData) {
  const readmeSource = fs.readFileSync(README_PATH, 'utf8');
  const rendered = renderGeneratedDocs(rawData, readmeSource);
  fs.writeFileSync(README_PATH, rendered.readme);
  fs.writeFileSync(WORK_AREAS_PATH, rendered.workAreas);
  return rendered;
}

function ensureTrailingNewline(value) {
  const text = String(value || '');
  return text.endsWith('\n') ? text : `${text}\n`;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  README_MARKERS,
  buildCollectionTableSection,
  buildLibraryStatsSection,
  buildShelfTableSection,
  buildSourceTableSection,
  generatedDocsAreInSync,
  renderGeneratedDocs,
  renderReadme,
  renderWorkAreas,
  writeGeneratedDocs,
};
