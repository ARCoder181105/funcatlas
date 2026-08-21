# Development

How to set up, run, and contribute to funcatlas. The phase order is in [`PLAN.md`](PLAN.md); the
current work is in [`TASKLIST.md`](TASKLIST.md).

---

## Prerequisites

Needed now:

- **Node 20+** and **pnpm** — `npm i -g pnpm`
- **Go 1.24+** with a C toolchain (`gcc`) — tree-sitter uses cgo
- **Docker** and **Docker Compose** — Postgres, Redis, and testcontainers
- **golang-migrate** CLI — or use the `migrate/migrate` Docker image, as CI does

Needed from Phase 3 onward, so you can defer them:

- A **GitHub OAuth App** (see [`docs/RISKS.md`](docs/RISKS.md) R4) — register it, note the client id
  and secret, set the redirect to `http://localhost:3000/auth/callback`, generate a webhook secret.
- A **webhook tunnel** for Phase 4 — `ngrok http 3000` or `smee.io`, because GitHub cannot reach
  `localhost`.

## First-time setup

```bash
pnpm install
cp .env.example .env      # then fill in DATABASE_URL and REDIS_URL at minimum
docker compose up -d postgres redis
migrate -path services/parser/migrations -database "$DATABASE_URL" up
make go-build-bin         # the binary the API spawns to register a repository
```

Never commit `.env`. Only `.env.example` is tracked.

`make go-build-bin` is easy to forget and the failure is not obvious: `POST /api/repos` answers 502
because there is no binary at `PARSER_BIN`. Rebuild it after any change under `services/parser/`.

For a real login you also need a GitHub OAuth app (Settings → Developer settings → OAuth Apps) with
its callback URL set to exactly `GITHUB_REDIRECT_URI`, and `GITHUB_CLIENT_ID` /
`GITHUB_CLIENT_SECRET` in `.env`. `SESSION_SECRET` is any 32 random bytes: `openssl rand -hex 32`.

The OAuth app is now required. `/auth/dev-login` used to stand in for it and was deleted in Phase 4
(R30): it was a login with no credential, gated only by `NODE_ENV`, so one non-production deployment
on a reachable host was a session for the asking.

## Layout

```
/packages/shared        Drizzle schema + Zod schemas, shared by api and web
/packages/eslint-config, /packages/typescript-config
/apps/api               Fastify + Drizzle + postgres.js + arctic/oslo
/apps/web               Vite + React + React Flow + Tailwind + TanStack Query + Zustand
/services/parser        Go — tree-sitter, sqlx/pgx, zap
  /cmd/parser           entry point
  /internal/clone       local path or shallow git clone
  /internal/security    path containment, size and depth caps, symlink rejection
  /internal/ts          tree-sitter extraction and the qualified-name scope walk
  /internal/ir          Go-native intermediate representation
  /internal/resolver    call resolution and confidence tagging
  /internal/db          Postgres writer
  /migrations           the single source of schema
  /queries              tree-sitter .scm patterns, embedded at build
  /testdata             fixtures and golden output
/docs                   architecture, data model, security, risks
```

## Daily loop

Bring up infrastructure, then run whichever services you're working on natively — you want hot
reload, and compose does not give you that.

```bash
docker compose up -d postgres redis     # infra only

cd apps/api && pnpm dev                 # terminal 1 — tsx watch
cd apps/web && pnpm dev                 # terminal 2 — Vite HMR
cd services/parser && go run ./cmd/parser --repo ./testdata/sample   # terminal 3
```

`docker compose up` with no arguments runs the whole stack in prod mode, no hot reload. Use it to
check that the thing actually works in a container, not to develop in.

Open <http://localhost:5173>, not the API's port. Signed out you get the sign-in card and **Sign in
with GitHub**, which needs the OAuth app above.

### `WEB_APP_URL`

Where the OAuth callback sends the browser once a session exists — the **web** app, `:5173`. It was
called `APP_PUBLIC_URL` and pointed at `:3000` until Phase 3b, which meant a successful GitHub login
dropped the user on a JSON endpoint. If you have an older `.env`, rename the key:

```bash
sed -i 's|^APP_PUBLIC_URL=.*|WEB_APP_URL=http://localhost:5173|' .env
```

The API fails fast on start if it is missing, so you will know immediately.

## Driving the API by hand

Everything under `/api` needs a session, and the only way to get one is `/auth/login` in a browser.
Sign in there, then copy the `funcatlas_session` cookie out of devtools into a jar:

```bash
printf 'localhost\tFALSE\t/\tFALSE\t0\tfuncatlas_session\t<paste-value>\n' > jar
curl -b jar localhost:3000/auth/me                   # {"userId":...,"login":"..."}
```

Register a repository. This returns immediately now — the parse runs on the queue, so watch
`parseStatus` rather than the request:

```bash
curl -b jar -X POST localhost:3000/api/repos \
  -H 'content-type: application/json' \
  -d '{"githubUrl":"https://github.com/ARCoder181105/funcatlas"}'
```

Then walk the graph — file tree, a file's functions, one function's callees, its source, and search:

```bash
curl -b jar localhost:3000/api/repos
curl -b jar localhost:3000/api/repos/1/tree
curl -b jar localhost:3000/api/files/1/functions
curl -b jar 'localhost:3000/api/functions/1/edges?depth=3&direction=out'
curl -b jar localhost:3000/api/functions/1/source
curl -b jar 'localhost:3000/api/repos/1/search?query=get&limit=10'
curl -b jar -X POST localhost:3000/auth/logout       # 204; every route above now 401s
```

