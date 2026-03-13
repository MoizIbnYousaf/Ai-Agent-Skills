# Curation Guide

This repo is my keep pile.

I am not trying to mirror every agent skill on the internet. I want a strong set of skills that I would actually keep on a machine, recommend to other developers, and keep improving over time.
Most of those skills come from other repos, so curation here is as much about provenance and trust as it is about the skill text itself.

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
- `workArea` and `branch` are the main browse fields in the catalog
- `work areas` are the main browse model
- `collections` are the shorter CLI shelves
- `category`, `tags`, `source`, `sourceUrl`, `origin`, `syncMode`, `featured`, `verified`, and `trust` help with sorting and trust

I do not want a deep folder tree. That usually makes install tooling worse and the repo harder to maintain.

## Work Areas And Collections

The main browse model is work area first, source repo second.

Collections are still useful, but they are not meant to cover everything.

- `my-picks`: the fastest way to understand my taste
- `build-apps`: web and mobile product work with a high interface bar
- `build-systems`: backend, architecture, MCP, and deeper engineering work
- `test-and-debug`: review, QA, debugging, and cleanup work
- `docs-and-research`: docs, files, research, and execution support

Not every skill needs a collection. If something is useful but off to the side, search and tags can do the job.

## Featured And Verified

- `featured: true` means I would point people to that skill first
- `verified: true` means I have personally checked it and I am comfortable signaling more trust

I want those markers to mean something. They should stay a little hard to earn.

## Trust Levels

- `listed` means the skill belongs in the library, but I am not signaling much beyond that yet
- `reviewed` means I have put a little more editorial weight behind it
- `verified` means I have personally checked it and I am comfortable standing behind it more directly

## Mirrors And Snapshots

- `mirror` means the local copy still tracks a clean upstream counterpart closely
- `snapshot` means I am intentionally shipping a stable vendored copy even if upstream has moved
- `adapted` means the library copy is based on outside work but changed enough that I do not want to pretend it is a straight mirror
- `authored` means I maintain the skill directly here

## Agent Support

I am keeping support focused on the major agents.

I do not want to spend my time adding support for every new coding agent that launches, especially if I do not use it or do not think it will matter in six months.

If support is here, it should be worth the maintenance burden.

## Maintainer Workflow

When I add or update a skill, I try to answer these questions:

1. Is this actually good?
2. Does it belong here?
3. What is the right category?
4. Does it deserve a top-level shelf, or should it stay tag-driven?
5. Is it good enough to feature?
6. Have I checked enough to verify it?
7. Is the attribution clean?

## If This Turns Into A Website

The repo already has the shape for that.

- home page: library first, with work areas and source repos both visible
- browse page: collections, tags, source repos, and search
- skill page: source, tags, collections when relevant, install command
- trust layer: featured, verified, and catalog trust state

The repo should stay where the data lives. A site can just present it better.
