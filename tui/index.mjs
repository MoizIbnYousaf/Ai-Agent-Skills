import React, {useEffect, useMemo, useState} from 'react';
import {createRequire} from 'module';
import {spawnSync} from 'child_process';
import {Box, Text, render, useApp, useInput, useStdout} from 'ink';
import TextInput from 'ink-text-input';
import htm from 'htm';

const require = createRequire(import.meta.url);
const {buildCatalog, getInstallCommand, getInstallCommandForAgent, getSiblingRecommendations, getSkillsInstallSpec} = require('./catalog.cjs');

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

const CREATOR_HANDLE = '@moizibnyousaf';
const LIBRARY_SIGNATURE = "Moiz's Curated Agent Skills Library";
const LIBRARY_THESIS = 'Shelves, not search results.';
const LIBRARY_SUPPORT = 'Small enough to scan. Opinionated enough to trust.';

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

function wait(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function waitForStableTerminalSize(stdout, attempts = 4, intervalMs = 35) {
  let previous = resolveTerminalSize(stdout);

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await wait(intervalMs);
    const next = resolveTerminalSize(stdout);
    if (next.columns === previous.columns && next.rows === previous.rows) {
      return next;
    }
    previous = next;
  }

  return previous;
}

function enterInteractiveScreen(stdout) {
  if (!stdout?.isTTY) {
    return () => {};
  }

  const useAlternateScreen = process.env.TERM !== 'dumb';

  try {
    if (useAlternateScreen) {
      stdout.write('\u001B[?1049h');
    }
    stdout.write('\u001B[2J\u001B[H');
  } catch {}

  return () => {
    try {
      if (useAlternateScreen) {
        stdout.write('\u001B[?1049l');
      } else {
        stdout.write('\u001B[2J\u001B[H');
      }
    } catch {}
  };
}

function getViewportProfile({columns, rows}) {
  const tooSmall = columns < 60 || rows < 18;
  const micro = !tooSmall && (rows <= 26 || columns < 90);
  const compact = !tooSmall && !micro && (rows <= 34 || columns < 120);
  const tier = tooSmall ? 'too-small' : micro ? 'micro' : compact ? 'compact' : 'comfortable';

  return {
    columns,
    rows,
    tier,
    tooSmall,
    micro,
    compact: micro || compact,
    comfortable: tier === 'comfortable',
    showWideHero: tier === 'comfortable' && columns >= 138 && rows >= 34,
    showHeaderBreadcrumbs: !micro,
    showHeaderHint: tier === 'comfortable',
    showFooterHint: !micro,
    showInspector: tier === 'comfortable',
    maxMetaItems: tier === 'comfortable' ? 6 : compact ? 4 : 3,
  };
}

function getReservedRows(screen, viewport, {showInspector = false} = {}) {
  if (viewport.tooSmall) return 8;

  const base = viewport.micro
    ? 7
    : viewport.compact
      ? 9
      : 12;

  const screenExtra = (() => {
    switch (screen) {
      case 'home-grid':
        return viewport.compact ? 2 : 3;
      case 'collection':
      case 'skill-grid':
        return viewport.compact ? 2 : 6;
      case 'detail':
        return viewport.micro ? 5 : viewport.compact ? 7 : 10;
      default:
        return 0;
    }
  })();

  const inspectorExtra = showInspector ? (viewport.compact ? 0 : 6) : 0;
  return base + screenExtra + inspectorExtra;
}

