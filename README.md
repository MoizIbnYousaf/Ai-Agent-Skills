<h1 align="center">AI Agent Skills</h1>

<p align="center">
  <strong>My curated library of agent skills, plus the package to build your own.</strong>
</p>

<p align="center">
  The skills I actually keep around, organized the way I work.
</p>

<!-- GENERATED:library-stats:start -->
<p align="center">
  <a href="https://github.com/MoizIbnYousaf/Ai-Agent-Skills"><img alt="GitHub stars" src="https://img.shields.io/github/stars/MoizIbnYousaf/Ai-Agent-Skills?style=for-the-badge&label=stars&labelColor=313244&color=89b4fa&logo=github&logoColor=cdd6f4" /></a>
  <a href="https://www.npmjs.com/package/ai-agent-skills"><img alt="npm version" src="https://img.shields.io/npm/v/ai-agent-skills?style=for-the-badge&label=version&labelColor=313244&color=b4befe&logo=npm&logoColor=cdd6f4" /></a>
  <a href="https://www.npmjs.com/package/ai-agent-skills"><img alt="npm total downloads" src="https://img.shields.io/npm/dt/ai-agent-skills?style=for-the-badge&label=downloads&labelColor=313244&color=f5e0dc&logo=npm&logoColor=cdd6f4" /></a>
  <a href="https://github.com/MoizIbnYousaf/Ai-Agent-Skills#shelves"><img alt="Library structure" src="https://img.shields.io/badge/library-55%20skills%20%C2%B7%205%20shelves-cba6f7?style=for-the-badge&labelColor=313244&logo=bookstack&logoColor=cdd6f4" /></a>
</p>

<p align="center"><sub>8 house copies · 47 cataloged upstream</sub></p>
<!-- GENERATED:library-stats:end -->

<p align="center"><em>Picked, shelved, and maintained by hand.</em></p>

## Library

`ai-agent-skills` is a CLI library of agent skills for tools like Claude Code, Codex, Cursor, and other SKILL.md-compatible agents.

I organize it the way I work:

- Start with a shelf like `frontend` or `workflow`
- Keep the set small enough to browse quickly
- Keep provenance visible
- Keep notes that explain why a skill is here

Use `skills.sh` for the broad ecosystem.
Use this repo for my kept set.

## Why Keep It

I launched this on December 17, 2025, before `skills.sh` existed and before the ecosystem had a clear default universal installer.

Originally this repo was that installer. That part still matters.

I keep it because the library itself has become useful: shelves, provenance, and notes that make the curation legible.

## How It Works

Each skill here is either a house copy or a cataloged upstream pick.

- `House copies`
  Local folders under `skills/<name>/`.
  These install fast, work offline, and ship with the npm package.

- `Cataloged upstream`
  Metadata in `skills.json` with no local folder.
  These stay upstream and install live from the source repo when you ask for them.

Upstream work stays upstream. That keeps the library lean.

## Quick Start

```bash
# Open the terminal browser
npx ai-agent-skills

# List the shelves
npx ai-agent-skills list

# Install a skill from the library
npx ai-agent-skills install frontend-design

# Install the Swift hub straight to Claude + Codex
npx ai-agent-skills swift

# Install an entire curated pack
npx ai-agent-skills install --collection swift-agent-skills -p

# Install to the project shelf
npx ai-agent-skills install pdf -p

# Install all skills from an upstream repo straight to Claude + Codex
npx ai-agent-skills anthropics/skills

# Browse a repo before adding or installing from it
npx ai-agent-skills install openai/skills --list
```

Default install targets:

- Global: `~/.claude/skills/`
- Project: `.agents/skills/`

Legacy agent-specific targets still work through `--agent <name>`.

## Browse

Most browsing starts in one of two places:

| View | Why it exists | Start here |
| --- | --- | --- |
| Shelves | The main way to understand the library: start with the kind of work, then drill into the small set of picks on that shelf. | `npx ai-agent-skills list` |
| Sources | The provenance view: see which publishers feed which shelves and branches. | `npx ai-agent-skills info frontend-design` |

The other views are still there. They are just secondary:

