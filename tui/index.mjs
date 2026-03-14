import React, {useMemo, useState} from 'react';
import {createRequire} from 'module';
import {spawnSync} from 'child_process';
import {Box, Text, render, useApp, useInput, useStdout} from 'ink';
import TextInput from 'ink-text-input';
import htm from 'htm';

const require = createRequire(import.meta.url);
const {buildCatalog, getSkillsInstallSpec} = require('./catalog.cjs');

const html = htm.bind(React.createElement);

const COLORS = {
  accent: 'yellowBright',
  accentSoft: 'yellow',
  text: 'white',
  muted: 'gray',
  border: 'gray',
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function fitText(text, maxLength) {
  const value = String(text || '');
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}…`;
}

function shellQuote(value) {
  const stringValue = String(value);
  if (/^[a-zA-Z0-9._:/=@-]+$/.test(stringValue)) {
    return stringValue;
  }
  return `'${stringValue.replace(/'/g, `'\\''`)}'`;
}

function commandLabel(parts) {
  return parts.map(shellQuote).join(' ');
}

function stripFrontmatter(markdown) {
  if (!markdown.startsWith('---\n')) return markdown;
  const secondFence = markdown.indexOf('\n---\n', 4);
  if (secondFence === -1) return markdown;
  return markdown.slice(secondFence + 5).trim();
}

function excerpt(markdown, lines = 12) {
  return stripFrontmatter(markdown)
    .split('\n')
    .slice(0, lines)
    .join('\n')
    .trim();
}

function getColumnsPerRow(columns, mode = 'default') {
  if (mode === 'skills') {
    if (columns >= 150) return 3;
    if (columns >= 108) return 2;
    return 1;
  }

  if (columns >= 150) return 4;
  if (columns >= 108) return 3;
  if (columns >= 72) return 2;
  return 1;
}

function moveGrid(index, key, itemCount, columnsPerRow) {
  if (itemCount === 0) return 0;
  if (key.upArrow) return clamp(index - columnsPerRow, 0, itemCount - 1);
  if (key.downArrow) return clamp(index + columnsPerRow, 0, itemCount - 1);
  if (key.leftArrow) return clamp(index - 1, 0, itemCount - 1);
  if (key.rightArrow) return clamp(index + 1, 0, itemCount - 1);
  return index;
}

function getViewportState({items, selectedIndex, columns, rows, mode = 'default', reservedRows = 12}) {
  const columnsPerRow = getColumnsPerRow(columns, mode);
  const gutter = columnsPerRow > 1 ? columnsPerRow - 1 : 0;
  const tileWidth = Math.max(
    mode === 'skills' ? 32 : 28,
    Math.floor((columns - gutter * 2) / columnsPerRow)
  );
  const tileHeight = mode === 'skills' ? 11 : 12;
  const usableRows = Math.max(tileHeight, rows - reservedRows);
  const visibleRows = Math.max(1, Math.floor(usableRows / tileHeight));
  const totalRows = Math.max(1, Math.ceil(items.length / columnsPerRow));
  const selectedRow = Math.floor(selectedIndex / columnsPerRow);
  const startRow = clamp(
    selectedRow - Math.floor(visibleRows / 2),
    0,
    Math.max(0, totalRows - visibleRows)
  );
  const endRow = Math.min(totalRows, startRow + visibleRows);
  const startIndex = startRow * columnsPerRow;
  const endIndex = Math.min(items.length, endRow * columnsPerRow);

  return {
    columnsPerRow,
    tileWidth,
    visibleRows,
    totalRows,
    startRow,
    endRow,
    visibleItems: items.slice(startIndex, endIndex),
    visibleIndex: clamp(selectedIndex - startIndex, 0, Math.max(0, endIndex - startIndex - 1)),
    hiddenAbove: startIndex,
    hiddenBelow: Math.max(0, items.length - endIndex),
  };
}

