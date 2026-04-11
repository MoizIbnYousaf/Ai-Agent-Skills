# Changelog

All notable changes to this project will be documented in this file.

## [4.2.0] - 2026-03-31

### Added
- Remote shared-library installs that detect managed workspaces, expose parseable `--list` and `--dry-run` output, and resolve house copies plus upstream picks from one install flow.
- Authored workflow skills for `audit-library-health`, `browse-and-evaluate`, `build-workspace-docs`, `migrate-skills-between-libraries`, `review-a-skill`, and `update-installed-skills`.
- Wider machine-readable command support with JSON schemas, stdin mutation input, field masks, pagination, and dry-run coverage across more workflows.

### Changed
- Refined the shared-library story around team curation, shelf-first browsing, and a stronger "for your agent" handoff protocol.
- Tightened remote install errors and dry-run plans so non-interactive use stays predictable and actionable.
- Updated the README and curator-facing docs so the public surface matches the 4.2.0 library-manager state.

### Fixed
- Corrected shared-library dependency resolution so house copies install from the library while upstream entries keep their own recorded source.
- Hardened preview and install surfaces against suspicious content and invalid path-style inputs.
- Preserved workspace installs after workspace moves and improved unavailable-source messaging when a shared library can no longer be found.

## [4.0.0] - 2026-03-27

### Added
- Managed workspace mode with `.ai-agent-skills/config.json` and `init-library` scaffolding.
- The `add` command for bringing bundled picks, upstream repo skills, and house copies into a workspace library.
- The `build-docs` command for regenerating workspace `README.md` and `WORK_AREAS.md`.
- Dependency-aware catalog installs with `requires` and `--no-deps`.
- A shared install-state index used by the CLI and TUI.
- An `Installed` top-level TUI view and an empty-workspace onboarding state.
- Authored workflow guides for starting a library, adding upstream skills, making house copies, organizing shelves, and refreshing installs.

### Changed
- Promoted `sync` to the primary refresh command and kept `update` as a compatibility alias.
- Routed CLI and TUI library reads through active library resolution, so commands now follow bundled mode or workspace mode based on the current directory.
- Reframed the README and package surface around `ai-agent-skills` as a library manager, not only the bundled curated library.
- Split the README quick start into bundled-library and managed-workspace flows.

### Fixed
- Restored installed workspace catalog skills after workspace moves when commands run inside the relocated workspace.
- Tightened the npm publish surface so only workflow docs ship from `docs/`.
- Enforced duplicate-dependency validation for `requires`.
- Preserved explicit GitHub refs when cataloged upstream skills are stored as install metadata.

## [3.4.3] - 2026-03-21

### Changed
- Changed the default TUI opening view back to the boxed shelf and source grid so `ai-agent-skills` lands directly on the card-based library browser instead of the poster-text lead view.
- Restored the focused home inspector under the grid so the opening screen keeps the richer shelf/source preview while staying in the boxed layout.

### Removed
- Removed the temporary poster-home renderer and its compact-visibility helper now that the boxed library view is the default again.

## [3.4.2] - 2026-03-21

### Changed
- Tightened the TUI home into a stronger shelf-first poster layout with one dominant lead shelf or source and quieter neighboring picks below it.
- Replaced the last internal `atlas` wording in the TUI with consistent `library`, `shelves`, and `sources` language.

### Fixed
- Fixed TUI boot so the library opens from the top of the terminal pane instead of landing partway down the first screen.
- Removed the startup/loading card from the initial TUI frame so the first visible render is the actual library, not a boot placeholder.

## [3.4.1] - 2026-03-21

### Changed
- Simplified the TUI to the two real browse modes, `Shelves` and `Sources`, so the library opens directly into the taxonomy instead of a separate home summary.
- Renamed the overlapping frontend lanes to `Frontend (Anthropic)` and `Frontend (OpenAI)` so the publisher distinction is obvious while browsing.
- Tightened shelf and source cards with more editorial copy and less filler metadata so the first scan feels more like a library and less like a dashboard.
- Restored the README note that this repo launched before `skills.sh` and began as a universal installer before becoming a personal curated library.

### Fixed
- Corrected the source card footer pluralization in the TUI (`shelves`, not `shelfs`).

## [3.4.0] - 2026-03-21

### Added
- Added a first-class `curate` command for editing shelf placement, editorial notes, tags, labels, trust, verification state, and removals without hand-editing `skills.json`.
- Added a shared catalog mutation engine so CLI cataloging, curator edits, vendoring, and generated docs all run through the same validation and write path.
- Added generated-doc rendering with drift checks for `README.md` and `WORK_AREAS.md`, plus an internal `render:docs` maintenance script.
- Added a TUI curator loop with inline overlays for reviewing the library, editing the focused skill, and adding new upstream picks from GitHub repos.

### Changed
- Locked normal intake to upstream-only behavior: `catalog` now accepts GitHub repos, requires full shelf placement, and refuses partial or blank editorial entries.
- Tightened `vendor` into the explicit house-copy path, with the same editorial metadata requirements as the upstream catalog flow.
- Renamed the two overlapping frontend lanes so they read by publisher: `Frontend (Anthropic)` and `Frontend (OpenAI)`.
- Simplified the TUI to the two real browse modes, `Shelves` and `Sources`, with the old home summary removed from the top-level navigation.
- Rewrote shelf and source lane cards with more editorial copy and less generic metadata filler so the first scan reads like a curated library, not a utility dashboard.
- Synced the README and work-area map from the catalog so shelf counts and tables stop drifting.
- Restored the README note that this repo launched before `skills.sh` and started life as a universal installer before becoming a personal skills library.

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
