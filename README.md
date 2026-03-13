<h1 align="center">
  <br>
  🔧 AI Agent Skills
  <br>
</h1>

<p align="center">
  <strong>There are a lot of agent skills now. These are the ones I keep around.</strong><br>
  Some are mine. Some come from other great repos. All of them earned their spot.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/skills-47-blue?style=flat-square" alt="Skills" />
  <img src="https://img.shields.io/badge/agents-11+-green?style=flat-square" alt="Compatible Agents" />
  <img src="https://img.shields.io/npm/v/ai-agent-skills?style=flat-square&color=red" alt="npm" />
</p>

<p align="center">
  <a href="#quick-start"><strong>Quick Start</strong></a> ·
  <a href="#collections"><strong>Collections</strong></a> ·
  <a href="./CURATION.md"><strong>Curation Guide</strong></a> ·
  <a href="./CONTRIBUTING.md"><strong>Contribute</strong></a> ·
  <a href="https://agentskills.io"><strong>Specification</strong></a>
</p>

---

## Why I Keep This Repo

I started this project on December 17, 2025, when skills were spreading across repos and every agent had its own install location.

I built it as a cross-agent installer, and that part is still useful.

Now I use it as a library. It holds the skills I actually use, adapt, or recommend. Some are mine. Some come from other open-source repos. If something feels weak, repetitive, or too niche, I leave it out.

I am not chasing every new coding agent either. I care about the major ones people actually use. I would rather support a smaller set well than add every new logo that shows up.

## Quick Start

```bash
# Install one skill to all supported agents
npx ai-agent-skills install frontend-design

# Install to a specific agent only
npx ai-agent-skills install frontend-design --agent cursor

# Browse curated collections
npx ai-agent-skills collections

# See my starter set
npx ai-agent-skills list --collection my-picks

# Search the catalog
npx ai-agent-skills search testing
```

By default, `install` targets the major agents I already support: Claude Code, Cursor, Codex, Amp, VS Code, Copilot, Gemini CLI, Goose, Letta, Kilo Code, and OpenCode.

## How I Organize It

- `Collections` are the main way to browse this repo.
- `My Picks` is where I would tell most people to start.
- `Featured` means I would actively point someone to that skill first.
- `Verified` means I have personally checked the skill and its metadata.
- `Categories` and `tags` are there to keep the CLI useful, not to overcomplicate the repo.

The folder layout stays flat under `skills/<name>/` because installs stay simpler that way. The catalog handles the grouping.

## Collections

These collections are the best way to browse the repo.

| Collection | What it's for | Start with |
|-------|-------------|-------------|
| `my-picks` | The first skills I would install on a fresh setup | `frontend-design`, `mcp-builder`, `qa-regression` |
| `web-product` | Frontend work, design systems, polished UI, and shipping web apps | `react-best-practices`, `frontend-design`, `vercel-deploy` |
| `mobile-expo` | Expo and React Native workflows | `expo-app-design`, `expo-deployment`, `upgrading-expo` |
| `backend-systems` | APIs, architecture, MCP servers, and heavier engineering work | `mcp-builder`, `backend-development`, `database-design` |
| `quality-workflows` | Testing, review, planning, QA, and safer execution | `qa-regression`, `code-review`, `best-practices` |
| `docs-files` | Documents, spreadsheets, coauthoring, file-heavy work | `pdf`, `doc-coauthoring`, `xlsx` |
| `business-research` | Growth, lead research, communication, and operator workflows | `lead-research-assistant`, `internal-comms`, `developer-growth-analysis` |
| `creative-media` | Visual work, image/video tasks, and creative output | `canvas-design`, `image-enhancer`, `video-downloader` |

CLI shortcuts:

```bash
npx ai-agent-skills collections
npx ai-agent-skills list --collection my-picks
npx ai-agent-skills list --collection web-product
```

## What I Support

I keep support focused on the bigger agents.

I am not interested in racing to add support for every new coding agent that launches. If I do not use it, trust it, or expect it to last, I am probably not going to add first-class support for it.

That keeps the repo focused instead of turning into compatibility theater.

## Supported Agents

| Agent | Flag | Install Location |
|-------|------|------------------|
| Claude Code | `--agent claude` | `~/.claude/skills/` |
| Cursor | `--agent cursor` | `.cursor/skills/` |
| Codex | `--agent codex` | `~/.codex/skills/` |
| Amp | `--agent amp` | `~/.amp/skills/` |
| VS Code / Copilot | `--agent vscode` | `.github/skills/` |
| Gemini CLI | `--agent gemini` | `~/.gemini/skills/` |
| Goose | `--agent goose` | `~/.config/goose/skills/` |
| OpenCode | `--agent opencode` | `~/.opencode/skill/` |
| Letta | `--agent letta` | `~/.letta/skills/` |
| Kilo Code | `--agent kilocode` | `~/.kilocode/skills/` |
| Portable | `--agent project` | `.skills/` |

## Commands

```bash
# Discovery
npx ai-agent-skills collections
npx ai-agent-skills list
npx ai-agent-skills list --category development
npx ai-agent-skills list --collection my-picks
npx ai-agent-skills search testing
npx ai-agent-skills info frontend-design

# Installation
npx ai-agent-skills install <name>
npx ai-agent-skills install <name> --agent cursor
npx ai-agent-skills install <owner/repo>
npx ai-agent-skills install <git-url>
npx ai-agent-skills install ./path
npx ai-agent-skills install <name> --dry-run

# Management
npx ai-agent-skills uninstall <name>
npx ai-agent-skills update <name>
npx ai-agent-skills update --all

# Configuration
npx ai-agent-skills config --default-agent cursor
```

## Manual Install

```bash
git clone https://github.com/MoizIbnYousaf/Ai-Agent-Skills.git
cp -r Ai-Agent-Skills/skills/pdf ~/.claude/skills/
```

## Contributing

This repo is curated. I do not accept everything, and I do not want the catalog to sprawl.
I would rather keep it small and strong than let it get messy.

Before opening a PR:

1. Read [CURATION.md](./CURATION.md).
2. Follow [CONTRIBUTING.md](./CONTRIBUTING.md).
3. Add or update the `skills.json` entry.
4. Place the skill in at least one curated collection.
5. Explain why it belongs here.

## What Are Agent Skills?

Agent skills follow the open format documented at [agentskills.io](https://agentskills.io). A skill is just a folder:

```text
my-skill/
├── SKILL.md
├── scripts/
└── references/
```

All major coding agents support some variation of this pattern.

## Links

- [Agent Skills Spec](https://agentskills.io)
- [Anthropic Skills](https://github.com/anthropics/skills)
- [Curation Guide](./CURATION.md)
- [Contributing Guide](./CONTRIBUTING.md)
- [Issues](https://github.com/MoizIbnYousaf/Ai-Agent-Skills/issues)

## Credits & Attribution

This library builds on work from the open-source community, especially:

- [Anthropic Skills](https://github.com/anthropics/skills)
- [ComposioHQ Awesome Claude Skills](https://github.com/ComposioHQ/awesome-claude-skills)
- [wshobson/agents](https://github.com/wshobson/agents)
- [openskills](https://github.com/numman-ali/openskills)

If something here traces back to your work and you want clearer attribution, open an issue.

---

<p align="center">
  <sub>Built and curated by <a href="https://github.com/MoizIbnYousaf">Moiz Ibn Yousaf</a></sub>
</p>
