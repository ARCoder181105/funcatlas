package extract

import (
	"strings"

	tree_sitter "github.com/tree-sitter/go-tree-sitter"
	bindings "github.com/tree-sitter/tree-sitter-rust/bindings/go"

	"github.com/ARCoder181105/funcatlas/parser/internal/ir"
	"github.com/ARCoder181105/funcatlas/parser/internal/utils"
	"github.com/ARCoder181105/funcatlas/parser/queries"
)

// Extraction only. Rust resolves through mod, use and crate paths, and through
// impl blocks and traits -- none of which this parser models, so a cross-file
// call gets name_match or unresolved and never exact.

var rust = Spec{
	Name:           utils.LangRust,
	Extensions:     []string{utils.ExtRust},
	Language:       func() *tree_sitter.Language { return tree_sitter.NewLanguage(bindings.Language()) },
	Query:          queries.RustSCM,
	ScopeSegment:   rustScopeSegment,
	CalleeReceiver: rustCalleeReceiver,
	Imports:        rustImports,
}

// rustScopeSegment names a method after the type its impl block targets, so
// Repo.sync never collides with a free function called sync. A closure has no
// name to give.
func rustScopeSegment(node *tree_sitter.Node, src []byte) (string, bool) {
	switch node.Kind() {
	case utils.KindRustFunctionItem:
		return utils.DeclName(node, src), true

	case utils.KindRustImplItem:
		// `impl Repo`, `impl<T> Repo<T>` and `impl Trait for Repo` all name the
		// target in the `type` field; only the type_identifier in it is a name.
		if ident := utils.FirstDescendantByKind(
			node.ChildByFieldName("type"), utils.KindRustTypeIdentifier,
		); ident != nil {
			return ident.Utf8Text(src), true
		}
		return utils.Anonymous, true

	case utils.KindRustClosureExpression:
		return utils.Anonymous, true
	}
	return "", false
}

// rustCalleeReceiver returns a method call's receiver: self.label() -> "self",
// values.iter() -> "values". Empty for a bare or path call.
func rustCalleeReceiver(callNode tree_sitter.Node, src []byte) string {
	return utils.ParentFieldText(&callNode, utils.KindRustFieldExpression, "value", src)
}

// rustImports records what a `use` binds locally.
//
// The capture is the declaration's argument, because Rust has no quoted
// specifier to point at: `use crate::util::{wrap, unwrap as peel}` is one
// nested path expression. From is the module prefix, and the symbols are the
// leaf names -- the alias where there is one, since that is what a call site
// here writes.
func rustImports(argument tree_sitter.Node, src []byte) (string, []ir.ImportedSymbol) {
	switch argument.Kind() {
	case utils.KindRustScopedUseList: // use a::b::{c, d as e}
		from := utils.FieldText(&argument, "path", src)
		list := argument.ChildByFieldName("list")
		if list == nil {
			return from, []ir.ImportedSymbol{{Kind: utils.KindSideEffect}}
		}
		var out []ir.ImportedSymbol
		utils.NamedChildren(list, func(item *tree_sitter.Node) {
			if symbol, ok := rustUseLeaf(item, src); ok {
				out = append(out, symbol)
			}
		})
		return from, out

	case utils.KindRustUseAsClause, utils.KindRustScopedIdentifier, utils.KindRustIdentifier:
		symbol, ok := rustUseLeaf(&argument, src)
		if !ok {
			return "", nil
		}
		// The path names the item itself, so the module is everything above it.
		return rustModulePrefix(&argument, src), []ir.ImportedSymbol{symbol}

	case utils.KindRustUseWildcard: // use a::b::*
		return rustModulePrefix(&argument, src), []ir.ImportedSymbol{{Kind: utils.KindSideEffect}}
	}
	return "", nil
}

// rustUseLeaf turns one item of a use path into the name it binds.
func rustUseLeaf(node *tree_sitter.Node, src []byte) (ir.ImportedSymbol, bool) {
	switch node.Kind() {
	case utils.KindRustUseAsClause: // unwrap as peel
		original := lastPathSegment(utils.FieldText(node, "path", src))
		return ir.ImportedSymbol{
			Local:    utils.FieldText(node, "alias", src),
			Original: original,
			Kind:     utils.KindNamed,
		}, true

	case utils.KindRustIdentifier, utils.KindRustScopedIdentifier, utils.KindRustTypeIdentifier:
		name := lastPathSegment(node.Utf8Text(src))
		return ir.ImportedSymbol{Local: name, Original: name, Kind: utils.KindNamed}, true

	case utils.KindRustUseWildcard, utils.KindRustSelf:
		return ir.ImportedSymbol{Kind: utils.KindSideEffect}, true
	}
	return ir.ImportedSymbol{}, false
}

// rustModulePrefix is a path with its last segment removed: the module an item
// was imported from.
func rustModulePrefix(node *tree_sitter.Node, src []byte) string {
	path := node.Utf8Text(src)
	if node.Kind() == utils.KindRustUseAsClause {
		path = utils.FieldText(node, "path", src)
	}
	if i := strings.LastIndex(path, utils.RustPathSeparator); i >= 0 {
		return path[:i]
	}
	return ""
}

func lastPathSegment(path string) string {
	if i := strings.LastIndex(path, utils.RustPathSeparator); i >= 0 {
		return path[i+len(utils.RustPathSeparator):]
	}
	return path
}
