package resolver_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ARCoder181105/funcatlas/parser/internal/ir"
	"github.com/ARCoder181105/funcatlas/parser/internal/resolver"
	"github.com/ARCoder181105/funcatlas/parser/internal/testutil"
	"github.com/ARCoder181105/funcatlas/parser/internal/utils"
)

func resolveFixture(t *testing.T, dir string) (ir.Graph, []ir.Edge) {
	t.Helper()
	g := testutil.Extract(t, dir)
	return g, resolver.Resolve(g)
}

// edgeFor returns the edge for the call to name in main.ts.
func edgeFor(t *testing.T, g ir.Graph, edges []ir.Edge, name string) ir.Edge {
	t.Helper()
	mainID := -1
	for i, f := range g.Files {
		if f.Path == "main.ts" {
			mainID = i
		}
	}
	require.NotEqual(t, -1, mainID, "main.ts not in graph")

	for i, c := range g.Calls {
		if c.FileID == mainID && c.CalleeName == name {
			return edges[i]
		}
	}
	t.Fatalf("no call to %q in main.ts", name)
	return ir.Edge{}
}

// target names the function an edge resolved to, or "" when unresolved.
func target(g ir.Graph, e ir.Edge) string {
	if e.CalleeFuncIdx == utils.NoFunc {
		return ""
	}
	return g.Functions[e.CalleeFuncIdx].QualifiedName
}

// TestResolve covers every outcome the confidence tiers promise. The unresolved
// cases matter most: each one is a place the resolver could have guessed.
func TestResolve(t *testing.T) {
	g, edges := resolveFixture(t, "../../testdata/resolve")

	tests := []struct {
		call       string
		confidence string
		target     string
		why        string
	}{
		{"local", utils.Exact, "local", "defined in the same file"},
		{"inner", utils.Exact, "outer.inner", "nested scope beats a wider one"},
		{"recurse", utils.Exact, "recurse", "recursion is a real self-edge"},
		{"outer", utils.Exact, "outer", "same file, top level"},
		{"helper", utils.Exact, "helper", "imported by name from ./helpers"},
		{"sync", utils.Exact, "Repo.sync", "receiver names an imported class"},
		{"deepOnly", utils.Exact, "deepOnly", "namespace import into a subdirectory"},
		{"onlyOne", utils.NameMatch, "onlyOne", "not imported; the only one in the package"},

		{"readFile", utils.Unresolved, "", "node:fs is outside the repo"},
		{"shared", utils.Unresolved, "", "two candidates; never pick one"},
		{"dup", utils.Unresolved, "", "overloaded qualified name; cannot choose"},
		{"method", utils.Unresolved, "", "receiver obj is not identifiable"},
		{"def", utils.Unresolved, "", "default import binds an arbitrary name"},
	}

	for _, tc := range tests {
		t.Run(tc.call, func(t *testing.T) {
			e := edgeFor(t, g, edges, tc.call)
			assert.Equal(t, tc.confidence, e.Confidence, tc.why)
			assert.Equal(t, tc.target, target(g, e), tc.why)
			// The name survives regardless, so an unresolved edge still says
			// what it failed to resolve.
			assert.Equal(t, tc.call, e.CalleeName)
		})
	}
}

// Every call site produces exactly one edge. Keying by the call struct would
// silently merge two identical calls on one line into a single edge.
func TestResolve_OneEdgePerCallSite(t *testing.T) {
	g, edges := resolveFixture(t, "../../testdata/resolve")
	require.Len(t, edges, len(g.Calls))
}

func TestResolve_CallerIsInnermostEnclosingFunction(t *testing.T) {
	g, edges := resolveFixture(t, "../../testdata/resolve")

	// inner() is called from outer(), not from main().
	e := edgeFor(t, g, edges, "inner")
	require.NotEqual(t, utils.NoFunc, e.CallerFuncIdx)
	assert.Equal(t, "outer", g.Functions[e.CallerFuncIdx].QualifiedName)
}

// A call inside an anonymous callback must attribute to the nearest captured
// function. The callback itself is not a function row, so a caller of
// `localCall.<anonymous>` would point at nothing.
func TestResolve_CallerInsideAnonymousCallback(t *testing.T) {
	g, edges := resolveFixture(t, "../../testdata/golden")

	for i, c := range g.Calls {
		if c.CalleeName != "innerCall" {
			continue
		}
		assert.Equal(t, "localCall.<anonymous>", c.CallerQualified, "IR records the closure")
		e := edges[i]
		require.NotEqual(t, utils.NoFunc, e.CallerFuncIdx, "edge must have a real caller row")
		assert.Equal(t, "localCall", g.Functions[e.CallerFuncIdx].QualifiedName)
		return
	}
	t.Fatal("no call to innerCall in the golden fixture")
}

func TestResolve_ModuleLevelCallHasNoCaller(t *testing.T) {
	g, edges := resolveFixture(t, "../../testdata/golden")

	for i, c := range g.Calls {
		if c.CallerQualified == utils.ModuleCaller {
			assert.Equal(t, utils.NoFunc, edges[i].CallerFuncIdx,
				"a call outside any function has no calling function row")
			return
		}
	}
	t.Fatal("no module-level call in the golden fixture")
}

