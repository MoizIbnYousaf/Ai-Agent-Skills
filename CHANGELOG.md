# Changelog

All notable changes to this project will be documented in this file.

## [3.4.0] - 2026-03-21

### Added
- Added a first-class `curate` command for editing shelf placement, editorial notes, tags, labels, trust, verification state, and removals without hand-editing `skills.json`.
- Added a shared catalog mutation engine so CLI cataloging, curator edits, vendoring, and generated docs all run through the same validation and write path.
- Added generated-doc rendering with drift checks for `README.md` and `WORK_AREAS.md`, plus an internal `render:docs` maintenance script.
- Added a TUI curator loop with inline overlays for reviewing the library, editing the focused skill, and adding new upstream picks from GitHub repos.

### Changed
- Locked normal intake to upstream-only behavior: `catalog` now accepts GitHub repos, requires full shelf placement, and refuses partial or blank editorial entries.
- Tightened `vendor` into the explicit house-copy path, with the same editorial metadata requirements as the upstream catalog flow.
- Reclassified Anthropic's `frontend-design` skill from a React lane to `UI Craft` and rewrote its editorial metadata to match the actual upstream skill.
- Synced the README and work-area map from the catalog so shelf counts and tables stop drifting.

### Removed
- Removed `figma-implement-design` from the curated library and the frontend shelf.

## [3.3.0] - 2026-03-21

### Changed
- Reworked the TUI home into a poster-style shelf browser with one dominant lead block, quieter neighboring shelves, and calmer chrome across the header, tabs, and footer.
- Reordered skill detail screens so the editorial note leads before install actions, with provenance and neighboring shelf picks kept visible without crowding the first frame.
- Polished `list` and `info` so the CLI reads like the same curated library as the TUI instead of a diagnostic catalog dump.

### Fixed
- Restored bundled `SKILL.md` loading in the TUI catalog so vendored skills can actually show real preview content again.
- Tightened the publish surface with an explicit npm `files` allowlist so temporary live-test reports and other local artifacts do not leak into the package tarball.

## [3.2.0] - 2026-03-21

### Added
- Added explicit `tier`, `distribution`, `notes`, and `labels` support to the catalog model.
- Added three new OpenAI skills: `figma-implement-design`, `security-best-practices`, and `notion-spec-to-implementation`.
- Added regression coverage for nested upstream installs, update-after-install, sparse upstream dry runs, and explicit tier metadata.
- Added a no-mock live verification suite that clones real upstream repos, captures raw source snapshots, exercises install/update/uninstall flows, and smoke-tests the TUI through a PTY.

### Changed
- Reframed the library around 10 shelves and rebuilt the collections around the current catalog.
- Normalized upstream install sources to exact repo subpaths so single-skill installs can use sparse checkout.
- Redesigned the CLI list output and TUI home around the bookshelf model instead of a flat catalog view.
- Rewrote the README, work-area map, and changelog to match the current two-tier architecture.
- Bumped the package and catalog version to `3.2.0`.

### Fixed
- Fixed nested upstream installs for cataloged skills such as `frontend-skill`, `shadcn`, and `emil-design-eng`.
- Fixed upstream installs so `update` works immediately after install with normalized `.skill-meta.json` metadata.
- Fixed TUI scope installs so upstream skills install correctly in both global and project scopes.
- Fixed project-scope lifecycle commands so `list --installed`, `update`, and `uninstall` now work against `.agents/skills/`, not only legacy agent targets.
- Fixed `preview` so upstream skills no longer print a false "not found" error before showing the fallback preview.
- Fixed root-skill renaming so local root skills keep their frontmatter name instead of inheriting a temp directory name.
- Fixed the TUI skill screen so upstream skills without bundled markdown no longer crash when opened from search.

## [3.1.0] - 2026-03-21

### Added
- Introduced the two-tier library model: house copies plus cataloged upstream skills.
- Added the `catalog` command for curating skills from GitHub repos without vendoring them.
- Added the React + Ink terminal browser and the curation atlas in `tui/`.
- Added validation for folder parity, schema integrity, and catalog totals.

### Changed
- Reduced the library from the older 48-skill set to a tighter curated shelf of 33 skills.
- Shifted the product from a generic installer toward an editorial library with provenance, trust, and `whyHere` notes.
- Moved the default install model to two scopes: global and project.

### Fixed
- Hardened install paths against traversal and unsafe name handling.
- Improved source parsing across GitHub shorthand, full URLs, local paths, and `@skill` filters.

## [1.9.2] - 2026-01-23

### Added
- `best-practices` skill to the registry.

## [1.9.1] - 2026-01-17

