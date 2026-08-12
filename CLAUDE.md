# CLAUDE.md — funcatlas

Context for AI assistants working in this repo. This is the load-bearing summary; the full product
contract is in `PRD.md` and the phase plan is in `PLAN.md`.

## What this is

An interactive visual map of a codebase. Clone a repo → tree-sitter extracts functions and call
sites → resolve calls to definitions → store the graph in Postgres → explore it on a React Flow
canvas (file → card → function mind-map → code block). Language: **TypeScript** through Phase 4;
Go, Rust and Python are added in Phase 5, extraction only.

The product is called **funcatlas** everywhere — repo, module path, npm scope, database, cookie.
The old working name "CodeCanvas" is retired; do not reintroduce it.

## Status

- [x] Phase 0 — Bootstrap
- [x] Phase 1 — Parser and isolation
- [x] Phase 2 — Storage and resolution
- [ ] Phase 3 — API, auth, canvas, search ← next, split 3a (api/auth) and 3b (canvas/search)
- [ ] Phase 4 — Webhooks, queue, hardening
- [ ] Phase 5 — Go, Rust, Python (extraction only; per-language resolution stays cut)

Active task list: `TASKLIST.md`.

## How to work here

**These are standing instructions from the user. They persist across sessions — do not drift off
them, and do not revert to an earlier arrangement.**

You implement, phase by phase, with tests. The user reviews at each phase gate.

- **One PR per phase**, on a `phase-N/<name>` branch. Push at the phase gate, never mid-phase, never
  to `main`. Commit one concern at a time with an imperative subject.
- **Never put a `Co-Authored-By` trailer in a commit message.** No tool-attribution trailers or
  "generated with" footers anywhere, including PR bodies.
- **Stop at every phase gate.** Run the phase's exit test from `PLAN.md`, mark the PR ready, and wait
  for the user before opening the next branch.
- **A test ships in the same commit as the code it tests.** Keep `TASKLIST.md` checkboxes current.
- **Ask when a choice changes the product**, not for routine judgment calls.

### Code style the user has asked for

- **Comments are brief and to the point.** One line where one line does. Long comments invite
  confusion and go stale. Explain *why*, never restate *what* the code plainly says.
- **Never duplicate code.** The second occurrence of anything gets extracted into a shared helper in
  that same commit, not later.
- **Shared helpers live in a `utils` package, one file per concern**, plus a single `constants.go`
  holding every shared literal. No magic strings or numbers inline.

### Where shared code goes

| Concern | Home |
|---|---|
| All parser constants — confidence tiers, node kinds, import kinds, limits | `services/parser/internal/utils/constants.go` |
| Tree-sitter node traversal | `services/parser/internal/utils/nodes.go` |
| Repo-relative paths, module specifier resolution | `services/parser/internal/utils/paths.go` |
| Qualified-name building and scope candidates | `services/parser/internal/utils/qualnames.go` |
| Generic slice helpers, chunking | `services/parser/internal/utils/slices.go` |
| SQL helpers: chunked multi-row `INSERT`, pgx scanning | `services/parser/internal/db/sqlutil.go` |
| Test Postgres connect / skip / truncate | `services/parser/internal/db/dbtest/` |
| Types and Zod schemas used by both api and web | `packages/shared/src/` |
| Shared TypeScript constants | `packages/shared/src/constants.ts` |
| Session verification for gated routes | `apps/api/src/auth/session.ts` |
| Graph SQL, including the recursive CTE | `apps/api/src/graph/queries.ts` |
| Browser API calls | `apps/web/src/lib/api.ts` — extend `request<T>`, never bare `fetch` |

`internal/utils` imports only `internal/ir` and stdlib, so any package can use it without a cycle.

## Locked stack — do not re-decide without an explicit reason

- **Monorepo:** pnpm + Turborepo. Shared TypeScript types only in `packages/shared` (Drizzle + Zod).
- **Frontend:** Vite + React + TS, Tailwind + shadcn/ui, Framer Motion, React Flow, Shiki, cmdk,
  lucide-react, Zustand + TanStack Query.
- **API:** Fastify + Drizzle + postgres.js + Zod, arctic/oslo for GitHub OAuth, Redis sessions,
  `@fastify/rate-limit`.
- **Parser:** Go + `tree-sitter/go-tree-sitter` v0.25.0 + `tree-sitter/tree-sitter-typescript`
  v0.23.2 (both pinned in `go.mod`), pgx with explicit SQL, zap.
- **Database:** Postgres — edge tables and recursive CTEs. Neo4j deferred indefinitely.
- **Queue:** Redis + BullMQ.
- **Migrations:** golang-migrate, plain SQL, single source at `services/parser/migrations/`, read by
  both the Go writer and the TypeScript reader. Never edit an applied migration.
