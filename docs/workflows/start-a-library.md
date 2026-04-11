# Start a Library

This works well with any Agent Skills-compatible agent that can run shell commands. The CLI already supports non-interactive setup when the agent passes the metadata flags itself.

Full handoff: [FOR_YOUR_AGENT.md](../../FOR_YOUR_AGENT.md)

## Paste this into your agent

```text
Set up a small managed skills library for me with `ai-agent-skills`.

Use this repo for reference if you need docs or examples:
https://github.com/MoizIbnYousaf/Ai-Agent-Skills
https://github.com/MoizIbnYousaf/Ai-Agent-Skills/blob/main/FOR_YOUR_AGENT.md

Use `init-library`, `import`, `add`, `install`, `sync`, and `build-docs`.
Use the CLI with `npx`. Do not ask me to open the repo or link you to anything else.
Do not hand-edit files if the command already exists.
Create a new folder called `my-skills-library` with `npx ai-agent-skills init-library my-skills-library`, unless I clearly ask for a different name.
Move into that workspace and keep working there.
If I already have a flat repo of skills, use `npx ai-agent-skills init-library . --import` from that repo root instead.
Keep the first pass small and opinionated, around 3 to 8 skills.
If you have a built-in question tool, use it.
Ask only what you need to choose shelves, starting sources, and default install scope.
```

## Direct shell fallback

```bash
npx ai-agent-skills init-library my-library
cd my-library
npx ai-agent-skills add frontend-design --area frontend --branch Implementation --why "I want this on my shelf."
npx ai-agent-skills add anthropics/skills --skill webapp-testing --area workflow --branch Testing --why "I want browser-level checks in this library."
npx ai-agent-skills install frontend-design -p
npx ai-agent-skills sync frontend-design -p
npx ai-agent-skills build-docs
```

To bootstrap an existing flat repo of skills in place:

```bash
cd ~/projects/my-skills
npx ai-agent-skills init-library . --areas "mobile,workflow,agent-engineering" --import --auto-classify
```

That creates:

- `skills.json`
- `README.md`
- `WORK_AREAS.md`
- `skills/`
- `.ai-agent-skills/config.json`

The default workspace starts with five shelves:

- `frontend`
- `backend`
- `mobile`
- `workflow`
- `agent-engineering`

Run `list`, `search`, `collections`, and `browse` from inside the workspace when you want the CLI and TUI to read your library instead of the bundled one.