### Fixed
- Hardened git URL installs with validation, safer temp directories, and cleaner metadata handling.
- Added support for `ssh://` git URLs and corrected bin script paths.

## [1.9.0] - 2026-01-16

### Added
- Imported Vercel and Expo skills.
- Added framework tags for filtering.

### Fixed
- Added missing `SKILL.md` files for the imported Vercel and Expo entries.

## [1.8.0] - 2026-01-12

### Added
- Gemini CLI support with `--agent gemini` and install path `~/.gemini/skills/`.

### Changed
- Support expanded to 11 major agents.
- Updated README and package metadata for Gemini CLI support.

## [1.7.0] - 2026-01-04

### Fixed
- Improved metadata handling for sourced skills.
- Corrected the OpenCode path and related install messaging.

## [1.6.2] - 2026-01-01

### Changed
- Aligned help text and README copy with all-agent installs as the default behavior.

## [1.6.1] - 2026-01-01

### Added
- `ask-questions-if-underspecified` skill.

### Changed
- `install` now targets all supported agents by default.

## [1.6.0] - 2025-12-26

### Added
- Multi-agent operations with repeated or comma-separated `--agent` flags.

## [1.2.3] - 2025-12-26

### Fixed
- Corrected the OpenCode path from `skills` to `skill`.
- Removed the private `xreply` skill and cleaned related help text.

## [1.2.2] - 2025-12-25

### Fixed
- Added Windows path support.
- Hardened install and publish behavior before npm release.

## [1.2.1] - 2025-12-25

### Fixed
- Allowed installs where the repo root itself is the skill.

## [1.2.0] - 2025-12-20

### Added
- Interactive `browse` command.
- Install support from GitHub repos and local paths.

## [1.1.1] - 2025-12-20

### Added
- `doc-coauthoring` skill from Anthropic.

## [1.1.0] - 2025-12-20

### Added
- `--dry-run` mode to preview installs.
- Config file support through `~/.agent-skills.json`.
- Update notifications and `update --all`.
- Category filtering, tag search, and typo suggestions.
- `config` command and expanded validation tests.

### Changed
- Node.js 14+ became an explicit requirement.
- CLI output improved around skill size and help text.

### Fixed
- Better JSON and file-operation error handling.
- Partial installs are now cleaned up on failure.

### Security
- Blocked path traversal patterns in skill names.
- Enforced a 50 MB skill size limit during copy operations.

## [1.0.8] - 2025-12-20

### Added
- `uninstall` command.
- `update` command.
- `list --installed` flag.
- Letta agent support.
- Command aliases: `add`, `remove`, `rm`, `find`, `show`, `upgrade`.

### Fixed
- Description truncation only adds `...` when needed.

## [1.0.7] - 2025-12-19

### Added
- Credits and attribution section in the README.
- npm downloads badge.
- Full skill listing in the README.

### Fixed
- `--agent` flag parsing.
- Codex agent support.

## [1.0.6] - 2025-12-18

### Added
- 15 new skills from the ComposioHQ ecosystem:
  - `artifacts-builder`
  - `changelog-generator`
  - `competitive-ads-extractor`
  - `content-research-writer`
  - `developer-growth-analysis`
  - `domain-name-brainstormer`
  - `file-organizer`
  - `image-enhancer`
  - `invoice-organizer`
  - `lead-research-assistant`
  - `meeting-insights-analyzer`
  - `raffle-winner-picker`
  - `slack-gif-creator`
  - `theme-factory`
  - `video-downloader`
- Cross-link to the Awesome Agent Skills repository.

## [1.0.5] - 2025-12-18

### Fixed
- VS Code install message now correctly shows `.github/skills/`.

## [1.0.4] - 2025-12-18

### Fixed
- VS Code path corrected to `.github/skills/` from `.vscode/`.

## [1.0.3] - 2025-12-18

### Added
- `job-application` skill.

## [1.0.2] - 2025-12-18

### Added
- Multi-agent support with `--agent`.
- Support for Claude Code, Cursor, Amp, VS Code, Goose, OpenCode, and portable installs.

## [1.0.1] - 2025-12-18

### Added
- `qa-regression` skill.
- `jira-issues` skill.
- GitHub issue templates and PR templates.
- CI validation workflow.
- Funding configuration.

## [1.0.0] - 2025-12-17

### Added
- Initial release with 20 curated skills.
- NPX installer: `npx ai-agent-skills install <name>`.
- Skills from Anthropic's official examples.
- Core document skills: `pdf`, `xlsx`, `docx`, `pptx`.
- Development skills including `frontend-design`, `mcp-builder`, and `skill-creator`.
- Creative skills including `canvas-design` and `algorithmic-art`.
