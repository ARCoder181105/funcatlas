# Phase 3a — API and Auth

The live task list. Phase 2 put a confidence-tagged call graph in Postgres. Phase 3a puts a login in
front of it and makes every endpoint that serves it real, so the whole product is exercisable with
`curl` before any UI exists.

**Branch:** `phase-3a/api-and-auth`
**Reference:** [`PLAN.md`](PLAN.md) Phase 3 · [`docs/SECURITY.md`](docs/SECURITY.md) ·
[`docs/DATA_MODEL.md`](docs/DATA_MODEL.md)

## How to work through this

Claude implements; you review at the phase gate. One chunk at a time, top to bottom — the order is
load-bearing: A0 unblocks every test, A1 unblocks A2 and A4, and A5 has to exist before A6 has data
to serve. Each chunk lists:

- **Why** — the reason it exists, so it can be pushed back on if the reason is wrong.
- **Where** — the files it touches.
- **Do** — the work, broken into steps.
- **Done when** — the objective test. Not "the code compiles".
- **Watch for** — the specific bugs to check for before the chunk is committed.

Write the test in the same commit as the code it tests. Commit one chunk at a time with an
imperative message. `[ ]` todo · `[~]` in progress · `[x]` done.

## What this phase actually teaches

| Chunks | Concept | Where else you'll meet it |
|---|---|---|
| A1 | Opaque server-side sessions — why the cookie holds a lookup key and never the data | Every stateful web app that isn't doing JWTs |
| A2 | The OAuth authorization-code flow, and what the `state` parameter is actually defending against | Every "sign in with X" button you will ever wire |
| A4 | Middleware and encapsulation — applying a rule once to a whole subtree of routes instead of per handler | Express, Fastify, Rails, Django, Spring |
| A5 | Shelling out safely — argv arrays, timeouts, and why user input must never reach a shell | Any service that drives an external tool |
| A6 | Keeping SQL out of handlers, and 404-vs-empty-list as an API design decision | Every REST or RPC service you write |

A2 is the one worth slowing down for. Nearly every OAuth tutorial online gets `state` wrong, and the
current code has a literal `"state-placeholder"` in it — a live CSRF hole that this chunk closes.

## What Phase 3a does not build

Not gaps — deliberate scope. Say so now if you disagree, not at the gate.

- **No users table, no multi-tenancy.** `docs/SECURITY.md` gates every endpoint "even in single-user
  mode", and PRD §4 puts multi-user out of scope. The session carries the GitHub user id; no repo
  ownership column exists, so there is no "someone else's repo" case to 404 on.
- **No queue.** `POST /api/repos` runs the parser synchronously. Phase 4 replaces the spawn.
- **No UI.** That is 3b. The exit gate for this phase is a `curl` session.
- **Public repositories only.** See A2 on the GitHub scope.

---

## A0 — Make the app injectable  `[x]`

**Why.** `apps/api/src/index.ts` builds a Fastify instance and calls `listen()` at module top level.
Importing it from a test starts a server on port 3000. Every route test in this phase needs
`app.inject()`, so the split has to happen before anything else does.

A second problem surfaces the moment a test imports the app: `env.ts` used `import "dotenv/config"`,
which resolves `.env` against the working directory. The only `.env` is at the repo root, so
anything started from `apps/api` — tsx, vitest — got no environment at all and failed the fail-fast
parse.

**Where.** `apps/api/src/app.ts` (new), `apps/api/src/index.ts`, `apps/api/src/env.ts`,
`apps/api/src/app.test.ts` (new), `apps/api/package.json`, `.github/workflows/node-ci.yml`

**Do.**

1. Extract `buildApp()` into `app.ts`: registers cors, cookie and rate-limit, mounts `/healthz` and
   the auth and graph routes, returns the instance without listening. `index.ts` keeps only the
   `listen()` call and its error handling.
2. Add `@fastify/cookie`, registered with `SESSION_SECRET`. A1 needs it; registering a plugin is
   part of building the app, so it belongs in the same chunk as the builder.
3. Silence the logger under `NODE_ENV=test`. Pino writes a line per injected request otherwise, and
   a failing assertion gets lost in it.
4. Anchor dotenv to the repo root via `import.meta.dirname` rather than the working directory. The
   path resolves the same from `src/` and from the compiled `dist/`.
