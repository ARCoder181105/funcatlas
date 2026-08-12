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
type index struct {
	g ir.Graph

	fileIDByPath map[string]int
	funcsInFile  map[int][]int // fileID -> function indexes

	byFileQualified map[int]map[string][]int    // fileID -> qualified_name -> indexes
	byPkgName       map[string]map[string][]int // package_path -> name -> indexes
	byName          map[string][]int            // name -> indexes, repo-wide

	importsByFile map[int]map[string]importedFrom // fileID -> local -> import
}

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
		byPkgName:       make(map[string]map[string][]int),
		byName:          make(map[string][]int),
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

		if x.byPkgName[fn.PackagePath] == nil {
			x.byPkgName[fn.PackagePath] = make(map[string][]int)
		}
		x.byPkgName[fn.PackagePath][fn.Name] = append(x.byPkgName[fn.PackagePath][fn.Name], i)

		x.byName[fn.Name] = append(x.byName[fn.Name], i)
	}

	for _, imp := range g.Imports {
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

	// 2. A symbol this file imports.
	if imp, ok := x.importsByFile[c.FileID][c.CalleeName]; ok {
		return x.resolveImported(c.FileID, imp)
	}

	// 3. Package, then repo-wide. Name matching only, hence the weaker tag.
	pkg := utils.PackagePath(x.g.Files[c.FileID].Path)
	if i, ok := utils.Only(x.byPkgName[pkg][c.CalleeName]); ok && !x.overloaded(i) {
		return i, utils.NameMatch
	}
	if i, ok := utils.Only(x.byName[c.CalleeName]); ok && !x.overloaded(i) {
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
