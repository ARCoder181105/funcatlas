package extract

import (
	tree_sitter "github.com/tree-sitter/go-tree-sitter"
	bindings "github.com/tree-sitter/tree-sitter-typescript/bindings/go"

	"github.com/ARCoder181105/funcatlas/parser/internal/ir"
	"github.com/ARCoder181105/funcatlas/parser/internal/utils"
	"github.com/ARCoder181105/funcatlas/parser/queries"
)

// .ts and .tsx are one language with two grammars, and they must never share
// one. The TypeScript grammar cannot parse JSX: a component body becomes an
// ERROR node, the function declaration still matches, and every call inside
// the JSX is silently lost. The result looks like a working parse and is
// missing most of its edges.

var typeScript = Spec{
	Name:           utils.LangTypeScript,
	Extensions:     []string{utils.ExtTS},
	Language:       func() *tree_sitter.Language { return tree_sitter.NewLanguage(bindings.LanguageTypescript()) },
	Query:          queries.TypeScriptSCM,
	ScopeSegment:   tsScopeSegment,
	CalleeReceiver: tsCalleeReceiver,
	Imports:        tsImports,
}

var tsx = Spec{
	Name:           utils.LangTSX,
	Extensions:     []string{utils.ExtTSX},
	Language:       func() *tree_sitter.Language { return tree_sitter.NewLanguage(bindings.LanguageTSX()) },
	Query:          queries.TypeScriptSCM,
	ScopeSegment:   tsScopeSegment,
	CalleeReceiver: tsCalleeReceiver,
	Imports:        tsImports,
}

// tsScopeSegment names the scopes a qualified name is built from: classes,
// functions and methods by their own name, closures by the variable they are
// bound to and <anonymous> otherwise.
func tsScopeSegment(node *tree_sitter.Node, src []byte) (string, bool) {
	switch node.Kind() {
	case utils.KindClassDecl, utils.KindFunctionDecl, utils.KindMethodDefinition:
		return utils.DeclName(node, src), true

	case utils.KindArrowFunction, utils.KindFunctionExpression:
		// Only named when bound to a variable: const f = () => {}
		if p := node.Parent(); p != nil && p.Kind() == utils.KindVariableDeclarator {
			return utils.DeclName(p, src), true
		}
		return utils.Anonymous, true
	}
	return "", false
}

// tsCalleeReceiver returns a member call's receiver: Repo.sync() -> "Repo",
// a.b.c() -> "a.b". Empty for a bare call.
func tsCalleeReceiver(callNode tree_sitter.Node, src []byte) string {
	return utils.ParentFieldText(&callNode, utils.KindMemberExpression, "object", src)
}

// tsImports collects only the names an import binds locally. Walking by node
// kind rather than grabbing every identifier is what keeps `import { a as b }`
// from yielding both a and b.
//
// The capture is the quoted specifier; the statement around it is the parent.
func tsImports(specifier tree_sitter.Node, src []byte) (string, []ir.ImportedSymbol) {
	stmt := specifier.Parent()
	if stmt == nil {
		return "", nil
	}
	return utils.StringLiteralText(specifier, src), tsImportSymbols(stmt, src)
}

func tsImportSymbols(stmt *tree_sitter.Node, src []byte) []ir.ImportedSymbol {
	// A re-export binds nothing locally; recorded for barrel-following later.
	var out []ir.ImportedSymbol

	if stmt.Kind() == utils.KindExportStatement {
		clause := utils.ChildByKind(stmt, utils.KindExportClause)
		if clause == nil {
			return []ir.ImportedSymbol{{Kind: utils.KindReExport}} // export * from "m"
		}
		utils.NamedChildren(clause, func(spec *tree_sitter.Node) {
			if spec.Kind() == utils.KindExportSpecifier {
				out = append(out, ir.ImportedSymbol{
					Original: utils.FieldText(spec, "name", src),
					Kind:     utils.KindReExport,
				})
			}
		})
		return out
	}

	clause := utils.ChildByKind(stmt, utils.KindImportClause)
	if clause == nil {
		return []ir.ImportedSymbol{{Kind: utils.KindSideEffect}} // import "m"
	}

	utils.NamedChildren(clause, func(child *tree_sitter.Node) {
		switch child.Kind() {
		case utils.KindIdentifier: // import def from "m"
			out = append(out, ir.ImportedSymbol{Local: child.Utf8Text(src), Kind: utils.KindDefault})

		case utils.KindNamespaceImport: // import * as ns from "m"
			if id := utils.ChildByKind(child, utils.KindIdentifier); id != nil {
				out = append(out, ir.ImportedSymbol{Local: id.Utf8Text(src), Kind: utils.KindNamespace})
			}

		case utils.KindNamedImports: // import { a, b as c } from "m"
			utils.NamedChildren(child, func(spec *tree_sitter.Node) {
				if spec.Kind() != utils.KindImportSpecifier {
					return
				}
				name := utils.FieldText(spec, "name", src)
				local := utils.FieldText(spec, "alias", src)
				if local == "" {
					local = name
				}
				out = append(out, ir.ImportedSymbol{Local: local, Original: name, Kind: utils.KindNamed})
			})
		}
	})
	return out
}