function getVisibleHomeSectionIndices(sectionCount, activeIndex, viewport) {
  if (sectionCount <= 0) return [];
  if (viewport.micro) {
    const active = clamp(activeIndex, 0, sectionCount - 1);
    const visible = new Set([active]);
    if (active < sectionCount - 1) visible.add(active + 1);
    if (active > 0) visible.add(active - 1);
    if (visible.size < 3 && active < sectionCount - 2) visible.add(active + 2);
    if (visible.size < 3 && active > 1) visible.add(active - 2);
    return Array.from(visible).sort((left, right) => left - right);
  }
  if (!viewport.compact) return Array.from({length: sectionCount}, (_, index) => index);

  const active = clamp(activeIndex, 0, sectionCount - 1);
  const visible = new Set([active]);

  if (active > 0) visible.add(active - 1);
  if (visible.size < 3 && active < sectionCount - 1) visible.add(active + 1);
  if (visible.size < 3 && active > 1) visible.add(active - 2);
  if (visible.size < 3 && active < sectionCount - 2) visible.add(active + 2);

  return Array.from(visible).sort((left, right) => left - right);
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
  if (typeof markdown !== 'string' || markdown.length === 0) return '';
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

function getViewportState({items, selectedIndex, columns, rows, mode = 'default', compact = false, reservedRows = 12}) {
  const columnsPerRow = getColumnsPerRow(columns, mode);
  const gutter = columnsPerRow > 1 ? columnsPerRow - 1 : 0;
  const tileWidth = Math.max(
    mode === 'skills' ? 32 : 28,
    Math.floor((columns - gutter * 2) / columnsPerRow)
  );
  const tileHeight = compact
    ? mode === 'skills' ? 7 : 8
    : mode === 'skills' ? 11 : 12;
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

function Header({breadcrumbs, title, subtitle, hint, metaItems = [], viewport = null}) {
  const compact = Boolean(viewport?.compact);
  const showBreadcrumbs = viewport ? viewport.showHeaderBreadcrumbs : true;
  const visibleMetaItems = metaItems.slice(0, viewport?.maxMetaItems || metaItems.length);
  const compactMeta = compactText(visibleMetaItems.join(' · '), Math.max(36, (viewport?.columns || 80) - 4));
  const signatureText = viewport?.columns >= 112 ? LIBRARY_SIGNATURE : 'AI Agent Skills Library';
  const compactSubtitle = subtitle
    ? compactText(subtitle, Math.max(42, (viewport?.columns || 80) - 6))
    : '';
  const compactHint = hint
    ? compactText(hint, Math.max(40, (viewport?.columns || 80) - 8))
    : '';
  const breadcrumbText = showBreadcrumbs && breadcrumbs && breadcrumbs.length > 0
    ? compact
      ? breadcrumbs[breadcrumbs.length - 1]
      : breadcrumbs.join(' › ')
    : '';

  return html`
    <${Box} flexDirection="column" marginBottom=${compact ? 0 : 1}>
      <${Box} marginBottom=${compact ? 0 : 1} flexWrap="wrap">
        <${Text} color=${COLORS.accentSoft}>${signatureText}<//>
        ${breadcrumbText
          ? html`
              <${Text} color=${COLORS.border}> · <//>
              <${Text} color=${COLORS.muted}>${breadcrumbText}<//>
            `
          : null}
      <//>
      <${Text} bold color=${COLORS.text}>${title}<//>
      ${compactSubtitle ? html`<${Text} color=${COLORS.muted}>${compactSubtitle}<//>` : null}
      ${compactMeta
        ? html`
            <${Text} color=${COLORS.muted}>${compactMeta}<//>
          `
        : null}
      ${hint && (!viewport || viewport.showHeaderHint)
        ? html`
            <${Text} color=${COLORS.border}>${compact ? compactHint : hint}<//>
          `
        : null}
    <//>
  `;
}

function ModeTabs({rootMode, compact = false}) {
  return html`
    <${Box} marginBottom=${compact ? 0 : 1} flexWrap="wrap">
      ${[
        {id: 'collections', label: 'Home (h)'},
        {id: 'areas', label: 'Shelves (w)'},
        {id: 'sources', label: 'Sources (r)'},
      ].map((tab) => {
        const selected = tab.id === rootMode;
        return html`
          <${Box} key=${tab.id} marginRight=${2} marginBottom=${compact ? 0 : 1}>
            <${Text} color=${selected ? COLORS.accent : COLORS.border}>
              ${selected ? '• ' : '· '}
            <//>
            <${Text} bold=${selected} color=${selected ? COLORS.text : COLORS.muted}>
              ${tab.label}
            <//>
          <//>
        `;
      })}
    <//>
  `;
}

function FooterBar({hint, detail = 'Curated library', mode = 'ATLAS', columns = 120, viewport = null}) {
  const detailText = compactText(detail, Math.max(28, columns - 18));
  const hintText = compactText(hint, Math.max(34, columns - 4));
  return html`
    <${Box} marginTop=${viewport?.compact ? 0 : 1} flexDirection="column">
      <${Box}>
        <${Text} color=${COLORS.accentSoft}>${mode}<//>
        <${Text} color=${COLORS.border}> · <//>
        <${Text} color=${COLORS.muted}>${detailText}<//>
        ${viewport?.compact
          ? null
          : html`
              <${Text} color=${COLORS.border}> · <//>
              <${Text} color=${COLORS.border}>${CREATOR_HANDLE}<//>
            `}
      <//>
      ${viewport?.showFooterHint === false
        ? null
        : html`
            <${Text} color=${COLORS.border}>${hintText}<//>
          `}
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

function ChipRow({items, selected, compact = false}) {
  if (!items || items.length === 0) return null;

  return html`
    <${Box} flexWrap="wrap" marginTop=${compact ? 0 : 1}>
      ${items.map((item) => html`
        <${Box}
          key=${item}
          backgroundColor=${selected ? COLORS.chipActiveBg : COLORS.chipBg}
          paddingX=${1}
          marginRight=${1}
          marginBottom=${compact ? 0 : 1}
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
  const compactMode = Boolean(compact);
  const descriptionLimit = compact
    ? Math.max(26, width - 10)
    : selected
      ? Math.max(54, width * 2)
      : Math.max(26, width - 8);
  const displayedDescription = description ? compactText(description, descriptionLimit) : '';
  const visibleChips = compactMode
    ? (chips || []).slice(0, selected ? 2 : 1)
    : chips;
  const displayedSamples = sampleLines && sampleLines.length > 0
    ? sampleLines.slice(0, compact ? 1 : selected ? 2 : 1).map((line) => compactText(line, Math.max(24, width - 8)))
    : [];
  const compactFooterLeft = compactMode ? compactText(footerLeft || '', Math.max(16, width - 20)) : footerLeft;
  const compactFooterRight = compactMode ? compactText(footerRight || '', Math.max(12, Math.floor(width / 3))) : footerRight;

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

      ${visibleChips && visibleChips.length > 0 ? html`<${ChipRow} items=${visibleChips} selected=${selected} compact=${compactMode} />` : null}

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
        <${Text} color=${COLORS.muted}>${compactFooterLeft || ''}<//>
        <${Text} color=${selected ? COLORS.accent : COLORS.muted}>${compactFooterRight || ''}<//>
      <//>
    <//>
  `;
}

function AtlasGrid({items, selectedIndex, columns, rows, mode = 'default', reservedRows = 12, compact = false}) {
  const viewport = getViewportState({
    items,
    selectedIndex,
    columns,
    rows,
    mode,
    compact,
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
            compact=${compact}
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

function getStripState({items, selectedIndex, columns, mode = 'default', compact = false, forceVisibleCount = null}) {
  const visibleCount = forceVisibleCount || (compact
    ? columns >= 120 ? 2 : 1
    : columns >= 160 ? 4 : columns >= 118 ? 3 : 2);
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

function ShelfStrip({items, selectedIndex, columns, mode = 'default', active = true, compact = false, forceVisibleCount = null}) {
  const viewport = getStripState({items, selectedIndex, columns, mode, compact, forceVisibleCount});

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

function CompactShelfPreview({title, subtitle, active, summary, compact = false}) {
  return html`
    <${Box} marginTop=${compact ? 0 : 1} marginBottom=${compact ? 0 : 1} flexDirection="column">
      <${Text} bold=${active} color=${active ? COLORS.text : COLORS.muted}>
        ${active ? '› ' : '· '}${title}
      <//>
      ${compact ? null : html`<${Text} color=${COLORS.border}>${compactText(subtitle, 120)}<//>`}
      <${Text} color=${COLORS.muted}>${compactText(summary, 120)}<//>
      ${compact ? null : html`<${Text} color=${COLORS.border}>${'─'.repeat(72)}<//>`}
    <//>
  `;
}

function getHeroHighlights(section, selectedItem, selectedIndex = 0, limit = 4) {
  if (!section || !Array.isArray(section.items) || section.items.length === 0) return [];
  const around = [];
  const active = clamp(selectedIndex, 0, section.items.length - 1);
  around.push(section.items[active]);
  for (let offset = 1; around.length < limit && (active - offset >= 0 || active + offset < section.items.length); offset += 1) {
    if (active + offset < section.items.length) around.push(section.items[active + offset]);
    if (around.length >= limit) break;
    if (active - offset >= 0) around.push(section.items[active - offset]);
  }
  return around
    .filter(Boolean)
    .map((item) => item.title)
    .filter((value, index, values) => values.indexOf(value) === index)
    .slice(0, limit);
}

function ShelfHero({section, selectedItem, columns, selectedIndex = 0, viewport = null}) {
  if (!section || !selectedItem) return null;

  const profile = viewport || getViewportProfile({columns, rows: 40});
  const highlights = getHeroHighlights(section, selectedItem, selectedIndex, profile.micro ? 3 : 4);
  const metaLine = compactText(
    [
      section.title,
      selectedItem.count,
      selectedItem.footerLeft,
    ].filter(Boolean).join(' · '),
    Math.max(36, columns - 4)
  );
  const note = compactText(
    selectedItem.description || selectedItem.sampleLines?.[0] || section.subtitle,
    Math.max(42, columns - 4)
  );
  const secondaryLines = (selectedItem.sampleLines || []).slice(0, profile.micro ? 1 : 2);
  const supportLine = highlights.length > 0
    ? compactText(`${section.kind === 'area' ? 'Nearby shelves' : section.kind === 'source' ? 'Nearby sources' : 'Shelf picks'}: ${highlights.join(' · ')}`, Math.max(40, columns - 4))
    : '';

  return html`
    <${Box} flexDirection="column" marginBottom=${1}>
      <${Text} color=${COLORS.accentSoft}>${section.title}<//>
      <${Text} bold color=${COLORS.text}>${selectedItem.title}<//>
      ${metaLine ? html`<${Text} color=${COLORS.border}>${metaLine}<//>` : null}
      ${note ? html`<${Text} color=${COLORS.muted}>${note}<//>` : null}
      ${secondaryLines.map((line, index) => html`
        <${Text} key=${`${line}-${index}`} color=${COLORS.muted}>
          ${compactText(line, Math.max(38, columns - 4))}
        <//>
      `)}
      ${supportLine ? html`<${Text} color=${COLORS.accent}>${supportLine}<//>` : null}
      <${Text} color=${COLORS.border}>${profile.micro ? 'left/right switches picks · up/down changes sections' : 'left/right switches picks inside the lead block' }<//>
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

function SearchOverlay({query, setQuery, results, selectedIndex, columns, viewport = null}) {
  const width = clamp(columns - 6, 56, 110);
  const visibleResults = results.slice(0, viewport?.micro ? 4 : 8);
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
          : visibleResults.map((result, index) => html`
              <${ModalOption}
                key=${result.name}
                selected=${index === selectedIndex}
                label=${result.title}
                meta=${compactText(`${result.workAreaTitle} shelf · ${result.branchTitle} · ${result.sourceTitle} · ${getTierLabel(result)} / ${getDistributionLabel(result)}`, viewport?.micro ? 72 : 94)}
                description=${compactText(result.whyHere || result.description, viewport?.micro ? 72 : 94)}
              />
            `)}
      <//>
    <//>
  `;
}

function HelpOverlay({viewport = null}) {
  return html`
    <${ModalShell}
      width=${viewport?.micro ? 64 : 88}
      title="Atlas help"
      subtitle="Keyboard and navigation for the library view."
      footerLines=${['? or Esc closes help']}
    >
      <${Text} color=${COLORS.text}>Arrow keys move between shelves, picks, and source rails.<//>
      <${Text} color=${COLORS.text}>Enter opens the focused shelf or the focused pick.<//>
      <${Text} color=${COLORS.text}>/ opens library search, : opens the command palette, ? closes this help.<//>
      <${Text} color=${COLORS.text}>b or Esc goes back, i opens install choices, o opens upstream, q quits.<//>
      <${Text} color=${COLORS.text}>t cycles the house themes.<//>
      <${Text} color=${COLORS.muted}>Home is the curator-first shelf poster. Shelves and Sources stay available when you want the taxonomy underneath.<//>
    <//>
  `;
}

function PaletteOverlay({query, setQuery, items, selectedIndex, viewport = null}) {
  const visibleItems = viewport?.micro ? items.slice(0, 6) : items;
  return html`
    <${ModalShell}
      width=${viewport?.micro ? 66 : 86}
      title="Command palette"
      subtitle="Jump around the library and change the surface."
      footerLines=${['Enter runs the command · Esc closes the palette']}
    >
      <${Box} marginTop=${1}>
        <${Text} color=${COLORS.muted}>: <//>
        <${TextInput} value=${query} onChange=${setQuery} placeholder="search actions" />
      <//>
      <${Box} marginTop=${1} flexDirection="column">
        ${visibleItems.length === 0
          ? html`<${Text} color=${COLORS.muted}>No commands match.<//>`
          : visibleItems.map((item, index) => html`
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
          <${Text} bold color=${COLORS.text}>${title}<//>
          ${eyebrow ? html`<${Text} color=${COLORS.accentSoft}>${eyebrow}<//>` : null}
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
        <${Box} key=${item.label} marginRight=${index < items.length - 1 ? 2 : 0} marginBottom=${1}>
          <${Text} color=${item.primary ? COLORS.accent : COLORS.border}>${item.primary ? '• ' : '· '}<//>
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

function ModalOption({label, meta = '', description = '', selected}) {
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
      ${meta ? html`<${Text} color=${COLORS.border}>${meta}<//>` : null}
      ${description ? html`<${Text} color=${COLORS.muted}>${description}<//>` : null}
    <//>
  `;
}

function SkillScreen({skill, previewMode, scope, agent, columns, viewport = null, relatedSkills = []}) {
  const profile = viewport || getViewportProfile({columns, rows: 40});
  const previewLines = formatPreviewLines(skill.markdown, 12);
  const installCommand = agent
    ? getInstallCommandForAgent(skill, agent)
    : getInstallCommand(skill, scope || 'global');
  const skillsSpec = agent ? getSkillsInstallSpec(skill, agent) : null;
  const wideLayout = profile.showWideHero;
  const leftWidth = wideLayout ? clamp(Math.floor(columns * 0.23), 28, 34) : null;
  const rightWidth = wideLayout ? clamp(Math.floor(columns * 0.27), 30, 38) : null;
  const detailWidth = wideLayout
    ? Math.max(48, columns - leftWidth - rightWidth - 6)
    : clamp(columns - 2, 46, 96);
  const installSummary = getInstallSummary(skill);
  const whyHere = skill.whyHere || skill.description;
  const editorialLines = [
    whyHere,
    skill.description !== whyHere ? skill.description : null,
  ].filter(Boolean);
  const previewContent = previewLines.length > 0
    ? previewLines
    : ['No bundled SKILL.md is stored locally for this pick.', 'Use the install command or upstream link when you want the live source directly.'];
  const provenanceLines = getSkillProvenanceLines(skill, {wide: wideLayout});
  const neighboringLines = getNeighboringPickLines(relatedSkills);

  if (profile.micro) {
    return html`
      <${Box} flexDirection="column">
        <${ActionBar}
          items=${[
            {label: 'i Install', primary: true},
            {label: previewMode ? 'p Hide preview' : 'p Preview'},
            {label: 'o Upstream'},
          ]}
        />
        <${Inspector}
          title="Why it belongs"
          eyebrow="Editorial note"
          lines=${editorialLines}
          footer="This is the curator note first, so the page reads like a shelf pick before it reads like a utility screen."
          variant="rail"
        />
        ${previewMode
          ? html`
              <${Inspector}
                title="Bundled preview"
                eyebrow="SKILL.md excerpt"
                lines=${previewContent.slice(0, 5)}
                footer="Press p to close preview."
                variant="rail"
              />
            `
          : null}
        <${Inspector}
          title="Install"
          eyebrow="Next action"
          lines=${[
            installSummary,
            `${getTierLabel(skill)} / ${getDistributionLabel(skill)}`,
            provenanceLines[0],
          ]}
          command=${installCommand}
          footer="i install · p preview · o upstream"
          variant="rail"
        />
        <${Inspector}
          title="Provenance"
          eyebrow="Shelf and source"
          lines=${provenanceLines.slice(1)}
          footer=${neighboringLines[0]}
          variant="rail"
        />
      <//>
    `;
  }
  const centerColumn = html`
    <${Box} width=${detailWidth} marginRight=${wideLayout ? 1 : 0} flexDirection="column">
      <${Inspector}
        title="Why it belongs"
        eyebrow="Editorial note"
        lines=${editorialLines}
        footer="The first screen should explain why this earned a place on the shelf before it asks you to install anything."
      />
      ${previewMode
        ? html`
            <${Inspector}
              title="Bundled preview"
              eyebrow="SKILL.md excerpt"
              lines=${previewContent}
              footer="Press p to close preview · i to open install choices"
            />
          `
        : null}
    <//>
  `;
  const leftRail = html`
    <${Box} width=${leftWidth} marginRight=${1} flexDirection="column">
      <${Inspector}
        title="Provenance"
        eyebrow="Shelf and source"
        lines=${provenanceLines}
        footer="The library keeps placement and provenance visible so installs still feel trustworthy."
        variant="rail"
      />
      <${Inspector}
        title="Neighboring shelf picks"
        eyebrow="Closest useful neighbors"
        lines=${neighboringLines}
        footer="Nearby recommendations prefer the same work area, then the same shelf."
        variant="rail"
      />
    <//>
  `;
  const rightRail = html`
    <${Box} width=${rightWidth} flexDirection="column">
      <${Inspector}
        title="Install"
        eyebrow="Next action"
        lines=${[
          installSummary,
          `${getTierLabel(skill)} / ${getDistributionLabel(skill)}`,
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
        title="Source URL"
        eyebrow="Upstream provenance"
        lines=${[compactText(skill.sourceUrl, wideLayout ? 54 : 72)]}
        footer="o opens the upstream source in your browser."
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
                eyebrow="Next action"
                lines=${[
                  installSummary,
                  `${getTierLabel(skill)} / ${getDistributionLabel(skill)}`,
                  skillsSpec ? 'skills.sh is also available if you want the upstream repository path.' : 'Use the curated install path when you want the library copy and the shelf context.',
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
                title="Provenance"
                eyebrow="Shelf and source"
                lines=${provenanceLines}
                footer="The library keeps placement and provenance visible on purpose."
              />
              <${Inspector}
                title="Neighboring shelf picks"
                eyebrow="Closest useful neighbors"
                lines=${neighboringLines}
                footer="Nearby recommendations prefer the same work area, then the same shelf."
              />
            <//>
          `}
    <//>
  `;
}

function InstallChooser({skill, scope, agent, selectedIndex, columns, viewport = null}) {
  const skillsSpec = agent ? getSkillsInstallSpec(skill, agent) : null;
  const chooserWidth = clamp(columns - (viewport?.micro ? 4 : 2), 46, viewport?.micro ? 72 : 104);
  const installType = `${getTierLabel(skill)} / ${getDistributionLabel(skill)}`;
  const options = agent
    ? [
        {
          id: 'local',
          label: `Install to ${agent}`,
          meta: installType,
          description: `Use the curated library installer for the ${agent} agent path.`,
          command: getInstallCommandForAgent(skill, agent),
        },
        ...(skillsSpec
          ? [{
              id: 'skills',
              label: 'Install with skills.sh',
              meta: 'Upstream skills.sh path',
              description: 'Use the official open skills CLI against the upstream repository.',
              command: skillsSpec.command,
            }]
          : []),
        {
          id: 'open',
          label: 'Open upstream',
          meta: 'Browser action',
          description: 'Open the upstream source in the browser.',
          command: skill.sourceUrl,
        },
        {
          id: 'cancel',
          label: 'Cancel',
          meta: 'Stay here',
          description: 'Close the chooser and stay on this skill.',
          command: '',
        },
      ]
    : [
        {
          id: 'global',
          label: 'Global install',
          meta: installType,
          description: 'Install to ~/.claude/skills/ so it is available in every project.',
          command: getInstallCommand(skill, 'global'),
        },
        {
          id: 'project',
          label: 'Project install',
          meta: installType,
          description: 'Install to .agents/skills/ so the team can share the same shelf through git.',
          command: getInstallCommand(skill, 'project'),
        },
        {
          id: 'open',
          label: 'Open upstream',
          meta: 'Browser action',
          description: 'Open the upstream source in the browser.',
          command: skill.sourceUrl,
        },
        {
          id: 'cancel',
          label: 'Cancel',
          meta: 'Stay here',
          description: 'Close the chooser and stay on this skill.',
          command: '',
        },
      ];

  const selected = options[selectedIndex] || options[0];

  return html`
    <${ModalShell}
      width=${chooserWidth}
      title=${`Install ${skill.title}`}
      subtitle=${agent
        ? `Choose how to install this ${installType}.`
        : `Choose where to install this ${installType}.`}
      footerLines=${['Enter chooses · Esc closes the chooser']}
    >
      <${Box} marginTop=${1} flexDirection="column">
        ${options.map((option, index) => html`
          <${ModalOption}
            key=${option.id}
            selected=${index === selectedIndex}
            label=${option.label}
            meta=${option.meta}
            description=${option.description}
          />
        `)}
      <//>
      ${selected.command
        ? html`
            <${Box} marginTop=${1} flexDirection="column">
              <${Box} backgroundColor=${COLORS.panelRaised} paddingX=${1}>
                <${Text} color=${COLORS.border}>Command<//>
              <//>
              <${Box} backgroundColor=${COLORS.panelRaised} paddingX=${1}>
                <${Text} color=${COLORS.text}>${selected.command}<//>
              <//>
            <//>
          `
        : null}
    <//>
  `;
}

function buildBreadcrumbs(rootMode, stack, catalog) {
  const rootLabel = rootMode === 'collections'
    ? 'Home'
    : rootMode === 'areas'
      ? 'Shelves'
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
  return catalog.areas
    .filter((area) => area.skillCount > 0)
    .map((area) => ({
      id: area.id,
      title: area.title,
      count: `${area.skillCount} skills`,
      description: area.description,
      chips: area.branches.slice(0, 2).map((branch) => branch.title),
      sampleLines: [
        `Start with: ${catalog.skills
          .filter((skill) => skill.workArea === area.id)
          .slice(0, 4)
          .map((skill) => skill.title)
          .join(', ')}`,
      ],
      footerLeft: `${area.repoCount} repos · ${area.branches.length} branches`,
      footerRight: 'Enter to open',
    }));
}

function getTierSkillItems(catalog, tier, limit = 6) {
  return getSkillItems(
    catalog.skills
      .filter((skill) => skill.tier === tier)
      .slice(0, limit)
  );
}

function getTierLabel(skill) {
  return skill.tier === 'house' ? 'House copy' : 'Cataloged upstream';
}

function getDistributionLabel(skill) {
  return skill.distribution === 'bundled' ? 'Bundled install' : 'Live install';
}

function getInstallSummary(skill) {
  return skill.tier === 'house'
    ? 'Installs from the bundled house copy in this library.'
    : `Installs live from ${skill.installSource || skill.source}.`;
}

function getSkillProvenanceLines(skill, {wide = false} = {}) {
  return [
    `${skill.workAreaTitle} shelf · ${skill.branchTitle}`,
    `${getTierLabel(skill)} · ${getDistributionLabel(skill)} · ${skill.trust}`,
    `Source repo: ${skill.source}`,
    wide
      ? `Collections: ${(skill.collections || []).join(', ') || 'none'}`
      : `Collections: ${(skill.collections || []).slice(0, 2).join(', ') || 'none'}`,
  ];
}

function getNeighboringPickLines(relatedSkills) {
  if (!relatedSkills || relatedSkills.length === 0) {
    return ['Explore the rest of this shelf from the collection and work area views.'];
  }

  return relatedSkills.map((candidate) => `${candidate.title} · ${candidate.workAreaTitle} / ${candidate.branchTitle}`);
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

function App({catalog, scope, agent, onExit}) {
  const {exit} = useApp();
  const {stdout} = useStdout();
  const {columns, rows} = resolveTerminalSize(stdout);
  const viewport = useMemo(() => getViewportProfile({columns, rows}), [columns, rows]);
  const [bootReady, setBootReady] = useState(false);

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

  useEffect(() => {
    let cancelled = false;

    const settleViewport = async () => {
      await waitForStableTerminalSize(stdout);
      if (!cancelled) {
        setBootReady(true);
      }
    };

    settleViewport();

    return () => {
      cancelled = true;
    };
  }, [stdout]);

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
  const currentSkillsSpec = currentSkill && agent ? getSkillsInstallSpec(currentSkill, agent) : null;
  const curatedHomeSections = useMemo(() => {
    const myPicks = catalog.collections.find((collection) => collection.id === 'my-picks');

    return [
      {
        id: 'shelves',
        title: 'Shelves',
        subtitle: 'Start from the work itself. Each shelf stays small enough to scan in one pass.',
        kind: 'area',
        mode: 'default',
        items: getHomeItems(catalog),
      },
      {
        id: 'my-picks',
        title: 'My Picks',
        subtitle: 'The first stack I would install on a fresh machine.',
        kind: 'skill',
        mode: 'skills',
        items: getSkillItems((myPicks?.skills || []).slice(0, 6)),
      },
      {
        id: 'house',
        title: 'House Copies',
        subtitle: 'Bundled, local, and owned here when speed and permanence matter.',
        kind: 'skill',
        mode: 'skills',
        items: getTierSkillItems(catalog, 'house'),
      },
      {
        id: 'upstream',
        title: 'Cataloged Upstream',
        subtitle: 'Picked from trusted publishers, but kept live at the source.',
        kind: 'skill',
        mode: 'skills',
        items: getTierSkillItems(catalog, 'upstream'),
      },
      {
        id: 'sources',
        title: 'Source Repos',
        subtitle: 'Browse the publishers behind the shelves when provenance matters more than task-first browsing.',
        kind: 'source',
        mode: 'default',
        items: getSourceItems(catalog).slice(0, 6),
      },
    ].filter((section) => section.items.length > 0);
  }, [catalog]);

  const installOptions = currentSkill
    ? agent
      ? [
          {
            id: 'local',
            action: {
              type: 'install',
              skillName: currentSkill.name,
              agent,
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
      : [
          {
            id: 'global',
            action: {
              type: 'install',
              skillName: currentSkill.name,
              scope: 'global',
            },
          },
          {
            id: 'project',
            action: {
              type: 'install',
              skillName: currentSkill.name,
              scope: 'project',
            },
          },
          {id: 'open', action: {type: 'open-upstream', url: currentSkill.sourceUrl}},
          {id: 'cancel', action: null},
        ]
    : [];

  const paletteItems = useMemo(() => {
    const items = [];

    items.push({id: 'go-home', label: 'Home', detail: 'Jump to the curated library home', run: () => {
      setRootMode('collections');
      setStack([{type: 'home'}]);
      setSelectedIndex(0);
      setPreviewMode(false);
    }});
    items.push({id: 'go-areas', label: 'Shelves', detail: 'Jump to the work-area shelf view', run: () => {
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
      items.push({id: 'go-shelves', label: 'Browse by Shelf', detail: 'Jump to the shelf section on the home screen', run: () => {
        setHomeSectionIndex(0);
      }});
      items.push({id: 'go-my-picks', label: 'My Picks', detail: 'Jump to the personal starter stack', run: () => {
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
      if (input === 'h' || input === 'c') {
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

  if (!bootReady) {
    body = html`
      <${Box} flexDirection="column">
        <${Header}
          breadcrumbs=${['Ai-Agent-Skills', 'Booting']}
          title="Opening the library"
          subtitle="Waiting for the terminal viewport to settle before the atlas mounts."
          metaItems=${[`${columns}x${rows}`, activeTheme.label]}
          hint="This avoids the browser opening partway down the pane."
          viewport=${viewport}
        />
        <${Inspector}
          title="Preparing the atlas"
          eyebrow="Startup guard"
          lines=${[
            'Measuring the terminal twice before the full UI mounts.',
            'Using a clean screen so the library does not inherit shell scrollback.',
          ]}
          footer="The full library should appear from the top once sizing stabilizes."
        />
      <//>
    `;
  } else if (viewport.tooSmall) {
    body = html`
      <${Box} flexDirection="column">
        <${Header}
          breadcrumbs=${breadcrumbs}
          title="Terminal too small for the atlas"
          subtitle="Use a larger terminal for browse, or fall back to the text commands below."
          metaItems=${[`${columns}x${rows}`, `minimum 60x18`, activeTheme.label]}
          hint="Try list, collections, info, or widen the terminal."
          viewport=${viewport}
        />
        <${Inspector}
          title="Text-mode fallback"
          eyebrow="Library commands"
          lines=${[
            'npx ai-agent-skills collections',
            'npx ai-agent-skills list --work-area frontend',
            'npx ai-agent-skills info frontend-design',
          ]}
          footer="Resize the terminal to at least 60x18 to open the atlas again."
        />
      <//>
    `;
  } else if (searchMode) {
    body = html`
      <${Box} flexDirection="column">
        <${Header}
          breadcrumbs=${breadcrumbs}
          title="Search the library"
          subtitle="Find skills by work area, branch, source repo, or title."
          metaItems=${[`${catalog.total} skills`, `${catalog.collections.length} collections`, `${catalog.sources.length} source repos`, activeTheme.label]}
          hint="Enter opens a skill · Esc closes search"
          viewport=${viewport}
        />
        <${SearchOverlay}
          query=${query}
          setQuery=${setQuery}
          results=${searchResults}
          selectedIndex=${selectedIndex}
          columns=${columns}
          viewport=${viewport}
        />
      <//>
    `;
  } else if (current.type === 'home') {
    if (rootMode === 'collections') {
      const currentSection = curatedHomeSections[homeSectionIndex] || curatedHomeSections[0];
      const currentHomeIndex = homeSelections[homeSectionIndex] || 0;
      const selectedHomeItem = currentSection?.items?.[currentHomeIndex] || currentSection?.items?.[0];
      const visibleSectionIndices = getVisibleHomeSectionIndices(
        curatedHomeSections.length,
        homeSectionIndex,
        viewport
      );
      const renderedSectionIndices = viewport.compact
        ? visibleSectionIndices
        : curatedHomeSections.map((_, index) => index);
      const supportingSectionIndices = renderedSectionIndices.filter((index) => index !== homeSectionIndex);

      body = html`
        <${Box} flexDirection="column">
          <${Header}
            breadcrumbs=${breadcrumbs}
            title=${LIBRARY_THESIS}
            subtitle=${LIBRARY_SUPPORT}
            metaItems=${[`${catalog.total} skills`, `${catalog.areas.length} shelves`, `${catalog.houseCount} house copies`, `${catalog.upstreamCount} live upstream`, `scope ${agent ? agent : (scope || 'global')}`, activeTheme.label]}
            hint="Up/down changes sections · Left/right moves within a section · Enter opens · : command palette"
            viewport=${viewport}
          />
          <${ModeTabs} rootMode=${rootMode} compact=${viewport.compact} />
          ${currentSection && selectedHomeItem
            ? html`
                <${ShelfHero}
                  section=${currentSection}
                  selectedItem=${selectedHomeItem}
                  columns=${columns}
                  selectedIndex=${currentHomeIndex}
                  viewport=${viewport}
                />
              `
            : null}
          <${Text} color=${COLORS.border}>
            ${viewport.micro
              ? 'House copies install fast. Cataloged upstream stays live with the publisher.'
              : 'House copies install fast. Cataloged upstream stays live with the publisher. Start with shelves when you want taste, not search results.'}
          <//>
          <${Box} marginTop=${1} flexDirection="column">
          ${supportingSectionIndices.map((index) => {
            const section = curatedHomeSections[index];
            const sectionItemIndex = homeSelections[index] || 0;
            const sectionItem = section.items[sectionItemIndex] || section.items[0];
            return html`
              <${Box} key=${section.id} flexDirection="column" marginBottom=${1}>
                <${CompactShelfPreview}
                  title=${section.title}
                  subtitle=${section.subtitle}
                  active=${false}
                  summary=${sectionItem
                    ? `${section.items.length} items · focus: ${sectionItem.title}${sectionItem.description ? ` · ${compactText(sectionItem.description, viewport.micro ? 36 : 64)}` : ''}`
                    : `${section.items.length} items`}
                  compact=${viewport.compact}
                />
              <//>
            `;
          })}
          <//>
        <//>
      `;
    } else {
      const homeItems = rootMode === 'areas' ? getHomeItems(catalog) : getSourceItems(catalog);
      const selectedHomeItem = homeItems[selectedIndex] || homeItems[0];
      const showHomeInspector = !viewport.compact && Boolean(selectedHomeItem);
      body = html`
        <${Box} flexDirection="column">
          <${Header}
            breadcrumbs=${breadcrumbs}
            title=${rootMode === 'areas' ? 'Browse the shelves' : 'Browse the publishers'}
            subtitle=${rootMode === 'areas'
              ? 'Start with the kind of work, then drill into the small set of skills on that shelf.'
              : 'Browse trusted source repos and the lanes they feed into the shelves.'}
            metaItems=${[`${catalog.total} skills`, `${catalog.areas.length} shelves`, `${catalog.sources.length} publishers`, `scope ${agent ? agent : (scope || 'global')}`, activeTheme.label]}
            hint="Arrow keys move · Enter drills in · / searches · : command palette"
            viewport=${viewport}
          />
          <${ModeTabs} rootMode=${rootMode} compact=${viewport.compact} />
          <${AtlasGrid}
            items=${homeItems}
            selectedIndex=${selectedIndex}
            columns=${columns}
            rows=${rows}
            reservedRows=${getReservedRows('home-grid', viewport, {showInspector: showHomeInspector})}
            compact=${viewport.compact}
          />
          ${showHomeInspector
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
          viewport=${viewport}
        />
        ${viewport.compact
          ? html`<${Text} color=${COLORS.muted}>${compactText(`Start here: ${startHere}`, Math.max(40, columns - 4))}<//>`
          : html`
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
                forceVisibleCount=${viewport.compact ? 1 : null}
              />
            `}
        <${Box} marginTop=${1}>
          <${AtlasGrid}
            items=${getCollectionSkillItems(currentCollection)}
            selectedIndex=${selectedIndex}
            columns=${columns}
            rows=${rows}
            mode="skills"
            reservedRows=${getReservedRows('collection', viewport, {showInspector: !viewport.compact})}
            compact=${viewport.compact}
          />
        <//>
        ${!viewport.compact && selectedSkill
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
          viewport=${viewport}
        />
        <${Box} marginTop=${1}>
          <${AtlasGrid}
            items=${getAreaItems(currentArea)}
            selectedIndex=${selectedIndex}
            columns=${columns}
            rows=${rows}
            reservedRows=${getReservedRows('home-grid', viewport, {showInspector: !viewport.compact})}
            compact=${viewport.compact}
          />
        <//>
        ${!viewport.compact && selectedBranch
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
          viewport=${viewport}
        />
        <${Box} marginTop=${1}>
          <${AtlasGrid}
            items=${getSourceBranchItems(currentSource)}
            selectedIndex=${selectedIndex}
            columns=${columns}
            rows=${rows}
            reservedRows=${getReservedRows('home-grid', viewport, {showInspector: !viewport.compact})}
            compact=${viewport.compact}
          />
        <//>
        ${!viewport.compact && selectedBranch
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
          viewport=${viewport}
        />
        <${Box} marginTop=${1}>
          <${AtlasGrid}
            items=${getSkillItems(currentBranch.skills)}
            selectedIndex=${selectedIndex}
            columns=${columns}
            rows=${rows}
            mode="skills"
            reservedRows=${getReservedRows('skill-grid', viewport, {showInspector: !viewport.compact})}
            compact=${viewport.compact}
          />
        <//>
        ${!viewport.compact && selectedSkill
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
          viewport=${viewport}
        />
        <${Box} marginTop=${1}>
          <${AtlasGrid}
            items=${getSkillItems(currentSourceBranch.skills)}
            selectedIndex=${selectedIndex}
            columns=${columns}
            rows=${rows}
            mode="skills"
            reservedRows=${getReservedRows('skill-grid', viewport, {showInspector: !viewport.compact})}
            compact=${viewport.compact}
          />
        <//>
        ${!viewport.compact && selectedSkill
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
          subtitle=${currentSkill.description}
          metaItems=${[
            `${currentSkill.workAreaTitle} shelf`,
            currentSkill.branchTitle,
            getTierLabel(currentSkill),
            getDistributionLabel(currentSkill),
            ...(currentSkill.collections || []).slice(0, 2),
            currentSkill.trust,
            activeTheme.label,
          ]}
          hint="i opens install choices · p toggles preview · o opens upstream"
          viewport=${viewport}
        />
        <${SkillScreen} skill=${currentSkill} previewMode=${previewMode} scope=${scope} agent=${agent} columns=${columns} viewport=${viewport} relatedSkills=${relatedSkills} />
        ${chooserOpen
          ? html`<${InstallChooser} skill=${currentSkill} scope=${scope} agent=${agent} selectedIndex=${chooserIndex} columns=${columns} viewport=${viewport} />`
          : null}
      <//>
    `;
  }

  const footerHint = viewport.micro
    ? current.type === 'skill'
      ? 'i install · p preview · o upstream · b back · q quit'
      : 'Enter open · b back · : commands · q quit'
    : current.type === 'skill'
      ? '/ search · : palette · b back · i install · p preview · o upstream · t theme · ? help · q quit'
      : '/ search · : palette · Enter open · b back · h/w/r switch root views · t theme · ? help · q quit';
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
      ${helpOpen ? html`<${HelpOverlay} viewport=${viewport} />` : null}
      ${paletteOpen ? html`<${PaletteOverlay} query=${paletteQuery} setQuery=${setPaletteQuery} items=${filteredPaletteItems} selectedIndex=${paletteIndex} viewport=${viewport} />` : null}
      ${body}
      <${FooterBar} hint=${footerHint} mode=${footerMode} detail=${footerDetail} columns=${columns} viewport=${viewport} />
    <//>
  `;
}

export async function launchTui({agent = null, scope = 'global'} = {}) {
  const catalog = buildCatalog();
  const restoreScreen = enterInteractiveScreen(process.stdout);

  return await new Promise((resolve) => {
    let exitAction = null;
    const instance = render(
      html`<${App} catalog=${catalog} scope=${scope} agent=${agent} onExit=${(action) => {
        exitAction = action;
      }} />`,
      {
        stdout: process.stdout,
        stdin: process.stdin,
        stderr: process.stderr,
        exitOnCtrlC: true,
        patchConsole: true,
      }
    );

    instance.waitUntilExit().then(() => {
      instance.cleanup();
      restoreScreen();
      resolve(exitAction);
    }).catch(() => {
      instance.cleanup();
      restoreScreen();
      resolve(exitAction);
    });
  });
}

export const __test = {
  formatPreviewLines,
  getViewportProfile,
  getVisibleHomeSectionIndices,
  getReservedRows,
};
