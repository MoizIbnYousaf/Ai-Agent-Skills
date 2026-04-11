---
name: audit-library-health
description: Use when checking the overall health of a skills library. Run doctor, validate, check for stale skills, and verify generated docs are in sync.
category: workflow
version: 4.1.0
---

# Audit Library Health

## Goal

Verify that a skills library is consistent, up-to-date, and ready to share or install from.

## Guardrails

- Always use `--format json` for structured output when automating health checks.
- Always use `--dry-run` before running `build-docs` to check if docs are already in sync.
- Never push a library to a shared repo without passing `validate` and `doctor` first.
- Use `--fields` to limit output when inspecting large catalogs.

## Workflow

1. Run the validation script to check catalog integrity.

```bash
npx ai-agent-skills validate
```

This checks: required fields, folder consistency, frontmatter validity, collection integrity, and generated doc sync.

2. Run doctor to check installed skills health.

```bash
npx ai-agent-skills doctor --format json
```

3. Check for skills that may need updates.

```bash
npx ai-agent-skills check --format json
```

4. Verify generated docs are in sync.

```bash
npx ai-agent-skills build-docs --dry-run --format json
```

If `currentlyInSync` is false, regenerate:

```bash
npx ai-agent-skills build-docs
```

5. Review the curation queue for skills needing attention.

```bash
npx ai-agent-skills curate review --format json
```

## Health Checklist

- [ ] `validate` passes with no errors
- [ ] `doctor` reports no broken installs
- [ ] `build-docs --dry-run` shows docs are in sync
- [ ] No skills with empty `whyHere` fields
- [ ] All house skills have matching folders in `skills/`
- [ ] `skills.json` total matches actual skill count

## Gotchas

- `validate` and `doctor` are read-only — they never mutate the library.
- `check` makes network requests to verify upstream sources. It may be slow or timeout on unreachable repos.
- The `curate review` queue is derived from missing fields and stale verification dates — it is a heuristic, not a mandate.
