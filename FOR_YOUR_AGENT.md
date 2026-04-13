# For Your Agent

Use this when you want an agent to build and share a managed skills library for you, not just make a local folder of `SKILL.md` files.

For detailed workflow guidance, install the skill: `npx ai-agent-skills install curate-a-team-library`.

The companion workflow skills are:

- `npx ai-agent-skills install install-from-remote-library`
- `npx ai-agent-skills install curate-a-team-library`
- `npx ai-agent-skills install share-a-library`
- `npx ai-agent-skills install browse-and-evaluate`
- `npx ai-agent-skills install update-installed-skills`
- `npx ai-agent-skills install build-workspace-docs`
- `npx ai-agent-skills install review-a-skill`
- `npx ai-agent-skills install audit-library-health`
- `npx ai-agent-skills install migrate-skills-between-libraries`

## Paste this into your agent

```text
Set up a managed team skills library for me with `ai-agent-skills`.

Use this repo for reference if you need docs or examples:
https://github.com/MoizIbnYousaf/Ai-Agent-Skills
https://github.com/MoizIbnYousaf/Ai-Agent-Skills/blob/main/FOR_YOUR_AGENT.md

Use the CLI with `npx`. Do not ask me to open the repo or link you to anything else.
Do not hand-edit `skills.json`, `README.md`, or `WORK_AREAS.md` if the command already exists.

Follow this curator decision protocol:

1. Create a new workspace with `npx ai-agent-skills init-library <name>`, unless I already gave you a library name.
   - If I already have a flat repo of local skills, run `npx ai-agent-skills init-library . --import` from that repo root instead of creating a new directory.
   - Invalid private-only names such as colon or underscore variants should be skipped and reported, not allowed to kill the whole batch.
2. Move into that workspace and keep working there.
3. Ask me at most 3 short questions before acting:
   - what kinds of work the library needs to support
   - whether the first pass should stay small and opinionated or aim broader
   - whether this should end as a local draft only or a shareable GitHub repo
4. Use these 5 work areas as the shelf system:
   - `frontend` for web UI, browser work, design systems, visual polish
   - `backend` for APIs, databases, security, infrastructure, runtime systems
   - `mobile` for iOS, Android, React Native, Expo, device testing, app delivery
   - `workflow` for docs, testing, release work, files, research, planning
   - `agent-engineering` for prompts, evals, tools, orchestration, agent runtime design
5. Map the user's stack to shelves before adding anything.
   - Example: "I build mobile apps with React Native and a Node backend" maps to `mobile` + `backend`.
   - Add `workflow` only when testing, release, docs, or research are clearly part of the job.
   - Add `agent-engineering` only when the user is building AI features, agents, prompts, evals, or toolchains.
   - Make sure the first pass covers every primary shelf the user explicitly named. Do not let `mobile` crowd out `backend` if they asked for both.
6. Run a discovery loop before curating:
   - use `npx ai-agent-skills list --area <work-area>` to browse a shelf
   - use `npx ai-agent-skills search <query>` when the user names a stack, tool, or capability
   - use `npx ai-agent-skills collections` to inspect starter packs that may already exist
   - keep machine-readable reads tight with `--fields name,tier,workArea`
   - use `--limit 10` on larger result sets before asking for more
   - if the user named multiple primary shelves, browse each of them before deciding what to add
7. Keep the first pass small, around 3 to 8 skills.
8. Choose the right mutation path:
   - use `add` first for bundled picks and simple GitHub imports when the CLI can route it for you
   - use `catalog` when you want an upstream entry without copying files into `skills/`
   - use `vendor` only for true house copies you want to edit or own locally
9. Keep branch names consistent and useful.
   - Examples: `React Native / UI`, `React Native / QA`, `Node / APIs`, `Node / Data`, `Docs / Release`
   - Use branches to group related picks inside a shelf, not as free-form notes
10. Every mutation must include explicit curator metadata like `--area`, `--branch`, and `--why`.
11. Write `whyHere` notes as concrete curation reasoning, not placeholders.
   - good: "Covers React Native testing so the mobile shelf has a real device-validation option."
   - bad: "I want this on my shelf."
12. Use `--featured` sparingly.
   - keep it to about 2 to 3 featured skills per shelf
   - reserve it for skills you would tell a new teammate to install first
13. After the library has about 5 to 8 solid picks, create a `starter-pack` collection.
   - add new entries with `--collection starter-pack`
   - or use `npx ai-agent-skills curate <skill> --collection starter-pack` for existing entries
14. Sanity-check the library before finishing.
   - run `npx ai-agent-skills list --area <work-area>` for each primary shelf you touched
   - if you created `starter-pack`, run `npx ai-agent-skills collections` and confirm the install command looks right
15. Run `npx ai-agent-skills build-docs` before finishing.
16. If the user wants the library shared, turn it into a GitHub repo:
   - `git init`
   - `git add .`
   - `git commit -m "Initialize skills library"`
   - `gh repo create <owner>/<repo> --public --source=. --remote=origin --push`
17. End by telling me:
   - what you added
   - which shelves you used and why
   - which skills are featured
   - what the `starter-pack` includes, if you created one
   - the shareable install command
   - use `npx ai-agent-skills install <owner>/<repo> --collection starter-pack -p` when a starter pack exists
   - otherwise use `npx ai-agent-skills install <owner>/<repo> -p`
```

