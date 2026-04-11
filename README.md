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
  <a href="https://github.com/MoizIbnYousaf/Ai-Agent-Skills#shelves"><img alt="Library structure" src="https://img.shields.io/badge/library-64%20skills%20%C2%B7%205%20shelves-cba6f7?style=for-the-badge&labelColor=313244&logo=bookstack&logoColor=cdd6f4" /></a>
</p>

<p align="center"><sub>17 house copies · 47 cataloged upstream</sub></p>
<!-- GENERATED:library-stats:end -->

<p align="center"><em>Picked, shelved, and maintained by hand.</em></p>

<p align="center">
  <a href="./docs/workflows/start-a-library.md"><strong>Build your own library</strong></a>
  ·
  <a href="./FOR_YOUR_AGENT.md"><strong>For your agent</strong></a>
</p>

## Library

`ai-agent-skills` does two things.

It ships my curated library, and it gives you the CLI and TUI to build and manage your own.
It works with any Agent Skills-compatible agent.

The bundled library is organized the way I work:

- Start with a shelf like `frontend` or `workflow`
- Keep the set small enough to browse quickly
- Keep provenance visible
- Keep notes that explain why a skill is here

Use `skills.sh` for the broad ecosystem.
Use `ai-agent-skills` when you want a smaller library with shelves, provenance, and notes.

## What's New in 4.2.0

- Managed team libraries you can share over GitHub and install with `install <owner>/<repo>`
- Machine-readable CLI flows with `--format json`, `--fields`, pagination, and safer non-interactive output
- More authored workflow skills for curating, reviewing, syncing, and sharing libraries
- Dependency-aware installs, `sync` as the main refresh verb, and stronger installed-state visibility across the CLI and TUI
- A cleaner curator loop around shelves, provenance, trust, and shared starter packs

## What It Is Now

I launched this on December 17, 2025, before `skills.sh` existed and before the ecosystem had a clear default universal installer.

Originally this repo was that installer. It still does that.

What started as an installer is now a place to build and manage your own library of skills.

## How It Works

Each skill here is either a house copy or a cataloged upstream pick.

- `House copies`
  Local folders under `skills/<name>/`.
  These install fast, work offline, and ship with the npm package.

- `Cataloged upstream`
  Metadata in `skills.json` with no local folder.
  These stay upstream and install from the source repo when you ask for them.

Upstream work stays upstream. That keeps the library lean.

## For Your Agent

Tell your agent to build you a library. Paste this, or just point it at this repo — the protocol below has everything it needs.

Full protocol with curator decision framework: [FOR_YOUR_AGENT.md](./FOR_YOUR_AGENT.md)

### Paste this into your agent

```text
Set up a managed team skills library for me with `ai-agent-skills`.

Read the full agent protocol here before starting:
https://raw.githubusercontent.com/MoizIbnYousaf/Ai-Agent-Skills/main/FOR_YOUR_AGENT.md

Use the CLI with `npx`. Do not hand-edit `skills.json`, `README.md`, or `WORK_AREAS.md` if the command already exists.

1. Fetch and read FOR_YOUR_AGENT.md above — it has the full curator decision protocol.
2. Create a workspace with `npx ai-agent-skills init-library <name>`.
3. Ask me at most 3 short questions: what kinds of work, small or broad, local draft or shared repo.
4. Map my stack to shelves: frontend, backend, mobile, workflow, agent-engineering.
5. Run a discovery loop: `list --area <shelf>`, `search <query>`, `collections`.
6. Add 3-8 skills with explicit `--area`, `--branch`, and `--why` on every mutation.
7. Run `npx ai-agent-skills build-docs` before finishing.
8. If I want it shared: `git init && git add . && git commit -m "Initialize skills library" && gh repo create`.
9. Tell me what you added, which shelves, and the install command for teammates.
```

The companion workflow skills (installed automatically when you use the library):

```
npx ai-agent-skills install install-from-remote-library
npx ai-agent-skills install curate-a-team-library
npx ai-agent-skills install share-a-library
npx ai-agent-skills install browse-and-evaluate
npx ai-agent-skills install update-installed-skills
npx ai-agent-skills install build-workspace-docs
npx ai-agent-skills install review-a-skill
npx ai-agent-skills install audit-library-health
npx ai-agent-skills install migrate-skills-between-libraries
```

## Quick Start

### Use the bundled library

```bash
# Open the terminal browser
npx ai-agent-skills

# List the shelves
npx ai-agent-skills list

# Install a skill from the library
npx ai-agent-skills install frontend-design

# Install the Swift hub to the default global targets
npx ai-agent-skills swift

# Install an entire curated pack
npx ai-agent-skills install --collection swift-agent-skills -p

# Install to the project shelf
npx ai-agent-skills install pdf -p

# Install all skills from an upstream repo to the default global targets
npx ai-agent-skills anthropics/skills

# Browse a repo before adding or installing from it
npx ai-agent-skills install openai/skills --list
```

