# Architecture

## High-level flow

```
GitHub repo URL
      │
      ▼
┌─────────────┐      ┌───────────────┐      ┌─────────────────┐
│ Clone Service│ ──▶ │ Parser Worker  │ ──▶ │ Graph Builder /   │
│ (isolated)   │      │ (Go+tree-sitter)│    │ Resolver          │
└─────────────┘      └───────────────┘      └─────────────────┘
                                                       │
                                                       ▼
                                              ┌──────────────┐
                                              │  Postgres    │
                                              │ (functions,  │
                                              │  edges, repos)│
                                              └──────────────┘
                                                       │
                                                       ▼
                                              ┌──────────────┐
                                              │  API (TS)    │
                                              └──────────────┘
                                                       │
                                                       ▼
                                              ┌──────────────┐
                                              │ Canvas (React│
                                              │ Flow + Excali│
                                              │ draw)        │
                                              └──────────────┘

GitHub Webhook (on push/merge)
      │
      ▼
Job Queue ──▶ diff changed files ──▶ re-parse only those ──▶ re-link affected edges
```

## Components

### 1. Clone Service
- Takes a GitHub URL, clones it into an isolated environment (container, at minimum — see `SECURITY.md`).
- Never runs the repo's own build/install scripts. Read-only file access is all that's needed for parsing.
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
- Auth (GitHub OAuth), repo registration, serving graph data to the frontend.
- Endpoints roughly: list repos → get file tree → get functions for a file → get edges for a function → get raw source for a function.
- Receives GitHub webhooks and pushes re-parse jobs onto the queue.

### 6. Canvas (TypeScript / React / React Flow)
- Sidebar file tree (like an IDE).
- Click a file → a card appears on the canvas.
- Click a card → mind-map of that file's functions branches out.
- Click a function → code block view, with links out to external packages/files if the call crosses a boundary.
- Multiple files/mind-maps can be open on the same canvas at once.
- Excalidraw layer embedded for freehand notes/annotations on top of the graph.

### 7. Job Queue
- Redis + BullMQ (or equivalent) sits between the webhook listener and the parser worker.
- On a push/merge: diff the changed files → enqueue only those for re-parsing → re-link only the edges touching those functions (not a full repo re-parse).

## Why this shape

- **Parsing is isolated from the app** so a slow or misbehaving parse job never blocks the API or canvas from working.
- **Graph metadata is separate from raw code text** so the queries that power the interactive canvas (traverse N hops, list a file's functions) stay cheap regardless of how large individual functions are.
- **Resolution confidence is a first-class field**, not an afterthought — the whole point of this tool is trustworthy call-graph data, so it should never claim more certainty than it has.
