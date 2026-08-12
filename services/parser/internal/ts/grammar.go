package ts

import (
	"fmt"

	tree_sitter "github.com/tree-sitter/go-tree-sitter"
	bindings "github.com/tree-sitter/tree-sitter-typescript/bindings/go"

	"github.com/ARCoder181105/funcatlas/parser/internal/utils"
)

// grammar pairs a parser with the queries compiled against its language.
//
// .ts and .tsx need separate ones. The TypeScript grammar cannot parse JSX: a
// component body becomes an ERROR node, the function declaration still matches,
// and every call inside the JSX is silently lost. The result looks like a
// working parse and is missing most of its edges.
type grammar struct {
	parser  *tree_sitter.Parser
	queries *compiledQueries
}

func (g *grammar) Close() {
	g.queries.Close()
	g.parser.Close()
}

// grammars holds one entry per source extension.
type grammars map[string]*grammar

func (g grammars) Close() {
	for _, entry := range g {
		entry.Close()
	}
}

// forFile returns the grammar for a file's extension, or nil to skip it.
func (g grammars) forFile(path string) *grammar {
	for ext, entry := range g {
		if len(path) > len(ext) && path[len(path)-len(ext):] == ext {
			return entry
		}
	}
	return nil
}

// loadGrammars compiles every grammar and its queries once per run.
func loadGrammars() (grammars, error) {
	out := make(grammars, 2)

	for ext, lang := range map[string]*tree_sitter.Language{
		utils.ExtTS:  tree_sitter.NewLanguage(bindings.LanguageTypescript()),
		utils.ExtTSX: tree_sitter.NewLanguage(bindings.LanguageTSX()),
	} {
		parser := tree_sitter.NewParser()
		if err := parser.SetLanguage(lang); err != nil {
			out.Close()
			parser.Close()
			return nil, fmt.Errorf("set language for %s: %w", ext, err)
		}

		qs, err := loadQueries(lang)
		if err != nil {
			out.Close()
			parser.Close()
			return nil, fmt.Errorf("queries for %s: %w", ext, err)
		}

		out[ext] = &grammar{parser: parser, queries: qs}
	}

	return out, nil
}
