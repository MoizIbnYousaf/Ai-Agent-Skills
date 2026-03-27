# AI Agent Skills

My curated agent skills library.

There are a lot of skills now. These are the ones I actually keep around.

<!-- GENERATED:library-stats:start -->
- 60 skills total
- 11 shelves
- 11 house copies
- 49 cataloged upstream
<!-- GENERATED:library-stats:end -->

The point is not to be a registry. The point is to be a bookshelf.

## What This Is

`ai-agent-skills` is a CLI library of agent skills for tools like Claude Code, Codex, Cursor, and other SKILL.md-compatible agents.

The library is organized the way I actually work:

- Start with a shelf like `frontend` or `workflow`
- See a small set of vetted skills, not every possible match
- Keep provenance visible so upstream repos stay credited
- Keep editorial notes visible so the curation is the product

If you want the broad open ecosystem, use `skills.sh`.
If you want my shelves, use this repo.

## Why This Repo Still Exists

I launched this on December 17, 2025, before `skills.sh` existed and before the ecosystem had a clear default universal installer.

Originally this repo was that universal installer. That part still works.

What makes it worth keeping now is the library itself: the shelves, the provenance, and the editorial judgment. `skills.sh` is the broad open ecosystem. This repo is the smaller personal library I actually reach for.

## The Two-Tier Model

Every skill in the library is one of two things:

- `House copies`
  Local folders under `skills/<name>/`.
  These install fast, work offline, and ship with the npm package.

- `Cataloged upstream`
  Metadata in `skills.json` with no local folder.
  These stay upstream and install live from the source repo when you ask for them.

The library stays lean because it does not pretend to own upstream content.

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

## How To Read The Library

There are two main ways to browse it:

| View | Why it exists | Start here |
| --- | --- | --- |
| Shelves | The main way to understand the library: start with the kind of work, then drill into the small set of picks on that shelf. | `npx ai-agent-skills list` |
| Sources | The provenance view: see which publishers feed which shelves and branches. | `npx ai-agent-skills info frontend-design` |

Secondary surfaces still exist, but they are not the main taxonomy:

- `npx ai-agent-skills browse` for the TUI
- `npx ai-agent-skills list --collection my-picks` for a cross-shelf starter stack
- `npx ai-agent-skills install --collection swift-agent-skills -p` for an installable curated pack
- `npx ai-agent-skills curate review` for the curator cleanup queue

## Shelves

These are the shelves. They are the product.

<!-- GENERATED:shelf-table:start -->
| Shelf | Skills | What it covers |
| --- | --- | --- |
| Frontend | 5 | Interface systems, web product craft, and frontend execution. |
| Mobile | 24 | Swift, SwiftUI, iOS, App Store, and Apple-platform development, with room for future React Native curation. |
| Backend | 3 | Infra, tooling, application architecture, and codebase depth. |
| Docs | 6 | Documents, specs, file handling, and long-form output. |
| Testing | 2 | Review, QA, regression work, and keeping product quality sharp. |
| Workflow | 3 | Execution patterns, prompting, ticketing, and operating rhythm. |
| Research | 2 | Competitive scans, discovery work, and synthesis that helps decisions. |
| Design | 4 | Visual systems, thematic work, creative direction, and media craft. |
| Business | 3 | Brand, hiring, ops, and communication work around the product. |
| AI | 6 | LLM applications, MCP servers, agent building, prompt engineering, and skills development. |
| DevOps | 2 | CI/CD, observability, deployment, and release infrastructure. |
<!-- GENERATED:shelf-table:end -->

The full map lives in [WORK_AREAS.md](./WORK_AREAS.md).

## Collections

Collections still exist, but they are secondary. They can be starter stacks or installable packs, but shelves are still the main taxonomy.

