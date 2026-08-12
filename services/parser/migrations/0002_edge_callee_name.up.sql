-- Make an unresolved edge storable, and let the database enforce the
-- invariants the writer would otherwise have to remember.
--
-- The edges table could not represent two of its own three confidence values.
-- An edge stored only callee_function_id, so a call that resolved to nothing
-- left the column null with the callee's name lost entirely -- a row that says
-- "something unresolved happened here" and nothing more.

-- callee_function_id is already nullable (0001 declares no NOT NULL on it), so
-- there is nothing to drop. Verified with \d edges before writing this.

-- The name as written at the call site, kept whatever the confidence, so an
-- unresolved edge still carries information.
ALTER TABLE edges ADD COLUMN callee_name TEXT NOT NULL DEFAULT '';

-- The line the call appears on, so the UI can jump to the call itself rather
-- than only to the top of the calling function.
ALTER TABLE edges ADD COLUMN call_line INTEGER;

-- A null callee is meaningful only for an unresolved edge. Enforcing it here
-- means a resolver bug fails loudly at write time instead of producing a graph
-- that renders a confident edge pointing at nothing.
ALTER TABLE edges ADD CONSTRAINT edges_callee_consistency
    CHECK (callee_function_id IS NOT NULL OR resolution_confidence = 'unresolved');

-- Deleting a repo left every file under it stranded or errored. Errors if any
-- existing row has a null repo_id, which is the honest outcome -- fix the data
-- rather than have the migration silently delete it.
ALTER TABLE files DROP CONSTRAINT files_repo_id_fkey;
ALTER TABLE files ALTER COLUMN repo_id SET NOT NULL;
ALTER TABLE files ADD CONSTRAINT files_repo_id_fkey
    FOREIGN KEY (repo_id) REFERENCES repos(id) ON DELETE CASCADE;

-- A function row with no file is meaningless, and the Drizzle schema already
-- declared this column notNull. The SQL was the side that was wrong.
ALTER TABLE functions ALTER COLUMN file_id SET NOT NULL;

-- The writer upserts a repo by URL: ON CONFLICT (github_url) needs a unique
-- constraint to conflict against, and there was none.
ALTER TABLE repos ADD CONSTRAINT repos_github_url_key UNIQUE (github_url);

-- These three columns default to now() but were nullable, while the Drizzle
-- schema declared all three notNull. DEFAULT is not NOT NULL. Aligning on the
-- stronger constraint, since nothing writes a null into them.
ALTER TABLE repos     ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE functions ALTER COLUMN updated_at SET NOT NULL;
ALTER TABLE edges     ALTER COLUMN updated_at SET NOT NULL;
