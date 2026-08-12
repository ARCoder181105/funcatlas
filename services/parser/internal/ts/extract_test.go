package ts_test

import (
	"encoding/json"
	"flag"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ARCoder181105/funcatlas/parser/internal/ir"
	"github.com/ARCoder181105/funcatlas/parser/internal/testutil"
	"github.com/ARCoder181105/funcatlas/parser/internal/utils"
)

var update = flag.Bool("update", false, "rewrite golden files instead of comparing against them")

const goldenJSON = "../../testdata/golden/extract_expected.json"

func extractGolden(t *testing.T) ir.Graph {
	t.Helper()
	return testutil.Extract(t, "../../testdata/golden")
}

func TestExtract_Golden(t *testing.T) {
	graph := extractGolden(t)

	actual, err := json.MarshalIndent(graph, "", "  ")
	require.NoError(t, err)
	actual = append(actual, '\n')

	if *update {
		require.NoError(t, os.WriteFile(goldenJSON, actual, 0o644))
		t.Logf("wrote %s", goldenJSON)
		return
	}

	expected, err := os.ReadFile(goldenJSON)
	require.NoError(t, err, "run `go test ./internal/ts -run Golden -update` to create it")

	if !assert.JSONEq(t, string(expected), string(actual)) {
		out := t.TempDir() + "/extract_actual.json"
		require.NoError(t, os.WriteFile(out, actual, 0o644))
		t.Logf("actual output written to %s", out)
	}
}

// fileIDOf returns the index of the golden file with the given path.
func fileIDOf(t *testing.T, g ir.Graph, path string) int {
	t.Helper()
	for i, f := range g.Files {
		if f.Path == path {
			return i
		}
	}
	t.Fatalf("file %q not in graph", path)
	return -1
}

// TestExtract_CallsCarryTheirFile is the C0 guarantee the resolver depends on:
// the first two resolution rules ask "same file?" and "imported by this file?",
// and neither is answerable if a call does not know where it came from.
func TestExtract_CallsCarryTheirFile(t *testing.T) {
	g := extractGolden(t)
	callsID := fileIDOf(t, g, "calls.ts")
	repoID := fileIDOf(t, g, "repo.ts")
	require.NotEqual(t, callsID, repoID)

	byName := map[string]int{}
	for _, c := range g.Calls {
		byName[c.CalleeName] = c.FileID
	}

	// innerCall is only in calls.ts; Repo.sync() is only in repo.ts.
	assert.Equal(t, callsID, byName["innerCall"], "innerCall belongs to calls.ts")
	assert.Equal(t, repoID, byName["sync"], "Repo.sync() belongs to repo.ts")

	for _, c := range g.Calls {
		assert.Less(t, c.FileID, len(g.Files), "call %q has out-of-range FileID", c.CalleeName)
		assert.GreaterOrEqual(t, c.FileID, 0)
	}
}

func TestExtract_CalleeObject(t *testing.T) {
	g := extractGolden(t)

	type call struct{ object, name string }
	got := map[call]bool{}
	for _, c := range g.Calls {
		got[call{c.CalleeObject, c.CalleeName}] = true
	}

	// A member call keeps its receiver, so Repo.sync() is distinguishable from
	// anythingElse.sync(). A chained call records the whole object expression.
	assert.True(t, got[call{"Repo", "sync"}], "Repo.sync() should record object Repo")
	assert.True(t, got[call{"a.b", "c"}], "a.b.c() should record object a.b")
	assert.True(t, got[call{"obj", "method"}], "obj.method() should record object obj")
	// A bare call has no receiver at all.
	assert.True(t, got[call{"", "innerCall"}], "innerCall() should record no object")
	assert.True(t, got[call{"", "greet"}], "greet() should record no object")
}

func TestExtract_ModuleLevelCallerIsModule(t *testing.T) {
	g := extractGolden(t)
	callsID := fileIDOf(t, g, "calls.ts")

	// calls.ts line 8 is `a.b.c()` at the top level, outside any function.
	var found bool
	for _, c := range g.Calls {
		if c.FileID == callsID && c.Line == 8 {
			found = true
			assert.Equal(t, "<module>", c.CallerQualified)
		}
	}
	assert.True(t, found, "expected a call at calls.ts:8")
}

