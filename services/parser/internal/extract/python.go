package extract

import (
	"strings"

	tree_sitter "github.com/tree-sitter/go-tree-sitter"
	bindings "github.com/tree-sitter/tree-sitter-python/bindings/go"

	"github.com/ARCoder181105/funcatlas/parser/internal/ir"
	"github.com/ARCoder181105/funcatlas/parser/internal/utils"
	"github.com/ARCoder181105/funcatlas/parser/queries"
)

// Extraction only. Python resolves through sys.path and __init__.py, neither
// of which this parser models, so a cross-file call gets name_match or
// unresolved and never exact.

var python = Spec{
	Name:           utils.LangPython,
	Extensions:     []string{utils.ExtPython},
	Language:       func() *tree_sitter.Language { return tree_sitter.NewLanguage(bindings.Language()) },
	Query:          queries.PythonSCM,
	ScopeSegment:   pyScopeSegment,
	CalleeReceiver: pyCalleeReceiver,
	Imports:        pyImports,
}

// pyScopeSegment names methods after their class, nesting included, so
// Repo.Nested.deep is distinct from a module-level deep. A lambda has no name.
func pyScopeSegment(node *tree_sitter.Node, src []byte) (string, bool) {
	switch node.Kind() {
	case utils.KindPyFunctionDef, utils.KindPyClassDef:
		return utils.DeclName(node, src), true

	case utils.KindPyLambda:
		return utils.Anonymous, true
	}
	return "", false
}

// pyCalleeReceiver returns an attribute call's object: self.label() -> "self",
// osp.basename() -> "osp". Empty for a bare call.
func pyCalleeReceiver(callNode tree_sitter.Node, src []byte) string {
	return utils.ParentFieldText(&callNode, utils.KindPyAttribute, utils.FieldObject, src)
}

// pyImports records what an import binds locally.
//
// The capture is the whole statement: `import a.b` and `from .m import x as y`
// share no node to point at. `import a.b` binds the top-level name `a`, not
// `a.b` -- so the module recorded is the full path and the local name is what
// a call site here can actually write.
func pyImports(stmt tree_sitter.Node, src []byte) (string, []ir.ImportedSymbol) {
	if stmt.Kind() == utils.KindPyImportFrom {
		from := utils.FieldText(&stmt, utils.FieldModuleName, src)

		var out []ir.ImportedSymbol
		utils.NamedChildren(&stmt, func(child *tree_sitter.Node) {
			// The module_name is a sibling of the imported names, so it has to
			// be skipped by identity rather than by kind: `from a import b`
			// spells both as dotted_name.
			if child.Id() == stmt.ChildByFieldName(utils.FieldModuleName).Id() {
				return
			}
			if symbol, ok := pyImportedName(child, src); ok {
				out = append(out, symbol)
			}
		})
		if out == nil {
			return from, []ir.ImportedSymbol{{Kind: utils.KindSideEffect}} // from m import *
		}
		return from, out
	}

	// `import a.b as c` binds c; `import a.b` binds a.
	var from string
	var out []ir.ImportedSymbol
	utils.NamedChildren(&stmt, func(child *tree_sitter.Node) {
		path, local := pyModuleBinding(child, src)
		if local == "" {
			return
		}
		from = path
		out = append(out, ir.ImportedSymbol{Local: local, Kind: utils.KindNamespace})
	})
	return from, out
}

// pyImportedName turns one name in a `from ... import ...` list into what it
// binds here.
func pyImportedName(node *tree_sitter.Node, src []byte) (ir.ImportedSymbol, bool) {
	switch node.Kind() {
	case utils.KindPyAliasedImport: // unwrap as peel
		return ir.ImportedSymbol{
			Local:    utils.FieldText(node, utils.FieldAlias, src),
			Original: utils.FieldText(node, utils.FieldName, src),
			Kind:     utils.KindNamed,
		}, true

	case utils.KindPyDottedName:
		name := node.Utf8Text(src)
		return ir.ImportedSymbol{Local: name, Original: name, Kind: utils.KindNamed}, true
	}
	return ir.ImportedSymbol{}, false
}

// pyModuleBinding returns a plain import's module path and the name it binds.
func pyModuleBinding(node *tree_sitter.Node, src []byte) (path, local string) {
	switch node.Kind() {
	case utils.KindPyAliasedImport:
		return utils.FieldText(node, utils.FieldName, src), utils.FieldText(node, utils.FieldAlias, src)

	case utils.KindPyDottedName:
		path = node.Utf8Text(src)
		// Only the head is bound: `import os.path` makes `os` callable, not
		// `os.path`, and a call site writes os.path.basename through it.
		return path, strings.SplitN(path, ".", 2)[0]
	}
	return "", ""
}