5. Give CI the environment it has no `.env` for. Placeholder values — no test reaches GitHub.

**Done when.** A test builds the app, injects `GET /healthz`, gets a 200, and asserts
`app.server.listening === false`. It runs from `apps/api` as its working directory, which is what
proves the dotenv fix: there is no `apps/api/.env`.

**Watch for.** Registering the cookie plugin after the routes that read cookies — Fastify plugin
order is load-bearing. `import.meta.dirname` needs Node 20.11+; CI is on 22.

---

## A1 — Sessions in Redis  `[x]`

**Why.** There is no session anywhere in the codebase. `/auth/callback` returns 501 and every
`/api/*` route is open to the internet. Sessions come before OAuth because the callback's last step
is "create a session", and before the route gate because the gate is "read a session".

The cookie holds an opaque random id and nothing else. Not the GitHub token, not the user id, not a
signed blob of claims — a key into Redis. Anything in the cookie is in the browser, and a token in
the browser is a token in whatever reads it.

**Where.** `apps/api/src/auth/session.ts` (new), `apps/api/src/auth/session.test.ts` (new),
`apps/api/src/redis.ts` (new), `.github/workflows/node-ci.yml`

**Do.**

1. `createSession(user)` — 32 bytes from `node:crypto` hex-encoded, `SETEX session:<id>` holding the
   GitHub user id, login and access token, expiring at `SESSION_TTL`.
2. `readSession(id)` and `destroySession(id)`.
3. Cookie helpers: `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` when `NODE_ENV=production`,
   `maxAge` matching the Redis TTL so the two expire together.
4. `requireSession` — a Fastify `preHandler` that reads the cookie, looks Redis up, attaches the
   session to the request, and replies 401 otherwise.
5. Sign the cookie with `SESSION_SECRET`, so a forged id is rejected before Redis is touched.
6. Give the session store its own Redis connection. `queue.ts` set `maxRetriesPerRequest: null`,
   which BullMQ requires and a request path must never have — it turns an outage into a hung
   request. That file is unused, so it goes; Phase 4 opens its own connection.
7. Drop the now-unused `oslo` dependency. `node:crypto` covers the randomness, and oslo is
   deprecated upstream.
8. Add a Redis service to node-ci. `REDIS_URL` is always set, so there is no skip path: without
   a server the tests fail.

**Done when.** Tests cover: a created session reads back; the Redis key carries a TTL within a second
of `SESSION_TTL`; a destroyed session reads back as null; a corrupt value reads as null rather than
throwing; `requireSession` 401s with no cookie, on an unknown id, and on a destroyed session.

The signature test is written so it can fail: it presents a **live, real** session id with no
signature attached. Only the signature check can produce the 401, so deleting that check turns the
test green at 200 — which is how you know it is testing something.

**Watch for.** `SameSite=Strict` breaks the OAuth redirect — the browser arrives from github.com and
a strict cookie is not sent. Reusing one Redis key prefix for sessions and BullMQ jobs. Returning
the access token in any response body, including an error.

---

## A2 — The real OAuth flow  `[x]`

**Why.** `auth/routes.ts:16` passes the literal `"state-placeholder"` as the OAuth state. That is a
CSRF hole with a name: an attacker sends a victim a crafted callback URL and the victim's browser
logs in as the attacker, because nothing ties the callback to the login that started it. Callback
and logout are 501s.

**Where.** `apps/api/src/auth/routes.ts`, `apps/api/src/auth/github.ts` (new),
`apps/api/src/auth/cookies.ts` (new), `apps/api/src/test-helpers.ts` (new),
`apps/api/src/auth/routes.test.ts` (new)

**Do.**

1. `/auth/login` — 32 random bytes as state, into a `HttpOnly` cookie with a ten-minute TTL, then
   redirect to the URL arctic builds. Drop the `await`: arctic 3's `createAuthorizationURL` is
   synchronous and awaiting it hides that.
2. Scope: **`read:user`**. GitHub OAuth apps have no read-only repository scope — the choice is
   `repo`, which also grants *write* to every private repository the user can reach, or a public-only
   scope. Nothing in this phase reads a private repository, so the narrow scope is correct until a
   phase actually needs one. Recorded in `docs/RISKS.md`.
3. `/auth/callback` — validate with the existing `oauthCallbackSchema`, compare the state against the
   cookie with `timingSafeEqual` after a length check, clear the state cookie, exchange the code,
   fetch the GitHub user, create the session, redirect to `APP_PUBLIC_URL`.
