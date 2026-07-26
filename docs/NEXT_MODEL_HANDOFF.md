# NEXT_MODEL_HANDOFF.md — one-shot project context

> **Read this first.** Dense, complete context for any new model taking over the funcatlas /
> CodeCanvas build. Point the next model at this file; it should drop in without re-explanation
> and burn minimal tokens getting up to speed. Keep it updated as the project moves.
> Sources of truth it summarizes: `CLAUDE.md`, `PLAN.md`, `DEVELOPMENT.md`, `PRD.md`, `TASKLIST.md`,
> and the `docs/` directory.

---

## 0. TL;DR

- **Project:** *funcatlas* (repo) / *CodeCanvas* (product name) — interactive visual map of a
  codebase. clone repo → tree-sitter parses functions + call sites → resolve calls → store graph in
  Postgres → explore on a React Flow canvas (file → card → function mind-map → code block).
  First language: **TypeScript**. 4-phase MVP.
- **Status:** Phase 0 (monorepo/skeleton/migration/CI) and Phase 1 (real tree-sitter extraction, resolver, isolation hardening, isolated Docker) are **DONE & runnable**.
- **Branch:** `main` (post-merge). **Default:** `main`.
- **Active doc:** `TASKLIST.md` — Phase 1 split into 15 chunks (C1…C14 + C4b). Tick as you go.
- **Owner of this build:** the human user **writes most of the code** (learning internals).
  Copilot's job = **debug, review, suggest better approaches, remove duplication, improve
  comments/naming, catch bugs, guide when stuck**. Copilot maintains `TASKLIST.md` checkboxes.

---

## 1. Locked stack — do NOT re-decide

- **Monorepo:** pnpm + Turborepo. Shared types in `packages/shared` (Drizzle + Zod).
- **Frontend:** Vite + React + TS, Tailwind + shadcn/ui, Framer Motion, React Flow, Shiki, cmdk,
  lucide-react, Zustand + TanStack Query.
- **API:** Fastify + Drizzle + postgres.js + Zod, arctic/oslo (GitHub OAuth), Redis sessions,
  @fastify/rate-limit.
- **Parser (Go):** `smacker` tree-sitter (actually `tree-sitter/go-tree-sitter` v0.25.0 +
  `tree-sitter/tree-sitter-typescript` v0.23.2 — see `go.mod`), **sqlx + pgx** (explicit SQL,
  NOT a full ORM), **zap**.
- **DB:** Postgres (edge tables + recursive CTEs; Neo4j deferred). Queue: Redis + BullMQ.
- **Migrations:** golang-migrate, SQL, single source at `services/parser/migrations/`, shared by
  Go writer + TS reader. Never edit a merged migration.
- **Tests:** Vitest + testify + testcontainers-go. CI: GitHub Actions. Infra: docker-compose.

## 2. Confirmed product decisions (locked, do not reopen)

- GitHub OAuth from day 1 (repo-read scope, refresh). Webhook + queue incremental updates IN MVP.
  Function-name search IN MVP. Excalidraw + LSP resolution = OUT of MVP.
- First language = TypeScript; no multi-language yet.
- Parser isolation (`--network none`, read-only, non-root, no symlinks, >1MB skip) **built in Phase
  1, not deferred**.
- ORM = Drizzle (API) + sqlx (parser). No GORM/Prisma.
- **Clone vs parse containers:** `parser-clone` (network enabled) → shared tmpfs → `parser-parse`
  (`network none`, read-only, non-root, no caps).
- **Query loading:** `queries/typescript.scm` is embedded at build time (via `//go:embed`) and compiled at runtime.
- **`.gitignore` respect:** DEFER post-MVP (skip-list already covers `node_modules`/`.git`/etc.).
- **Naming convention (TypeScript):**
  - top-level function `qualified_name` = bare name (`getUser`).
  - class method = `ClassName.method` (`Repo.sync`).
  - nested = dot-joined outer→inner (`getUser.inner`).
  - module-level call (no enclosing function) `CallerQualified` = `"<module>"`.
  - `package_path` = `filepath.Dir(rel)` relative to repo root; `""` for repo-root files.