## Curator Decision Framework

Start with the workspace, not manual file edits. The job is to produce a library that another person or agent can actually browse, trust, and install.

### Shelf Mapping Rules

- `frontend`: web interfaces, design systems, browser automation, UI polish, app-shell UX.
- `backend`: APIs, auth, databases, data pipelines, infra, services, runtime behavior.
- `mobile`: React Native, Expo, SwiftUI, Kotlin, simulators, device QA, store delivery.
- `workflow`: testing, release work, docs, research, content ops, file transforms, planning.
- `agent-engineering`: prompts, evals, tool use, orchestration, memory, agent runtime patterns.

If a user gives a mixed stack, map it to more than one shelf. Do not force every skill into one branch. If the stack is "React Native + Node backend", the first shelves are `mobile` and `backend`, and you only pull in `workflow` or `agent-engineering` when the actual work justifies it.

The first pass should include at least one strong anchor skill for each primary shelf the user explicitly named.

### Discovery Loop

Before curating, inspect what already exists.

- Browse shelves with `npx ai-agent-skills list --area <work-area>`.
- Search by tools or capabilities with `npx ai-agent-skills search <query>`.
- Check `npx ai-agent-skills collections` when a ready-made pack may already cover part of the use case.
- In machine-readable flows, prefer `--fields name,tier,workArea` first so the response stays small.
- Add `--limit 10` when a shelf or search looks broad, then page further only if needed.
- If the user named multiple primary shelves, browse each one before you start curating.

Do not jump straight from `init-library` to a few guessed names unless the user already told you the exact skills they want.

### Add vs Catalog vs Vendor

- Use `add` as the default front door inside a workspace.
- Use `catalog` when the right move is "track this upstream skill in our library, but do not copy its files into `skills/`."
- Use `vendor` when the right move is "we want our own editable house copy in this library."

If the user wants a repo they can share across a team, prefer upstream catalog entries for third-party skills and reserve house copies for true internal ownership.

### Branch Naming

Keep branch labels consistent so the shelves stay readable.

- Good: `React Native / UI`, `React Native / QA`, `Node / APIs`, `Node / Data`, `Docs / Release`
- Bad: `stuff`, `misc`, `my notes`

### Writing Good `whyHere` Notes

`whyHere` is curator judgment. It should explain why this skill belongs in this library, on this shelf, for this team.

- Mention the actual gap it fills.
- Mention the stack or workflow it supports.
- Be honest about why it is here instead of a nearby alternative.
- Never use placeholders like "I want this" or "looks useful."

### Featured Skills

Featured picks are the shelf anchors.

- Keep featured picks to about 2 to 3 per shelf.
- Feature the skills a new teammate should notice first.
- Do not feature everything.

### Collections

Once the library has a meaningful first pass, create a `starter-pack` collection.

- Put the first recommended 3 to 5 skills in it.
- Make it cross-shelf when that helps onboarding.
- Use `curate --collection starter-pack` to retrofit membership onto skills that are already in the catalog.

### Final Sanity Check

Before you hand the library back:

- Run `npx ai-agent-skills list --area <work-area>` for each primary shelf you touched.
- Run `npx ai-agent-skills collections` if you created `starter-pack`.
- Make sure the resulting library still reflects the user’s actual stack and does not over-index on one shelf.

### Sharing Step

A library is not really shared until it is in Git and has an install command you can hand to someone else.

After `build-docs`, if the user wants sharing:

```bash
git init
git add .
git commit -m "Initialize skills library"
gh repo create <owner>/<repo> --public --source=. --remote=origin --push
```

Then give them the actual install command to share, for example:

```bash
npx ai-agent-skills install <owner>/<repo> --collection starter-pack -p
```

If you did not create a `starter-pack` yet, share the whole library instead:

```bash
npx ai-agent-skills install <owner>/<repo> -p
```

## Direct Shell Fallback

```bash
npx ai-agent-skills init-library my-library
cd my-library

npx ai-agent-skills list --area mobile
npx ai-agent-skills search react-native
npx ai-agent-skills search testing

npx ai-agent-skills add frontend-design --area frontend --branch Implementation --why "Anchors the frontend shelf with stronger UI craft and production-ready interface direction."
npx ai-agent-skills add anthropics/skills --skill webapp-testing --area workflow --branch Testing --why "Adds browser-level validation so the workflow shelf covers end-to-end checks." --collection starter-pack
npx ai-agent-skills catalog conorluddy/ios-simulator-skill --skill ios-simulator-skill --area mobile --branch "React Native / QA" --why "Gives the mobile shelf a concrete simulator workflow for app-level testing." --collection starter-pack --featured

npx ai-agent-skills build-docs

# Existing flat repo of skills
cd ~/projects/my-skills
npx ai-agent-skills init-library . --areas "mobile,workflow,agent-engineering" --import --auto-classify
npx ai-agent-skills list --area workflow
npx ai-agent-skills curate my-skill --area mobile --branch "Mobile / Imported" --why "Why it belongs."

git init
git add .
git commit -m "Initialize skills library"
gh repo create <owner>/my-library --public --source=. --remote=origin --push

# Share this with teammates:
npx ai-agent-skills install <owner>/my-library --collection starter-pack -p
```
