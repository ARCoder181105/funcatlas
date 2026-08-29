# CLAUDE.md — funcatlas

Context for AI assistants working in this repo. This is the load-bearing summary; the full product
contract is in `PRD.md` and the phase plan is in `PLAN.md`.

## What this is

An interactive visual map of a codebase. Clone a repo → tree-sitter extracts functions and call
sites → resolve calls to definitions → store the graph in Postgres → explore it on a React Flow
canvas (file → card → function mind-map → code block). Languages: **TypeScript, TSX, JavaScript,
JSX, Go, Rust, Python and Java**. Everything past the ECMAScript family is extraction plus
same-file resolution only — see "Per-language extraction limits" in `docs/PARSING_STRATEGY.md`.

The product is called **funcatlas** everywhere — repo, module path, npm scope, database, cookie.
The old working name "CodeCanvas" is retired; do not reintroduce it.

## Status

- [x] Phase 0 — Bootstrap
- [x] Phase 1 — Parser and isolation
- [x] Phase 2 — Storage and resolution
- [x] Phase 3a — API and auth
- [x] Phase 3b — Canvas and search
- [x] Phase 4 — Webhooks, queue, hardening
- [x] Phase 5 — Go, Rust, Python, JavaScript, Java (extraction only; per-language resolution stays cut)

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
| All parser constants — language names, resolution groups, node kinds by language, confidence tiers, import kinds, limits | `services/parser/internal/utils/constants.go` |
| One language's grammar, `.scm`, scope rules, receiver and imports | `services/parser/internal/extract/<language>.go`, registered in `spec.go` |
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
| The queue, its job ids, and the dirty-repository flag | `apps/api/src/queue/parse.ts` |
| Incremental write planning — the write set and its cascade trap | `services/parser/internal/db/incremental.go` |
| Per-module constants | `<module>/constants.ts` in api and web; `lib/graph-constants.ts` for canvas geometry |
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
- **Parser:** Go + `tree-sitter/go-tree-sitter` v0.25.0, plus one pinned grammar per language:
  `tree-sitter-typescript` v0.23.2, `-javascript` v0.25.0, `-go` v0.25.0, `-rust` v0.24.2,
  `-python` v0.25.0, `-java` v0.23.5. pgx with explicit SQL, zap.
- **Database:** Postgres — edge tables and recursive CTEs. Neo4j deferred indefinitely.
- **Queue:** Redis + BullMQ, consumed by a **Node worker that spawns the Go binary** (`pnpm worker`).
  The parser has no Redis dependency.
- **Migrations:** golang-migrate, plain SQL, single source at `services/parser/migrations/`, read by
  both the Go writer and the TypeScript reader. Never edit an applied migration.
- **Tests:** Vitest, testify. Integration tests use `TEST_DATABASE_URL` (falling back to
  `DATABASE_URL`) and skip when unset; CI supplies a Postgres service container. No testcontainers.
  CI: GitHub Actions. Local infra: docker-compose.

No GORM. No Prisma. No full ORM on the Go side.

## Locked product decisions

GitHub OAuth from day one. Webhook-driven incremental updates in the MVP. Function-name search in
the MVP. Excalidraw annotation and LSP resolution are out.

**Parser isolation: the harness was built in Phase 1, the product does not use it.** `--network
none`, read-only rootfs, non-root and dropped capabilities apply under `make parser-isolated` and
nowhere else — `repos/register.ts` runs the binary with `execFile` from the queue worker, so on
`make start` and in any composed stack it is a plain child process. What *is* enforced on every
path, because it lives in the parser rather than around it: symlinks hard-fail, files over 1 MB
skipped, file-count and depth caps, a `--depth 1` clone with credential prompts disabled, and no
repo scripts ever invoked. See R38 and `docs/SECURITY.md` before quoting the sandbox as a
guarantee.

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
  pins the **calls** inside its hardest construct, not just the function names. `tree-sitter-javascript`
  is the exception that proves it: one grammar reads JSX in any file, so `.js` and `.jsx` share it.
- **Adding a language is a `Spec` in `internal/extract/`, a `.scm` in `queries/`, and a fixture.**
  The third is not optional. `internal/extract/spec_test.go` fails if a `.scm` is missing any of the
  three captures, and the extension registry is driven off `registry` so a new language cannot leave
  a test asserting last month's set.
- **The resolver partitions by language group; it does not filter by it.** `byName` and `byPkgName`
  are keyed on the group so there is no code path that can reach a foreign-language candidate at
  all. `.ts`/`.tsx`/`.js`/`.jsx`/`.mjs`/`.cjs` share the one group with more than one language in
  it. **Do not write a test that decides what to allow by calling `utils.ResolutionGroup`** — it
  agrees with itself when broken. See R36.

## Known gaps

