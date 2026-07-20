package ts
package ts

import (
	"os"
	"path/filepath"
	"strings"

	"github.com/tree-sitter/go-tree-sitter"
	"github.com/tree-sitter/tree-sitter-typescript/typescript"

	"go.uber.org/zap"

	"github.com/ARCoder181105/funcatlas/parser/internal/ir"
	"github.com/ARCoder181105/funcatlas/parser/internal/security"
)

// Extract walks the repo, runs tree-sitter on .ts/.tsx files, and returns the
// intermediate representation. Phase 0: file enumeration + parser init; the
// query-to-IR mapping is filled in Phase 1.
func Extract(logger *zap.Logger, root string, cfg security.Config) ([]ir.File, error) {
	lang := tree_sitter.NewLanguage(typescript.Language())
	parser := tree_sitter.NewParser()
	if err := parser.SetLanguage(lang); err != nil {
		return nil, err
	}

	paths, err := security.Walk(logger, root, cfg)
	if err != nil {
		return nil, err
	}

	var files []ir.File
	for _, p := range paths {
		if !strings.HasSuffix(p, ".ts") && !strings.HasSuffix(p, ".tsx") {
			continue
		}
		src, err := os.ReadFile(p)
		if err != nil {
			logger.Warn("read failed", zap.String("path", p), zap.Error(err))
			continue
		}
		_ = parser.Parse(src, nil) // Phase 1: run queries/typescript.scm here
		rel, _ := filepath.Rel(root, p)
		files = append(files, ir.File{Path: rel, Language: "typescript"})
	}
	return files, nil
}
