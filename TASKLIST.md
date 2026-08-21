# Phase 4 — Webhooks, Queue and Hardening

The live task list. Phase 3b gave the graph a face. It also proved the ceiling: charting a
repository holds the HTTP request open for the whole clone-and-parse, and once charted the graph is
a snapshot of one commit forever. Phase 4 makes it self-updating and closes the security checklist.

**Branch:** `phase-4/webhooks-queue-hardening`
**Reference:** [`PLAN.md`](PLAN.md) Phase 4 · [`docs/SECURITY.md`](docs/SECURITY.md) ·
[`docs/RISKS.md`](docs/RISKS.md) R12–R14, R27, R30–R31

## How to work through this

Claude implements; you review at the phase gate. One chunk at a time, top to bottom — the order is
load-bearing: D0 produces the hashes D1 diffs, D1 makes the write safe before anything triggers it
automatically, D2 gives D3 and D4 something to enqueue onto, and D4 is the only reason the queue
exists. Each chunk lists:

- **Why** — the reason it exists, so it can be pushed back on if the reason is wrong.
- **Where** — the files it touches.
- **Do** — the work, broken into steps.
- **Done when** — the objective test. Not "the code compiles".
- **Watch for** — the specific bugs to check for before the chunk is committed.

Write the test in the same commit as the code it tests. Commit one chunk at a time with an
imperative message. `[ ]` todo · `[~]` in progress · `[x]` done.

## What this phase actually teaches

| Chunks | Concept | Where else you'll meet it |
|---|---|---|
| D0 | Content-addressing as change detection, when the obvious source of truth is unavailable | Build caches, CDNs, every incremental compiler |
| D1 | A cascade delete reaching rows you did not think you were touching | Any schema with FKs and a partial rewrite |
| D2 | Idempotency keys collapsing a storm into one unit of work | Every queue, every webhook consumer |
| D4 | Verifying a signature over bytes you must not re-serialise | Stripe, GitHub, every HMAC webhook |
| D3 | A synchronous contract becoming asynchronous, and what the UI owes the reader afterwards | Every "we'll email you when it's ready" flow |

D1 is the one worth slowing down for. It is where a re-parse stops being "write the files that
changed" and becomes "write the files whose *rows* changed" — a set that includes files nobody
edited. Get it wrong and edges vanish silently, which is the same class of failure as the `.tsx`
grammar mismatch in Phase 2: the data looks written, and part of it is simply gone.

## Decisions taken before starting

Asked and answered at planning time, so they are not re-litigated mid-phase.

- **Full extract, full resolve, scoped write.** `PRD.md` FR-9 says "re-parse only the changed
  files", and that cannot be done as written: `internal/resolver` builds six whole-repo maps, and
  two of the three resolution passes need them. Given only the changed files, cross-file calls
  degrade from `exact` to `unresolved` — and a partial candidate set can emit a **false `exact`**
  where the whole repo would correctly say ambiguous. That is exactly the guess `PRD.md` §8 forbids.
  So resolution stays byte-identical to today and only the write is scoped. The phase buys database
  churn and edge correctness, **not** parse time, and `PLAN.md`'s exit test is amended in D7 to say
  so honestly.
- **A Node worker that spawns the Go binary.** BullMQ is consumed in `apps/api`; the worker
  `execFile`s the parser exactly as registration does today. The parser gains no Redis dependency
  and `go-ci.yml` needs no Redis service. This contradicts `docs/ARCHITECTURE.md`'s claim that the
  worker talks only through the queue and Postgres; D7 corrects the document.
- **Content hash, not `git diff`.** A `--depth 1` clone has one commit and no history, deepening the
  fetch costs network on every parse, and a force-push invalidates a commit range anyway. The walk
  already reads every byte.
- **Security scope.** Do L34 (webhook), L39 (clone cleanup), R30 (`/auth/dev-login`), R31 (Redis
  hang). Tick L35, L36, L38 — already true, never ticked. **Defer** L32 (TOCTOU symlinks) and L37
  (token refresh), with reasons recorded rather than left blank.

## What this phase does not build

Multi-tenancy. Private repositories. A retry or backoff UI. Per-language resolution — that is
Phase 5. Saved canvas layouts. Deleting a repository from the UI: R14's database half already ships
and is tested, and this phase adds only the disk half.

