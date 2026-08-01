# Execution Plan

The four phases that take funcatlas from an empty repo to a working MVP. This document owns the
*sequence*: what each phase builds, what it deliberately does not build, and the objective test
that closes it.

- **What** we're building and **why** → [`PRD.md`](PRD.md)
- **Which** technologies and why → [`docs/TECH_STACK.md`](docs/TECH_STACK.md)
- **How** to run the tooling day to day → [`DEVELOPMENT.md`](DEVELOPMENT.md)
- The **current** phase's task breakdown → [`TASKLIST.md`](TASKLIST.md)

A phase is finished when its exit test passes — not when its files exist.

---

## Phase 0 — Bootstrap · done

Scaffold the monorepo so no later phase has to stop and set up tooling.

Delivered: pnpm workspace + Turborepo pipeline; `packages/shared` with the Drizzle schema and Zod
schemas; `apps/api` Fastify skeleton with `/healthz`; `apps/web` Vite + React shell;
`services/parser` Go module with zap and a pgx/sqlx client; `docker-compose.yml` for Postgres and
Redis; `services/parser/migrations/0001_init.up.sql`; `.env.example`; split Go and Node CI workflows.

**Exit test:** `pnpm -r build` succeeds, `migrate … up` creates every table, `curl localhost:3000/healthz`
returns 200. — passed.

---

## Phase 1 — Parser core and isolation · done

Given a local repo path, emit a correct intermediate representation for TypeScript. No database,
no UI. Isolation is built here rather than deferred, because retrofitting a sandbox around a parser
that already assumes host filesystem access is far more expensive than building it in.

Delivered:

- `internal/clone` — local path, or `git clone --depth 1`; never runs the repo's install or build scripts.
- `internal/security` — env-driven caps, `ContainsRoot` path containment, and a `Walk` that hard-fails
  on symlinks, sniffs for binary content, and enforces file-count, per-file-size, and depth limits.
- `internal/ts` — tree-sitter TypeScript extraction: function declarations, methods, arrow and
  function expressions assigned to variables; call sites with their enclosing caller; imports.
- `internal/ts/scope.go` — the dot-joined qualified-name walk (`Repo.sync`, `getUser.inner`).
- `internal/ir` — Go-native `File` / `Function` / `CallSite` / `Import` / `Graph`.
- `queries/typescript.scm` — the query patterns, embedded at build time with `//go:embed`.
- `Dockerfile` — multi-stage, non-root; `docker-compose.yml` runs the parser with
  `network_mode: none`, `read_only: true`, and `cap_drop: ALL`.
- Golden fixtures under `testdata/` plus tests for extraction and the security walk.

**Exit test:** `make go-test` and `make go-vet` clean; `make go-run REPO=./services/parser/testdata/sample`
emits the expected functions, calls, and imports; the symlink-escape fixture is rejected. — passed.

**Known carry-over into Phase 2** — the IR is correct for inspection but not yet sufficient for
resolution. Call sites record no file, and method calls lose their receiver. Both are fixed as the
first chunk of Phase 2; see [`TASKLIST.md`](TASKLIST.md) C0.

---

## Phase 2 — Storage and resolution · in progress

Persist the IR to Postgres and turn raw call sites into confidence-tagged edges. Still no UI.

Builds:

- IR completion so resolution is possible at all (file attribution, call receivers, import aliases).
- A migration that lets an `unresolved` edge exist — the current `edges` table can only store an
  edge whose callee is already known, which makes two of the three confidence tiers unstorable.
- `internal/db/writer.go` — transactional, batched insert of files, functions, and edges.
- `internal/resolver` — same-file → imported symbol → package fallback → unresolved, each tagged.
- `apps/api/src/graph` — depth-bounded recursive CTE for N-hop traversal.
- Delete-and-reinsert re-parse scoped per file, so renames and deletions leave no orphan edges.

**Exit test:** parsing a fixture repo with a hand-known call graph produces the expected confidence
distribution; re-parsing after a rename leaves zero orphan edges; the API returns a correct 3-hop
traversal. Full criteria in [`TASKLIST.md`](TASKLIST.md).

---

## Phase 3 — API, auth, canvas and search · not started

The first phase a human can actually use.

Builds: GitHub OAuth (authorize, callback, Redis-backed session, repo-read scope with refresh);
repo registration by URL; the graph endpoints behind that session gate; the React Flow canvas
following [`docs/UI_GUIDE.md`](docs/UI_GUIDE.md) — sidebar file tree → card → function mind-map →
Shiki code block, with edge style driven by resolution confidence; function-name search and a ⌘K palette.

**Exit test:** a logged-in user explores a real repository end to end through the UI and finds a
function by name.

---

## Phase 4 — Webhooks, queue and hardening · not started

Makes the graph self-updating and closes the security checklist.

Builds: HMAC-verified, replay-windowed, per-repo-throttled GitHub webhook; BullMQ queue with a
max-concurrency cap; incremental re-parse that diffs changed files and relinks only affected edges;
every remaining item in [`docs/SECURITY.md`](docs/SECURITY.md) marked done.

**Exit test:** pushing a commit updates the graph without a full re-parse; a replayed webhook is
rejected; a webhook flood is throttled; the parser still works with no network egress.

---

## Cut from the MVP

Each of these was considered and deliberately deferred, not forgotten.

| Cut | Reason |
|---|---|
| LSP-based resolution | Accurate but slow to build and RPC-heavy on re-export chains. Name/scope resolution ships first, honestly tagged; LSP upgrades `name_match` to `exact` later. |
| Freehand annotation layer | Pure nice-to-have. Zero bearing on whether the core graph is trustworthy. |
| Languages beyond TypeScript | Depth before breadth. A second grammar multiplies the resolution edge cases before the first is proven. |
| Neo4j | Recursive CTEs over an edge table handle this scale. Revisit when traversal is measurably the bottleneck. |
| Saved canvas layouts | Positions resetting on reload is a papercut, not a blocker. |
| Multi-tenancy and RBAC | Single-user MVP. Each repo is already an isolated workspace, so this stays cheap to add. |