4. `/auth/logout` — destroy the Redis key and clear the cookie.
5. `/auth/me` — the current user, or 401. 3b needs it to decide what to render.
6. Every failure returns 400 with a flat message: missing state cookie, mismatched state, arctic
   `OAuth2RequestError`, non-200 from GitHub. None of them reach the default 500 handler.
7. Logout is a POST. With `SameSite=Lax` a cross-site *GET* navigation still carries the cookie,
   so any page that can make the browser navigate could log the user out; a cross-site POST
   carries no Lax cookie at all.
8. Extract the cookie plumbing into `auth/cookies.ts` — the state cookie is the second thing to
   need signed set-and-read, so the helper stops being speculative and becomes a deduplication.

**Done when.** Fourteen tests, with `fetch` stubbed so github.com is never contacted. They cover the
full happy path through to `/auth/me`; a missing state cookie; a mismatched state; a replayed
state; a rejected code; a failed user lookup; and logout destroying the Redis entry, not just the
cookie.

The rejection tests stub a *working* GitHub deliberately, so the exchange would succeed if it were
reached. A 400 can then only have come from the state check — deleting that check turns four tests
into 302s, which is how you know they test something. Verified by doing exactly that.

**Watch for.** Comparing state with `===` (timing) or forgetting to clear the state cookie (replay).
Trusting `code` before `state` — validate state first, always. `redirect_uri` must match the OAuth
app registration byte for byte, trailing slash included.

---

## A3 — Dev login, gated  `[x]`

**Why.** Phase 3b and every route test need a session. Going through GitHub for one makes tests
depend on the network and a live OAuth app.

**Where.** `apps/api/src/auth/routes.ts`, `apps/api/src/auth/routes.test.ts`

**Do.** Register `POST /auth/dev-login` only when `NODE_ENV` is `development` or `test`. It creates a
session for a fixed fake user with no token. Comment it as Phase 4 removal.

**Done when.** It returns a usable session cookie under `test` without any call to GitHub, and the
route does not exist — 404, not 401 — when `NODE_ENV=production`.

`env` is parsed once at import, so the production test rebuilds the whole module graph under a
stubbed `NODE_ENV` rather than trying to mutate it in place. It also asserts `/auth/login` still
answers 302 in that same rebuilt app, so a broken build cannot masquerade as a working gate.

**Watch for.** Gating inside the handler instead of around the registration. A production 401 says
"this endpoint exists, bring credentials"; a 404 says nothing.

---

## A4 — Gate every `/api/*` route  `[ ]`

**Why.** All six graph endpoints are open. `docs/SECURITY.md:19`: every graph-serving endpoint is
session-gated, anonymous requests rejected even in single-user mode.

**Where.** `apps/api/src/routes/graph.ts`, `apps/api/src/app.ts`,
`apps/api/src/routes/graph.test.ts` (new)

**Do.** Move the graph routes inside a Fastify plugin scope carrying a single
`addHook("preHandler", requireSession)`. One hook for the subtree, not one line per route — a
per-route gate is a gate someone forgets to copy onto route seven.

**Done when.** A table-driven test walks every `/api/*` route and asserts 401 with no cookie and 401
with a forged one, and that the same routes answer with a dev-login session.

**Watch for.** Registering the hook outside the plugin scope, which gates `/healthz` and the auth
routes too — including the login that is supposed to be reachable logged out.

---

## A5 — Repo registration runs a parse  `[ ]`

**Why.** Nothing can put a repository into the database except a human running the parser CLI. The
product's first action is "paste a GitHub URL".

**Where.** `services/parser/internal/clone/clone.go`, `services/parser/cmd/parser/main.go`,
`apps/api/src/repos/register.ts` (new), `apps/api/src/routes/repos.ts` (new), `apps/api/src/env.ts`,
`Makefile`

**Do.**

1. Parser: resolve the commit with `git rev-parse HEAD` after cloning, so `--commit` becomes
   optional. Otherwise the API has to clone the repository a second time purely to learn the SHA.
2. Normalise the URL before storing — strip a trailing slash and `.git`, lowercase the host — so one
   repository cannot land twice under two spellings and produce two disjoint graphs.
