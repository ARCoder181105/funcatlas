# Parsing Strategy

## Tool choice: tree-sitter

Tree-sitter is used for all extraction — fast, incremental, has a query language, and has mature bindings across languages including Go. It parses syntax; it does not resolve meaning. That distinction drives everything below.

**Input hardening (see `SECURITY.md`):** before any file reaches tree-sitter, the clone step rejects symlink / path-traversal escapes and skips files that exceed the size cap (>1MB), are binary, or live under `node_modules`/`.git`/build output. Parsing is also limited to the first language (TypeScript) for the MVP.

## What tree-sitter queries extract

Using tree-sitter's query syntax rather than manual tree-walking. The live patterns are in
`services/parser/queries/typescript.scm`, embedded into the binary at build time with `//go:embed`:

```scheme
(function_declaration
  name: (identifier) @function.def
  body: (statement_block) @function.block)

(method_definition
  name: (property_identifier) @function.def
  body: (statement_block) @function.block)

(variable_declarator
  name: (identifier) @function.def
  value: [(arrow_function) (function_expression)])

(call_expression
  function: [
    (identifier) @function.call
    (member_expression property: (property_identifier) @function.call)
  ])

(import_statement source: (string) @import.from)
```

Per file this yields every function and method definition with its name, line range, and source
text; every call expression; and every import statement. Imports are not optional extra data — the
resolver's second rule depends entirely on them.

**What is deliberately not captured:** TypeScript overload *signatures* parse as `function_signature`
nodes, not `function_declaration`, so they produce no `ir.Function`. This is correct. A signature has
no body, so it cannot call anything and nothing can meaningfully call it as distinct from its
implementation. Only the implementation is a real node in the call graph.

## Why bracket/brace counting was rejected as the extraction method

Considered and rejected in favor of tree-sitter, because naive bracket-depth counting breaks on:
- Braces inside string literals, comments, regexes, or template-literal interpolation
- Indentation-based languages (Python) that don't use braces at all
- Nested functions/closures/lambdas, which need keyword-awareness (`function`/`def`/`fn`) alongside bracket depth, not just depth alone

Getting all of this right amounts to re-implementing a simplified parser — tree-sitter already is that, tested across many languages, for free.

## Call resolution — the actual hard problem

Tree-sitter finds a call site like `getUser(id)`. It cannot tell you which `getUser` that refers to,
because that is a semantic question and tree-sitter only knows syntax. Everything below is about
answering it well enough to be useful, and being honest when we can't.

### Naming conventions

Both a function definition and a call site's enclosing caller are identified by a `qualified_name`,
built by walking up the AST and dot-joining the enclosing scopes:

| Case | `qualified_name` |
|---|---|
| Top-level function | `getUser` |
| Class method | `Repo.sync` |
| Function nested inside another | `getUser.inner` |
| Anonymous function or callback | `<anonymous>`, prefixed by its enclosing scope |
| A call at module level, outside any function | caller is `<module>` |

`package_path` is the file's directory relative to the repo root, and the empty string for files at
the root. It is not part of `qualified_name` — uniqueness comes from the database key
`(file_id, qualified_name, overload_index)`, which already includes the file.

### The overload-index post-pass

After extracting every function in a file, group them by `qualified_name`, sort each group by
`start_line`, and assign `overload_index` `0..n-1`. Almost every function gets `0`.

This exists to guarantee the uniqueness key can never collide, which is what makes Phase 4's
delete-and-reinsert relink safe. Keying by `start_line` also makes the index stable across identical
re-parses. It fires on genuine duplicate qualified names — a function redeclared in two branches of
a conditional, for instance — not on TypeScript overload signatures, which are not captured at all.

### Resolution order

Implemented in `services/parser/internal/resolver`. Every lookup is an in-memory index built once
per repo; the resolver never queries the database per call site.

A **member call is answered separately**, because `obj.method()` and `method()` are different
callees and must never collapse into one. With a receiver, the resolver tries: a namespace import
(`ns.fn()` where `ns` is `import * as ns`), then a class declared in this file (`Repo.sync()` is
stored under the qualified name `Repo.sync`), then a class imported from elsewhere in the repo.
Anything else is `unresolved`.

For a bare call, in order, stopping at the first unambiguous answer:

1. **Same file, honouring lexical scope.** Candidate qualified names are generated innermost-first:
   a call to `cb()` inside `Repo.sync` tries `Repo.sync.cb`, then `Repo.cb`, then `cb`, so a nested
   definition wins over a top-level one. → `exact`
