# Data Model

Postgres schema for v1. Graph metadata (functions, edges) is kept separate from raw source text so traversal queries stay cheap.

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
    path        TEXT NOT NULL,       -- e.g. services/auth.py
    language    TEXT NOT NULL,       -- e.g. python, typescript
    UNIQUE (repo_id, path)
);

-- One row per function/method definition
CREATE TABLE functions (
    id              SERIAL PRIMARY KEY,
    file_id         INTEGER REFERENCES files(id),
    package_path    TEXT NOT NULL,          -- e.g. services.auth
    name            TEXT NOT NULL,          -- e.g. getUser
    qualified_name  TEXT NOT NULL,          -- package_path + "::" + name — UNIQUE KEY
    start_line      INTEGER NOT NULL,
    end_line        INTEGER NOT NULL,
    source_blob_ref TEXT,                  -- pointer to raw code storage
    UNIQUE (file_id, qualified_name)
);

-- Calls/relations between functions
CREATE TABLE edges (
    id                    SERIAL PRIMARY KEY,
    caller_function_id    INTEGER REFERENCES functions(id),
    callee_function_id    INTEGER REFERENCES functions(id),
    resolution_confidence TEXT NOT NULL   -- 'exact' | 'name_match' | 'unresolved'
        CHECK (resolution_confidence IN ('exact', 'name_match', 'unresolved'))
);

CREATE INDEX idx_edges_caller ON edges (caller_function_id);
CREATE INDEX idx_edges_callee ON edges (callee_function_id);
CREATE INDEX idx_functions_file ON functions (file_id);
```

## Design notes

- **`qualified_name` is the uniqueness guarantee.** Five functions named `getUser` in five different files/packages are five different rows — uniqueness comes from `package_path + name`, not the bare name. This holds regardless of parsing method.
- **`resolution_confidence` is mandatory, not optional.** The UI should visually distinguish `exact` edges (LSP-resolved) from `name_match` edges (best-guess) from `unresolved` (couldn't determine) — never present a guess as a certainty.
- **`source_blob_ref`** keeps large text out of the `functions` table's hot path. Start with a simple text column if the project is small; move to object storage (S3-compatible) only if row size becomes a real problem.
- **Common queries this schema needs to support well:**
  - All functions in a file → `SELECT * FROM functions WHERE file_id = ?`
  - All functions called by a given function → join `edges` on `caller_function_id`
  - All callers of a given function (who depends on this?) → join `edges` on `callee_function_id`
  - N-hop traversal (blast radius) → recursive CTE over `edges`, bounded by depth
- **Revisit Neo4j only if:** N-hop traversal queries become slow at real scale, or you need graph algorithms (PageRank/centrality) that are painful to express in SQL. Not needed for v1.
