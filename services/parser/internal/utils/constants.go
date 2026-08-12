package utils

// Every shared literal in the parser. One home, so a string like "unresolved"
// is never spelled twice and cannot drift from the database CHECK constraint.

// Language is the only language the MVP parses.
const Language = "typescript"

// Qualified-name sentinels.
const (
	ModuleCaller = "<module>" // caller of a call made outside any function
	Anonymous    = "<anonymous>"
)

// Resolution confidence. Mirrors the CHECK constraint on edges.
// Rendered solid / dashed / dotted; a guess is never drawn as a fact.
const (
	Exact      = "exact"
	NameMatch  = "name_match"
	Unresolved = "unresolved"
)

// NoFunc marks an edge endpoint that is not a function in this repo:
// an unresolved callee, or a caller at module level.
const NoFunc = -1

// Import kinds. SideEffect and ReExport bind no local name.
const (
	KindDefault    = "default"
	KindNamed      = "named"
	KindNamespace  = "namespace"
	KindSideEffect = "side-effect"
	KindReExport   = "re-export"
)

// Source extensions. .tsx needs its own grammar -- the TypeScript grammar
// cannot parse JSX, and fails silently by dropping calls inside it.
const (
	ExtTS  = ".ts"
	ExtTSX = ".tsx"
)

// Extensions a module specifier is resolved against, in order.
var (
	SourceExtensions = []string{ExtTS, ExtTSX}
	IndexFiles       = []string{"/index" + ExtTS, "/index" + ExtTSX}
)

// Tree-sitter node kinds, so a grammar rename breaks in one place.
const (
	KindIdentifier         = "identifier"
	KindMemberExpression   = "member_expression"
	KindFunctionDecl       = "function_declaration"
	KindMethodDefinition   = "method_definition"
	KindClassDecl          = "class_declaration"
	KindArrowFunction      = "arrow_function"
	KindFunctionExpression = "function_expression"
	KindVariableDeclarator = "variable_declarator"
	KindImportClause       = "import_clause"
	KindNamedImports       = "named_imports"
	KindNamespaceImport    = "namespace_import"
	KindImportSpecifier    = "import_specifier"
	KindExportStatement    = "export_statement"
	KindExportClause       = "export_clause"
	KindExportSpecifier    = "export_specifier"
)

// InsertChunkSize caps rows per multi-row INSERT. Postgres allows 65535 bind
// parameters; functions is 9 columns wide, so 500 rows is ~4500.
const InsertChunkSize = 500

// BinarySniffBytes is how much of a file's head is checked for a NUL byte.
const BinarySniffBytes = 512
