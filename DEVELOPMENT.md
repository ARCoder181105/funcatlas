# Development Workflow

Follow this workflow for the entire build. It assumes the plan in `PLAN.md`, the stack in
`docs/TECH_STACK.md`, and the open questions in `docs/RISKS.md` are the source of truth.

---

## 0. Prerequisites (one-time)

- **Node 20+** and **pnpm** (`npm i -g pnpm`)
- **Go 1.22+**
- **Docker + Docker Compose** (needed for Postgres, Redis, and `testcontainers-go` in CI)
- **GitHub OAuth App** (see `docs/RISKS.md` R4): create it, note client ID/secret, set redirect
  `http://localhost:3000/auth/callback`, and create a webhook secret.
- **Local webhook tunnel** (R5): `ngrok http 3000` (or `smee.io`) for Phase 4 dev testing.
- Copy secrets: `cp .env.example .env` and fill in `GITHUB_CLIENT_ID/SECRET`, `GITHUB_WEBHOOK_SECRET`,
  `SESSION_SECRET`, `DATABASE_URL`, `REDIS_URL`.

---

## 1. Repository layout (already decided)

```
/                       pnpm workspace root + Turborepo
/packages/shared        Drizzle types + Zod schemas (api ↔ web)
/apps/web               Vite + React + React Flow + Tailwind + TanStack Query + Zustand + Shiki
/apps/api               Node/TS (Fastify + Drizzle + postgres.js + arctic/oslo)
/services/parser        Go (tree-sitter + sqlx/pgx + zap)
/docs                   documentation
```

---

## 2. Daily dev loop

### Start infrastructure (Postgres + Redis)
```bash
docker compose up -d postgres redis
```

### Run migrations (golang-migrate — single source in `services/parser/migrations`)
```bash
migrate -path services/parser/migrations -database "$DATABASE_URL" up
```

### Run services in dev mode (hot reload)
```bash
# Terminal 1 — API (tsx watch)
cd apps/api && pnpm dev

# Terminal 2 — Web (Vite HMR)
cd apps/web && pnpm dev

# Terminal 3 — Parser (Go rebuild on change via air or go run)
cd services/parser && go run ./cmd/parser
```
> Prod mode (no HMR) is `docker compose up` (brings up api + web + parser + postgres + redis).

### Type-check / lint / test (all packages)
```bash
pnpm -r lint
pnpm -r typecheck      # or pnpm -r build
pnpm -r test
cd services/parser && go test ./...
```

---

## 3. Phase-by-phase execution

Work strictly in order. Each phase has a "Done when" in `docs/ROADMAP.md` and `PLAN.md`.

| Phase | Focus | Start here | Verify |
|---|---|---|---|
| **0 — Bootstrap** | Monorepo, shared pkg, skeletons, migrations, CI | `pnpm install` + scaffold | `pnpm -r build`, `migrate up`, `curl localhost:3000/healthz` |
| **1 — Parser + isolation** | tree-sitter TS → JSON, symlink/size guards, Dockerfile | `services/parser` | `go test ./...`, `go run . --repo ./testdata/sample`, symlink negative test |
| **2 — Storage + resolution** | Postgres writes, name/scope resolver, confidence | `services/parser/internal/resolver` + `apps/api/db` | `psql` schema check, known-graph spot-check, rename re-parse (no orphans) |
| **3 — API + auth + canvas + search** | OAuth, graph endpoints, React Flow UI, search | `apps/api/internal/*` + `apps/web/src` | log in via OAuth, click through a repo, `curl` endpoints, `npm run build` |
| **4 — Webhooks + queue + hardening** | BullMQ, HMAC webhook, re-link, SECURITY.md compliance | `apps/api/internal/webhook` + `services/parser/internal/relink` | push commit → auto update, replay rejected, flood throttled, `--network none` parse |

**Recommended order within a phase:** schema/migration → core logic (with unit tests) → API/UI →
manual end-to-end test → mark "Done when" satisfied → commit.

---

## 4. Branch & PR flow

- Default branch is `main`. Create feature branches: `phase0-bootstrap`, `phase1-parser`, etc.
- Keep each phase in its own branch; open a PR when its "Done when" is met.
- PR must pass CI (lint + test + build + migration check). See `docs/RISKS.md` R17 (CI needs Docker).
- Squash-merge to `main`; delete the branch after merge.
- Tag phase completions: `git tag -a phase1 -m "Parser core + isolation"`.

---

## 5. Using the risk tracker

- `docs/RISKS.md` holds R1–R17. Before starting a phase, check which R-items must be resolved first
  (each notes its phase). Flip `[ ]` → `[x]` and **OPEN** → **DECIDED** when resolved.
- Resolve-before-coding priorities: **R1** (name), **R3** (benchmark repo), **R10** (migration source)
  before Phase 0; **R6–R9** before Phase 2; **R2/R11–R17** as their phases arrive.

---

## 6. Conventions

- **Commits:** imperative ("add parser symlink guard"), small and scoped per concern.
- **Types:** shared TS types live only in `packages/shared`; the Go parser keeps its own IR types
  mirroring the schema (R9) — do not try to import TS types into Go.
- **Secrets:** never commit `.env`; only `.env.example`. Rotate the webhook secret if leaked.
- **Grammar versions:** pin `tree-sitter-typescript` (R16) to avoid silent parse breakage.
- **Migrations:** never edit a merged migration; add a new numbered file instead.

---

## 7. Quick reference

```bash
pnpm install                 # install all workspace deps
docker compose up -d         # full stack (prod-like)
docker compose up -d postgres redis   # infra only (dev)
migrate -path services/parser/migrations -database "$DATABASE_URL" up
pnpm -r lint && pnpm -r build && pnpm -r test
cd services/parser && go test ./... && go run ./cmd/parser --repo ./testdata/sample
curl localhost:3000/healthz  # api health
```