---

## D0 — Change detection: hash every file  `[x]`

**Why.** Everything downstream needs the answer to "which files actually changed", and it has to
work for a shallow clone and a bare local path alike.

**Where.** `services/parser/migrations/0003_file_content_hash.*.sql`, `internal/ir/ir.go`,
`internal/ts/extract.go`, `internal/db/writer.go`, `packages/shared/src/schema.ts`, `.gitattributes`.

**Do.**

1. Migration `0003` adds `files.content_hash TEXT`, nullable, with its `.down.sql` in the same
   commit. ✅
2. `ir.File.ContentHash`, filled in the extractor where the bytes are already in hand — `sha256`,
   hex, stdlib only. ✅
3. `upsertFiles` writes it and the `ON CONFLICT` path updates it. ✅
4. Mirror the column in the Drizzle schema. The SQL and Drizzle disagreeing is R20, and it cost a
   whole chunk last time. ✅

**Done when.** Parsing a fixture twice leaves every hash identical; editing one file moves exactly
one hash. — `TestWriteGraph_ContentHashTracksEdits`, passing.

**What it turned up.** Two things beyond the chunk. `make test` never sourced `.env`, so
`dbtest.URL` found no `DATABASE_URL`, every database integration test skipped, and the command
reported a green run that had not touched Postgres — fixed in its own commit. And pinning hashes in
the golden fixture makes its bytes load-bearing, so `.gitattributes` now marks `testdata` binary:
without it a clone with `core.autocrlf=true` rewrites every line ending and breaks every hash for a
reason the diff does not show.

---

## D1 — Scope the write to the files whose rows changed  `[x]`

**Why.** The substance of "incremental", and the reason a naive per-file write is unsafe.

**The cascade trap.** `deleteFunctions` deletes a file's functions and `edges.callee_function_id`
is `ON DELETE CASCADE`, so deleting file B's functions **also deletes file A's edge pointing into
B**. If A is not in the write set that edge is never recreated: not orphaned, not unresolved,
absent. `TestWriteGraph_RenameLeavesNoOrphanEdges` passes today only because it rewrites both files.

So the write set is not "files whose hash changed":

```
changed      = files whose content hash moved, plus new files, plus files gone from the walk
rewriteEdges = changed ∪ callers(changed), as the new graph sees them AND as the database still does
rewriteFuncs = changed
```

**Planned as one set; it had to be two.** The first cut deleted functions for every file it wanted
to rewrite edges for — and deleting a file's functions cascades its *incoming* edges too, so each
caller pulled in its own callers, and so on: a transitive closure that reaches most of a repository
and gives back nothing. Deleting edges explicitly, by caller, stops the closure at one level. A file
that merely calls a changed file keeps its function rows and their ids, which is the whole point.

The database half of `callers` is one `SELECT DISTINCT` across `edges` → `functions` → `files`, and
it is the half that is easy to forget and impossible to notice: it catches the call that was
*deleted* in this commit, whose only remaining trace is the row.

**Where.** `internal/db/writer.go`, `cmd/parser/main.go`, `internal/db/writer_test.go`.

**Do.**

1. `WriteGraph` gains an `Incremental bool` option. Off ⇒ today's behaviour exactly, so a first
   parse and a hand-run `--write` are unchanged.
2. Inside the existing transaction, after `upsertFiles` — which must still run for every file, so
   new files get ids — read the stored hashes, diff, and build `writeSet` by the rule above.
3. Pass `writeSet`'s ids to `deleteFunctions`. It already takes a file-id list, so this is the seam
   and needs no new SQL shape.
4. Filter `insertFunctions` and `insertEdges` to `writeSet`.
5. Delete `files` rows, and cascade, for paths in the database but absent from the walk. Nothing
   prunes today, so a file deleted upstream keeps its functions forever.
6. A `--incremental` flag on the parser, off by default.

**Done when.** A test that writes a two-file fixture, edits only the callee's file, re-writes
incrementally, and asserts: the caller's edge still exists and still points at a live function; the
caller's function rows kept their ids; and the resulting row counts match a from-scratch full write
of the same tree. The last assertion is the one that catches everything. —
`TestWriteGraph_IncrementalKeepsCrossFileEdges`, `_IncrementalMatchesFullWrite`,
`_IncrementalPrunesDeletedFiles`, all passing. The first was checked by neutering both caller
expansions and watching it fail: the edge count drops to zero, which is the bug it exists to catch.

