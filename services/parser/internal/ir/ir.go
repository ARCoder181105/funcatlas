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
	CallerQualified string
	CalleeName      string
	Line            int
}

type Import struct {
	FileID  int
	Symbols []string
	From    string
}

// Graph is the full extraction result for one repo.
type Graph struct {
	Files     []File
	Functions []Function
	Calls     []CallSite
	Imports   []Import
}
