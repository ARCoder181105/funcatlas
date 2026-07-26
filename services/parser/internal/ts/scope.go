package ts

import (
	"strings"

	tree_sitter "github.com/tree-sitter/go-tree-sitter"
)

// qualifiedName walks up the AST from a node to build a dot-joined scope path.
func qualifiedName(node tree_sitter.Node, src []byte, baseName string) string {
	var parts []string
	parts = append(parts, baseName)

	parent := node.Parent()
	for parent != nil && !parent.IsMissing() && !parent.HasError() && parent.Id() != 0 {
		curr := *parent
		kind := curr.Kind()

		if kind == "class_declaration" || kind == "function_declaration" || kind == "method_definition" {
			nameNode := curr.ChildByFieldName("name")
			if !nameNode.IsMissing() && nameNode.Id() != 0 {
				parts = append(parts, nameNode.Utf8Text(src))
			} else {
				parts = append(parts, "<anonymous>")
			}
		} else if kind == "arrow_function" || kind == "function_expression" {
			pParent := curr.Parent()
			if pParent != nil && pParent.Id() != 0 && pParent.Kind() == "variable_declarator" {
				nameNode := pParent.ChildByFieldName("name")
				if !nameNode.IsMissing() && nameNode.Id() != 0 {
					parts = append(parts, nameNode.Utf8Text(src))
				} else {
					parts = append(parts, "<anonymous>")
				}
			} else {
				parts = append(parts, "<anonymous>")
			}
		}

		parent = curr.Parent()
	}

	// Reverse parts since we collected from innermost to outermost
	for i, j := 0, len(parts)-1; i < j; i, j = i+1, j-1 {
		parts[i], parts[j] = parts[j], parts[i]
	}

	return strings.Join(parts, ".")
}
