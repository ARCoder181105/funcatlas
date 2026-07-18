# Roadmap

Phased so each stage produces something testable before the next stage depends on it.

## Phase 1 — Parser core
No UI, no database. A Go program that takes a local repo path, runs tree-sitter queries, and dumps functions + call sites to JSON. Point it at a real repo, read the output, fix extraction bugs (comments, strings, nested functions) here — cheaply, before anything else depends on this being correct.

**Done when:** JSON output for a real repo looks right on manual inspection.

## Phase 2 — Storage + resolution
Wire Phase 1's output into Postgres using the schema in `DATA_MODEL.md`. Build the name/scope-based resolver (see `PARSING_STRATEGY.md`). Validate against a repo where the real call graph is known, so resolution accuracy can be spot-checked by hand.

**Done when:** functions and edges are correctly stored, with sensible `resolution_confidence` values, for at least one real repo.

## Phase 3 — Static canvas
Sidebar file tree → click file → card appears on canvas → click card → mind-map of its functions → click function → code block view, with links out for calls to external files/packages. No auto-refresh yet; re-run parsing manually via a button/CLI command.

**Done when:** a real repo can be explored end-to-end through the UI.

## Phase 4 — Incremental updates
GitHub webhook → job queue → diff changed files only → re-parse those files → re-link only the affected edges (careful: renames/deletes must update every edge pointing at the old function, not just the node).

**Done when:** pushing a commit updates the graph automatically without a full re-parse or manual trigger.

## Phase 5 — Drawing layer
Embed Excalidraw alongside the graph canvas for freehand notes/annotations.

**Done when:** notes can be drawn and persist alongside the graph view.

## Phase 6 — LSP-based resolution (do this last)
Only after Phases 1–5 work end to end for one language. Upgrades `name_match` edges to `exact` for that language via language-server-based resolution.

**Done when:** a chosen language's edges are resolved with real semantic accuracy, not just name/scope heuristics.

## Deliberately out of scope for now

- Multi-language support beyond the first language — go deep on one before adding a second.
- Neo4j / dedicated graph database — Postgres is sufficient until traversal queries genuinely become a bottleneck.
- Real-time multi-user collaborative editing.
- Full code-execution sandboxing — parsing is read-only, see `SECURITY.md`.
