# Roadmap

Phased so each stage produces something testable before the next stage depends on it. This roadmap is the production-grade MVP defined in `PLAN.md` — GitHub OAuth and webhook-driven incremental updates are in scope from the start (a manual button / no-auth is not production-grade). The first language is **TypeScript**.

## Phase 1 — Parser core + isolation
No UI, no database. A Go program that takes a local repo path, runs tree-sitter queries, and dumps functions + call sites to JSON. Build production isolation in now (not deferred): never follow symlinks, validate every path is inside the clone root, cap file count / file size (skip >1MB) / depth, skip binary and `node_modules`/`.git`, and run the parser in a container with `--network none` and a read-only mount. Point it at a real repo, read the output, fix extraction bugs (comments, strings, nested functions) here — cheaply, before anything else depends on this being correct.

**Done when:** JSON output for a real repo looks right on manual inspection, and a symlink-escape / oversized-file negative test is safely skipped.

## Phase 2 — Storage + resolution
Wire Phase 1's output into Postgres using the schema in `DATA_MODEL.md` (with the overload-safe uniqueness fix, `qualified_name` index, and `updated_at`/`parsed_commit` columns applied). Build the name/scope-based resolver (see `PARSING_STRATEGY.md`). Validate against a repo where the real call graph is known, so resolution accuracy can be spot-checked by hand.

**Done when:** functions and edges are correctly stored, with sensible `resolution_confidence` values, for at least one real repo, and a re-parse of a renamed function leaves no orphan edges.

## Phase 3 — API + auth + canvas + search
GitHub OAuth login (token scoped to repo-read, with refresh) + repo registration by URL. Serve the graph through endpoints (list repos, file tree, functions-for-file, edges-for-function, raw source, search-by-name). Build the React Flow canvas: sidebar file tree → click file → card → click card → function mind-map → click function → code block, with cross-file links and confidence-styled edges (solid / dashed / dotted). Add function-name search across the repo.

**Done when:** a logged-in user can explore a real repo end-to-end through the UI and search for functions by name.

## Phase 4 — Webhooks + queue + hardening
GitHub webhook → job queue (BullMQ) → diff changed files only → re-parse those files → re-link only the affected edges (renames/deletes update every edge pointing at the old function). Webhook payloads are HMAC-verified, replay-protected (timestamp window), and per-repo throttled. Finalize `SECURITY.md` compliance: isolated non-root container, read-only mount, `--network none`, no capabilities, secrets via env, `/healthz` health checks.

**Done when:** pushing a commit updates the graph automatically without a full re-parse; replayed/out-of-window webhooks are rejected; a webhook flood is throttled; and the parser still works with no network egress.

## Deliberately out of scope for the MVP

- Excalidraw drawing/annotation layer — defer post-MVP (was Phase 5).
- LSP-based resolution — defer post-MVP (was Phase 6); name/scope resolution ships first, tagged with confidence.
- Multi-language support beyond TypeScript — go deep on one before adding a second.
- Neo4j / dedicated graph database — Postgres is sufficient until traversal queries genuinely become a bottleneck.
- Real-time multi-user collaborative editing.
- Full code-execution sandboxing — parsing is read-only, see `SECURITY.md`.
