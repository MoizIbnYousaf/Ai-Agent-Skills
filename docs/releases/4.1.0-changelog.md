# 4.1.0 — Team Library Sharing + Agent DX Overhaul

## Team Library Sharing

Share curated skill libraries with your team through GitHub. Create a managed library, curate your picks, push to GitHub, and teammates install the whole stack with one command.

### The flow

```bash
# Create
npx ai-agent-skills init-library our-team-skills
cd our-team-skills

# Curate
npx ai-agent-skills add frontend-design --area frontend --branch Implementation --why "Anchors our frontend shelf"
npx ai-agent-skills add anthropics/skills --skill best-practices --area agent-engineering --branch Prompts --why "Tightens vague prompts"
npx ai-agent-skills build-docs

# Share
git init && git add . && git commit -m "Initialize skills library"
gh repo create our-org/our-team-skills --public --source=. --remote=origin --push

# Teammates install
npx ai-agent-skills install our-org/our-team-skills
```

### What's new

- **Remote workspace detection.** When you `install org/repo` and the repo is a managed library (has `.ai-agent-skills/config.json`), the CLI reads the catalog instead of scanning for SKILL.md files. You get the full organized view: shelves, curation notes, collections.
- **Transitive source resolution.** House copies install directly from the library. Upstream-only entries chain to their original source repo automatically. One level of resolution — no recursive cloning.
- **Cherry-pick and collections.** `install org/repo --skill name` for one skill. `install org/repo --collection starter-pack` for a curated pack. `install org/repo --list` to browse before installing.
- **5 work areas by default.** `init-library` now seeds frontend, backend, mobile, workflow, and agent-engineering. Previously only 3.
- **Guided next steps.** After `init-library`, the CLI prints discovery commands, `add` examples with proper flags, `build-docs`, git push steps, and the shareable install command.

### Machine-readable output for remote libraries

- `--list` in non-TTY: tab-separated `LIBRARY`/`SKILL` rows with name, tier, workArea, whyHere.
- `--dry-run` in non-TTY: tab-separated `PLAN`/`INSTALL` rows with mode and sourceRef.
- Errors: `ERROR\tCODE\tmessage` + `HINT\tnext-step`. Codes: AUTH, SOURCE, CATALOG, INVALID_FLAGS, EMPTY, COLLECTION, SKILL, INSTALL.

## Agent DX Improvements

Agent DX CLI Scale score: 6/21 → 12/21 (agent-tolerant → agent-ready). Work in progress toward 21/21.

- **`--format json` globally.** Every command supports `--format json`. Non-TTY defaults to JSON when no explicit format is set.
- **`help --json` schema introspection.** Emits command schemas with flags, types, enums, and required fields. `help <command> --json` for per-command detail.
- **`--json` stdin input.** Mutating commands accept JSON payloads via stdin. Schema maps to skills.json entry shape.
- **`--fields` masks.** Limit output fields on read commands. `--fields name,tier,workArea` keeps context windows small.
- **`--limit` and `--offset` pagination.** Control result size for large catalogs.
- **Input hardening.** `validateAgentInput()` rejects path traversal (`../`), percent-encoded segments (`%2e`), control characters, and embedded query params (`?`, `#`).
- **`--dry-run` expansion.** Available on remote library installs and additional mutation commands.
- **Response sanitization.** `sanitizeSkillContent()` strips prompt injection patterns (`<system>`, `ignore previous`, embedded base64) from skill content display.

## FOR_YOUR_AGENT.md — Now an Agent Decision Protocol

Rewritten from a command cheat-sheet into a curator decision framework:

- 5 work areas with shelf mapping heuristics
- Discovery loop: browse shelves, search by stack, check collections before curating
- Add vs catalog vs vendor decision rules
- whyHere quality guidance with good/bad examples
- Featured limits (2-3 per shelf)
- Collections guidance (starter-pack after 5-8 skills)
- Branch naming conventions
- Sanity-check step before handoff
- Full sharing step: git init → gh repo create → shareable install command

## Shipped Skill Files

Three new house-copy skills for the CLI's own workflows:

- `install-from-remote-library` — how to install from a shared library with guardrails
- `curate-a-team-library` — the full curator decision protocol as an installable skill
- `share-a-library` — git push + shareable link workflow

Install with: `npx ai-agent-skills install curate-a-team-library`

## Tests

148 → 191. 43 new tests covering remote workspace detection, transitive resolution, flag conflicts, edge cases, input hardening, dry-run, sanitization, schema introspection, and FOR_YOUR_AGENT.md content assertions. Zero regressions.

## What's next (toward 21/21)

- Universal `--json` stdin across all remaining mutations
- Nested inputSchema/outputSchema in `help --json`
- `--fields` on all read commands
- Output path sandboxing to CWD
- `--dry-run` on all mutating commands
- More shipped skill files covering all major CLI workflows
