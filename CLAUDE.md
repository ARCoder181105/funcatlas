# CLAUDE.md — funcatlas / CodeCanvas

Project context for AI assistants. The full plan lives in `PLAN.md`; this is the load-bearing summary.

## What this is
An interactive visual map of a codebase: clone a repo → tree-sitter parses functions + call sites →
resolve calls → store in Postgres → explore via React Flow canvas (file → card → function mind-map →
code block). First language: **TypeScript**.

## Status
Planning only — no code yet. Phases: 0 bootstrap → 1 parser+isolation → 2 storage+resolution →
3 API+auth+canvas+search → 4 webhooks+queue+hardening.

## Locked stack (do NOT re-decide without explicit reason)
- Monorepo: **pnpm + Turborepo**; shared types in **`packages/shared`** (Drizzle + Zod).
- Frontend: **Vite + React + TS**, **Tailwind + shadcn/ui**, **Framer Motion**, **React Flow**, **Shiki**, **cmdk**, **lucide-react**, **Zustand + TanStack Query**.
- API: **Fastify + Drizzle + postgres.js + Zod**, **arctic/oslo** (GitHub OAuth), **Redis sessions**, **@fastify/rate-limit**.
- Parser: **Go + tree-sitter (smacker/tree-sitter-go + tree-sitter-typescript)**, **sqlx + pgx** (explicit SQL, NOT a full ORM), **zap**.
- DB: **Postgres** (edge tables + recursive CTEs; Neo4j deferred). Queue: **Redis + BullMQ**.
- Migrations: **golang-migrate** (SQL), single source `services/parser/migrations/`, shared by Go + TS.
- Tests: **Vitest + testify + testcontainers-go**. CI: **GitHub Actions**. Infra: **docker-compose**.

## Confirmed decisions
- GitHub OAuth day 1 (repo-read scope, refresh). Webhook+queue incremental updates IN MVP. Function search IN MVP.
- Excalidraw + LSP resolution = OUT of MVP. Parser isolation (`--network none`, read-only, non-root, no symlinks, >1MB skip) in Phase 1.
- ORM = Drizzle (API) + sqlx (parser). No GORM/Prisma.

## Schema notes (docs/DATA_MODEL.md)
- `functions` key = `(file_id, qualified_name, overload_index)`; `ON DELETE CASCADE`; `parsed_commit`/`updated_at`.
- Indexes on `qualified_name`, `(package_path, name)`, edge caller/callee.
- `resolution_confidence` ∈ {exact, name_match, unresolved} → UI solid/dashed/dotted.
- Go parser keeps its OWN IR types (can't import TS `packages/shared`).

## Open risks
Tracked in `docs/RISKS.md` (R1–R18). Pre-code priorities: R1 (name), R3 (benchmark repo), R10 (migration source) before Phase 0;
R6–R9 before Phase 2. R18 (UI) is DECIDED in `docs/UI_GUIDE.md`.

## Workflow
See `DEVELOPMENT.md`. Read `PLAN.md`, `docs/TECH_STACK.md`, `docs/RISKS.md`, `docs/UI_GUIDE.md` first.
Before changing architecture, check this file + RISKS — decisions are locked unless explicitly reopened.
