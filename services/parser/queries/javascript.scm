; tree-sitter queries for JavaScript and JSX extraction.
; Shares TypeScript's node kinds; require() is the one addition.

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

(variable_declarator
  name: (identifier) @function.def
  value: [
    (arrow_function)
    (function_expression)
  ])

; CommonJS. The .scm cannot say "only require()" without a predicate the Go
; binding does not evaluate, so it captures any single-string call argument and
; jsImports discards the ones that are not require.
(call_expression
  function: (identifier)
  arguments: (arguments (string) @import.from))
