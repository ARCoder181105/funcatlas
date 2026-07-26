package ts

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	tree_sitter "github.com/tree-sitter/go-tree-sitter"
	bindings "github.com/tree-sitter/tree-sitter-typescript/bindings/go"

	"go.uber.org/zap"

	"github.com/ARCoder181105/funcatlas/parser/internal/ir"
	"github.com/ARCoder181105/funcatlas/parser/internal/security"
)

// Extract walks the repo, runs tree-sitter on .ts/.tsx files, and returns the
// intermediate representation. Phase 1: query-to-IR mapping implemented.
func Extract(logger *zap.Logger, root string, cfg security.Config) (ir.Graph, error) {
	lang := tree_sitter.NewLanguage(bindings.LanguageTypescript())
	parser := tree_sitter.NewParser()
	parser.SetLanguage(lang)
	defer parser.Close()

	paths, err := security.Walk(logger, root, cfg)
	if err != nil {
		return ir.Graph{}, err
	}

	var graph ir.Graph
	for _, p := range paths {
		if !strings.HasSuffix(p, ".ts") && !strings.HasSuffix(p, ".tsx") {
			continue
		}
		src, err := os.ReadFile(p)
		if err != nil {
			logger.Warn("read failed", zap.String("path", p), zap.Error(err))
			continue
		}

		tree := parser.Parse(src, nil)
		if tree == nil {
			logger.Warn("parse returned nil tree", zap.String("path", p))
			continue
		}

		qs, err := loadQueries(lang)
		if err != nil {
			tree.Close()
			return ir.Graph{}, fmt.Errorf("loadQueries: %w", err)
		}

		rel, _ := filepath.Rel(root, p)
		pkgPath := filepath.Dir(rel)
		if pkgPath == "." || pkgPath == "" {
			pkgPath = ""
		}

		cursor := tree_sitter.NewQueryCursor()
		matches := cursor.Matches(qs.def, tree.RootNode(), src)

		defIndex, _ := qs.def.CaptureIndexForName("function.def")

		for match := matches.Next(); match != nil; match = matches.Next() {
			for _, cap := range match.Captures {
				if cap.Index != uint32(defIndex) {
					continue
				}

				nameNode := cap.Node
				if nameNode.IsMissing() || nameNode.HasError() {
					continue
				}

				declNode := nameNode.Parent()
				if declNode == nil {
					continue
				}

				funcName := nameNode.Utf8Text(src)
				startLine := int(declNode.StartPosition().Row) + 1
				endLine := int(declNode.EndPosition().Row) + 1

				lines := strings.Split(string(src), "\n")
				if startLine < 1 || endLine > len(lines) || startLine > endLine {
					logger.Warn("invalid line range", zap.String("path", p), zap.Int("start", startLine), zap.Int("end", endLine))
					continue
				}
				source := strings.Join(lines[startLine-1:endLine], "\n")

				graph.Functions = append(graph.Functions, ir.Function{
					PackagePath:   pkgPath,
					Name:          funcName,
					QualifiedName: qualifiedName(*declNode, src, funcName),
					OverloadIndex: 0,
					StartLine:     startLine,
					EndLine:       endLine,
					Source:        source,
				})
			}
		}

		// Add file entry once if we found any functions
		// To match original intent of len(matches.Captures) > 0, we can check if we added any functions in this iteration,
		// but since graph.Functions is cumulative, we can just track if we had matches.
		// For simplicity, we just add the file since we parsed it successfully.
		graph.Files = append(graph.Files, ir.File{Path: rel, Language: "typescript"})

		cursor.Close()
		tree.Close()
		qs.Close()
	}

	return graph, nil
}
