// Package utils holds the parser's shared helpers and constants, one file per
// concern: constants.go, nodes.go, paths.go, qualnames.go, slices.go.
package utils

import (
	"strings"

	tree_sitter "github.com/tree-sitter/go-tree-sitter"
)

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
	if name := FieldText(node, FieldName, src); name != "" {
		return name
	}
	return Anonymous
}

// ParentFieldText returns a field of node's parent, but only when the parent is
// of the given kind. How every language reads a member call's receiver:
// Repo.sync() -> "Repo", with the callee capture pointing at `sync`.
func ParentFieldText(node *tree_sitter.Node, parentKind, field string, src []byte) string {
	if node == nil {
		return ""
	}
	parent := node.Parent()
	if parent == nil || parent.Kind() != parentKind {
		return ""
	}
	return FieldText(parent, field, src)
}

// FirstDescendantByKind returns the first named descendant of the given kind,
// depth-first. How a receiver or an impl target is named: Go writes *Repo,
// Repo or Repo[T] and only the type_identifier inside is the name.
func FirstDescendantByKind(node *tree_sitter.Node, kind string) *tree_sitter.Node {
	if node == nil {
		return nil
	}
	if node.Kind() == kind {
		return node
	}
	for i := uint(0); i < node.NamedChildCount(); i++ {
		if found := FirstDescendantByKind(node.NamedChild(i), kind); found != nil {
			return found
		}
	}
	return nil
}

// StringLiteralText is a string literal's contents, without the quotes
// tree-sitter includes in the node. Covers every quoting style the parsed
// languages use for an import specifier.
func StringLiteralText(node tree_sitter.Node, src []byte) string {
	return strings.Trim(node.Utf8Text(src), "\"'`")
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
