# Make a House Copy

Use `vendor` when you want the local copy inside your library.

```bash
npx ai-agent-skills vendor ~/repo --skill my-skill --area frontend --branch Components --why "I want the local copy here."
```

Good reasons to vendor:

- you want the skill to work offline
- you want to edit the skill body locally
- you want a maintained house copy instead of a live upstream install

`vendor` copies the files into `skills/<name>/`, adds the metadata entry, and regenerates the docs for the active library.
