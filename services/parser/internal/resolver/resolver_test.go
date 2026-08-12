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
