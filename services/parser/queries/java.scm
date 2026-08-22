; tree-sitter queries for Java extraction.
;
; A method inside an anonymous inner class is an ordinary method_declaration in
; the class_body of an object_creation_expression, so it matches here and the
; scope walk gives it the <anonymous> segment. Same for a lambda body.
;
; The whole import declaration is captured: it has no quoted specifier, only a
; scoped_identifier that may or may not be static and may end in an asterisk.

(method_declaration
  name: (identifier) @function.def
  body: (block) @function.block)

(constructor_declaration
  name: (identifier) @function.def
  body: (constructor_body) @function.block)

(method_invocation
  name: (identifier) @function.call)

(import_declaration) @import.from