- **Overload detection — future-proof (user-stated: "don't make problems later"):**
  - assign `overload_index` in a **per-file post-pass** after extraction + qualified-name walk.
  - group functions in a file by `qualified_name`, order by `start_line` ascending, assign
    `overload_index = 0..n-1`. Single-declaration `qualified_name`s get `0`.
  - Same-name *different-scope* (`sync` vs `Repo.sync`) already differ by `qualified_name` → each
    `0` (NOT overloads). Genuine TS overloads share `qualified_name` → get `0,1,2,…`.
  - Phase 2 resolver tags edges to overloaded `qualified_name`s **`unresolved`** (R8).
  - `overload_index` is part of DB `UNIQUE (file_id, qualified_name, overload_index)` → Phase 4's
    delete-then-reinsert incremental relink never collides; stable across re-parses (keyed by
    `start_line`). **This is why leaving `overload_index=0` always would break Phase 4 — don't.**
- **R3 benchmark repo:** defer to end of Phase 1 — use only `testdata/sample` until exit testing.

## 3. Repository layout (verified)

```
/                      pnpm workspace + Turborepo
/apps
  /api                 Fastify + Drizzle + postgres.js + arctic/oslo (skeleton: /healthz)
  /web                 Vite + React + React Flow + Tailwind (App shell only)
/packages
  /shared              Drizzle types + Zod (re-exports schema/types/validation)
  /eslint-config, /typescript-config
/services
  /parser              Go — tree-sitter + sqlx/pgx + zap
    /cmd/parser        main.go (wires clone.Prepare → ts.Extract → Phase 2 stub)
    /internal
      /clone           local-path + git clone --depth 1
      /db              Writer (pgx pool + sqlx); WriteGraph stub (Phase 2)
      /ir              Go-native IR: File/Function/CallSite/Import/Graph (R9 handled here)
      /resolver        Resolve() confidence consts; marks all unresolved (Phase 2 fill)
      /security        Config (env caps), ContainsRoot (symlink/.. guard), Walk (cap-enforcing)
      /ts              extract.go (init lang/parser + walk; queries NOT run yet)
    /migrations/0001_init.sql  full schema (overload-safe UNIQUE, CASCADE, indexes)
    /queries/typescript.scm    query patterns (@function.def/@call/@import.from);
                              C1 fixed: export_statement uses `source:` field, not `"from":` (invalid syntax)
    /testdata/sample/repo.ts  tiny sample
/docs                  ARCHITECTURE, DATA_MODEL, PARSING_STRATEGY, PHASE1_TASKS, RISKS,
                       ROADMAP, SECURITY, TECH_STACK, UI_GUIDE
/.github/workflows/ci.yml  node + go jobs; go job has Postgres service
PRD.md, TASKLIST.md, NEXT_MODEL_HANDOFF.md (this file)
```

## 4. Phase 0 & 1 — DONE facts (verified, not from task doc)

- `services/parser/cmd/parser/main.go` — wires `clone.Prepare → ts.Extract → (Phase 2 stub)`.
- `internal/ts/extract.go` — inits language+parser, walks files, reads `.ts/.tsx`, and runs queries.
- `internal/security/{path,config}.go` — `ContainsRoot`, `Walk` with size/count/depth caps, symlink hard-fail, and binary sniff.
- `internal/ir/ir.go` — Go-native types; **R9 handled in code** and `RISKS.md` updated.
- `migrations/0001_init.sql` — full schema with overload-safe UNIQUE, CASCADE, indexes,
  `parsed_commit`/`updated_at`. Correct as-is; Phase 2 just writes to it.
- `apps/api`, `apps/web` — skeletons only.
- `.github/workflows/ci.yml` (and node/go splits) — `node` + `go` jobs; `go` job already runs Postgres service, plus parser sample-run job + migration-check job.

## 5. The verified tree-sitter-go API (in `go.mod`)

- `tree_sitter.NewQuery(language *Language, source string) (*Query, *QueryError)` — **`*Language`**,
  returns `*QueryError` on failure.
- `(*Query).CaptureIndexForName(name string) (uint, bool)` — **`(uint, bool)`**; bool = "found".
  Use the bool, NOT a sentinel int.
- `(*Query).Close()`, `(*Query).CaptureNames() []string`, `(*Query).PatternCount() uint`.
- `tree_sitter.NewQueryCursor()` → `(*QueryCursor).Matches(query, node *Node, text []byte)
  QueryMatches` — this is what C2 will iterate to read captures.
- `bindings.LanguageTypescript()` / `bindings.LanguageTSX()` — BOTH exist; `.ts` →
  `LanguageTypescript`, `.tsx` → `LanguageTSX` (C1/C10 will need both).

## 6. Phase 1 chunks — current focus (from TASKLIST.md)

