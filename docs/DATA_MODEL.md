# Data Model

The Postgres schema. This document describes what is **currently applied** —
`services/parser/migrations/0001_init.up.sql` — plus a pending change at the bottom that Phase 2
needs. The migration directory is the single source of truth; `packages/shared/src/schema.ts` is a
Drizzle description of the same tables for the API to read through, and the two must agree.

```sql
-- A registered repository
CREATE TABLE repos (
    id                  SERIAL PRIMARY KEY,
    github_url          TEXT NOT NULL,
    default_branch      TEXT NOT NULL,
    last_synced_commit  TEXT,
    created_at          TIMESTAMP DEFAULT now()
);

-- One row per file in the repo
CREATE TABLE files (
    id          SERIAL PRIMARY KEY,
    repo_id     INTEGER REFERENCES repos(id),
    path        TEXT NOT NULL,       -- repo-relative, e.g. src/services/auth.ts
    language    TEXT NOT NULL,       -- 'typescript' (only language in the MVP)
    UNIQUE (repo_id, path)
);

-- One row per function/method definition
CREATE TABLE functions (
    id              SERIAL PRIMARY KEY,
    file_id         INTEGER REFERENCES files(id) ON DELETE CASCADE,
    package_path    TEXT NOT NULL,          -- file's directory relative to repo root; '' at root
    name            TEXT NOT NULL,          -- bare name, e.g. sync
    qualified_name  TEXT NOT NULL,          -- dot-joined scope path, e.g. Repo.sync
    overload_index  SMALLINT NOT NULL DEFAULT 0,  -- disambiguates same-named funcs in one file
    start_line      INTEGER NOT NULL,
    end_line        INTEGER NOT NULL,
    source_blob_ref TEXT,                  -- the function's source text (plain column for MVP)
    parsed_commit   TEXT,                  -- commit SHA this row was parsed from (incremental diff)
    updated_at      TIMESTAMP DEFAULT now(),
    UNIQUE (file_id, qualified_name, overload_index)
);

CREATE INDEX idx_functions_qualified ON functions (qualified_name);
CREATE INDEX idx_functions_pkg_name ON functions (package_path, name);

-- Calls/relations between functions
CREATE TABLE edges (
    id                    SERIAL PRIMARY KEY,
    caller_function_id    INTEGER REFERENCES functions(id) ON DELETE CASCADE,
    callee_function_id    INTEGER REFERENCES functions(id) ON DELETE CASCADE,
    resolution_confidence TEXT NOT NULL   -- 'exact' | 'name_match' | 'unresolved'
        CHECK (resolution_confidence IN ('exact', 'name_match', 'unresolved')),
    parsed_commit         TEXT,           -- commit SHA this edge was derived from
    updated_at            TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_edges_caller ON edges (caller_function_id);
CREATE INDEX idx_edges_callee ON edges (callee_function_id);
```

## Pending change — Phase 2, `TASKLIST.md` C1

The schema above has a hole: **it cannot store an unresolved edge.** An edge records
`callee_function_id`, so when a call resolves to nothing there is nothing to point at, the column is
null, and the callee's name is lost. The row then says only "something unresolved happened here",
which is not useful to anyone. Two of the three confidence values are effectively unstorable.

Migration `0002` fixes it:

```sql
ALTER TABLE edges ADD COLUMN callee_name TEXT NOT NULL DEFAULT '';  -- name as written at the call site
ALTER TABLE edges ADD COLUMN call_line   INTEGER;                   -- so the UI can jump to the call
-- callee_function_id stays nullable; it is null exactly when confidence is 'unresolved'

-- and, separately: files.repo_id gains ON DELETE CASCADE and NOT NULL,
-- so deleting a repo cleans up under it instead of erroring.
```

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
