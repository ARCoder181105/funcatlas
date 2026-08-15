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
To work on the API without one, use `/auth/dev-login` below.

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

Open <http://localhost:5173>, not the API's port. Signed out you get the sign-in card; **Continue as
a local dev user** skips GitHub entirely, so the whole UI is usable without an OAuth app.

### `WEB_APP_URL`

Where the OAuth callback sends the browser once a session exists — the **web** app, `:5173`. It was
called `APP_PUBLIC_URL` and pointed at `:3000` until Phase 3b, which meant a successful GitHub login
dropped the user on a JSON endpoint. If you have an older `.env`, rename the key:

```bash
sed -i 's|^APP_PUBLIC_URL=.*|WEB_APP_URL=http://localhost:5173|' .env
```

The API fails fast on start if it is missing, so you will know immediately.

## Driving the API by hand

Everything under `/api` needs a session, so start by getting one into a cookie jar. `/auth/dev-login`
only exists outside production; the real flow is `/auth/login` in a browser.

```bash
curl -c jar -X POST localhost:3000/auth/dev-login    # 204, sets the session cookie
curl -b jar localhost:3000/auth/me                   # {"userId":0,"login":"dev"}
```

Register a repository. This clones and parses inline, so the request takes as long as the parse:

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

## Checks

Run these before every commit. `make help` lists every target.

```bash
pnpm -r lint
pnpm -r typecheck
pnpm -r test
cd services/parser && go vet ./... && go test -race ./...
```

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
