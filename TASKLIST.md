# Phase 2 — Storage and Resolution

The live task list. Phase 2 turns the intermediate representation the parser already produces into
persisted, confidence-tagged edges in Postgres, and gives the API a way to traverse them.

**Branch:** `phase-2/storage-and-resolution`
**Reference:** [`PLAN.md`](PLAN.md) Phase 2 · [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) ·
[`docs/PARSING_STRATEGY.md`](docs/PARSING_STRATEGY.md)

## How to work through this

Claude implements; you review at the phase gate. One chunk at a time, top to bottom — the order is
load-bearing, C0 unblocks C4 and C1 unblocks C5. Each chunk lists:

- **Why** — the reason it exists, so it can be pushed back on if the reason is wrong.
- **Where** — the files it touches.
- **Do** — the work, broken into steps.
- **Done when** — the objective test. Not "the code compiles".
- **Watch for** — the specific bugs to check for before the chunk is committed.

Write the test in the same commit as the code it tests. Commit one chunk at a time with an
imperative message. `[ ]` todo · `[~]` in progress · `[x]` done.

## What this phase actually teaches

Worth knowing up front, because each of these is a transferable idea wearing a funcatlas costume.
If a chunk feels like busywork, it's probably because the underlying idea hasn't clicked yet — stop
and ask rather than pushing through.

| Chunks | Concept | Where else you'll meet it |
|---|---|---|
| C1, C5 | Referential integrity and cascade semantics — letting the database enforce correctness instead of application code remembering to | Every relational schema you ever design |
| C3 | Transactional bulk writes — why a half-written graph is worse than none, and why per-row inserts don't scale | Any ETL, importer, or sync job |
| C4 | Symbol resolution and scoping — how a name becomes a reference, and what to do when it can't | Compilers, linters, language servers, import systems |
| C6 | Recursive queries and cycle detection — traversing a graph in SQL without hanging | Org charts, dependency trees, permission hierarchies, category nesting |

C4 is the one worth slowing down for. Resolution is the core of how every compiler and IDE works,
and doing it by hand once teaches more than reading about it ten times.

---

## C0 — Complete the IR so resolution is possible  `[x]`

**Why.** Phase 1 emits an IR that's correct to *read* but not sufficient to *resolve*. Three gaps
block the resolver, and no amount of clever resolver code works around them:

1. `ir.CallSite` has no file. The first two resolution rules are "is the callee defined in this
   same file?" and "does this file import it?" — both need to know which file the call came from.
   Run `make go-run REPO=./services/parser/testdata/golden` and you'll see calls from `calls.ts`
   and `repo.ts` in one flat list with no way to tell them apart.
2. Method calls lose their receiver. `Repo.sync()` is recorded as callee `sync` with `Repo`
   discarded, so the resolver cannot distinguish it from `anythingElse.sync()`.
3. Import symbols are collected by walking the statement for every `identifier` node. For
   `import { a as b } from "x"` that yields **both** `a` and `b`. The resolver matches call sites
   against *local* names, so `b` is the correct answer and `a` is noise that will cause false matches.

**Where.** `services/parser/internal/ir/ir.go`, `services/parser/internal/ts/extract.go`,
`services/parser/queries/typescript.scm`, `services/parser/internal/ts/extract_test.go`

**Do.**

1. Add `FileID int` to `ir.CallSite` and populate it — `fileID` is already in scope in the extract
   loop, it just isn't being copied onto the call.
2. Add `CalleeObject string` to `ir.CallSite`. For a `member_expression` callee, capture the object
   as well as the property; leave it empty for a plain identifier call. This needs a second capture
   in the `.scm` — something like `object: (identifier) @call.object` alongside the existing
   `@function.call`.
3. Rewrite import symbol extraction to collect **local binding names only**, and record which kind
   of import each is. Walk the `import_clause` properly rather than grabbing every identifier:
   - `import def from "m"` → local `def`, kind default
   - `import { a } from "m"` → local `a`, kind named
   - `import { a as b } from "m"` → local `b`, kind named, original `a`
   - `import * as ns from "m"` → local `ns`, kind namespace
   - `import "m"` → no locals, kind side-effect

   A small `ir.ImportedSymbol{Local, Original, Kind string}` is cleaner than three parallel slices.
4. While you're in `extract.go`, two cleanups: `strings.Split(string(src), "\n")` runs *inside* the
   per-function loop, re-splitting the whole file for every function found — hoist it above the
   loop. And the nil-tree check appears twice (once before the file is appended, once after);
   delete the second.