**Watch for.**

- `edges` has **no unique constraint**. Duplicate protection is only the cascade delete — insert
  edges for a file whose functions you did not delete and they silently double.
- `edges_callee_consistency` forbids a null callee on a confident edge, so an edge cannot be parked
  as "relink later" without downgrading it to `unresolved`. Do not park edges; rewrite the caller.
- A file whose own bytes are unchanged but whose callee moved still needs rewriting. That is what
  clauses two and three of the write set are for.

---

## D2 — Queue and worker  `[x]`

**Why.** Removes the ceiling `register.ts` already marks with a `ponytail:` comment.

**Where.** `apps/api/src/queue/` (new), `apps/api/src/redis.ts`, `apps/api/package.json`.

**Do.**

1. Add `bullmq`, on its own connection with `maxRetriesPerRequest: null`. `redis.ts` already
   reserves exactly this and explains why it must not go on the request path.
2. `queue/parse.ts` — the queue, named from `env.QUEUE_NAME` (declared and set in CI, read by
   nothing today), plus `enqueueParse(repoId)`.
3. `queue/worker.ts` — a `Worker` with a concurrency cap whose processor is today's `runParser`,
   unchanged apart from the incremental flag.
4. **R12 and R13 both fall out of `jobId`.** `jobId = repo:<id>` makes BullMQ ignore a duplicate
   while one is waiting or active: no Redlock, no debounce timer.
5. Close the gap that leaves — a push arriving *while* a parse runs is dropped, because the job is
   active. Set a `dirty:<repoId>` key when `add()` collapses onto a live job, and re-enqueue once on
   completion if it is set.
6. A separate worker entrypoint, not the Fastify process. A CPU-heavy parse does not belong on the
   request event loop.

**Done when.** Two enqueues for one repository run the parser once. An enqueue during a run causes
exactly one follow-up run. Killing the worker mid-job leaves the repository re-parseable. —
`src/queue/parse.test.ts`, seven tests, skipping as a group when Redis is unreachable the way the Go
integration tests skip without Postgres.

**What it turned up.** `pnpm install` now fails outright until the project records a decision about
BullMQ's optional native msgpack accelerator. Declined in `pnpm-workspace.yaml`: it compiles at
install time, which is a build script nobody here has read, and BullMQ falls back to the JavaScript
encoder without it.

**Watch for.** Two Redis connections exist now and `app.ts`'s `onClose` closes one. The worker must
close its own or vitest hangs — `auth/routes.test.ts` has the existing pattern for that class of bug.

---

## D3 — Registration enqueues, and the UI stops blocking  `[x]`

**Why.** The route returning only when parsing finishes *is* the ceiling. This also closes the dead
end the 3b gate found: charting a repository left the sidebar on "Nothing charted", because nothing
selected it.

**Where.** `apps/api/src/routes/repos.ts`, `repos/register.ts`, migration `0004`,
`packages/shared/src/{schema,types}.ts`, `apps/web/src/components/RepoPicker.tsx`, `lib/api.ts`.

**Do.**

1. Migration `0004`: `repos.parse_status TEXT NOT NULL DEFAULT 'ready'` (`queued` / `parsing` /
   `ready` / `failed`) and `repos.parse_error TEXT`. Default `ready` so existing rows stay correct.
   Mirror in Drizzle and in the shared types.
2. The route inserts `queued` and returns **202** with the row. The worker moves it through
   `parsing` → `ready` / `failed`, writing `parse_error` from `failureReason`, which already reduces
   the parser's zap JSON to one sentence.
3. `GET /api/repos` returns the status; the client polls with a `refetchInterval` that is live only
   while some repository is non-terminal.
4. `RepoPicker` closes on 202 and **selects the new repository**. A `failed` row shows its reason in
   the existing `break-words` error style.

**Done when.** Charting returns in well under a second, the dialog closes, the new repository is
selected, and the tree fills in when the parse lands — with no reload. A repository that fails to
clone shows one sentence naming it and why. — `routes/repos.test.ts`, fifteen tests, including one
that asserts the row is written *before* the job is queued and one that asserts the request does not
wait on a parse.

