# Plan: CodeCanvas / funcatlas — Refinement, Definition of Done & 4-Phase MVP Roadmap

> Note: Workspace currently contains ONLY `docs/` + `LICENSE`. No code, no `go.mod`,
> no `package.json`, no `docker-compose.yml`, no `.gitignore`, no CI, no migrations.
> Repo is named `funcatlas` but README calls the product `CodeCanvas` — naming inconsistency.

---

## 0. Pre-Bootstrap Tech-Stack Lock-In (decide everything before code)

The goal is that **no crucial tech-stack decision is made during development** — every choice is
locked in now, matched to its best use case. Full justification lives in `docs/TECH_STACK.md`
("Pre-bootstrap tech-stack lock-in"). Summary of the decisions that were open gaps:

- **Monorepo:** pnpm workspaces + Turborepo (cached build/test/lint across `/apps` + `/services`).
- **Shared types:** `packages/shared` — Drizzle types + Zod schemas consumed by both `apps/api` and `apps/web` (kills the function/file/edge ID-mismatch risk).
- **Frontend:** Vite + React + TS; Zustand (UI) + TanStack Query (server); Tailwind CSS; Shiki (code highlighting); React Flow (canvas).
- **API:** Fastify + Drizzle ORM + postgres.js driver + Zod validation; arctic/oslo for GitHub OAuth; Redis-backed sessions; @fastify/rate-limit.
- **Parser (Go):** smacker/tree-sitter-go + tree-sitter-typescript grammar; **sqlx + pgx** (NOT a full ORM — explicit SQL for bulk writes/resolution); zap logging.
- **Migrations:** golang-migrate (SQL, language-agnostic — same schema for Go writer + TS reader).
- **Testing:** Vitest (TS) + testify (Go) + testcontainers-go (real Postgres in tests).
- **CI / local:** GitHub Actions; docker-compose for postgres + redis + api + web + parser.
- **Secrets:** `.env` + `.env.example` (dotenv) for MVP; vault deferred.

**ORM decision (explicit):** API uses **Drizzle** (type-safe, stays close to raw SQL so recursive
N-hop CTEs and `qualified_name` index lookups stay explicit). The Go parser uses **sqlx**, not an
ORM — its bulk insert + resolution-by-`qualified_name` logic is hand-written SQL. No GORM/Prisma.

**Phase 0 — Bootstrap (do this before Phase 1):**
- **Goal:** Scaffold the monorepo so every later phase has its tooling ready; nothing feature-bearing yet.
- **Files to create:**
  - `pnpm-workspace.yaml`, `package.json` (root, Turborepo pipeline), `turbo.json`
  - `packages/shared/` (Drizzle schema mirror + Zod schemas; empty stubs for now)
  - `apps/web/` (`package.json`, Vite + React + TS config, Tailwind, placeholder `src/`)
  - `apps/api/` (`package.json`, Fastify bootstrap, Drizzle client, health endpoint)
  - `services/parser/` (`go.mod`, main entry, zap logger, sqlx/pgx client)
  - `docker-compose.yml` (postgres + redis; api/web/parser stubs)
  - `golang-migrate` migration `0001_init.sql` (the `DATA_MODEL.md` schema, with overload + cascade + index fixes)
  - `.env.example`, `.gitignore`, `.github/workflows/ci.yml` (lint/test/build + migration check)
- **OpenRouter models:**
  - `anthropic/claude-3.5-sonnet` — scaffold/repo-structure review (monorepo correctness).
  - `deepseek/deepseek-chat` — boilerplate generation for pnpm/Turborepo/Vite/Fastify configs.
- **Testing (VS Code terminal):**
  - `pnpm install && pnpm -r build` → all packages build.
  - `pnpm -r test` → placeholder tests pass.
  - `docker compose up -d postgres redis && migrate -path migrations -database "$URL" up` → tables created; `psql` verifies schema.
  - `curl localhost:3000/healthz` (api) returns 200.

---

## 1. Project Refinement & Gaps

### 1.1 Naming / identity
- Repo = `funcatlas`; README product name = `CodeCanvas`. Pick one before any public surface (URLs, OAuth app name, Docker image tags). Recommend keeping `funcatlas` as the repo and treating `CodeCanvas` as the marketing name, OR rename repo to match.

