# TASKLIST — guided Phase 1 build (parser core + isolation)

> Working contract for the build. **You write the code; Copilot debugs/reviews/guides.**
> Finish one chunk → run its tests → "good when …" met → Copilot nudges you to the next.
> Source of truth: `PLAN.md` §3 Phase 1, `docs/PHASE1_TASKS.md`, `docs/PARSING_STRATEGY.md`,
> `docs/SECURITY.md`, `docs/DATA_MODEL.md`, and `PRD.md`.

**Current branch:** `phase-1/parser-core-and-isolation` · **PR:** #21.
**Verified state:** Phase 0 skeleton is complete & runnable. Real tree-sitter extraction, resolver,
isolation hardening, and the isolated Docker image are **not yet implemented**. The goal of these
chunks is to land Phase 1 with no DB writes and no UI.

### Legend
- `[ ]` todo · `[~]` in progress · `[x]` done
- **Good when:** the objective acceptance test for the chunk (automated or manual).
- **Watch outs:** bugs Copilot will check when you submit the chunk.

---

## Phase 1 — chunks

### C1 — Runtime-load `queries/typescript.scm`  `[ ]`
**Approach:** Add `services/parser/internal/ts/queries.go` that reads `queries/typescript.scm` at
runtime (embed via `//go:embed` so the binary stays self-contained) and compiles it with
`tree_sitter.NewQuery(language, source)`. Expose `func loadQueries(lang tree_sitter.Language) (*Queries, error)`
returning one compiled query per node pattern (`function.def`, `function.call`, `import.from`).
Wire `extract.go` to call it once per run (not per file).
**Good when:** `go test ./internal/ts/...` has a test that compiles the bundled `.scm` against the
TypeScript language without error and the four pattern names are reachable.
**Watch outs:** using the wrong grammar (`LanguageTypescript` vs `LanguageTSX`); compiling queries
per-file (slow); missing `//go:embed` tag; query capture names not matching `@function.def` etc.

### C2 — Populate `ir.Function` from `@function.def`  `[ ]`
**Approach:** Extend `extract.go` to run the `function.def`/`function.call` queries per file via
`QueryCursor`. For each `@function.def` capture: `Name` = identifier text; `StartLine`/`EndLine`
from the declaration node's start/end row; `Source` = `src` sliced between `StartLine-1` and
`EndLine`; `PackagePath` = `filepath.Dir(rel)` relative to repo root (`""` for repo-root files);
`QualifiedName` and `OverloadIndex` left to C4/C4b (set bare `Name` for now).
**Good when:** `make go-run REPO=./services/parser/testdata/sample` prints `Function` rows for
`getUser`, `fetchName`, and `Repo.sync` with correct line ranges and `Source`.
**Watch outs:** byte→line conversion (use the node's `start_point`/`end_point` row, not byte
offset); off-by-one on `EndLine`; slicing `src` using line indices without splitting cleanly on
`\n`; not handling `function_declaration` inside class context.

### C3 — Add arrow/function-expression capture  `[ ]`
**Approach:** Extend `queries/typescript.scm` to capture
`(lexical_declaration (variable_declarator name: (identifier) @function.def value: [(arrow_function) (function_expression)]))`
(and the `const`/`let` → `var_declaration` variant). Handle named function expressions where
present. Treat the variable name as the function name.
**Good when:** a fixture with `const greet = (n) => {...}` and `let f = function(){}` extracts two
`Function` rows with the variable name as `Name`.
**Watch outs:** matching `variable_declarator` whose value is *not* a function (e.g. a plain
object) — your query must require the `arrow_function`/`function_expression` child; arrow bodies
that are single *expressions* (no `statement_block`); async/generator modifiers.

### C4 — Qualified-name scope walk  `[ ]`
**Approach:** Add `services/parser/internal/ts/scope.go` with `func qualifiedName(node Node) string`
that walks parents collecting `class_declaration`/`function_declaration`/`method_definition`/
`arrow_function`/`function_expression` names (the variable name for arrows), then joins with `.`.
Convention (lock into `docs/PARSING_STRATEGY.md` in C14):
- top-level function → bare `Name` (e.g. `getUser`);
- class method → `Repo.sync`;
- nested function → `getUser.inner`;
- module-level call (no enclosing function) → caller `qualified_name = "<module>"`;
- `package_path` = `filepath.Dir(rel)` relative to repo root, `""` at repo root.
**Good when:** a `testdata/nested/` fixture produces qualified names `Repo.sync`, `Repo.sync.cb`,
`getUser`, `getUser.inner` (assert in C11).
**Watch outs:** order of parent walk (innermost scope first) — join in reverse so outer comes
first; arrow functions where the "name" lives on the `variable_declarator`, not on the arrow node;
anonymous functions nested with no enclosing name (use a placeholder like `<anonymous>` and
document it).

