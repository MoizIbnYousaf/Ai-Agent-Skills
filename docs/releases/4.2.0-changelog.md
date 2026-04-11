# 4.2.0 — Shared Libraries, Agent DX, and Workflow Skills

## Summary

`ai-agent-skills 4.2.0` tightens the package around a clearer job: a curated library you can keep for yourself or share with a team, plus the CLI and TUI to browse, install, and maintain it.

This release pushes the library-manager side forward without losing the curator voice. The package is still a keep pile, picked and maintained by hand. It now does a better job of helping a team share that taste.

## Highlights

- **Shared library installs over GitHub.** Managed workspaces can now be installed directly with `install <owner>/<repo>`, including collection selection, single-skill installs, and parseable non-interactive output.
- **Stronger machine-readable CLI flows.** More commands now support `--format json`, field masks, pagination, stdin mutation input, and safer dry-run output for agent-driven use.
- **More authored workflow skills.** The library now ships a fuller set of internal workflow skills for browsing, reviewing, syncing, documenting, auditing, migrating, and sharing skill libraries.
- **Better install-state and dependency handling.** Shared-library installs now preserve source truth more cleanly, and dependency-aware catalog installs remain deterministic.

## What Changed

### Shared Libraries

- Detect managed workspaces remotely through `.ai-agent-skills/config.json`
- Read remote `skills.json` catalogs instead of relying only on flat `SKILL.md` discovery
- Support `--collection`, `--skill`, `--list`, and `--dry-run` against shared libraries
- Keep house copies sourced from the shared library while upstream-only entries still resolve from their original source

### Agent DX

- Expanded `--format json` coverage
- Added tighter machine-readable schemas, field masks, pagination, and dry-run output
- Improved non-interactive error reporting with more actionable messages
- Hardened preview and input handling against suspicious or malformed content

### Workflow Skills

New or expanded house-copy workflow skills now cover:

- auditing a library
- browsing and evaluating skills
- rebuilding workspace docs
- migrating between libraries
- reviewing a skill before keeping it
- updating installed skills safely

## Release Notes

This release is about alignment between curation and tooling.

The library is still small on purpose.
The difference is that the package now does a better job of carrying that curation into real team workflows: building a workspace, shaping shelves, publishing a shared library, and installing it without guesswork.
