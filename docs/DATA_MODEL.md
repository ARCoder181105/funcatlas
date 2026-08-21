# Data Model

The Postgres schema as **currently applied**, through
`services/parser/migrations/0002_edge_callee_name.up.sql`. The migration directory is the single
source of truth; `packages/shared/src/schema.ts` is a Drizzle description of the same tables for the
API to read through, and the two must agree.

```sql
-- A registered repository
CREATE TABLE repos (
    id                  SERIAL PRIMARY KEY,
    github_url          TEXT NOT NULL UNIQUE,  -- the writer upserts on this
    default_branch      TEXT NOT NULL,
    last_synced_commit  TEXT,
    created_at          TIMESTAMP NOT NULL DEFAULT now(),
    -- Migration 0004. A repo row used to be proof a parse had finished, because
    -- the parser owned the insert. With the parse on a queue the API writes the
    -- row first, so the client needs to be told which state it is in.
    parse_status        TEXT NOT NULL DEFAULT 'ready',  -- queued|parsing|ready|failed
    parse_error         TEXT                            -- one sentence; null unless failed
);

-- One row per file in the repo
CREATE TABLE files (
    id          SERIAL PRIMARY KEY,
    repo_id     INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
    path        TEXT NOT NULL,       -- repo-relative, e.g. src/services/auth.ts
    language    TEXT NOT NULL,       -- 'typescript' (only language in the MVP)
    content_hash TEXT,               -- sha256 of the bytes; null = "changed" (migration 0003)
    UNIQUE (repo_id, path)           -- constraint name: files_repo_id_path_key
);

-- One row per function/method definition
CREATE TABLE functions (
    id              SERIAL PRIMARY KEY,
    file_id         INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    package_path    TEXT NOT NULL,          -- file's directory relative to repo root; '' at root
    name            TEXT NOT NULL,          -- bare name, e.g. sync
    qualified_name  TEXT NOT NULL,          -- dot-joined scope path, e.g. Repo.sync
    overload_index  SMALLINT NOT NULL DEFAULT 0,  -- disambiguates same-named funcs in one file
    start_line      INTEGER NOT NULL,
    end_line        INTEGER NOT NULL,
    source_blob_ref TEXT,                  -- the function's source text (plain column for MVP)
    parsed_commit   TEXT,                  -- commit SHA this row was parsed from (incremental diff)
    updated_at      TIMESTAMP NOT NULL DEFAULT now(),
    UNIQUE (file_id, qualified_name, overload_index)
);

CREATE INDEX idx_functions_qualified ON functions (qualified_name);
CREATE INDEX idx_functions_pkg_name ON functions (package_path, name);

-- Calls/relations between functions
CREATE TABLE edges (
    id                    SERIAL PRIMARY KEY,
    caller_function_id    INTEGER REFERENCES functions(id) ON DELETE CASCADE,
    callee_function_id    INTEGER REFERENCES functions(id) ON DELETE CASCADE,  -- null iff unresolved
    callee_name           TEXT NOT NULL DEFAULT '',  -- the name as written at the call site
    call_line             INTEGER,        -- the line the call is on, so the UI can jump to it
    resolution_confidence TEXT NOT NULL   -- 'exact' | 'name_match' | 'unresolved'
        CHECK (resolution_confidence IN ('exact', 'name_match', 'unresolved')),
    parsed_commit         TEXT,           -- commit SHA this edge was derived from
    updated_at            TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT edges_callee_consistency
        CHECK (callee_function_id IS NOT NULL OR resolution_confidence = 'unresolved')
);

CREATE INDEX idx_edges_caller ON edges (caller_function_id);
CREATE INDEX idx_edges_callee ON edges (callee_function_id);
```

## Why an edge keeps the callee's name

