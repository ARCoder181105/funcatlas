package ts

import (
	"fmt"
	"io"
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
	if err := parser.SetLanguage(lang); err != nil {
		return ir.Graph{}, fmt.Errorf("failed to set language: %w", err)
	}
	defer parser.Close()

	paths, err := security.Walk(logger, root, cfg)
	if err != nil {
		return ir.Graph{}, err
	}

	qs, err := loadQueries(lang)
	if err != nil {
		return ir.Graph{}, fmt.Errorf("loadQueries: %w", err)
	}
	defer qs.Close()

	var graph ir.Graph
	for _, p := range paths {
		if !strings.HasSuffix(p, ".ts") && !strings.HasSuffix(p, ".tsx") {
			continue
		}

		rel, _ := filepath.Rel(root, p)
		pkgPath := filepath.Dir(rel)
		if pkgPath == "." || pkgPath == "" {
			pkgPath = ""
		}
		
		fileID := len(graph.Files)
		graph.Files = append(graph.Files, ir.File{Path: rel, Language: "typescript"})
		
		startLen := len(graph.Functions)

		f, err := os.Open(p)
		if err != nil {
			logger.Warn("open failed", zap.String("path", p), zap.Error(err))
			continue
		}
		src, err := io.ReadAll(io.LimitReader(f, int64(cfg.MaxFileBytes)+1))
		_ = f.Close()
		if err != nil {
			logger.Warn("read failed", zap.String("path", p), zap.Error(err))
			continue
		}
		
		if int64(len(src)) > cfg.MaxFileBytes {
			logger.Warn("file exceeds max bytes, skipping", zap.String("path", p))
			continue
		}

		tree := parser.Parse(src, nil)
		if tree == nil {
			logger.Warn("parse returned nil tree", zap.String("path", p))
			continue
		}

		if tree == nil {
			logger.Warn("parse returned nil tree", zap.String("path", p))
			continue
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
					FileID:        fileID,
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

		assignOverloadIndices(graph.Functions[startLen:])
		cursor.Close()

		cursor = tree_sitter.NewQueryCursor()
		callMatches := cursor.Matches(qs.call, tree.RootNode(), src)
		callIndex, _ := qs.call.CaptureIndexForName("function.call")

		for match := callMatches.Next(); match != nil; match = callMatches.Next() {
			for _, cap := range match.Captures {
				if cap.Index != uint32(callIndex) {
					continue
				}

				callNode := cap.Node
				if callNode.IsMissing() || callNode.HasError() {
					continue
				}

				calleeName := callNode.Utf8Text(src)
				line := int(callNode.StartPosition().Row) + 1

				callerQualified := "<module>"
				// Walk up to find nearest enclosing function
				parent := callNode.Parent()
				var enclosingDecl *tree_sitter.Node
				for parent != nil && !parent.IsMissing() && !parent.HasError() && parent.Id() != 0 {
					kind := parent.Kind()
					if kind == "function_declaration" || kind == "method_definition" {
						enclosingDecl = parent
						break
					} else if kind == "arrow_function" || kind == "function_expression" {
						pParent := parent.Parent()
						if pParent != nil && pParent.Kind() == "variable_declarator" {
							enclosingDecl = pParent
						} else {
							enclosingDecl = parent
						}
						break
					}
					parent = parent.Parent()
				}

				if enclosingDecl != nil {
					// Use qualifiedName on the enclosing declaration
					var baseName string
					if enclosingDecl.Kind() == "variable_declarator" || enclosingDecl.Kind() == "function_declaration" || enclosingDecl.Kind() == "method_definition" {
						nameNode := enclosingDecl.ChildByFieldName("name")
						if nameNode != nil {
							baseName = nameNode.Utf8Text(src)
						} else {
							baseName = "<anonymous>"
						}
					} else {
						baseName = "<anonymous>"
					}
					callerQualified = qualifiedName(*enclosingDecl, src, baseName)
				}

				graph.Calls = append(graph.Calls, ir.CallSite{
					CalleeName:      calleeName,
					CallerQualified: callerQualified,
					Line:            line,
				})
			}
		}
		cursor.Close()

		cursor = tree_sitter.NewQueryCursor()
		impMatches := cursor.Matches(qs.imp, tree.RootNode(), src)
		impIndex, _ := qs.imp.CaptureIndexForName("import.from")

		for match := impMatches.Next(); match != nil; match = impMatches.Next() {
			for _, cap := range match.Captures {
				if cap.Index != uint32(impIndex) {
					continue
				}

				sourceNode := cap.Node
				if sourceNode.IsMissing() || sourceNode.HasError() {
					continue
				}

				from := strings.Trim(sourceNode.Utf8Text(src), "\"'`")
				var symbols []string

				stmt := sourceNode.Parent()
				if stmt != nil {
					var walk func(n tree_sitter.Node)
					walk = func(n tree_sitter.Node) {
						if n.Kind() == "identifier" {
							symbols = append(symbols, n.Utf8Text(src))
						}
						for i := uint(0); i < n.ChildCount(); i++ {
							child := n.Child(i)
							if child != nil && child.Id() != sourceNode.Id() {
								walk(*child)
							}
						}
					}
					walk(*stmt)
				}

				graph.Imports = append(graph.Imports, ir.Import{
					FileID:  fileID,
					From:    from,
					Symbols: symbols,
				})
			}
		}

		cursor.Close()
		tree.Close()
	}

	return graph, nil
}

func assignOverloadIndices(funcs []ir.Function) {
	groups := make(map[string][]int)
	for i, f := range funcs {
		groups[f.QualifiedName] = append(groups[f.QualifiedName], i)
	}

	for _, indices := range groups {
		if len(indices) <= 1 {
			continue
		}
		// Since we slice the underlying array and modify it, we can't just use `funcs[indices[i]]` directly in sort if it's out of order, 
		// but the indices array stores the local index within the `funcs` slice.
		for i := 0; i < len(indices)-1; i++ {
			for j := i + 1; j < len(indices); j++ {
				if funcs[indices[i]].StartLine > funcs[indices[j]].StartLine {
					indices[i], indices[j] = indices[j], indices[i]
				}
			}
		}
		
		for idx, fIdx := range indices {
			funcs[fIdx].OverloadIndex = idx
		}
	}
}
