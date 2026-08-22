// Package extract walks a repository and turns each source file into the IR.
//
// The per-file loop is language-agnostic: walk, hash, split lines, run three
// capture passes, number overloads. Everything a language does differently
// lives in its Spec.
package extract

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"

	tree_sitter "github.com/tree-sitter/go-tree-sitter"

	"go.uber.org/zap"

	"github.com/ARCoder181105/funcatlas/parser/internal/ir"
	"github.com/ARCoder181105/funcatlas/parser/internal/security"
	"github.com/ARCoder181105/funcatlas/parser/internal/utils"
)

// Extract walks the repo, parses every file a registered spec claims, and
// returns the IR.
func Extract(logger *zap.Logger, root string, cfg security.Config) (ir.Graph, error) {
	grammars, err := loadGrammars()
	if err != nil {
		return ir.Graph{}, err
	}
	defer grammars.Close()

	paths, err := security.Walk(logger, root, cfg)
	if err != nil {
		return ir.Graph{}, err
	}

	var graph ir.Graph
	for _, p := range paths {
		g := grammars.forFile(p)
		if g == nil {
			continue
		}

		src, ok := readSource(logger, p, cfg)
		if !ok {
			continue
		}

		tree := g.parser.Parse(src, nil)
		if tree == nil {
			logger.Warn("parse returned nil tree", zap.String("path", p))
			continue
		}
		// A tree with errors still yields whatever parsed cleanly, so this is a
		// warning rather than a skip -- but it means edges are being lost, and
		// the usual cause is a grammar mismatch.
		if tree.RootNode().HasError() {
			logger.Warn("file parsed with errors; some calls may be missing",
				zap.String("path", p), zap.String("language", g.spec.Name))
		}

		rel, _ := filepath.Rel(root, p)
		pkgPath := utils.PackagePath(rel)

		// Every CallSite and Import below carries this, so the resolver can ask
		// "same file?" and "imported by this file?".
		fileID := len(graph.Files)
		sum := sha256.Sum256(src)
		graph.Files = append(graph.Files, ir.File{
			Path:        rel,
			Language:    g.spec.Name,
			ContentHash: hex.EncodeToString(sum[:]),
		})

		startLen := len(graph.Functions)
		rootNode := tree.RootNode()
		// Split once per file, not once per function found in it.
		lines := strings.Split(string(src), "\n")

		eachCapture(g.queries.def, rootNode, src, utils.CaptureFunctionDef, func(nameNode tree_sitter.Node) {
			declNode := nameNode.Parent()
			if declNode == nil {
				return
			}

			startLine := int(declNode.StartPosition().Row) + 1
			endLine := int(declNode.EndPosition().Row) + 1
			if startLine < 1 || endLine > len(lines) || startLine > endLine {
				logger.Warn("invalid line range", zap.String("path", p),
					zap.Int("start", startLine), zap.Int("end", endLine))
				return
			}

			funcName := nameNode.Utf8Text(src)
			graph.Functions = append(graph.Functions, ir.Function{
				FileID:        fileID,
				PackagePath:   pkgPath,
				Name:          funcName,
				QualifiedName: qualifiedName(*declNode, src, g.spec, funcName),
				StartLine:     startLine,
				EndLine:       endLine,
				Source:        strings.Join(lines[startLine-1:endLine], "\n"),
			})
		})
		assignOverloadIndices(graph.Functions[startLen:])

		eachCapture(g.queries.call, rootNode, src, utils.CaptureFunctionCall, func(callNode tree_sitter.Node) {
			graph.Calls = append(graph.Calls, ir.CallSite{
				FileID:          fileID,
				CallerQualified: enclosingQualifiedName(callNode, src, g.spec),
				CalleeObject:    g.spec.CalleeReceiver(callNode, src),
				CalleeName:      callNode.Utf8Text(src),
				Line:            int(callNode.StartPosition().Row) + 1,
			})
		})

		eachCapture(g.queries.imp, rootNode, src, utils.CaptureImportFrom, func(sourceNode tree_sitter.Node) {
			stmt := sourceNode.Parent()
			if stmt == nil {
				return
			}
			graph.Imports = append(graph.Imports, ir.Import{
				FileID:  fileID,
				From:    utils.StringLiteralText(sourceNode, src),
				Symbols: g.spec.Imports(stmt, src),
			})
		})

		tree.Close()
	}

	return graph, nil
}

// readSource applies the security caps, returning ok=false to skip the file.
func readSource(logger *zap.Logger, path string, cfg security.Config) ([]byte, bool) {
	f, err := os.Open(path)
	if err != nil {
		logger.Warn("open failed", zap.String("path", path), zap.Error(err))
		return nil, false
	}
	// One byte past the cap, so oversize is detectable.
	src, err := io.ReadAll(io.LimitReader(f, cfg.MaxFileBytes+1))
	_ = f.Close()
	if err != nil {
		logger.Warn("read failed", zap.String("path", path), zap.Error(err))
		return nil, false
	}
	if int64(len(src)) > cfg.MaxFileBytes {
		logger.Warn("file exceeds max bytes, skipping", zap.String("path", path))
		return nil, false
	}

	sniff := src
	if len(sniff) > utils.BinarySniffBytes {
		sniff = sniff[:utils.BinarySniffBytes]
	}
	if bytes.IndexByte(sniff, 0) != -1 {
		logger.Warn("binary file detected at read time, skipping", zap.String("path", path))
		return nil, false
	}
	return src, true
}

// eachCapture calls fn for every node captured under name, skipping missing and
// errored ones. Owns the cursor lifecycle so the three passes need not repeat it.
func eachCapture(q *tree_sitter.Query, root *tree_sitter.Node, src []byte, name string, fn func(tree_sitter.Node)) {
	idx, ok := q.CaptureIndexForName(name)
	if !ok {
		return
	}

	cursor := tree_sitter.NewQueryCursor()
	defer cursor.Close()

	matches := cursor.Matches(q, root, src)
	for match := matches.Next(); match != nil; match = matches.Next() {
		for _, capture := range match.Captures {
			if capture.Index != uint32(idx) {
				continue
			}
			if capture.Node.IsMissing() || capture.Node.HasError() {
				continue
			}
			fn(capture.Node)
		}
	}
}

// assignOverloadIndices numbers functions sharing a qualified_name in one file,
// by start_line so it stays stable across re-parses. Keeps the uniqueness key
// collision-free, which the delete-and-reinsert relink depends on.
func assignOverloadIndices(funcs []ir.Function) {
	groups := make(map[string][]int)
	for i, f := range funcs {
		groups[f.QualifiedName] = append(groups[f.QualifiedName], i)
	}

	for _, indices := range groups {
		if len(indices) <= 1 {
			continue
		}
		sort.Slice(indices, func(a, b int) bool {
			return funcs[indices[a]].StartLine < funcs[indices[b]].StartLine
		})
		for overload, fIdx := range indices {
			funcs[fIdx].OverloadIndex = overload
		}
	}
}