// Confidence is only ever one of the three the CHECK constraint allows, and an
// unresolved edge is the only kind allowed to have no callee.
func TestResolve_ConfidenceMatchesCalleePresence(t *testing.T) {
	_, edges := resolveFixture(t, "../../testdata/resolve")

	for _, e := range edges {
		assert.Contains(t, []string{utils.Exact, utils.NameMatch, utils.Unresolved}, e.Confidence)
		if e.CalleeFuncIdx == utils.NoFunc {
			assert.Equal(t, utils.Unresolved, e.Confidence,
				"a missing callee must be tagged unresolved, or the DB CHECK rejects it")
		}
	}
}

// crossLanguage is two files in one directory, each defining and calling a
// function named helper. Built by hand rather than from a fixture directory:
// this is the resolver's own guarantee, and it has to hold for every language
// the extractor learns, including ones it does not read yet.
func crossLanguage(callerLang, calleeLang string) ir.Graph {
	return ir.Graph{
		Files: []ir.File{
			{Path: "src/main." + callerLang, Language: callerLang},
			{Path: "src/other." + calleeLang, Language: calleeLang},
		},
		Functions: []ir.Function{
			{FileID: 0, PackagePath: "src", Name: "run", QualifiedName: "run", StartLine: 1, EndLine: 3},
			{FileID: 1, PackagePath: "src", Name: "helper", QualifiedName: "helper", StartLine: 1, EndLine: 2},
		},
		Calls: []ir.CallSite{
			{FileID: 0, CallerQualified: "run", CalleeName: "helper", Line: 2},
		},
	}
}

// A call in one language must never match a same-named function in another.
// The two repo-wide lookups are keyed by resolution group for exactly this,
// and the same package path is the case that would otherwise slip through.
func TestResolve_NeverCrossesALanguageBoundary(t *testing.T) {
	languages := []string{
		utils.LangTypeScript, utils.LangTSX, utils.LangJavaScript, utils.LangJSX,
		utils.LangGo, utils.LangRust, utils.LangPython, utils.LangJava,
	}

	for _, caller := range languages {
		for _, callee := range languages {
			if utils.ResolutionGroup(caller) == utils.ResolutionGroup(callee) {
				continue
			}
			g := crossLanguage(caller, callee)
			edges := resolver.Resolve(g)
			require.Len(t, edges, 1)
			assert.Equal(t, utils.Unresolved, edges[0].Confidence,
				"a call in %s resolved to a function in %s", caller, callee)
			assert.Equal(t, utils.NoFunc, edges[0].CalleeFuncIdx)
			assert.Equal(t, "helper", edges[0].CalleeName,
				"an unresolved edge still says what it failed to resolve")
		}
	}
}

// Within a group it still resolves, or the partition would have broken .ts
// calling .tsx rather than only stopping cross-language matches.
func TestResolve_MatchesWithinAResolutionGroup(t *testing.T) {
	g := crossLanguage(utils.LangTypeScript, utils.LangTSX)
	edges := resolver.Resolve(g)

	require.Len(t, edges, 1)
	assert.Equal(t, utils.NameMatch, edges[0].Confidence)
	assert.Equal(t, "helper", target(g, edges[0]))
}

// Imports are extracted for every language but only followed where a specifier
// names a file here. Without that, a Python `from utils import helper` would
// enter rule 2, fail to find a module, and answer unresolved -- throwing away
// the name_match rule 3 would have given.
func TestResolve_ImportsAreOnlyFollowedWhereTheyNameAFile(t *testing.T) {
	g := crossLanguage(utils.LangPython, utils.LangPython)
	g.Imports = []ir.Import{{
		FileID:  0,
		From:    "utils",
		Symbols: []ir.ImportedSymbol{{Local: "helper", Original: "helper", Kind: utils.KindNamed}},
	}}

	edges := resolver.Resolve(g)
	require.Len(t, edges, 1)
	assert.Equal(t, utils.NameMatch, edges[0].Confidence,
		"an unfollowable import must not downgrade a call rule 3 can still answer")
	assert.Equal(t, "helper", target(g, edges[0]))
}

// A genuine overload resolves to nothing.
//
// Java's Repo.sync() and Repo.sync(int) share a qualified name, and picking
// between them needs argument types this parser does not have. uniqueQualified
// answers "many, therefore none" -- the whole point of Only over indexing.
func TestResolve_JavaOverloadIsUnresolved(t *testing.T) {
	g, edges := resolveFixture(t, "../../testdata/lang/java")

	var found bool
	for i, c := range g.Calls {
		if c.CalleeName != "sync" {
			continue
		}
		found = true
		assert.Equal(t, utils.Unresolved, edges[i].Confidence,
			"two overloads of sync; choosing one would be a guess")
		assert.Equal(t, utils.NoFunc, edges[i].CalleeFuncIdx)
	}
	require.True(t, found, "no call to sync in the Java fixture")
}

// Cross-file calls outside the ECMAScript family are never exact: those
// languages resolve through packages, crate paths, sys.path and the classpath,
// and none of that is modelled here.
func TestResolve_NonECMAScriptCrossFileIsNeverExact(t *testing.T) {
	for _, dir := range []string{
		"../../testdata/lang/go",
		"../../testdata/lang/rust",
		"../../testdata/lang/python",
		"../../testdata/lang/java",
	} {
		g, edges := resolveFixture(t, dir)
		for i, e := range edges {
			if e.CalleeFuncIdx == utils.NoFunc || e.Confidence != utils.Exact {
				continue
			}
			assert.Equal(t,
				g.Calls[i].FileID, g.Functions[e.CalleeFuncIdx].FileID,
				"%s: an exact edge outside ECMAScript must be same-file", dir)
		}
	}
}
