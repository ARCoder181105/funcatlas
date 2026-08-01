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

For each call site, in order, stopping at the first rule that produces an unambiguous answer:

1. **Same file** — is there a function with this qualified name in the file the call is in?
   → `exact`
2. **Imported symbol** — does this file import the callee's local name? Follow the import to its
   module and find the definition there. → `exact`. If the module lies outside the repo, such as
   `react` or `node:fs`, the honest answer is `unresolved`, not a failure.
3. **Package fallback** — is there exactly one function with this name in the same `package_path`,
   or failing that exactly one in the whole repo? → `name_match`
4. **Otherwise** → `unresolved`, keeping the callee name as written so the edge still carries
   information.

Two rules override all of the above:

- **Ambiguity resolves to `unresolved`.** If more than one candidate matches, we do not pick one.
- **Overloaded targets resolve to `unresolved`.** If the matched `qualified_name` has more than one
  `overload_index` in its file, name and scope matching cannot choose between them, so it must not
  pretend to.

Every edge is written with its `resolution_confidence`, and the canvas renders `exact` solid,
`name_match` dashed, and `unresolved` dotted. A guess is never drawn as a fact — see
[`../PRD.md`](../PRD.md) §8 for why this is the product's core commitment rather than a detail.

## Known limitation classes (v1, name/scope-based resolution)

- **Re-exports / barrel files** (common in TypeScript) — a symbol may be re-exported through one or more intermediate files before reaching its real definition. v1 may under-resolve these; flagged as `unresolved` rather than guessed wrong.
- **Overloading / shadowing** — languages that allow multiple definitions to share a name depending on context aren't disambiguated by name/scope matching alone.
- **Cross-language repos** — name-only matching risks wiring a call in one language to an unrelated same-named function in another language. Mitigate by never resolving across a language boundary unless there's an explicit FFI/binding reference.

## v2: LSP-based resolution

For one language at a time, once the rest of the pipeline is proven: query that language's language server (via JSON-RPC) for each call site to get the actual resolved definition, upgrading matching edges from `name_match`/`unresolved` to `exact`. This is slower (per-call-site RPC, sometimes multiple hops for re-exports) so it's deliberately not in v1 — the value of a working end-to-end pipeline now outweighs waiting for perfect accuracy.

## Incremental re-parsing

- Tree-sitter supports incremental parsing — re-parsing only changed files, not the whole repo, on every webhook-triggered update.
- The harder part is **re-linking edges** correctly: renaming or deleting a function must update every edge pointing at it, not just the node itself. This is where the confidence-tagging and qualified-key design (see `DATA_MODEL.md`) matter most — stale or orphaned edges are the failure mode to actively guard against here.
