# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

### Changed
- Removed six low-signal pointer skills from the catalog and kept the stronger sourced skills.
- Dropped static per-skill `stars` and `downloads` fields from `skills.json`.
- Added `origin` and `trust` metadata to catalog entries for clearer provenance.
- Added `sourceUrl`, `syncMode`, `whyHere`, and `lastVerified` fields to make curation and provenance easier to inspect.
- Synced repo metadata around version `1.9.2`.

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
