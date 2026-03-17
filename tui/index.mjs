import React, {useEffect, useMemo, useState} from 'react';
import {createRequire} from 'module';
import {spawnSync} from 'child_process';
import {Box, Text, render, useApp, useInput, useStdout} from 'ink';
import TextInput from 'ink-text-input';
import htm from 'htm';

const require = createRequire(import.meta.url);
const {buildCatalog, getSiblingRecommendations, getSkillsInstallSpec} = require('./catalog.cjs');

const html = htm.bind(React.createElement);

const THEMES = [
  {
    id: 'house-amber',
    label: 'House Amber',
    caption: 'Warm editorial atlas',
    colors: {
      accent: '#f4a261',
      accentSoft: '#84a59d',
      success: '#7bd389',
      warning: '#e9c46a',
      text: '#f8fafc',
      muted: '#94a3b8',
      border: '#3f4c5a',
      borderSoft: '#22303d',
      selectedBg: '#18212b',
      panel: '#10161f',
      panelSoft: '#0b1119',
      panelRaised: '#151d28',
      chipBg: '#17202b',
      chipActiveBg: '#233140',
      barMode: '#f4a261',
      barContext: '#2a9d8f',
      barHint: '#264653',
      rail: '#4d5f73',
    },
  },
  {
    id: 'emerald-stack',
    label: 'Emerald Stack',
    caption: 'Deep library stacks',
    colors: {
      accent: '#7fc8a9',
      accentSoft: '#6ba292',
      success: '#96f2c4',
      warning: '#e9c46a',
      text: '#edf6f3',
      muted: '#8ea7a0',
      border: '#355250',
      borderSoft: '#223736',
      selectedBg: '#12211f',
      panel: '#0c1515',
      panelSoft: '#091010',
      panelRaised: '#111b1b',
      chipBg: '#14201f',
      chipActiveBg: '#1c3130',
      barMode: '#7fc8a9',
      barContext: '#4f8f87',
      barHint: '#214e4a',
      rail: '#4d7972',
    },
  },
  {
    id: 'blueprint-noir',
    label: 'Blueprint Noir',
    caption: 'Night archive glow',
    colors: {
      accent: '#8fb8ff',
      accentSoft: '#7a9cd6',
      success: '#7bd4b5',
      warning: '#f2cf7a',
      text: '#eef3ff',
      muted: '#91a2bf',
      border: '#39445f',
      borderSoft: '#222a3b',
      selectedBg: '#151b29',
      panel: '#0c111a',
      panelSoft: '#090d14',
      panelRaised: '#111725',
      chipBg: '#161d2b',
      chipActiveBg: '#20304a',
      barMode: '#8fb8ff',
      barContext: '#5f84c7',
      barHint: '#223f6a',
      rail: '#5b6f92',
    },
  },
];

const COLORS = {...THEMES[0].colors};

const SOURCE_NOTES = {
  'ComposioHQ/awesome-claude-skills': 'Broad practical coverage for workflow, files, research, and adjacent execution tasks.',
  'MoizIbnYousaf/Ai-Agent-Skills': 'The directly-authored library skills that define the strongest house style here.',
  'anthropics/claude-code': 'High-signal Claude Code workflows worth keeping when they clearly raise the bar.',
  'anthropics/skills': 'The strongest general-purpose upstream set in the ecosystem, especially for frontend, docs, and workflow.',
  'openai/skills': 'Strong planning, browser, Figma, and implementation-oriented skills that complement the rest of the shelf.',
  'wshobson/agents': 'The systems-heavy source for backend, architecture, and deeper engineering coverage.',
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function applyTheme(themeIndex) {
  const theme = THEMES[themeIndex] || THEMES[0];
  Object.assign(COLORS, theme.colors);
  return theme;
}

function parsePositiveNumber(value) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function readTerminalMetric(name) {
  const result = spawnSync('tput', [name], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });

  if (result.status !== 0) return null;
  return parsePositiveNumber(result.stdout.trim());
}

