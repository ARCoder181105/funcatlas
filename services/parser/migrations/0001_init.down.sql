-- Reverses 0001_init.up.sql. Drop in reverse dependency order: edges
-- references functions, functions references files, files references repos.
-- Indexes and constraints go with their tables.

DROP TABLE IF EXISTS edges;
DROP TABLE IF EXISTS functions;
DROP TABLE IF EXISTS files;
DROP TABLE IF EXISTS repos;
