package extract_test

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/ARCoder181105/funcatlas/parser/internal/ir"
	"github.com/ARCoder181105/funcatlas/parser/internal/testutil"
	"github.com/ARCoder181105/funcatlas/parser/internal/utils"
)

func pythonFixture(t *testing.T) ir.Graph {
	t.Helper()
	return testutil.Extract(t, "../../testdata/lang/python")
}

// Python hides calls in places a naive query misses: inside a decorator, inside
// an f-string's interpolation, inside a comprehension's filter, and behind
// await. All are asserted on the calls.
func TestExtract_PythonCallsInsideHardConstructs(t *testing.T) {
	calls := callsIn(t, pythonFixture(t), "repo.py")

	for _, name := range []string{
		"wraps",    // inside a decorator expression
		"describe", // inside an f-string interpolation
		"label",    // an attribute call on self
		"sync",     // behind await
		"render",   // the element of a list comprehension
		"keep",     // the comprehension's if-clause
		"basename", // an attribute call on an aliased module
		"peel",     // called under its import alias
	} {
		assert.Contains(t, calls, name, "call %q lost", name)
	}
}

// A decorated definition wraps the function_definition rather than replacing
// it, so the captured name's parent is still the definition -- and the line
// range is the function's, not the decorator's.
func TestExtract_PythonDecoratedFunction(t *testing.T) {
	g := pythonFixture(t)

	for _, fn := range g.Functions {
		if fn.QualifiedName == "Repo.sync" {
			assert.NotContains(t, fn.Source, "@trace",
				"the decorator is above the definition, not part of it")
			assert.Contains(t, fn.Source, "def sync(self):")
			return
		}
	}
	t.Fatal("Repo.sync not extracted")
}

// Class nesting is part of the name, so Repo.Nested.deep never collides with a
// module-level deep -- and async def is an ordinary function_definition.
func TestExtract_PythonQualifiedNames(t *testing.T) {
	names := qualifiedNames(pythonFixture(t))

	for _, want := range []string{
		"Repo.sync",
		"Repo.Nested.deep",
		"trace.inner", // a closure defined inside a decorator factory
		"fetch",       // async def
		"describe",
	} {
		assert.Contains(t, names, want)
	}
}

func TestExtract_PythonImports(t *testing.T) {
	g := pythonFixture(t)

	byFrom := map[string][]ir.ImportedSymbol{}
	for _, imp := range g.Imports {
		byFrom[imp.From] = imp.Symbols
	}

	assert.Equal(t,
		[]ir.ImportedSymbol{{Local: "functools", Kind: utils.KindNamespace}},
		byFrom["functools"], "import functools")

	// `import os.path as osp` binds osp; without the alias it would bind os,
	// because that is the only name a call site could then write.
	assert.Equal(t,
		[]ir.ImportedSymbol{{Local: "osp", Kind: utils.KindNamespace}},
		byFrom["os.path"], "import os.path as osp")

	assert.Equal(t,
		[]ir.ImportedSymbol{
			{Local: "wrap", Original: "wrap", Kind: utils.KindNamed},
			{Local: "peel", Original: "unwrap", Kind: utils.KindNamed},
		},
		byFrom[".util"], "from .util import wrap, unwrap as peel")
}

func TestExtract_PythonLanguage(t *testing.T) {
	for _, f := range pythonFixture(t).Files {
		assert.Equal(t, utils.LangPython, f.Language, "%s", f.Path)
	}
}
