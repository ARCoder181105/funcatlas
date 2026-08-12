package ts

import (
	"fmt"

	tree_sitter "github.com/tree-sitter/go-tree-sitter"

	"github.com/ARCoder181105/funcatlas/parser/queries"
)

// compiledQueries holds the compiled tree-sitter queries for TypeScript.
// One loader call per run (per language); reused across every file.
type compiledQueries struct {
	def  *tree_sitter.Query // @function.def
	call *tree_sitter.Query // @function.call
	imp  *tree_sitter.Query // @import.from
}

func (q *compiledQueries) Close() {
	q.def.Close()
	q.call.Close()
	q.imp.Close()
}

// loadQueries compiles the bundled TypeScript .scm once per run.
// Returns the compiled queries or an error if any capture name is missing.
func loadQueries(lang *tree_sitter.Language) (*compiledQueries, error) {
	src := queries.TypeScriptSCM

	def, err := compileOne(lang, src, "function.def")
	if err != nil {
		return nil, fmt.Errorf("function.def: %w", err)
	}
	call, err := compileOne(lang, src, "function.call")
	if err != nil {
		def.Close()
		return nil, fmt.Errorf("function.call: %w", err)
	}
	imp, err := compileOne(lang, src, "import.from")
	if err != nil {
		def.Close()
		call.Close()
		return nil, fmt.Errorf("import.from: %w", err)
	}
	return &compiledQueries{def: def, call: call, imp: imp}, nil
}

// compileOne compiles the whole .scm against the language and verifies the
// requested capture name exists. Returns the compiled Query (which runs ALL
// patterns; we filter by capture index in C2/C5/C6).
func compileOne(lang *tree_sitter.Language, src, capture string) (*tree_sitter.Query, error) {
	q, qerr := tree_sitter.NewQuery(lang, src)
	if qerr != nil {
		return nil, qerr
	}
	if _, ok := q.CaptureIndexForName(capture); !ok {
		q.Close()
		return nil, fmt.Errorf("capture @%s not found in query", capture)
	}
	return q, nil
}
