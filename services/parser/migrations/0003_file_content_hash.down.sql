-- Dropping the column loses every stored hash, so the next parse after a
-- rollback treats every file as changed and rewrites the repo in full. Correct,
-- just not incremental.
ALTER TABLE files DROP COLUMN content_hash;
