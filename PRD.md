# PRD — funcatlas / CodeCanvas

> Product Requirements Document. Single source of truth for *what* we're building and *why*.
> Architecture, stack, and risks live in `docs/` (`ARCHITECTURE.md`, `TECH_STACK.md`,
> `DATA_MODEL.md`, `RISKS.md`, `SECURITY.md`, `UI_GUIDE.md`); this document is the **product
> contract**. Cross-reference `PLAN.md` for the phased execution plan and `TASKLIST.md` for the
> current chunk-by-chunk build.

---

## 1. Vision

An interactive visual map of any codebase: paste a repo URL → we clone it, parse with tree-sitter,
resolve call relationships, store the graph in Postgres, and let you explore it on a React Flow
canvas (file → card → function mind-map → code block). The goal is to make *the shape of a
codebase* legible for repos that no longer fit in one human head — without ever pretending to know
what a call points to when it doesn't.

**One-liner:** *"See the shape of any codebase — functions, calls, and confidence, visually."*

---

## 2. Why now / problem

- Codebases outgrow a single engineer's working memory; onboarding to a large repo is slow.
- Existing tools (IDE go-to-definition) are **local and per-file**; none give a *repo-level* map.
- Static-analysis dashboards are tables/numbers, not **explorable** graphs.
- A trustworthy, repo-wide visual call graph — with explicit uncertainty baked in — closes the gap.

---

## 3. Target users & personas

- **P1 — Mid/senior engineer onboarding to an unfamiliar repo.** *"Where do I even start?"* Wants
  the high-level shape: entry points, hot functions, who calls what.
- **P2 — Tech lead / maintainer of a large TS project.** *"What's the blast radius if I change
  this function?"* Wants N-hop traversal and caller sets.
- **P3 — OSS contributor evaluating a project.** Quick orientation before a first PR.

**Non-goal for MVP:** multi-tenant teams, RBAC, sharing canvases, real-time collaboration.

---

## 4. Goals & non-goals (MVP)

### Goals
- Parse a public TS repo end-to-end → trustworthy, confidence-tagged call graph persisted in Postgres.
- Explore it on a premium dark-mode React Flow canvas: sidebar → card → mind-map → code.
- GitHub OAuth login; register a repo by URL; automatic incremental refresh via webhook + queue.
- Function-name search across the repo (⌘K palette + search box).
- Production-grade isolation: parser runs non-root, read-only, no network egress, no symlink
  follow, file/size/binary caps.

### Non-goals (post-MVP)
- LSP-based resolution (ships later as a v2 upgrade of `name_match`/`unresolved` → `exact`).
- Excalidraw freehand annotation layer.
- Multi-language support (TypeScript first; go deep before breadth).
- Neo4j / dedicated graph database.
- Real-time multi-user editing, saved canvas layouts.

---

## 5. User stories

- As a visitor, I land on `/` and see an animated live-graph hero so I understand the product in
  5 seconds, then "Try a repo" → GitHub OAuth.
- As a logged-in user, I paste a repo URL → the repo is cloned/parsed → I see its file tree.
- As a user, I click a file → a card appears → click the card → a mind-map of that file's functions
  branches out → click a function → Shiki-highlighted code block, with cross-file call links.
- As a user, edges show confidence: **solid** (`exact`) / **dashed** (`name_match`) / **dotted**
  (`unresolved`) — a guess is never drawn as a fact.
- As a user, I ⌘K / search a function name → jump to it anywhere in the repo.
- As a user, when the repo's maintainer pushes, the graph updates automatically (webhook → queue).
- As a maintainer, I see the blast radius of changing a function (N-hop traversal).

---

## 6. Functional requirements

- **FR-1 Ingestion** — accept a public GitHub repo URL (post-OAuth, repo-read scope) **or** a local
  path; clone/read into an isolated environment; never execute the repo's build/install scripts.
- **FR-2 Parsing** — tree-sitter extracts function/method definitions (name, qualified name, line
  range, source), call expressions (callee name, enclosing caller, line), and import statements.