3. `POST /api/repos` validates with the existing `repoUrlSchema`, then spawns `PARSER_BIN` through
   `execFile` with an **argv array**. Never a shell, never string interpolation: the URL is user
   input, and `; rm -rf` is a valid substring of a string that passes a URL check.
4. New env `PARSER_BIN` and `PARSE_TIMEOUT_MS`, plus a Makefile target that builds the binary.
5. Non-zero exit becomes a 502 carrying the tail of stderr, not a 500.

**Done when.** A Go test asserts the resolved SHA is 40 hex characters. API tests use a stub script
as `PARSER_BIN` to drive both exits: an invalid URL is 400, a parser failure is 502, and success
returns the repo row.

**Watch for.** `exec` instead of `execFile`. No timeout — a hung clone holds the connection until the
client gives up. Trusting `repoUrlSchema` as a security boundary: it checks the string contains
`github.com`, which `https://evil.com/#github.com` also does. The argv array is what makes that
harmless, not the schema.

---

## A6 — The five 501 endpoints  `[ ]`

**Why.** `routes/graph.ts:11-15` — five endpoints return 501. They are the entire read surface of the
product, and 3b cannot render anything without them.

**Where.** `apps/api/src/graph/queries.ts`, `apps/api/src/routes/graph.ts`,
`apps/api/src/graph/queries.test.ts`, `apps/api/src/routes/graph.test.ts`

**Do.** All SQL in `queries.ts`; handlers validate, call, and reply.

| Endpoint | Returns |
|---|---|
| `GET /api/repos` | Every repo with its file and function counts |
| `GET /api/repos/:repoId/tree` | Flat `{id, path, language, functionCount}` ordered by path |
| `GET /api/files/:fileId/functions` | Functions with lines and qualified name, no source |
| `GET /api/functions/:fnId/source` | `{source, startLine, endLine, path}` |
| `GET /api/repos/:repoId/search` | Name matches, prefix ranked above substring |

The tree stays flat — the client nests it. Building the hierarchy in SQL costs a recursive query to
produce something the sidebar has to walk anyway. The function list omits source because a file with
two hundred functions would ship two hundred function bodies to render a list of names.

**Done when.** Each endpoint has a happy path and a 404 tested against real Postgres, and search has
a test pinning that a prefix match outranks a substring match.

**Watch for.** Returning `[]` for an unknown id — "this repo has no files" and "this repo does not
exist" are different answers and the UI cannot tell them apart. Search that forgets to scope through
`files.repo_id` and returns another repository's functions. Unescaped `%` and `_` in the `ILIKE`
pattern, which are wildcards the user did not ask for.

---

## A7 — CI, docs, and the exit gate  `[ ]`

**Why.** The docs still describe a phase that has not shipped, and a document that lies is worse
than no document. This is the chunk where the ones this phase invalidated get corrected, while the
reasons are still fresh.

**Where.** `.env.example`, `DEVELOPMENT.md`, `CLAUDE.md`, `PLAN.md`, `docs/RISKS.md`

**Do.** Document the new env keys and how to log in and register a repo locally. Record the
`read:user` scope decision in the risk list. Update the phase status and the known-gaps section in
`CLAUDE.md`.

**Done when.** No document describes behaviour the code does not have.

---

## Exit gate

Phase 3a is finished when all of these hold:

- [x] The app can be built and injected without binding a port, from any working directory (A0).
- [x] A session is an opaque id in a `HttpOnly` cookie and its data never leaves Redis (A1).
- [x] OAuth state is random per login, verified on callback, and single-use (A2).
- [x] The dev-login route does not exist in production (A3).
- [ ] Every `/api/*` route 401s without a session (A4).
- [ ] A GitHub URL posted to `/api/repos` ends with that repo's graph in Postgres (A5).
- [ ] All six graph endpoints return real data, and 404 on an unknown id (A6).
- [ ] `pnpm -r build`, `pnpm -r test` and the Go suite are green, and CI passes (A7).

**The gate itself:** with the session cookie, `curl` through login → register a repo → tree →
functions → edges → source → search. Then repeat one of them without the cookie and get a 401.

## Conventions

- Never edit a migration that has been applied. Add a numbered one.
- Route handlers validate and reply. SQL lives in `graph/queries.ts`.
- Shared types and schemas go in `packages/shared`, never duplicated between api and web.
- Tests go in the commit with the code they test.
- One concern per commit, imperative message.
