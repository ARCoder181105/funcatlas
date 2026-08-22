// Package resolver turns raw call sites into confidence-tagged edges.
//
// Tree-sitter knows `getUser(id)` is a call but not which getUser -- that is
// semantics, not syntax. This package answers by name and scope, and refuses to
// answer when it cannot do so unambiguously. Ambiguity is always unresolved,
// never the first candidate (PRD section 8).
package resolver

import (
	"strings"

	"github.com/ARCoder181105/funcatlas/parser/internal/ir"
	"github.com/ARCoder181105/funcatlas/parser/internal/utils"
)

// Resolve returns one edge per call site, in call-site order.
//
// Every lookup is an in-memory map hit. Querying the database per call site
// would be the O(N*M) trap; the fix is not a faster query, it is not querying.
func Resolve(g ir.Graph) []ir.Edge {
	x := newIndex(g)

	edges := make([]ir.Edge, 0, len(g.Calls))
	for _, c := range g.Calls {
		callee, confidence := x.resolve(c)
		edges = append(edges, ir.Edge{
			CallerFuncIdx: x.callerOf(c),
			CalleeFuncIdx: callee,
			CalleeName:    c.CalleeName,
			Line:          c.Line,
			Confidence:    confidence,
		})
	}
	return edges
}

// index holds the lookup tables, built once per repo.
//
// The two tables that reach past a single file are keyed by resolution group,
// not just by name. A call in main.go must never match a same-named function
// in main.py, and partitioning here rather than filtering at lookup time means
// there is no code path that can reach a foreign-language candidate at all.
type index struct {
	g ir.Graph

	fileIDByPath map[string]int
	funcsInFile  map[int][]int // fileID -> function indexes

	byFileQualified map[int]map[string][]int    // fileID -> qualified_name -> indexes
	byPkgName       map[pkgKey]map[string][]int // group+package_path -> name -> indexes
	byName          map[string]map[string][]int // group -> name -> indexes

	importsByFile map[int]map[string]importedFrom // fileID -> local -> import
}

// pkgKey scopes a package path to its language. A polyglot repository puts
// main.go and main.py in the same directory, so package_path alone is not
// enough to keep their symbols apart.
type pkgKey struct{ group, pkg string }

// importedFrom pairs a local binding with the module it came from.
type importedFrom struct {
	sym  ir.ImportedSymbol
	spec string
}

func newIndex(g ir.Graph) *index {
	x := &index{
		g:               g,
		fileIDByPath:    make(map[string]int, len(g.Files)),
		funcsInFile:     make(map[int][]int),
		byFileQualified: make(map[int]map[string][]int),
		byPkgName:       make(map[pkgKey]map[string][]int),
		byName:          make(map[string]map[string][]int),
		importsByFile:   make(map[int]map[string]importedFrom),
	}

	for i, f := range g.Files {
		x.fileIDByPath[f.Path] = i
	}

	for i, fn := range g.Functions {
		x.funcsInFile[fn.FileID] = append(x.funcsInFile[fn.FileID], i)

		if x.byFileQualified[fn.FileID] == nil {
			x.byFileQualified[fn.FileID] = make(map[string][]int)
		}
		x.byFileQualified[fn.FileID][fn.QualifiedName] = append(
			x.byFileQualified[fn.FileID][fn.QualifiedName], i)

		group := x.groupOf(fn.FileID)

		pkg := pkgKey{group: group, pkg: fn.PackagePath}
		if x.byPkgName[pkg] == nil {
			x.byPkgName[pkg] = make(map[string][]int)
		}
		x.byPkgName[pkg][fn.Name] = append(x.byPkgName[pkg][fn.Name], i)

		if x.byName[group] == nil {
			x.byName[group] = make(map[string][]int)
		}
		x.byName[group][fn.Name] = append(x.byName[group][fn.Name], i)
	}

	// Imports are recorded in the IR for every language, but only consulted
	// where a specifier actually names a file here. Go, Rust, Python and Java
	// resolve through package clauses, crate paths, sys.path and the classpath
	// -- none of which this package models. Following them by name would answer
	// unresolved for a module it cannot reach, where rule 3 still has an honest
	// name_match to give. Skipping them at the source keeps that one decision
	// in one place, covering resolveMember as well as rule 2.
	for _, imp := range g.Imports {
		if !utils.ResolvesModules(g.Files[imp.FileID].Language) {
			continue
		}
		if x.importsByFile[imp.FileID] == nil {
			x.importsByFile[imp.FileID] = make(map[string]importedFrom)
		}
		for _, sym := range imp.Symbols {
			// Side-effect imports and re-exports bind no local name.
			if sym.Local == "" {
				continue
			}
			x.importsByFile[imp.FileID][sym.Local] = importedFrom{sym: sym, spec: imp.From}
		}
	}

	return x
}