- `npx ai-agent-skills browse` for the TUI
- `npx ai-agent-skills list --collection my-picks` for a cross-shelf starter stack
- `npx ai-agent-skills install --collection swift-agent-skills -p` for an installable curated pack
- `npx ai-agent-skills curate review` for the curator cleanup queue

## Shelves

The shelves are the main structure.

<!-- GENERATED:shelf-table:start -->
| Shelf | Skills | What it covers |
| --- | --- | --- |
| Frontend | 10 | Interfaces, design systems, browser work, and product polish. |
| Backend | 5 | Systems, data, security, and runtime operations. |
| Mobile | 24 | Swift, SwiftUI, iOS, and Apple-platform development, with room for future React Native branches. |
| Workflow | 10 | Files, docs, planning, release work, and research-to-output flows. |
| Agent Engineering | 6 | MCP, skill-building, prompting discipline, and LLM application work. |
<!-- GENERATED:shelf-table:end -->

The full map lives in [WORK_AREAS.md](./WORK_AREAS.md).

## Collections

Collections are smaller sets. Useful, but secondary to the shelves.

<!-- GENERATED:collection-table:start -->
| Collection | Why it exists | Start here |
| --- | --- | --- |
| `my-picks` | A short starter stack. These are the skills I reach for first. | `frontend-design`, `mcp-builder`, `pdf` |
| `build-apps` | Frontend, UI, and design work for shipping polished apps. | `frontend-design`, `frontend-skill`, `shadcn` |
| `swift-agent-skills` | The main Swift and Apple-platform set in this library. Install it all at once or pick from it. | `swiftui-pro`, `swiftui-ui-patterns`, `swiftui-design-principles` |
| `build-systems` | Backend, architecture, MCP, and security work. | `mcp-builder`, `backend-development`, `database-design` |
| `test-and-debug` | QA, debugging, CI cleanup, and observability. | `playwright`, `webapp-testing`, `gh-fix-ci` |
| `docs-and-research` | Docs, files, research, and writing work. | `pdf`, `doc-coauthoring`, `docx` |
<!-- GENERATED:collection-table:end -->

## Curating The Catalog

Use `catalog` when you want to add an upstream skill without vendoring it.

```bash
npx ai-agent-skills catalog openai/skills --list
npx ai-agent-skills catalog openai/skills --skill linear --area workflow --branch Linear
npx ai-agent-skills catalog openai/skills --skill security-best-practices --area backend --branch Security
npx ai-agent-skills catalog conorluddy/ios-simulator-skill --skill ios-simulator-skill --area mobile --branch "Swift / Tools" --collection swift-agent-skills
npx ai-agent-skills catalog shadcn-ui/ui --skill shadcn --area frontend --branch Components
```

It does not copy the skill into this repo.
It adds metadata and placement:

- which shelf it belongs on
- what branch it lives under
- why it earned a place
- how it should install later

For existing picks, `curate` is the quick loop:

```bash
npx ai-agent-skills curate frontend-design --branch Implementation
npx ai-agent-skills curate ios-simulator-skill --collection swift-agent-skills
npx ai-agent-skills curate ios-simulator-skill --remove-from-collection swift-agent-skills
npx ai-agent-skills curate frontend-design --why "A stronger note that matches how I actually use it."
npx ai-agent-skills curate review
```

When I want a local copy, I use `vendor`:

```bash
npx ai-agent-skills vendor <repo-or-path> --skill <name> --area <shelf> --branch <branch> --why "Why this deserves a local copy."
npx ai-agent-skills vendor <repo-or-path> --skill <name> --area mobile --branch "Swift / Tools" --collection swift-agent-skills --why "Why this deserves a place in the Swift pack."
```

## Source Repos

Current upstream mix:

<!-- GENERATED:source-table:start -->
| Source repo | Skills |
| --- | --- |
| `anthropics/skills` | 11 |
| `openai/skills` | 9 |
| `Dimillian/Skills` | 4 |
| `wshobson/agents` | 4 |
| `rgmez/apple-accessibility-skills` | 3 |
| `ComposioHQ/awesome-claude-skills` | 2 |
| `MoizIbnYousaf/Ai-Agent-Skills` | 2 |
| `andrewgleave/skills` | 1 |
| `arjitj2/swiftui-design-principles` | 1 |
| `AvdLee/Core-Data-Agent-Skill` | 1 |
| `AvdLee/Swift-Concurrency-Agent-Skill` | 1 |
| `AvdLee/Swift-Testing-Agent-Skill` | 1 |
| `bocato/swift-testing-agent-skill` | 1 |
| `conorluddy/ios-simulator-skill` | 1 |
| `dadederk/iOS-Accessibility-Agent-Skill` | 1 |
| `efremidze/swift-architecture-skill` | 1 |
| `emilkowalski/skill` | 1 |
| `Erikote04/Swift-API-Design-Guidelines-Agent-Skill` | 1 |
| `ivan-magda/swift-security-skill` | 1 |
| `PasqualeVittoriosi/swift-accessibility-skill` | 1 |
| `raphaelsalaja/userinterface-wiki` | 1 |
| `shadcn-ui/ui` | 1 |
| `twostraws/Swift-Concurrency-Agent-Skill` | 1 |
| `twostraws/Swift-Testing-Agent-Skill` | 1 |
| `twostraws/SwiftData-Agent-Skill` | 1 |
| `twostraws/SwiftUI-Agent-Skill` | 1 |
| `vanab/swiftdata-agent-skill` | 1 |
<!-- GENERATED:source-table:end -->

The two biggest upstream publishers in this library are Anthropic and OpenAI.
I browse, pick, and shelve. I do not mirror everything they publish.

## Commands

```bash
# Browse
npx ai-agent-skills
npx ai-agent-skills browse
npx ai-agent-skills list
npx ai-agent-skills list --work-area frontend
npx ai-agent-skills collections
npx ai-agent-skills search frontend
npx ai-agent-skills info frontend-design
npx ai-agent-skills preview pdf

# Install
npx ai-agent-skills install <skill-name>
npx ai-agent-skills swift
npx ai-agent-skills install <skill-name> -p
npx ai-agent-skills install --collection swift-agent-skills -p
npx ai-agent-skills <owner/repo>
npx ai-agent-skills install <owner/repo>
npx ai-agent-skills install <owner/repo>@<skill-name>
npx ai-agent-skills install <owner/repo> --skill <name>
npx ai-agent-skills install <owner/repo> --list
npx ai-agent-skills install ./local-path
npx ai-agent-skills install <skill-name> --dry-run

# Maintain
npx ai-agent-skills update [name]
npx ai-agent-skills uninstall <name>
npx ai-agent-skills check
npx ai-agent-skills doctor
npx ai-agent-skills validate [path]

# Curate
npx ai-agent-skills catalog <owner/repo> --list
npx ai-agent-skills catalog <owner/repo> --skill <name> --area <shelf> --branch <branch> --why "<editorial note>"
npx ai-agent-skills curate <skill-name> --branch "<branch>"
npx ai-agent-skills curate review
npx ai-agent-skills vendor <repo-or-path> --skill <name> --area <shelf> --branch <branch> --why "<editorial note>"
```

## Testing

- `npm test`
  Fast regression coverage for CLI behavior, schema rules, routing, and local install flows.
- `npm run test:live`
  No-mock live verification. Clones the real upstream repos, captures raw `SKILL.md` frontmatter and file manifests, runs real install/update/uninstall flows in isolated temp homes and projects, drives the TUI through a real PTY, and writes a report to `tmp/live-test-report.json`.
- `npm run test:live:quick`
  Smaller live matrix for faster iteration while keeping the same no-mock pipeline.

## Legacy Agent Support

Still supported through `--agent <name>`:

- `claude`
- `cursor`
- `codex`
- `amp`
- `vscode`
- `copilot`
- `gemini`
- `goose`
- `opencode`
- `letta`
- `kilocode`
- `project`

## What I Care About

- Small shelves
- Clear provenance
- Notes that explain the keep
- Upstream repos staying upstream
- A library that looks maintained

## Contributing

This is a curated library.

Read [CURATION.md](./CURATION.md) before opening a PR.

## Related

- [WORK_AREAS.md](./WORK_AREAS.md)
- [CURATION.md](./CURATION.md)
- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [Agent Skills specification](https://agentskills.io)