**Done when.** A test over `testdata/golden` asserts: every `CallSite` carries the `FileID` of the
file it was found in; `Repo.sync()` yields `CalleeObject: "Repo", CalleeName: "sync"`; and
`import { a as b } from "x"` yields exactly one symbol whose local name is `b`.

**Watch for.** Populating `FileID` after `graph.Files` has already grown (off by one). Capturing the
property of a *chained* call `a.b.c()` — decide what `CalleeObject` means there and write it down.
Breaking the existing golden JSON without regenerating it.

---

## C1 — Migration 0002: make an unresolved edge storable  `[x]`

**Why.** The `edges` table cannot currently represent two of its own three confidence values. An
edge stores `callee_function_id`; if a call is `unresolved` there is no function to point at, so the
column is null and the callee's *name* is lost entirely. An unresolved edge that doesn't record what
it failed to resolve is not a data point, it's a blank row. Same for `name_match` where the target
is ambiguous. This has to be fixed before the resolver writes anything, because the resolver's whole
output depends on it.

Two smaller things ride along: there is no down migration at all, so `make down` fails and you can
never roll back a mistake; and `files.repo_id` has no `ON DELETE CASCADE`, so deleting a repo will
either error or strand every file row under it.

**Where.** `services/parser/migrations/` (new `0002_*.up.sql` and `.down.sql`, plus a backfilled
`0001_init.down.sql`), `docs/DATA_MODEL.md`

**Do.**

1. Write `0001_init.down.sql` — drop the four tables in reverse dependency order. Never edit
   `0001_init.up.sql`; it's already applied.
2. Write `0002_edge_callee_name.up.sql`:
   - `ALTER TABLE edges ALTER COLUMN callee_function_id DROP NOT NULL` if it is not null already,
     and confirm it is nullable.
   - `ADD COLUMN callee_name TEXT NOT NULL DEFAULT ''` — the name as written at the call site.
   - `ADD COLUMN call_line INTEGER` — so the UI can jump to the call, not just the function.
   - `ALTER TABLE files DROP CONSTRAINT files_repo_id_fkey`, re-add it with
     `ON DELETE CASCADE`, and make `repo_id` `NOT NULL`.
3. Write the matching `0002_*.down.sql`.
4. Update `docs/DATA_MODEL.md` to match, including a note on why an edge keeps the callee name.

**Done when.** `migrate up` → `migrate down` → `migrate up` runs clean against a fresh Postgres, and
`\d edges` in `psql` shows a nullable `callee_function_id` alongside `callee_name` and `call_line`.

**Watch for.** Postgres names the constraint `files_repo_id_fkey` by default, but verify with `\d files`
rather than assuming. A `NOT NULL DEFAULT ''` on an existing table rewrites it — fine at this size,
worth knowing. Down migrations that drop data silently.

---

## C2 — Close the schema drift in `packages/shared`  `[ ]`

**Why.** The Drizzle schema and the SQL migration are supposed to be the same schema described
twice, and right now they disagree in three places. Each disagreement is a runtime error waiting
for whichever code path hits it first:

- `resolutionConfidence` is declared as a Drizzle `pgEnum`, but the migration creates the column as
  `TEXT` with a `CHECK` constraint. There is no Postgres enum type named `resolution_confidence` in
  the database at all.
- `edges.calleeFunctionId` is `.notNull()` in Drizzle; the SQL allows null, and after C1 it *must*
  allow null.
- `functions.fileId` is `.notNull()` in Drizzle; the SQL column is nullable.

**Where.** `packages/shared/src/schema.ts`, `packages/shared/src/types.ts`

**Do.**

1. Replace the `pgEnum` with `text("resolution_confidence").$type<ResolutionConfidence>().notNull()`,
   importing the union type that already exists in `types.ts`. The `CHECK` constraint in the database
   stays as the actual enforcement — Drizzle just needs to describe it accurately.
2. Make `calleeFunctionId` nullable and add `calleeName` and `callLine` from C1.
3. Reconcile the `notNull` mismatches on `fileId` and `repoId` — pick whichever the SQL says, or
   change the SQL in C1 and make both say the same thing. Just don't leave them disagreeing.
4. Regenerate or hand-update the inferred row types and make sure `pnpm -r build` still passes.

**Done when.** `pnpm -r build` passes, and a scratch script that selects one row from each table
through Drizzle against the real migrated database returns without a type or runtime error.

**Watch for.** "It compiles" is not the test here — TypeScript will happily agree with a schema that
does not match the database. Actually run a query.

---

## C3 — Parser writes the graph to Postgres  `[ ]`