Default install targets:

- Global: `~/.claude/skills/`
- Project: `.agents/skills/`

Legacy agent-specific targets still work through `--agent <name>`.

### Start your own library

```bash
# Create a managed workspace
npx ai-agent-skills init-library my-library
cd my-library

# Add a bundled pick, install it, refresh it, and rebuild the docs
npx ai-agent-skills add frontend-design --area frontend --branch Implementation --why "I want this on my shelf."
npx ai-agent-skills install frontend-design -p
npx ai-agent-skills sync frontend-design -p
npx ai-agent-skills add anthropics/skills --skill webapp-testing --area workflow --branch Testing --why "I use this when I want browser-level checks in the workspace."
npx ai-agent-skills build-docs
```

## Workspace Mode

Workspace mode is part of the normal flow now.

Start with a managed workspace, add a few skills, then keep your shelves current with `add`, `catalog`, `vendor`, `sync`, and `build-docs`.

```bash
npx ai-agent-skills init-library my-library
cd my-library

npx ai-agent-skills add frontend-design --area frontend --branch Implementation --why "I want this on my shelf."
npx ai-agent-skills install frontend-design -p
npx ai-agent-skills add anthropics/skills --skill webapp-testing --area workflow --branch Testing --why "I use this when I want browser-level checks in the workspace."
npx ai-agent-skills sync frontend-design -p
npx ai-agent-skills build-docs
```

Workflow guides:

- [Start a library](./docs/workflows/start-a-library.md)
- [Add an upstream skill](./docs/workflows/add-an-upstream-skill.md)
- [Make a house copy](./docs/workflows/make-a-house-copy.md)
- [Organize shelves](./docs/workflows/organize-shelves.md)
- [Refresh installed skills](./docs/workflows/refresh-installed-skills.md)

## Browse

Most browsing starts in one of two places:

| View | Why it exists | Start here |
| --- | --- | --- |
| Shelves | The main way to understand the library: start with the kind of work, then drill into the small set of picks on that shelf. | `npx ai-agent-skills list` |
| Sources | The provenance view: see which publishers feed which shelves and branches. | `npx ai-agent-skills info frontend-design` |

The other views are still useful, just more situational:

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
| Workflow | 11 | Files, docs, planning, release work, and research-to-output flows. |
| Agent Engineering | 14 | MCP, skill-building, prompting discipline, and LLM application work. |
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

## Curating the catalog

Use `catalog` when you want to add an upstream skill without vendoring it.

In a managed workspace, start with `add`.
Use `catalog` and `vendor` when you want more control.

```bash
npx ai-agent-skills catalog openai/skills --list
npx ai-agent-skills catalog openai/skills --skill linear --area workflow --branch Linear
npx ai-agent-skills catalog openai/skills --skill security-best-practices --area backend --branch Security
npx ai-agent-skills catalog conorluddy/ios-simulator-skill --skill ios-simulator-skill --area mobile --branch "Swift / Tools" --collection swift-agent-skills
npx ai-agent-skills catalog shadcn-ui/ui --skill shadcn --area frontend --branch Components
```

It does not create a local copy.
It adds metadata and placement in the active library:

- which shelf it belongs on
- what branch it lives under
- why it earned a place
- how it should install later

For existing picks, use `curate` for quick edits:

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
| `MoizIbnYousaf/Ai-Agent-Skills` | 11 |
| `openai/skills` | 9 |
| `Dimillian/Skills` | 4 |
| `wshobson/agents` | 4 |
| `rgmez/apple-accessibility-skills` | 3 |
| `ComposioHQ/awesome-claude-skills` | 2 |
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
npx ai-agent-skills sync [name]
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
  No-mock live verification. Clones the real upstream repos, captures raw `SKILL.md` frontmatter and file manifests, runs real install/sync/uninstall flows in isolated temp homes and projects, drives the TUI through a real PTY, and writes a report to `tmp/live-test-report.json`.
- `npm run test:live:quick`
  A smaller live matrix for faster iteration with the same no-mock pipeline.

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
- Notes that explain why something stays
- Upstream repos staying upstream
- A library that looks cared for

## Contributing

This is a curated library.

Read [CURATION.md](./CURATION.md) before opening a PR.

## Related

- [WORK_AREAS.md](./WORK_AREAS.md)
- [CURATION.md](./CURATION.md)
- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [Agent Skills specification](https://agentskills.io)
