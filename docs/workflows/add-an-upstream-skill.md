# Add an Upstream Skill

Use `add` when you want a workspace entry but do not want to vendor the source.

From the bundled reference library:

```bash
npx ai-agent-skills add frontend-design --area frontend --branch Implementation --why "I want this on my shelf."
```

From a GitHub repo:

```bash
npx ai-agent-skills add anthropics/skills --skill ask-questions-if-underspecified --area workflow --branch Planning --why "I use this to tighten vague requests."
```

`add` writes to the active workspace only.

It keeps the upstream metadata:

- `description`
- `source`
- `sourceUrl`
- `installSource`
- `tags`
- `labels`
- `requires`

You still choose:

- shelf
- branch
- why it belongs

That keeps the workspace shaped like your own library instead of becoming a blind copy.
