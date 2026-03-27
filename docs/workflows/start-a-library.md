# Start a Library

This works well with any Agent Skills-compatible agent that has shell access. The CLI already supports non-interactive setup when the agent passes explicit metadata flags.

Full handoff: [FOR_YOUR_AGENT.md](../../FOR_YOUR_AGENT.md)

## Paste this into your agent

```text
Set up a small managed skills library for me with `ai-agent-skills`.

Use `init-library`, `add`, `install`, `sync`, and `build-docs`.
Use the CLI, not manual file edits.
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

That creates:

- `skills.json`
- `README.md`
- `WORK_AREAS.md`
- `skills/`
- `.ai-agent-skills/config.json`

The workspace starts small on purpose:

- `frontend`
- `backend`
- `workflow`

Run `list`, `search`, `collections`, and `browse` from inside the workspace when you want the CLI and TUI to read your library instead of the bundled one.
