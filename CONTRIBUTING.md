# Contributing to funcatlas

Thanks for looking. This document is the short version of how a change gets made here and what
review will ask about. [`CLAUDE.md`](CLAUDE.md) is the long version — it is addressed to an
assistant, but it is the honest map of this repository and worth ten minutes before a first change.

## Get it running

You need **Docker**, plus `make` and `openssl`.

```bash
git clone https://github.com/ARCoder181105/funcatlas.git
cd funcatlas
make setup
docker compose up
```

Then open <http://localhost:5173>, paste a public repository URL, and watch it chart.

`docker compose up` has no hot reload. To work on the code you want the services running natively,
which needs three more things:

- **Node 24+** and **pnpm** (`npm i -g pnpm`) — pnpm 11 does not run on Node 20
- **Go 1.25+** with a C toolchain (`gcc`) — tree-sitter uses cgo
- **golang-migrate**, or the `migrate/migrate` Docker image that CI uses

```bash
pnpm install
make start   # infra in compose, api + web + worker natively, with watch
```

Stop the compose worker before running tests. It consumes the same queue the queue tests assert on;
`make test` refuses to run rather than failing obscurely.

## Driving the API by hand

Under the default single-user setup there is no session to obtain, so `curl` works directly:

```bash
curl localhost:3000/healthz
curl localhost:3000/auth/me
curl -X POST localhost:3000/api/repos \
  -H 'content-type: application/json' \
  -d '{"githubUrl":"https://github.com/sindresorhus/ky"}'
```

That returns immediately — the parse runs on the queue, so watch `parseStatus` rather than the
request. Then walk the graph:

```bash
curl localhost:3000/api/repos
curl localhost:3000/api/repos/1/tree
curl localhost:3000/api/files/1/functions
curl 'localhost:3000/api/functions/1/edges?depth=3&direction=out'
curl localhost:3000/api/functions/1/source
curl 'localhost:3000/api/repos/1/search?query=get&limit=10'
```

With real GitHub sign-in turned on instead, every `/api` route needs the `funcatlas_session` cookie.
Sign in through a browser, copy it out of devtools, and pass it in a jar:

```bash
printf 'localhost\tFALSE\t/\tFALSE\t0\tfuncatlas_session\t<paste-value>\n' > jar
curl -b jar localhost:3000/auth/me
```

A 401 means the jar is empty or the session expired.

## Before you open a pull request

```bash
make test        # TypeScript AND Go. `pnpm -r test` silently skips the parser
make lint
make typecheck
make go-vet      # deliberately not part of `make test`
```

Integration tests read `TEST_DATABASE_URL`, falling back to `DATABASE_URL`, and **skip** when
neither is set. A green run that never touched Postgres proves nothing, so check that `make setup`
created `funcatlas_test`.

**CI can fail while every command above passes.** `apps/api/src/env.ts` validates the environment at
module scope. Locally `dotenv` finds your `.env`; CI has none, so a required key missing from
`.github/workflows/node-ci.yml` takes down every API test file at import, with a ZodError that names
`env.ts` and never mentions the workflow. `apps/api/src/env.test.ts` guards it: add a key without a
default and it fails locally until `.env.example` and the workflow both carry it.

Three more that bite, kept here because the symptoms mislead:

- **`make test` truncates whatever `TEST_DATABASE_URL` points at**, falling back to `DATABASE_URL`
  when it is unset. Without it the suite deletes the repositories you charted.
- **Redis has to be up before the API**, or sign-in returns a 500 from `ioredis` and nothing in the
  error mentions Redis.
- **The parser binary is spawned by path**, so a stale one runs happily against a newer schema.
  `make start` rebuilds it; `make go-build-bin` on its own if that is all you need.

## Checking a UI change

The canvas cannot be fully covered by tests, and some of what a headless browser reports is untrue.
Both are worth knowing before chasing a phantom.

- **React Flow draws an edge only once both nodes are measured**, via a `ResizeObserver`. jsdom has
  no layout engine, and a stub that reports a size drives `react-resizable-panels` into a re-layout
  loop that fails most of the suite. So **edges cannot be asserted in a test** — *what* the edges are
  is covered in `apps/web/src/lib/graph.ts`; whether they paint is a browser check. A headless pane
  that never fires `ResizeObserver` shows nodes with no edges, which looks exactly like a bug.
- **A click has to land on the button, not the node.** React Flow reads a press on a node as the
  start of a drag; the `nodrag` class is what lets the click through. A row that stops responding is
  usually a missing `nodrag`.
- **A function with no calls is not a broken expansion.** Roughly half the functions in a real
  repository are leaves. A node shows a chevron when it opens and a dot when it calls nothing.

`sindresorhus/ky` is a good repository to verify against: small, TypeScript, and it produces all
three confidence tiers with several ghost nodes.