### 1.2 Scope — what's IN vs CUT for the production MVP
The current 6-phase roadmap (ROADMAP.md) collapses to a 4-phase production MVP. Since the goal is production-grade, **GitHub OAuth and webhook-driven incremental updates are IN scope** (a manual button / no-auth is not production-grade). Cut:
- **Excalidraw drawing layer (Phase 5)** — pure nice-to-have; defer post-MVP.
- **LSP-based resolution (Phase 6)** — already deferred; keep out of MVP.
- **Multi-user / tenant isolation** — single-user for MVP, but design the parser + storage so each repo is its own isolated workspace (cheap to add later).
- **Cross-language** — go deep on ONE language first (TypeScript; mature grammar, matches app stack).

MVP = old Phases 1–4 + OAuth (pulled into Phase 3) + search (Phase 3), single language, public repos via OAuth, automatic webhook refresh.

### 1.3 Security flaws / missing controls in current docs
SECURITY.md is aspirational (a checklist, not implemented). Concrete gaps:
- **Symlink / path-traversal attack**: a malicious repo can contain symlinks pointing outside the clone dir (e.g. `../../etc/passwd`) or file paths with `../`. Tree-sitter would read host files. Must: never follow symlinks, resolve and validate every path is inside the clone root before parsing/serving.
- **Repo/clone bombs**: no file-count, file-size, or depth limits. A 100k-file repo or a 50MB minified JS file can OOM the parser. Must cap: max files, max bytes/file (skip >1MB), skip binary/non-text, respect `.gitignore`, skip `node_modules`/`.git`/build dirs.
- **Webhook DoS / replay**: HMAC verification alone is insufficient. Need timestamp/replay protection, per-repo job throttling, and a max-concurrent-parse cap so a flood of webhooks can't exhaust resources. (Deferred with webhooks, but design the queue for it now.)
- **API authz**: graph-serving endpoints must be authenticated/authorized; otherwise anyone can fetch any repo's graph. Even single-user, put a session gate in front.
- **Secrets handling**: OAuth secret + webhook secret storage unspecified. Use env vars + `.env.example`; never commit. Add a secrets checklist.
- **No network egress block implemented**: doc says "no network from parse step" but nothing enforces it (container `--network none` / seccomp). Must be a hard runtime constraint, not a note.
- **SQL injection / CTE safety**: recursive N-hop CTE must be depth-bounded and parameterized; state this explicitly.

### 1.4 Data-model / correctness edge cases
- **`UNIQUE (file_id, qualified_name)` breaks on overloading**: two same-named functions in one file (overloads, or a function + nested closure) will cause a unique-violation INSERT failure. Either relax to allow duplicates with a disambiguator, or detect and suffix. Document the chosen behavior.
- **Stale data on re-parse**: schema has no `ON DELETE CASCADE` and no `updated_at`. Renamed/deleted functions leave orphaned rows + dangling edges. Need a re-link strategy: mark-by-commit, delete-then-reinsert per file, or soft-delete with reconciliation.
- **Missing indexes for resolution**: resolution looks up by `package_path`+`name`; add `UNIQUE`/index on `qualified_name` (or `(package_path, name)`) to make resolution O(log n) not a scan.
- **No `updated_at`/`parsed_commit` on functions/edges** — needed for incremental diffing later.
- **`source_blob_ref`** is fine as a TEXT column for MVP; don't prematurely build S3.

### 1.5 Product gaps (not in docs)
- **No search** ("find function by name across repo") — arguably the #1 value for "codebases hard to hold in head." Add a simple name search in MVP or immediately after.
- **Canvas scale**: React Flow chokes on thousands of nodes. Need clustering/virtualization or "expand on click" (which the design already implies — good). State a node-count target.
- **Layout persistence**: canvas card positions reset on reload. Acceptable for MVP but note it.
- **No defined target scale**: "real repo" is undefined. Pick a benchmark repo (e.g. a 200–500 file TS project) for all testing.

---

## 2. Definition of Done (MVP)

### 2.1 Core feature checklist (all must pass)
- [ ] Submit a public GitHub URL **or** a local path; repo clones/reads into isolated parser.
- [ ] Parser extracts functions + call sites for the target language with comments/strings/nested funcs handled.
- [ ] Resolver links calls with `exact` / `name_match` / `unresolved` confidence; UI visually distinguishes them (solid / dashed / dotted).
- [ ] Graph persisted in Postgres; schema migrated via a tool (golang-migrate or Flyway).
- [ ] Canvas: sidebar file tree → click file → card → click card → function mind-map → click function → code block, with cross-file links.
- [ ] Manual "Re-parse" re-ingests the repo and updates the graph correctly (no orphan edges).
- [ ] Security gates: isolated container, `--network none`, read-only mount, no symlink follow, file/size caps, session-gated API.

