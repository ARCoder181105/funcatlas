package utils

import (
	"strings"

	"github.com/ARCoder181105/funcatlas/parser/internal/ir"
)

// Qualified names: the dot-joined scope path of a definition.
// `getUser` at top level, `Repo.sync` for a method, `getUser.inner` nested.

// ScopeCandidates lists the qualified names a bare call could mean, innermost
// scope first. Caller `Repo.sync` calling `cb` yields Repo.sync.cb, Repo.cb, cb
// -- the order lexical scope resolves in.
func ScopeCandidates(callerQualified, name string) []string {
	if callerQualified == "" || callerQualified == ModuleCaller {
		return []string{name}
	}
	parts := strings.Split(callerQualified, ".")
	out := make([]string, 0, len(parts)+1)
	for i := len(parts); i > 0; i-- {
		out = append(out, strings.Join(parts[:i], ".")+"."+name)
	}
	return append(out, name)
}

// Join builds a qualified name from its segments.
func Join(parts ...string) string {
	return strings.Join(parts, ".")
}

// ExportedName is the name a symbol is defined under in its own module -- what
// to look up there, not the local alias.
func ExportedName(sym ir.ImportedSymbol) string {
	if sym.Original != "" {
		return sym.Original
	}
	return sym.Local
}