Before migration `0002` the `edges` table **could not store an unresolved edge.** It recorded only
`callee_function_id`, so a call that resolved to nothing left that column null with the callee's name
lost — a row saying "something unresolved happened here" and nothing more. Two of the three
confidence values were effectively unstorable, which made the confidence tiers in
[`../PRD.md`](../PRD.md#8-the-design-commitment) a promise the schema could not keep.

`callee_name` is populated on **every** edge, not only unresolved ones. On an `exact` edge it is
redundant with the target row, and that redundancy is deliberate: it is what lets a caller keep saying
something true after the function it pointed at is deleted, and it is what the canvas renders on a
dotted edge.

`edges_callee_consistency` makes "null exactly when unresolved" a database rule rather than a
convention the writer has to remember. A resolver bug that emits a confident edge pointing at nothing
now fails at write time instead of rendering as a confident line to nowhere.

`repos.github_url` is `UNIQUE` because the writer upserts a repo by URL, and `ON CONFLICT
(github_url)` needs a constraint to conflict against.

## How a re-parse avoids orphan edges

The writer is **delete-and-reinsert per file, never an upsert**. In one transaction it upserts the
repo and file rows, deletes the `functions` rows for every file it is about to write — `ON DELETE
CASCADE` takes their edges — and inserts the new ones. File rows are never deleted: their ids are
referenced elsewhere, and a file that reappears must keep the id it had.

That is what makes re-running safe. A second run cannot duplicate rows or violate
`(file_id, qualified_name, overload_index)`, because the previous rows are gone before the new ones
land. And a rename leaves no orphan: the caller is re-resolved along with everything else, so its
edge becomes `unresolved` carrying the name it can no longer find.

Function ids are obtained with chunked multi-row `INSERT ... RETURNING`, not `pgx.CopyFrom`, because
`CopyFrom` cannot `RETURNING` and the generated ids are exactly what the edges need. Edges do use
`CopyFrom`, where nothing comes back. Both map returned rows back **by key, not by row order**,
which is not guaranteed — least of all with `ON CONFLICT`.

Phase 2 rewrote the whole graph each run. **Phase 4 scopes the write** (`--incremental`), and the
shape of that scoping is not the obvious one.

`files.content_hash` is what a run diffs against — `git diff` cannot answer it, because a `--depth 1`
clone holds one commit and no history, and a local path has no remote at all.

Deleting a file's functions takes its edges through `ON DELETE CASCADE` **in both directions**,
including edges *into* it from files nobody edited. So functions are deleted only for files whose
contents actually moved, and **edges are deleted explicitly, by caller**. Doing it the other way
round makes each affected caller pull in its own callers, and theirs: a transitive closure over most
of the repository, for no benefit. The consequence worth knowing is that a file which merely *calls*
a changed file keeps its function row ids.

Note that `edges` has no uniqueness constraint. Duplicate protection is entirely the delete that
precedes the insert — write edges for a file whose functions you did not delete and they silently
double.

## Design notes

- **`(file_id, qualified_name, overload_index)` is the identity of a function.** Five functions
  named `getUser` in five different files are five different rows; the file id already separates
  them, so `qualified_name` carries only the in-file scope path. The resolver and the UI must treat
  `overload_index` as part of identity, not as decoration.
- **Overloading is handled rather than rejected.** Two functions sharing a qualified name in one
  file — a redeclaration in two conditional branches, say — would otherwise be a unique-constraint
  violation on insert. `overload_index` disambiguates them, assigned in a per-file post-pass sorted
  by `start_line` so it stays stable across re-parses.
- **`resolution_confidence` is mandatory.** `exact`, `name_match`, `unresolved`, enforced by a
  `CHECK` constraint. The UI renders each differently and never presents a guess as a certainty.
  When LSP resolution arrives it upgrades existing rows in place — no schema change needed.
- **`ON DELETE CASCADE` plus `parsed_commit` is what makes incremental re-parsing safe.** Deleting a
  function takes its edges with it, and `parsed_commit` lets a re-parse delete and reinsert only the
  rows for files that actually changed. Together they are the mechanism behind the no-orphan-edges
  guarantee in `../PRD.md` NFR-3.
- **`source_blob_ref` is a plain text column holding the function's source.** It keeps large text
  out of the traversal queries' way. Move it to object storage only when row size is measurably a
  problem, not before.
- **Queries this schema has to answer well:**

  | Question | Query |
  |---|---|
  | What's in this file? | `SELECT * FROM functions WHERE file_id = ?` |
  | What does this function call? | join `edges` on `caller_function_id` |
  | Who calls this function? | join `edges` on `callee_function_id` |
  | What's the blast radius? | depth-bounded recursive CTE over `edges` |

- **Revisit Neo4j only if** N-hop traversal is measurably slow at real scale, or you need graph
  algorithms like PageRank that are genuinely painful in SQL. Neither is true yet.
