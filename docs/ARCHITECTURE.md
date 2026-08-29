# Architecture

## High-level flow

```
GitHub repo URL
      │
      ▼
┌──────────────┐    ┌──────────────────┐    ┌──────────────────┐
│ Clone step   │──▶ │ Parser           │──▶ │ Resolver         │
│ (depth one,  │    │ (Go+tree-sitter, │    │ (name and scope  │
│  no scripts) │    │  read only)      │    │  matching)       │
└──────────────┘    └──────────────────┘    └──────────────────┘
                                                      │
                                                      ▼
                                             ┌──────────────────┐
                                             │ Postgres         │
                                             │ repos, files,    │
                                             │ functions, edges │
                                             └──────────────────┘
                                                      │
                                                      ▼
                                             ┌──────────────────┐
                                             │ API (Fastify)    │
                                             └──────────────────┘
                                                      │
                                                      ▼
                                             ┌──────────────────┐
                                             │ Canvas           │
                                             │ (React Flow)     │
                                             └──────────────────┘

GitHub webhook on push
      │
      ▼
Job queue ──▶ diff changed files ──▶ re-parse only those ──▶ relink affected edges
```

## Components

### 1. Clone Service
- Takes a GitHub URL (authenticated via the user's OAuth token, repo-read scope) or a local path, and clones/reads it into an isolated environment (container, at minimum — see `SECURITY.md`).
- Never runs the repo's own build/install scripts. Read-only file access is all that's needed for parsing.
- **Input hardening before parsing:** never follows symlinks, validates every path is inside the clone root, skips files >1MB / binary / under `node_modules`/`.git`, and caps total file count and depth (see `SECURITY.md` and `PARSING_STRATEGY.md`).
- Stores the last-synced commit SHA per repo so incremental updates know what changed.

### 2. Parser Worker (Go)
- Walks all files in the clone, runs tree-sitter queries per language to extract:
  - Function/method definitions (name, start/end line, full source block)
  - Call expressions (function name being called, arguments)
  - Import/using statements (needed for scope-aware resolution)
- Runs as a pool of workers (goroutines) — one file's parse doesn't block another's.
- Emits a structured intermediate representation (functions + raw call sites) to the Graph Builder.

### 3. Graph Builder / Resolver
- Takes raw call sites and resolves each one to a specific function definition.
- v1: name + scope/import matching within the same file → same package → repo-wide fallback.
- v2 (later): LSP-based resolution for exact accuracy on one language at a time.
- Every edge is written with a `resolution_confidence` (`exact` / `name_match` / `unresolved`) — never silently claim certainty you don't have.
- Writes functions + edges into Postgres.

### 4. Storage (Postgres)
- Holds repos, files, functions, edges — the graph metadata.
- Raw function source text stored separately from graph metadata (own table or blob store), so graph traversal queries stay fast and don't drag code text along.
- See `DATA_MODEL.md` for the actual schema.

### 5. API (TypeScript / Node)
- Auth (GitHub OAuth — authorize, callback, session, token scoped to repo-read with refresh), repo registration, serving graph data to the frontend.
- Endpoints: list repos → get file tree → get functions for a file → get edges for a function → get raw source for a function → **search functions by name** (across a repo).
- All graph-serving endpoints are session-gated; no anonymous access.
- Receives GitHub webhooks (HMAC-verified, replay-protected, per-repo throttled) and pushes re-parse jobs onto the queue.

### 6. Canvas (TypeScript / React / React Flow)
- Sidebar file tree (like an IDE).
- Click a file → a card appears on the canvas.
- Click a card → mind-map of that file's functions branches out.
- Click a function → code block view, with links out to external packages/files if the call crosses a boundary.
- Edges are visually distinguished by `resolution_confidence`: solid (`exact`), dashed (`name_match`), dotted (`unresolved`) — a guess is never shown as fact.
- A function-name **search box** lets users jump to any function across the repo (core to the product's value).
- Multiple files/mind-maps can be open on the same canvas at once.
- A freehand annotation layer is **deferred to post-MVP** (see `../PLAN.md`).

### 7. Job Queue
- Redis + BullMQ sits between the webhook listener and the parse worker.
- **The worker is a Node process that spawns the Go binary**, exactly as registration used to. The
  parser gains no Redis dependency and stays a CLI that takes a path and writes to Postgres — which
  is also what keeps `make go-run` and the container's `--network none` check working unchanged.
  Note what that does *not* say: the worker spawns the binary with `execFile`, so the container's
  constraints apply to `make parser-isolated` and not to the running product. R38.
  An earlier draft of this document said the worker "communicates only through the job queue and
  Postgres"; it does not, and reimplementing BullMQ's job protocol in Go to make that true would
  have bought nothing.
- On a push: re-extract and re-resolve the whole repository, then **write only the rows that
  changed**. Not "re-parse only the changed files" — resolution needs the whole repo's symbol table,
  and a partial one emits confident edges that the full repository would call ambiguous. See
  `RISKS.md` R35 and `PLAN.md` Phase 4.
- The write set is the files whose content hash moved, plus every file whose edges pointed into one
  of them — as the new graph sees it *and* as the database still does. Renames and deletions leave
  no orphans, and a file that merely calls a changed file keeps its function ids.
- One job id per repository is the concurrency cap and the throttle both: a duplicate add while a
  parse is waiting or active is ignored, so a push storm collapses into one job.

## Why this shape

- **Parsing is isolated from the app** so a slow or misbehaving parse job never blocks the API or canvas from working.
- **Graph metadata is separate from raw code text** so the queries that power the interactive canvas (traverse N hops, list a file's functions) stay cheap regardless of how large individual functions are.
- **Resolution confidence is a first-class field**, not an afterthought — the whole point of this tool is trustworthy call-graph data, so it should never claim more certainty than it has.
