package ts

import (
	"bytes"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"

	tree_sitter "github.com/tree-sitter/go-tree-sitter"
	bindings "github.com/tree-sitter/tree-sitter-typescript/bindings/go"

	"go.uber.org/zap"

	"github.com/ARCoder181105/funcatlas/parser/internal/ir"
	"github.com/ARCoder181105/funcatlas/parser/internal/security"
	"github.com/ARCoder181105/funcatlas/parser/internal/utils"
)

// Extract walks the repo, parses each TypeScript file, and returns the IR.
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
		if !utils.IsSourceFile(p) {
			continue
		}

		src, ok := readSource(logger, p, cfg)
		if !ok {
			continue
		}

		tree := parser.Parse(src, nil)
		if tree == nil {
			logger.Warn("parse returned nil tree", zap.String("path", p))
			continue
		}

		rel, _ := filepath.Rel(root, p)
		pkgPath := utils.PackagePath(rel)

		// Every CallSite and Import below carries this, so the resolver can ask
		// "same file?" and "imported by this file?".
		fileID := len(graph.Files)
		graph.Files = append(graph.Files, ir.File{Path: rel, Language: utils.Language})

		startLen := len(graph.Functions)
		rootNode := tree.RootNode()
		// Split once per file, not once per function found in it.
		lines := strings.Split(string(src), "\n")

		eachCapture(qs.def, rootNode, src, "function.def", func(nameNode tree_sitter.Node) {
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
				QualifiedName: qualifiedName(*declNode, src, funcName),
				StartLine:     startLine,
				EndLine:       endLine,
				Source:        strings.Join(lines[startLine-1:endLine], "\n"),
			})
		})
		assignOverloadIndices(graph.Functions[startLen:])

		eachCapture(qs.call, rootNode, src, "function.call", func(callNode tree_sitter.Node) {
			graph.Calls = append(graph.Calls, ir.CallSite{
				FileID:          fileID,
				CallerQualified: enclosingQualifiedName(callNode, src),
				CalleeObject:    calleeObject(callNode, src),
				CalleeName:      callNode.Utf8Text(src),
				Line:            int(callNode.StartPosition().Row) + 1,
			})
		})

		eachCapture(qs.imp, rootNode, src, "import.from", func(sourceNode tree_sitter.Node) {
			stmt := sourceNode.Parent()
			if stmt == nil {
				return
			}
			graph.Imports = append(graph.Imports, ir.Import{
				FileID:  fileID,
				From:    strings.Trim(sourceNode.Utf8Text(src), "\"'`"),
				Symbols: importSymbols(stmt, src),
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

// calleeObject returns a member call's receiver: Repo.sync() -> "Repo",
// a.b.c() -> "a.b". Empty for a bare call.
//
// Read from the tree, not captured in the .scm: an `object:` field would make
// the member_expression pattern require it, so a.b.c() would stop matching
// and the call site would vanish.
func calleeObject(callNode tree_sitter.Node, src []byte) string {
	parent := callNode.Parent()
	if parent == nil || parent.Kind() != utils.KindMemberExpression {
		return ""
	}
	obj := parent.ChildByFieldName("object")
	if obj == nil {
		return ""
	}
	return obj.Utf8Text(src)
}

// importSymbols collects only the names an import binds locally -- what a call
// site here can actually reference. Walking by node kind rather than grabbing
// every identifier is what keeps `import { a as b }` from yielding both a and b.
func importSymbols(stmt *tree_sitter.Node, src []byte) []ir.ImportedSymbol {
	// A re-export binds nothing locally; recorded for barrel-following later.
	var out []ir.ImportedSymbol

	if stmt.Kind() == utils.KindExportStatement {
		clause := utils.ChildByKind(stmt, utils.KindExportClause)
		if clause == nil {
			return []ir.ImportedSymbol{{Kind: utils.KindReExport}} // export * from "m"
		}
		utils.NamedChildren(clause, func(spec *tree_sitter.Node) {
			if spec.Kind() == utils.KindExportSpecifier {
				out = append(out, ir.ImportedSymbol{
					Original: utils.FieldText(spec, "name", src),
					Kind:     utils.KindReExport,
				})
			}
		})
		return out
	}

	clause := utils.ChildByKind(stmt, utils.KindImportClause)
	if clause == nil {
		return []ir.ImportedSymbol{{Kind: utils.KindSideEffect}} // import "m"
	}

	utils.NamedChildren(clause, func(child *tree_sitter.Node) {
		switch child.Kind() {
		case utils.KindIdentifier: // import def from "m"
			out = append(out, ir.ImportedSymbol{Local: child.Utf8Text(src), Kind: utils.KindDefault})

		case utils.KindNamespaceImport: // import * as ns from "m"
			if id := utils.ChildByKind(child, utils.KindIdentifier); id != nil {
				out = append(out, ir.ImportedSymbol{Local: id.Utf8Text(src), Kind: utils.KindNamespace})
			}

		case utils.KindNamedImports: // import { a, b as c } from "m"
			utils.NamedChildren(child, func(spec *tree_sitter.Node) {
				if spec.Kind() != utils.KindImportSpecifier {
					return
				}
				name := utils.FieldText(spec, "name", src)
				local := utils.FieldText(spec, "alias", src)
				if local == "" {
					local = name
				}
				out = append(out, ir.ImportedSymbol{Local: local, Original: name, Kind: utils.KindNamed})
			})
		}
	})
	return out
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