function resolveTerminalSize(stdout) {
  const columns = stdout?.columns
    || process.stdout.columns
    || parsePositiveNumber(process.env.COLUMNS)
    || readTerminalMetric('cols')
    || 120;

  const rows = stdout?.rows
    || process.stdout.rows
    || parsePositiveNumber(process.env.LINES)
    || readTerminalMetric('lines')
    || 40;

  return {columns, rows};
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

function compactText(text, maxLength) {
  return fitText(String(text || '').replace(/\s+/g, ' ').trim(), maxLength);
}

function sourceNoteFor(sourceSlug, fallback = '') {
  return SOURCE_NOTES[sourceSlug] || fallback || sourceSlug;
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

function Header({breadcrumbs, title, subtitle, hint, metaItems = []}) {
  return html`
    <${Box} flexDirection="column" marginBottom=${1}>
      <${Box} marginBottom=${1} flexWrap="wrap">
        <${Box} marginRight=${1} marginBottom=${1}>
          <${Text} backgroundColor=${COLORS.barMode} color=${COLORS.panelSoft}> AI Agent Skills Atlas <//>
        <//>
        ${breadcrumbs && breadcrumbs.length > 0
          ? html`
              <${Box} marginBottom=${1}>
                <${Text} backgroundColor=${COLORS.barContext} color=${COLORS.text}> ${breadcrumbs.join(' › ')} <//>
              <//>
            `
          : null}
      <//>
      <${Text} bold color=${COLORS.text}>${title}<//>
      ${subtitle ? html`<${Text} color=${COLORS.muted}>${subtitle}<//>` : null}
      ${metaItems.length > 0
        ? html`
            <${Box} marginTop=${1} flexWrap="wrap">
              ${metaItems.map((item, index) => html`
                <${Box}
                  key=${`${item}-${index}`}
                  backgroundColor=${COLORS.panelRaised}
                  paddingX=${1}
                  marginRight=${1}
                  marginBottom=${1}
                >
                  <${Text} color=${COLORS.muted}>${item}<//>
                <//>
              `)}
            <//>
          `
        : null}
      ${hint
        ? html`
            <${Box} marginTop=${1} backgroundColor=${COLORS.barHint} paddingX=${1}>
              <${Text} color=${COLORS.muted}>${hint}<//>
            <//>
          `
        : null}
    <//>
  `;
}

function ModeTabs({rootMode}) {
  return html`
    <${Box} marginBottom=${1} flexWrap="wrap">
      ${[
        {id: 'collections', label: 'Collections (c)'},
        {id: 'areas', label: 'Work Areas (w)'},
        {id: 'sources', label: 'Source Repos (r)'},
      ].map((tab) => {
        const selected = tab.id === rootMode;
        return html`
          <${Box}
            key=${tab.id}
            backgroundColor=${selected ? COLORS.selectedBg : COLORS.panelSoft}
            paddingX=${1}
            marginRight=${1}
            marginBottom=${1}
          >
            <${Text} color=${selected ? COLORS.text : COLORS.muted}>
              ${selected ? '● ' : '· '}${tab.label}
            <//>
          <//>
        `;
      })}
    <//>
  `;
}

function FooterBar({hint, detail = 'Curated library', mode = 'ATLAS', columns = 120}) {
  const detailText = compactText(detail, 42);
  const hintText = compactText(hint, Math.max(48, columns - 8));
  return html`
    <${Box} marginTop=${1} flexDirection="column">
      <${Box} marginBottom=${1}>
        <${Text} backgroundColor=${COLORS.barMode} color=${COLORS.panelSoft}> ${mode} <//>
        <${Text}> <//>
        <${Text} backgroundColor=${COLORS.barContext} color=${COLORS.text}> ${detailText} <//>
      <//>
      <${Box} backgroundColor=${COLORS.panelSoft} paddingX=${1}>
        <${Text} color=${COLORS.muted}>${hintText}<//>
      <//>
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
          backgroundColor=${selected ? COLORS.chipActiveBg : COLORS.chipBg}
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
  compact = false,
}) {
  const descriptionLimit = compact
    ? Math.max(26, width - 10)
    : selected
      ? Math.max(54, width * 2)
      : Math.max(26, width - 8);
  const displayedDescription = description ? compactText(description, descriptionLimit) : '';
  const displayedSamples = sampleLines && sampleLines.length > 0
    ? sampleLines.slice(0, compact ? 1 : selected ? 2 : 1).map((line) => compactText(line, Math.max(24, width - 8)))
    : [];

  return html`
    <${Box}
      width=${width}
      minHeight=${minHeight}
      marginRight=${1}
      marginBottom=${1}
      borderStyle="round"
      borderColor=${selected ? COLORS.accent : COLORS.border}
      backgroundColor=${selected ? COLORS.selectedBg : COLORS.panel}
      paddingX=${1}
      paddingY=${0}
      flexDirection="column"
    >
      <${Box} justifyContent="space-between">
        <${Text} bold=${selected} color=${selected ? COLORS.text : COLORS.muted}>
          ${title}
        <//>
        ${count
          ? html`
              <${Text}
                backgroundColor=${selected ? COLORS.accent : COLORS.chipBg}
                color=${selected ? COLORS.panelSoft : COLORS.muted}
              >
                ${` ${count} `}
              <//>
            `
          : null}
      <//>

      ${displayedDescription
        ? html`
            <${Box} marginTop=${1}>
              <${Text} color=${selected ? COLORS.text : COLORS.muted}>
                ${displayedDescription}
              <//>
            <//>
          `
        : null}

      ${chips && chips.length > 0 ? html`<${ChipRow} items=${chips} selected=${selected} />` : null}

      ${displayedSamples.length > 0
        ? html`
            <${Box} marginTop=${1} flexDirection="column">
              ${displayedSamples.map((line, index) => html`
                <${Text} key=${`${line}-${index}`} color=${selected ? COLORS.text : COLORS.muted}>
                  ${selected ? '◆ ' : ''}${line}
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

function getStripState({items, selectedIndex, columns, mode = 'default'}) {
  const visibleCount = columns >= 160 ? 4 : columns >= 118 ? 3 : 2;
  const gutter = visibleCount > 1 ? visibleCount - 1 : 0;
  const tileWidth = Math.max(
    mode === 'skills' ? 32 : 28,
    Math.floor((columns - gutter * 2) / visibleCount)
  );
  const start = clamp(
    selectedIndex - Math.floor(visibleCount / 2),
    0,
    Math.max(0, items.length - visibleCount)
  );
  const end = Math.min(items.length, start + visibleCount);

  return {
    tileWidth,
    visibleItems: items.slice(start, end),
    visibleIndex: clamp(selectedIndex - start, 0, Math.max(0, end - start - 1)),
    hiddenLeft: start,
    hiddenRight: Math.max(0, items.length - end),
  };
}

function ShelfStrip({items, selectedIndex, columns, mode = 'default', active = true, compact = false}) {
  const viewport = getStripState({items, selectedIndex, columns, mode});

  return html`
    <${Box} flexDirection="column">
      <${Box}>
        ${viewport.hiddenLeft > 0
          ? html`<${Text} color=${COLORS.muted}>← ${viewport.hiddenLeft}<//>`
          : html`<${Text} color=${COLORS.muted}> <//>`}
      <//>
      <${Box} flexWrap="wrap">
        ${viewport.visibleItems.map((item, index) => html`
          <${AtlasTile}
            key=${item.id}
            width=${viewport.tileWidth}
            minHeight=${item.minHeight || (compact ? 7 : mode === 'skills' ? 10 : 11)}
            selected=${active && index === viewport.visibleIndex}
            title=${item.title}
            count=${item.count}
            description=${item.description}
            chips=${item.chips}
            footerLeft=${item.footerLeft}
            footerRight=${item.footerRight}
            sampleLines=${item.sampleLines}
            compact=${compact}
          />
        `)}
      <//>
      <${Box}>
        ${viewport.hiddenRight > 0
          ? html`<${Text} color=${COLORS.muted}>→ ${viewport.hiddenRight}<//>`
          : html`<${Text} color=${COLORS.muted}> <//>`}
      <//>
    <//>
  `;
}

function CompactShelfPreview({title, subtitle, active, summary}) {
  return html`
    <${Box} marginTop=${1} marginBottom=${1} flexDirection="column">
      <${Text} color=${active ? COLORS.text : COLORS.muted}>
        ${active ? '› ' : '· '}${title}
      <//>
      <${Text} color=${COLORS.muted}>${compactText(subtitle, 120)}<//>
      <${Text} color=${COLORS.muted}>${compactText(summary, 120)}<//>
      <${Text} color=${COLORS.borderSoft}>${'─'.repeat(88)}<//>
    <//>
  `;
}

function ShelfHero({section, selectedItem, columns, selectedIndex = 0}) {
  if (!section || !selectedItem) return null;

  const wideLayout = columns >= 138;
  if (!wideLayout) {
    return html`
      <${Box} flexDirection="column" marginBottom=${1}>
        <${Text} color=${COLORS.accent}>› ${section.title}<//>
        <${Text} color=${COLORS.muted}>${section.subtitle}<//>
        <${ShelfStrip}
          items=${section.items}
          selectedIndex=${selectedIndex}
          columns=${columns}
          mode=${section.mode}
          active=${true}
          compact=${false}
        />
      <//>
    `;
  }

  const heroWidth = clamp(Math.floor(columns * 0.58), 72, 92);
  const sideWidth = Math.max(30, columns - heroWidth - 6);
  const startHere = section.items.slice(0, 3).map((item) => item.title).join(', ');
  const sideLines = [
    `${section.items.length} items in this shelf`,
    startHere ? `Start here: ${startHere}` : null,
    section.kind === 'skill'
      ? 'Lead with the strongest picks first, then move outward into the rest of the library.'
      : 'This shelf is meant to feel like a deliberate reading room, not a flat list.',
  ].filter(Boolean);

  return html`
    <${Box} flexDirection="column" marginBottom=${1}>
      <${Text} color=${COLORS.accent}>› ${section.title}<//>
      <${Text} color=${COLORS.muted}>${section.subtitle}<//>
      <${Box} marginTop=${1} flexDirection="row" alignItems="flex-start">
        <${Box} width=${heroWidth} marginRight=${1}>
          <${AtlasTile}
            width=${heroWidth}
            minHeight=${14}
            selected=${true}
            title=${selectedItem.title}
            count=${selectedItem.count}
            description=${selectedItem.description}
            chips=${selectedItem.chips}
            footerLeft=${selectedItem.footerLeft}
            footerRight=${selectedItem.footerRight}
            sampleLines=${selectedItem.sampleLines}
          />
        <//>
        <${Box} width=${sideWidth} flexDirection="column">
          <${Inspector}
            title="Shelf note"
            eyebrow="Curated home"
            lines=${sideLines}
            footer="The active shelf gets the dominant space so the atlas feels guided."
            variant="rail"
          />
          <${Inspector}
            title=${selectedItem.title}
            eyebrow=${section.kind === 'skill' ? 'Current focus' : 'Selected tile'}
            lines=${[
              selectedItem.description,
              ...(selectedItem.sampleLines || []).slice(0, 2),
            ]}
            footer="Use left and right to move across the shelf."
            variant="rail"
          />
        <//>
      <//>
      <${ShelfStrip}
        items=${section.items}
        selectedIndex=${selectedIndex}
        columns=${columns}
        mode=${section.mode}
        active=${true}
        compact=${true}
      />
    <//>
  `;
}

function formatPreviewLines(markdown, maxLines = 12) {
  const rawLines = stripFrontmatter(markdown).split('\n');
  const lines = [];
  let inCodeBlock = false;

  for (const rawLine of rawLines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      if (lines.length > 0 && lines[lines.length - 1] !== '') {
        lines.push('');
      }
      continue;
    }

    if (trimmed.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      lines.push(inCodeBlock ? 'Code sample' : '');
      continue;
    }

    if (inCodeBlock) {
      lines.push(`  ${fitText(trimmed, 64)}`);
      continue;
    }

    if (trimmed.startsWith('# ')) {
      lines.push(trimmed.slice(2).toUpperCase());
      continue;
    }

    if (trimmed.startsWith('## ')) {
      lines.push(`Section: ${trimmed.slice(3)}`);
      continue;
    }

    if (trimmed.startsWith('### ')) {
      lines.push(`• ${trimmed.slice(4)}`);
      continue;
    }

    lines.push(compactText(trimmed, 84));
    if (lines.length >= maxLines) break;
  }

  return lines.filter((line, index, list) => !(line === '' && (index === 0 || index === list.length - 1))).slice(0, maxLines);
}

function SearchOverlay({query, setQuery, results, selectedIndex, columns}) {
  const width = clamp(columns - 6, 56, 110);
  return html`
    <${ModalShell}
      width=${width}
      title="Search the atlas"
      subtitle="Find skills by name, source, work area, or shelf."
      footerLines=${['Enter opens a skill · Esc closes search']}
    >
      <${Box} marginTop=${1}>
        <${Text} color=${COLORS.muted}>/ <//>
        <${TextInput} value=${query} onChange=${setQuery} placeholder="skills, work areas, branches, repos" />
      <//>
      <${Box} marginTop=${1} flexDirection="column">
        ${results.length === 0
          ? html`<${Text} color=${COLORS.muted}>No matches yet.<//>`
          : results.slice(0, 8).map((result, index) => html`
              <${ModalOption}
                key=${result.name}
                selected=${index === selectedIndex}
                label=${result.title}
                description=${`${result.workAreaTitle} / ${result.branchTitle} · ${result.sourceTitle}`}
              />
            `)}
      <//>
    <//>
  `;
}

function HelpOverlay() {
  return html`
    <${ModalShell}
      width=${88}
      title="Atlas help"
      subtitle="Keyboard and navigation for the library view."
      footerLines=${['? or Esc closes help']}
    >
      <${Text} color=${COLORS.text}>Arrow keys navigate the atlas tiles and lists.<//>
      <${Text} color=${COLORS.text}>Enter drills in or opens the focused skill.<//>
      <${Text} color=${COLORS.text}>/ opens search, : opens the command palette, ? closes this help.<//>
      <${Text} color=${COLORS.text}>b or Esc goes back, i opens install options, o opens upstream, q quits.<//>
      <${Text} color=${COLORS.text}>t cycles the house themes.<//>
      <${Text} color=${COLORS.muted}>Collections are the curator-first view. Work Areas and Source Repos stay available when you want the taxonomy underneath.<//>
    <//>
  `;
}

function PaletteOverlay({query, setQuery, items, selectedIndex}) {
  return html`
    <${ModalShell}
      width=${86}
      title="Command palette"
      subtitle="Jump around the library and change the surface."
      footerLines=${['Enter runs the command · Esc closes the palette']}
    >
      <${Box} marginTop=${1}>
        <${Text} color=${COLORS.muted}>: <//>
        <${TextInput} value=${query} onChange=${setQuery} placeholder="search actions" />
      <//>
      <${Box} marginTop=${1} flexDirection="column">
        ${items.length === 0
          ? html`<${Text} color=${COLORS.muted}>No commands match.<//>`
          : items.map((item, index) => html`
              <${ModalOption}
                key=${item.id}
                selected=${index === selectedIndex}
                label=${item.label}
                description=${item.detail}
              />
            `)}
      <//>
    <//>
  `;
}

function Inspector({title, eyebrow, lines, command, footer, variant = 'card'}) {
  if (variant === 'rail') {
    return html`
      <${Box} marginTop=${1} flexDirection="row" alignItems="flex-start">
        <${Text} color=${COLORS.rail}>│<//>
        <${Box} marginLeft=${1} flexDirection="column">
          ${eyebrow ? html`<${Text} color=${COLORS.accentSoft}>${eyebrow}<//>` : null}
          <${Text} bold color=${COLORS.text}>${title}<//>
          <${Box} marginTop=${1} flexDirection="column">
            ${lines.map((line, index) => html`<${Text} key=${index} color=${COLORS.muted}>${line}<//>`)}
          <//>
          ${command
            ? html`
                <${Box} marginTop=${1} backgroundColor=${COLORS.panelRaised} paddingX=${1}>
                  <${Text} color=${COLORS.text}>${command}<//>
                <//>
              `
            : null}
          ${footer ? html`<${Box} marginTop=${1}><${Text} color=${COLORS.muted}>${footer}<//><//>` : null}
        <//>
      <//>
    `;
  }

  return html`
    <${Box}
      borderStyle="round"
      borderColor=${COLORS.borderSoft}
      backgroundColor=${COLORS.panelSoft}
      flexDirection="column"
      paddingX=${1}
      paddingY=${0}
      marginTop=${1}
    >
      ${eyebrow ? html`<${Text} backgroundColor=${COLORS.barContext} color=${COLORS.text}> ${eyebrow} <//>` : null}
      <${Text} bold color=${COLORS.text}>${title}<//>
      <${Box} marginTop=${1} flexDirection="column">
        ${lines.map((line, index) => html`<${Text} key=${index} color=${COLORS.muted}>${line}<//>`)}
      <//>
      ${command
        ? html`
            <${Box} marginTop=${1} borderStyle="round" borderColor=${COLORS.border} backgroundColor=${COLORS.panel} paddingX=${1}>
              <${Text} color=${COLORS.text}>${command}<//>
            <//>
          `
        : null}
      ${footer ? html`<${Box} marginTop=${1}><${Text} color=${COLORS.muted}>${footer}<//><//>` : null}
    <//>
  `;
}

function ActionBar({items}) {
  return html`
    <${Box} marginBottom=${1} flexWrap="wrap">
      ${items.map((item, index) => html`
        <${Box}
          key=${item.label}
          backgroundColor=${item.primary ? COLORS.selectedBg : COLORS.panelRaised}
          paddingX=${1}
          marginRight=${index < items.length - 1 ? 1 : 0}
          marginBottom=${1}
        >
          <${Text} color=${item.primary ? COLORS.text : COLORS.muted}>${item.label}<//>
        <//>
      `)}
    <//>
  `;
}

function ModalShell({title, subtitle, width = 84, children, footerLines = []}) {
  return html`
    <${Box}
      width=${width}
      alignSelf="center"
      borderStyle="round"
      borderColor=${COLORS.accent}
      backgroundColor=${COLORS.panel}
      flexDirection="column"
      paddingX=${1}
      paddingY=${0}
      marginBottom=${1}
    >
      <${Text} backgroundColor=${COLORS.barMode} color=${COLORS.panelSoft}> ${title} <//>
      ${subtitle ? html`<${Box} marginTop=${1}><${Text} color=${COLORS.muted}>${subtitle}<//><//>` : null}
      ${children}
      ${footerLines.length > 0
        ? html`
            <${Box} marginTop=${1} flexDirection="column">
              ${footerLines.map((line, index) => html`<${Text} key=${index} color=${COLORS.muted}>${line}<//>`)}
            <//>
          `
        : null}
    <//>
  `;
}

function ModalOption({label, description, selected}) {
  return html`
    <${Box}
      backgroundColor=${selected ? COLORS.selectedBg : COLORS.panelSoft}
      paddingX=${1}
      marginBottom=${1}
      flexDirection="column"
    >
      <${Text} color=${selected ? COLORS.text : COLORS.muted}>
        ${selected ? '› ' : '  '}${label}
      <//>
      <${Text} color=${COLORS.muted}>${description}<//>
    <//>
  `;
}

function SkillScreen({skill, previewMode, agent, columns, relatedSkills = []}) {
  const previewLines = formatPreviewLines(skill.markdown, 12);
  const installCommand = `npx ai-agent-skills install ${skill.name} --agent ${agent}`;
  const skillsSpec = getSkillsInstallSpec(skill, agent);
  const wideLayout = columns >= 138;
  const leftWidth = wideLayout ? clamp(Math.floor(columns * 0.23), 28, 34) : null;
  const rightWidth = wideLayout ? clamp(Math.floor(columns * 0.27), 30, 38) : null;
  const detailWidth = wideLayout
    ? Math.max(48, columns - leftWidth - rightWidth - 6)
    : clamp(columns - 2, 46, 96);
  const collectionLine = (skill.collections || []).length > 0
    ? `Shelf: ${(skill.collections || []).join(', ')}`
    : 'Shelf: Searchable in the library even without a promoted shelf.';
  const relationLine = relatedSkills.length > 0
    ? `Also look at: ${relatedSkills.map((candidate) => candidate.title).join(', ')}`
    : 'Also look at: Explore the rest of this shelf from the collection and work area views.';
  const leftRail = html`
    <${Box} width=${leftWidth} marginRight=${1} flexDirection="column">
      <${Inspector}
        title="Shelf position"
        eyebrow="Where this lives in the library"
        lines=${[
          collectionLine,
          `Work area: ${skill.workAreaTitle} / ${skill.branchTitle}`,
          `House relationship: ${skill.origin} · ${skill.syncMode} · ${skill.trust}`,
        ]}
        footer="This keeps the skill legible as part of a bigger shelf, not an isolated file."
        variant="rail"
      />
      <${Inspector}
        title="Also look at"
        eyebrow="Closest neighboring skills"
        lines=${relatedSkills.length > 0
          ? relatedSkills.map((candidate) => `${candidate.title} · ${candidate.workAreaTitle} / ${candidate.branchTitle}`)
          : ['Explore the rest of this shelf from the collection and work area views.']}
        footer="Nearby recommendations prefer the same work area, then the same shelf."
        variant="rail"
      />
    <//>
  `;
  const centerColumn = html`
    <${Box} width=${detailWidth} marginRight=${wideLayout ? 1 : 0} flexDirection="column">
      <${AtlasTile}
        width=${detailWidth}
        minHeight=${12}
        selected=${true}
        title=${skill.title}
        count=${skill.trust}
        description=${skill.description}
        chips=${[skill.sourceTitle, skill.origin, skill.syncMode, ...(skill.collections || []).slice(0, wideLayout ? 2 : 1)]}
        footerLeft=${skill.lastVerified ? `verified ${skill.lastVerified}` : `sync ${skill.syncMode}`}
        footerRight="Catalog card"
        sampleLines=${[skill.whyHere]}
      />
      <${Inspector}
        title=${previewMode ? 'Bundled preview' : 'Library note'}
        eyebrow=${previewMode ? 'Bundled SKILL.md excerpt' : 'Why this earns shelf space'}
        lines=${previewMode
          ? previewLines
          : [
              skill.description,
              skill.whyHere,
              relationLine,
            ]}
        footer=${previewMode
          ? 'Press p to close preview · i to open install choices'
          : 'This is the editorial note that makes the shelf feel curated, not dumped.'}
      />
    <//>
  `;
  const rightRail = html`
    <${Box} width=${rightWidth} flexDirection="column">
      <${Inspector}
        title=${previewMode ? 'Primary install' : 'Install'}
        eyebrow="Recommended action"
        lines=${[
          'Use the vendored library copy for the stable install path.',
          `Source repo: ${skill.source}`,
          skillsSpec ? 'skills.sh is available if you want to install directly from the upstream repo.' : 'This skill currently installs through the curated library path only.',
        ]}
        command=${installCommand}
        footer="Press i to choose install path · o opens the upstream source"
        variant="rail"
      />
      ${skillsSpec
        ? html`
            <${Inspector}
              title="Alternate install path"
              eyebrow="skills.sh"
              lines=${[
                'Use the open skills CLI to install this skill directly from its upstream repository.',
              ]}
              command=${skillsSpec.command}
              footer="This path follows the external skills ecosystem instead of the vendored library copy."
              variant="rail"
            />
          `
        : null}
      <${Inspector}
        title="Provenance"
        eyebrow="Trust and lineage"
        lines=${[
          `Origin: ${skill.origin} · Sync mode: ${skill.syncMode}`,
          `Source URL: ${compactText(skill.sourceUrl, wideLayout ? 54 : 72)}`,
          `Collections: ${(skill.collections || []).join(', ') || 'none'}`,
        ]}
        footer="The library keeps provenance visible so installs still feel trustworthy."
        variant="rail"
      />
    <//>
  `;

  return html`
    <${Box} flexDirection="column">
      <${ActionBar}
        items=${[
          {label: 'i Install this skill', primary: true},
          {label: previewMode ? 'p Hide preview' : 'p Preview bundled SKILL.md'},
          {label: 'o Open upstream'},
        ]}
      />
      ${wideLayout
        ? html`
            <${Box} flexDirection="row" alignItems="flex-start">
              ${leftRail}
              ${centerColumn}
              ${rightRail}
            <//>
          `
        : html`
            <${Box} flexDirection="column">
              ${centerColumn}
              <${Inspector}
                title="Install"
                eyebrow="Recommended action"
                lines=${[
                  'Use the vendored library copy for the stable install path.',
                  `Source repo: ${skill.source}`,
                  skillsSpec ? 'skills.sh is also available if you want the upstream repository path.' : relationLine,
                ]}
                command=${installCommand}
                footer="Press i to choose install path · o opens the upstream source"
              />
              ${skillsSpec
                ? html`
                    <${Inspector}
                      title="Alternate install path"
                      eyebrow="skills.sh"
                      lines=${['Use the open skills CLI to install this skill directly from its upstream repository.']}
                      command=${skillsSpec.command}
                      footer="This path follows the external skills ecosystem instead of the vendored library copy."
                    />
                  `
                : null}
              <${Inspector}
                title="Shelf position"
                eyebrow="Where this lives in the library"
                lines=${[
                  collectionLine,
                  `Work area: ${skill.workAreaTitle} / ${skill.branchTitle}`,
                  `Origin: ${skill.origin} · Sync mode: ${skill.syncMode} · Trust: ${skill.trust}`,
                ]}
                footer="The library keeps provenance and placement visible on purpose."
              />
              <${Inspector}
                title="Also look at"
                eyebrow="Closest neighboring skills"
                lines=${relatedSkills.length > 0
                  ? relatedSkills.map((candidate) => `${candidate.title} · ${candidate.workAreaTitle} / ${candidate.branchTitle}`)
                  : ['Explore the rest of this shelf from the collection and work area views.']}
                footer="Nearby recommendations prefer the same work area, then the same shelf."
              />
            <//>
          `}
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
          description: 'Use the official open skills CLI against the upstream repository.',
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
    <${ModalShell}
      width=${chooserWidth}
      title=${`Install ${skill.title}`}
      subtitle="Choose the curated library path or the upstream skills.sh install when it exists."
      footerLines=${['Enter chooses · Esc closes the chooser']}
    >
      <${Box} marginTop=${1} flexDirection="column">
        ${options.map((option, index) => html`
          <${ModalOption}
            key=${option.id}
            selected=${index === selectedIndex}
            label=${option.label}
            description=${option.description}
          />
        `)}
      <//>
      ${selected.command
        ? html`
            <${Box} marginTop=${1} backgroundColor=${COLORS.panelRaised} paddingX=${1}>
              <${Text} color=${COLORS.muted}>${selected.command}<//>
            <//>
          `
        : null}
    <//>
  `;
}

function buildBreadcrumbs(rootMode, stack, catalog) {
  const rootLabel = rootMode === 'collections'
    ? 'Collections'
    : rootMode === 'areas'
      ? 'Work Areas'
      : 'Source Repos';
  const trail = ['Atlas', rootLabel];

  for (const entry of stack.slice(1)) {
    if (entry.type === 'collection') {
      const collection = catalog.collections.find((candidate) => candidate.id === entry.collectionId);
      if (collection) trail.push(collection.title);
      continue;
    }

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

function getCollectionItems(catalog) {
  return catalog.collections.map((collection) => ({
    id: collection.id,
    title: collection.title,
    count: `${collection.skillCount} skills`,
    description: collection.description,
    chips: collection.workAreaTitles.slice(0, 3),
    sampleLines: collection.skills.slice(0, 2).map((skill) => `${skill.title} · ${skill.sourceTitle}`),
    footerLeft: `${collection.verifiedCount} verified`,
    footerRight: 'Enter to open',
  }));
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
    description: sourceNoteFor(source.slug, source.slug),
    chips: source.branches.slice(0, 2).map((branch) => `${branch.areaTitle} / ${branch.title}`),
    sampleLines: source.skills.slice(0, 2).map((skill) => skill.title),
    footerLeft: `${source.areaCount} areas · ${source.branchCount} branches`,
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
    count: skill.verified ? 'verified' : skill.origin,
    description: skill.whyHere || skill.description,
    chips: [skill.sourceTitle, skill.syncMode],
    footerLeft: `${skill.workAreaTitle} / ${skill.branchTitle}`,
    footerRight: 'Enter to inspect',
  }));
}

function getCollectionSkillItems(collection) {
  return collection.skills.map((skill) => ({
    id: skill.name,
    title: skill.title,
    count: skill.verified ? 'verified' : skill.origin,
    description: skill.whyHere || skill.description,
    chips: [skill.workAreaTitle, skill.sourceTitle],
    footerLeft: `${skill.branchTitle} · ${skill.syncMode}`,
    footerRight: 'Enter to inspect',
  }));
}

function filterPaletteItems(items, query) {
  const needle = query.trim().toLowerCase();
  if (!needle) return items;
  return items.filter((item) => `${item.label} ${item.detail}`.toLowerCase().includes(needle));
}

function App({catalog, agent, onExit}) {
  const {exit} = useApp();
  const {stdout} = useStdout();
  const {columns, rows} = resolveTerminalSize(stdout);

  const [rootMode, setRootMode] = useState('collections');
  const [stack, setStack] = useState([{type: 'home'}]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [homeSectionIndex, setHomeSectionIndex] = useState(0);
  const [homeSelections, setHomeSelections] = useState({});
  const [searchMode, setSearchMode] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [paletteQuery, setPaletteQuery] = useState('');
  const [paletteIndex, setPaletteIndex] = useState(0);
  const [previewMode, setPreviewMode] = useState(false);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [chooserIndex, setChooserIndex] = useState(0);
  const [themeIndex, setThemeIndex] = useState(0);

  useEffect(() => {
    applyTheme(themeIndex);
  }, [themeIndex]);

  const current = stack[stack.length - 1];
  const activeTheme = THEMES[themeIndex] || THEMES[0];

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return catalog.skills
      .filter((skill) => skill.searchText.includes(q))
      .sort((left, right) => {
        const score = (skill) => {
          let value = 0;
          const lowerTitle = skill.title.toLowerCase();
          if (skill.name.toLowerCase() === q) value += 5000;
          else if (skill.name.toLowerCase().startsWith(q)) value += 3200;
          else if (skill.name.toLowerCase().includes(q)) value += 1800;
          if (lowerTitle.startsWith(q)) value += 1400;
          else if (lowerTitle.includes(q)) value += 800;
          if ((skill.tags || []).some((tag) => tag.toLowerCase() === q)) value += 900;
          else if ((skill.tags || []).some((tag) => tag.toLowerCase().includes(q))) value += 300;
          value += skill.curationScore || 0;
          return value;
        };

        return score(right) - score(left) || left.title.localeCompare(right.title);
      });
  }, [catalog.skills, query]);

  const currentArea = current.type === 'area' || current.type === 'branch'
    ? catalog.areas.find((area) => area.id === current.areaId)
    : null;
  const currentCollection = current.type === 'collection'
    ? catalog.collections.find((collection) => collection.id === current.collectionId)
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
  const curatedHomeSections = useMemo(() => {
    const myPicks = catalog.collections.find((collection) => collection.id === 'my-picks');
    const featuredSkills = catalog.skills.filter((skill) => skill.featured).slice(0, 6);

    return [
      {
        id: 'my-picks',
        title: 'My Picks',
        subtitle: 'The first shelf someone should reach for on a fresh setup.',
        kind: 'skill',
        mode: 'skills',
        items: getSkillItems((myPicks?.skills || []).slice(0, 6)),
      },
      {
        id: 'featured',
        title: 'Featured Skills',
        subtitle: 'High-signal skills that make the library feel sharp immediately.',
        kind: 'skill',
        mode: 'skills',
        items: getSkillItems(featuredSkills),
      },
      {
        id: 'collections',
        title: 'Collections',
        subtitle: 'Curated shelves for the main kinds of work.',
        kind: 'collection',
        mode: 'default',
        items: getCollectionItems(catalog),
      },
      {
        id: 'areas',
        title: 'Browse by Work Area',
        subtitle: 'A structural view when you already know the kind of work.',
        kind: 'area',
        mode: 'default',
        items: getHomeItems(catalog),
      },
      {
        id: 'sources',
        title: 'Browse by Source Repo',
        subtitle: 'A provenance-first view when lineage matters more than category.',
        kind: 'source',
        mode: 'default',
        items: getSourceItems(catalog).slice(0, 6),
      },
    ].filter((section) => section.items.length > 0);
  }, [catalog]);

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

  const paletteItems = useMemo(() => {
    const items = [];

    items.push({id: 'go-collections', label: 'Collections', detail: 'Jump to curated collections', run: () => {
      setRootMode('collections');
      setStack([{type: 'home'}]);
      setSelectedIndex(0);
      setPreviewMode(false);
    }});
    items.push({id: 'go-areas', label: 'Work Areas', detail: 'Jump to work area taxonomy', run: () => {
      setRootMode('areas');
      setStack([{type: 'home'}]);
      setSelectedIndex(0);
      setPreviewMode(false);
    }});
    items.push({id: 'go-sources', label: 'Source Repos', detail: 'Jump to source provenance view', run: () => {
      setRootMode('sources');
      setStack([{type: 'home'}]);
      setSelectedIndex(0);
      setPreviewMode(false);
    }});
    items.push({id: 'search', label: 'Search', detail: 'Find a skill across the entire library', run: () => {
      setSearchMode(true);
      setQuery('');
      setSelectedIndex(0);
    }});
    items.push({id: 'theme-cycle', label: 'Cycle house theme', detail: `Current theme: ${activeTheme.label}`, run: () => {
      setThemeIndex((value) => (value + 1) % THEMES.length);
    }});

    if (rootMode === 'collections' && current.type === 'home') {
      items.push({id: 'go-my-picks', label: 'My Picks', detail: 'Jump to the default starter shelf', run: () => {
        setHomeSectionIndex(0);
      }});
      items.push({id: 'go-featured', label: 'Featured Skills', detail: 'Jump to the strongest highlighted skills', run: () => {
        setHomeSectionIndex(1);
      }});
    }

    if (stack.length > 1) {
      items.push({id: 'back', label: 'Back', detail: 'Move one level up in the atlas', run: () => {
        setStack((currentStack) => currentStack.slice(0, -1));
        setSelectedIndex(0);
        setPreviewMode(false);
      }});
    }

    if (currentSkill) {
      items.push({id: 'install', label: 'Install Skill', detail: 'Open install choices for the focused skill', run: () => {
        setChooserOpen(true);
        setChooserIndex(0);
      }});
      items.push({id: 'toggle-preview', label: previewMode ? 'Hide Preview' : 'Show Preview', detail: 'Toggle the SKILL.md preview', run: () => {
        setPreviewMode((value) => !value);
      }});
      items.push({id: 'open-upstream', label: 'Open Upstream', detail: 'Open the source repo URL in the browser', run: () => {
        spawnSync('open', [currentSkill.sourceUrl], {stdio: 'ignore'});
      }});
    }

    items.push({id: 'help', label: 'Help', detail: 'Show keyboard help', run: () => {
      setHelpOpen(true);
    }});

    return items;
  }, [activeTheme.label, current.type, currentSkill, previewMode, rootMode, stack.length]);

  const filteredPaletteItems = useMemo(
    () => filterPaletteItems(paletteItems, paletteQuery),
    [paletteItems, paletteQuery]
  );

  const closePalette = () => {
    setPaletteOpen(false);
    setPaletteQuery('');
    setPaletteIndex(0);
  };

  const setHomeSelection = (sectionIndex, nextIndex) => {
    setHomeSelections((currentSelections) => ({
      ...currentSelections,
      [sectionIndex]: nextIndex,
    }));
  };

  const openHomeItem = (section, itemIndex) => {
    const item = section?.items?.[itemIndex];
    if (!item) return;

    if (section.kind === 'skill') {
      setStack((currentStack) => [...currentStack, {type: 'skill', skillName: item.id}]);
      setPreviewMode(false);
      return;
    }

    if (section.kind === 'collection') {
      setStack((currentStack) => [...currentStack, {type: 'collection', collectionId: item.id}]);
      return;
    }

    if (section.kind === 'area') {
      setStack((currentStack) => [...currentStack, {type: 'area', areaId: item.id}]);
      return;
    }

    if (section.kind === 'source') {
      setStack((currentStack) => [...currentStack, {type: 'source', sourceSlug: item.id}]);
    }
  };

  useInput((input, key) => {
    if (helpOpen) {
      if (input === 'q' || input === '?' || key.escape) {
        setHelpOpen(false);
      }
      return;
    }

    if (paletteOpen) {
      if (input === 'q') {
        onExit(null);
        exit();
        return;
      }

      if (key.escape) {
        closePalette();
        return;
      }

      if (key.upArrow || input === 'k') {
        setPaletteIndex((value) => clamp(value - 1, 0, Math.max(0, filteredPaletteItems.length - 1)));
        return;
      }

      if (key.downArrow || input === 'j') {
        setPaletteIndex((value) => clamp(value + 1, 0, Math.max(0, filteredPaletteItems.length - 1)));
        return;
      }

      if (key.return) {
        const item = filteredPaletteItems[paletteIndex];
        if (!item) return;
        closePalette();
        item.run();
      }
      return;
    }

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

    if (input === '?') {
      setHelpOpen(true);
      return;
    }

    if (input === ':') {
      setPaletteOpen(true);
      setPaletteQuery('');
      setPaletteIndex(0);
      return;
    }

    if (input === 't') {
      setThemeIndex((value) => (value + 1) % THEMES.length);
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
      if (input === 'c') {
        setRootMode('collections');
        setSelectedIndex(0);
        setHomeSectionIndex(0);
        return;
      }
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

      if (rootMode === 'collections') {
        const sectionCount = curatedHomeSections.length;
        const currentSection = curatedHomeSections[homeSectionIndex];
        const currentItemCount = currentSection?.items?.length || 0;
        const currentHomeIndex = homeSelections[homeSectionIndex] || 0;

        if (key.upArrow || input === 'k') {
          setHomeSectionIndex((value) => clamp(value - 1, 0, Math.max(0, sectionCount - 1)));
          return;
        }

        if (key.downArrow || input === 'j') {
          setHomeSectionIndex((value) => clamp(value + 1, 0, Math.max(0, sectionCount - 1)));
          return;
        }

        if (key.leftArrow || input === 'h') {
          setHomeSelection(homeSectionIndex, clamp(currentHomeIndex - 1, 0, Math.max(0, currentItemCount - 1)));
          return;
        }

        if (key.rightArrow || input === 'l') {
          setHomeSelection(homeSectionIndex, clamp(currentHomeIndex + 1, 0, Math.max(0, currentItemCount - 1)));
          return;
        }

        if (key.return) {
          openHomeItem(currentSection, currentHomeIndex);
          setSelectedIndex(0);
        }
        return;
      }

      const itemCount = rootMode === 'areas' ? catalog.areas.length : catalog.sources.length;
      const columnsPerRow = getColumnsPerRow(columns);

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
      if (current.type === 'collection' && currentCollection) return currentCollection.skills;
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

    if (current.type === 'collection' && currentCollection && currentCollection.skills[selectedIndex]) {
      setStack((currentStack) => [...currentStack, {type: 'skill', skillName: currentCollection.skills[selectedIndex].name}]);
      setSelectedIndex(0);
      setPreviewMode(false);
      return;
    }

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
          metaItems=${[`${catalog.total} skills`, `${catalog.collections.length} collections`, `${catalog.sources.length} source repos`, activeTheme.label]}
          hint="Enter opens a skill · Esc closes search"
        />
        <${SearchOverlay}
          query=${query}
          setQuery=${setQuery}
          results=${searchResults}
          selectedIndex=${selectedIndex}
          columns=${columns}
        />
      <//>
    `;
  } else if (current.type === 'home') {
    if (rootMode === 'collections') {
      const currentSection = curatedHomeSections[homeSectionIndex] || curatedHomeSections[0];
      const currentHomeIndex = homeSelections[homeSectionIndex] || 0;
      const selectedHomeItem = currentSection?.items?.[currentHomeIndex] || currentSection?.items?.[0];

      body = html`
        <${Box} flexDirection="column">
          <${Header}
            breadcrumbs=${breadcrumbs}
            title="Start from the curated shelves"
            subtitle="Lead with taste first. Then drop into the work areas, branches, and source lineage underneath."
            metaItems=${[`${catalog.total} skills`, `${catalog.collections.length} collections`, `${catalog.areas.length} work areas`, `${catalog.sources.length} sources`, `target ${agent}`, activeTheme.label]}
            hint="Up/down changes shelves · Left/right moves within a shelf · Enter opens · : command palette"
          />
          <${ModeTabs} rootMode=${rootMode} />
          ${curatedHomeSections.map((section, index) => html`
            <${Box} key=${section.id} flexDirection="column" marginBottom=${1}>
              ${index === homeSectionIndex
                ? html`
                    <${ShelfHero}
                      section=${section}
                      selectedItem=${section.items[homeSelections[index] || 0] || section.items[0]}
                      columns=${columns}
                      selectedIndex=${homeSelections[index] || 0}
                    />
                  `
                : html`
                    <${CompactShelfPreview}
                      title=${section.title}
                      subtitle=${section.subtitle}
                      active=${false}
                      summary=${`${section.items.length} items · ${section.items.slice(0, 3).map((item) => item.title).join(', ')}`}
                    />
                  `}
            <//>
          `)}
          ${columns < 138 && selectedHomeItem
            ? html`
                <${Inspector}
                  title=${selectedHomeItem.title}
                  eyebrow=${currentSection.kind === 'skill'
                    ? 'Curated skill'
                    : currentSection.kind === 'collection'
                      ? 'Curated shelf'
                      : currentSection.kind === 'area'
                        ? 'Browse by work area'
                        : 'Browse by source repo'}
                  lines=${[
                    selectedHomeItem.description,
                    ...(selectedHomeItem.sampleLines || []),
                  ]}
                  footer="Enter opens the focused item"
                />
              `
            : null}
        <//>
      `;
    } else {
      const homeItems = rootMode === 'areas' ? getHomeItems(catalog) : getSourceItems(catalog);
      const selectedHomeItem = homeItems[selectedIndex] || homeItems[0];
      body = html`
        <${Box} flexDirection="column">
          <${Header}
            breadcrumbs=${breadcrumbs}
            title=${rootMode === 'areas' ? 'Move through the work areas' : 'Move through the source atlas'}
            subtitle=${rootMode === 'areas'
              ? 'Start with the kind of work, then move into branches and skills.'
              : 'Browse trusted source repos and the lanes they feed into the library.'}
            metaItems=${[`${catalog.total} skills`, `${catalog.collections.length} collections`, `${catalog.areas.length} work areas`, `${catalog.sources.length} sources`, `target ${agent}`, activeTheme.label]}
            hint="Arrow keys move · Enter drills in · / searches · : command palette"
          />
          <${ModeTabs} rootMode=${rootMode} />
          <${AtlasGrid}
            items=${homeItems}
            selectedIndex=${selectedIndex}
            columns=${columns}
            rows=${rows}
            reservedRows=${11}
          />
          ${selectedHomeItem
            ? html`
                <${Inspector}
                  title=${selectedHomeItem.title}
                  eyebrow=${rootMode === 'areas' ? 'Work area' : 'Source repo'}
                  lines=${[
                    selectedHomeItem.description,
                    ...(selectedHomeItem.sampleLines || []),
                  ]}
                  footer="Enter opens the focused tile"
                />
              `
            : null}
        <//>
      `;
    }
  } else if (current.type === 'collection' && currentCollection) {
    const selectedSkill = currentCollection.skills[selectedIndex] || currentCollection.skills[0];
    const startHereSkills = currentCollection.skills.slice(0, 3);
    const startHere = startHereSkills.map((skill) => skill.title).join(', ');
    body = html`
      <${Box} flexDirection="column">
        <${Header}
          breadcrumbs=${breadcrumbs}
          title=${currentCollection.title}
          subtitle=${currentCollection.description}
          metaItems=${[
            `${currentCollection.skillCount} skills`,
            `${currentCollection.verifiedCount} verified`,
            `${currentCollection.authoredCount} authored`,
            ...currentCollection.workAreaTitles.slice(0, 3),
            activeTheme.label,
          ]}
          hint="Arrow keys move across skills · Enter opens a skill · b goes back"
        />
        <${Inspector}
          title="Start here"
          eyebrow="Pinned first picks for this shelf"
          lines=${[
            startHere,
            `Main sources: ${currentCollection.sourceTitles.join(', ')}`,
          ]}
          footer="These are the fastest entry points before you browse the full shelf."
        />
        <${ShelfStrip}
          items=${getCollectionSkillItems({skills: startHereSkills})}
          selectedIndex=${0}
          columns=${columns}
          mode="skills"
          active=${false}
          compact=${true}
        />
        <${Box} marginTop=${1}>
          <${AtlasGrid}
            items=${getCollectionSkillItems(currentCollection)}
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
                eyebrow=${`${selectedSkill.workAreaTitle} · ${selectedSkill.sourceTitle} · ${selectedSkill.trust}`}
                lines=${[selectedSkill.description, selectedSkill.whyHere]}
                footer="Enter opens the focused skill"
              />
            `
          : null}
      <//>
    `;
  } else if (current.type === 'area' && currentArea) {
    const selectedBranch = currentArea.branches[selectedIndex] || currentArea.branches[0];
    body = html`
      <${Box} flexDirection="column">
        <${Header}
          breadcrumbs=${breadcrumbs}
          title=${currentArea.title}
          subtitle=${currentArea.description}
          metaItems=${[`${currentArea.skillCount} skills`, `${currentArea.branches.length} branches`, `${currentArea.repoCount} repos`, activeTheme.label]}
          hint="Arrow keys move across lanes · Enter opens a branch · b goes back"
        />
        <${Box} marginTop=${1}>
          <${AtlasGrid}
            items=${getAreaItems(currentArea)}
            selectedIndex=${selectedIndex}
            columns=${columns}
            rows=${rows}
            reservedRows=${10}
          />
        <//>
        ${selectedBranch
          ? html`
              <${Inspector}
                title=${selectedBranch.title}
                eyebrow="Lane preview"
                lines=${[
                  `Carries ${selectedBranch.skillCount} skills from ${selectedBranch.repoCount} source repos.`,
                  `Examples: ${selectedBranch.skills.slice(0, 2).map((skill) => skill.title).join(', ')}`,
                ]}
                footer="Enter opens the focused branch"
              />
            `
          : null}
      <//>
    `;
  } else if (current.type === 'source' && currentSource) {
    const selectedBranch = currentSource.branches[selectedIndex] || currentSource.branches[0];
    const topImports = currentSource.skills.slice(0, 3).map((skill) => skill.title).join(', ');
    body = html`
      <${Box} flexDirection="column">
        <${Header}
          breadcrumbs=${breadcrumbs}
          title=${currentSource.title}
          subtitle=${sourceNoteFor(currentSource.slug, 'A source view of the atlas: what this repo actually contributes.')}
          metaItems=${[`${currentSource.skillCount} skills`, `${currentSource.branchCount} branches`, `${currentSource.mirrorCount} mirrors`, `${currentSource.snapshotCount} snapshots`, activeTheme.label]}
          hint="Arrow keys move across lanes · Enter opens a branch · b goes back"
        />
        <${Box} marginTop=${1}>
          <${AtlasGrid}
            items=${getSourceBranchItems(currentSource)}
            selectedIndex=${selectedIndex}
            columns=${columns}
            rows=${rows}
            reservedRows=${10}
          />
        <//>
        ${selectedBranch
          ? html`
              <${Inspector}
                title=${selectedBranch.title}
                eyebrow="Source contribution"
                lines=${[
                  sourceNoteFor(currentSource.slug, `${currentSource.title} contributes ${selectedBranch.skillCount} skills into ${selectedBranch.areaTitle}.`),
                  `Top imports here: ${topImports}`,
                  `This branch contributes ${selectedBranch.skillCount} skills into ${selectedBranch.areaTitle}.`,
                ]}
                footer="Enter opens the focused branch"
              />
            `
          : null}
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
          metaItems=${[`${currentBranch.skillCount} skills`, `${currentBranch.repoCount} repos`, ...currentBranch.repoTitles.slice(0, 2), activeTheme.label]}
          hint="Arrow keys move across skills · Enter opens a skill · b goes back"
        />
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
          metaItems=${[`${currentSourceBranch.skillCount} skills`, currentSourceBranch.areaTitle, currentSource.title, activeTheme.label]}
          hint="Arrow keys move across skills · Enter opens a skill · b goes back"
        />
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
    const relatedSkills = getSiblingRecommendations(catalog, currentSkill, 3);
    body = html`
      <${Box} flexDirection="column">
        <${Header}
          breadcrumbs=${breadcrumbs}
          title=${currentSkill.title}
          subtitle=${`${currentSkill.sourceTitle} · ${currentSkill.trust} · ${currentSkill.syncMode}`}
          metaItems=${[
            currentSkill.workAreaTitle,
            currentSkill.branchTitle,
            ...(currentSkill.collections || []).slice(0, 2),
            currentSkill.lastVerified ? `verified ${currentSkill.lastVerified}` : `origin ${currentSkill.origin}`,
            activeTheme.label,
          ]}
          hint="i opens install choices · p toggles preview · o opens upstream"
        />
        <${SkillScreen} skill=${currentSkill} previewMode=${previewMode} agent=${agent} columns=${columns} relatedSkills=${relatedSkills} />
        ${chooserOpen
          ? html`<${InstallChooser} skill=${currentSkill} agent=${agent} selectedIndex=${chooserIndex} columns=${columns} />`
          : null}
      <//>
    `;
  }

  const footerHint = current.type === 'skill'
    ? '/ search · : palette · b back · i install · p preview · o upstream · t theme · ? help · q quit'
    : '/ search · : palette · Enter open · b back · c/w/r switch root views · t theme · ? help · q quit';
  const footerMode = current.type === 'skill'
    ? 'DETAIL'
    : current.type === 'home'
      ? rootMode.toUpperCase()
      : current.type.toUpperCase();
  const footerDetail = currentSkill
    ? `${currentSkill.title} · ${activeTheme.label}`
    : `${breadcrumbs[breadcrumbs.length - 1] || 'Curated library'} · ${activeTheme.label}`;

  return html`
    <${Box} flexDirection="column">
      ${helpOpen ? html`<${HelpOverlay} />` : null}
      ${paletteOpen ? html`<${PaletteOverlay} query=${paletteQuery} setQuery=${setPaletteQuery} items=${filteredPaletteItems} selectedIndex=${paletteIndex} />` : null}
      ${body}
      <${FooterBar} hint=${footerHint} mode=${footerMode} detail=${footerDetail} columns=${columns} />
    <//>
  `;
}

export async function launchTui({agent = 'claude'} = {}) {
  const catalog = buildCatalog();

  return await new Promise((resolve) => {
    render(html`<${App} catalog=${catalog} agent=${agent} onExit=${resolve} />`);
  });
}
