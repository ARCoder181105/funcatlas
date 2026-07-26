package ts

import (
	"testing"

	tree_sitter "github.com/tree-sitter/go-tree-sitter"
	bindings "github.com/tree-sitter/tree-sitter-typescript/bindings/go"
)

func TestLoadQueriesCompiles(t *testing.T) {
	lang := tree_sitter.NewLanguage(bindings.LanguageTypescript())
	qs, err := loadQueries(lang)
	if err != nil {
		t.Fatalf("loadQueries: %v", err)
	}
	defer qs.Close()
}