A 401 anywhere means the cookie jar is empty or the session expired — log in again. A 502 from
`POST /api/repos` is the parser failing; the response carries the tail of its stderr, and the API log
has the whole thing.

## Running the whole thing

```bash
make start
```

Docker (Postgres + Redis) → wait for both → migrations → build the parser binary the API spawns →
API and web. It prints the URLs. `make stop` stops the containers; Ctrl-C only stops API and web.

Three things that used to bite and now do not, kept here because the symptoms are misleading:

- **`make test` truncates whatever `TEST_DATABASE_URL` points at**, falling back to `DATABASE_URL`
  when unset. With no `TEST_DATABASE_URL` the suite silently deletes the repositories you charted.
  `.env.example` documents it; create the database once with `make migrate-test`.
- **Redis has to be up before the API**, or sign-in returns 500 from `ioredis` and nothing in the
  error mentions Redis. `make start` waits for both services.
- **The parser binary is spawned by path**, so a stale one runs happily against a newer schema.
  `make start` rebuilds it; `make go-build-bin` alone if you only need that.

## Checks

Run these before every commit. `make help` lists every target.

```bash
make lint
make typecheck
make test
```

`make test` covers TypeScript **and** Go. A bare `pnpm -r test` skips the parser entirely.

**CI can fail while all of the above pass.** `apps/api/src/env.ts` validates the environment at
module scope, and locally `dotenv` finds your `.env` while CI has none — so a required key missing
from `.github/workflows/node-ci.yml` takes down every API test file at import with a ZodError that
names `env.ts` and never mentions the workflow. `apps/api/src/env.test.ts` guards it: add a key
without a default to the schema and it fails locally until `.env.example` and the workflow both
have it.

Useful parser commands while working:

```bash
make go-run REPO=./services/parser/testdata/sample          # writes out.json
cd services/parser && go run ./cmd/parser --repo ./testdata/golden --format summary
```

## Working through a phase

Each phase has an exit test in [`PLAN.md`](PLAN.md) and a chunk list in [`TASKLIST.md`](TASKLIST.md).
Within a chunk the order that works:

1. Schema or migration first, if the chunk needs one — everything downstream depends on its shape.
2. Core logic, with its test written in the same commit.
3. Wire it into the API or UI.
4. Run the chunk's "done when" test for real, not by inspection.
5. Tick the checkbox and commit.

Before starting a phase, check [`docs/RISKS.md`](docs/RISKS.md) for items marked open against it.
Some are manual setup that will block you an hour in if you skip them.

## Branches and commits

- `main` is the default branch. Work on `phase-N/short-description`.
- One PR per phase, opened when its exit test passes. CI must be green: lint, test, build, and the
  migration check.
- Squash-merge, then delete the branch. Tag phase completions: `git tag -a phase-2 -m "Storage and resolution"`.
- Commit messages are imperative and cover one concern — `add parser symlink hard-fail`, not
  `updates and fixes`.

## Verifying UI changes

The canvas cannot be fully checked from tests, and some of what a headless browser reports is not
true. Both are worth knowing before chasing a phantom.

- **React Flow draws an edge only once both of its nodes are measured**, via a `ResizeObserver`.
  jsdom has no layout engine, and a stub that reports a size drives `react-resizable-panels` into a
  re-layout loop that fails most of the suite. So **edges cannot be asserted in a test** — what
  decides *what* the edges are lives in `apps/web/src/lib/graph.ts` and is covered there; whether
  they paint is a browser check. A headless pane that never fires `ResizeObserver` shows nodes with
  no edges, which looks exactly like a bug and is not one.
- **Clicking a node has to land on the button, not the node.** React Flow reads a press on a node as
  the start of a drag; the `nodrag` class on the button is what lets the click through. A row that
  stops responding is usually a missing `nodrag`.
- **A function with no calls is not a broken expansion.** Roughly half the functions in a real
  repository are leaves. Nodes show a chevron when they open and a dot when they call nothing —
  check the affordance before assuming the canvas is stuck.

`sindresorhus/ky` is a good verification repository: small, TypeScript, and it has functions with
genuine unresolved calls, so all three confidence tiers and several ghosts appear.

## Conventions worth knowing before you trip on them

- **Migrations are append-only.** Never edit one that has been applied; add a numbered file. Every
  `*.up.sql` needs a matching `*.down.sql`.
- **Shared TypeScript types live only in `packages/shared`.** The Go parser cannot import them and
  keeps its own IR types in `internal/ir/ir.go` — this duplication is deliberate, see
  [`docs/RISKS.md`](docs/RISKS.md) R9.
- **Grammar versions are pinned** in `go.mod`. A bump is a deliberate change with a test run, not a
  `go get -u`.
- **Secrets come from the environment.** Rotate the webhook secret if it ever leaks.

## Quick reference

```bash
pnpm install
docker compose up -d postgres redis
docker compose up -d                                    # full stack, prod-like
migrate -path services/parser/migrations -database "$DATABASE_URL" up
make down                                               # roll back one migration
pnpm -r lint && pnpm -r typecheck && pnpm -r build && pnpm -r test
make go-test && make go-vet
make go-run REPO=./services/parser/testdata/sample
curl localhost:3000/healthz
```