**Why.** `db.Writer.WriteGraph` is a stub that returns nil. This is the chunk that makes the parser
stop being a JSON printer.

**Where.** `services/parser/internal/db/writer.go`, `services/parser/cmd/parser/main.go`

**Do.**

1. Take a repo identifier and a commit SHA as inputs. Upsert the `repos` row and get its id.
2. Insert files, then functions, inside a **single transaction** — a half-written graph is worse
   than no graph, because the API cannot tell the difference.
3. Batch the function inserts. Use `pgx.CopyFrom`, or multi-row `INSERT` in chunks of a few hundred.
   Do not insert one row per round trip; the 300-file target in NFR-1 will not survive it.
4. Store `ir.Function.Source` into `source_blob_ref`. The data model already permits a plain text
   column at this stage — no object storage.
5. Return a `map[qualifiedNameKey]int64` of the inserted function ids, because C4 needs to turn
   resolved calls into edges pointing at real primary keys.
6. Wire it into `main.go` behind a `--write` flag so `--format json` still works for inspection.
   Drop the `_ = db.NewWriter` placeholder line while you're there.

**Done when.** `make go-run REPO=./services/parser/testdata/golden --write` populates a local
Postgres, row counts in `files` and `functions` match the counts `--format summary` reports, and
running it a second time neither duplicates rows nor violates the unique constraint.

**Watch for.** Forgetting to roll back on a mid-transaction error. `UNIQUE (file_id, qualified_name,
overload_index)` violations from the second run — decide up front whether re-running is an upsert or
a delete-and-reinsert, and be consistent with C5. Holding one transaction open for a very large repo.

---

## C4 — The resolver  `[ ]`

