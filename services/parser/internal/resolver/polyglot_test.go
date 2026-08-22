package resolver_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ARCoder181105/funcatlas/parser/internal/ir"
	"github.com/ARCoder181105/funcatlas/parser/internal/utils"
)

// The Phase 5 exit test.
//
// testdata/polyglot is one directory holding a file per language, each
// defining and calling a function named `helper`. One directory on purpose:
// package_path is identical across all of them, so a symbol table keyed on
// name and package alone would happily link Go to Python.

const polyglotDir = "../../testdata/polyglot"

// ecmaScriptFamily is spelled out here rather than read from
// utils.ResolutionGroup, because a test that measures the boundary with the
// function under test passes when that function is broken. Collapsing every
// language into one group makes src/main.go resolve into src/main.py -- and a
// group-based assertion agrees with itself and notices nothing.
var ecmaScriptFamily = map[string]bool{
	"typescript": true,
	"tsx":        true,
	"javascript": true,
	"jsx":        true,
}

// sameLanguageFamily is the only pairing an edge is allowed to span.
func sameLanguageFamily(caller, callee string) bool {
	return caller == callee || (ecmaScriptFamily[caller] && ecmaScriptFamily[callee])
}

func polyglot(t *testing.T) (ir.Graph, []ir.Edge) {
	t.Helper()
	return resolveFixture(t, polyglotDir)
}

// Every language is read, and every one yields both a function and a call.
// Functions alone would pass with a grammar that drops every body -- which is
// exactly how the .tsx bug survived two phases.
func TestPolyglot_EveryLanguageYieldsFunctionsAndCalls(t *testing.T) {
	g, _ := polyglot(t)

	functions := map[string]int{}
	for _, fn := range g.Functions {
		functions[g.Files[fn.FileID].Language]++
	}
	calls := map[string]int{}
	for _, c := range g.Calls {
		calls[g.Files[c.FileID].Language]++
	}

	for _, language := range []string{
		utils.LangTypeScript, utils.LangTSX, utils.LangJavaScript,
		utils.LangGo, utils.LangRust, utils.LangPython, utils.LangJava,
	} {
		assert.NotZero(t, functions[language], "%s yielded no functions", language)
		assert.NotZero(t, calls[language], "%s yielded no calls", language)
	}
}

// No edge crosses a resolution group.
//
// Every file here defines `helper`, so a resolver that matched on name alone
// would link main.go's call to main.py's definition. This is the promise the
// phase turns on, and it is asserted over every edge rather than a sample.
func TestPolyglot_NoEdgeCrossesALanguageBoundary(t *testing.T) {
	g, edges := polyglot(t)
	require.NotEmpty(t, edges)

	for i, e := range edges {
		if e.CalleeFuncIdx == utils.NoFunc {
			continue
		}
		caller := g.Files[g.Calls[i].FileID]
		callee := g.Files[g.Functions[e.CalleeFuncIdx].FileID]

		assert.True(t, sameLanguageFamily(caller.Language, callee.Language),
			"%s:%d calling %q resolved into %s (%s -> %s)",
			caller.Path, g.Calls[i].Line, g.Calls[i].CalleeName, callee.Path,
			caller.Language, callee.Language)
	}
}

// Outside the ECMAScript family, an exact edge is always same-file. Those
// languages resolve through package clauses, crate paths, sys.path and the
// classpath, and this parser models none of it -- so cross-file gets
// name_match or unresolved, and never a confident answer it cannot back.
func TestPolyglot_CrossFileIsNeverExactOutsideECMAScript(t *testing.T) {
	g, edges := polyglot(t)

	for i, e := range edges {
		if e.Confidence != utils.Exact {
			continue
		}
		callerFile := g.Calls[i].FileID
		calleeFile := g.Functions[e.CalleeFuncIdx].FileID
		if callerFile == calleeFile {
			continue
		}
		assert.True(t, ecmaScriptFamily[g.Files[callerFile].Language],
			"%s resolved a cross-file call exactly", g.Files[callerFile].Path)
	}
}

// The ECMAScript half of that: .tsx importing .ts does resolve exactly, so the
// partition stopped cross-language matches without breaking cross-file ones.
func TestPolyglot_ECMAScriptStillResolvesAcrossFiles(t *testing.T) {
	g, edges := polyglot(t)

	for i, c := range g.Calls {
		if g.Files[c.FileID].Path != "src/Widget.tsx" || c.CalleeName != "helper" {
			continue
		}
		assert.Equal(t, utils.Exact, edges[i].Confidence, "Widget.tsx imports helper from ./main")
		require.NotEqual(t, utils.NoFunc, edges[i].CalleeFuncIdx)
		assert.Equal(t, "src/main.ts", g.Files[g.Functions[edges[i].CalleeFuncIdx].FileID].Path)
		return
	}
	t.Fatal("no call to helper in src/Widget.tsx")
}
