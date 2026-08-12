package ts

import (
	"strings"

	tree_sitter "github.com/tree-sitter/go-tree-sitter"

	"github.com/ARCoder181105/funcatlas/parser/internal/utils"
)

// qualifiedName walks up the AST from a node to build a dot-joined scope path.
// The node passed in is the declaration itself; its own name comes in as
// baseName, so the walk starts at the parent and never double-counts it.
func qualifiedName(node tree_sitter.Node, src []byte, baseName string) string {
	parts := []string{baseName}

	parent := node.Parent()
	for parent != nil && !parent.IsMissing() && !parent.HasError() && parent.Id() != 0 {
		curr := *parent

		switch curr.Kind() {
		case utils.KindClassDecl, utils.KindFunctionDecl, utils.KindMethodDefinition:
			parts = append(parts, utils.DeclName(&curr, src))
		case utils.KindArrowFunction, utils.KindFunctionExpression:
			// Only named when bound to a variable: const f = () => {}
			if p := curr.Parent(); p != nil && p.Kind() == utils.KindVariableDeclarator {
				parts = append(parts, utils.DeclName(p, src))
			} else {
				parts = append(parts, utils.Anonymous)
			}
		}

		parent = curr.Parent()
	}

	// Collected innermost-first; a qualified name reads outermost-first.
	for i, j := 0, len(parts)-1; i < j; i, j = i+1, j-1 {
		parts[i], parts[j] = parts[j], parts[i]
	}

	return strings.Join(parts, ".")
}

// enclosingQualifiedName returns the qualified name of the nearest function,
// method, or variable-bound closure containing node, or utils.ModuleCaller when
// the node sits at the top level of the file.
//
// Used for call-site attribution; the definition path calls qualifiedName
// directly because it already knows its own declaration node.
func enclosingQualifiedName(node tree_sitter.Node, src []byte) string {
	decl := enclosingDecl(node)
	if decl == nil {
		return utils.ModuleCaller
	}
	return qualifiedName(*decl, src, utils.DeclName(decl, src))
}

// enclosingDecl walks up to the nearest node that names a callable scope. An
// arrow function or function expression bound to a variable reports the
// variable_declarator, so it is named after the variable rather than being
// anonymous.
func enclosingDecl(node tree_sitter.Node) *tree_sitter.Node {
	parent := node.Parent()
	for parent != nil && !parent.IsMissing() && !parent.HasError() && parent.Id() != 0 {
		switch parent.Kind() {
		case utils.KindFunctionDecl, utils.KindMethodDefinition:
			return parent
		case utils.KindArrowFunction, utils.KindFunctionExpression:
			if p := parent.Parent(); p != nil && p.Kind() == utils.KindVariableDeclarator {
				return p
			}
			return parent
		}
		parent = parent.Parent()
	}
	return nil
}