**Why.** This is the chunk the whole product rests on. Everything before it is plumbing; this is
where a raw call site becomes a claim about the code, and where the honesty commitment in
[`PRD.md`](PRD.md#8-the-design-commitment) is either kept or quietly broken.

**Where.** `services/parser/internal/resolver/resolver.go` (+ tests), `services/parser/internal/ir/ir.go`

**Do.**

1. Change the signature. `Resolve` currently returns `map[ir.CallSite]ResolutionConfidence`, which
   has two problems: it never says *what the call resolved to*, and keying a map by the struct
   silently collapses two identical calls on the same line into one edge. Return a slice instead —
   add an `ir.Edge{CallerFuncIdx, CalleeFuncIdx int, CalleeName string, Line int, Confidence string}`
   where an unresolved callee is `-1`.
2. Build two in-memory indexes up front, once:
   - functions by file: `map[fileID]map[qualifiedName][]funcIdx`
   - imports by file: `map[fileID]map[localName]importSource`

   The entire repo graph is already in memory. Do not query the database per call site — that's the
   O(N²) trap the old plan warned about, and the fix is to not go to the database at all.
3. Apply the rules in order, per call site:
   - **Same file.** A function in this file whose qualified name matches → `exact`.
   - **Imported symbol.** The callee's local name is in this file's imports → follow to the source
     module, find the definition → `exact`. If the module resolves outside the repo (`react`,
     `node:fs`) → `unresolved`; that's an honest answer, not a failure.
   - **Package fallback.** Exactly one function with that name in the same `package_path` →
     `name_match`. Exactly one in the whole repo → `name_match`.
   - **Otherwise** → `unresolved`, keeping `CalleeName` so the edge still says something.
4. Two rules on top:
   - If a match is ambiguous — more than one candidate — the answer is `unresolved`, never a
     coin flip.
   - If the matched `qualified_name` has more than one `overload_index` in that file, the answer is
     `unresolved`. Name and scope matching cannot pick an overload, so it must not pretend to.
5. Use `CalleeObject` from C0: when it's set and names an imported namespace or a local class, that
   narrows the search. When it's set and you can't identify it, that's `unresolved`.

**Done when.** A table-driven test over a fixture with a hand-written expected confidence for every
call passes — including at least one `exact` same-file, one `exact` via import, one `name_match`
package fallback, one `unresolved` external module, and one `unresolved` overload.

**Watch for.** Resolving to a function in a file that doesn't export it. Treating a bare `foo()` and
`obj.foo()` as the same callee. Silently picking the first candidate when there are several — that's
the exact failure this product exists to avoid. Recursion (a function calling itself) producing a
self-edge you didn't expect.

---

## C5 — Edges, and re-parsing without orphans  `[ ]`

**Why.** NFR-3 says a re-parse after a rename leaves no orphan edges. That property has to be
designed in, because the naive version — insert everything again — produces a graph that grows a
duplicate set of edges on every push, and Phase 4's webhook loop will run this constantly.

**Where.** `services/parser/internal/db/writer.go`, a new integration test

**Do.**

1. Write the resolved edges from C4, mapping function indexes to the real ids returned by C3.
   Unresolved edges get a null `callee_function_id` and a populated `callee_name`.
2. Implement re-parse as **delete-then-reinsert scoped to the files that changed**: within the
   transaction, delete the `functions` rows for those files (the `ON DELETE CASCADE` on `edges`
   takes their edges with them), then insert the new ones. Do not delete the `files` rows — their
   ids are referenced elsewhere.
3. Set `parsed_commit` on every row you write, so Phase 4 can diff.
4. The subtle case, and the one the test must cover: a function is deleted from file A, but file B
   still calls it. B's edge is cascade-deleted along with A's function — correct — but B was not
   re-parsed, so nothing re-creates that edge as `unresolved`. Decide how you handle this and write
   the decision down. Re-resolving every file that imports a changed file is the straightforward
   answer.

**Done when.** An integration test parses a fixture, renames a function in it, re-parses, and asserts:
the old function row is gone, no edge points at a non-existent function, and callers of the renamed
function now hold `unresolved` edges carrying the old name.

**Watch for.** Cascade deletes taking more than you meant. Deleting outside the transaction. Assuming
file ids are stable when a file is deleted and recreated.

---

## C6 — N-hop traversal in the API  `[ ]`

**Why.** "What's the blast radius of changing this function" is persona P2's entire reason to use
this tool, and it's the one query a plain `SELECT` cannot answer.

**Where.** `apps/api/src/graph/` (new), `apps/api/src/routes/graph.ts`

**Do.**

1. Write a depth-bounded recursive CTE that walks `edges` from a starting `function_id` and returns
   each reachable function with the depth it was found at.
2. Bound the depth with a **parameter**, defaulting to 5, capped server-side. An unbounded recursive
   CTE over a cyclic graph does not return.
3. Guard against cycles explicitly — mutual recursion is normal in real code. Carry the visited path
   in an array column and filter, or use `UNION` rather than `UNION ALL` and accept the dedupe.
4. Parameterize everything. This is raw SQL through Drizzle's `sql` template; string-concatenating a
   depth or an id into it is a SQL injection hole.
5. Replace the `/api/functions/:fnId/edges` 501 stub with a real handler. Leave the rest stubbed —
   they're Phase 3.

**Done when.** A Vitest test against a real Postgres (testcontainers, or the compose instance) inserts
a small known graph *including a cycle*, and asserts the traversal returns the right functions at the
right depths and terminates.

**Watch for.** A CTE that returns rows but never terminates on the cyclic fixture — make sure the
test actually has a cycle, or it proves nothing. Depth off by one (is the start node depth 0 or 1?).
Forgetting that an edge with a null callee has nothing to traverse to.

---

## C7 — Sync the docs to reality  `[ ]`

**Why.** Docs that lie are worse than no docs, and this is the chunk where the ones you just
invalidated get corrected — while you still remember why.

**Where.** `docs/DATA_MODEL.md`, `docs/PARSING_STRATEGY.md`, `docs/RISKS.md`, `CLAUDE.md`, `PLAN.md`

**Do.** Record the new `edges` columns and the re-parse strategy in the data model. Write the actual
resolution algorithm you built into the parsing strategy, including the rules where it chose
`unresolved` over a guess. Flip R6, R7, and R8 to DECIDED in the risk list with one line each on what
was decided. Mark Phase 2 done in `CLAUDE.md` and `PLAN.md`.

**Done when.** No document describes behaviour that the code does not have.

---

## Exit gate

Phase 2 is finished when all of these hold:

- [x] The IR carries file attribution, call receivers, and correct import locals (C0).
- [x] Migrations roll forward and back cleanly, and an unresolved edge is storable (C1).
- [ ] The Drizzle schema and the SQL migration describe the same database (C2).
- [ ] The parser writes a complete graph transactionally, and re-running is safe (C3).
- [ ] Every call site gets a confidence tag, and ambiguity resolves to `unresolved` (C4).
- [ ] A re-parse after a rename leaves zero orphan edges (C5).
- [ ] The API answers a depth-bounded N-hop traversal over a cyclic graph (C6).
- [ ] `make go-test`, `make go-vet`, and `pnpm -r build` are green, and CI passes (C7).

## Conventions

- Never edit a migration that has been applied. Add a numbered one.
- The Go parser keeps its own IR types. It cannot import `packages/shared`, and it should not try.
- Tests go in the commit with the code they test.
- One concern per commit, imperative message.
