# AI Agent Skills

My curated agent skills library.

There are a lot of skills now. These are the ones I actually keep around.

<!-- GENERATED:library-stats:start -->
- 35 skills total
- 10 shelves
- 11 house copies
- 24 cataloged upstream
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

# Install to the project shelf
npx ai-agent-skills install pdf -p

# Browse a repo before adding or installing from it
npx ai-agent-skills install openai/skills --list
```

Default install targets:

- Global: `~/.claude/skills/`
- Project: `.agents/skills/`

Legacy agent-specific targets still work through `--agent <name>`.

## How To Read The Library

There are four useful views:

| View | Why it exists | Start here |
| --- | --- | --- |
| Shelves | The main way to understand the library | `npx ai-agent-skills list` |
| My Picks | The shortest starter stack | `npx ai-agent-skills list --collection my-picks` |
| Source Repos | Provenance and publisher lineage | `npx ai-agent-skills info frontend-design` |
| Terminal Browser | Browse the library as a shelf system, not a flat repo | `npx ai-agent-skills browse` |

## Shelves

These are the shelves. They are the product.

<!-- GENERATED:shelf-table:start -->
| Shelf | Skills | What it covers |
| --- | --- | --- |
| Frontend | 4 | Interface systems, web product craft, and frontend execution. |
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

Collections still exist, but they are secondary. They are small cross-shelf reading lists, not the main taxonomy.

<!-- GENERATED:collection-table:start -->
| Collection | Why it exists | Start here |
| --- | --- | --- |
| `my-picks` | The smallest cross-shelf starter stack: the skills I would reach for first on a fresh setup. | `frontend-design`, `mcp-builder`, `pdf` |
| `build-apps` | Frontend and design implementation skills for shipping polished product work. | `frontend-design`, `frontend-skill`, `shadcn` |
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
npx ai-agent-skills curate frontend-design --branch "UI Craft"
npx ai-agent-skills curate frontend-design --why "A stronger note that matches how I actually use it."
npx ai-agent-skills curate review
```

When I explicitly want a new house copy, `vendor` is the only path that does it:

```bash
npx ai-agent-skills vendor <repo-or-path> --skill <name> --area <shelf> --branch <branch> --why "Why this deserves a local copy."
```

## Source Repos

Current source mix:

<!-- GENERATED:source-table:start -->
| Source repo | Skills |
| --- | --- |
| `anthropics/skills` | 13 |
| `openai/skills` | 9 |
| `ComposioHQ/awesome-claude-skills` | 4 |
| `wshobson/agents` | 4 |
| `MoizIbnYousaf/Ai-Agent-Skills` | 3 |
| `emilkowalski/skill` | 1 |
| `shadcn-ui/ui` | 1 |
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
npx ai-agent-skills install <skill-name> -p
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
