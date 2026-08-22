# Phase 5 — Go, Rust, Python, JavaScript and Java

The live task list. Phase 4 made the graph self-updating. It also left the parser reading exactly
one language, with `files.language` hardcoded to `"typescript"` and a resolver that had never heard
of a language at all. Phase 5 teaches it five more — extraction and same-file resolution only — and
makes the language boundary something the resolver cannot cross by accident.

**Branch:** `phase-5/polyglot-extraction`
**Reference:** [`PLAN.md`](PLAN.md) Phase 5 · [`docs/PARSING_STRATEGY.md`](docs/PARSING_STRATEGY.md) ·
[`docs/RISKS.md`](docs/RISKS.md) R34, R36

## How to work through this

Claude implements; you review at the phase gate. The order is load-bearing: E0 makes a language a
value rather than a hardcode, E1 closes the boundary before any second language exists to leak
across it, E2–E6 add one language each, and E7 is the gate.

Write the test in the same commit as the code it tests. Commit one chunk at a time with an
imperative message. `[ ]` todo · `[~]` in progress · `[x]` done.

## What this phase actually teaches

| Chunks | Concept | Where else you'll meet it |
|---|---|---|
| E0 | Pulling a hardcoded assumption out into data, without inventing a plugin framework for it | Every "we only support X" that becomes "we support X, Y, Z" |
| E1 | Partitioning an index instead of filtering its results | Multi-tenant queries, per-shard caches, anything where a missed filter leaks |
| E2–E6 | A parser that silently produces *less* rather than failing | Every codegen, every linter rule, every migration that skips rows |
| E7 | A test that measures the thing under test with the thing under test | Assertions built on the helper they are supposed to be checking |

E7 is the one worth slowing down for. The first version of the exit test compared
`ResolutionGroup(caller)` with `ResolutionGroup(callee)` — and passed with `ResolutionGroup`
returning a constant, because both sides moved together. Breaking the function on purpose is what
found it.

---

## E0 — Generalise the extractor behind a Spec

- [x] **Why.** `internal/ts` was the only extractor and `files.language` was a constant. Everything
      about the per-file loop was already language-agnostic; four things were not.
- [x] **Where.** `services/parser/internal/extract/` (was `internal/ts/`),
      `internal/utils/constants.go`, `internal/utils/nodes.go`, `cmd/parser/main.go`.
- [x] **Do.** Rename the package. Add `Spec`: name, extensions, grammar, `.scm`, `ScopeSegment`,
      `CalleeReceiver`, `Imports`. Re-express TypeScript as two specs. Delete `utils.Language` and
      the callerless `utils.IsSourceFile`.
- [x] **Done when.** Every existing TypeScript test passes unchanged, and `.tsx` reports
      `files.language = "tsx"`.
- [x] **Watch for.** `forFile` was a suffix scan; with several languages registered one extension
      swallows another. It is an exact `filepath.Ext` lookup now.

## E1 — Partition resolution by language group

- [x] **Why.** `byName` and `byPkgName` were repo-wide and keyed on name alone. A call in `main.go`
      would have matched a same-named function in `main.py`.
- [x] **Where.** `internal/resolver/resolver.go`, `internal/utils/constants.go`.
- [x] **Do.** Key both maps by resolution group, `package_path` included. Gate imports at index
      time on `utils.ResolvesModules`.
- [x] **Done when.** Same-named functions in two languages never link, in either direction.
- [x] **Watch for.** Partition at build time, not filter at lookup: a filter is something a later
      code path can forget.

## E2 — JavaScript and JSX

- [x] **Why.** `.js` and `.jsx` were skipped entirely, and the TypeScript spec already knew how to
      read them.
- [x] **Where.** `queries/javascript.scm`, `internal/extract/javascript.go`, `internal/utils/paths.go`.
- [x] **Do.** Reuse the TypeScript scope, receiver and import functions. Add CommonJS `require()`.
      Join the ECMAScript resolution group.
- [x] **Done when.** Calls inside a `.jsx` JSX body are all present, and `require()` binds what it
      destructures.
- [x] **Watch for.** `ModuleCandidates` stripped `.js` to find the `.ts` behind it and never
      restored it, so a specifier naming a real `.js` file matched nothing. Both are candidates now.

## E3 — Go