- **Tests:** Vitest, testify. Integration tests use `TEST_DATABASE_URL` (falling back to
  `DATABASE_URL`) and skip when unset; CI supplies a Postgres service container. No testcontainers.
  CI: GitHub Actions. Local infra: docker-compose.

No GORM. No Prisma. No full ORM on the Go side.

## Locked product decisions

GitHub OAuth from day one. Webhook-driven incremental updates in the MVP. Function-name search in
the MVP. Excalidraw annotation and LSP resolution are out. Parser isolation was built in Phase 1,
not deferred: `--network none`, read-only rootfs, non-root, no capabilities, symlinks hard-fail,
files over 1 MB skipped.

## Conventions that bite if ignored

- **`qualified_name`** is dot-joined and scope-aware: top-level `getUser`, method `Repo.sync`,
  nested `getUser.inner`, anonymous `<anonymous>`. A module-level call's caller is `<module>`.
- **`package_path`** is the file's directory relative to the repo root; `""` for root files.
- **`overload_index`** is assigned in a per-file post-pass: group by `qualified_name`, sort by
  `start_line`, assign `0..n-1`. It is part of the uniqueness key
  `(file_id, qualified_name, overload_index)`, which is what makes Phase 4's delete-and-reinsert
  relink collision-free. Do not shortcut it to always-zero.
- **TypeScript overload *signatures*** parse as `function_signature`, not `function_declaration`, so
  they are not captured as functions — correctly, since a signature has no body and cannot call
  anything. The overload post-pass exists for genuine duplicate qualified names, such as a function
  redeclared in two branches of a conditional.
- **The Go parser cannot import `packages/shared`.** It keeps Go-native IR types in
  `internal/ir/ir.go` that mirror the schema by hand. This duplication is deliberate.
- **`resolution_confidence`** ∈ `exact` / `name_match` / `unresolved`, rendered as solid / dashed /
  dotted. Ambiguity resolves to `unresolved`, never to a guess. This is the product's core promise —
  see `PRD.md` §8.
- **One grammar per extension, never shared.** `.ts` uses `LanguageTypescript()`, `.tsx` uses
  `LanguageTSX()`. A mismatched grammar fails *silently*: the body becomes an `ERROR` node, the
  declaration still matches, and every call inside is dropped. Any new language needs a fixture that
  pins the **calls** inside its hardest construct, not just the function names.

## Known gaps carried into Phase 3

The five Phase 2 gaps are all closed. What Phase 3 inherits:

- **Auth is a stub.** `/auth/callback` and `/auth/logout` return 501, and `createAuthorizationURL`
  uses a literal `"state-placeholder"` — a CSRF hole that must be real random state before login
  ships. The GitHub OAuth app itself does not exist yet (R4).
- **Five graph endpoints are still 501.** Only `/api/functions/:fnId/edges` is real, and it is
  ungated — nothing checks a session yet.
- **The web app is a 114-line shell.** Canvas, FunctionCard and CodeBlock are placeholders.
- **`pnpm start` cannot run the API.** `packages/shared` exports point at `./src/*.ts`, so plain
  `node dist/index.js` cannot follow them. `pnpm dev` (tsx) works. Fix before containerising.
- **Compiled test files land in `apps/api/dist`.** Harmless locally, wrong in an image.
- **Resolution limits that are honest, not broken:** barrel re-export chains, default imports, and
  `tsconfig` path aliases all resolve to `unresolved`. See `docs/PARSING_STRATEGY.md`.

## Verify state before trusting this file

Run these instead of reading source to find out where things stand. Commands can't go stale the way
prose can — if one contradicts this document, the command is right and this document needs fixing.

```bash
make up && make migrate                               # infra + schema
cd services/parser && go test ./... && go vet ./...   # is the parser green?
go run ./cmd/parser --repo ./testdata/resolve --format summary  # what does it emit, and how confident?
go run ./cmd/parser --repo ./testdata/resolve --write --repo-url x --commit y  # full pipeline
pnpm -r build && pnpm -r test                         # TypeScript side
git log --oneline -5                                  # what happened last
grep -c '\[x\]' TASKLIST.md                           # how far into the current phase
```

Read whole documents only when you need the *reasoning* behind a decision. For current state, the
commands are cheaper and more honest.

## Where to look

| Question | File |
|---|---|
| What are we building, and what counts as done? | `PRD.md` |
| What's the phase order and what closes each phase? | `PLAN.md` |
| What am I working on right now? | `TASKLIST.md` |
| How do I run it? | `DEVELOPMENT.md` |
| What's the schema? | `docs/DATA_MODEL.md` |
| How does extraction and resolution work? | `docs/PARSING_STRATEGY.md` |
| What's still undecided? | `docs/RISKS.md` |
| Why this stack? | `docs/TECH_STACK.md` |
