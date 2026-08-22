; tree-sitter queries for Go extraction.
;
; Deliberately absent: a generic call with one type argument. Map[int](xs)
; parses as a type_conversion_expression, the same shape as int(x) -- capturing
; it would invent a call for every conversion in the repository. Two or more
; type arguments are unambiguous and do parse as a call_expression, so those
; are matched by the plain identifier pattern below.

(function_declaration
  name: (identifier) @function.def
  body: (block) @function.block)

(method_declaration
  name: (field_identifier) @function.def
  body: (block) @function.block)

(call_expression
  function: [
    (identifier) @function.call
    (selector_expression
      field: (field_identifier) @function.call)
  ])

(import_spec
  path: (_) @import.from)
