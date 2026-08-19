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
- [x] Phase 3a — API and auth
- [~] Phase 3b — Canvas and search ← in progress (B0–B7 done, B8 left)
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

- **Install the component, do not write it.** Reach for an existing component from a real provider —
  shadcn first (`npx shadcn@latest add <name>`), then the libraries in the locked stack — before
  writing markup by hand. Hand-rolling a dialog, a command palette, a tree row or a button is the
  wrong default: it is more code to review, more to maintain, and worse on accessibility than the
  thing already published. Check whether it exists before deciding it does not. Write a component
  only when nothing in the registry does the job, and say which one you looked for.
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
| Session store, cookie helpers, `requireSession` | `apps/api/src/auth/session.ts` |
| Signed-cookie set/read/clear, shared by session and OAuth state | `apps/api/src/auth/cookies.ts` |
| The single session gate over every `/api` route | `apps/api/src/routes/index.ts` |
| Spawning the parser, and canonical repo URLs | `apps/api/src/repos/register.ts` |
| Graph SQL, including the recursive CTE | `apps/api/src/graph/queries.ts` |
| Browser API calls | `apps/web/src/lib/api.ts` — extend `request<T>`, never bare `fetch` |

`internal/utils` imports only `internal/ir` and stdlib, so any package can use it without a cycle.

## Locked stack — do not re-decide without an explicit reason

- **Monorepo:** pnpm + Turborepo. Shared TypeScript types only in `packages/shared` (Drizzle + Zod).
- **Frontend:** Vite + React + TS, Tailwind **v4** (via `@tailwindcss/vite`, no `postcss.config.js`;
  the theme stays in `tailwind.config.ts`, loaded by `@config` in `index.css`, because
  `src/lib/tokens.ts` is the single source and the canvas needs the same values as raw SVG strokes),
  Framer Motion, React Flow, Shiki, cmdk,
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

## Known gaps

Updated as Phase 3b progresses. `TASKLIST.md` is the chunk-level truth; this is what outlives it.

- **`FunctionCard.tsx` is a placeholder that nothing imports.** The file card ended up as a React
  Flow node (`FileCard.tsx`), so this one has no job left. Delete it in B8 unless a use appears.
- **A Base UI popup will not unmount on its own.** It keeps `data-closed`, stays on screen and goes
  on taking clicks, because it waits for an exit animation it never observes finishing. Both
  dialogs render their content only while open. Any new `Dialog`, `Popover` or `Sheet` needs the
  same, or it will look closed and swallow the next click. See `docs/UI_GUIDE.md` §2.
- **Edge rendering has no automated test.** React Flow only draws an edge once both nodes are
  measured, and jsdom has no layout engine. `lib/graph.test.ts` covers exhaustively *what* the edges
  are; whether they paint is a browser check. See `docs/CANVAS_DECISIONS.md` §4 — which also records
  why **nothing may set `node.width` / `node.height`**: React Flow then treats the node as measured,
  never computes `handleBounds`, and drops every edge touching it in silence.
- **`POST /api/repos` parses synchronously**, so a large repository holds the request open until
  `PARSE_TIMEOUT_MS`. Phase 4's queue replaces the spawn; marked with a `ponytail:` comment.
- **`/auth/dev-login` exists outside production.** Phase 4 hardening deletes it.
- **Public repositories only.** The OAuth scope is `read:user`, and the parser clones over public
  HTTPS. See R26 for why `repo` was not the answer.
- **`pnpm start` cannot run the API.** `packages/shared` exports point at `./src/*.ts`, so plain
  `node dist/index.js` cannot follow them. `pnpm dev` (tsx) works. Fix before containerising.
- **Compiled test files land in `apps/api/dist`.** Harmless locally, wrong in an image.
- **Resolution limits that are honest, not broken:** barrel re-export chains, default imports, and
  `tsconfig` path aliases all resolve to `unresolved`. See `docs/PARSING_STRATEGY.md`.

## Verify state before trusting this file

Run these instead of reading source to find out where things stand. Commands can't go stale the way
prose can — if one contradicts this document, the command is right and this document needs fixing.

```bash
make start                     # infra, migrations, parser binary, API, web -- then open :5173
make test                      # TypeScript AND Go. `pnpm -r test` silently skips the parser
make lint && make typecheck
make go-vet                    # not part of `make test`
git log --oneline -5           # what happened last
grep -c '\[x\]' TASKLIST.md    # how far into the current phase
gh run list --branch $(git branch --show-current) --limit 2   # is CI green?
```

Parser on its own, when the question is about extraction rather than the app:

```bash
make go-run REPO=./services/parser/testdata/resolve
cd services/parser && go run ./cmd/parser --repo ./testdata/resolve --format summary
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
| Why does the canvas behave like that? | `docs/CANVAS_DECISIONS.md` |
