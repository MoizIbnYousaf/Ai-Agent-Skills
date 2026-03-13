import React, {useMemo, useState} from 'react';
import {createRequire} from 'module';
import {spawnSync} from 'child_process';
import {Box, Text, render, useApp, useInput, useStdout} from 'ink';
import TextInput from 'ink-text-input';
import htm from 'htm';

const require = createRequire(import.meta.url);
const {buildCatalog} = require('./catalog.cjs');

const html = htm.bind(React.createElement);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function stripFrontmatter(markdown) {
  if (!markdown.startsWith('---\n')) return markdown;
  const secondFence = markdown.indexOf('\n---\n', 4);
  if (secondFence === -1) return markdown;
  return markdown.slice(secondFence + 5).trim();
}

function excerpt(markdown, lines = 20) {
  return stripFrontmatter(markdown)
    .split('\n')
    .slice(0, lines)
    .join('\n')
    .trim();
}

function fitText(text, maxLength) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

function skillInstallCommand(skillName, agent) {
  return `npx ai-agent-skills install ${skillName} --agent ${agent}`;
}

function ListPanel({title, subtitle, items, selectedIndex}) {
  return html`
    <${Box} flexDirection="column" width=${34} paddingRight=${1}>
      <${Box} borderStyle="round" borderColor="yellow" flexDirection="column" paddingX=${1} paddingY=${0}>
        <${Text} color="yellowBright">${title}<//>
        ${subtitle ? html`<${Text} color="gray">${subtitle}<//>` : null}
      <//>
      <${Box} flexDirection="column" marginTop=${1}>
        ${items.map((item, index) => {
          const selected = index === selectedIndex;
          return html`
            <${Box}
              key=${item.id || item.title}
              borderStyle="round"
              borderColor=${selected ? 'yellowBright' : 'gray'}
              paddingX=${1}
              paddingY=${0}
              marginBottom=${1}
              flexDirection="column"
            >
              <${Text} bold=${selected} color=${selected ? 'white' : 'gray'}>
                ${selected ? '› ' : '  '}${item.title}
              <//>
              ${item.meta ? html`<${Text} color="gray">${item.meta}<//>` : null}
            <//>
          `;
        })}
      <//>
    <//>
  `;
}

function DetailCard({title, eyebrow, children}) {
  return html`
    <${Box} borderStyle="round" borderColor="gray" flexDirection="column" paddingX=${1} paddingY=${0} marginBottom=${1}>
      ${eyebrow ? html`<${Text} color="yellow">${eyebrow}<//>` : null}
      <${Text} bold color="white">${title}<//>
      <${Box} marginTop=${1} flexDirection="column">${children}<//>
    <//>
  `;
}

function renderChips(values) {
  if (!values || values.length === 0) return html`<${Text} color="gray">none<//>`;
  return html`
    <${Box} flexWrap="wrap">
      ${values.slice(0, 4).map((value, index) => html`
        <${Box}
          key=${`${value}-${index}`}
          borderStyle="round"
          borderColor="gray"
          paddingX=${1}
          marginRight=${1}
          marginBottom=${1}
        >
          <${Text} color="gray">${value}<//>
        <//>
      `)}
    <//>
  `;
}

function WorkMap({areas, selectedIndex, columns}) {
  const cardsPerRow = columns >= 150 ? 4 : columns >= 110 ? 3 : columns >= 72 ? 2 : 1;
  const cardWidth = Math.max(28, Math.floor((columns - (cardsPerRow - 1) * 2) / cardsPerRow));

  return html`
    <${Box} flexWrap="wrap">
      ${areas.map((area, index) => {
        const selected = index === selectedIndex;
        return html`
          <${Box}
            key=${area.id}
            width=${cardWidth}
            minHeight=${11}
            marginRight=${1}
            marginBottom=${1}
            borderStyle="round"
            borderColor=${selected ? 'yellowBright' : 'gray'}
            paddingX=${1}
            paddingY=${0}
            flexDirection="column"
          >
            <${Box} justifyContent="space-between">
              <${Text} bold=${selected} color=${selected ? 'white' : 'gray'}>${area.title}<//>
              <${Text} color=${selected ? 'yellowBright' : 'gray'}>${area.skillCount} skills<//>
            <//>
            <${Box} marginTop=${1} flexDirection="column">
              <${Text} color="gray">${fitText(area.description, Math.max(28, cardWidth - 4))}<//>
            <//>
            <${Box} marginTop=${1} flexWrap="wrap">
              ${area.branches.slice(0, 3).map((branch) => html`
                <${Box}
                  key=${branch.id}
                  borderStyle="round"
                  borderColor="gray"
                  paddingX=${1}
                  marginRight=${1}
                  marginBottom=${1}
                >
                  <${Text} color="gray">${branch.title}<//>
                <//>
              `)}
            <//>
            <${Box} marginTop="auto" justifyContent="space-between">
              <${Text} color="gray">${area.repoCount} repos · ${area.branches.length} branches<//>
              <${Text} color=${selected ? 'yellowBright' : 'gray'}>${selected ? 'Enter to open' : 'Open'}<//>
            <//>
          <//>
        `;
      })}
    <//>
  `;
}

function SourceGrid({sources, selectedIndex, columns}) {
  const cardsPerRow = columns >= 150 ? 4 : columns >= 110 ? 3 : columns >= 72 ? 2 : 1;
  const cardWidth = Math.max(28, Math.floor((columns - (cardsPerRow - 1) * 2) / cardsPerRow));

  return html`
    <${Box} flexWrap="wrap">
      ${sources.map((source, index) => {
        const selected = index === selectedIndex;
        return html`
          <${Box}
            key=${source.slug}
            width=${cardWidth}
            minHeight=${9}
            marginRight=${1}
            marginBottom=${1}
            borderStyle="round"
            borderColor=${selected ? 'yellowBright' : 'gray'}
            paddingX=${1}
            paddingY=${0}
            flexDirection="column"
          >
            <${Text} bold=${selected} color=${selected ? 'white' : 'gray'}>${source.title}<//>
            <${Text} color="gray">${source.slug}<//>
            <${Box} marginTop=${1} justifyContent="space-between">
              <${Text} color="gray">${source.skillCount} skills<//>
              <${Text} color="gray">${source.branchCount} branches<//>
            <//>
            <${Box} marginTop=${1} flexWrap="wrap">
              ${source.branches.slice(0, 2).map((branch) => html`
                <${Box}
                  key=${branch.id}
                  borderStyle="round"
                  borderColor="gray"
                  paddingX=${1}
                  marginRight=${1}
                  marginBottom=${1}
                >
                  <${Text} color="gray">${branch.areaTitle} / ${branch.title}<//>
                <//>
              `)}
            <//>
            <${Box} marginTop="auto" justifyContent="flex-end">
              <${Text} color=${selected ? 'yellowBright' : 'gray'}>${selected ? 'Enter to open' : 'Open'}<//>
            <//>
          <//>
        `;
      })}
    <//>
  `;
}

function SearchOverlay({query, setQuery, results, selectedIndex}) {
  return html`
    <${Box} borderStyle="round" borderColor="yellowBright" flexDirection="column" paddingX=${1} paddingY=${0} marginBottom=${1}>
      <${Text} color="yellowBright">Search the library<//>
      <${Box} marginTop=${1}>
        <${Text} color="gray">/ <//>
        <${TextInput} value=${query} onChange=${setQuery} placeholder="skills, work areas, branches, repos" />
      <//>
      <${Box} marginTop=${1} flexDirection="column">
        ${results.length === 0
          ? html`<${Text} color="gray">No matches yet.<//>`
          : results.slice(0, 8).map((result, index) => {
              const selected = index === selectedIndex;
              return html`
                <${Box} key=${result.name} marginBottom=${1}>
                  <${Text} color=${selected ? 'yellowBright' : 'gray'}>
                    ${selected ? '› ' : '  '}${result.title} · ${result.workAreaTitle} / ${result.branchTitle} · ${result.sourceTitle}
                  <//>
                <//>
              `;
            })}
      <//>
    <//>
  `;
}

function SkillSummary({skill, previewMode, agent}) {
  const previewText = excerpt(skill.markdown, 18)
    .split('\n')
    .slice(0, 18)
    .join('\n');

  return html`
    <${Box} flexDirection="column">
      <${DetailCard} title=${skill.title} eyebrow=${`${skill.workAreaTitle} / ${skill.branchTitle}`}>
        <${Text} color="gray">${skill.description}<//>
        <${Box} marginTop=${1} flexDirection="column">
          <${Text} color="gray">Source: ${skill.sourceTitle}<//>
          <${Text} color="gray">Trust: ${skill.trust} · Sync: ${skill.syncMode}<//>
          <${Text} color="gray">Origin: ${skill.origin}${skill.lastVerified ? ` · Verified ${skill.lastVerified}` : ''}<//>
        <//>
      <//>
      <${DetailCard} title="Why it is here">
        <${Text} color="gray">${skill.whyHere}<//>
      <//>
      <${DetailCard} title=${previewMode ? 'Preview' : 'Install'} eyebrow=${previewMode ? 'Rendered from SKILL.md' : 'Vendored install path'}>
        ${previewMode
          ? html`<${Text} color="gray">${previewText}<//>`
          : html`
              <${Text} color="gray">${skillInstallCommand(skill.name, agent)}<//>
              <${Box} marginTop=${1} flexDirection="column">
                <${Text} color="gray">Press i to install this skill.<//>
                <${Text} color="gray">Press p to toggle preview.<//>
              <//>
            `}
      <//>
      <${DetailCard} title="Collections and tags">
        ${renderChips([...skill.collections, ...(skill.tags || []).slice(0, 3)])}
      <//>
    <//>
  `;
}

function App({catalog, agent, onExit}) {
  const {exit} = useApp();
  const {stdout} = useStdout();
  const columns = stdout?.columns || process.stdout.columns || 120;
  const [rootMode, setRootMode] = useState('areas');
  const [stack, setStack] = useState([{type: 'home'}]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searchMode, setSearchMode] = useState(false);
  const [query, setQuery] = useState('');
  const [previewMode, setPreviewMode] = useState(false);

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

  const activeList = (() => {
    if (searchMode) {
      return searchResults.map((skill) => ({
        id: skill.name,
        title: skill.title,
        meta: `${skill.workAreaTitle} / ${skill.branchTitle} · ${skill.sourceTitle}`,
      }));
    }

    if (current.type === 'home') {
      const items = rootMode === 'areas'
        ? catalog.areas.map((area) => ({id: area.id, title: area.title}))
        : catalog.sources.map((source) => ({id: source.slug, title: source.title}));
      return items;
    }

    if (current.type === 'area' && currentArea) {
      return currentArea.branches.map((branch) => ({
        id: branch.id,
        title: branch.title,
        meta: `${branch.skillCount} skills · ${branch.repoCount} repos`,
      }));
    }

    if (current.type === 'branch' && currentBranch) {
      return currentBranch.skills.map((skill) => ({
        id: skill.name,
        title: skill.title,
        meta: `${skill.sourceTitle} · ${skill.trust}`,
      }));
    }

    if (current.type === 'source' && currentSource) {
      return currentSource.branches.map((branch) => ({
        id: branch.id,
        title: `${branch.areaTitle} / ${branch.title}`,
        meta: `${branch.skillCount} skills`,
      }));
    }

    if (current.type === 'sourceBranch' && currentSourceBranch) {
      return currentSourceBranch.skills.map((skill) => ({
        id: skill.name,
        title: skill.title,
        meta: `${skill.workAreaTitle} · ${skill.trust}`,
      }));
    }

    return [];
  })();

  useInput((input, key) => {
    if (searchMode) {
      if (key.escape) {
        setSearchMode(false);
        setQuery('');
        setSelectedIndex(0);
      } else if (key.upArrow) {
        setSelectedIndex((currentIndex) => clamp(currentIndex - 1, 0, Math.max(0, searchResults.length - 1)));
      } else if (key.downArrow) {
        setSelectedIndex((currentIndex) => clamp(currentIndex + 1, 0, Math.max(0, searchResults.length - 1)));
      } else if (key.return && searchResults[selectedIndex]) {
        setStack((currentStack) => [...currentStack, {type: 'skill', skillName: searchResults[selectedIndex].name}]);
        setSelectedIndex(0);
        setSearchMode(false);
        setQuery('');
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
      return;
    }

    if (current.type === 'skill' && currentSkill) {
      if (input === 'p') {
        setPreviewMode((value) => !value);
        return;
      }

      if (input === 'i') {
        onExit({type: 'install', skillName: currentSkill.name});
        exit();
        return;
      }

      if (input === 'o') {
        const target = currentSkill.sourceUrl || `https://github.com/${currentSkill.source}`;
        spawnSync('open', [target], {stdio: 'ignore'});
        return;
      }
    }

    if (current.type === 'home') {
      const itemCount = rootMode === 'areas' ? catalog.areas.length : catalog.sources.length;
      const columnsPerRow = columns >= 150 ? 4 : columns >= 110 ? 3 : columns >= 72 ? 2 : 1;

      if (key.leftArrow) {
        if (selectedIndex > 0) {
          setSelectedIndex((value) => value - 1);
        } else {
          setRootMode((value) => (value === 'areas' ? 'sources' : 'areas'));
          setSelectedIndex(0);
        }
        return;
      }

      if (key.rightArrow) {
        if (selectedIndex < itemCount - 1) {
          setSelectedIndex((value) => value + 1);
        } else {
          setRootMode((value) => (value === 'areas' ? 'sources' : 'areas'));
          setSelectedIndex(0);
        }
        return;
      }

      if (key.upArrow) {
        setSelectedIndex((value) => clamp(value - columnsPerRow, 0, itemCount - 1));
        return;
      }

      if (key.downArrow) {
        setSelectedIndex((value) => clamp(value + columnsPerRow, 0, itemCount - 1));
        return;
      }

      if (input === 'r') {
        setRootMode('sources');
        setSelectedIndex(0);
        return;
      }

      if (input === 'w') {
        setRootMode('areas');
        setSelectedIndex(0);
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

    if (key.upArrow || input === 'k') {
      setSelectedIndex((value) => clamp(value - 1, 0, Math.max(0, activeList.length - 1)));
      return;
    }

    if (key.downArrow || input === 'j') {
      setSelectedIndex((value) => clamp(value + 1, 0, Math.max(0, activeList.length - 1)));
      return;
    }

    if (!key.return) return;

    if (current.type === 'area' && currentArea && currentArea.branches[selectedIndex]) {
      setStack((currentStack) => [
        ...currentStack,
        {type: 'branch', areaId: currentArea.id, branchId: currentArea.branches[selectedIndex].id},
      ]);
      setSelectedIndex(0);
      return;
    }

    if (current.type === 'branch' && currentBranch && currentBranch.skills[selectedIndex]) {
      setStack((currentStack) => [
        ...currentStack,
        {type: 'skill', skillName: currentBranch.skills[selectedIndex].name},
      ]);
      setSelectedIndex(0);
      setPreviewMode(false);
      return;
    }

    if (current.type === 'source' && currentSource && currentSource.branches[selectedIndex]) {
      setStack((currentStack) => [
        ...currentStack,
        {type: 'sourceBranch', sourceSlug: currentSource.slug, branchId: currentSource.branches[selectedIndex].id},
      ]);
      setSelectedIndex(0);
      return;
    }

    if (current.type === 'sourceBranch' && currentSourceBranch && currentSourceBranch.skills[selectedIndex]) {
      setStack((currentStack) => [
        ...currentStack,
        {type: 'skill', skillName: currentSourceBranch.skills[selectedIndex].name},
      ]);
      setSelectedIndex(0);
      setPreviewMode(false);
    }
  });

  const hero = html`
    <${Box} flexDirection="column" marginBottom=${1}>
      <${Text} color="yellowBright">AI Agent Skills<//>
      <${Text} bold color="white">Curated agent skills in the terminal<//>
      <${Text} color="gray">Work areas first. Source repos second. Vendored installs stay stable.<//>
    <//>
  `;

  const tabs = html`
    <${Box} marginBottom=${1}>
      <${Box} borderStyle="round" borderColor=${rootMode === 'areas' ? 'yellowBright' : 'gray'} paddingX=${1} marginRight=${1}>
        <${Text} color=${rootMode === 'areas' ? 'white' : 'gray'}>Work Areas (w)<//>
      <//>
      <${Box} borderStyle="round" borderColor=${rootMode === 'sources' ? 'yellowBright' : 'gray'} paddingX=${1}>
        <${Text} color=${rootMode === 'sources' ? 'white' : 'gray'}>Source Repos (r)<//>
      <//>
    <//>
  `;

  let body = null;

  if (searchMode) {
    body = html`
      <${Box} flexDirection="column">
        <${SearchOverlay}
          query=${query}
          setQuery=${setQuery}
          results=${searchResults}
          selectedIndex=${selectedIndex}
        />
        <${Text} color="gray">Enter opens a skill. Esc closes search.<//>
      <//>
    `;
  } else if (current.type === 'home') {
    body = html`
      <${Box} flexDirection="column">
        ${tabs}
        ${rootMode === 'areas'
          ? html`<${WorkMap} areas=${catalog.areas} selectedIndex=${selectedIndex} columns=${columns} />`
          : html`<${SourceGrid} sources=${catalog.sources} selectedIndex=${selectedIndex} columns=${columns} />`}
      <//>
    `;
  } else if (current.type === 'area' && currentArea) {
    const branch = currentArea.branches[selectedIndex] || currentArea.branches[0];
    body = html`
      <${Box}>
        <${ListPanel}
          title=${currentArea.title}
          subtitle=${`${currentArea.skillCount} skills · ${currentArea.repoCount} repos`}
          items=${currentArea.branches.map((item) => ({
            id: item.id,
            title: item.title,
            meta: `${item.skillCount} skills · ${item.repoCount} repos`,
          }))}
          selectedIndex=${selectedIndex}
        />
        <${Box} flexDirection="column" flexGrow=${1}>
          <${DetailCard} title=${branch.title} eyebrow=${currentArea.title}>
            <${Text} color="gray">${currentArea.description}<//>
            <${Box} marginTop=${1} flexDirection="column">
              <${Text} color="gray">${branch.skillCount} skills · ${branch.repoCount} repos<//>
              <${Text} color="gray">Sources: ${branch.repoTitles.join(', ')}<//>
            <//>
          <//>
          <${DetailCard} title="Sample skills">
            ${branch.skills.slice(0, 4).map((skill) => html`<${Text} key=${skill.name} color="gray">• ${skill.title} · ${skill.sourceTitle}<//>`)}
          <//>
        <//>
      <//>
    `;
  } else if (current.type === 'branch' && currentArea && currentBranch) {
    const skill = currentBranch.skills[selectedIndex] || currentBranch.skills[0];
    body = html`
      <${Box}>
        <${ListPanel}
          title=${`${currentArea.title} / ${currentBranch.title}`}
          subtitle=${`${currentBranch.skillCount} skills`}
          items=${currentBranch.skills.map((item) => ({
            id: item.name,
            title: item.title,
            meta: `${item.sourceTitle} · ${item.trust}`,
          }))}
          selectedIndex=${selectedIndex}
        />
        <${Box} flexDirection="column" flexGrow=${1}>
          <${SkillSummary} skill=${skill} previewMode=${false} agent=${agent} />
        <//>
      <//>
    `;
  } else if (current.type === 'source' && currentSource) {
    const branch = currentSource.branches[selectedIndex] || currentSource.branches[0];
    body = html`
      <${Box}>
        <${ListPanel}
          title=${currentSource.title}
          subtitle=${`${currentSource.skillCount} skills · ${currentSource.branchCount} branches`}
          items=${currentSource.branches.map((item) => ({
            id: item.id,
            title: `${item.areaTitle} / ${item.title}`,
            meta: `${item.skillCount} skills`,
          }))}
          selectedIndex=${selectedIndex}
        />
        <${Box} flexDirection="column" flexGrow=${1}>
          <${DetailCard} title=${branch.title} eyebrow=${branch.areaTitle}>
            <${Text} color="gray">${currentSource.title} feeds this lane of the library.<//>
            <${Box} marginTop=${1} flexDirection="column">
              <${Text} color="gray">${branch.skillCount} skills<//>
              <${Text} color="gray">Mirrorable: ${currentSource.mirrorCount} · Snapshots: ${currentSource.snapshotCount}<//>
            <//>
          <//>
          <${DetailCard} title="Sample skills">
            ${branch.skills.slice(0, 4).map((skill) => html`<${Text} key=${skill.name} color="gray">• ${skill.title}<//>`)}
          <//>
        <//>
      <//>
    `;
  } else if (current.type === 'sourceBranch' && currentSource && currentSourceBranch) {
    const skill = currentSourceBranch.skills[selectedIndex] || currentSourceBranch.skills[0];
    body = html`
      <${Box}>
        <${ListPanel}
          title=${`${currentSource.title} / ${currentSourceBranch.title}`}
          subtitle=${`${currentSourceBranch.skillCount} skills`}
          items=${currentSourceBranch.skills.map((item) => ({
            id: item.name,
            title: item.title,
            meta: `${item.workAreaTitle} · ${item.trust}`,
          }))}
          selectedIndex=${selectedIndex}
        />
        <${Box} flexDirection="column" flexGrow=${1}>
          <${SkillSummary} skill=${skill} previewMode=${false} agent=${agent} />
        <//>
      <//>
    `;
  } else if (current.type === 'skill' && currentSkill) {
    body = html`
      <${Box}>
        <${Box} flexDirection="column" flexGrow=${1}>
          <${SkillSummary} skill=${currentSkill} previewMode=${previewMode} agent=${agent} />
        <//>
      <//>
    `;
  }

  return html`
    <${Box} flexDirection="column">
      ${hero}
      ${body}
      <${Box} marginTop=${1} flexDirection="column">
        <${Text} color="gray">Keys: / search · enter open · b back · i install · p preview · o upstream · q quit<//>
        <${Text} color="gray">Agent target: ${agent}<//>
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
