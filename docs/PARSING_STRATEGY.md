# Parsing Strategy

## Tool choice: tree-sitter

Tree-sitter is used for all extraction — fast, incremental, has a query language, and has mature bindings across languages including Go. It parses syntax; it does not resolve meaning. That distinction drives everything below.

**Input hardening (see `SECURITY.md`):** before any file reaches tree-sitter, the clone step rejects symlink / path-traversal escapes and skips files that exceed the size cap (>1MB), are binary, or live under `node_modules`/`.git`/build output. Parsing is also limited to the first language (TypeScript) for the MVP.

## What tree-sitter queries extract

Using tree-sitter's query syntax (not manual tree-walking):

```scheme
(function_definition
  name: (identifier) @function.def
  body: (block) @function.block)

(call
  function: (identifier) @function.call)
```

Per file, this yields: every function/method definition (name, full source block, line range) and every call expression (name being called). Import/using statements are extracted the same way, per language, and are required for scope-aware resolution below.

## Why bracket/brace counting was rejected as the extraction method

Considered and rejected in favor of tree-sitter, because naive bracket-depth counting breaks on:
- Braces inside string literals, comments, regexes, or template-literal interpolation
- Indentation-based languages (Python) that don't use braces at all
- Nested functions/closures/lambdas, which need keyword-awareness (`function`/`def`/`fn`) alongside bracket depth, not just depth alone

Getting all of this right amounts to re-implementing a simplified parser — tree-sitter already is that, tested across many languages, for free.

## Call resolution — the actual hard problem

Tree-sitter finds a call site like `getUser(id)`; it cannot say which `getUser` definition that refers to when multiple exist. Resolution is a distinct step, done in this order for v1:

1. **Same file** — is there a `getUser` defined in this file? Prefer it.
2. **Imported symbol** — does the file's import statements bring in a specific `getUser` from elsewhere? Follow that.
3. **Package-level fallback** — is there exactly one `getUser` in the same package/module? Use it, but mark lower confidence.
4. **Unresolved** — ambiguous or no match found. Store the edge as `unresolved` rather than guessing.

Every edge gets a `resolution_confidence` value (`exact`, `name_match`, `unresolved`) written to the DB — see `DATA_MODEL.md`. The canvas UI should visually differentiate these (e.g. solid vs. dashed edges) so a "best guess" is never presented as fact.

## Known limitation classes (v1, name/scope-based resolution)

- **Re-exports / barrel files** (common in TypeScript) — a symbol may be re-exported through one or more intermediate files before reaching its real definition. v1 may under-resolve these; flagged as `unresolved` rather than guessed wrong.
- **Overloading / shadowing** — languages that allow multiple definitions to share a name depending on context aren't disambiguated by name/scope matching alone.
- **Cross-language repos** — name-only matching risks wiring a call in one language to an unrelated same-named function in another language. Mitigate by never resolving across a language boundary unless there's an explicit FFI/binding reference.

## v2: LSP-based resolution

For one language at a time, once the rest of the pipeline is proven: query that language's language server (via JSON-RPC) for each call site to get the actual resolved definition, upgrading matching edges from `name_match`/`unresolved` to `exact`. This is slower (per-call-site RPC, sometimes multiple hops for re-exports) so it's deliberately not in v1 — the value of a working end-to-end pipeline now outweighs waiting for perfect accuracy.

## Incremental re-parsing

- Tree-sitter supports incremental parsing — re-parsing only changed files, not the whole repo, on every webhook-triggered update.
- The harder part is **re-linking edges** correctly: renaming or deleting a function must update every edge pointing at it, not just the node itself. This is where the confidence-tagging and qualified-key design (see `DATA_MODEL.md`) matter most — stale or orphaned edges are the failure mode to actively guard against here.