Phase 3b is closed. `TASKLIST.md` is the chunk-level truth; this is what outlives it.

- **Node data is compared by value, not by reference.** `buildGraph` rebuilds every node's data on
  any change, so a `memo` keyed on reference re-rendered every card whenever one changed — and each
  card showing source re-ran its highlighted block, which the reader saw as untouched cards
  blinking. `sameNodeData` in `lib/graph.ts` is what both node memos use; keep it that way.
- **Restored canvas state is checked late, not at rehydrate.** Nothing is loaded when
  `zustand/persist` rehydrates, so `dropMissingRoots` runs when the open file's function list
  arrives. That list is authoritative for branch roots only; an expanded id in another file is left
  to its own query, which 404s. See R34.
- **A webhook's HMAC covers the raw bytes, so the JSON parser is scoped, not global.** Fastify's
  default parser drops the text, and re-serialising `req.body` does not reproduce what GitHub sent —
  the digest then fails in a way that reads as a wrong secret. A test that signs *compact* JSON will
  not catch this, because compact JSON round-trips through `JSON.stringify` unchanged; the test uses
  a pretty-printed body for exactly that reason.
- **A rate limit keyed on the request body silently never fires.** `@fastify/rate-limit` runs
  `onRequest`, before parsing, so the key is `undefined` and every request gets its own bucket. The
  webhook keys on `x-github-hook-id`.
- **A React Flow node's box must not use Framer's `layout`.** `layout` measures against the
  viewport, and inside the canvas's panned and zoomed transform those deltas are wrong. Card growth
  is a CSS transition on `width,height` under `motion-safe:`.
- **A Base UI popup will not unmount on its own.** It keeps `data-closed`, stays on screen and goes
  on taking clicks, because it waits for an exit animation it never observes finishing. Both
  dialogs render their content only while open. Any new `Dialog`, `Popover` or `Sheet` needs the
  same, or it will look closed and swallow the next click. See `docs/UI_GUIDE.md` §2.
- **Edge rendering has no automated test.** React Flow only draws an edge once both nodes are
  measured, and jsdom has no layout engine. `lib/graph.test.ts` covers exhaustively *what* the edges
  are; whether they paint is a browser check. See `docs/CANVAS_DECISIONS.md` §4 — which also records
  why **nothing may set `node.width` / `node.height`**: React Flow then treats the node as measured,
  never computes `handleBounds`, and drops every edge touching it in silence.
- **Resolution is whole-repo, so `--incremental` scopes the write and not the parse.** A push
  re-clones, re-extracts and re-resolves everything; only the changed rows are written. This is not
  what `PRD.md` FR-9 describes, and the reason is in `docs/RISKS.md` R35: `newIndex` builds six
  repo-wide maps, and a partial symbol table emits a confident edge where the whole repository would
  correctly say ambiguous. Scoping the parse means hydrating that table out of Postgres.
- **The write set is bigger than "files that changed", and the extra clause is invisible.** Deleting
  a file's functions cascades edges *into* it as well as out. So edges are deleted explicitly by
  caller, functions only for files whose hash moved, and the caller set is read from the new graph
  **and from the database** — that second half is what catches a call deleted in this commit, whose
  only remaining trace is the row. `internal/db/incremental.go`.
- **`edges` has no uniqueness constraint.** Duplicate protection is entirely the delete that precedes
  the insert. Write edges for a file whose functions you did not delete and they silently double.
- **Public repositories only.** The OAuth scope is `read:user`, and the parser clones over public
  HTTPS. See R26 for why `repo` was not the answer.
- **`docker compose up` is the front door, and everything runs under `tsx`.** `packages/shared`
  exports point at `./src/*.ts`, so `node dist/index.js` cannot follow them -- the image ships
  source and runs tsx, and `pnpm start` does the same. Building shared to `dist` and repointing
  `exports` is the cleaner endpoint; it was not done because it puts a build step in front of the
  dev loop. `.dockerignore` keeps compiled tests, `node_modules` and `.env` out of every image.
- **`make setup` writes `FUNCATLAS_SINGLE_USER`, so the default stack has no authentication.**
  One branch in `requireSession`, no OAuth routes registered, every compose port on `127.0.0.1`,
  and a warning on every start. R39 -- read it before assuming this is safe to deploy.
- **Resolution limits that are honest, not broken:** barrel re-export chains, default imports, and
  `tsconfig` path aliases all resolve to `unresolved`. So does every per-language construct in
  "Per-language extraction limits" — Go's single-type-argument generic call (ambiguous with a
  conversion), anything inside a Rust macro (a `token_tree` is not parsed), and which Java overload
  a call meant. Each is pinned by an assertion, because a parser that quietly produces *less* reads
  as one that worked. See `docs/PARSING_STRATEGY.md`.

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
make go-run REPO=./services/parser/testdata/polyglot
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
