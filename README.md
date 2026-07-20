# CodeCanvas (working name)

An interactive, self-updating visual map of a codebase. Give it a repo, it parses every function, links calls/imports into a graph, and renders it as an explorable canvas — click a file to see a card, click the card to see a mind-map of its functions, click a function to see its code block.

Built to solve one problem: large codebases are hard to hold in your head, and grep/IDE-navigation only show you one file at a time, not the shape of the whole thing.

## Status

Actively being built toward a **production-grade MVP** (see `PLAN.md` and `docs/ROADMAP.md`). The full tech stack is locked in up front in `docs/TECH_STACK.md` ("Pre-bootstrap tech-stack lock-in") so no crucial decision is made mid-development. The first language is TypeScript; GitHub OAuth and webhook-driven incremental updates are in scope from the start. Excalidraw annotations and LSP-based resolution are deliberately deferred to post-MVP.

> Repo name is `funcatlas`; the product/working name used in prose is **CodeCanvas**.

## How it works (one paragraph)

Clone the target repo → parse every file with tree-sitter → extract function definitions and call sites → resolve each call to the specific function it refers to (name/scope matching first, LSP-based resolution later) → store functions + edges in Postgres → serve it to a React Flow canvas where files, function mind-maps, and code blocks are all explorable, with an Excalidraw layer for free-form notes → re-parse only changed files automatically on every push/merge via webhook.

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — system components and how they connect
- [`docs/TECH_STACK.md`](docs/TECH_STACK.md) — what's used where, and why
- [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) — database schema
- [`docs/PARSING_STRATEGY.md`](docs/PARSING_STRATEGY.md) — how parsing and call-resolution actually work, including known limitations
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — phased build plan
- [`docs/SECURITY.md`](docs/SECURITY.md) — cloning/parsing untrusted repos safely
- [`docs/RISKS.md`](docs/RISKS.md) — open questions, risks, and pre-code decisions to track
- [`docs/UI_GUIDE.md`](docs/UI_GUIDE.md) — UI/UX direction: theme, animation, landing page, canvas
- [`DEVELOPMENT.md`](DEVELOPMENT.md) — how to set up, run, and build the project phase by phase

## Repo layout (planned)

```
/                       → pnpm workspace root + Turborepo pipeline
/packages
  /shared               → Drizzle types + Zod schemas (api ↔ web)
/apps
  /web                  → Vite + React + React Flow canvas (Tailwind, TanStack Query, Zustand, Shiki)
  /api                  → TypeScript (Node/Fastify) — auth, repo management, serving graph data
/services
  /parser               → Go — clone, parse, resolve calls, write to Postgres
/docs         → this documentation
```

See `docs/TECH_STACK.md` ("Pre-bootstrap tech-stack lock-in") for the full, decided stack.

## Core stack at a glance

- **Frontend/canvas:** TypeScript, React, React Flow, Excalidraw (embedded)
- **App backend:** TypeScript (Node)
- **Parsing worker:** Go + tree-sitter
- **Database:** Postgres
- **Queue:** Redis (BullMQ) or equivalent, for the clone → parse → webhook re-parse pipeline
- **Auth:** GitHub OAuth

See `docs/TECH_STACK.md` for the reasoning behind each choice.