// resolve applies the rules in order, stopping at the first unambiguous answer.
func (x *index) resolve(c ir.CallSite) (int, string) {
	// obj.method() and method() are different callees, never merged.
	if c.CalleeObject != "" {
		return x.resolveMember(c)
	}

	// 1. Same file, honouring lexical scope.
	if i, ok := x.lookupScoped(c.FileID, c.CallerQualified, c.CalleeName); ok {
		return i, utils.Exact
	}

	// 2. A symbol this file imports. Empty for languages whose specifiers name
	// no file in this repository -- see newIndex.
	if imp, ok := x.importsByFile[c.FileID][c.CalleeName]; ok {
		return x.resolveImported(c.FileID, imp)
	}

	// 3. Package, then group-wide. Name matching only, hence the weaker tag.
	group := x.groupOf(c.FileID)
	pkg := pkgKey{group: group, pkg: utils.PackagePath(x.g.Files[c.FileID].Path)}
	if i, ok := utils.Only(x.byPkgName[pkg][c.CalleeName]); ok && !x.overloaded(i) {
		return i, utils.NameMatch
	}
	if i, ok := utils.Only(x.byName[group][c.CalleeName]); ok && !x.overloaded(i) {
		return i, utils.NameMatch
	}

	// 4. Nothing. The edge keeps CalleeName regardless.
	return utils.NoFunc, utils.Unresolved
}

// resolveMember handles obj.method(). The receiver narrows the search; one we
// cannot identify ends it rather than widening it.
func (x *index) resolveMember(c ir.CallSite) (int, string) {
	obj := c.CalleeObject

	// A chained receiver or `this` cannot be followed by name. Bailing here is
	// what stops a.b.c() matching a function coincidentally named a.b.c.
	if strings.Contains(obj, ".") || obj == "this" {
		return utils.NoFunc, utils.Unresolved
	}

	imp, imported := x.importsByFile[c.FileID][obj]

	// ns.fn() where ns is `import * as ns from "./m"`.
	if imported && imp.sym.Kind == utils.KindNamespace {
		if target, ok := x.moduleFile(c.FileID, imp.spec); ok {
			if i, ok := x.uniqueQualified(target, c.CalleeName); ok {
				return i, utils.Exact
			}
		}
		return utils.NoFunc, utils.Unresolved
	}

	// Repo.sync() where Repo is a class in this file: stored as "Repo.sync".
	if i, ok := x.uniqueQualified(c.FileID, utils.Join(obj, c.CalleeName)); ok {
		return i, utils.Exact
	}

	// Repo.sync() where Repo was imported from elsewhere in the repo.
	if imported {
		if target, ok := x.moduleFile(c.FileID, imp.spec); ok {
			qualified := utils.Join(utils.ExportedName(imp.sym), c.CalleeName)
			if i, ok := x.uniqueQualified(target, qualified); ok {
				return i, utils.Exact
			}
		}
	}

	return utils.NoFunc, utils.Unresolved
}

// resolveImported follows a local binding back to its module.
func (x *index) resolveImported(fileID int, imp importedFrom) (int, string) {
	// A default import binds an arbitrary local name, so there is nothing to
	// match the definition against. Picking the file's only function would be
	// exactly the coin flip this package refuses.
	if imp.sym.Kind == utils.KindDefault {
		return utils.NoFunc, utils.Unresolved
	}

	target, ok := x.moduleFile(fileID, imp.spec)
	if !ok {
		return utils.NoFunc, utils.Unresolved // outside the repo; honest
	}

	if i, ok := x.uniqueQualified(target, utils.ExportedName(imp.sym)); ok {
		return i, utils.Exact
	}
	// In the repo but not defined in that file: a barrel re-export chain,
	// which name matching cannot follow.
	return utils.NoFunc, utils.Unresolved
}

// lookupScoped resolves a bare name the way lexical scope does: innermost
// enclosing scope first, widening to the module.
func (x *index) lookupScoped(fileID int, callerQualified, name string) (int, bool) {
	for _, candidate := range utils.ScopeCandidates(callerQualified, name) {
		if i, ok := x.uniqueQualified(fileID, candidate); ok {
			return i, true
		}
	}
	return utils.NoFunc, false
}

// groupOf is the resolution group of the file's language.
func (x *index) groupOf(fileID int) string {
	return utils.ResolutionGroup(x.g.Files[fileID].Language)
}

// uniqueQualified returns the one function with this qualified name in this
// file. Two means an overload, which name matching cannot choose between.
func (x *index) uniqueQualified(fileID int, qualified string) (int, bool) {
	return utils.Only(x.byFileQualified[fileID][qualified])
}

// overloaded reports whether i shares its qualified name within its file.
func (x *index) overloaded(i int) bool {
	fn := x.g.Functions[i]
	return len(x.byFileQualified[fn.FileID][fn.QualifiedName]) > 1
}

// moduleFile resolves an import specifier to a file in this repo.
func (x *index) moduleFile(fromFileID int, spec string) (int, bool) {
	for _, candidate := range utils.ModuleCandidates(x.g.Files[fromFileID].Path, spec) {
		if id, ok := x.fileIDByPath[candidate]; ok {
			return id, true
		}
	}
	return 0, false
}

// callerOf returns the innermost function containing the call, or NoFunc at
// module level.
//
// By line containment, not by matching CallerQualified: a call inside an
// anonymous callback records a caller like `localCall.<anonymous>`, which is
// not a function row anywhere.
func (x *index) callerOf(c ir.CallSite) int {
	best, bestSpan := utils.NoFunc, 0
	for _, i := range x.funcsInFile[c.FileID] {
		fn := x.g.Functions[i]
		if c.Line < fn.StartLine || c.Line > fn.EndLine {
			continue
		}
		if span := fn.EndLine - fn.StartLine; best == utils.NoFunc || span < bestSpan {
			best, bestSpan = i, span
		}
	}
	return best
}
