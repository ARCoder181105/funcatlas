# Tech Stack

The project splits into two workloads with different needs, so the stack is split accordingly rather than forced into one language.

| Concern | Choice | Why |
|---|---|---|
| Frontend canvas | **TypeScript + React + React Flow** | React Flow is purpose-built for draggable/zoomable node-link canvases; TS catches mismatched IDs (function vs file vs edge) at compile time instead of at runtime inside a render. |
| Drawing/annotation layer | **Excalidraw** (embedded component) | Open source and embeddable — no reason to hand-build freehand drawing. |
| App backend / API | **TypeScript (Node)** | I/O-bound work (auth, DB queries, serving graph JSON) — Node handles this well, and staying in TS end-to-end on the app side means shared types between frontend and backend. |
| Parsing worker | **Go + tree-sitter** | Parsing thousands of files is CPU-bound. Node is single-threaded for CPU work and degrades under concurrent parsing load; Go has official tree-sitter bindings and native concurrency (goroutines) that scale across cores without extra ceremony. |
| Database | **Postgres** | The function/edge data is graph-shaped, but a dedicated graph DB (Neo4j) is unnecessary complexity for v1 — Postgres with edge tables and recursive CTEs is enough until query complexity or scale genuinely demands more. One DB also holds users/repos/auth, so there's no reason to run two datastores yet. |
| Job queue | **Redis + BullMQ** | Needed for the clone → parse → webhook-triggered re-parse pipeline; mature, simple to operate for a solo project. |
| Auth | **GitHub OAuth** | Needed for repo access anyway; reuse it for login instead of building separate auth. |

## Decisions explicitly made, and why alternatives were passed on

**TypeScript over plain JavaScript** — no real downside for this project; the data model has enough interlocking shapes (functions, edges, files) that type safety pays for itself quickly. Applies to both frontend and backend.

**Go over C++ for the parser** — tree-sitter's actual parsing core is already native C, so writing the orchestration layer in C++ doesn't make parsing itself faster; it only adds manual memory management, thread-pool boilerplate, and slower build/iteration cycles for a solo dev, without a real performance win over Go's goroutine-based concurrency.

**Go over Node for the parser specifically** — the parser's job (walk many files, build ASTs, run graph logic) is CPU-bound, which is Node's weak spot. Everything else in the app (API, DB access, auth) is I/O-bound, where Node/TS is fine — so only the parsing worker is pulled out into Go.

**Postgres over Neo4j for v1** — the graph queries needed (N-hop traversal, list functions in a file, list edges for a function) are answerable with edge tables + recursive CTEs at the scale a solo project will hit first. Revisit only if traversal queries become a real bottleneck.

**Name/scope-based resolution before LSP integration** — LSP-based call resolution is the accurate approach long-term, but it's slower to build and can multiply RPC calls badly on projects with heavy re-exports. Ship name/scope matching first (tagged with a confidence level), add LSP resolution per-language once the rest of the pipeline is proven.

## Repo/package layout

```
/apps
  /web        → React + React Flow + Excalidraw
  /api        → Node/TS — auth, repo mgmt, graph-serving endpoints, webhook receiver
/services
  /parser     → Go — clone handling, tree-sitter parsing, call resolution
/docs         → project documentation
```

The parser worker communicates with the rest of the system only through the job queue and Postgres — it doesn't need to share a language or a repo boundary with the TS app, which keeps the CPU-heavy piece isolated and independently scalable.
