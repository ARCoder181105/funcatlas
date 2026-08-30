# Product Requirements

What funcatlas is, who it's for, and what it must do to count as finished. This document owns the
product contract. The build sequence lives in [`PLAN.md`](PLAN.md); architecture, schema, and stack
reasoning live in [`docs/`](docs/).

---

## 1. The problem

A codebase outgrows the working memory of the people maintaining it long before it becomes large by
any objective measure. The tools we have are all local: go-to-definition answers "where is this one
symbol" and grep answers "where does this string appear", but neither answers "what is the shape of
this thing" or "what breaks if I change this function". Static-analysis dashboards report the shape
as tables and numbers, which is not how anyone actually holds a structure in their head.

funcatlas answers the repo-level question visually — and, critically, tells you how sure it is.

**One line:** *see the shape of any codebase — functions, calls, and confidence.*

## 2. Who it's for

| | Persona | The question they arrive with |
|---|---|---|
| P1 | Engineer onboarding to an unfamiliar repo | "Where do I even start?" — wants entry points and the high-level shape |
| P2 | Maintainer of a large TypeScript project | "What's the blast radius if I change this?" — wants N-hop traversal and caller sets |
| P3 | Contributor evaluating a project | "Is this codebase sane?" — wants orientation before a first PR |

Not for, in the MVP: teams needing shared canvases, RBAC, or real-time collaboration.

## 3. What "done" means

### Goals

- Parse a public TypeScript repo end to end into a confidence-tagged call graph in Postgres.
- Explore that graph on a dark-mode React Flow canvas: sidebar → card → mind-map → code.
- GitHub OAuth login, repo registration by URL, automatic refresh on push.
- Function-name search across a repo, from a search box and a ⌘K palette.
- Run the parser against untrusted repos without exposing the host.

### Explicitly not goals

