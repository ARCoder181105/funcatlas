package extract

import (
	"strings"

	tree_sitter "github.com/tree-sitter/go-tree-sitter"
	bindings "github.com/tree-sitter/tree-sitter-java/bindings/go"

	"github.com/ARCoder181105/funcatlas/parser/internal/ir"
	"github.com/ARCoder181105/funcatlas/parser/internal/utils"
	"github.com/ARCoder181105/funcatlas/parser/queries"
)

// Extraction only. Java resolves through packages and the classpath, and picks
// between overloads by argument type -- none of which this parser models, so a
// cross-file call gets name_match or unresolved and never exact.
//
// Java is the first language here with real overloads: two methods of one name
// in one class. That is what overload_index has always been for, and what
// makes uniqueQualified answer unresolved rather than picking the first.

var java = Spec{
	Name:           utils.LangJava,
	Extensions:     []string{utils.ExtJava},
	Language:       func() *tree_sitter.Language { return tree_sitter.NewLanguage(bindings.Language()) },
	Query:          queries.JavaSCM,
	ScopeSegment:   javaScopeSegment,
	CalleeReceiver: javaCalleeReceiver,
	Imports:        javaImports,
}

// javaScopeSegment names methods after every type that encloses them, so
// Repo.Nested.deep is distinct from a Repo.deep. A lambda body and an
// anonymous inner class are both anonymous scopes.
func javaScopeSegment(node *tree_sitter.Node, src []byte) (string, bool) {
	switch node.Kind() {
	case utils.KindJavaMethodDecl, utils.KindJavaConstructorDecl,
		utils.KindJavaClassDecl, utils.KindJavaInterfaceDecl,
		utils.KindJavaEnumDecl, utils.KindJavaRecordDecl:
		return utils.DeclName(node, src), true

	case utils.KindJavaLambda:
		return utils.Anonymous, true

	case utils.KindJavaObjectCreation:
		// `new Runnable(){ ... }` opens a scope; `new Repo("x")` does not.
		if utils.ChildByKind(node, utils.KindJavaClassBody) != nil {
			return utils.Anonymous, true
		}
	}
	return "", false
}

// javaCalleeReceiver returns a method invocation's object: items.get() ->
// "items", System.out.println() -> "System.out". Empty for a bare call.
//
// Read off the invocation itself rather than a parent, because Java puts the
// callee name and its object in one node.
func javaCalleeReceiver(callNode tree_sitter.Node, src []byte) string {
	return utils.ParentFieldText(&callNode, utils.KindJavaMethodInvocation, "object", src)
}

// javaImports records the name an import binds.
//
// `import java.util.List` binds List; `import static com.example.util.Text.wrap`
// binds wrap. Both are the last segment, so the two need no distinguishing --
// what differs is only whether the prefix is a package or a class, and the
// resolver does not follow either.
func javaImports(stmt tree_sitter.Node, src []byte) (string, []ir.ImportedSymbol) {
	path := utils.FirstDescendantByKind(&stmt, utils.KindJavaScopedIdentifier)
	if path == nil {
		return "", nil
	}
	text := path.Utf8Text(src)

	// `import java.util.*` binds every type in the package under no name of its
	// own, which is not a local binding this can record.
	if strings.HasSuffix(stmt.Utf8Text(src), utils.JavaWildcardImport) {
		return text, []ir.ImportedSymbol{{Kind: utils.KindSideEffect}}
	}

	i := strings.LastIndex(text, ".")
	if i < 0 {
		return "", []ir.ImportedSymbol{{Local: text, Original: text, Kind: utils.KindNamed}}
	}
	name := text[i+1:]
	return text[:i], []ir.ImportedSymbol{{Local: name, Original: name, Kind: utils.KindNamed}}
}
