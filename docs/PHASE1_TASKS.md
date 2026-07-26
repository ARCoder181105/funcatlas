# Phase 1 — Parser Core + Isolation: Task List

> Working document for the builder (you). Fill in checkboxes as you go.
> Source of truth: `PLAN.md` (§3 Phase 1), `docs/PARSING_STRATEGY.md`, `docs/SECURITY.md`, `docs/DATA_MODEL.md`.
> Goal of Phase 1: **Given a local repo path, emit a complete, correct IR (functions + call sites + imports) for TypeScript, with production isolation in place. No DB writes, no UI.**

---

## Current state (Phase 0 & 1 — DONE)

The boilerplate and parser core are wired and runnable end-to-end:

- `services/parser/cmd/parser/main.go` — wires `clone.Prepare → ts.Extract → (Phase 2 stub)`.
- `services/parser/internal/clone/clone.go` — local path or `git clone --depth 1`; never runs install/build.
- `services/parser/internal/security/` — `Config` (env-driven caps), `ContainsRoot`, `Walk` (cap-enforcing file enumerator with symlink hard-fail and binary sniff).
- `services/parser/internal/security/path_test.go` — tests for containment, symlinks, caps.
- `services/parser/internal/ts/extract.go` — initializes tree-sitter-typescript language/parser, walks files, reads `.ts/.tsx`, and runs queries.
- `services/parser/internal/ir/ir.go` — Go-native `File`, `Function`, `CallSite`, `Import`, `Graph` structs.
- `services/parser/queries/typescript.scm` — query patterns loaded into Go via `//go:embed`.
- `services/parser/internal/resolver/resolver.go` — confidence constants + `Resolve()` stub.
- `services/parser/internal/db/writer.go` — pgx pool + sqlx connection; `WriteGraph` stub.
- `services/parser/migrations/0001_init.up.sql` — full schema.
- `services/parser/testdata/sample/repo.ts` — test fixtures.

So Phase 1 = **DONE**. We emit a complete, correct IR for TypeScript with production isolation in place.

---

## Task 1 — Finish the tree-sitter query-to-IR extraction  *(core of the phase)*

**File:** `services/parser/internal/ts/extract.go` (extend), possibly new `services/parser/internal/ts/queries.go`.

1. Load `queries/typescript.scm` → compiled queries against the TypeScript language. The `.scm` source is embedded at build time (via `//go:embed`) and compiled at runtime.
2. For each `.ts/.tsx` file, wrap `tree_sitter.NewLanguage` + `parser.Parse(src, nil)` to get a `Tree`, then run each query against the AST.
3. Populate `ir.Function` for each match:
   - `Name` from `@function.def` capture.
   - `StartLine`/`EndLine` from the declaration node's byte range → line (use `tree.ByteOffsetForPoint` / node start/end rows).
   - `Source` = slice of `src` between `StartLine`-1 and `EndLine` (trim to actual lines; keep as the full text of the function).
   - `QualifiedName` = scoped name (see Task 2).
   - `OverloadIndex` = 0 for now; only increment if you detect TS-style overloads (signatures with same name in one file). **Decision needed**: detect overloads now or defer to Phase 2? Recommend: record `(name, startLine)` now and resolve overload index in a post-pass — keep Phase 1 simpler.
   - `PackagePath` = the file's directory path relative to repo root (e.g. `src/components`). Derive from `ir.File.Path`.
4. Populate `ir.CallSite` for each `@function.call` capture:
   - `CalleeName` from the identifier / `property_identifier`.
   - `CallerQualified` = the enclosing function's qualified name (walk up the AST from the call node to the nearest `function_declaration`/`method_definition`/`arrow_function`/`function_expression`). For top-level calls with no enclosing function, use a synthetic caller like `<module>` or leave empty — **pick a convention and document it**.
   - `Line` from the call node's start row.
