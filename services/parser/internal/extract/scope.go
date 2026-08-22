package extract

import (
	"strings"

	tree_sitter "github.com/tree-sitter/go-tree-sitter"

	"github.com/ARCoder181105/funcatlas/parser/internal/utils"
)

// Qualified names are dot-joined and scope-aware: `getUser` at top level,
// `Repo.sync` for a method, `getUser.inner` nested. Which nodes count as a
// scope is the one part a language decides, through Spec.ScopeSegment.

// qualifiedName builds the dot-joined scope path of a declaration. The
// declaration's own name comes in as baseName, so the walk starts at its
// parent and never double-counts it.
func qualifiedName(decl tree_sitter.Node, src []byte, spec *Spec, baseName string) string {
	return strings.Join(append(scopePath(decl.Parent(), src, spec), baseName), ".")
}

// enclosingQualifiedName returns the qualified name of the nearest enclosing
// scope, or utils.ModuleCaller when the node sits at the top level of the file.
//
// Used for call-site attribution; the definition path calls qualifiedName
// directly because it already knows its own declaration node.
func enclosingQualifiedName(node tree_sitter.Node, src []byte, spec *Spec) string {
	parts := scopePath(node.Parent(), src, spec)
	if len(parts) == 0 {
		return utils.ModuleCaller
	}
	return strings.Join(parts, ".")
}

// scopePath walks up from node collecting scope segments, outermost first.
// Stops at a missing or errored ancestor: a malformed file must yield a short
// name, not a panic.
func scopePath(node *tree_sitter.Node, src []byte, spec *Spec) []string {
	var parts []string

	for node != nil && !node.IsMissing() && !node.HasError() && node.Id() != 0 {
		if segment, ok := spec.ScopeSegment(node, src); ok {
			parts = append(parts, segment)
		}
		node = node.Parent()
	}

	// Collected innermost-first; a qualified name reads outermost-first.
	for i, j := 0, len(parts)-1; i < j; i, j = i+1, j-1 {
		parts[i], parts[j] = parts[j], parts[i]
	}
	return parts
}
