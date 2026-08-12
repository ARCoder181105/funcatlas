-- Reverses 0002, in reverse order of application.
--
-- Dropping callee_name and call_line discards the data in those columns. That
-- is inherent to reversing an ADD COLUMN, not an oversight: rolling back past
-- 0002 means going back to a schema in which an unresolved edge's callee name
-- has nowhere to live. Nothing else here loses data.

ALTER TABLE edges     ALTER COLUMN updated_at DROP NOT NULL;
ALTER TABLE functions ALTER COLUMN updated_at DROP NOT NULL;
ALTER TABLE repos     ALTER COLUMN created_at DROP NOT NULL;

ALTER TABLE repos DROP CONSTRAINT repos_github_url_key;

ALTER TABLE functions ALTER COLUMN file_id DROP NOT NULL;

ALTER TABLE files DROP CONSTRAINT files_repo_id_fkey;
ALTER TABLE files ALTER COLUMN repo_id DROP NOT NULL;
ALTER TABLE files ADD CONSTRAINT files_repo_id_fkey
    FOREIGN KEY (repo_id) REFERENCES repos(id);

ALTER TABLE edges DROP CONSTRAINT edges_callee_consistency;
ALTER TABLE edges DROP COLUMN call_line;
ALTER TABLE edges DROP COLUMN callee_name;