### C4b — Overload `overload_index` post-pass (future-proof)  `[ ]`
**Approach:** After building the per-file `[]ir.Function`, run `assignOverloadIndices(funcs)`:
group by `qualified_name`, sort each group by `start_line` ascending, assign `overload_index =
0..n-1`. Single-declaration `qualified_name`s get `0`. Because the scope walk (C4) already gives
different `qualified_name`s to same-name-different-scope functions, those do **not** collide and
each gets `0` — only genuine TS overloads (same `qualified_name`, several declarations) get
0,1,2,…
**Why future-proof (decision locked in `PRD.md` §11):** `overload_index` is part of the DB
`UNIQUE (file_id, qualified_name, overload_index)` key, so Phase 4's delete-then-reinsert
incremental relink never hits a `UNIQUE` collision; keyed by `start_line` ⇒ stable across identical
re-parses (no flapping rows on webhook updates). Phase 2's resolver tags edges to overloaded
`qualified_name`s `unresolved` (R8) — no rework later.
**Good when:** `(file, qualified_name)` is unique in every fixture output; an `overloads/`
fixture with two `fetch` declarations yields `overload_index` 0 and 1.
**Watch outs:** mutating the slice in place vs. building a map — be consistent; off-by on `n`; not
re-running the pass when a chunk re-extracts a file later.

### C5 — Populate `ir.CallSite` with `CallerQualified`  `[ ]`
**Approach:** For each `@function.call` capture, set `CalleeName` = identifier / property name,
`Line` = call node start row, `CallerQualified` = `qualifiedName(enclosingFunction)` (reuse C4's
walk from the call node up to the nearest function ancestor). Module-level call (no enclosing
function) → `CallerQualified = "<module>"`.
**Good when:** `testdata/calls/` fixture yields `CallSite`s for local calls, `obj.method()`,
chained `a.b.c()`, and a call inside an arrow callback — with correct `CallerQualified`.
**Watch outs:** not actually walking up (off-by parent index); member calls vs. identifier calls
(`@function.call` matches both via the `[…]` alternation — verify the capture lands on the right
sub-node); calls inside comments/strings must NOT match (tree-sitter node matching handles this,
but verify with a fixture).

### C6 — Populate `ir.Import`  `[ ]`
**Approach:** Parse `import_statement` clauses: default (`import x from "y"`), named
(`import {a, b} from "y"`), namespace (`import * as ns from "y"`), side-effect (`import "y"`),
re-export (`export … from "y"`), and dynamic `import("y")`. `From` = string literal value (strip
quotes); store the set of imported local names on `ir.Import` so the Phase 2 resolver can match.
Add a field to `ir.Import` if needed (e.g. `Symbols []string`, `IsDefault bool`, `Namespace string`).
**Good when:** `testdata/imports/` fixture yields `Import` rows with the right `From` and local names.
**Watch outs:** dynamic `import()` is a *call_expression* with a string arg, not an
`import_statement` — handle separately or skip and document; named-import aliases
(`{a as b}`) — local name is `b`; re-exports that don't bind a local name.

### C7 — Return `ir.Graph`; `main.go` JSON dump + `--format summary`  `[ ]`
**Approach:** Change `extract.go`'s return from `[]ir.File` to `ir.Graph`. In `main.go`, marshal
`graph` to JSON → write to `--out` (default `out.json`, `/dev/stdout` for streaming). Add
`--format json|summary`; `summary` prints counts (`files`, `functions`, `calls`, `imports`). Keep
the `db.NewWriter` reference intact behind a comment so Phase 2 wiring isn't lost.
**Good when:** `make go-run REPO=./services/parser/testdata/sample` writes a complete `out.json`
with the expected functions/calls/imports, and `--format summary` prints human counts.
**Watch outs:** leaving the `db.Writer` import unused (Go will refuse to compile) — keep a
`var _ = db.NewWriter` like `config.go` does, or move it behind a flag; `os.WriteFile` perms.

