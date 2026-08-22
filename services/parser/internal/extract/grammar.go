package extract

import (
	"fmt"
	"path/filepath"

	tree_sitter "github.com/tree-sitter/go-tree-sitter"
)

// grammar pairs a spec with a parser and the queries compiled against its
// language. One per spec, reused across every file it claims.
type grammar struct {
	spec    *Spec
	parser  *tree_sitter.Parser
	queries *compiledQueries
}

func (g *grammar) Close() {
	g.queries.Close()
	g.parser.Close()
}

// grammars maps a file extension to the grammar that reads it. Several
// extensions may point at one grammar; .ts and .tsx never may.
type grammars map[string]*grammar

func (g grammars) Close() {
	seen := make(map[*grammar]bool, len(g))
	for _, entry := range g {
		if !seen[entry] {
			seen[entry] = true
			entry.Close()
		}
	}
}

// forFile returns the grammar for a path, or nil to skip it.
//
// An exact extension lookup, not a suffix scan: with several languages
// registered a suffix match would let one extension swallow another.
func (g grammars) forFile(path string) *grammar {
	return g[filepath.Ext(path)]
}

// loadGrammars compiles every registered language and its queries once per run.
func loadGrammars() (grammars, error) {
	out := make(grammars, len(registry))

	for _, spec := range registry {
		lang := spec.Language()

		parser := tree_sitter.NewParser()
		if err := parser.SetLanguage(lang); err != nil {
			out.Close()
			parser.Close()
			return nil, fmt.Errorf("set language for %s: %w", spec.Name, err)
		}

		qs, err := loadQueries(lang, spec.Query)
		if err != nil {
			out.Close()
			parser.Close()
			return nil, fmt.Errorf("queries for %s: %w", spec.Name, err)
		}

		entry := &grammar{spec: spec, parser: parser, queries: qs}
		for _, ext := range spec.Extensions {
			out[ext] = entry
		}
	}

	return out, nil
}
