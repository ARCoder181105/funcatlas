; tree-sitter queries for Rust extraction.
;
; Deliberately absent: anything inside a macro. println!("{}", helper()) has a
; token_tree body -- tree-sitter does not parse expressions in it, so helper()
; is a bare identifier next to a token_tree and not a call at all. Matching
; identifiers there would invent a call for every name mentioned in every
; macro. The limit is pinned by the fixture; see docs/PARSING_STRATEGY.md.

(function_item
  name: (identifier) @function.def
  body: (block) @function.block)

(call_expression
  function: [
    (identifier) @function.call
    (field_expression
      field: (field_identifier) @function.call)
    (scoped_identifier
      name: (identifier) @function.call)
  ])

(use_declaration
  argument: (_) @import.from)
