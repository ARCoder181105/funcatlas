# CodeCanvas (working name)

An interactive, self-updating visual map of a codebase. Give it a repo, it parses every function, links calls/imports into a graph, and renders it as an explorable canvas — click a file to see a card, click the card to see a mind-map of its functions, click a function to see its code block.

Built to solve one problem: large codebases are hard to hold in your head, and grep/IDE-navigation only show you one file at a time, not the shape of the whole thing.

## Status

Early / personal project, actively being designed and built solo.

## How it works (one paragraph)

Clone the target repo → parse every file with tree-sitter → extract function definitions and call sites → resolve each call to the specific function it refers to (name/scope matching first, LSP-based resolution later) → store functions + edges in Postgres → serve it to a React Flow canvas where files, function mind-maps, and code blocks are all explorable, with an Excalidraw layer for free-form notes → re-parse only changed files automatically on every push/merge via webhook.

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — system components and how they connect
- [`docs/TECH_STACK.md`](docs/TECH_STACK.md) — what's used where, and why
- [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) — database schema
- [`docs/PARSING_STRATEGY.md`](docs/PARSING_STRATEGY.md) — how parsing and call-resolution actually work, including known limitations
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — phased build plan
- [`docs/SECURITY.md`](docs/SECURITY.md) — cloning/parsing untrusted repos safely

## Repo layout (planned)

```
/apps
  /web        → TypeScript + React + React Flow canvas
  /api        → TypeScript (Node) — auth, repo management, serving graph data
/services
  /parser     → Go — clone, parse, resolve calls, write to Postgres
/docs         → this documentation
```

## Core stack at a glance

- **Frontend/canvas:** TypeScript, React, React Flow, Excalidraw (embedded)
- **App backend:** TypeScript (Node)
- **Parsing worker:** Go + tree-sitter
- **Database:** Postgres
- **Queue:** Redis (BullMQ) or equivalent, for the clone → parse → webhook re-parse pipeline
- **Auth:** GitHub OAuth

See `docs/TECH_STACK.md` for the reasoning behind each choice.