func TestExtract_ImportSymbols(t *testing.T) {
	g := extractGolden(t)

	byFrom := map[string][]ir.ImportedSymbol{}
	for _, imp := range g.Imports {
		byFrom[imp.From] = imp.Symbols
	}

	// `import { a as b }` binds b locally. Collecting every identifier in the
	// statement would yield both a and b, and a is a name this file cannot call.
	assert.Equal(t,
		[]ir.ImportedSymbol{{Local: "b", Original: "a", Kind: utils.KindNamed}},
		byFrom["x"], `import { a as b } from "x"`)

	assert.Equal(t,
		[]ir.ImportedSymbol{{Local: "def", Kind: utils.KindDefault}},
		byFrom["a"], `import def from "a"`)

	assert.Equal(t,
		[]ir.ImportedSymbol{{Local: "named", Original: "named", Kind: utils.KindNamed}},
		byFrom["b"], `import { named } from "b"`)

	assert.Equal(t,
		[]ir.ImportedSymbol{{Local: "ns", Kind: utils.KindNamespace}},
		byFrom["c"], `import * as ns from "c"`)

	assert.Equal(t,
		[]ir.ImportedSymbol{{Kind: utils.KindSideEffect}},
		byFrom["d"], `import "d" binds nothing`)

	// A re-export binds nothing locally either, so it must not produce a Local
	// name the resolver would then match call sites against.
	require.Len(t, byFrom["e"], 1)
	assert.Empty(t, byFrom["e"][0].Local, `export { reexport } from "e" binds no local name`)
	assert.Equal(t, utils.KindReExport, byFrom["e"][0].Kind)
}

func TestExtract_OverloadIndicesAreZeroWithoutDuplicates(t *testing.T) {
	g := extractGolden(t)

	// TypeScript overload *signatures* parse as function_signature and are not
	// captured, so repo.ts's three `fetch` declarations yield one function.
	var fetches []ir.Function
	for _, f := range g.Functions {
		if f.Name == "fetch" {
			fetches = append(fetches, f)
		}
	}
	require.Len(t, fetches, 1, "only the implementation signature has a body")
	assert.Equal(t, 0, fetches[0].OverloadIndex)
}

// TestExtract_OverloadIndicesAreAssignedByStartLine covers the case
// overload_index actually exists for: two declarations sharing a qualified name
// in one file. Numbering by start_line keeps it stable across re-parses, which
// is what makes the delete-and-reinsert relink collision-free.
func TestExtract_OverloadIndicesAreAssignedByStartLine(t *testing.T) {
	g := testutil.Extract(t, "../../testdata/overloads")

	var dups []ir.Function
	for _, f := range g.Functions {
		if f.QualifiedName == "dup" {
			dups = append(dups, f)
		}
	}
	require.Len(t, dups, 2)

	first, second := dups[0], dups[1]
	if first.StartLine > second.StartLine {
		first, second = second, first
	}
	assert.Equal(t, 0, first.OverloadIndex, "earlier declaration gets index 0")
	assert.Equal(t, 1, second.OverloadIndex)

	// A function with no duplicate stays at 0.
	for _, f := range g.Functions {
		if f.QualifiedName == "unique" {
			assert.Equal(t, 0, f.OverloadIndex)
		}
	}
}

// The TypeScript grammar cannot parse JSX: a component body becomes one ERROR
// node, the declaration still matches, and every call inside the JSX is lost.
// That failure is invisible -- the file appears to parse -- so this test pins
// the calls rather than just the functions.
func TestExtract_TSXCallsInsideJSX(t *testing.T) {
	g := testutil.Extract(t, "../../testdata/tsx")

	var called []string
	for _, c := range g.Calls {
		called = append(called, c.CalleeName)
	}

	// formatLabel sits above the return; the other three are inside the JSX.
	for _, name := range []string{"formatLabel", "cx", "renderTitle", "helper"} {
		assert.Contains(t, called, name, "call %q lost -- is .tsx using the TSX grammar?", name)
	}
}

// Both extensions are parsed, and nothing else is.
func TestExtract_OnlyTypeScriptExtensions(t *testing.T) {
	dir := t.TempDir()
	for name, body := range map[string]string{
		"a.ts":   "export function fromTs() {}\n",
		"b.tsx":  "export function FromTsx() { return <div />; }\n",
		"c.js":   "export function fromJs() {}\n",
		"d.jsx":  "export function FromJsx() { return <div />; }\n",
		"e.py":   "def from_python(): pass\n",
		"f.go":   "package main\nfunc FromGo() {}\n",
		"g.json": `{"not": "source"}`,
	} {
		require.NoError(t, os.WriteFile(filepath.Join(dir, name), []byte(body), 0o644))
	}

	g := testutil.Extract(t, dir)

	var paths []string
	for _, f := range g.Files {
		paths = append(paths, f.Path)
	}
	assert.ElementsMatch(t, []string{"a.ts", "b.tsx"}, paths)

	var names []string
	for _, fn := range g.Functions {
		names = append(names, fn.Name)
	}
	assert.ElementsMatch(t, []string{"fromTs", "FromTsx"}, names)
}
