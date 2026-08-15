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
| **R19** | The `edges` table could not store an unresolved edge, so two of the three confidence tiers were unstorable. | Migration `0002` adds nullable `callee_function_id`, `callee_name` and `call_line`, plus an `edges_callee_consistency` CHECK making "callee null exactly when unresolved" a database rule rather than a convention the writer must remember. |
| **R20** | The Drizzle schema and the SQL migration disagreed in six places, each a runtime error waiting for whichever path reached it first. | Reconciled in C2. `resolution_confidence` is `text().$type<ResolutionConfidence>()` matching the real `TEXT` + `CHECK` column; nullability and constraint names now match what Postgres actually assigned. Verified by querying every table through Drizzle against the migrated database, not by building. |
| **R21** | No down migrations existed, so `make down` failed and nothing could be rolled back. | `0001_init.down.sql` backfilled and `0002` ships with its own. Verified by round-tripping up, down -all, up. |
| **R22** | `testcontainers-go` was named in the stack but never added to `go.mod`, so how integration tests reach Postgres was undefined. | Tests read `TEST_DATABASE_URL`, falling back to `DATABASE_URL`, and skip when neither is set. CI already runs a Postgres service container, so this needs no new dependency and no second code path. |
| **R26** | OAuth scope: `PLAN.md` and `docs/SECURITY.md` both said "repo-read", which GitHub OAuth apps do not offer. | **`read:user`.** The only scope that reads private repositories is `repo`, which also grants *write* to every private repository the user can reach -- a very large permission for a tool that only reads source. Nothing in Phase 3a touches a private repository: the parser clones over public HTTPS and never uses the session's token. Public repositories only until a phase genuinely needs otherwise, at which point the widening is one constant in `auth/routes.ts` and a re-consent. |
| **R27** | Registration runs the parser inline, so a large repository holds an HTTP request open for the length of the parse. | Accepted for 3a and bounded by `PARSE_TIMEOUT_MS`, which answers **504** rather than hanging. Phase 4's queue replaces the spawn with an enqueue; the code carries a `ponytail:` comment naming that upgrade path. Building the queue early would have pulled a whole phase forward to fix a problem the phase after it removes. |
| **R28** | `repoUrlSchema` accepted `https://evil.com/#github.com`, because it tested `.includes("github.com")`. | Fixed in A5: the URL is parsed, the **host compared**, and the path required to be exactly `owner/repo`. The real boundary is that the parser is spawned with an argv array and never a shell, so a hostile URL was already inert -- this is defence in depth, and the argv test is the one that matters. |
| **R29** | Every repository defaulting to `master` was recorded as being on `main`. | The parser's `--branch` defaulted to `"main"` while a shallow clone checks out whatever the remote's default actually is. Branch and commit are now read off the checkout with `git rev-parse`; the caller hands over a URL and never clones, so it could not have known either. |
| **R9** | The Go parser cannot import `packages/shared`, so it has no shared types. | The parser keeps **Go-native IR types** in `internal/ir/ir.go`, mirroring the schema by hand. The duplication is accepted; generating Go structs from the migration was judged more machinery than the drift is worth at four tables. |
| **R10** | Single migration source, so the parser and API can't drift. | **`services/parser/migrations/`**, plain SQL via golang-migrate. Both the Go writer and the TypeScript reader use it. CI runs the migrations against a live Postgres on every PR. |
| **R11** | Dev and prod modes differ — prod is `docker compose up`, dev needs HMR and watch. | Both documented in `DEVELOPMENT.md`. Dev runs infra in compose and the three services natively; prod runs everything in compose. |
| **R16** | Grammar versions drift and break parsing silently. | Pinned in `go.mod`: `tree-sitter/go-tree-sitter` **v0.25.0**, `tree-sitter/tree-sitter-typescript` **v0.23.2**. The golden extraction tests fail loudly if a bump changes node kinds. |
| **R17** | CI needs Docker for the integration tests and the migration check. | `ubuntu-latest` runners include Docker. `.github/workflows/go-ci.yml` runs a Postgres service container and a `migrate/migrate` container; the Go tests connect to it via `DATABASE_URL`. See R22. |
| **R18** | UI direction was undefined, which is how products end up looking like scaffolding. | Decided in `docs/UI_GUIDE.md`: dark-mode-first, one signature accent, tokens in Tailwind config, Framer Motion used to explain rather than decorate. |

---

## Open

### Before Phase 2 closes

Nothing outstanding -- R19 through R22 and R26 through R29 all closed; see Decided above.

### Before Phase 3

| | Risk | Notes |
|---|---|---|
| **R3** | **No benchmark repo has been named.** "A ~300-file TypeScript project" appears in every performance target and is not a real repository, so none of NFR-1 is actually testable. | Still open. Phase 2 closed against fixtures, which prove correctness but not the NFR-1 timings. Needs a public, TypeScript-first repo of roughly 300 files with enough re-exports and barrel files to exercise the resolver's weak spots. |
| **R2** | Session strategy — Redis-backed or stateless JWT? | Default is Redis-backed: Redis is already running for the queue, and server-side sessions can be revoked. Confirm before writing the auth code. |
| **R4** | The GitHub OAuth app does not exist yet. Manual setup: register it, record the client id and secret, set the redirect URI, generate a webhook secret. | Not code. Blocks all of Phase 3, so do it before starting, not during. |
| **R15** | Canvas scale — even with expand-on-click, the first paint of a large repo's file tree needs virtualization. | State the node ceiling as a constant in code, not just in a document. Target is 2,000 visible nodes. |
| **R14** | Deleting a registered repo must cascade its rows *and* clean the clone off disk. | The database half is done: `ON DELETE CASCADE` on `files.repo_id`, covered by a test that deletes a repo and asserts files, functions and edges all go. The disk half is still unwritten. |

### Before Phase 3b

| | Risk | Notes |
|---|---|---|
| **R30** | `/auth/dev-login` mints a session with no GitHub round trip. Gated to non-production, so the route does not exist there at all -- but it is still a login with no credential. | Deleted in Phase 4 hardening. Until then, never run a non-production `NODE_ENV` on a reachable host. |

### Before Phase 4

| | Risk | Notes |
|---|---|---|
| **R31** | **A request that touches Redis hangs indefinitely when Redis is down.** ioredis retries forever, so `createSession` never settles: logging in leaves the button on "Signing in…" with no error, ever. Found in Phase 3b by stopping the container mid-session. | The API is the right place to fix it — a connect/command timeout so the request fails rather than hangs, and a 503 the UI can render. A client-side timeout would only paper over it. Belongs with Phase 4 hardening. |
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
