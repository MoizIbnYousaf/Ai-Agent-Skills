# Curation Guide

This repo is my keep pile.

I am not trying to mirror every agent skill on the internet. I want a strong set of skills that I would actually keep on a machine, recommend to other developers, and keep improving over time.

## What I Care About

I want skills here to be:

- genuinely useful in real work
- clear enough that an agent can follow them well
- reusable across more than one project
- good enough to beat a generic prompt
- worth maintaining

If a skill does not clear that bar, I would rather leave it out.

## What Usually Does Not Belong

- weak rewrites of skills that already exist here
- novelty skills that will feel dead in a month
- skills that are so narrow they are not worth maintaining
- skills with unclear attribution or licensing
- prompt dumps pretending to be skills

## How I Keep It Organized

I keep the folder structure simple and let the catalog do the sorting.

- `skills/` holds the actual skill folders
- `skills.json` is the catalog the CLI reads
- `collections` are the main browsing layer
- `category`, `tags`, `featured`, and `verified` help with sorting and trust

I do not want a deep folder tree. That usually makes install tooling worse and the repo harder to maintain.

## Collections

Collections are how I want people to browse the repo:

- `my-picks`: the fastest way to understand my taste
- `web-product`: frontend, design systems, and web shipping work
- `mobile-expo`: Expo and React Native workflows
- `backend-systems`: APIs, architecture, MCP, and heavier engineering work
- `quality-workflows`: testing, review, QA, and planning
- `docs-files`: documents, spreadsheets, coauthoring, and file-heavy work
- `business-research`: communication, research, growth, and operator tasks
- `creative-media`: visual and media-oriented work

## Featured And Verified

- `featured: true` means I would point people to that skill first
- `verified: true` means I have personally checked it and I am comfortable signaling more trust

I want those markers to mean something. They should stay a little hard to earn.

## Agent Support

I am keeping support focused on the major agents.

I do not want to spend my time adding support for every new coding agent that launches, especially if I do not use it or do not think it will matter in six months.

If support is here, it should be worth the maintenance burden.

## Maintainer Workflow

When I add or update a skill, I try to answer these questions:

1. Is this actually good?
2. Does it belong here?
3. What is the right category?
4. Which collection should it live in?
5. Is it good enough to feature?
6. Have I checked enough to verify it?
7. Is the attribution clean?

## If This Turns Into A Website

The repo already has the shape for that.

- home page: `my-picks`
- browse page: collections first, categories second
- skill page: source, tags, collections, install command
- trust layer: featured and verified

The repo should stay where the data lives. A site can just present it better.
