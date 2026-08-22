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

	// Imports maps an @import.from capture to the module it names and the
	// names it binds locally -- what a call site in this file can reference.
	//
	// It takes the captured node and finds its own way up, because there is no
	// shape shared across languages: TypeScript captures a quoted string, Go a
	// path inside an import_spec, Rust a `use` argument with no quotes at all.
	// A nil symbol list means the match was not an import; some queries have to
	// over-capture, since JavaScript's require() is an ordinary call.
	Imports func(captured tree_sitter.Node, src []byte) (string, []ir.ImportedSymbol)
}

// registry is every language the parser reads. Adding one is a Spec here, a
// .scm in queries/, and a fixture pinning the calls inside its hardest
// construct -- the third is not optional; see docs/PARSING_STRATEGY.md.
var registry = []*Spec{&typeScript, &tsx, &javaScript, &jsx, &golang, &rust}
