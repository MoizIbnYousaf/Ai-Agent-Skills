---
name: build-workspace-docs
description: Use when regenerating README.md and WORK_AREAS.md in a managed library workspace. Always dry-run first to preview changes.
category: workflow
version: 4.1.0
---

# Build Workspace Docs

## Goal

Keep workspace documentation in sync with the skills catalog after adding, removing, or curating skills.

## Guardrails

- Always use `--dry-run` before regenerating docs to preview what will change.
- Only run from inside an initialized library workspace (a directory with `.ai-agent-skills/config.json`).
- Never hand-edit the generated sections of README.md or WORK_AREAS.md. The CLI will overwrite them.
- Use `--format json` to capture structured results for automation pipelines.

## Workflow

1. Preview what would change.

```bash
npx ai-agent-skills build-docs --dry-run
```

2. Regenerate the docs.

```bash
npx ai-agent-skills build-docs
```

3. Verify the output.

```bash
npx ai-agent-skills build-docs --dry-run --format json
```

The JSON output includes `currentlyInSync` to tell you whether docs were already up to date.

## When to Run

- After `add`, `catalog`, `vendor`, or `curate` commands that change the skills catalog.
- After bulk imports from a remote library.
- Before committing workspace changes to git.

## Gotchas

- Running outside a workspace will fail with a clear error. Use `init-library` to create one first.
- The generated docs use HTML comment markers (`<!-- GENERATED:...:start/end -->`) as boundaries. Do not remove these markers from the template sections.