5. Populate `ir.Import` for `@import.from`: `From` = the string literal value (strip quotes), `Symbol` = the imported names (parse `import_statement`'s clause: default, named, namespace). Store the set of imported local names so the resolver can match.
6. Return a fully-populated `ir.Graph{Files, Functions, Calls, Imports}`.

**Edge cases to handle (and write tests for):**
- Comments and strings inside function bodies must NOT be mistaken for calls/defs — tree-sitter handles this natively (queries match nodes, not text), but verify.
- Nested functions (a function declared inside another) — do you capture the inner one as its own `ir.Function` with a deeper `QualifiedName`? **Yes**, per `DATA_MODEL.md` overload note. Decide qualified-name format, e.g. `outer.inner`.
- Arrow functions / function expressions assigned to `const`/`let` — the current `.scm` only matches `function_declaration` + `method_definition`. **Add**: `variable_declarator` under `lexical_declaration`/`variable_declaration` where the value is `arrow_function`/`function_expression`. Capture the variable name as `@function.def`.
- Generator functions (`function*`) and async functions (`async function`) — tree-sitter wraps them; confirm the `function_declaration` query still matches (it should).
- `.tsx` files (JSX) — same grammar branch `LanguageTSX` may be needed alongside `LanguageTypescript`. Confirm the binding exposes both; if not, pick the TS grammar and accept JSX may parse coarsely.

**Done when:** running `make go-run REPO=./services/parser/testdata/sample` prints (and can dump as JSON) the correct `Function` rows for `getUser`, `fetchName`, `Repo.sync`, and the correct `CallSite` for `getUser(1)` inside `Repo.sync` and `fetchName(id)` inside `getUser`.

---

## Task 2 — Qualified-name scoping convention

**File:** `services/parser/internal/ts/extract.go` (or a small `scope.go` helper); document in `docs/PARSING_STRATEGY.md`.

1. Define the format for `QualifiedName`. Proposed: dot-joined path of enclosing scopes → name, e.g.:
   - top-level `fetchName` → `fetchName`
   - method `Repo.sync` → `Repo.sync`
   - nested `fn` declared inside `getUser` → `getUser.fn`
2. Implement an "enclosing scope" walk: from a node, climb parents collecting `class_declaration`/`function_declaration`/`method_definition`/`arrow_function` names; join with `.`.
3. Make `package_path` = directory path of the file relative to repo root (no leading `./`, use `/`). For files at repo root, `package_path = ""` or `"."` — **pick one and use it consistently in queries**. Recommend `""`.
4. Add a unit test that parses a fixture with nesting and asserts the qualified names.

**Done when:** `functions.qualified_name` is unique per `(file, qualified_name)` in the sample, matching what the Phase 2 resolver + the DB `UNIQUE` constraint expect.

---

## Task 3 — Harden `security.Walk` for real-world repos

**File:** `services/parser/internal/security/path.go`, `config.go`, new `security_test.go`.

The current `Walk` enforces caps but has gaps flagged in `PLAN.md` §1.3:

1. **No symlink follow / symlink rejection.** `filepath.WalkDir` follows symlinks by default for the walked path; verify behavior and add an explicit `os.Lstat` check: if `info.Mode() & os.ModeSymlink != 0`, either skip or hard-fail. **Recommend: hard-fail** (return error) for any symlink under root, since untrusted repos shouldn't have legitimate symlinks in a path we're about to parse. Add a test: a fixture dir with a symlink to `/etc/hostname` must cause `Walk` to error (and never readlink it).
2. **Binary/non-text skip.** Before reading a file, sniff the first ~512 bytes for NULs (`bytes.IndexByte(buf, 0) != -1` → binary, skip). Don't rely on extension alone (a `.ts` file could be gibberish, a weird extension could be text).
3. **`.gitignore` respect (stretch / optional).** The skip-list already covers the big offenders (`node_modules`, `dist`, etc.). Respecting `.gitignore` adds correctness but ~complexity. **Decision:** defer to post-MVP unless a test repo fails because of it. Note the decision in `docs/RISKS.md`.
4. **Depth calc is fragile.** `strings.Count(path, sep) - strings.Count(root, sep)` breaks if `root` has trailing slash or symlinks. Replace with `filepath.Rel(root, path)` and count separators in the rel path. Less error-prone.
5. **File-count cap logging is informational only.** Add an explicit error return (or sentinel) so the caller can distinguish "capped" from "clean walk." Useful for queue later.
6. **Tests:** add `TestWalkSkipsBinary`, `TestWalkRejectsSymlinkOutsideRoot`, `TestWalkRespectsFileCountCap`, `TestWalkRespectsDepth`.

**Done when:** `go test ./internal/security/...` is green and covers every gap above.

---

## Task 4 — Pre-read size cap enforcement at the read site

**File:** `services/parser/internal/ts/extract.go`.

`security.Walk` already skips files over `MaxFileBytes` in the directory walk, BUT `extract.go` needs to ensure safety during the actual file read. Fix:

1. Use a bounded read (`io.LimitReader`) so a file that grows between the stat and the read can't OOM you. Truncate reads that exceed the cap.
2. Skip files binary-detected at read time (Task 3's sniffer), reused here.

**Done when:** a 5MB `.ts` fixture is skipped with a warning, not read in full.

---

## Task 5 — `ts.Extract` returns a `Graph` and `main.go` dumps JSON

**File:** `services/parser/cmd/parser/main.go`, possibly `services/parser/internal/ts/extract.go` signature change.

1. Change `extract.go`'s return type from `[]ir.File` to `ir.Graph` (populated in Task 1).
2. In `main.go`, after `ts.Extract(...)`, marshal `graph` to JSON and write to `out.json` (or stdout when a `--out` flag is `/dev/stdout`). Keep the Phase 2 `db.Writer` reference intact behind a flag or comment so you don't lose the wiring.
3. Add a `--format json|summary` flag: `summary` prints counts (`files`, `functions`, `calls`, `imports`) for quick sanity checks.
4. Confirm the sample run output matches expectations from Task 1's "done when."

**Done when:** `make go-run REPO=./services/parser/testdata/sample` writes a complete `out.json` with the expected functions/calls/imports, and `--format summary` prints human counts.

---

## Task 6 — Expand `testdata/` into a realistic regression corpus

**File:** `services/parser/testdata/{sample,snake,imports,nested,edge}/...` (new dirs).

The single `repo.ts` is too small to catch regressions. Add fixtures that each isolate one concern, plus an expected-output file the test asserts against:

1. `testdata/sample/repo.ts` — existing; the happy path.
2. `testdata/nested/` — functions nested 3 levels deep; class with several methods; arrow consts. Assert qualified names.
3. `testdata/imports/` — default import, named import, namespace import, side-effect import, re-export, dynamic `import()`. Assert `ir.Import` rows.
4. `testdata/calls/` — local call, method call (`obj.method()`), chained call (`a.b.c()`), imported-symbol call, call inside string/comment (must NOT be captured), call inside arrow callback.
5. `testdata/overloads/` — TS signature overloads (same name, multiple declarations). Verify overload handling decision from Task 1.
6. `testdata/edge/` — empty file, file with only comments, file with a huge minified-looking single line (to exercise the size/binary caps), `.tsx` with JSX, a `.ts` file with a symlink sibling (symlink should be rejected, target parsed if real).
7. For each, add a `_expected.json` or expected counts; the test loads the repo, extracts, and diff-asserts.

**Done when:** `go test ./internal/ts/...` runs against every fixture and passes.

---

## Task 7 — Tree-sitter query tests (golden)

**File:** `services/parser/internal/ts/extract_test.go` (new).

1. Test that every node type you rely on (`function_declaration`, `method_definition`, `call_expression`, `import_statement`, `variable_declarator` with `arrow_function`/`function_expression`) actually matches the fixtures. If a grammar update ever drops a node type, this test breaks loudly.
2. Test that comments and string literals containing the word `function` or a call-shaped text do NOT produce spurious matches.
3. Test the qualified-name scope walk on the nested fixture (Task 2).

**Done when:** all golden tests green; `go test ./...` from `services/parser` is clean.

---

## Task 8 — Parser Docker image with enforced isolation

**File:** `services/parser/Dockerfile`, `docker-compose.yml` (parser service block).

The `Dockerfile` exists but needs to bake in the runtime constraints from `docs/SECURITY.md`:

1. Multi-stage build: `golang:1.25` build → distroless/`alpine` runtime, **non-root user** (`USER nonroot`, UID 65532).
2. Install only `git` (for clone) in the runtime stage; nothing else. Remove shell if using distroless (then `git` must come from a build stage or you containerize clone differently).
3. Bake the `PARSER_*` env defaults into the image via `ENV` so even a misconfigured run is safe.
4. In `docker-compose.yml`, the `parser` service sets:
   - `read_only: true` (read-only rootfs)
   - `network_mode: none` (no network egress during parse — clone happens before entering parse, or via a sidecar; **decision needed**: how does `git clone` work with `network none`? Options: (a) clone in a separate one-shot container WITH network, then hand the volume to the parser container that runs with `network none`; (b) allow network only for clone phase. **Recommend (a)** — separate `parser-clone` and `parser-parse` containers sharing a tmpfs volume.)
   - `cap_drop: [ALL]`, no `cap_add`.
   - `tmpfs: [/tmp:size=100m]` for clones.
   - `mem_limit`, `cpus` bounds.
5. Runtime entrypoint runs only `parse` (no clone) — clone is a separate step/or container.
6. Add a `make docker-run-parser REPO=./services/parser/testdata/sample` target that mounts the repo read-only and runs parse against the shared volume, invoking the built binary.

**Done when:** `docker compose run --rm parser --repo /work/sample` runs as non-root, read-only rootfs, no network, and emits `out.json` successfully using the compiled Go binary. Verify with `docker inspect` that `NetworkMode=none` and `Cap` is empty.

---

## Task 9 — CI for the parser

**File:** `.github/workflows/go-ci.yml` and `.github/workflows/node-ci.yml` (split).

1. Job `parser`: `setup-go`, `go mod tidy` check, `go vet ./...`, `go test -race ./...`, `go build ./...`.
2. Cache `~/go/pkg/mod` and the build cache.
3. Job `parser-sample`: build the binary, run `--repo ./testdata/sample --format summary`, assert counts.
4. Job `migration-check`: pull `golang-migrate/migrate` image, spin up Postgres via `services:`, run `migrate -path services/parser/migrations -database $DATABASE_URL up`, then assert tables exist. (This guards the schema even though DB writes are Phase 2.)

**Done when:** a PR touching `services/parser/**` runs all jobs and they pass on the sample repo.

---

## Task 10 — Docs sync

**Files:** `docs/PARSING_STRATEGY.md`, `docs/RISKS.md`, `docs/SECURITY.md`.

1. In `PARSING_STRATEGY.md`: write the actual qualified-name convention (Task 2), the query-loading approach (runtime `.scm`), and the known limitations you hit (arrow functions, JSX, dynamic imports).
2. In `RISKS.md`: close/update risks R1–R18 that Phase 1 resolves (e.g. R1 naming → decision recorded; symlink/cap risks → closed; overload handling → decision recorded). Add any new risks discovered.
3. In `SECURITY.md`: replace aspirational bullets with the **implemented** controls (non-root, `--network none`, read-only, no symlink, size/count/binary caps) and the clone-vs-parse container split decision.
4. Update `DEVELOPMENT.md` "Phase 1" section with the exact commands now that they exist.

**Done when:** docs match the code; no aspirational "TODO" bullets in the Phase 1 sections.

---

## Definition of Done — Phase 1

All of the following pass:

- [x] `make go-run REPO=./services/parser/testdata/sample` emits a correct `out.json`.
- [x] `make go-test` is green across `internal/security`, `internal/ts` (all fixtures).
- [x] `make go-vet` clean.
- [x] `docker compose run --rm parser ...` runs isolated (non-root, read-only, `network none`, no caps) and parses the sample.
- [x] Symlink-to-escape fixture is rejected; 5MB file is skipped; binary file is skipped — all via tests.
- [x] CI workflow green on a PR.
- [x] `docs/PARSING_STRATEGY.md`, `docs/RISKS.md`, `docs/SECURITY.md` reflect implemented behavior.

---

## Naming/status notes (carry from Phase 0)

- **Decided — overload index:** Assign `overload_index` 0..n-1 in a post-pass per file to ensure DB uniqueness. (See PRD.md §11)
- **Decided — `.scm` query load:** Embedded at build time via `//go:embed` and compiled at runtime. (See PRD.md §11)
- **Decided — `.gitignore` respect:** Deferred post-MVP. (See PRD.md §11)
- **Decided — clone vs parse containers:** Separate `parser-clone` (network enabled) → shared tmpfs → `parser-parse` (`network none`). (See PRD.md §11)
- **Still deferred to Phase 2** (don't build these now): DB writes (`db.Writer.WriteGraph`), the resolver algorithm (`resolver.Resolve` confidence tagging), Drizzle read-side, API graph endpoints.
- **Naming** (`funcatlas` repo vs `CodeCanvas` product) remains unresolved (deferred to Phase 3).
