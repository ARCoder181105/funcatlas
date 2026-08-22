package extract_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ARCoder181105/funcatlas/parser/internal/ir"
	"github.com/ARCoder181105/funcatlas/parser/internal/testutil"
	"github.com/ARCoder181105/funcatlas/parser/internal/utils"
)

func javaFixture(t *testing.T) ir.Graph {
	t.Helper()
	return testutil.Extract(t, "../../testdata/lang/java")
}

// Java's hidden scopes are the anonymous inner class and the lambda. A call in
// either is still a call, and asserting on the calls is what catches a query
// that stopped descending into them.
func TestExtract_JavaCallsInsideHardConstructs(t *testing.T) {
	calls := callsIn(t, javaFixture(t), "Repo.java")

	for _, name := range []string{
		"helper",   // inside an anonymous inner class's method
		"describe", // inside a lambda body
		"wrap",     // a statically imported free function
		"valueOf",  // a static method on a type
		"println",  // a chained receiver, System.out.println
		"get",      // a method on a generic parameter
		"sync",     // one overload calling the other
	} {
		assert.Contains(t, calls, name, "call %q lost", name)
	}
}

// Every enclosing type names a method, and the anonymous scopes are named too,
// so a method inside `new Runnable(){...}` cannot collide with anything.
func TestExtract_JavaQualifiedNames(t *testing.T) {
	names := qualifiedNames(javaFixture(t))

	for _, want := range []string{
		"Repo.Repo",                             // the constructor
		"Repo.sync",                             // both overloads share this
		"Repo.Nested.deep",                      // a static nested class
		"Repo.task." + utils.Anonymous + ".run", // inside new Runnable(){...}
	} {
		assert.Contains(t, names, want)
	}
}

// TypeScript's overload *signatures* never produced a genuine duplicate, so
// this is the first language where overload_index does real work: two methods
// of one name in one class, numbered by start_line.
func TestExtract_JavaOverloadsAreNumbered(t *testing.T) {
	var syncs []ir.Function
	for _, fn := range javaFixture(t).Functions {
		if fn.QualifiedName == "Repo.sync" {
			syncs = append(syncs, fn)
		}
	}
	require.Len(t, syncs, 2, "sync() and sync(int) are two functions with one name")

	first, second := syncs[0], syncs[1]
	if first.StartLine > second.StartLine {
		first, second = second, first
	}
	assert.Equal(t, 0, first.OverloadIndex)
	assert.Equal(t, 1, second.OverloadIndex)
}

func TestExtract_JavaImports(t *testing.T) {
	g := javaFixture(t)

	byFrom := map[string][]ir.ImportedSymbol{}
	for _, imp := range g.Imports {
		byFrom[imp.From] = imp.Symbols
	}

	assert.Equal(t,
		[]ir.ImportedSymbol{{Local: "List", Original: "List", Kind: utils.KindNamed}},
		byFrom["java.util"], "import java.util.List")

	// A static import binds a method name rather than a type, but the shape is
	// the same and the resolver follows neither.
	assert.Equal(t,
		[]ir.ImportedSymbol{{Local: "wrap", Original: "wrap", Kind: utils.KindNamed}},
		byFrom["com.example.util.Text"], "import static com.example.util.Text.wrap")
}

func TestExtract_JavaLanguage(t *testing.T) {
	for _, f := range javaFixture(t).Files {
		assert.Equal(t, utils.LangJava, f.Language, "%s", f.Path)
	}
}