- **FR-3 Input hardening** — reject symlink/path-traversal escapes; skip files >1MB, binary files,
  and dirs under `node_modules`/`.git`/`dist`/`build`; cap total file count and tree depth.
- **FR-4 Resolution** — link each call to a definition via same-file → imported symbol → package
  fallback → unresolved; tag every edge `exact`/`name_match`/`unresolved`.
- **FR-5 Storage** — persist repos, files, functions, edges to Postgres (schema in `DATA_MODEL.md`),
  with overload-safe uniqueness, `ON DELETE CASCADE`, and `parsed_commit`/`updated_at` for incremental diff.
- **FR-6 Graph API** (session-gated) — list repos; file tree; functions for file; edges for function;
  raw source; search functions by name across a repo.
- **FR-7 Canvas** — sidebar file tree; card → mind-map → code; confidence-styled edges; minimap;
  multi-open; ⌘K palette + name search; ≤2000 visible-node target with expand-on-click.
- **FR-8 Auth** — GitHub OAuth from day 1 (repo-read scope, refresh); Redis sessions; rate-limit.
- **FR-9 Incremental refresh** — GitHub webhook (HMAC-verified, replay-protected, per-repo
  throttled) → BullMQ → diff changed files → re-parse only those → re-link only affected edges
  (renames/deletes update every edge pointing at the old function — no orphans).
- **FR-10 Isolation runtime** — parser container runs non-root, read-only rootfs, no caps, and
  **network NONE** during parse (clone happens in a separate network-enabled sidecar sharing tmpfs).

---

## 7. Non-functional requirements

- **NFR-1 Performance** — parse a 300-file TS repo in **< 90s**; `GET functions for file` p95
  **< 150ms**; N-hop (depth 5, 10k edges) **< 500ms**; canvas 60fps at ≤2000 visible nodes.
- **NFR-2 Security** — no network egress during parse; untrusted repo can't read host files
  (symlink/path containment); webhook replay/flood safe; session-gated API; secrets via env.
- **NFR-3 Correctness** — re-parse of a renamed/deleted function leaves **no orphan edges**;
  resolution never silently claims certainty it lacks (confidence is first-class).
- **NFR-4 Operability** — single `docker compose up` brings up postgres, redis, api, web, parser;
  `/healthz` endpoints; logs via `zap` (parser) + `pino` (api).
- **NFR-5 Maintainability** — shared TS types in `packages/shared`; single SQL migration source
  (`services/parser/migrations/`); no full ORM on the Go side (`sqlx` explicit SQL); Drizzle on TS API side.
- **NFR-6 UX** — premium dark-mode-first; accent tokens; purposeful Framer Motion; skeleton/shimmer
  loading; actionable errors; `prefers-reduced-motion` respected.

---

## 8. Success metrics (MVP)

- A real 300-file public TS repo parses, resolves, and renders end-to-end without OOM or error.
- N-hop traversal returns in <500ms at 10k edges; p95 `functions-for-file` <150ms.
- **0** successful symlink-escape / oversized-file reads (negative tests green).
- Pushing a commit to a registered repo updates the graph automatically; replayed/out-of-window
  webhook rejected; webhook flood throttled.
- A pilot user can navigate an unfamiliar repo to *find the entry point* in <5 min.

---

## 9. Scope boundaries

**In:** TypeScript only; public repos via GitHub OAuth; single-user (per-repo isolation, not
multi-user); name/scope resolution; webhook incremental updates; function-name search.

**Out:** LSP resolution; Excalidraw; multi-language; Neo4j; layout persistence; multi-tenant.

---

## 10. Release plan (4 phases)

