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

> **Corrected later.** What Phase 1 built was the isolation *harness* — the `parser` compose service
> and `make parser-isolated`. The product spawns the binary with `execFile` and never runs it inside
> that container, so the retrofit this paragraph set out to avoid is still owed. R38.

Delivered:

- `internal/clone` — local path, or `git clone --depth 1`; never runs the repo's install or build scripts.
- `internal/security` — env-driven caps, `ContainsRoot` path containment, and a `Walk` that hard-fails
  on symlinks, sniffs for binary content, and enforces file-count, per-file-size, and depth limits.
- `internal/ts` (now `internal/extract`) — tree-sitter TypeScript extraction: function declarations, methods, arrow and
  function expressions assigned to variables; call sites with their enclosing caller; imports.
- `internal/ts/scope.go` (now `internal/extract/scope.go`) — the dot-joined qualified-name walk (`Repo.sync`, `getUser.inner`).
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

## Phase 2 — Storage and resolution · done

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
traversal. — passed.

**Known carry-over into Phase 3** — auth is still a stub with a placeholder OAuth state, five graph
endpoints are still 501 and none are session-gated, and the web app is a shell. See `CLAUDE.md`.

---

## Phase 3 — API, auth, canvas and search · done

Split into two PRs: **3a** api and auth (curl-testable, no UI) — **done**; **3b** canvas and
search — **done**.

The first phase a human can actually use.

Builds: GitHub OAuth (authorize, callback, Redis-backed session, repo-read scope with refresh);
repo registration by URL; the graph endpoints behind that session gate; the React Flow canvas
following [`docs/UI_GUIDE.md`](docs/UI_GUIDE.md) — sidebar file tree → card → function mind-map →
Shiki code block, with edge style driven by resolution confidence; function-name search and a ⌘K palette.

**3a exit test — passed.** With a session cookie: log in, register
`https://github.com/ARCoder181105/funcatlas` (cloned and parsed in 2.2s, 41 files, commit recorded
from the checkout), walk tree to functions to a 3-hop traversal to source, and search by name. Every
one of the seven `/api` routes answers 401 without the cookie, and again after logout. All three
confidence tiers present in `edges` with non-zero counts.

**3b exit test — passed**, in real Chrome against `honojs/hono`: sign in, register (355 files, 1,460
functions, 5,906 edges — exact 1,106 / name_match 150 / unresolved 4,650), walk tree to card to
mind-map, read all three edge styles with unresolved ghosts at the boundary, open the source at the
right line numbers, and land on a function by name with ⌘K. `pnpm -r build`, `test` and `lint` clean.
The full run, with the six defects it surfaced, is recorded in [`TASKLIST.md`](TASKLIST.md) §B8.

**What running it changed.** The gate is worth more than the chunks it closes: across 3b it caught
edges that silently never rendered, three confidence tiers flattened into one dash pattern, a clone
that waited on credentials that could not arrive, a failure dialog printing the parser's stack trace,
a selection that did not survive a reload, and one card's change re-rendering every other card. None
of those were visible from reading the code.

**Known carry-over into Phase 4** — registration still parses inline (R27), `/auth/dev-login` still
exists (R30), a request touching a downed Redis still hangs (R31), and restored canvas state is not
re-validated against a re-parse (R34).

---

## Phase 4 — Webhooks, queue and hardening · done

Makes the graph self-updating and closes the security checklist.

Delivered:

- `files.content_hash` (migration 0003) — change detection that works on a `--depth 1` clone, which
  has no history for `git diff`, and on a local path, which has no remote at all.
- A scoped write: only the files whose *rows* changed are rewritten, and a file that merely calls a
  changed file keeps its function ids.
- BullMQ on its own Redis connection, a worker in its own process, and one job id per repository —
  which is what collapses a push storm (R13) and stops two parses of one repository racing (R12).
- `POST /api/repos` answers **202**; `repos.parse_status` (migration 0004) is how the client follows
  a parse it is no longer waiting on.
- `POST /webhooks/github`: HMAC over the raw bytes, replay protection by delivery id, per-hook
  throttle, outside the session gate because GitHub sends no cookie.
