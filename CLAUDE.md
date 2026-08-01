# CLAUDE.md — funcatlas

Context for AI assistants working in this repo. This is the load-bearing summary; the full product
contract is in `PRD.md` and the phase plan is in `PLAN.md`.

## What this is

An interactive visual map of a codebase. Clone a repo → tree-sitter extracts functions and call
sites → resolve calls to definitions → store the graph in Postgres → explore it on a React Flow
canvas (file → card → function mind-map → code block). First and only language: **TypeScript**.

The product is called **funcatlas** everywhere — repo, module path, npm scope, database, cookie.
The old working name "CodeCanvas" is retired; do not reintroduce it.

## Status

- [x] Phase 0 — Bootstrap
- [x] Phase 1 — Parser and isolation
- [~] Phase 2 — Storage and resolution ← current, branch `phase-2/storage-and-resolution`
- [ ] Phase 3 — API, auth, canvas, search
- [ ] Phase 4 — Webhooks, queue, hardening

Active task list: `TASKLIST.md`.

## How to work here

The user writes the code — they are building this to learn the internals. Your job is to review,
debug, catch bugs before they're committed, suggest simpler approaches, and unblock when they're
stuck. Do not implement whole chunks unless asked. Keep `TASKLIST.md` checkboxes current.

## Locked stack — do not re-decide without an explicit reason

- **Monorepo:** pnpm + Turborepo. Shared TypeScript types only in `packages/shared` (Drizzle + Zod).
- **Frontend:** Vite + React + TS, Tailwind + shadcn/ui, Framer Motion, React Flow, Shiki, cmdk,
  lucide-react, Zustand + TanStack Query.
- **API:** Fastify + Drizzle + postgres.js + Zod, arctic/oslo for GitHub OAuth, Redis sessions,
  `@fastify/rate-limit`.
- **Parser:** Go + `tree-sitter/go-tree-sitter` v0.25.0 + `tree-sitter/tree-sitter-typescript`
  v0.23.2 (both pinned in `go.mod`), sqlx + pgx with explicit SQL, zap.
- **Database:** Postgres — edge tables and recursive CTEs. Neo4j deferred indefinitely.
- **Queue:** Redis + BullMQ.
- **Migrations:** golang-migrate, plain SQL, single source at `services/parser/migrations/`, read by
  both the Go writer and the TypeScript reader. Never edit an applied migration.
- **Tests:** Vitest, testify, testcontainers-go. CI: GitHub Actions. Local infra: docker-compose.

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

## Known gaps carried into Phase 2

Documented in full in `TASKLIST.md` C0–C2; summarised here so they aren't rediscovered:

- `ir.CallSite` has no `FileID`, which blocks same-file and import-based resolution.
- Member calls discard the receiver — `Repo.sync()` records only `sync`.
- Import symbol extraction returns every identifier, so `import { a as b }` yields both `a` and `b`.
- The `edges` table cannot store an unresolved edge, because it has no column for the callee's name.
- The Drizzle schema and the SQL migration disagree on the confidence column type and on three
  nullability constraints.

## Verify state before trusting this file

Run these instead of reading source to find out where things stand. Commands can't go stale the way
prose can — if one contradicts this document, the command is right and this document needs fixing.

```bash
cd services/parser && go test ./... && go vet ./...   # is Phase 1 still green?
go run ./cmd/parser --repo ./testdata/golden --format summary   # what does the parser actually emit?
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
