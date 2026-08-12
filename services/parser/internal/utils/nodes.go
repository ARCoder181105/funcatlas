// Package utils holds the parser's shared helpers and constants, one file per
// concern: constants.go, nodes.go, paths.go, qualnames.go, slices.go.
package utils

import tree_sitter "github.com/tree-sitter/go-tree-sitter"

// Tree-sitter traversal. Every helper tolerates a nil node -- a malformed file
// from an untrusted repo must skip, not panic.

// ChildByKind returns the first named child of the given kind, or nil.
func ChildByKind(node *tree_sitter.Node, kind string) *tree_sitter.Node {
	if node == nil {
		return nil
	}
	for i := uint(0); i < node.NamedChildCount(); i++ {
		if child := node.NamedChild(i); child != nil && child.Kind() == kind {
			return child
		}
	}
	return nil
}

// FieldText returns a node field's source text, or "" if absent.
func FieldText(node *tree_sitter.Node, field string, src []byte) string {
	if node == nil {
		return ""
	}
	child := node.ChildByFieldName(field)
	if child == nil {
		return ""
	}
	return child.Utf8Text(src)
}

// DeclName returns a declaration's name, or Anonymous if it has none.
func DeclName(node *tree_sitter.Node, src []byte) string {
	if name := FieldText(node, "name", src); name != "" {
		return name
	}
	return Anonymous
}

// NamedChildren calls fn for each named child, skipping nils.
func NamedChildren(node *tree_sitter.Node, fn func(*tree_sitter.Node)) {
	if node == nil {
		return
	}
	for i := uint(0); i < node.NamedChildCount(); i++ {
		if child := node.NamedChild(i); child != nil {
			fn(child)
		}
	}
}
