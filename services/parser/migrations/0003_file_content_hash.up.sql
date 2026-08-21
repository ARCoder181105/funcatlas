-- Record what a file contained, so a re-parse can tell which files changed.
--
-- The obvious answer is `git diff last_synced_commit..HEAD`, and it does not
-- work here: the parser clones with --depth 1, so the checkout has exactly one
-- commit and no history to diff against. Deepening the fetch would buy the
-- history at a network cost on every parse, and a force-push invalidates the
-- commit range anyway. The walk already reads every byte, so hashing is free
-- and works identically for a local path, which has no remote at all.

-- sha256 of the file's bytes, hex. Nullable: rows written before this migration
-- have no hash, and a null simply reads as "changed" on the next parse, which
-- is the safe direction to be wrong in.
ALTER TABLE files ADD COLUMN content_hash TEXT;
