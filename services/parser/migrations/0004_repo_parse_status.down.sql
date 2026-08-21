-- Rolling back loses which repositories were mid-parse or had failed. Every
-- surviving row reads as complete, which is what the pre-queue code assumed.
ALTER TABLE repos DROP CONSTRAINT repos_parse_status_check;
ALTER TABLE repos DROP COLUMN parse_error;
ALTER TABLE repos DROP COLUMN parse_status;