**What it turned up.** The tree is cached with `staleTime: Infinity`, which was correct while the
only way to re-parse was to register again. A webhook re-parse replaces the graph under a cache with
no reason to suspect it, so the transition into `ready` now invalidates that repository's tree. And
the tree query is disabled while a parse is queued or running: left enabled it returns an empty tree
and the sidebar says the repository has no files, which is a different claim from "not yet".

**Watch for.** `routes/graph.test.ts` keeps a `GATED` list of every `/api` route; keep it current.
Do not let the poll run forever — `failed` is terminal, and a skeleton that never resolves is worse
than a spinner (`docs/UI_GUIDE.md` §3.3).

---

## D4 — The webhook  `[x]`

**Why.** FR-9, and the only reason the queue exists.

**Where.** `apps/api/src/routes/webhook.ts` (new), `apps/api/src/app.ts`.

**Do.**

1. **Raw body first.** Nothing in `apps/api` handles a raw body today — the bytes are parsed and
   discarded before a handler sees them, so HMAC has nothing to hash. Use Fastify's own
   `addContentTypeParser("application/json", { parseAs: "buffer" })` inside the webhook's own
   encapsulated scope. No new dependency, and the encapsulation keeps the raw parser off every other
   route.
2. Verify `x-hub-signature-256` with `crypto.timingSafeEqual` against `env.GITHUB_WEBHOOK_SECRET`
   — declared, set in CI, read by nothing yet.
3. Replay window: `SET webhook:<x-github-delivery> NX EX <window>`. A delivery id already seen is a
   200 with no work — never a 4xx, or GitHub disables the hook.
4. Per-repo throttle through `@fastify/rate-limit`'s route-level `config.rateLimit` with a
   `keyGenerator` on the repository. Already a dependency; the global limiter stays.
5. **Outside the session gate** — GitHub sends no cookie. Register it as a sibling of
   `registerAuth`, and add it to the `OPEN` list in `routes/graph.test.ts`.
6. `push` events only. Map the repository by canonical URL through the existing `normaliseRepoUrl`;
   an unknown repository is a 200 and no job.

**Done when.** A signed request enqueues one job; a tampered body is 401; a replayed delivery id is
200 and enqueues nothing; a flood for one repository is throttled. — `routes/webhook.test.ts`,
twelve tests against `buildApp`, no tunnel needed.

**What it turned up.** Two things, both found by trying to break the tests rather than by reading
the code.

The throttle keyed on the repository read out of the body, and **never throttled**: the limiter runs
`onRequest`, before the body is parsed, so the key was `undefined` for every request and each one
got its own bucket. It keys on `x-github-hook-id` now — a header, available that early, and stable
per configured webhook.

The byte-exactness test was worthless as first written. Deleting the raw-body parser and
re-serialising `req.body` still passed, because a compact JSON fixture round-trips through
`JSON.stringify` unchanged. A pretty-printed body does not, and with one the test fails under
exactly that mutation — which is what makes the raw parser provably load-bearing rather than
merely commented as such.

**Watch for.** The signature covers the **exact bytes**, so anything that re-serialises before the
check breaks it in a way that looks like a wrong secret. Length-check before `timingSafeEqual`; it
throws on mismatched lengths.

---

## D5 — Hardening  `[x]`

**Why.** R30, R31 and R14's disk half have each been deferred once already.

**Where.** `apps/api/src/auth/routes.ts`, `src/test-helpers.ts`, `src/redis.ts`,
`apps/web/src/components/LoginScreen.tsx`, `services/parser/internal/clone/clone.go`,
`cmd/parser/main.go`, `DEVELOPMENT.md`.

**Do.**

1. **Delete `/auth/dev-login` and `DEV_USER`.** Every route test gets its cookie from
   `devLogin(app)`, so that helper's body becomes a direct `createSession` call — tests get a
   session without the route existing. Drop the sign-in screen's button and fix `DEVELOPMENT.md`,
   which currently tells the reader to use it.
2. **R31 — Redis timeouts.** `new Redis(url)` is constructed with no options, so ioredis retries
   forever and a request touching Redis never settles: sign-in sits on "Signing in…" with no error,
   ever. Add `connectTimeout`, `commandTimeout` and a finite `maxRetriesPerRequest`, and answer
   **503**. The queue connection keeps `maxRetriesPerRequest: null` — that one is required.
