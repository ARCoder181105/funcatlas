// Package ir is the intermediate representation the tree-sitter pass emits and
// the resolver and DB writer consume. Mirrors docs/DATA_MODEL.md, but Go-native
// -- the parser does not import packages/shared (R9).
package ir

type File struct {
	Path     string
	Language string
	// sha256 of the file's bytes, hex. What a re-parse diffs against to decide
	// a file changed: a --depth 1 clone has no history to ask git instead.
	ContentHash string
}

type Function struct {
	FileID        int
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
	// Raw text of a member call's receiver: Repo.sync() -> "Repo",
	// a.b.c() -> "a.b". Empty for a bare call.
	CalleeObject string
	CalleeName   string
	Line         int
}

type ImportedSymbol struct {
	Local    string // bound in this file; empty for side-effect and re-export
	Original string // exported name when it differs: import { a as b } -> "a"
	Kind     string // one of the utils.Kind* constants
}

type Import struct {
	FileID  int
	From    string
	Symbols []ImportedSymbol
}

// Edge is one resolved call. Indexes point into Graph.Functions; the writer
// maps them to primary keys. CalleeName survives when CalleeFuncIdx is NoFunc,
// so an unresolved edge still says what it failed to resolve.
type Edge struct {
	CallerFuncIdx int
	CalleeFuncIdx int
	CalleeName    string
	Line          int
	Confidence    string
}

// Graph is the full extraction result for one repo.
type Graph struct {
	Files     []File
	Functions []Function
	Calls     []CallSite
	Imports   []Import
}
