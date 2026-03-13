# Contributing to AI Agent Skills

This repo is curated on purpose.

I am not trying to build the biggest skill library on GitHub. I want a smaller, sharper library of skills that are actually worth installing.

Before you open a PR, read [CURATION.md](./CURATION.md).

## What Makes A Good Addition

A skill is a good fit when it is:

- clear about what it does and when to use it
- reusable in real workflows
- strong enough to beat a generic prompt
- well-structured and easy for an agent to follow
- properly attributed

If your skill is fine but does not really add much to the library, I would rather leave it out.

## Requirements

1. The skill must follow the [Agent Skills specification](https://agentskills.io/specification).
2. `SKILL.md` must include valid YAML frontmatter with `name` and `description`.
3. The skill name must be lowercase with hyphens only, for example `my-skill`.
4. The skill should actually work and provide value.
5. Your PR should explain why this deserves a place in the library.

## Process

1. Fork the repo.
2. Add the skill folder at `skills/<skill-name>/`.
3. Add or update the `skills.json` entry.
4. Put the skill in at least one collection.
5. Run `node test.js`.
6. Open a PR with a short explanation of why it belongs.

## Categories

Use one of these:

- `development`
- `document`
- `creative`
- `business`
- `productivity`

## Collections

Most skills should fit into at least one of these:

- `my-picks`
- `web-product`
- `mobile-expo`
- `backend-systems`
- `quality-workflows`
- `docs-files`
- `business-research`
- `creative-media`

If none of those fit, explain why.

## Review Bar

I review submissions for:

- usefulness
- clarity
- overlap with existing skills
- attribution and licensing
- overall fit with the repo

## Updating Existing Skills

If you are improving a skill that is already here:

1. Keep attribution intact unless ownership has clearly changed.
2. Explain what you changed and why it is better.
3. Say whether it should move collections, become featured, or become verified.

## Questions

If you are not sure whether something belongs, open an issue first. That is usually faster than building the whole thing and finding out it is not a fit.
