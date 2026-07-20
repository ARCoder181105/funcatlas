# Risks & Open Questions

Tracked before any code is written so nothing is decided mid-development. Each item is marked:
**DECIDED** (resolved), **OPEN** (needs a decision before the listed phase), or **DEFERRED**
(revisit later). Status is updated as we go.

---

## Naming & identity
- [ ] **R1 — Product vs repo name** (`funcatlas` repo vs `CodeCanvas` product). Locks OAuth app name, Docker tags, public URL. → **OPEN** (decide before Phase 0).

## Auth / sessions
- [ ] **R2 — Session strategy**: Redis-backed (current default, reuses existing Redis) vs stateless JWT. → **OPEN** (confirm before Phase 3; default = Redis-backed).

## Testing fixtures
- [ ] **R3 — Benchmark repo**: agreed "~300-file TS project" but not named. Pick a real OSS repo so Phase 1–4 testing is consistent. → **OPEN** (decide before Phase 1).

## External setup (manual prerequisites, not code)
- [ ] **R4 — GitHub OAuth App**: register app, get client ID/secret, set redirect URIs, configure webhook secret. Prereq for Phase 3–4. → **OPEN** (manual).
- [ ] **R5 — Local webhook testing**: GitHub can't reach `localhost`; need `ngrok`/`smee.io` for Phase 4 dev. → **OPEN** (tooling, Phase 4).

## Design ambiguities (resolve before Phase 2)
- [ ] **R6 — "Package" definition for TS**: directory? npm package? tsconfig project? Drives the resolver's "package fallback". → **OPEN** (before Phase 2).
- [ ] **R7 — `qualified_name` format for TS**: `package_path::name`, but `package_path` is undefined for TS modules. Fix the convention. → **OPEN** (before Phase 2).
- [ ] **R8 — Overloading + edges**: name/scope matching can't pick the right overload. Edges to overloaded functions must be `unresolved` (or fanned to all) — never silently wired to the wrong one. Needs a rule for `overload_index`. → **OPEN** (before Phase 2).
- [ ] **R9 — Go can't import `packages/shared`**: the TS shared-types package is useless to the Go parser. Parser needs its own IR types mirroring the schema (accept duplication or generate from migration). → **OPEN** (before Phase 1).
- [ ] **R10 — Single migration source**: `golang-migrate` SQL must live in one place both parser and API read (e.g. `services/parser/migrations/`). → **OPEN** (before Phase 0).

## Dev-workflow practicalities
- [ ] **R11 — Dev vs prod modes**: `docker compose up` for prod; web needs HMR and api needs `tsx` watch for dev. Document a dev workflow. → **OPEN** (Phase 0).
- [ ] **R12 — Per-repo parse lock**: webhook + manual re-parse could double-trigger on the same repo. Add a lock keyed by repo. → **OPEN** (before Phase 4).
- [ ] **R13 — Webhook debounce**: a push storm (many commits) shouldn't enqueue N jobs. Debounce per repo. → **OPEN** (Phase 4).
- [ ] **R14 — Repo removal/cleanup**: deleting a registered repo must cascade-delete rows AND clean the clone on disk. → **OPEN** (Phase 3/4).
- [ ] **R15 — Canvas scale**: even with expand-on-click, initial file tree + first paint of a large repo needs virtualization. State the node ceiling in code. → **OPEN** (Phase 3).
- [ ] **R16 — Pin tree-sitter grammar versions**: grammars change between releases; pin `tree-sitter-typescript` to avoid silent breakage. → **OPEN** (Phase 1).
- [ ] **R17 — CI needs Docker**: `testcontainers-go` spins up Postgres in CI; ensure the runner has Docker. → **OPEN** (Phase 0/CI).

---

## Already covered (no action needed)
- Security hardening, schema fixes (cascade / overload / index), the 4-phase plan, and the full
  tech-stack lock-in are documented in `PLAN.md`, `docs/TECH_STACK.md`, `docs/SECURITY.md`,
  `docs/DATA_MODEL.md`, `docs/ARCHITECTURE.md`, and `docs/ROADMAP.md`.