- Hardening: `/auth/dev-login` deleted (R30), Redis timeouts and a 503 instead of a hung request
  (R31), and the clone removed after every parse including the failures (R14's disk half).

**Exit test — amended, and this is the interesting part.** It read: *"pushing a commit updates the
graph without a full re-parse"*. That test could not be passed by the design the phase actually
needed, and the honest fix was to change the test rather than the claim.

`internal/resolver` builds six whole-repo maps, and two of its three passes need them: resolving
`./helpers` requires `helpers.ts` to be in the graph, and the repo-wide name pass is what decides
`name_match` versus ambiguous. Hand it only the changed files and cross-file calls degrade from
`exact` to `unresolved` — and, worse, a partial candidate set can emit a **confident** edge where
the whole repository would correctly say ambiguous. That is precisely the guess
[`PRD.md`](PRD.md#8-the-design-commitment) §8 forbids, so `PRD.md` FR-9's "re-parse only those" is
not implementable as written.

So the phase re-parses in full and scopes the **write**. It buys database churn and edge
correctness, not parse time.

**Exit test:** pushing a commit updates the graph **without rewriting unchanged rows** — the
function ids of untouched files survive; a replayed webhook is ignored; a webhook flood is
throttled; the parser still works with no network egress. — passed; see `TASKLIST.md` D8.

**Known carry-over into Phase 5** — R34: `store/ui.ts` restores a file and its open branches through
`zustand/persist`, and this is the first phase whose re-parse can delete the rows behind them.
Closed in Phase 5.

---

## Phase 5 — Go, Rust, Python, JavaScript and Java · done

Extraction only. Each language gets functions, call sites and imports in the IR, and same-file
resolution, which is language-agnostic. Cross-file calls resolve to `name_match` or `unresolved`,
never `exact`.

**Why the split.** Extraction is a grammar, a `.scm`, and a set of node kinds — cheap and testable.
Resolution is not, and it is the whole product. Go resolves through package clauses and
capitalisation-based export, Rust through `mod`/`use`/crate paths and `impl` blocks, Python through
`sys.path` and `__init__.py`, Java through the classpath and argument types. Sharing one resolver
across them would emit confident wrong edges,
which is worse than admitting ignorance — see [`PRD.md`](PRD.md#8-the-design-commitment). The
confidence tiers already carry that admission to the user honestly.

**Never resolve across a language boundary** (`docs/RISKS.md`), so a call in `main.go` can never
match a same-named function in `main.py`.

The precedent for taking this seriously: `.tsx` was parsed with the TypeScript grammar through all
of Phase 2. The failure was silent — the component's declaration still matched, so the file looked
parsed while three of four calls inside its JSX were dropped. One wrong grammar, most of a file's
edges gone, no error anywhere. Every language added multiplies that risk, which is why each one
needs its own fixture pinning *calls*, not just functions.

**Shipped:** `tree-sitter-javascript`, `-go`, `-rust`, `-python`, `-java`; one `.scm` per language;
per-language node-kind constants; `files.language` populated per file rather than hardcoded, so
`.tsx` now reports `tsx`; extraction fixtures per language. The UI badges a callee whose language
differs from the file being read.

JavaScript was added alongside the three, because the TypeScript spec already knew how to read it
and `.js`/`.jsx` were being skipped entirely. It joins TypeScript's resolution group, so a `.js`
file importing a `.ts` file still resolves `exact` -- the one cross-file case that survives.
Java was added because it is the first language here with genuine overloads, which is what
`overload_index` was always for.

**Exit test:** `testdata/polyglot` produces functions *and* call sites for every language, no edge
crosses a language boundary, and cross-file resolution is never `exact` outside the ECMAScript
family. A `.tsx`-style silent mismatch is impossible because every language's fixture pins the
calls inside its hardest construct -- and each of those turned out to be a real limit worth
recording rather than a hypothetical: Go's single-type-argument generic call, Rust's macro bodies,
Python's decorated definitions, Java's overloads.

---

## Cut from the MVP

Each of these was considered and deliberately deferred, not forgotten.

| Cut | Reason |
|---|---|
| LSP-based resolution | Accurate but slow to build and RPC-heavy on re-export chains. Name/scope resolution ships first, honestly tagged; LSP upgrades `name_match` to `exact` later. |
| Freehand annotation layer | Pure nice-to-have. Zero bearing on whether the core graph is trustworthy. |
| ~~Languages beyond TypeScript~~ | **Done in Phase 5** (extraction only). Full per-language resolution is still cut. |
| Neo4j | Recursive CTEs over an edge table handle this scale. Revisit when traversal is measurably the bottleneck. |
| Saved canvas layouts | Positions resetting on reload is a papercut, not a blocker. |
| Multi-tenancy and RBAC | Single-user MVP. Each repo is already an isolated workspace, so this stays cheap to add. |
