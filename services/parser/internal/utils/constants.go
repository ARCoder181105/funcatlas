package utils

// Every shared literal in the parser. One home, so a string like "unresolved"
// is never spelled twice and cannot drift from the database CHECK constraint.

// Languages, as written to files.language. One name per grammar-and-extension
// pairing, so the value always says which grammar actually read the file.
const (
	LangTypeScript = "typescript"
	LangTSX        = "tsx"
	LangJavaScript = "javascript"
	LangJSX        = "jsx"
	LangGo         = "go"
	LangRust       = "rust"
	LangPython     = "python"
	LangJava       = "java"
)

// GroupECMAScript is the one resolution group holding more than one language.
// Every other language is its own group, named after itself.
const GroupECMAScript = "ecmascript"

// resolutionGroups lists only the languages that share a group with another.
var resolutionGroups = map[string]string{
	LangTypeScript: GroupECMAScript,
	LangTSX:        GroupECMAScript,
	LangJavaScript: GroupECMAScript,
	LangJSX:        GroupECMAScript,
}

// ResolutionGroup partitions the resolver's symbol table. A call in main.go
// must never match a same-named function in main.py, and partitioning by this
// at index-build time is what makes that structural rather than a filter
// somebody can forget to apply.
func ResolutionGroup(language string) string {
	if group, ok := resolutionGroups[language]; ok {
		return group
	}
	return language
}

// ResolvesModules reports whether a language's import specifiers name files in
// this repository. Only the ECMAScript family's do. For the rest, consulting
// imports would answer "unresolved" for a module the resolver simply cannot
// follow, where falling through to name matching is the more honest answer.
func ResolvesModules(language string) bool {
	return ResolutionGroup(language) == GroupECMAScript
}

// Capture names every language's .scm must declare. Missing one is a compile
// error at load time rather than a file that parses to nothing.
const (
	CaptureFunctionDef  = "function.def"
	CaptureFunctionCall = "function.call"
	CaptureImportFrom   = "import.from"
)

// DefaultBranch is recorded when a checkout reports no branch of its own --
// a detached head, or a path that is not a git repository at all.
const DefaultBranch = "main"

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
// cannot parse JSX, and fails silently by dropping calls inside it. The
// JavaScript grammar has no such split.
const (
	ExtTS     = ".ts"
	ExtTSX    = ".tsx"
	ExtJS     = ".js"
	ExtJSX    = ".jsx"
	ExtMJS    = ".mjs"
	ExtCJS    = ".cjs"
	ExtGo     = ".go"
	ExtRust   = ".rs"
	ExtPython = ".py"
	ExtJava   = ".java"
)

// Extensions a module specifier is resolved against, in order. TypeScript
// first: ESM TypeScript writes ./foo.js for what is really ./foo.ts, so the
// stripped candidates have to be tried before the literal one.
var (
	SourceExtensions = []string{ExtTS, ExtTSX, ExtJS, ExtJSX, ExtMJS, ExtCJS}
	IndexFiles       = indexFilesFor(SourceExtensions)
)

func indexFilesFor(extensions []string) []string {
	out := make([]string, 0, len(extensions))
	for _, ext := range extensions {
		out = append(out, "/index"+ext)
	}
	return out
}

// Tree-sitter node kinds, so a grammar rename breaks in one place.
// Grouped by language: these are TypeScript's, shared with JSX.
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

// JavaScript adds CommonJS: an import that is a call, and destructuring on the
// left of it rather than an import clause.
const (
	KindArguments                          = "arguments"
	KindObjectPattern                      = "object_pattern"
	KindPairPattern                        = "pair_pattern"
	KindShorthandPropertyIdentifierPattern = "shorthand_property_identifier_pattern"
)

// RequireCallee is the only call the import query's specifier capture keeps.
const RequireCallee = "require"

// Go. A method's name is a field_identifier, and its receiver type is what
// makes Repo.Sync distinguishable from a package-level Sync.
const (
	KindGoFuncDecl           = "function_declaration"
	KindGoMethodDecl         = "method_declaration"
	KindGoFuncLiteral        = "func_literal"
	KindGoSelectorExpression = "selector_expression"
	KindGoTypeIdentifier     = "type_identifier"
)

// Import aliases that bind no usable local name.
const (
	GoBlankImport = "_"
	GoDotImport   = "."
)

// Rust. A `use` is a nested path expression rather than a quoted specifier,
// and a method's owner is the type its impl block targets.
const (
	KindRustFunctionItem      = "function_item"
	KindRustImplItem          = "impl_item"
	KindRustClosureExpression = "closure_expression"
	KindRustFieldExpression   = "field_expression"
	KindRustTypeIdentifier    = "type_identifier"
	KindRustIdentifier        = "identifier"
	KindRustScopedIdentifier  = "scoped_identifier"
	KindRustScopedUseList     = "scoped_use_list"
	KindRustUseAsClause       = "use_as_clause"
	KindRustUseWildcard       = "use_wildcard"
	KindRustSelf              = "self"
)

// RustPathSeparator joins the segments of a use path.
const RustPathSeparator = "::"

// Python. A decorated definition wraps the function_definition rather than
// replacing it, and an import statement has no single specifier node.
const (
	KindPyFunctionDef   = "function_definition"
	KindPyClassDef      = "class_definition"
	KindPyLambda        = "lambda"
	KindPyAttribute     = "attribute"
	KindPyImportFrom    = "import_from_statement"
	KindPyAliasedImport = "aliased_import"
	KindPyDottedName    = "dotted_name"
)

// Java. Every enclosing type names a method, and an anonymous inner class is a
// class_body hanging off an object_creation_expression.
const (
	KindJavaMethodDecl       = "method_declaration"
	KindJavaConstructorDecl  = "constructor_declaration"
	KindJavaClassDecl        = "class_declaration"
	KindJavaInterfaceDecl    = "interface_declaration"
	KindJavaEnumDecl         = "enum_declaration"
	KindJavaRecordDecl       = "record_declaration"
	KindJavaLambda           = "lambda_expression"
	KindJavaObjectCreation   = "object_creation_expression"
	KindJavaClassBody        = "class_body"
	KindJavaMethodInvocation = "method_invocation"
	KindJavaScopedIdentifier = "scoped_identifier"
)

// JavaWildcardImport binds every type in a package under no local name.
const JavaWildcardImport = ".*;"

// InsertChunkSize caps rows per multi-row INSERT. Postgres allows 65535 bind
// parameters; functions is 9 columns wide, so 500 rows is ~4500.
const InsertChunkSize = 500

// BinarySniffBytes is how much of a file's head is checked for a NUL byte.
const BinarySniffBytes = 512
