-- Let a repository exist before it has been parsed.
--
-- Registration used to clone and parse inside the HTTP request, and the parser
-- owned the insert -- so a repo row existing was itself the proof that a parse
-- had finished. With the parse on a queue that is no longer true: the row is
-- created first and the graph arrives later, and the client needs to be able to
-- tell "still working" from "finished" from "failed".

-- 'ready' is the default so every row written before this migration reads
-- correctly: they were all parsed synchronously and are complete by definition.
ALTER TABLE repos ADD COLUMN parse_status TEXT NOT NULL DEFAULT 'ready';

ALTER TABLE repos
  ADD CONSTRAINT repos_parse_status_check
  CHECK (parse_status IN ('queued', 'parsing', 'ready', 'failed'));

-- Why the last parse failed, in one sentence, for the client to render. Null
-- unless parse_status is 'failed'.
ALTER TABLE repos ADD COLUMN parse_error TEXT;
