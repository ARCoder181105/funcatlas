# TASKLIST — guided Phase 2 build (Storage + Resolution)

> Working contract for the build. **You write the code; I debug/review/guide.**
> Finish one chunk → run its tests → "good when …" met → I'll nudge you to the next.
> Source of truth: `PLAN.md` §3 Phase 2, `docs/DATA_MODEL.md`, `docs/PARSING_STRATEGY.md`, and `PRD.md`.

**Current branch:** `phase-2/storage-and-resolution`
**Verified state:** Phase 1 parser core with isolation is complete.

## Legend
- `[ ]` todo · `[~]` in progress · `[x]` done
- **Good when:** the objective acceptance test for the chunk.
- **Watch outs:** bugs I'll check when you submit the chunk.

---

## Phase 2 — chunks

### C1 — Shared Types & DB Client  `[ ]`
**Approach:** Define the exact Postgres schema mirroring `0001_init.sql` inside `packages/shared/schema.ts` using Drizzle ORM. Export Zod validation schemas. Then, initialize postgres.js and Drizzle ORM in `apps/api/db/`. Create a basic Fastify server with a health check endpoint.
**Good when:** `pnpm -r build` succeeds, `docker compose up -d postgres && pnpm --filter api run dev` runs, and `curl localhost:3000/healthz` returns 200 with DB status.
**Watch outs:** Schema drift from `services/parser/migrations/0001_init.sql`; missing types; hardcoded credentials.

### C2 — Parser DB Writer (sqlx)  `[ ]`
**Approach:** Implement `services/parser/internal/db/writer.go` using `sqlx` and `pgx` to bulk-insert `ir.Graph` (Files, Functions, CallSites, Imports) into Postgres. Use `COPY` or batched `INSERT` for performance. Hook it up in `cmd/parser/main.go`.
**Good when:** Running the parser against `testdata/sample` populates a real local Postgres instance without unique constraint violations.
**Watch outs:** `overload_index` clashes; missing `updated_at`/`parsed_commit`; transaction management.

### C3 — The Resolver Engine  `[ ]`
**Approach:** Implement `services/parser/internal/resolver/resolve.go`. For each `ir.CallSite`, determine the target function's `qualified_name` and tag the edge with a confidence (`exact`, `name_match`, `unresolved`). Look up targets in the DB via sqlx.
**Good when:** A complex test repo correctly resolves same-file calls (exact), imported calls (exact), and missing modules (unresolved).
**Watch outs:** O(N^2) DB queries (batch the lookups); edge cases for overloaded targets (tag as unresolved/name_match per spec).

### C4 — API Graph Traversal (Recursive CTE)  `[ ]`
**Approach:** Implement `apps/api/internal/graph` with a function to fetch N-hop function calls using a recursive CTE via Drizzle raw SQL.
**Good when:** Unit tests with testcontainers-go (or equivalent Node.js test container) can correctly traverse a mock graph inserted into Postgres.
**Watch outs:** Infinite loops (missing depth bound in CTE); SQL injection (use parameterized queries).

### C5 — Integration & Re-link Strategy  `[ ]`
**Approach:** Add logic for incremental re-parsing. Re-parse a repo where a function was renamed and verify old edges are cleaned up via delete-then-reinsert or soft-delete.
**Good when:** The parser cleanly digests a modified repo, updates the stored graph correctly (no orphan edges), and the API can serve a recursive CTE query on it.

### C6 — Docs Sync  `[ ]`
**Approach:** Update `NEXT_MODEL_HANDOFF.md`, `DEVELOPMENT.md`, and `docs/RISKS.md` with the completed Phase 2 facts.
**Good when:** All Phase 2 architectural decisions are recorded and no aspirational TODOs remain in this phase.

---

## Phase 2 exit gate (Definition of Done)

All of the following pass:
- [ ] `packages/shared` exports Drizzle schema accurately reflecting the DB.
- [ ] API connects to Postgres and executes recursive N-hop CTE traversals.
- [ ] Parser persists extracted IR to Postgres using sqlx.
- [ ] Resolver successfully assigns confidence tags to call edges.
- [ ] Integration test proves re-parsing cleans up stale edges.

---

## Working conventions (so we pair smoothly)

- **You code, I debug.** Submit a chunk via your usual edit; I'll review for correctness, style, and bugs.
- **Commits:** imperative, one concern each, scoped to the chunk.
- **Migrations:** never edit a merged migration; add a new numbered file instead.
- **Tests first mentality:** when a chunk's "good when" is a test, write the test alongside the code, not after.