### C8 — Harden `security.Walk`  `[ ]`
**Approach:** (1) **Symlink hard-fail** — in `Walk`, before accepting any path, `os.Lstat` and
return error if `info.Mode() & os.ModeSymlink != 0` (do not readlink). (2) **Binary sniff** — read
first ~512 bytes, skip if `bytes.IndexByte(buf, 0) != -1`. (3) **Fix depth** — replace
`strings.Count(path, sep) - strings.Count(root, sep)` with `filepath.Rel(root, path)` and count
separators (robust to trailing slash / symlinked roots). (4) **Cap sentinel** — return a typed
error (`ErrFileCapReached`) so Phase 4's queue can distinguish "capped" from "clean walk".
Add tests: `TestWalkSkipsBinary`, `TestWalkRejectsSymlinkOutsideRoot`, `TestWalkRespectsFileCountCap`,
`TestWalkRespectsDepth`.
**Good when:** `go test ./internal/security/...` is green and covers every gap above.
**Watch outs:** `filepath.WalkDir` follows symlinks for the *walked* path — the Lstat guard must
catch symlinks inside the tree, not just the root; `SkipDir` vs. `SkipAll` semantics; reading 512
bytes for every file is cheap but measure; **decision not to respect `.gitignore`** — note in
`docs/RISKS.md` during C14.

### C9 — Bounded read at read site  `[ ]`
**Approach:** In `extract.go`, before reading a file, `os.Stat` and skip (log + continue) if size
> `cfg.MaxFileBytes`; then read with `io.LimitReader` bound to `MaxFileBytes+1` so a file that grows
between stat and read can't OOM you; also reuse C8's binary sniff at read time. Belt + suspenders.
**Good when:** a 5MB `.ts` fixture is skipped with a warning, never read in full.
**Watch outs:** `io.LimitReader` returns fewer bytes — handle the EOF cleanly; reconciling C8's
size check (already done in `Walk`) with this one — keep both (Walk gates discovery, read gates the
actual read); not logging path + reason consistently.

### C10 — Fixtures  `[ ]`
**Approach:** Add under `services/parser/testdata/`:
- `nested/` — 3-level nesting + class methods + arrow consts (drives C4 assertions);
- `imports/` — default/named/namespace/side-effect/re-export/dynamic `import()` (drives C6);
- `calls/` — local, `obj.method()`, chained `a.b.c()`, imported-symbol call, call in string/comment
  (must NOT capture), call inside arrow callback (drives C5);
- `overloads/` — two `fetch` declarations (drives C4b);
- `edge/` — empty file, only-comments file, a huge minified-looking single line (size cap), `.tsx`
  with JSX (grammar branch), a `.ts` file with a symlink sibling (symlink rejected, target parsed
  if real — drives C8).
For each, add `_expected.json` (or expected counts) that the test in C11 diff-asserts.
**Good when:** every fixture parses and dumps an `out.json` matching its `_expected.json`.
**Watch outs:** Windows line endings in fixtures (normalize `\n`); JSX mandating the `LanguageTSX`
binding — verify the `tree_sitter-typescript/bindings/go` exposes both; huge-line fixture must be
*under* the size cap or its purpose (size test) is moot.

### C11 — Golden `extract_test.go`  `[ ]`
**Approach:** Table-driven tests over the C10 fixtures asserting: every node type we rely on
(`function_declaration`, `method_definition`, `call_expression`, `import_statement`,
`variable_declarator` with arrow/fn-expr) actually matches; comments and string literals
containing the word `function` or call-shaped text produce **no** spurious matches; qualified-name
scope walk on `nested/` matches expectations (C4); overload indices on `overloads/` are `0,1` (C4b).
**Good when:** all golden tests green; `cd services/parser && go test ./...` clean.
**Watch outs:** golden JSON that records unstable fields (absolute paths, byte sizes) — keep only
rel paths + structural fields; not regenerating goldens when queries intentionally change.

### C12 — Hardened parser Docker image  `[ ]`
**Approach:** Multi-stage `Dockerfile`: `golang:1.25` build → distroless/alpine runtime, `USER
nonroot` (UID 65532), only `git` in runtime. Bake `PARSER_*` env defaults via `ENV`. In
`docker-compose.yml` add a `parser` service with `read_only: true`, `network_mode: none`,
`cap_drop: [ALL]`, `tmpfs: [/tmp:size=100m]`, `mem_limit`, `cpus`. **Clone/parse split** per the
locked decision: a `parser-clone` one-shot container (network enabled) clones into a shared tmpfs;
the `parser-parse` container runs `--network none` against that volume. Add
`make docker-run-parser REPO=./services/parser/testdata/sample`.
**Good when:** `docker compose run --rm parser …` runs as non-root, read-only rootfs, no network,
no caps, and emits `out.json`; `docker inspect` shows `NetworkMode=none` and empty `Cap`.
**Watch outs:** distroless has no shell → `git` must come from a build stage or you containerize
clone differently; `read_only: true` fights any code that writes to rootfs (only `/tmp` is
writable via tmpfs); the parser-clone sidecar forgetting to clean the tmpfs between runs.

