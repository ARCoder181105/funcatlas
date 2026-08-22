package extract_test

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/ARCoder181105/funcatlas/parser/internal/ir"
	"github.com/ARCoder181105/funcatlas/parser/internal/testutil"
	"github.com/ARCoder181105/funcatlas/parser/internal/utils"
)

func goFixture(t *testing.T) ir.Graph {
	t.Helper()
	return testutil.Extract(t, "../../testdata/lang/go")
}

// qualifiedNames lists every function's qualified name in the graph.
func qualifiedNames(g ir.Graph) []string {
	out := make([]string, 0, len(g.Functions))
	for _, fn := range g.Functions {
		out = append(out, fn.QualifiedName)
	}
	return out
}

// Go's hardest constructs are the bodies a call can hide in: a goroutine
// literal, a defer, and a generic call. Asserting on the calls is the point --
// a wrong grammar leaves every declaration matching and drops all of these.
func TestExtract_GoCallsInsideHardConstructs(t *testing.T) {
	calls := callsIn(t, goFixture(t), "repo.go")

	for _, name := range []string{
		"unlock",  // inside a defer
		"notify",  // inside a goroutine's function literal
		"Errorf",  // nested inside another call's arguments
		"Wrap",    // a selector call on an imported package
		"Unlock",  // a chained selector, r.mu.Unlock()
		"Map",     // a generic call with two type arguments
		"println", // a builtin
	} {
		assert.Contains(t, calls, name, "call %q lost", name)
	}
}

// A generic call with ONE type argument parses as a type_conversion_expression,
// indistinguishable in shape from int(x). Capturing it would invent a call for
// every conversion in the repository, so it is dropped.
//
// This is a limit, not a bug, and it is pinned here so it cannot change by
// accident: the product's promise is that ambiguity is admitted, never guessed.
func TestExtract_GoSingleTypeArgumentCallIsNotCaptured(t *testing.T) {
	assert.NotContains(t, callsIn(t, goFixture(t), "repo.go"), "Identity",
		"Map[int](xs) is ambiguous with a conversion; capturing it would invent calls")
}

// A method is named after its receiver type, so Repo.Sync never collides with
// a package-level Sync -- pointer and value receivers alike.
func TestExtract_GoMethodsCarryTheirReceiver(t *testing.T) {
	names := qualifiedNames(goFixture(t))

	assert.Contains(t, names, "Repo.Sync", "pointer receiver")
	assert.Contains(t, names, "Repo.unlock", "value receiver")
	assert.Contains(t, names, "notify", "a package-level function has no prefix")
}

// A call inside a goroutine's closure is attributed to the enclosing method,
// through the anonymous literal.
func TestExtract_GoCallerInsideAFuncLiteral(t *testing.T) {
	g := goFixture(t)
	fileID := fileIDOf(t, g, "repo.go")

	for _, c := range g.Calls {
		if c.FileID == fileID && c.CalleeName == "notify" {
			assert.Equal(t, "Repo.Sync."+utils.Anonymous, c.CallerQualified)
			return
		}
	}
	t.Fatal("no call to notify in repo.go")
}

func TestExtract_GoImports(t *testing.T) {
	g := goFixture(t)

	byFrom := map[string][]ir.ImportedSymbol{}
	for _, imp := range g.Imports {
		byFrom[imp.From] = imp.Symbols
	}

	// A Go import binds a qualifier, never the symbols behind it.
	assert.Equal(t,
		[]ir.ImportedSymbol{{Local: "fmt", Kind: utils.KindNamespace}},
		byFrom["fmt"], `import "fmt" binds fmt`)

	assert.Equal(t,
		[]ir.ImportedSymbol{{Local: "stdsync", Kind: utils.KindNamespace}},
		byFrom["sync"], `stdsync "sync" binds the alias, not the last path segment`)

	assert.Equal(t,
		[]ir.ImportedSymbol{{Local: "util", Kind: utils.KindNamespace}},
		byFrom["example.com/app/internal/util"], "a module path binds its last segment")
}

func TestExtract_GoLanguage(t *testing.T) {
	for _, f := range goFixture(t).Files {
		assert.Equal(t, utils.LangGo, f.Language, "%s", f.Path)
	}
}
