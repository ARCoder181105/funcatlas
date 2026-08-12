# funcatlas

An interactive visual map of a codebase. Point it at a repository and it parses every function,
links call sites into a graph, and renders it as an explorable canvas — click a file to get a card,
click the card to get a mind-map of its functions, click a function to read its code.

Built for one problem: large codebases don't fit in your head, and grep or go-to-definition only
ever shows you one file at a time — never the shape of the whole thing.

**Status:** in development. The backend works end to end — you can log in, register a repository,
and walk its call graph over HTTP. There is no UI yet, so it is not usable end-to-end *as a
product*.

## Progress

| Phase | Scope | State |
|---|---|---|
| 0 | Monorepo bootstrap, migrations, CI | done |
| 1 | Go + tree-sitter parser, sandbox hardening | done |
| 2 | Postgres persistence, call resolution | done |
| 3a | GitHub OAuth, Redis sessions, the graph API | done |
| 3b | React Flow canvas, search UI | next |
| 4 | Webhooks, job queue, security hardening | not started |
| 5 | Go, Rust and Python — extraction only | not started |

Phase-by-phase detail is in [`PLAN.md`](PLAN.md); the current chunk list is in
[`TASKLIST.md`](TASKLIST.md).

## How it works

1. **Clone** the target repo into an isolated, network-less, read-only container.
2. **Parse** every `.ts`/`.tsx` file with tree-sitter; extract function definitions, call sites,
   and imports into a Go-native intermediate representation.
3. **Resolve** each call to a definition — same file, then imported symbol, then package fallback —
   and tag the resulting edge `exact`, `name_match`, or `unresolved`.
4. **Store** functions and edges in Postgres, keyed so an incremental re-parse never orphans an edge.
5. **Serve** the graph behind a GitHub login — every endpoint is session-gated, and sessions are
   opaque ids in Redis rather than anything the browser can read.
6. **Explore** the graph on a React Flow canvas, where edge style reflects resolution confidence.

The confidence tag is the point of the design: a guess is never drawn as a fact.

## Stack

| Layer | Choice |
|---|---|
| Parser | Go + tree-sitter, pgx, zap |
| Database | Postgres (edge tables + recursive CTEs) |
| API | Fastify + Drizzle + postgres.js + Zod |
| Frontend | Vite + React + React Flow + Tailwind + shadcn/ui |
| Queue | Redis + BullMQ |
| Auth | GitHub OAuth (arctic), opaque sessions in Redis |
| Monorepo | pnpm workspaces + Turborepo |

Reasoning for each pick is in [`docs/TECH_STACK.md`](docs/TECH_STACK.md).

## Layout

```
/packages/shared      Drizzle schema + Zod schemas, shared by api and web
/apps/api             Fastify — auth, repo registration, graph endpoints
/apps/web             Vite + React — the canvas
/services/parser      Go — clone, parse, resolve, write to Postgres
/docs                 architecture, data model, security, risks
```

## Running it

```bash
pnpm install
cp .env.example .env                                 # fill in DATABASE_URL and REDIS_URL
docker compose up -d postgres redis
migrate -path services/parser/migrations -database "$DATABASE_URL" up
make go-build-bin                                    # the binary the API spawns
```

Parse a fixture without touching the API:

```bash
make go-run REPO=./services/parser/testdata/sample   # emits out.json
```

Or drive the whole thing over HTTP. `/auth/dev-login` exists outside production so this works
without a GitHub OAuth app:

```bash
cd apps/api && pnpm dev

curl -c jar -X POST localhost:3000/auth/dev-login
curl -b jar -X POST localhost:3000/api/repos \
  -H 'content-type: application/json' \
  -d '{"githubUrl":"https://github.com/ARCoder181105/funcatlas"}'
curl -b jar localhost:3000/api/repos/1/tree
curl -b jar 'localhost:3000/api/repos/1/search?query=parse'
```

Every `/api` route answers 401 without that cookie. Full setup, prerequisites, and the daily loop
are in [`DEVELOPMENT.md`](DEVELOPMENT.md).

## Documentation

| Document | Owns |
|---|---|
| [`PRD.md`](PRD.md) | What we're building and why — the product contract |
| [`PLAN.md`](PLAN.md) | The 4-phase execution plan |
| [`TASKLIST.md`](TASKLIST.md) | The live task list for the current phase |
| [`DEVELOPMENT.md`](DEVELOPMENT.md) | Setup, dev loop, conventions |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Components and how they connect |
| [`docs/TECH_STACK.md`](docs/TECH_STACK.md) | Stack decisions and rejected alternatives |
| [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) | Postgres schema |
| [`docs/PARSING_STRATEGY.md`](docs/PARSING_STRATEGY.md) | Extraction and call resolution, with limits |
| [`docs/SECURITY.md`](docs/SECURITY.md) | Parsing untrusted repos safely |
| [`docs/RISKS.md`](docs/RISKS.md) | Open decisions and tracked risks |
| [`docs/UI_GUIDE.md`](docs/UI_GUIDE.md) | Visual direction for the canvas |

## Scope

**In:** TypeScript for the full pipeline. Public repositories via GitHub OAuth — the scope is
`read:user`, since GitHub offers no read-only repository scope and `repo` would grant write access
to every private repository you can reach. Name/scope call resolution with confidence tags.
Webhook-driven incremental updates. Function-name search.

**Planned:** Go, Rust and Python in Phase 5, extraction only — per-language call resolution stays
cut.

**Out (post-MVP):** LSP-based resolution, freehand annotation layer, Neo4j, saved canvas layouts,
multi-tenancy, private repositories.

## License

MIT — see [`LICENSE`](LICENSE).
