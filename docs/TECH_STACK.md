# Tech Stack

The project splits into two workloads with different needs, so the stack is split accordingly rather than forced into one language.

| Concern | Choice | Why |
|---|---|---|
| Frontend canvas | **TypeScript + React + React Flow** | React Flow is purpose-built for draggable/zoomable node-link canvases; TS catches mismatched IDs (function vs file vs edge) at compile time instead of at runtime inside a render. |
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

**GitHub OAuth + webhooks are in the MVP, not deferred.** A production-grade service needs authenticated access (repo read via OAuth) and automatic updates (webhook → queue → incremental re-parse) from the start; a manual "re-parse" button and no-auth are not production-grade. The token is scoped to repo-read with refresh handling.

**Function-name search is in the MVP.** Finding a function by name across a large repo is core to the product's value ("codebases hard to hold in your head"), so a simple name-search endpoint + UI box ships with the canvas, not after.

**A migration tool is chosen up front: golang-migrate.** Schema lives in versioned plain-SQL migrations rather than ad-hoc `CREATE TABLE` scripts. Plain SQL specifically, because the schema has two consumers in two languages — the Go parser writes to it and the TypeScript API reads from it — and a migration format owned by either language's ORM would put the other one downstream of a translation. The single source is `services/parser/migrations/`.

**A freehand annotation layer (Excalidraw) was considered and cut.** It is embeddable and would have been cheap to add, but it has no bearing on whether the call graph is correct or trustworthy, which is the only thing that determines whether this product is worth using. Deferred until the core is proven — see `../PLAN.md`.

## Pre-bootstrap tech-stack lock-in

All of the following were decided up front (during planning, before any code) so that **no crucial
tech-stack choice is made during development** — each pick is justified by its specific use case.
The high-level table at the top of this doc covers the big architectural splits; this table covers
the granular decisions that were gaps (ORM, monorepo tooling, frameworks, validation, sessions, etc.).

| Area | Decision | Why (best use case) |
|---|---|---|
| Monorepo package manager | **pnpm** (workspaces) | Fast, strict, disk-efficient; native workspace protocol for `/apps` + `/services`. |
| Task orchestration | **Turborepo** | Cached `build`/`test`/`lint` across packages; fast CI for a multi-app repo. |
| Shared types package | **`packages/shared`** | One source for Drizzle types + Zod schemas consumed by both `apps/api` and `apps/web` — kills the function/file/edge ID-mismatch risk called out in `TECH_STACK.md`. |
| Frontend bundler | **Vite + React + TS** (SPA) | Canvas-heavy SPA needs no SSR; Vite is the fastest dev/build for React. |
| Frontend state | **Zustand** (UI) + **TanStack Query** (server) | Zustand for canvas UI state; TanStack Query for graph fetches, caching, invalidation on re-parse. |
| Styling | **Tailwind CSS** + **shadcn/ui** | Rapid, consistent modern UI; shadcn gives polished, accessible primitives to build on. |
| Animation | **Framer Motion** | Declarative, production-grade UI motion (page transitions, card spring-in, edge-draw). |
| Landing page | **React + Tailwind + Framer Motion** (same app, `/` route) | One app serves the marketing landing + the authenticated canvas; no separate deploy. |
| Canvas | **React Flow** | Draggable/zoomable node-link canvas for the graph explorer. |
| Code rendering | **Shiki** | VS Code-grade highlighting for the function code-block view. |
| Command palette | **cmdk** | ⌘K palette for function search / navigation (the "cool" power-user surface). |
| Icons | **lucide-react** | Consistent, lightweight icon set. |
| API framework | **Fastify** (Node/TS) | JSON-first, built-in schema validation, fast; lighter than NestJS for this scope. |
| API validation | **Zod** | Single schema source shared with frontend via `packages/shared`. |
| API ORM | **Drizzle** | Type-safe but stays close to raw SQL, so recursive N-hop CTEs and `qualified_name` index lookups remain explicit; emits TS types. |
| API DB driver | **postgres.js** (under Drizzle) | Fast, ergonomic Postgres driver. |
| Auth (OAuth) | **arctic** + **oslo** | Minimal, modern GitHub OAuth + session primitives; token scoped to repo-read. |
| Sessions | **Redis-backed** (reuse Redis) | Safer than stateless JWT for production; single datastore already present. |
| API rate limit | **@fastify/rate-limit** | Protects graph endpoints. |
| Parser tree-sitter | **tree-sitter/go-tree-sitter** v0.25.0 + **tree-sitter/tree-sitter-typescript** v0.23.2 | Official Go bindings and the first-language grammar. Both versions pinned in `go.mod` — a grammar bump can silently change node kinds. |
| Parser DB access | **sqlx** + **pgx** (`jackc/pgx/v5`) | Explicit SQL + high-performance pool for bulk function/edge writes. |
| Migrations | **golang-migrate** (SQL) | Language-agnostic; same migrated schema used by Go writer and TS reader. |
| Logging | **pino** (Node) + **zap** (Go) | Structured logs; cheap in hot paths. |
| Testing | **Vitest** (TS) + **testify** (Go); **testcontainers-go** for DB integration | Aligns with Vite; real Postgres in tests. |
| Lint/format | **ESLint + Prettier** (TS) + **golangci-lint** (Go) | Standard, fast. |
| CI | **GitHub Actions** | Lint/test/build + migration check on PR. |
| Local infra | **docker-compose** | Reproducible postgres + redis + api + web + parser. |
| Secrets | **`.env` + `.env.example`** (dotenv) for MVP | Real secrets never committed; vault deferred. |

## Repo/package layout

```
/                       → pnpm workspace root + Turborepo pipeline
/packages
  /shared               → Drizzle types + Zod schemas (api ↔ web)
/apps
  /web                  → Vite + React + React Flow + Tailwind + TanStack Query + Zustand + Shiki
  /api                  → Node/TS (Fastify + Drizzle + postgres.js + arctic/oslo) — auth, repo mgmt, graph endpoints, webhook receiver
/services
  /parser               → Go (go-tree-sitter + tree-sitter-typescript, sqlx + pgx, zap) — clone, parse, resolve, write to Postgres
/docs                   → project documentation
```

The parser worker communicates with the rest of the system only through the job queue and Postgres — it doesn't need to share a language or a repo boundary with the TS app, which keeps the CPU-heavy piece isolated and independently scalable.

## UI direction

The frontend libraries are locked in the table above — Tailwind, shadcn/ui, Framer Motion, React
Flow, Shiki, cmdk, lucide. What to build with them is decided in [`UI_GUIDE.md`](UI_GUIDE.md), which
owns the theme, motion principles, and surface designs.
