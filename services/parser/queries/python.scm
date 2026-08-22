; tree-sitter queries for Python extraction.
;
; `async def` is a function_definition like any other, and a decorated one is a
; function_definition wrapped in a decorated_definition -- so the name's parent
; is still the definition and the line range is still the body's, not the
; decorator's. Both are pinned by the fixture.
;
; The whole import statement is captured rather than a specifier: `import a.b`
; and `from .m import x as y` share no node to point at.

(function_definition
  name: (identifier) @function.def
  body: (block) @function.block)

(call
  function: [
    (identifier) @function.call
    (attribute
      attribute: (identifier) @function.call)
  ])

(import_statement) @import.from

(import_from_statement) @import.from