## The four things review will ask about

These are not style preferences. Each one is a bug this repository has already had.

**1. A test ships in the same commit as the code it tests.** Not the commit after. If the change is
genuinely untestable — edge rendering is, because jsdom has no layout engine — say so in the PR and
say what you checked in a browser instead.

**2. The second occurrence gets extracted.** Not the third. Shared helpers live in a `utils`
package, one file per concern, and every shared literal lives in a constants file
(`services/parser/internal/utils/constants.go` on the Go side, `constants.ts` per module on the
TypeScript side). No magic strings inline. `CLAUDE.md` has a table of where each kind of shared code
belongs.

**3. Install the component, do not write it.** Reach for shadcn (`npx shadcn@latest add <name>`)
before writing a dialog, a tree row, or a button by hand. Hand-rolled markup is more to review, more
to maintain, and worse on accessibility than the published thing. If nothing in the registry does
the job, say which one you looked for.

**4. Comments explain *why*, in one line.** Never restate what the code plainly says. Long comments
go stale and then mislead.

Three more that are not negotiable because a mistake is silent:

- **Migrations are append-only.** Never edit one that has been applied; add a numbered file. Every
  `*.up.sql` needs a matching `*.down.sql`. The single source is `services/parser/migrations/`, read
  by both the Go writer and the TypeScript reader.
- **Grammar versions are pinned** in `services/parser/go.mod`. A bump is a deliberate change with a
  test run behind it, never a `go get -u`.
- **Shared TypeScript types live only in `packages/shared`.** The Go parser cannot import them and
  keeps its own IR types in `internal/ir/ir.go`. That duplication is deliberate — R9 in
  [`docs/RISKS.md`](docs/RISKS.md).

## Adding a language

This is the most self-contained way to contribute something real. It is three files, and the third
is not optional:

1. A `Spec` in `services/parser/internal/extract/<language>.go`, registered in `spec.go`
2. A tree-sitter query in `services/parser/queries/<language>.scm`, with all three captures —
   `spec_test.go` fails if one is missing
3. A fixture in `services/parser/testdata/` that pins the **calls** inside the language's hardest
   construct, not just the function names

That third point is the whole reason a language ever ships broken. **One grammar per extension,
never shared.** A mismatched grammar fails *silently*: the body parses as an `ERROR` node, the
declaration still matches, and every call inside is dropped. A fixture that only asserts function
names passes anyway. `tree-sitter-javascript` is the one exception — it reads JSX in any file, so
`.js` and `.jsx` share it.

Read [`docs/PARSING_STRATEGY.md`](docs/PARSING_STRATEGY.md) first, especially "Per-language
extraction limits".

## The one rule about resolution

`resolution_confidence` is `exact`, `name_match` or `unresolved`, drawn solid, dashed and dotted.
**Ambiguity resolves to `unresolved`, never to a guess.** A wrong edge is read as fact and costs
more than the missing one it replaced. If a change makes the resolver more confident, the PR needs
to explain why the new confidence is earned.

The resolver *partitions* candidates by language group; it does not filter by them. Do not write a
test that decides what to allow by calling `utils.ResolutionGroup` — it agrees with itself when
broken. See R36 in [`docs/RISKS.md`](docs/RISKS.md).

## Commits and pull requests

- One concern per commit, imperative subject: `add a fixture for Rust macro calls`, not
  `fixes + cleanup`.
- **No `Co-Authored-By` trailers and no tool-attribution footers**, in commit messages or PR bodies.
- Branch off `main`. Never push to `main`.
- The PR body should say what changed and, if the change is subtle, what would have gone wrong
  without it.

## Where to look

| Question | File |
|---|---|
| What are we building, and what counts as done? | [`PRD.md`](PRD.md) |
| How is the repository organised, and what bites if ignored? | [`CLAUDE.md`](CLAUDE.md) |
| What is the schema? | [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) |
| How do extraction and resolution work? | [`docs/PARSING_STRATEGY.md`](docs/PARSING_STRATEGY.md) |
| What is still undecided or risky? | [`docs/RISKS.md`](docs/RISKS.md) |
| Why does the canvas behave like that? | [`docs/CANVAS_DECISIONS.md`](docs/CANVAS_DECISIONS.md) |
| What should the UI look like? | [`docs/UI_GUIDE.md`](docs/UI_GUIDE.md) |

## Reporting a security issue

Do not open a public issue. Email the address on the maintainer's GitHub profile.
[`docs/SECURITY.md`](docs/SECURITY.md) records what the parser does and does not protect against —
in particular, the isolation harness is **not** the path the product runs on (R38).

## Licence

By contributing you agree your work is licensed under the MIT licence in [`LICENSE`](LICENSE).
