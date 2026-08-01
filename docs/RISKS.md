# Risks and Open Decisions

Every decision that could be made badly under time pressure mid-build, tracked so it gets made
deliberately instead. Each item is **DECIDED**, **OPEN** (needs an answer before the phase named),
or **DEFERRED** (revisit after the MVP).

Status is updated as the build moves. When you close one, record *what* was decided, not just that
it was.

---

## Decided

| | Risk | Decision |
|---|---|---|
| **R1** | Product vs repo name — `funcatlas` or `CodeCanvas`? Locks the OAuth app name, image tags, and public URL. | **funcatlas**, everywhere. It is already the Go module path, the npm scope, the Postgres user and database, and the session cookie name, so adopting it cost nothing. `CodeCanvas` is also a crowded name in the devtools space. All references retired. |
| **R6** | What is a "package" in TypeScript — a directory, an npm package, or a tsconfig project? Drives the resolver's package fallback. | **Directory**, relative to the repo root. `package_path` is `filepath.Dir(rel)`, empty string for root files. It is what the code already computes, it needs no config parsing, and it matches how TypeScript programmers actually group code. |
| **R7** | `qualified_name` format — the original `package_path::name` was undefined for TypeScript modules. | **Dot-joined scope path**, no package prefix: `getUser`, `Repo.sync`, `getUser.inner`, `<anonymous>`. Uniqueness comes from `(file_id, qualified_name, overload_index)`, so the package prefix was redundant. |
| **R8** | Overloading and edges — name matching cannot pick the right overload. | An edge whose target `qualified_name` has more than one `overload_index` in its file is tagged **`unresolved`**. Never fan out to all of them, never pick the first. Consistent with the confidence commitment in `PRD.md` §8. |
| **R9** | The Go parser cannot import `packages/shared`, so it has no shared types. | The parser keeps **Go-native IR types** in `internal/ir/ir.go`, mirroring the schema by hand. The duplication is accepted; generating Go structs from the migration was judged more machinery than the drift is worth at four tables. |
| **R10** | Single migration source, so the parser and API can't drift. | **`services/parser/migrations/`**, plain SQL via golang-migrate. Both the Go writer and the TypeScript reader use it. CI runs the migrations against a live Postgres on every PR. |
| **R11** | Dev and prod modes differ — prod is `docker compose up`, dev needs HMR and watch. | Both documented in `DEVELOPMENT.md`. Dev runs infra in compose and the three services natively; prod runs everything in compose. |
| **R16** | Grammar versions drift and break parsing silently. | Pinned in `go.mod`: `tree-sitter/go-tree-sitter` **v0.25.0**, `tree-sitter/tree-sitter-typescript` **v0.23.2**. The golden extraction tests fail loudly if a bump changes node kinds. |
| **R17** | CI needs Docker for `testcontainers-go` and the migration check. | `ubuntu-latest` runners include Docker. `.github/workflows/go-ci.yml` already runs a Postgres service container and a `migrate/migrate` container. |
| **R18** | UI direction was undefined, which is how products end up looking like scaffolding. | Decided in `docs/UI_GUIDE.md`: dark-mode-first, one signature accent, tokens in Tailwind config, Framer Motion used to explain rather than decorate. |

---

## Open

### Before Phase 2 closes

| | Risk | Notes |
|---|---|---|
| **R19** | **The `edges` table cannot store an unresolved edge.** It records `callee_function_id`, so a call that resolves to nothing loses the callee name entirely and the row says nothing. Two of the three confidence tiers are unstorable as designed. | Being fixed in `TASKLIST.md` C1: nullable `callee_function_id`, plus `callee_name` and `call_line`. |
| **R20** | **The Drizzle schema and the SQL migration disagree.** `resolution_confidence` is a `pgEnum` in Drizzle but `TEXT` with a `CHECK` in SQL, and three nullability constraints differ. Whichever code path hits it first fails at runtime, not at build. | Being fixed in `TASKLIST.md` C2. The deeper problem is that "one schema described twice" has no automated check — consider a CI step that diffs `drizzle-kit` output against the migration. |
| **R21** | **No down migrations exist.** `make down` fails, and a bad migration cannot be rolled back locally. | Being fixed in `TASKLIST.md` C1. |
| **R3** | **No benchmark repo has been named.** "A ~300-file TypeScript project" appears in every performance target and is not a real repository, so none of NFR-1 is actually testable. | Pick one before Phase 2's exit test. It needs to be public, roughly 300 files, TypeScript-first, and use enough re-exports and barrel files to exercise the resolver's weak spots. |

### Before Phase 3

| | Risk | Notes |
|---|---|---|
| **R2** | Session strategy — Redis-backed or stateless JWT? | Default is Redis-backed: Redis is already running for the queue, and server-side sessions can be revoked. Confirm before writing the auth code. |
| **R4** | The GitHub OAuth app does not exist yet. Manual setup: register it, record the client id and secret, set the redirect URI, generate a webhook secret. | Not code. Blocks all of Phase 3, so do it before starting, not during. |
| **R15** | Canvas scale — even with expand-on-click, the first paint of a large repo's file tree needs virtualization. | State the node ceiling as a constant in code, not just in a document. Target is 2,000 visible nodes. |
| **R14** | Deleting a registered repo must cascade its rows *and* clean the clone off disk. | The database half is addressed by the `ON DELETE CASCADE` added in C1. The disk half is still unwritten. |

### Before Phase 4

| | Risk | Notes |
|---|---|---|
| **R5** | GitHub cannot reach `localhost`, so webhooks can't be tested locally without a tunnel. | `ngrok` or `smee.io`. Tooling, not code. |
| **R12** | A webhook and a manual re-parse can fire on the same repo at once and corrupt the graph mid-transaction. | Needs a lock keyed by repo, held for the duration of the parse. |
| **R13** | A push storm enqueues one job per commit. | Debounce per repo — collapse pushes arriving inside a short window into one job. |

---

## Deferred until after the MVP

| Item | Why it can wait |
|---|---|
| Respecting `.gitignore` during the walk | The skip-list already covers `node_modules`, `.git`, `dist`, and `build`, which is where the volume is. Revisit if a real repo fails because of it. |
| Object storage for function source | `source_blob_ref` is a text column. At MVP scale the row size is not a problem. Move to S3-compatible storage only when it measurably is. |
| Neo4j | Recursive CTEs over an edge table handle this scale. Revisit when traversal is the measured bottleneck, not before. |
| LSP-based resolution | Ships as a v2 upgrade that promotes `name_match` and `unresolved` edges to `exact`. The confidence field exists precisely so this can land without a schema change. |
