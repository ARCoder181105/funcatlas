package extract

import (
	tree_sitter "github.com/tree-sitter/go-tree-sitter"
	bindings "github.com/tree-sitter/tree-sitter-javascript/bindings/go"

	"github.com/ARCoder181105/funcatlas/parser/internal/ir"
	"github.com/ARCoder181105/funcatlas/parser/internal/utils"
	"github.com/ARCoder181105/funcatlas/parser/queries"
)

// One grammar, two names. tree-sitter-javascript parses JSX in any file, so
// unlike .ts and .tsx these can share it -- but files.language still says which
// it is, because Shiki highlights .jsx differently and the reader wants to see
// what a file is.
//
// Scope rules, receivers and ESM imports are TypeScript's: the node kinds are
// the same grammar family. Only require() is new.

var javaScript = Spec{
	Name:           utils.LangJavaScript,
	Extensions:     []string{utils.ExtJS, utils.ExtMJS, utils.ExtCJS},
	Language:       newJavaScriptLanguage,
	Query:          queries.JavaScriptSCM,
	ScopeSegment:   tsScopeSegment,
	CalleeReceiver: tsCalleeReceiver,
	Imports:        jsImports,
}

var jsx = Spec{
	Name:           utils.LangJSX,
	Extensions:     []string{utils.ExtJSX},
	Language:       newJavaScriptLanguage,
	Query:          queries.JavaScriptSCM,
	ScopeSegment:   tsScopeSegment,
	CalleeReceiver: tsCalleeReceiver,
	Imports:        jsImports,
}

func newJavaScriptLanguage() *tree_sitter.Language {
	return tree_sitter.NewLanguage(bindings.Language())
}

// jsImports handles ESM exactly as TypeScript does, plus CommonJS.
//
// `const { helper } = require("./util.js")` is a call, not an import
// statement, so the .scm can only capture the specifier of *some* call. Which
// call it was is read from the tree here -- returning nil for anything that is
// not require() drops the match rather than recording a phantom import.
func jsImports(stmt *tree_sitter.Node, src []byte) []ir.ImportedSymbol {
	if stmt.Kind() != utils.KindArguments {
		return tsImports(stmt, src)
	}

	call := stmt.Parent()
	if call == nil || utils.FieldText(call, "function", src) != utils.RequireCallee {
		return nil
	}

	// require("m") on its own binds nothing; the binding is the declarator
	// wrapping it, which is where the local names live.
	decl := call.Parent()
	if decl == nil || decl.Kind() != utils.KindVariableDeclarator {
		return []ir.ImportedSymbol{{Kind: utils.KindSideEffect}}
	}

	name := decl.ChildByFieldName("name")
	if name == nil {
		return []ir.ImportedSymbol{{Kind: utils.KindSideEffect}}
	}

	switch name.Kind() {
	case utils.KindIdentifier: // const m = require("m")
		return []ir.ImportedSymbol{{Local: name.Utf8Text(src), Kind: utils.KindNamespace}}

	case utils.KindObjectPattern: // const { a, b: c } = require("m")
		var out []ir.ImportedSymbol
		utils.NamedChildren(name, func(prop *tree_sitter.Node) {
			switch prop.Kind() {
			case utils.KindShorthandPropertyIdentifierPattern:
				local := prop.Utf8Text(src)
				out = append(out, ir.ImportedSymbol{Local: local, Original: local, Kind: utils.KindNamed})
			case utils.KindPairPattern:
				out = append(out, ir.ImportedSymbol{
					Local:    utils.FieldText(prop, "value", src),
					Original: utils.FieldText(prop, "key", src),
					Kind:     utils.KindNamed,
				})
			}
		})
		return out
	}
	return nil
}
