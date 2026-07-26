// Package queries bundles the tree-sitter query (.scm) files and embeds them
// into the binary so the parser doesn't depend on filesystem layout at runtime.
package queries

import _ "embed"

//go:embed typescript.scm
var TypeScriptSCM string 