C1 runtime-load+compile the `.scm` (`//go:embed` + `NewQuery`; prove it compiles, expose capture
names for C2/C5/C6) → C2 populate `ir.Function` from `@function.def` → C3 arrow/function-expression
capture → C4 qualified-name scope walk → **C4b** overload `overload_index` per-file post-pass → C5
`ir.CallSite` with `CallerQualified` via parent walk → C6 `ir.Import` (default/named/namespace) →
C7 return `ir.Graph` + `main.go` JSON dump + `--format summary` → C8 harden `security.Walk`
(symlink hard-fail, binary sniff, `filepath.Rel` depth, cap sentinel) → C9 bounded read → C10
fixtures (nested/imports/calls/overloads/edge) → C11 golden `extract_test.go` → C12 hardened
Docker (clone+parse split) → C13 CI parser+sample+migration jobs → C14 docs sync.

See `TASKLIST.md` for each chunk's **Approach**, **Good when** (acceptance), **Watch outs** (bugs).

## 7. Conventions the new model must follow

- **Workflow:** user codes; Copilot reviews each chunk on: correctness vs IR/schema/contract →
  bugs (byte→line, off-by-one, nil, OS path separators, false captures) → style/duplication (e.g.
  reuse the C4 scope walk in both C2 `Function` and C5 `CallSite`) → tests (table-driven,
  one-concern fixtures, golden JSON without unstable fields like absolute paths) → nudge next chunk.
- **Commits:** imperative, one concern each (`add parser symlink hard-fail`), scoped to the chunk.
- **Don't delete Phase 2 wiring:** keep `db.NewWriter` referenced (Go refuses unused imports) like
  `config.go` does with `var _ = zap.NewProduction`.
- **Migrations:** never edit a merged migration; add a new numbered file.
- **Go IR is Go-native** (R9) — never try to import `packages/shared` into the parser.
- **Tests first mentality:** write the test with the chunk when "good when" is a test.

## 8. Open risks snapshot (from `docs/RISKS.md`)

- **Pre-Phase-0 (resolved in code, doc still stale):** R9 (Go IR native), R10 (single migration
  source). **C14 flips these OPEN → DECIDED in `RISKS.md`.**
- **Pre-Phase-1:** R16 pin tree-sitter grammar (pinned in `go.mod` — `tree-sitter-typescript`
  **v0.23.2**, `go-tree-sitter` **v0.25.0**; record in `RISKS.md` during C14).
- **Pre-Phase-2:** R6 (TS "package" = directory), R7 (`qualified_name` format — decided, see §2),
  R8 (overload edges → `unresolved` — decided, see §2).
- **Pre-Phase-3/4:** R2 (sessions), R4 (GitHub OAuth app), R5 (local webhook tooling), R11–R15,
  R17 (CI Docker), R18 (UI).
- **Deferred / not blocking:** R1 (product vs repo name — keep `funcatlas` repo, `CodeCanvas`
  product label), R3 (benchmark repo — end of Phase 1).

## 9. Build-run quick reference

```bash
cd services/parser && go test ./...                          # all Go tests
make go-run REPO=./services/parser/testdata/sample           # parse sample (needs C7)
docker compose up -d postgres redis                          # infra
migrate -path services/parser/migrations -database "$DATABASE_URL" up
pnpm install && pnpm -r lint && pnpm -r typecheck && pnpm -r build && pnpm -r test
```

## 10. Where to look if something is unclear

- `CLAUDE.md` — short load-bearing summary + locked stack.
- `PRD.md` — the product contract (FR-1…FR-10, NFR-1…NFR-6, success metrics, locked decisions).
- `PLAN.md` §3 — the 4-phase execution plan with per-phase files + verification.
- `TASKLIST.md` — the live chunk checklist you are executing.
- `docs/DATA_MODEL.md` — the Postgres schema + design notes.
- `docs/PARSING_STRATEGY.md` — tree-sitter rationale + resolution algorithm (qualified_name
  convention will be written here in C14).
- `docs/SECURITY.md` — isolation requirements (implemented controls get written here in C14).
- `docs/RISKS.md` — R1…R18 with DECIDED/OPEN/DEFERRED status (close stale ones in C14).
- `DEVELOPMENT.md` — daily dev loop (refresh Phase 1 commands in C14).

## 11. Update protocol

When you finish a chunk or close a risk, update **three places** in sync:
1. `TASKLIST.md` — tick `[ ]` → `[x]`.
2. `docs/RISKS.md` — flip OPEN → DECIDED with a one-line rationale (if applicable).
3. `NEXT_MODEL_HANDOFF.md` — update §4–§8 above so the next handoff is current.
