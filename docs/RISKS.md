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
| **R28** | `repoUrlSchema` accepted `https://evil.com/#github.com`, because it tested `.includes("github.com")`. | Fixed in A5: the URL is parsed, the **host compared**, and the path required to be exactly `owner/repo`. The real boundary is that the parser is spawned with an argv array and never a shell, so a hostile URL was already inert -- this is defence in depth, and the argv test is the one that matters. |
| **R29** | Every repository defaulting to `master` was recorded as being on `main`. | The parser's `--branch` defaulted to `"main"` while a shallow clone checks out whatever the remote's default actually is. Branch and commit are now read off the checkout with `git rev-parse`; the caller hands over a URL and never clones, so it could not have known either. |
| **R9** | The Go parser cannot import `packages/shared`, so it has no shared types. | The parser keeps **Go-native IR types** in `internal/ir/ir.go`, mirroring the schema by hand. The duplication is accepted; generating Go structs from the migration was judged more machinery than the drift is worth at four tables. |
| **R10** | Single migration source, so the parser and API can't drift. | **`services/parser/migrations/`**, plain SQL via golang-migrate. Both the Go writer and the TypeScript reader use it. CI runs the migrations against a live Postgres on every PR. |
| **R11** | Dev and prod modes differ — prod is `docker compose up`, dev needs HMR and watch. | Both documented in `DEVELOPMENT.md`. Dev runs infra in compose and the three services natively; prod runs everything in compose. |
| **R16** | Grammar versions drift and break parsing silently. | Pinned in `go.mod`: `tree-sitter/go-tree-sitter` **v0.25.0**, `tree-sitter/tree-sitter-typescript` **v0.23.2**. The golden extraction tests fail loudly if a bump changes node kinds. |
| **R17** | CI needs Docker for the integration tests and the migration check. | `ubuntu-latest` runners include Docker. `.github/workflows/go-ci.yml` runs a Postgres service container and a `migrate/migrate` container; the Go tests connect to it via `DATABASE_URL`. See R22. |
| **R27** | Registration runs the parser inline, so a large repository holds an HTTP request open for the length of the parse. | **Closed in Phase 4.** `POST /api/repos` writes the row, enqueues, and answers 202. The row has to exist before the job does, or a worker picks it up with nothing to mark as parsing -- which reversed who owns the insert, since the parser used to. `repos.parse_status` is how the client follows a parse it is no longer waiting on. |
| **R30** | `/auth/dev-login` mints a session with no GitHub round trip. | **Deleted in Phase 4.** The `NODE_ENV` gate meant it only had to be wrong once. Every gated test needed it, which is what kept it alive; the test helper signs a session cookie directly through `app.signCookie` now, so the shortcut lives where it cannot be deployed. |
| **R31** | A request that touches Redis hangs indefinitely when Redis is down. | **Closed in Phase 4.** Connect and command timeouts plus a finite retry ceiling, and one root error handler mapping those failures to **503** rather than 500 -- the request was fine, the dependency was not. Handled once rather than guarded per call site, because a guard per caller is how the next caller ends up without one. |
| **R18** | UI direction was undefined, which is how products end up looking like scaffolding. | Decided in `docs/UI_GUIDE.md`: dark-mode-first, one signature accent, tokens in Tailwind config, Framer Motion used to explain rather than decorate. |
| **R3** | **No benchmark repo had been named**, so "a ~300-file TypeScript project" in every NFR-1 target was not testable against anything real. | **`honojs/hono`.** Public, TypeScript-first, 355 files and 1,460 functions, and dense in exactly the barrel re-exports and default imports the resolver is weakest at — it produces all three tiers with non-zero counts (1,106 / 150 / 4,650). Chosen during the 3b gate because the obvious candidate, `ARCoder181105/funcatlas` itself, is private and the parser clones anonymously. The NFR-1 *timings* are still unmeasured; the repository they will be measured against is now fixed. |
| **R32** | A private or missing repository made `git clone` ask for a username. Unprompted, that blocks until `PARSE_TIMEOUT_MS` and reports a timeout for what is really "no such repository". | The clone runs with `GIT_TERMINAL_PROMPT=0` and empty `GIT_ASKPASS` / `SSH_ASKPASS`, so git fails immediately with "terminal prompts disabled". Found by the 3b gate on its first action, against the project's own private repo. |
| **R33** | The registration dialog rendered five lines of the parser's zap JSON, stack trace included, running off the dialog and off the viewport. `stderrTail` promised the caller "not enough to ship a log file" and did the opposite. | The reason is read out of the last log line carrying an `error`, and its last line is the one taken -- git leads with "Cloning into '/tmp/…'" and puts the real "fatal: …" underneath. Non-JSON stderr still falls back to the tail. |

---

## Open

### Before Phase 2 closes

Nothing outstanding -- R19 through R22 and R26 through R29 all closed; see Decided above.

### Before Phase 3

| | Risk | Notes |
|---|---|---|
| **R2** | Session strategy — Redis-backed or stateless JWT? | Default is Redis-backed: Redis is already running for the queue, and server-side sessions can be revoked. Confirm before writing the auth code. |
| **R4** | The GitHub OAuth app does not exist yet. Manual setup: register it, record the client id and secret, set the redirect URI, generate a webhook secret. | Not code. Blocks all of Phase 3, so do it before starting, not during. |
| **R15** | Canvas scale — even with expand-on-click, the first paint of a large repo's file tree needs virtualization. | State the node ceiling as a constant in code, not just in a document. Target is 2,000 visible nodes. |

### Before Phase 5

| | Risk | Notes |
|---|---|---|
| **R34** | **Canvas state is persisted but never re-validated.** `store/ui.ts` restores the repository, the open file and every open branch through `zustand/persist`. Phase 4's re-parse reinserts functions under new ids, so a restored branch can point at rows that are gone. | Phase 4 made this reachable rather than theoretical: a webhook re-parse changes ids without anyone touching the browser. Scoping the write narrowed it -- an unedited file keeps its function ids now -- but an edited one does not. The fix is to drop unknown ids on restore rather than to stop persisting. |
| **R35** | **Resolution is whole-repo, so an incremental re-parse still re-parses everything.** The write is scoped; the clone, the extract and the resolve are not. | Accepted in Phase 4 and recorded rather than hidden, because `PRD.md` FR-9 says otherwise. Making it real means hydrating a repo-wide symbol table out of Postgres for the unchanged files, in the shape `newIndex` builds -- and keeping the two in step, or confidence drifts silently. Worth it when parse time is measured to be the problem, not before. |

---

## Deferred until after the MVP

| Item | Why it can wait |
|---|---|
| Respecting `.gitignore` during the walk | The skip-list already covers `node_modules`, `.git`, `dist`, and `build`, which is where the volume is. Revisit if a real repo fails because of it. |
| Object storage for function source | `source_blob_ref` is a text column. At MVP scale the row size is not a problem. Move to S3-compatible storage only when it measurably is. |
| Neo4j | Recursive CTEs over an edge table handle this scale. Revisit when traversal is the measured bottleneck, not before. |
| LSP-based resolution | Ships as a v2 upgrade that promotes `name_match` and `unresolved` edges to `exact`. The confidence field exists precisely so this can land without a schema change. |