- [x] **Why.** Extraction only; Go resolves through package clauses and capitalisation.
- [x] **Where.** `queries/go.scm`, `internal/extract/golang.go`.
- [x] **Do.** Methods named after their receiver type. Imports bind a qualifier.
- [x] **Done when.** Calls inside a goroutine literal, a `defer`, and a two-type-argument generic
      call are all present.
- [x] **Watch for.** `Map[int](xs)` — one type argument — parses as `type_conversion_expression`,
      the same shape as `int(x)`. Not captured, on purpose, and the fixture pins that.

## E4 — Rust

- [x] **Why.** Extraction only; Rust resolves through `mod`, `use`, crate paths and traits.
- [x] **Where.** `queries/rust.scm`, `internal/extract/rust.go`, `internal/extract/spec.go`.
- [x] **Do.** Methods named after their `impl` target. `use` declarations into the IR.
- [x] **Done when.** Calls in `impl` blocks, closures, match arms and method chains are present.
- [x] **Watch for.** A macro body is a `token_tree` — nothing inside `println!` is parsed as an
      expression. Pinned rather than wished away. Rust also has no quoted specifier, which is why
      `Spec.Imports` returns the module as well as the symbols.

## E5 — Python

- [x] **Why.** Extraction only; Python resolves through `sys.path` and `__init__.py`.
- [x] **Where.** `queries/python.scm`, `internal/extract/python.go`.
- [x] **Do.** Class nesting in the qualified name. Both import statement forms.
- [x] **Done when.** Calls in decorators, f-string interpolations, comprehension filters and behind
      `await` are all present.
- [x] **Watch for.** `decorated_definition` wraps the `function_definition`, so the recorded source
      must be the function's and not the decorator's.

## E6 — Java

- [x] **Why.** Extraction only; Java resolves through the classpath and picks overloads by type.
- [x] **Where.** `queries/java.scm`, `internal/extract/java.go`.
- [x] **Do.** Every enclosing type in the name; anonymous inner classes and lambdas as anonymous
      scopes.
- [x] **Done when.** A call inside `new Runnable(){...}` is present, and a call to a genuinely
      overloaded method resolves `unresolved`.
- [x] **Watch for.** This is the first language where `overload_index` does real work — TypeScript's
      overload *signatures* were never captured, so the post-pass had nothing to number.

## E7 — The polyglot fixture and the exit test

- [x] **Why.** The phase's whole claim is that no edge crosses a language boundary.
- [x] **Where.** `testdata/polyglot/`, `internal/resolver/polyglot_test.go`,
      `internal/security/config.go`.
- [x] **Do.** One directory, a file per language, each defining and calling `helper`. `main.go`
      calls `python_only`; `main.py` calls `go_only`. Skip-path defaults for the new languages.
- [x] **Done when.** Every language yields functions **and** calls; no edge crosses a boundary;
      cross-file is never `exact` outside the ECMAScript family.
- [x] **Watch for.** Two traps, both hit. `helper` alone proves nothing — it exists in seven files,
      so ambiguity answers `unresolved` whether the partition works or not. And an assertion built
      on `ResolutionGroup` agrees with itself: verified by breaking that function and watching the
      test fail.

## E8 — Language per node, and R34

- [x] **Why.** A reader following a call out of their language should see that they have, since that
      is also where the resolver stops being able to say anything exact. And R34 has been open since
      Phase 4 made it reachable without anyone touching the browser.
- [x] **Where.** `apps/web/src/components/MindMap.tsx`, `FunctionNode.tsx`, `Sidebar.tsx`,
      `lib/graph.ts`, `lib/graph-constants.ts`, `lib/highlight.ts`, `store/ui.ts`.
- [x] **Do.** Badge a callee only when its language differs from the file being read. Drop branch
      roots the open file no longer has.
- [x] **Done when.** `make test`, `make lint`, `make typecheck`, `make go-vet` clean.
- [x] **Watch for.** A card that grows a badge it was not measured for truncates its own name —
      the same bug the "start" badge caused. `functionCardWidth` allows for it.

---

## The exit gate

`make go-run REPO=./services/parser/testdata/polyglot` — 7 files, 7 languages, every one yielding
functions and calls, no edge crossing a boundary.

`make test` (127 api / 146 web / Go, Postgres up), `make lint`, `make typecheck`, `make go-vet` —
all clean.

Still to do by hand at the gate: a real polyglot public repository charted end to end in real
Chrome, checking the tree language labels, the per-node badge, and Shiki highlighting for each
language.
