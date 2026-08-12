package ir

// Intermediate representation emitted by the tree-sitter pass and consumed by
// the resolver + DB writer. Mirrors docs/DATA_MODEL.md (functions/edges/files)
// but is Go-native — the parser does NOT import the TS shared package (R9).

type File struct {
	Path     string
	Language string
}

type Function struct {
	FileID        int // resolved after DB insert
	PackagePath   string
	Name          string
	QualifiedName string
	OverloadIndex int
	StartLine     int
	EndLine       int
	Source        string
}

type CallSite struct {
	FileID          int
	CallerQualified string
	// CalleeObject is the raw source text of a member call's receiver:
	// Repo.sync() -> "Repo", a.b.c() -> "a.b", this.x() -> "this".
	// Empty for a bare identifier call. The resolver treats a receiver it
	// cannot identify as unresolved rather than guessing past it.
	CalleeObject string
	CalleeName   string
	Line         int
}

// Import kinds. A local binding is what a call site in this file can name;
// KindReExport binds nothing locally and exists only so barrel files can be
// followed later.
const (
	KindDefault    = "default"
	KindNamed      = "named"
	KindNamespace  = "namespace"
	KindSideEffect = "side-effect"
	KindReExport   = "re-export"
)

type ImportedSymbol struct {
	Local    string // name bound in this file; empty for side-effect and re-export
	Original string // exported name when it differs: import { a as b } -> "a"
	Kind     string
}

type Import struct {
	FileID  int
	From    string
	Symbols []ImportedSymbol
}

// Graph is the full extraction result for one repo.
type Graph struct {
	Files     []File
	Functions []Function
	Calls     []CallSite
	Imports   []Import
}