function Header({breadcrumbs, title, subtitle, hint}) {
  return html`
    <${Box} flexDirection="column" marginBottom=${1}>
      <${Text} color=${COLORS.accentSoft}>AI Agent Skills<//>
      ${breadcrumbs && breadcrumbs.length > 0
        ? html`<${Text} color=${COLORS.muted}>${breadcrumbs.join(' › ')}<//>`
        : null}
      <${Text} bold color=${COLORS.text}>${title}<//>
      ${subtitle ? html`<${Text} color=${COLORS.muted}>${subtitle}<//>` : null}
      ${hint ? html`<${Text} color=${COLORS.muted}>${hint}<//>` : null}
    <//>
  `;
}

function ModeTabs({rootMode}) {
  return html`
    <${Box} marginBottom=${1}>
      ${[
        {id: 'areas', label: 'Work Areas (w)'},
        {id: 'sources', label: 'Source Repos (r)'},
      ].map((tab) => {
        const selected = tab.id === rootMode;
        return html`
          <${Box}
            key=${tab.id}
            borderStyle="round"
            borderColor=${selected ? COLORS.accent : COLORS.border}
            paddingX=${1}
            marginRight=${1}
          >
            <${Text} color=${selected ? COLORS.text : COLORS.muted}>${tab.label}<//>
          <//>
        `;
      })}
    <//>
  `;
}

function MetricLine({items}) {
  return html`
    <${Box}>
      ${items.map((item, index) => html`
        <${Box} key=${`${item}-${index}`} marginRight=${index < items.length - 1 ? 2 : 0}>
          <${Text} color=${COLORS.muted}>${item}<//>
        <//>
      `)}
    <//>
  `;
}

function ChipRow({items, selected}) {
  if (!items || items.length === 0) return null;

  return html`
    <${Box} flexWrap="wrap" marginTop=${1}>
      ${items.map((item) => html`
        <${Box}
          key=${item}
          borderStyle="round"
          borderColor=${selected ? COLORS.accentSoft : COLORS.border}
          paddingX=${1}
          marginRight=${1}
          marginBottom=${1}
        >
          <${Text} color=${selected ? COLORS.text : COLORS.muted}>${item}<//>
        <//>
      `)}
    <//>
  `;
}

function AtlasTile({
  width,
  minHeight = 9,
  selected,
  title,
  count,
  description,
  chips,
  footerLeft,
  footerRight,
  sampleLines,
}) {
  return html`
    <${Box}
      width=${width}
      minHeight=${minHeight}
      marginRight=${1}
      marginBottom=${1}
      borderStyle="round"
      borderColor=${selected ? COLORS.accent : COLORS.border}
      paddingX=${1}
      paddingY=${0}
      flexDirection="column"
    >
      <${Box} justifyContent="space-between">
        <${Text} bold=${selected} color=${selected ? COLORS.text : COLORS.muted}>
          ${title}
        <//>
        ${count ? html`<${Text} color=${selected ? COLORS.accent : COLORS.muted}>${count}<//>` : null}
      <//>

      ${description
        ? html`
            <${Box} marginTop=${1}>
              <${Text} color=${selected ? COLORS.text : COLORS.muted}>
                ${selected ? description : fitText(description, Math.max(20, width - 8))}
              <//>
            <//>
          `
        : null}

      ${chips && chips.length > 0 ? html`<${ChipRow} items=${chips} selected=${selected} />` : null}

      ${sampleLines && sampleLines.length > 0
        ? html`
            <${Box} marginTop=${1} flexDirection="column">
              ${sampleLines.map((line, index) => html`
                <${Text} key=${`${line}-${index}`} color=${selected ? COLORS.text : COLORS.muted}>
                  ${selected ? '• ' : ''}${line}
                <//>
              `)}
            <//>
          `
        : null}

      <${Box} marginTop="auto" justifyContent="space-between">
        <${Text} color=${COLORS.muted}>${footerLeft || ''}<//>
        <${Text} color=${selected ? COLORS.accent : COLORS.muted}>${footerRight || ''}<//>
      <//>
    <//>
  `;
}

function AtlasGrid({items, selectedIndex, columns, rows, mode = 'default', reservedRows = 12}) {
  const viewport = getViewportState({
    items,
    selectedIndex,
    columns,
    rows,
    mode,
    reservedRows,
  });

  return html`
    <${Box} flexDirection="column">
      ${viewport.hiddenAbove > 0
        ? html`
            <${Box} marginBottom=${1}>
              <${Text} color=${COLORS.muted}>↑ ${viewport.hiddenAbove} more above<//>
            <//>
          `
        : null}
      <${Box} flexWrap="wrap">
        ${viewport.visibleItems.map((item, index) => html`
          <${AtlasTile}
            key=${item.id}
            width=${viewport.tileWidth}
            minHeight=${item.minHeight || (mode === 'skills' ? 10 : 11)}
            selected=${index === viewport.visibleIndex}
            title=${item.title}
            count=${item.count}
            description=${item.description}
            chips=${item.chips}
            footerLeft=${item.footerLeft}
            footerRight=${item.footerRight}
            sampleLines=${item.sampleLines}
          />
        `)}
      <//>
      ${viewport.hiddenBelow > 0
        ? html`
            <${Box}>
              <${Text} color=${COLORS.muted}>↓ ${viewport.hiddenBelow} more below<//>
            <//>
          `
        : null}
    <//>
  `;
}

function SearchOverlay({query, setQuery, results, selectedIndex}) {
  return html`
    <${Box} borderStyle="round" borderColor=${COLORS.accent} flexDirection="column" paddingX=${1} paddingY=${0} marginBottom=${1}>
      <${Text} color=${COLORS.accent}>Search the atlas<//>
      <${Box} marginTop=${1}>
        <${Text} color=${COLORS.muted}>/ <//>
        <${TextInput} value=${query} onChange=${setQuery} placeholder="skills, work areas, branches, repos" />
      <//>
      <${Box} marginTop=${1} flexDirection="column">
        ${results.length === 0
          ? html`<${Text} color=${COLORS.muted}>No matches yet.<//>`
          : results.slice(0, 8).map((result, index) => html`
              <${Box} key=${result.name} marginBottom=${1}>
                <${Text} color=${index === selectedIndex ? COLORS.accent : COLORS.muted}>
                  ${index === selectedIndex ? '› ' : '  '}${result.title} · ${result.workAreaTitle} / ${result.branchTitle} · ${result.sourceTitle}
                <//>
              <//>
            `)}
      <//>
      <${Box} marginTop=${1}>
        <${Text} color=${COLORS.muted}>Enter opens a skill · Esc closes search<//>
      <//>
    <//>
  `;
}

function Inspector({title, eyebrow, lines, command, footer}) {
  return html`
    <${Box} borderStyle="round" borderColor=${COLORS.border} flexDirection="column" paddingX=${1} paddingY=${0} marginTop=${1}>
      ${eyebrow ? html`<${Text} color=${COLORS.accentSoft}>${eyebrow}<//>` : null}
      <${Text} bold color=${COLORS.text}>${title}<//>
      <${Box} marginTop=${1} flexDirection="column">
        ${lines.map((line, index) => html`<${Text} key=${index} color=${COLORS.muted}>${line}<//>`)}
      <//>
      ${command
        ? html`
            <${Box} marginTop=${1}>
              <${Text} color=${COLORS.text}>${command}<//>
            <//>
          `
        : null}
      ${footer ? html`<${Box} marginTop=${1}><${Text} color=${COLORS.muted}>${footer}<//><//>` : null}
    <//>
  `;
}

function SkillScreen({skill, previewMode, agent, columns}) {
  const previewText = excerpt(skill.markdown, 12);
  const installCommand = `npx ai-agent-skills install ${skill.name} --agent ${agent}`;
  const detailWidth = clamp(columns - 2, 46, 96);

  return html`
    <${Box} flexDirection="column">
      <${AtlasTile}
        width=${detailWidth}
        minHeight=${10}
        selected=${true}
        title=${skill.title}
        count=${skill.trust}
        description=${skill.description}
        chips=${[skill.sourceTitle, `${skill.workAreaTitle} / ${skill.branchTitle}`]}
        footerLeft=${`sync ${skill.syncMode}${skill.lastVerified ? ` · verified ${skill.lastVerified}` : ''}`}
        footerRight="i install"
        sampleLines=${[skill.whyHere]}
      />
      <${Inspector}
        title=${previewMode ? 'Preview' : 'Install path'}
        eyebrow=${previewMode ? 'Bundled SKILL.md excerpt' : 'Vendored install command'}
        lines=${previewMode ? previewText.split('\n') : [`Source repo: ${skill.source}`, `Source URL: ${skill.sourceUrl}`, `Origin: ${skill.origin}`]}
        command=${previewMode ? null : installCommand}
        footer=${previewMode ? 'Press p to close preview · i for install choices · o to open upstream' : 'Press p to preview · i for install choices · o to open upstream'}
      />
    <//>
  `;
}

function InstallChooser({skill, agent, selectedIndex, columns}) {
  const skillsSpec = getSkillsInstallSpec(skill, agent);
  const chooserWidth = clamp(columns - 2, 46, 104);
  const options = [
    {
      id: 'local',
      label: 'Install with ai-agent-skills',
      description: 'Use the vendored library copy; stable and deterministic.',
      command: `npx ai-agent-skills install ${skill.name} --agent ${agent}`,
    },
    ...(skillsSpec
      ? [{
          id: 'skills',
          label: 'Install with skills.sh',
          description: 'Use the official open skills CLI against the upstream mirror.',
          command: skillsSpec.command,
        }]
      : []),
    {
      id: 'open',
      label: 'Open upstream',
      description: 'Open the upstream source in the browser.',
      command: skill.sourceUrl,
    },
    {
      id: 'cancel',
      label: 'Cancel',
      description: 'Close the chooser and stay on this skill.',
      command: '',
    },
  ];

  const selected = options[selectedIndex] || options[0];

  return html`
    <${Box}
      width=${chooserWidth}
      marginTop=${1}
      borderStyle="round"
      borderColor=${COLORS.accent}
      flexDirection="column"
      paddingX=${1}
      paddingY=${0}
    >
      <${Text} color=${COLORS.accent}>Install ${skill.title}<//>
      <${Box} marginTop=${1} flexDirection="column">
        ${options.map((option, index) => html`
          <${Box}
            key=${option.id}
            borderStyle="round"
            borderColor=${index === selectedIndex ? COLORS.accent : COLORS.border}
            paddingX=${1}
            marginBottom=${1}
            flexDirection="column"
          >
            <${Text} color=${index === selectedIndex ? COLORS.text : COLORS.muted}>
              ${index === selectedIndex ? '› ' : '  '}${option.label}
            <//>
            <${Text} color=${COLORS.muted}>${option.description}<//>
          <//>
        `)}
      <//>
      ${selected.command
        ? html`
            <${Box} marginTop=${1}>
              <${Text} color=${COLORS.muted}>${selected.command}<//>
            <//>
          `
        : null}
      <${Box} marginTop=${1}>
        <${Text} color=${COLORS.muted}>Enter chooses · Esc closes the chooser<//>
      <//>
    <//>
  `;
}

function buildBreadcrumbs(rootMode, stack, catalog) {
  const trail = ['Atlas', rootMode === 'areas' ? 'Work Areas' : 'Source Repos'];

  for (const entry of stack.slice(1)) {
    if (entry.type === 'area') {
      const area = catalog.areas.find((candidate) => candidate.id === entry.areaId);
      if (area) trail.push(area.title);
      continue;
    }

    if (entry.type === 'branch') {
      const area = catalog.areas.find((candidate) => candidate.id === entry.areaId);
      const branch = area?.branches.find((candidate) => candidate.id === entry.branchId);
      if (area && trail[trail.length - 1] !== area.title) {
        trail.push(area.title);
      }
      if (branch) trail.push(branch.title);
      continue;
    }

    if (entry.type === 'source') {
      const source = catalog.sources.find((candidate) => candidate.slug === entry.sourceSlug);
      if (source) trail.push(source.title);
      continue;
    }

    if (entry.type === 'sourceBranch') {
      const source = catalog.sources.find((candidate) => candidate.slug === entry.sourceSlug);
      const branch = source?.branches.find((candidate) => candidate.id === entry.branchId);
      if (source && trail[trail.length - 1] !== source.title) {
        trail.push(source.title);
      }
      if (branch) trail.push(branch.title);
      continue;
    }

    if (entry.type === 'skill') {
      const skill = catalog.skills.find((candidate) => candidate.name === entry.skillName);
      if (skill) trail.push(skill.title);
    }
  }

  return trail.filter((value, index) => index === 0 || value !== trail[index - 1]);
}

function getHomeItems(catalog) {
  return catalog.areas.map((area) => ({
    id: area.id,
    title: area.title,
    count: `${area.skillCount} skills`,
    description: area.description,
    chips: area.branches.slice(0, 2).map((branch) => branch.title),
    footerLeft: `${area.repoCount} repos · ${area.branches.length} branches`,
    footerRight: 'Enter to open',
  }));
}

function getSourceItems(catalog) {
  return catalog.sources.map((source) => ({
    id: source.slug,
    title: source.title,
    count: `${source.skillCount} skills`,
    description: source.slug,
    chips: source.branches.slice(0, 2).map((branch) => `${branch.areaTitle} / ${branch.title}`),
    footerLeft: `${source.branchCount} branches · ${source.areaCount} areas`,
    footerRight: 'Enter to open',
  }));
}

function getAreaItems(area) {
  return area.branches.map((branch) => ({
    id: branch.id,
    title: branch.title,
    count: `${branch.skillCount} skills`,
    description: `This lane covers ${branch.repoCount} source repos inside ${area.title.toLowerCase()}.`,
    chips: branch.repoTitles.slice(0, 2),
    sampleLines: branch.skills.slice(0, 2).map((skill) => `${skill.title} · ${skill.sourceTitle}`),
    footerLeft: `${branch.repoCount} repos`,
    footerRight: 'Enter to open',
  }));
}

function getSourceBranchItems(source) {
  return source.branches.map((branch) => ({
    id: branch.id,
    title: `${branch.areaTitle} / ${branch.title}`,
    count: `${branch.skillCount} skills`,
    description: `${source.title} contributes this branch into the atlas.`,
    sampleLines: branch.skills.slice(0, 2).map((skill) => skill.title),
    footerLeft: `${branch.skillCount} skills`,
    footerRight: 'Enter to open',
  }));
}

function getSkillItems(skills) {
  return skills.map((skill) => ({
    id: skill.name,
    title: skill.title,
    count: skill.trust,
    description: skill.description,
    chips: [skill.sourceTitle, skill.syncMode],
    footerLeft: `${skill.workAreaTitle} / ${skill.branchTitle}`,
    footerRight: 'Enter to inspect',
  }));
}

function App({catalog, agent, onExit}) {
  const {exit} = useApp();
  const {stdout} = useStdout();
  const columns = stdout?.columns || process.stdout.columns || 120;
  const rows = stdout?.rows || process.stdout.rows || 40;

  const [rootMode, setRootMode] = useState('areas');
  const [stack, setStack] = useState([{type: 'home'}]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searchMode, setSearchMode] = useState(false);
  const [query, setQuery] = useState('');
  const [previewMode, setPreviewMode] = useState(false);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [chooserIndex, setChooserIndex] = useState(0);

  const current = stack[stack.length - 1];

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return catalog.skills
      .filter((skill) => skill.searchText.includes(q))
      .sort((left, right) => {
        const leftScore = left.title.toLowerCase().indexOf(q);
        const rightScore = right.title.toLowerCase().indexOf(q);
        return leftScore - rightScore || left.title.localeCompare(right.title);
      });
  }, [catalog.skills, query]);

  const currentArea = current.type === 'area' || current.type === 'branch'
    ? catalog.areas.find((area) => area.id === current.areaId)
    : null;
  const currentBranch = current.type === 'branch' && currentArea
    ? currentArea.branches.find((branch) => branch.id === current.branchId)
    : null;
  const currentSource = current.type === 'source' || current.type === 'sourceBranch'
    ? catalog.sources.find((source) => source.slug === current.sourceSlug)
    : null;
  const currentSourceBranch = current.type === 'sourceBranch' && currentSource
    ? currentSource.branches.find((branch) => branch.id === current.branchId)
    : null;
  const currentSkill = current.type === 'skill'
    ? catalog.skills.find((skill) => skill.name === current.skillName)
    : null;

  const breadcrumbs = buildBreadcrumbs(rootMode, stack, catalog);
  const currentSkillsSpec = currentSkill ? getSkillsInstallSpec(currentSkill, agent) : null;

  const installOptions = currentSkill
    ? [
        {
          id: 'local',
          action: {
            type: 'install',
            skillName: currentSkill.name,
          },
        },
        ...(currentSkillsSpec
          ? [{
              id: 'skills',
              action: {
                type: 'skills-install',
                skillName: currentSkill.name,
                command: currentSkillsSpec.command,
                binary: currentSkillsSpec.binary,
                args: currentSkillsSpec.args,
              },
            }]
          : []),
        {id: 'open', action: {type: 'open-upstream', url: currentSkill.sourceUrl}},
        {id: 'cancel', action: null},
      ]
    : [];

  useInput((input, key) => {
    if (chooserOpen && currentSkill) {
      if (input === 'q') {
        onExit(null);
        exit();
        return;
      }

      if (key.escape || input === 'b') {
        setChooserOpen(false);
        setChooserIndex(0);
        return;
      }

      if (key.upArrow || input === 'k') {
        setChooserIndex((value) => clamp(value - 1, 0, installOptions.length - 1));
        return;
      }

      if (key.downArrow || input === 'j') {
        setChooserIndex((value) => clamp(value + 1, 0, installOptions.length - 1));
        return;
      }

      if (key.return) {
        const option = installOptions[chooserIndex];
        if (!option || option.id === 'cancel') {
          setChooserOpen(false);
          setChooserIndex(0);
          return;
        }

        if (option.id === 'open') {
          spawnSync('open', [currentSkill.sourceUrl], {stdio: 'ignore'});
          setChooserOpen(false);
          setChooserIndex(0);
          return;
        }

        onExit(option.action);
        exit();
      }
      return;
    }

    if (searchMode) {
      if (key.escape) {
        setSearchMode(false);
        setQuery('');
        setSelectedIndex(0);
        return;
      }
      if (key.upArrow) {
        setSelectedIndex((value) => clamp(value - 1, 0, Math.max(0, searchResults.length - 1)));
        return;
      }
      if (key.downArrow) {
        setSelectedIndex((value) => clamp(value + 1, 0, Math.max(0, searchResults.length - 1)));
        return;
      }
      if (key.return && searchResults[selectedIndex]) {
        setStack((currentStack) => [...currentStack, {type: 'skill', skillName: searchResults[selectedIndex].name}]);
        setSearchMode(false);
        setQuery('');
        setSelectedIndex(0);
        setPreviewMode(false);
      }
      return;
    }

    if (input === 'q') {
      onExit(null);
      exit();
      return;
    }

    if (input === '/') {
      setSearchMode(true);
      setQuery('');
      setSelectedIndex(0);
      return;
    }

    if ((input === 'b' || key.escape) && stack.length > 1) {
      setStack((currentStack) => currentStack.slice(0, -1));
      setSelectedIndex(0);
      setPreviewMode(false);
      setChooserOpen(false);
      return;
    }

    if (current.type === 'skill' && currentSkill) {
      if (input === 'p') {
        setPreviewMode((value) => !value);
        return;
      }
      if (input === 'i') {
        setChooserOpen(true);
        setChooserIndex(0);
        return;
      }
      if (input === 'o') {
        spawnSync('open', [currentSkill.sourceUrl], {stdio: 'ignore'});
        return;
      }
    }

    if (current.type === 'home') {
      const itemCount = rootMode === 'areas' ? catalog.areas.length : catalog.sources.length;
      const columnsPerRow = getColumnsPerRow(columns);

      if (input === 'w') {
        setRootMode('areas');
        setSelectedIndex(0);
        return;
      }
      if (input === 'r') {
        setRootMode('sources');
        setSelectedIndex(0);
        return;
      }

      if (key.leftArrow || key.rightArrow || key.upArrow || key.downArrow) {
        setSelectedIndex((value) => moveGrid(value, key, itemCount, columnsPerRow));
        return;
      }

      if (key.return) {
        if (rootMode === 'areas' && catalog.areas[selectedIndex]) {
          setStack((currentStack) => [...currentStack, {type: 'area', areaId: catalog.areas[selectedIndex].id}]);
        } else if (rootMode === 'sources' && catalog.sources[selectedIndex]) {
          setStack((currentStack) => [...currentStack, {type: 'source', sourceSlug: catalog.sources[selectedIndex].slug}]);
        }
        setSelectedIndex(0);
      }
      return;
    }

    const currentItems = (() => {
      if (current.type === 'area' && currentArea) return currentArea.branches;
      if (current.type === 'source' && currentSource) return currentSource.branches;
      if (current.type === 'branch' && currentBranch) return currentBranch.skills;
      if (current.type === 'sourceBranch' && currentSourceBranch) return currentSourceBranch.skills;
      return [];
    })();

    const gridMode = current.type === 'branch' || current.type === 'sourceBranch' ? 'skills' : 'default';
    const columnsPerRow = getColumnsPerRow(columns, gridMode);

    if (key.leftArrow || key.rightArrow || key.upArrow || key.downArrow) {
      setSelectedIndex((value) => moveGrid(value, key, currentItems.length, columnsPerRow));
      return;
    }

    if (!key.return) return;

    if (current.type === 'area' && currentArea && currentArea.branches[selectedIndex]) {
      setStack((currentStack) => [...currentStack, {type: 'branch', areaId: currentArea.id, branchId: currentArea.branches[selectedIndex].id}]);
      setSelectedIndex(0);
      return;
    }

    if (current.type === 'source' && currentSource && currentSource.branches[selectedIndex]) {
      setStack((currentStack) => [...currentStack, {type: 'sourceBranch', sourceSlug: currentSource.slug, branchId: currentSource.branches[selectedIndex].id}]);
      setSelectedIndex(0);
      return;
    }

    if (current.type === 'branch' && currentBranch && currentBranch.skills[selectedIndex]) {
      setStack((currentStack) => [...currentStack, {type: 'skill', skillName: currentBranch.skills[selectedIndex].name}]);
      setSelectedIndex(0);
      setPreviewMode(false);
      return;
    }

    if (current.type === 'sourceBranch' && currentSourceBranch && currentSourceBranch.skills[selectedIndex]) {
      setStack((currentStack) => [...currentStack, {type: 'skill', skillName: currentSourceBranch.skills[selectedIndex].name}]);
      setSelectedIndex(0);
      setPreviewMode(false);
    }
  });

  let body = null;

  if (searchMode) {
    body = html`
      <${Box} flexDirection="column">
        <${Header}
          breadcrumbs=${breadcrumbs}
          title="Search the library"
          subtitle="Find skills by work area, branch, source repo, or title."
          hint="Enter opens a skill · Esc closes search"
        />
        <${SearchOverlay}
          query=${query}
          setQuery=${setQuery}
          results=${searchResults}
          selectedIndex=${selectedIndex}
        />
      <//>
    `;
  } else if (current.type === 'home') {
    body = html`
      <${Box} flexDirection="column">
        <${Header}
          breadcrumbs=${breadcrumbs}
          title="Move through the atlas"
          subtitle=${rootMode === 'areas'
            ? 'Start with the kind of work, then move into branches and skills.'
            : 'Browse trusted source repos and the lanes they feed into the library.'}
          hint="Arrow keys move · Enter drills in · / searches"
        />
        <${ModeTabs} rootMode=${rootMode} />
        <${AtlasGrid}
          items=${rootMode === 'areas' ? getHomeItems(catalog) : getSourceItems(catalog)}
          selectedIndex=${selectedIndex}
          columns=${columns}
          rows=${rows}
          reservedRows=${11}
        />
      <//>
    `;
  } else if (current.type === 'area' && currentArea) {
    body = html`
      <${Box} flexDirection="column">
        <${Header}
          breadcrumbs=${breadcrumbs}
          title=${currentArea.title}
          subtitle=${currentArea.description}
          hint="Arrow keys move across lanes · Enter opens a branch · b goes back"
        />
        <${MetricLine} items=${[`${currentArea.skillCount} skills`, `${currentArea.branches.length} branches`, `${currentArea.repoCount} repos`]} />
        <${Box} marginTop=${1}>
          <${AtlasGrid}
            items=${getAreaItems(currentArea)}
            selectedIndex=${selectedIndex}
            columns=${columns}
            rows=${rows}
            reservedRows=${10}
          />
        <//>
      <//>
    `;
  } else if (current.type === 'source' && currentSource) {
    body = html`
      <${Box} flexDirection="column">
        <${Header}
          breadcrumbs=${breadcrumbs}
          title=${currentSource.title}
          subtitle="A source view of the atlas: what this repo actually contributes."
          hint="Arrow keys move across lanes · Enter opens a branch · b goes back"
        />
        <${MetricLine} items=${[`${currentSource.skillCount} skills`, `${currentSource.branchCount} branches`, `${currentSource.mirrorCount} mirrors`, `${currentSource.snapshotCount} snapshots`]} />
        <${Box} marginTop=${1}>
          <${AtlasGrid}
            items=${getSourceBranchItems(currentSource)}
            selectedIndex=${selectedIndex}
            columns=${columns}
            rows=${rows}
            reservedRows=${10}
          />
        <//>
      <//>
    `;
  } else if (current.type === 'branch' && currentArea && currentBranch) {
    const selectedSkill = currentBranch.skills[selectedIndex] || currentBranch.skills[0];
    body = html`
      <${Box} flexDirection="column">
        <${Header}
          breadcrumbs=${breadcrumbs}
          title=${currentBranch.title}
          subtitle=${`Inside ${currentArea.title.toLowerCase()}, this lane currently carries ${currentBranch.skillCount} skills.`}
          hint="Arrow keys move across skills · Enter opens a skill · b goes back"
        />
        <${MetricLine} items=${[`${currentBranch.skillCount} skills`, `${currentBranch.repoCount} repos`, currentBranch.repoTitles.join(', ')]} />
        <${Box} marginTop=${1}>
          <${AtlasGrid}
            items=${getSkillItems(currentBranch.skills)}
            selectedIndex=${selectedIndex}
            columns=${columns}
            rows=${rows}
            mode="skills"
            reservedRows=${18}
          />
        <//>
        ${selectedSkill
          ? html`
              <${Inspector}
                title=${selectedSkill.title}
                eyebrow=${`${selectedSkill.sourceTitle} · ${selectedSkill.trust} · ${selectedSkill.syncMode}`}
                lines=${[selectedSkill.description, selectedSkill.whyHere]}
                footer="Enter opens the focused skill"
              />
            `
          : null}
      <//>
    `;
  } else if (current.type === 'sourceBranch' && currentSource && currentSourceBranch) {
    const selectedSkill = currentSourceBranch.skills[selectedIndex] || currentSourceBranch.skills[0];
    body = html`
      <${Box} flexDirection="column">
        <${Header}
          breadcrumbs=${breadcrumbs}
          title=${currentSourceBranch.title}
          subtitle=${`${currentSource.title} feeds this lane into the library.`}
          hint="Arrow keys move across skills · Enter opens a skill · b goes back"
        />
        <${MetricLine} items=${[`${currentSourceBranch.skillCount} skills`, currentSourceBranch.areaTitle, currentSource.title]} />
        <${Box} marginTop=${1}>
          <${AtlasGrid}
            items=${getSkillItems(currentSourceBranch.skills)}
            selectedIndex=${selectedIndex}
            columns=${columns}
            rows=${rows}
            mode="skills"
            reservedRows=${18}
          />
        <//>
        ${selectedSkill
          ? html`
              <${Inspector}
                title=${selectedSkill.title}
                eyebrow=${`${selectedSkill.workAreaTitle} / ${selectedSkill.branchTitle}`}
                lines=${[selectedSkill.description, selectedSkill.whyHere]}
                footer="Enter opens the focused skill"
              />
            `
          : null}
      <//>
    `;
  } else if (current.type === 'skill' && currentSkill) {
    body = html`
      <${Box} flexDirection="column">
        <${Header}
          breadcrumbs=${breadcrumbs}
          title=${currentSkill.title}
          subtitle=${`${currentSkill.sourceTitle} · ${currentSkill.trust} · ${currentSkill.syncMode}`}
          hint="i opens install choices · p toggles preview · o opens upstream"
        />
        <${SkillScreen} skill=${currentSkill} previewMode=${previewMode} agent=${agent} columns=${columns} />
        ${chooserOpen
          ? html`<${InstallChooser} skill=${currentSkill} agent=${agent} selectedIndex=${chooserIndex} columns=${columns} />`
          : null}
      <//>
    `;
  }

  return html`
    <${Box} flexDirection="column">
      ${body}
      <${Box} marginTop=${1}>
        <${Text} color=${COLORS.muted}>
          / search · Enter open · b back · i install · p preview · o upstream · q quit
        <//>
      <//>
    <//>
  `;
}

export async function launchTui({agent = 'claude'} = {}) {
  const catalog = buildCatalog();

  return await new Promise((resolve) => {
    render(html`<${App} catalog=${catalog} agent=${agent} onExit=${resolve} />`);
  });
}
