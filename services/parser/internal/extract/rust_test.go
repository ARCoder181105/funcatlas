package extract_test

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/ARCoder181105/funcatlas/parser/internal/ir"
	"github.com/ARCoder181105/funcatlas/parser/internal/testutil"
	"github.com/ARCoder181105/funcatlas/parser/internal/utils"
)

func rustFixture(t *testing.T) ir.Graph {
	t.Helper()
	return testutil.Extract(t, "../../testdata/lang/rust")
}

// Closures, match arms and method chains are where a Rust call hides. All
// three are asserted on the calls, because a grammar that cannot read them
// leaves every function_item matching and drops the bodies.
func TestExtract_RustCallsInsideHardConstructs(t *testing.T) {
	calls := callsIn(t, rustFixture(t), "repo.rs")

	for _, name := range []string{
		"label",   // a method call on self
		"wrap",    // a free function imported from another module
		"peel",    // called under its use-alias, not its original name
		"iter",    // the head of a method chain
		"map",     // the middle of one
		"collect", // the tail
		"render",  // inside a closure passed to map
		"empty",   // inside a match arm
	} {
		assert.Contains(t, calls, name, "call %q lost", name)
	}
}

// A macro body is a token_tree: tree-sitter does not parse expressions inside
// it, so describe(&label) in println! is a bare identifier beside a token_tree
// and not a call at all.
//
// Matching identifiers there would invent a call for every name mentioned in
// every macro. This test pins the limit rather than the wish -- describe IS
// called elsewhere in the fixture, from a match arm, so the assertion is that
// the macro contributes no *second* call site rather than that describe is
// absent entirely.
func TestExtract_RustMacroBodiesAreNotParsed(t *testing.T) {
	g := rustFixture(t)
	fileID := fileIDOf(t, g, "repo.rs")

	var lines []int
	for _, c := range g.Calls {
		if c.FileID == fileID && c.CalleeName == "describe" {
			lines = append(lines, c.Line)
		}
	}

	assert.NotContains(t, lines, 11,
		"repo.rs:11 is describe(&label) inside println!; a macro body is a token_tree")
	assert.NotEmpty(t, lines, "describe is still called from the match arm at least")

	assert.NotContains(t, callsIn(t, g, "repo.rs"), "println",
		"a macro invocation is not a call either")
}

// A method is named after the type its impl block targets.
func TestExtract_RustMethodsCarryTheirImplType(t *testing.T) {
	names := qualifiedNames(rustFixture(t))

	assert.Contains(t, names, "Repo.sync")
	assert.Contains(t, names, "Repo.label")
	assert.Contains(t, names, "describe", "a free function has no prefix")
}

// A call inside a closure is attributed through the anonymous closure to the
// function that owns it.
func TestExtract_RustCallerInsideAClosure(t *testing.T) {
	g := rustFixture(t)
	fileID := fileIDOf(t, g, "repo.rs")

	for _, c := range g.Calls {
		if c.FileID == fileID && c.CalleeName == "render" {
			assert.Equal(t, "apply."+utils.Anonymous, c.CallerQualified)
			return
		}
	}
	t.Fatal("no call to render in repo.rs")
}

// A `use` binds the alias, because that is the name a call site here writes.
func TestExtract_RustUseDeclarations(t *testing.T) {
	g := rustFixture(t)

	byFrom := map[string][]ir.ImportedSymbol{}
	for _, imp := range g.Imports {
		byFrom[imp.From] = imp.Symbols
	}

	assert.Equal(t,
		[]ir.ImportedSymbol{
			{Local: "wrap", Original: "wrap", Kind: utils.KindNamed},
			{Local: "peel", Original: "unwrap", Kind: utils.KindNamed},
		},
		byFrom["crate::util"], "use crate::util::{wrap, unwrap as peel}")

	assert.Equal(t,
		[]ir.ImportedSymbol{{Local: "FmtWrite", Original: "Write", Kind: utils.KindNamed}},
		byFrom["std::fmt"], "use std::fmt::Write as FmtWrite")
}

func TestExtract_RustLanguage(t *testing.T) {
	for _, f := range rustFixture(t).Files {
		assert.Equal(t, utils.LangRust, f.Language, "%s", f.Path)
	}
}