- **Phase 1 — Parser core + isolation** *(current; branch `phase-1/parser-core-and-isolation`,
  PR #21)*. Given a local repo path → correct IR JSON for TypeScript, with hardening and an
  isolated Docker image. No DB writes, no UI. See `docs/PHASE1_TASKS.md` and `TASKLIST.md`.
- **Phase 2 — Storage + resolution**. Persist IR to Postgres; name/scope resolver with confidence;
  re-parse leaves no orphans.
- **Phase 3 — API + auth + canvas + search**. GitHub OAuth; graph endpoints; React Flow canvas;
  ⌘K + name search; premium dark UI per `docs/UI_GUIDE.md`.
- **Phase 4 — Webhooks + queue + hardening**. BullMQ; HMAC webhook; incremental re-parse/relink;
  full `SECURITY.md` compliance; `/healthz`.

---

## 11. Risks & open decisions

Tracked in `docs/RISKS.md` (R1–R18). Status snapshot at PRD authoring:

- **Pre-Phase-0 (resolved by code):** R10 (single migration source — `services/parser/migrations/`),
  R9 (Go can't import TS shared types — `internal/ir/ir.go` carries Go-native IR; the RISKS.md OPEN
  box is stale and should be flipped to DECIDED in `TASKLIST.md` chunk C14).
- **Pre-Phase-1 (decision due now):** R16 (pin `tree-sitter-typescript` grammar version).
- **Pre-Phase-2:** R6 (TS "package" definition), R7 (`qualified_name` format), R8 (overload +
  edges → edges to overloaded `qualified_name`s tagged `unresolved`).
- **Pre-Phase-3/4:** R2 (session strategy), R4 (GitHub OAuth app), R5 (local webhook tooling),
  R11–R15 (dev/prod modes, parse lock, webhook debounce, repo cleanup, canvas virtualization),
  R17 (CI needs Docker), R18 (UI).
- **R1** (product vs repo name) and **R3** (benchmark repo) are *deferred, not blocking* Phase 1.

### Confirmed decisions (locked during PRD review)

- **Overload detection — future-proof:** assign `overload_index` in a **per-file post-pass** after
  extraction + the qualified-name scope walk. Group functions in a file by `qualified_name`, order
  by `start_line`, assign `0..n-1`. Same-name in *different* scopes (top-level `sync` vs `Repo.sync`)
  already get distinct `qualified_name`s → each index `0` (not overloads). Genuine TS overloads
  share `qualified_name` → get `0,1,2,…`. Phase 2 tags edges to overloaded `qualified_name`s
  `unresolved` (R8). `overload_index` is part of the DB uniqueness key, so Phase 4's
  delete-then-reinsert incremental relink never collides on `UNIQUE` and is stable across identical
  re-parses (keyed by `start_line`).
- **Query loading:** runtime-load `queries/typescript.scm` (editable without recompiling Go).
- **`.gitignore` respect:** deferred post-MVP (skip-list already covers `node_modules`/etc.).
- **Clone vs parse containers:** separate `parser-clone` (network enabled) → shared tmpfs →
  `parser-parse` (`network none`, read-only, non-root, no caps).
- **Naming convention picks:** top-level `qualified_name` = bare name; module-level call's
  `CallerQualified` = `"<module>"`; `package_path` = `""` for files at repo root.
- **R3 benchmark:** defer to end of Phase 1 — use only `testdata/sample` now; pick a real ~300-file
  TS OSS repo right before exit testing.

---

## 12. Glossary

- **IR** — intermediate representation; Go structs the parser emits (`File`, `Function`,
  `CallSite`, `Import`, `Graph`) in `services/parser/internal/ir/ir.go`.
- **`qualified_name`** — scope-aware function key (e.g. `Repo.sync`, `getUser.inner`); the
  uniqueness guarantee for `(file_id, qualified_name, overload_index)`.
- **`overload_index`** — disambiguator `0..n-1` assigned per `(file, qualified_name)` post-pass.
- **`resolution_confidence`** — `exact` / `name_match` / `unresolved`; drives UI edge style.
- **blast radius** — N-hop traversal over `edges` (recursive CTE, depth-bounded).
- **relink** — Phase 4 action: on rename/delete, update every edge pointing at the old function
  so no orphan edges remain.
