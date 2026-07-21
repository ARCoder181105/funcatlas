-- Single source of schema (R10). Consumed by golang-migrate (parser write)
-- and Drizzle (api read). Mirrors docs/DATA_MODEL.md exactly.

CREATE TABLE IF NOT EXISTS repos (
    id                  SERIAL PRIMARY KEY,
    github_url          TEXT NOT NULL,
    default_branch      TEXT NOT NULL,
    last_synced_commit  TEXT,
    created_at          TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS files (
    id          SERIAL PRIMARY KEY,
    repo_id     INTEGER REFERENCES repos(id),
    path        TEXT NOT NULL,
    language    TEXT NOT NULL,
    UNIQUE (repo_id, path)
);

CREATE TABLE IF NOT EXISTS functions (
    id              SERIAL PRIMARY KEY,
    file_id         INTEGER REFERENCES files(id) ON DELETE CASCADE,
    package_path    TEXT NOT NULL,
    name            TEXT NOT NULL,
    qualified_name  TEXT NOT NULL,
    overload_index  SMALLINT NOT NULL DEFAULT 0,
    start_line      INTEGER NOT NULL,
    end_line        INTEGER NOT NULL,
    source_blob_ref TEXT,
    parsed_commit   TEXT,
    updated_at      TIMESTAMP DEFAULT now(),
    UNIQUE (file_id, qualified_name, overload_index)
);

CREATE INDEX IF NOT EXISTS idx_functions_qualified ON functions (qualified_name);
CREATE INDEX IF NOT EXISTS idx_functions_pkg_name ON functions (package_path, name);

CREATE TABLE IF NOT EXISTS edges (
    id                    SERIAL PRIMARY KEY,
    caller_function_id    INTEGER REFERENCES functions(id) ON DELETE CASCADE,
    callee_function_id    INTEGER REFERENCES functions(id) ON DELETE CASCADE,
    resolution_confidence TEXT NOT NULL
        CHECK (resolution_confidence IN ('exact', 'name_match', 'unresolved')),
    parsed_commit         TEXT,
    updated_at            TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_edges_caller ON edges (caller_function_id);
CREATE INDEX IF NOT EXISTS idx_edges_callee ON edges (callee_function_id);