### C13 — CI for the parser  `[ ]`
**Approach:** Update `.github/workflows/ci.yml`:
- `parser` job: `setup-go@v5`, `go mod tidy` check, `go vet ./...`, `go test -race ./...`,
  `go build ./...`; cache `~/go/pkg/mod` + build cache.
- `parser-sample` job: build the binary, run `--repo ./services/parser/testdata/sample
  --format summary`, assert `functions > 0` and `calls > 0` from the printed counts.
- `migration-check` job: pull `golang-migrate/migrate`, start Postgres via `services:`, run
  `migrate -path services/parser/migrations -database $DATABASE_URL up`, assert the four tables
  exist. (DB writes are Phase 2, but this guards the schema now.)
**Good when:** a PR touching `services/parser/**` runs all three and they pass on the sample repo.
**Watch outs:** CGO is required by `tree-sitter` (already installed in the existing `go` job);
`go mod tidy` check needs `GOFLAGS=-mod=mod` or it can falsely fail; the migration job must not
leave Postgres running.

### C14 — Docs sync  `[ ]`
**Approach:**
- `docs/PARSING_STRATEGY.md`: write the `qualified_name` convention (C4), `overload_index` post-pass
  (C4b), the runtime `.scm` load approach (C1), and known limitations hit (arrows, JSX, dynamic
  `import()`).
- `docs/RISKS.md`: flip R9 OPEN → DECIDED (Go IR is native — `internal/ir/ir.go`), R16 OPEN →
  DECIDED (pin the grammar version named in `go.mod`); record the R8 decision (edges to overloaded
  `qualified_name`s → `unresolved`) and the `.gitignore` DEFER decision.
- `docs/SECURITY.md`: replace aspirational bullets with the **implemented** controls (non-root,
  `--network none`, read-only rootfs, no caps, no symlink follow, size/count/binary caps) and the
  clone-vs-parse container split.
- `DEVELOPMENT.md`: refresh the Phase 1 section with the real commands now that they exist.
**Good when:** docs match the code; no aspirational "TODO" bullets in any Phase 1 section.
**Watch outs:** stale `ARCHITECTURE.md` still mentions Excalidraw in the canvas diagram — leave a
note that it's deferred; the `samples` for ` qualified_name` must match exactly what C4 produces.

---

## Phase 1 exit gate (Definition of Done)

All of the following pass:
- [ ] `cd services/parser && go test ./...` green — `internal/security` + `internal/ts` (all
      fixtures) + golden tests.
- [ ] `make go-run REPO=./services/parser/testdata/sample` emits a correct `out.json`.
- [ ] `make go-vet` clean.
- [ ] `docker compose run --rm parser …` runs isolated (non-root, read-only rootfs, `network none`,
      no caps) and parses the sample.
- [ ] Negative tests green: symlink-to-escape rejected; 5MB file skipped; binary file skipped.
- [ ] CI workflow green on a PR (parser + parser-sample + migration-check jobs).
- [ ] `docs/PARSING_STRATEGY.md`, `docs/RISKS.md`, `docs/SECURITY.md`, `DEVELOPMENT.md` reflect
      implemented behavior — no aspirational TODOs.

---

## Working conventions (so we pair smoothly)

- **You code, I debug.** Submit a chunk via your usual edit; I'll review for: correctness vs.
  IR/schema/contract → bugs (byte→line, off-by-one, nil, OS path separators, false captures) →
  style/duplication (e.g. reuse the C4 scope walk in both `Function` C2/C4 and `CallSite` C5) →
  tests (table-driven, one-concern fixtures, golden JSON diffs) → nudge to the next chunk.
- **Commits:** imperative, one concern each (e.g. `add parser symlink hard-fail`), scoped to the
  chunk. Squash-merge into the Phase 1 branch at the end.
- **Don't delete Phase 2 wiring.** Keep `db.NewWriter` referenced so the storage handoff is clean.
- **Migrations:** never edit a merged migration; add a new numbered file instead.
- **Tests first mentality:** when a chunk's "good when" is a test, write the test alongside the
  code, not after.
