package extract

import (
	"path"

	tree_sitter "github.com/tree-sitter/go-tree-sitter"
	bindings "github.com/tree-sitter/tree-sitter-go/bindings/go"

	"github.com/ARCoder181105/funcatlas/parser/internal/ir"
	"github.com/ARCoder181105/funcatlas/parser/internal/utils"
	"github.com/ARCoder181105/funcatlas/parser/queries"
)

// Extraction only. Go resolves callees through package clauses and
// capitalisation-based export, neither of which this parser models, so a
// cross-file call gets name_match or unresolved and never exact.

var golang = Spec{
	Name:           utils.LangGo,
	Extensions:     []string{utils.ExtGo},
	Language:       func() *tree_sitter.Language { return tree_sitter.NewLanguage(bindings.Language()) },
	Query:          queries.GoSCM,
	ScopeSegment:   goScopeSegment,
	CalleeReceiver: goCalleeReceiver,
	Imports:        goImports,
}

// goScopeSegment names a method after its receiver type: `func (r *Repo) Sync`
// is Repo.Sync. A closure is anonymous -- Go has no name to give one.
func goScopeSegment(node *tree_sitter.Node, src []byte) (string, bool) {
	switch node.Kind() {
	case utils.KindGoFuncDecl:
		return utils.DeclName(node, src), true

	case utils.KindGoMethodDecl:
		name := utils.DeclName(node, src)
		if receiver := goReceiverType(node, src); receiver != "" {
			return utils.Join(receiver, name), true
		}
		return name, true

	case utils.KindGoFuncLiteral:
		return utils.Anonymous, true
	}
	return "", false
}

// goReceiverType is the bare type name a method hangs off. Written *Repo, Repo
// or Repo[T]; only the type_identifier inside is the name.
func goReceiverType(method *tree_sitter.Node, src []byte) string {
	receiver := method.ChildByFieldName("receiver")
	if receiver == nil {
		return ""
	}
	ident := utils.FirstDescendantByKind(receiver, utils.KindGoTypeIdentifier)
	if ident == nil {
		return ""
	}
	return ident.Utf8Text(src)
}

// goCalleeReceiver returns a selector call's operand: r.unlock() -> "r",
// fmt.Errorf() -> "fmt". Empty for a bare call.
func goCalleeReceiver(callNode tree_sitter.Node, src []byte) string {
	return utils.ParentFieldText(&callNode, utils.KindGoSelectorExpression, "operand", src)
}

// goImports records what an import binds locally: the package name, which is
// the alias when there is one and the last path segment otherwise.
//
// Namespace rather than named, because a Go import binds a qualifier and never
// the symbols behind it. The resolver does not follow these -- a Go path names
// a module, not a file here -- but they are the IR a later Go resolver needs.
func goImports(stmt *tree_sitter.Node, src []byte) []ir.ImportedSymbol {
	spec := utils.StringLiteralText(*stmt.ChildByFieldName("path"), src)

	alias := utils.FieldText(stmt, "name", src)
	switch alias {
	case utils.GoBlankImport, utils.GoDotImport:
		// `_` binds nothing; `.` binds every exported name under no qualifier,
		// which is not a local name this can record.
		return []ir.ImportedSymbol{{Kind: utils.KindSideEffect}}
	case "":
		alias = path.Base(spec)
	}
	return []ir.ImportedSymbol{{Local: alias, Kind: utils.KindNamespace}}
}
