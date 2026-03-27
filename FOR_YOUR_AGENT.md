# For Your Agent

Use this when you want your agent to set up a library for you. just copy paste to ur gippty or clawd

## Paste this into your agent

```text
Set up a small managed skills library for me with `ai-agent-skills`.

Use the CLI, not manual file edits.

1. Create a managed workspace with `npx ai-agent-skills init-library`.
2. Ask me at most 3 short questions before acting:
   - if you have a built-in question tool, use it
   - which shelves or kinds of work matter most
   - whether to start mostly from bundled picks or mix in upstream skills
   - whether installs should default to project scope, global scope, or library setup only
3. Keep the first pass small, around 3 to 8 skills.
4. Use `npx ai-agent-skills add` first.
5. Use `catalog` when you need an upstream entry. Use `vendor` only for real house copies.
6. Run `npx ai-agent-skills build-docs` at the end.
7. Tell me what you added, which shelves you used, and what you think I should add next.

If you cannot run local commands here, tell me to switch to an agent with terminal access.
```

## What the agent should do

Start with the CLI. Do not hand-edit `skills.json`, `README.md`, or `WORK_AREAS.md` if the command already exists.

The usual path is:

- `init-library` to create the workspace
- `add` for the first bundled picks
- `catalog` when you want an upstream skill in the library without a house copy
- `vendor` when you really do want a local house copy
- `build-docs` to regenerate the workspace docs

If the agent is running without prompts, it should pass explicit metadata like `--area`, `--branch`, and `--why`.
If it has a built-in question tool, use that for onboarding. Otherwise ask the questions plainly.

Keep the first version of the library small. A good first pass is 3 to 8 skills with clear shelf placement and honest notes.

## Direct shell fallback

```bash
npx ai-agent-skills init-library my-library
cd my-library
npx ai-agent-skills add frontend-design --area frontend --branch Implementation --why "I want this on my shelf."
npx ai-agent-skills add anthropics/skills --skill webapp-testing --area workflow --branch Testing --why "I want browser-level checks in this library."
npx ai-agent-skills build-docs
```

After that, run `list`, `search`, `collections`, and `browse` from inside the workspace when you want to inspect your own library instead of the bundled one.