2. **Imported symbol.** The callee's local name is in this file's imports; follow the specifier to a
   file in the repo and look up the name it is *exported* under, not the local alias. → `exact`.
   A specifier resolving outside the repo (`react`, `node:fs`) → `unresolved`.
3. **Package fallback.** Exactly one function with that name in the same `package_path`, or failing
   that exactly one in the whole repo. → `name_match`
4. **Otherwise** → `unresolved`, keeping the callee name as written.

### Where it refuses to guess

Each of these had a plausible wrong answer available, and each returns `unresolved` instead. This is
the list to check against when a user asks why an edge is dotted.

| Case | Why not resolved |
|---|---|
| More than one candidate | Ambiguity is never broken by picking. The whole product rests on this. |
| Target has more than one `overload_index` in its file | Name and scope matching cannot choose an overload. |
| `import def from "m"` then `def()` | A default import binds an arbitrary local name, so there is nothing to match a definition against. Picking the module's only function would be a coin flip. |
| `a.b.c()` | A chained receiver cannot be followed by name. Not bailing here would let it match a function coincidentally nested as `a.b.c`. |
| `this.x()` | The receiver is not a name that can be looked up. |
| `obj.method()` where `obj` is unidentifiable | An unknown receiver ends the search rather than widening it to every `method` in the repo. |
| A symbol re-exported through a barrel file | The importing file names a module that does not define the symbol. Following the chain needs the re-export graph, which is recorded but not yet walked. |
| A specifier that only a `tsconfig` path alias resolves | Aliases are not consulted. |

### Module specifier resolution

Relative specifiers only, resolved against the importing file's directory and tried in the order
TypeScript would: `foo.ts`, `foo.tsx`, `foo/index.ts`, `foo/index.tsx`, then the path as written. A
`.js` or `.jsx` extension is rewritten to its TypeScript source, since ESM TypeScript writes
`./foo.js` for what is really `./foo.ts`. A specifier that escapes the repo root resolves to nothing.

### Edges, and what a caller is

`Resolve` returns one `ir.Edge` per call site, in call-site order. It deliberately does not return a
map keyed by the call: two identical calls on one line are two edges, and a map would silently merge
them.

An edge's caller is the **innermost captured function containing the call, by line** — not the call
site's `CallerQualified`. A call inside an anonymous callback records a caller like
`localCall.<anonymous>`, and that closure is not a function row anywhere, so matching on the name
would attribute the edge to nothing. A call at module level has no caller function at all.

Recursion produces a genuine self-edge, which is correct and which the API's traversal has to
tolerate rather than treat as a cycle bug.

## Known limitation classes (v1, name/scope-based resolution)

Every one of these lands as `unresolved` rather than a wrong answer — see the refusal table above.

- **Re-exports / barrel files** — a symbol may pass through several intermediate files before its real definition. The re-export edges are recorded in the IR (`KindReExport`, carrying the original name and no local binding) but not yet followed.
- **Overloading / shadowing** — multiple definitions sharing a name are not disambiguated by name and scope alone.
- **Cross-language repos** — name-only matching could wire a call in one language to an unrelated same-named function in another. Not reachable today, since TypeScript is the only language parsed.

## v2: LSP-based resolution

For one language at a time, once the rest of the pipeline is proven: query that language's language server (via JSON-RPC) for each call site to get the actual resolved definition, upgrading matching edges from `name_match`/`unresolved` to `exact`. This is slower (per-call-site RPC, sometimes multiple hops for re-exports) so it's deliberately not in v1 — the value of a working end-to-end pipeline now outweighs waiting for perfect accuracy.

## Incremental re-parsing

Phase 2 writes the **whole repo graph** on every run, inside one transaction, deleting the functions
for every file it is about to write. `ON DELETE CASCADE` takes their edges, and the resolver then
re-derives every edge from scratch. That is what makes a re-parse after a rename leave no orphans:
the caller is re-resolved too, so its edge becomes `unresolved` carrying the old name.

Phase 4 narrows this to only the files a push changed. The subtle case it has to handle, which the
full-graph write gets for free: if a function is deleted from file A while file B still calls it,
B's edge is cascade-deleted with A's function, but nothing recreates it unless B is re-resolved as
well. The changed-file set must therefore expand to include every file that imports a changed file.