3. **L39 / R14 disk half.** The clone's `os.MkdirTemp` is never removed, so every parse leaks a
   checkout. `Prepare` returns a cleanup func — a no-op for a local path — and `main.go` defers it
   after the write. Not a `defer` inside `Prepare`: the directory has to outlive the call.

**Done when.** `grep -r dev-login apps/src` is empty and every API test still passes. Stopping Redis
makes sign-in fail with a 503 within seconds instead of hanging. Two consecutive parses leave no
`funcatlas-clone-*` directory behind. — three tests in `internal/clone`, and the dev-login test
inverted: it now asserts the route answers 404.

**What it turned up.** `logger.Fatal` calls `os.Exit`, which skips every deferred call — so the
cleanup would have run on success and never on failure, which is the path that repeats when a
repository cannot be reached. `main` returns an error now. And `make dev` had to learn to start the
worker: without it a registered repository sits at `queued` forever, which reads as a hung interface
rather than a process nobody started.

**Watch for.** `auth/routes.test.ts`'s `vi.stubEnv` + `vi.resetModules()` + re-import pattern — the
rebuilt module graph carries its own Redis and must be quit or vitest hangs.

---

## D6 — The tests this phase cannot close without  `[x]`

**Why.** Most of these are failure modes that stay invisible until production.

**Do.**

1. Incremental write and full write produce **identical database state** for the same tree. The
   single most valuable test in the phase.
2. A cross-file edge survives a re-parse of only the callee's file — the D1 cascade trap.
3. A file deleted upstream loses its rows.
4. Webhook: valid, tampered, replayed, flooded.
5. `jobId` collapsing: two enqueues ⇒ one run; enqueue-during-run ⇒ exactly one follow-up.
6. The parser still runs with `--network none`. `docker-compose.yml` already runs it that way and
   this phase must not quietly regress it. — `make parser-isolated`, a new target that builds the
   image and parses a fixture with no network, read-only rootfs and every capability dropped:
   6 files, 13 functions, 14 edges, all three tiers.

**Five of the six were already covered** by the chunk that introduced them — D1 for the write, D2 for
the job ids, D4 for the webhook. Only the isolation check needed anything new, and it needed a
Makefile target rather than a test, because what is being asserted is a container's configuration.

---

## D7 — Docs  `[x]`

**Do.**

1. `PLAN.md` — the Phase 4 result, and **amend the exit test**. "Without a full re-parse" becomes
   "without rewriting unchanged rows", with the resolver reason recorded. A phase must not close
   against a test its own design decision made unpassable; 3b shipped exactly that contradiction and
   it had to be fixed at the gate.
2. `docs/SECURITY.md` — tick L34 and L39, and the three already true (L35, L36, L38). Record L32 and
   L37 as deferred **with reasons**, not left blank.
3. `docs/RISKS.md` — close R5, R12, R13, R14, R27, R30, R31. Add: whole-repo resolution forcing a
   full re-parse; content-hash change detection; the dropped-push-during-parse gap and how `dirty`
   closes it.
4. `docs/DATA_MODEL.md` says scoping the rewrite to changed files is Phase 4 work — make it describe
   what shipped. `docs/ARCHITECTURE.md` says the parser worker talks only through the queue and
   Postgres; that is now wrong and must say so.
5. `CLAUDE.md` status and known gaps.
6. **R34 stays open** and moves to Phase 5: `store/ui.ts` restores file and branch ids through
   `zustand/persist`, and this is the first phase that can delete the rows behind them.

---

## D8 — Exit gate  `[ ]`

**Done when — the phase exit test.** Against a real repository:

- register a repository; the request returns immediately and the row appears `queued`;
- the worker parses it and the tree fills in without a reload;
- push a commit to a fixture repository; the graph updates, and only the changed files' rows are
  rewritten — check `functions.id` stability on untouched files;
- a replayed delivery is rejected, and a flood is throttled;
- the parser still runs with no network egress;
- `make test`, `make lint`, `make typecheck` and `make go-vet` all clean.

**R5** — GitHub cannot reach localhost, so the live half needs `smee.io`. The four webhook unit
tests cover correctness without a tunnel.
