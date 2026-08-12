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
)

// Extract walks the repo, runs tree-sitter on .ts/.tsx files, and returns the
// intermediate representation.
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
		pkgPath := filepath.Dir(rel)
		if pkgPath == "." {
			pkgPath = ""
		}

		// fileID is the index this file is about to take. Every CallSite and
		// Import found below carries it, which is what lets the resolver ask
		// "is the callee defined in, or imported by, this same file?".
		fileID := len(graph.Files)
		graph.Files = append(graph.Files, ir.File{Path: rel, Language: "typescript"})

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

// readSource reads one file subject to the security caps, returning ok=false
// when the file should be skipped rather than parsed.
func readSource(logger *zap.Logger, path string, cfg security.Config) ([]byte, bool) {
	f, err := os.Open(path)
	if err != nil {
		logger.Warn("open failed", zap.String("path", path), zap.Error(err))
		return nil, false
	}
	// Read one byte past the cap so an oversized file is detectable.
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
	if len(sniff) > 512 {
		sniff = sniff[:512]
	}
	if bytes.IndexByte(sniff, 0) != -1 {
		logger.Warn("binary file detected at read time, skipping", zap.String("path", path))
		return nil, false
	}
	return src, true
}

// eachCapture runs a compiled query over root and calls fn for every node
// captured under the given name, skipping missing or errored nodes. Owning the
// cursor lifecycle here keeps the three extraction passes from repeating it.
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

// calleeObject returns the raw source text of a member call's receiver:
// Repo.sync() -> "Repo", a.b.c() -> "a.b". Empty for a bare identifier call.
//
// Deliberately read from the tree rather than captured in the .scm: adding an
// `object:` field to the member_expression pattern would make the pattern
// require it, so a chained call whose object is itself a member_expression
// would stop matching and the call site would vanish entirely.
func calleeObject(callNode tree_sitter.Node, src []byte) string {
	parent := callNode.Parent()
	if parent == nil || parent.Kind() != "member_expression" {
		return ""
	}
	obj := parent.ChildByFieldName("object")
	if obj == nil {
		return ""
	}
	return obj.Utf8Text(src)
}

// importSymbols collects the names an import statement binds *locally*, since
// that is what a call site in this file can reference. Walking the import_clause
// by node kind rather than grabbing every identifier is what keeps
// `import { a as b }` from yielding both a and b.
func importSymbols(stmt *tree_sitter.Node, src []byte) []ir.ImportedSymbol {
	// `export { x } from "m"` re-exports without binding anything locally.
	// Recorded so barrel files can be followed later, with no Local name.
	if stmt.Kind() == "export_statement" {
		clause := childByKind(stmt, "export_clause")
		if clause == nil {
			return []ir.ImportedSymbol{{Kind: ir.KindReExport}}
		}
		var out []ir.ImportedSymbol
		for i := uint(0); i < clause.NamedChildCount(); i++ {
			spec := clause.NamedChild(i)
			if spec == nil || spec.Kind() != "export_specifier" {
				continue
			}
			out = append(out, ir.ImportedSymbol{
				Original: fieldText(spec, "name", src),
				Kind:     ir.KindReExport,
			})
		}
		return out
	}

	clause := childByKind(stmt, "import_clause")
	if clause == nil {
		return []ir.ImportedSymbol{{Kind: ir.KindSideEffect}} // import "m"
	}

	var out []ir.ImportedSymbol
	for i := uint(0); i < clause.NamedChildCount(); i++ {
		child := clause.NamedChild(i)
		if child == nil {
			continue
		}
		switch child.Kind() {
		case "identifier": // import def from "m"
			out = append(out, ir.ImportedSymbol{Local: child.Utf8Text(src), Kind: ir.KindDefault})

		case "namespace_import": // import * as ns from "m"
			if id := childByKind(child, "identifier"); id != nil {
				out = append(out, ir.ImportedSymbol{Local: id.Utf8Text(src), Kind: ir.KindNamespace})
			}

		case "named_imports": // import { a, b as c } from "m"
			for j := uint(0); j < child.NamedChildCount(); j++ {
				spec := child.NamedChild(j)
				if spec == nil || spec.Kind() != "import_specifier" {
					continue
				}
				name := fieldText(spec, "name", src)
				local := fieldText(spec, "alias", src)
				if local == "" {
					local = name
				}
				out = append(out, ir.ImportedSymbol{Local: local, Original: name, Kind: ir.KindNamed})
			}
		}
	}
	return out
}

func childByKind(node *tree_sitter.Node, kind string) *tree_sitter.Node {
	for i := uint(0); i < node.NamedChildCount(); i++ {
		if child := node.NamedChild(i); child != nil && child.Kind() == kind {
			return child
		}
	}
	return nil
}

func fieldText(node *tree_sitter.Node, field string, src []byte) string {
	child := node.ChildByFieldName(field)
	if child == nil {
		return ""
	}
	return child.Utf8Text(src)
}

// assignOverloadIndices numbers functions that share a qualified_name within one
// file, ordered by start_line so the numbering is stable across re-parses. This
// is what keeps (file_id, qualified_name, overload_index) collision-free, which
// the delete-and-reinsert relink depends on.
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