### 2.2 Performance benchmarks (MVP targets)
- Parse: a 300-file TS repo fully parsed + resolved in **< 90s** on a modest CI runner.
- API: `GET functions for file` p95 **< 150ms**; N-hop (depth 5) traversal on 10k edges **< 500ms**.
- Canvas: smooth pan/zoom with **≤ 2,000 visible nodes** at ~60fps; larger graphs use expand-on-click.
- Parser memory: hard cap per-file at **1MB** (skip larger), total job memory bounded.

### 2.3 Deployment criteria
- Single `docker compose up` brings up: postgres, redis, api, web, parser — reproducible locally.
- Parser container runs with: isolated user, read-only clone mount, `--network none`, no capabilities.
- All secrets via env (`.env.example` committed, real values never committed).
- Health endpoints (`/healthz`) for api + parser; basic logging.
- README documents how to run, parse a sample repo, and the manual re-parse flow.

---

## 3. Execution Roadmap (4 Phases)

### Phase 1 — Parser Core + Isolation (Go + tree-sitter)
- **Goal**: Given a local repo path, extract functions + call sites + imports to structured JSON for ONE language. No DB, no UI. **Build production isolation in now** (not deferred): symlink/path containment, file/size/depth caps, read-only clone mount, no network egress.
- **Files to create** (in workspace):
  - `services/parser/go.mod`, `services/parser/main.go` (uses **sqlx + pgx**, zap logger from Phase 0)
  - `services/parser/internal/clone/` (local-path + git clone, symlink/path guard)
  - `services/parser/internal/ts/` (tree-sitter init, grammar vendoring)
  - `services/parser/queries/typescript.scm` (function def + call + import queries)
  - `services/parser/internal/ir/` (Function, CallSite, Import types + JSON emit)
  - `services/parser/testdata/` (a small sample TS repo)
  - `services/parser/internal/security/` (path containment + size/count caps)
  - `services/parser/Dockerfile` (non-root, `--network none`, read-only mount, dropped caps) — built in Phase 1, not later
  - `services/parser/internal/db/` (sqlx/pgx client; writes IR to Postgres via golang-migrate schema)
- **OpenRouter models**:
  - `deepseek/deepseek-r1` — for the parsing/resolution algorithm design & tricky tree-sitter query logic.
  - `qwen/qwen2.5-coder-32b-instruct` — fast, cheap code generation for boilerplate/Go structs.
  - `anthropic/claude-3.5-sonnet` — code review of the parser for correctness.
- **Testing (VS Code terminal)**:
  - `cd services/parser && go test ./...`
  - `go run . --repo ./testdata/sample` → inspect `out.json` for correct defs/calls (comments & strings excluded, nested funcs captured).
  - Negative test: a repo with a symlink to `/etc/hostname` must NOT be read.

### Phase 2 — Storage + Resolution
- **Goal**: Persist IR to Postgres (migrations) and build the name/scope resolver with confidence tags.
- **Files to create/modify**:
  - `services/parser/migrations/0001_init.sql` (schema from DATA_MODEL.md + added indexes + `updated_at`/`parsed_commit` + relaxed overload handling) — already created in Phase 0
  - `services/parser/internal/resolver/` (same-file → import → package fallback → unresolved; uses sqlx lookups by `qualified_name`)
  - `apps/api/db/` (Drizzle client over postgres.js; golang-migrate runs the same `0001_init.sql`)
  - `apps/api/internal/graph/` (read functions + edges via Drizzle; recursive N-hop CTE depth-bounded)
  - `packages/shared/` (Drizzle types + Zod schemas now populated; imported by api + web)
  - `docker-compose.yml` (postgres + redis + api + parser + web stubs)
- **OpenRouter models**:
  - `deepseek/deepseek-r1` — resolver disambiguation logic.
  - `anthropic/claude-3.5-sonnet` — schema/migration review & SQL (recursive CTE) correctness.
- **Testing**:
  - `docker compose up -d postgres` then run migration; `psql` to verify tables/indexes.
  - Point parser at a repo with a KNOWN call graph; assert edge confidence distribution matches manual expectation (spot-check 20 edges).
  - Re-parse test: rename a function, confirm old edges are removed/relinked (no orphans).