LSP-based resolution, a freehand annotation layer, languages beyond TypeScript, a dedicated graph
database, saved canvas layouts, real-time multi-user editing. Rationale for each is in
[`PLAN.md`](PLAN.md#cut-from-the-mvp).

## 4. User stories

- I land on `/`, see an animated live-graph hero, understand the product in five seconds, and hit
  "Try a repo".
- I paste a repo URL; it clones and parses; I get a file tree.
- I click a file → a card appears → I click the card → a mind-map of that file's functions branches
  out → I click a function → its highlighted source, with links out to cross-file calls.
- I can tell at a glance how confident each edge is: **solid** for `exact`, **dashed** for
  `name_match`, **dotted** for `unresolved`.
- I press ⌘K, type a function name, and jump to it anywhere in the repo.
- When the repo's maintainer pushes, my graph updates without me asking.
- I select a function and see everything that would be affected if I changed it.

## 5. Functional requirements

| | Requirement |
|---|---|
| FR-1 | **Ingestion** — accept a public GitHub URL (post-OAuth, repo-read scope) or a local path; clone into an isolated environment; never invoke the repo's own install, build, or test scripts. |
| FR-2 | **Parsing** — extract function and method definitions (name, qualified name, line range, source), call expressions (callee, receiver, enclosing caller, line), and import statements. |
| FR-3 | **Input hardening** — reject symlinks and path-traversal escapes; skip files over 1 MB, binary files, and anything under `node_modules`, `.git`, `dist`, or `build`; cap total file count and tree depth. |
| FR-4 | **Resolution** — link each call via same-file → imported symbol → package fallback → unresolved, and tag every edge with its confidence. An unresolved call is still recorded, with the callee name it could not resolve. |
| FR-5 | **Storage** — persist repos, files, functions, and edges to Postgres with overload-safe uniqueness, cascading deletes, and `parsed_commit`/`updated_at` for incremental diffing. |
| FR-6 | **Graph API** — session-gated: list repos, file tree, functions for a file, edges for a function, raw source, and search by name. |
| FR-7 | **Canvas** — sidebar file tree; card → mind-map → code; confidence-styled edges; minimap; multiple files open at once; ⌘K palette; a 2,000 visible-node ceiling with expand-on-click beyond it. |
| FR-8 | **Auth** — GitHub OAuth from day one, repo-read scope with refresh, Redis-backed sessions, rate limiting. |
| FR-9 | **Incremental refresh** — HMAC-verified, replay-protected, per-repo-throttled webhook → queue → diff changed files → re-parse only those → relink only affected edges. A rename or deletion must update every edge pointing at the old function. |
| FR-10 | **Isolation runtime** — the parse container runs non-root, read-only, with no capabilities and no network. Cloning happens in a separate network-enabled step that hands over a shared tmpfs. |

## 6. Non-functional requirements

| | Requirement |
|---|---|
| NFR-1 | **Performance** — 300-file TypeScript repo parsed and resolved in under 90 s; `functions-for-file` p95 under 150 ms; 5-hop traversal over 10k edges under 500 ms; 60 fps at 2,000 visible nodes. **Measured** — see below. |
| NFR-2 | **Security** — no network egress during parse; an untrusted repo cannot read host files; webhooks are replay- and flood-safe; every graph endpoint is session-gated; secrets come from the environment. |
| NFR-3 | **Correctness** — re-parsing a renamed or deleted function leaves no orphan edges, and resolution never claims certainty it does not have. |
| NFR-4 | **Operability** — one `docker compose up` brings the whole stack up; `/healthz` on api and parser; structured logs (zap in the parser, pino in the api). **Met on the clone-and-run branch**, verified from a clean clone with `make start` never run. |
| NFR-5 | **Maintainability** — shared TypeScript types only in `packages/shared`; one SQL migration source at `services/parser/migrations/`; explicit SQL via sqlx in Go, Drizzle in the API, no full ORM anywhere. |
| NFR-6 | **UX** — dark-mode-first with accent tokens; motion that explains rather than decorates; skeleton loading; actionable errors; `prefers-reduced-motion` respected. |

### NFR-1, measured

Against `honojs/hono`, the benchmark repository fixed in `docs/RISKS.md` R3: 358 files, 1,472
functions, 37,116 call sites, 5,292 stored edges. One laptop, Postgres in Docker, everything cold.

| Target | Result | |
|---|---|---|
| 300-file TypeScript repo parsed and resolved under **90 s** | **3.2–4.5 s** over three runs, `git clone` included. **3.9 s** with the Postgres write. Peak RSS 72 MB. | pass |
| `functions-for-file` p95 under **150 ms** | **3.1 ms** — every file in the repository, three passes, n=1,065. p50 1.6 ms, max 12.8 ms. | pass |
| 5-hop traversal over 10k edges under **500 ms** | **4.4 ms** p95 over 600 samples. Worst single case **9.1 ms**, for the largest reachable set in the repository (392 nodes). | pass |
| **60 fps** at 2,000 visible nodes | Not reachable here. Opening and expanding every function in hono's largest file produces **210 nodes**, and no real map on this repository approaches the 2,000-node `NODE_CEILING`. At 210 nodes a continuous pan holds 60 fps with no frame over budget: p50 16.7 ms, p95 17.0 ms, max 17.1 ms. | not tested at scale |

Two things worth knowing before re-running this:

- **The parser's summary counts call sites; the database stores deduplicated edges.** 37,116 against
  5,292 is not a bug and not a discrepancy to chase.
- **The API rate-limits at 100 requests per minute**, so any latency run above that rate measures
  429s, which are fast and make the numbers look better than they are. Raise it deliberately for a
  benchmark and put it back afterwards.

## 7. Success metrics

- A real 300-file public TypeScript repo parses, resolves, and renders without error or OOM.
- Traversal and query latency meet NFR-1.
- Zero successful symlink-escape or oversized-file reads — the negative tests stay green.
- A push to a registered repo updates the graph automatically; a replayed webhook is rejected.
- Someone unfamiliar with a repo finds its entry point in under five minutes.

## 8. The design commitment

Every edge carries a `resolution_confidence` of `exact`, `name_match`, or `unresolved`, and the UI
renders each differently. This is not a nice-to-have field — it is the reason to trust the tool.
Name and scope matching cannot resolve re-export chains, overloads, or dynamic dispatch, and a call
graph that quietly guesses in those cases is worse than no call graph, because you cannot tell which
parts to doubt. So the parser records what it does not know, and the canvas draws it as a dotted line.

## 9. Glossary

| Term | Meaning |
|---|---|
| **IR** | Intermediate representation — the Go structs the parser emits, in `services/parser/internal/ir/ir.go` |
| **`qualified_name`** | Scope-aware function key, dot-joined: `Repo.sync`, `getUser.inner` |
| **`overload_index`** | Disambiguator `0..n-1` for functions sharing a `qualified_name` within one file |
| **`resolution_confidence`** | `exact` / `name_match` / `unresolved` — drives edge style on the canvas |
| **blast radius** | The set of functions reachable from a given one, via depth-bounded recursive CTE |
| **relink** | On rename or delete, updating every edge that pointed at the old function |
