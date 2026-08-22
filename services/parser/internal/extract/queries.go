package extract

import (
	"fmt"

	tree_sitter "github.com/tree-sitter/go-tree-sitter"

	"github.com/ARCoder181105/funcatlas/parser/internal/utils"
)

// compiledQueries holds one language's compiled tree-sitter queries.
// Compiled once per run, reused across every file.
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

// loadQueries compiles a language's .scm and verifies it declares all three
// captures. A half-written query fails here rather than yielding a file that
// looks parsed and has no calls.
func loadQueries(lang *tree_sitter.Language, src string) (*compiledQueries, error) {
	out := &compiledQueries{}
	for _, target := range []struct {
		capture string
		into    **tree_sitter.Query
	}{
		{utils.CaptureFunctionDef, &out.def},
		{utils.CaptureFunctionCall, &out.call},
		{utils.CaptureImportFrom, &out.imp},
	} {
		q, err := compileOne(lang, src, target.capture)
		if err != nil {
			out.closePartial()
			return nil, fmt.Errorf("%s: %w", target.capture, err)
		}
		*target.into = q
	}
	return out, nil
}

// closePartial releases whichever queries were compiled before one failed.
func (q *compiledQueries) closePartial() {
	for _, compiled := range []*tree_sitter.Query{q.def, q.call, q.imp} {
		if compiled != nil {
			compiled.Close()
		}
	}
}

// compileOne compiles the whole .scm against the language and verifies the
// requested capture name exists. The returned Query runs ALL patterns; the
// extractor filters by capture index.
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
