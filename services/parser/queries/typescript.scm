; tree-sitter queries for TypeScript extraction (docs/PARSING_STRATEGY.md).
; Phase 1 fills the Go-side handling; queries defined here.

(function_declaration
  name: (identifier) @function.def
  body: (statement_block) @function.block)

(method_definition
  name: (property_identifier) @function.def
  body: (statement_block) @function.block)

(call_expression
  function: [
    (identifier) @function.call
    (member_expression
      property: (property_identifier) @function.call)
  ])

(import_statement
  source: (string) @import.from)

(export_statement
  source: (string) @import.from)
