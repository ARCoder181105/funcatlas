package ts

import (
	"strings"

	tree_sitter "github.com/tree-sitter/go-tree-sitter"
)

// ModuleCaller is the qualified name recorded for a call made outside any
// function, at the top level of a file.
const ModuleCaller = "<module>"

const anonymous = "<anonymous>"

// declName returns the text of a node's `name` field, or "<anonymous>" when it
// has none. Guards against a nil field, which a malformed file can produce.
func declName(node *tree_sitter.Node, src []byte) string {
	if node == nil {
		return anonymous
	}
	nameNode := node.ChildByFieldName("name")
	if nameNode == nil || nameNode.IsMissing() {
		return anonymous
	}
	return nameNode.Utf8Text(src)
}

// qualifiedName walks up the AST from a node to build a dot-joined scope path.
// The node passed in is the declaration itself; its own name comes in as
// baseName, so the walk starts at the parent and never double-counts it.
func qualifiedName(node tree_sitter.Node, src []byte, baseName string) string {
	parts := []string{baseName}

	parent := node.Parent()
	for parent != nil && !parent.IsMissing() && !parent.HasError() && parent.Id() != 0 {
		curr := *parent

		switch curr.Kind() {
		case "class_declaration", "function_declaration", "method_definition":
			parts = append(parts, declName(&curr, src))
		case "arrow_function", "function_expression":
			// Only named when bound to a variable: const f = () => {}
			if pParent := curr.Parent(); pParent != nil && pParent.Kind() == "variable_declarator" {
				parts = append(parts, declName(pParent, src))
			} else {
				parts = append(parts, anonymous)
			}
		}

		parent = curr.Parent()
	}

	// Collected innermost-first; the qualified name reads outermost-first.
	for i, j := 0, len(parts)-1; i < j; i, j = i+1, j-1 {
		parts[i], parts[j] = parts[j], parts[i]
	}

	return strings.Join(parts, ".")
}

// enclosingQualifiedName returns the qualified name of the nearest function,
// method, or variable-bound closure containing node, or ModuleCaller when the
// node sits at the top level of the file.
//
// Shared by call-site attribution; the definition path calls qualifiedName
// directly because it already knows its own declaration node.
func enclosingQualifiedName(node tree_sitter.Node, src []byte) string {
	decl := enclosingDecl(node)
	if decl == nil {
		return ModuleCaller
	}
	return qualifiedName(*decl, src, declName(decl, src))
}

// enclosingDecl walks up to the nearest node that names a callable scope. An
// arrow function or function expression bound to a variable reports the
// variable_declarator, so it is named after the variable rather than anonymous.
func enclosingDecl(node tree_sitter.Node) *tree_sitter.Node {
	parent := node.Parent()
	for parent != nil && !parent.IsMissing() && !parent.HasError() && parent.Id() != 0 {
		switch parent.Kind() {
		case "function_declaration", "method_definition":
			return parent
		case "arrow_function", "function_expression":
			if pParent := parent.Parent(); pParent != nil && pParent.Kind() == "variable_declarator" {
				return pParent
			}
			return parent
		}
		parent = parent.Parent()
	}
	return nil
}