<!-- GENERATED:collection-table:start -->
| Collection | Why it exists | Start here |
| --- | --- | --- |
| `my-picks` | The smallest cross-shelf starter stack: the skills I would reach for first on a fresh setup. | `frontend-design`, `mcp-builder`, `pdf` |
| `build-apps` | Frontend and design implementation skills for shipping polished product work. | `frontend-design`, `frontend-skill`, `shadcn` |
| `swift-agent-skills` | A curated Swift and Apple-platform hub inside ai-agent-skills, collecting the main upstream Swift skills as one installable set. | `swiftui-pro`, `swiftui-ui-patterns`, `swiftui-design-principles` |
| `build-systems` | Architecture, MCP, backend, and security picks for deeper engineering work. | `mcp-builder`, `backend-development`, `database-design` |
| `test-and-debug` | The shelf for QA, regression, CI cleanup, observability, and debugging discipline. | `playwright`, `webapp-testing`, `gh-fix-ci` |
| `docs-and-research` | File-heavy work, writing, docs, and research flows that end in something usable. | `pdf`, `doc-coauthoring`, `docx` |
<!-- GENERATED:collection-table:end -->

## Catalog Curation

The `catalog` command is how I pull from upstream repos without vendoring everything.

```bash
npx ai-agent-skills catalog openai/skills --list
npx ai-agent-skills catalog openai/skills --skill linear --area workflow --branch Linear
npx ai-agent-skills catalog openai/skills --skill security-best-practices --area backend --branch Security
npx ai-agent-skills catalog conorluddy/ios-simulator-skill --skill ios-simulator-skill --area mobile --branch "Swift / Tools" --collection swift-agent-skills
npx ai-agent-skills catalog shadcn-ui/ui --skill shadcn --area frontend --branch Components
```

That command does not copy the upstream skill into this repo.
It adds metadata and editorial placement:

- which shelf it belongs on
- what branch it lives under
- why it earned a place
- how it should install later

For existing picks, `curate` is the fast loop:

```bash
npx ai-agent-skills curate frontend-design --branch "Frontend (Anthropic)"
npx ai-agent-skills curate ios-simulator-skill --collection swift-agent-skills
npx ai-agent-skills curate ios-simulator-skill --remove-from-collection swift-agent-skills
npx ai-agent-skills curate frontend-design --why "A stronger note that matches how I actually use it."
npx ai-agent-skills curate review
```

When I explicitly want a new house copy, `vendor` is the only path that does it:

```bash
npx ai-agent-skills vendor <repo-or-path> --skill <name> --area <shelf> --branch <branch> --why "Why this deserves a local copy."
npx ai-agent-skills vendor <repo-or-path> --skill <name> --area mobile --branch "Swift / Tools" --collection swift-agent-skills --why "Why this deserves a place in the Swift pack."
```

## Source Repos

Current source mix:

<!-- GENERATED:source-table:start -->
| Source repo | Skills |
| --- | --- |
| `anthropics/skills` | 13 |
| `openai/skills` | 9 |
| `ComposioHQ/awesome-claude-skills` | 4 |
| `Dimillian/Skills` | 4 |
| `wshobson/agents` | 4 |
| `MoizIbnYousaf/Ai-Agent-Skills` | 3 |
| `rgmez/apple-accessibility-skills` | 3 |
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

The two major upstream publishers in this library are Anthropic and OpenAI.
I do not import everything they ship. I browse, pick, and shelve.

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

There are two layers on purpose:

- `npm test`
  Fast regression coverage for CLI behavior, schema rules, routing, and local install flows.
- `npm run test:live`
  No-mock live verification. Clones the real upstream repos, captures raw `SKILL.md` frontmatter and file manifests, runs real install/update/uninstall flows in isolated temp homes and projects, drives the TUI through a real PTY, and writes a report to `tmp/live-test-report.json`.
- `npm run test:live:quick`
  Smaller live matrix for faster iteration while keeping the same no-mock pipeline.

## Legacy Agent Support

These still work through `--agent <name>`:

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

## Why It Feels Different

This repo is opinionated on purpose.

- Small shelves beat giant taxonomies
- Editorial notes beat anonymous tags
- Provenance should stay visible
- Upstream repos should stay upstream
- A curated library should feel maintained, not harvested

## Contributing

This is a curated library, not an open registry.

Read [CURATION.md](./CURATION.md) before opening a PR.

## Related

- [WORK_AREAS.md](./WORK_AREAS.md)
- [CURATION.md](./CURATION.md)
- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [Agent Skills specification](https://agentskills.io)
