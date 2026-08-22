package extract_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ARCoder181105/funcatlas/parser/internal/ir"
	"github.com/ARCoder181105/funcatlas/parser/internal/testutil"
	"github.com/ARCoder181105/funcatlas/parser/internal/utils"
)

func javaScriptFixture(t *testing.T) ir.Graph {
	t.Helper()
	return testutil.Extract(t, "../../testdata/lang/javascript")
}

// callsIn lists the callee names recorded for one fixture file.
func callsIn(t *testing.T, g ir.Graph, path string) []string {
	t.Helper()
	fileID := fileIDOf(t, g, path)

	var out []string
	for _, c := range g.Calls {
		if c.FileID == fileID {
			out = append(out, c.CalleeName)
		}
	}
	return out
}

// JSX is JavaScript's hardest construct for the same reason it is TypeScript's:
// a grammar that cannot read it drops every call inside while the declarations
// still match, so the file looks parsed. These assertions are on the calls.
func TestExtract_JSXCallsInsideMarkup(t *testing.T) {
	calls := callsIn(t, javaScriptFixture(t), "Card.jsx")

	for _, name := range []string{
		"formatLabel",  // above the return, outside any JSX
		"cx",           // inside a JSX attribute expression
		"renderTitle",  // inside a JSX child expression
		"map",          // a member call on a JSX child
		"describeItem", // inside a callback nested two JSX levels down
		"countItems",   // inside a template literal inside JSX
		"shout",        // inside JSX in a different function
	} {
		assert.Contains(t, calls, name, "call %q lost inside JSX", name)
	}
}

func TestExtract_JavaScriptLanguagePerExtension(t *testing.T) {
	byPath := map[string]string{}
	for _, f := range javaScriptFixture(t).Files {
		byPath[f.Path] = f.Language
	}

	assert.Equal(t, utils.LangJavaScript, byPath["util.js"])
	assert.Equal(t, utils.LangJavaScript, byPath["legacy.js"])
	assert.Equal(t, utils.LangJSX, byPath["Card.jsx"])
}

// require() is a call, so the import query has to over-capture and let
// jsImports throw the rest away. Both halves are asserted here: the requires
// are recorded with the names they bind, and cx("title") -- an ordinary call
// with a string argument -- is not recorded as an import at all.
func TestExtract_CommonJSRequires(t *testing.T) {
	g := javaScriptFixture(t)
	legacyID := fileIDOf(t, g, "legacy.js")

	byFrom := map[string][]ir.ImportedSymbol{}
	for _, imp := range g.Imports {
		if imp.FileID == legacyID {
			byFrom[imp.From] = imp.Symbols
		}
	}

	assert.Equal(t,
		[]ir.ImportedSymbol{{Local: "helper", Original: "helper", Kind: utils.KindNamed}},
		byFrom["./util.js"], `const { helper } = require("./util.js")`)

	assert.Equal(t,
		[]ir.ImportedSymbol{{Local: "path", Kind: utils.KindNamespace}},
		byFrom["node:path"], `const path = require("node:path") binds the whole module`)

	require.Len(t, byFrom, 2, "only require() calls are imports")

	for _, imp := range g.Imports {
		assert.NotEqual(t, "title", imp.From, `cx("title") is a call, not an import`)
	}
}

// A .js file importing a .ts file resolves like any other ECMAScript import:
// the two are one resolution group, and ModuleCandidates has to try the literal
// ./util.js as well as the ./util.ts it might have stood for.
func TestModuleCandidates_KeepsTheLiteralJSPath(t *testing.T) {
	candidates := utils.ModuleCandidates("src/legacy.js", "./util.js")

	assert.Contains(t, candidates, "src/util.ts", "ESM TypeScript writes .js for .ts")
	assert.Contains(t, candidates, "src/util.js", "a real .js file is a candidate too")
	assert.Less(t,
		indexOf(candidates, "src/util.ts"), indexOf(candidates, "src/util.js"),
		"the TypeScript stem is still tried first")
}

func indexOf(values []string, want string) int {
	for i, v := range values {
		if v == want {
			return i
		}
	}
	return -1
}