### Phase 3 — API + Auth + Canvas + Search
- **Goal**: End-to-end exploration UI (file tree → card → mind-map → code block) over the stored graph, behind GitHub OAuth, with function-name search.
- **Files to create/modify**:
  - `apps/api/internal/server/` (GitHub OAuth login + token store, repo register via URL, graph endpoints: list repos, file tree, functions-for-file, edges-for-function, raw source, search-by-name)
  - `apps/api/internal/auth/` (GitHub OAuth: authorize, callback, session, token scoped to repo-read, refresh)
  - `apps/web/package.json`, `apps/web/src/` (React + React Flow canvas, sidebar, card, mind-map, code view, confidence-styled edges, search box, ⌘K command palette, animated landing page on `/`)
  - `apps/web/src/styles/` (Tailwind config + design tokens: dark-mode-first, signature accent)
  - `apps/web/src/types/` (shared TS types mirroring DB/IR)
  - UI follows `docs/UI_GUIDE.md` (Tailwind + shadcn/ui + Framer Motion + Shiki + cmdk + lucide-reacts: dark-mode-first, signature accent)
  - `apps/web/src/types/` (shared TS types mirroring DB/IR)
  - UI follows `docs/UI_GUIDE.md` (Tailwind + shadcn/ui + Framer Motion + Shiki + cmdk + lucide-react)
- **OpenRouter models**:
  - `anthropic/claude-3.7-sonnet` (or `claude-3.5-sonnet`) — React Flow UI, component structure, UX.
  - `deepseek/deepseek-chat` — API endpoint/CRUD + OAuth logic.
  - `google/gemini-2.5-pro` — optional for integrating shared TS types across api/web.
- **Testing**:
  - `docker compose up` then log in via GitHub OAuth; click through a real repo end-to-end.
  - `curl` each API endpoint (with session); assert JSON shape + edge styling + search returns expected functions.
  - `npm run build` + `npm run lint` + `npm test` in `apps/web`.

### Phase 4 — Webhooks + Queue + Hardening (production gate)
- **Goal**: Automatic incremental updates via GitHub webhook + BullMQ, plus full SECURITY.md compliance.
- **Files to create/modify**:
  - `apps/api/internal/webhook/` (HMAC verify + replay window + per-repo throttle)
  - `apps/api/internal/queue/` (BullMQ producer/consumer for re-parse; max-concurrent cap)
  - `services/parser/internal/relink/` (incremental re-parse: diff changed files → re-parse → re-link only affected edges; handle renames/deletes → no orphans)
  - `.env.example`, `SECURITY.md` (mark checklist items done), `docker-compose.yml` (final: postgres, redis, api, web, parser)
- **OpenRouter models**:
  - `deepseek/deepseek-r1` — queue/re-link orchestration logic.
  - `anthropic/claude-3.5-sonnet` — security review of isolation + webhook handling.
- **Testing**:
  - `docker run --network none --read-only <parser-image>` → parse still works (no egress).
  - Clone a repo with symlink escape + oversized file → both safely skipped.
  - Push a commit to a registered repo → graph updates without full re-parse; replayed/out-of-window webhook rejected; rapid webhook flood throttled.

---

## 4. Decisions / Assumptions (CONFIRMED — production-level)
- **First language = TypeScript** (mature grammar, matches app stack).
- **Auth = GitHub OAuth from day 1** (user wants production-grade; repo access needs it anyway; token scoped to repo-read, refresh handled).
- **Refresh = GitHub webhook + queue in MVP** (production needs automatic updates; manual button is not production-grade). HMAC verify + replay window + per-repo throttle required.
- **Search = IN MVP** (function-name search across repo — high value, low cost).
- **Excalidraw + LSP resolution = explicitly out of MVP** (post-MVP).
- **Benchmark repo = a ~300-file public TS project** for all testing.
- Production-grade means: isolated parser container (`--network none`, read-only, non-root, no symlink follow, file/size caps) is built in Phase 1, not deferred.

## 5. Further Considerations
1. Add a simple function-name **search** — high value, low cost; already pulled into MVP (Phase 3).
2. Add **layout persistence** (card positions) only if users complain; skip for MVP.
3. **Migration tool is decided:** golang-migrate (SQL), used by both the Go parser and the TS API — no schema drift. ORM is decided too: Drizzle (API) + sqlx (parser), no full ORM on the Go side.

## 6. Risks & Open Questions (tracked in `docs/RISKS.md`)
Pre-code risks and open decisions are tracked in `docs/RISKS.md` (R1–R17), each marked DECIDED / OPEN / DEFERRED. Key OPEN items to resolve before coding:
- **R1** product vs repo name · **R2** session strategy (Redis vs JWT) · **R3** benchmark repo · **R4/R5** GitHub OAuth app + local webhook tooling · **R6–R10** TS "package" definition, `qualified_name` format, overload-edge rule, Go IR types, single migration source · **R11–R17** dev/prod modes, parse lock, webhook debounce, repo cleanup, canvas virtualization, grammar pinning, CI Docker.
