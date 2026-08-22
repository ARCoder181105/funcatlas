package extract

import (
	tree_sitter "github.com/tree-sitter/go-tree-sitter"

	"github.com/ARCoder181105/funcatlas/parser/internal/ir"
)

// Spec is everything the driver needs to read one language. The per-file loop
// in extract.go is language-agnostic; these are the four things that are not.
type Spec struct {
	Name       string // written to files.language
	Extensions []string
	Language   func() *tree_sitter.Language
	Query      string // the embedded .scm

	// ScopeSegment reports whether node names a scope and, if so, the segment it
	// contributes to a qualified name. Both the definition walk and the
	// call-site walk go through it, so a language states its scope rules once.
	ScopeSegment func(node *tree_sitter.Node, src []byte) (string, bool)

	// CalleeReceiver returns a member call's receiver text, "" for a bare call.
	// Read from the tree rather than captured in the .scm: an `object:` field
	// would make the pattern require one, and bare calls would stop matching.
	CalleeReceiver func(callNode tree_sitter.Node, src []byte) string

	// Imports maps a captured @import.from statement to the names it binds
	// locally -- what a call site in this file can actually reference.
	Imports func(stmt *tree_sitter.Node, src []byte) []ir.ImportedSymbol
}

// registry is every language the parser reads. Adding one is a Spec here, a
// .scm in queries/, and a fixture pinning the calls inside its hardest
// construct -- the third is not optional; see docs/PARSING_STRATEGY.md.
var registry = []*Spec{&typeScript, &tsx, &javaScript, &jsx}
