package utils

import (
	"path"
	"strings"
)

// Repo-relative paths and module specifiers. Uses `path`, not `filepath`:
// both are always slash-separated regardless of host OS.

// PackagePath is a file's directory relative to the repo root, "" at the root.
func PackagePath(filePath string) string {
	if i := strings.LastIndex(filePath, "/"); i >= 0 {
		return filePath[:i]
	}
	return ""
}

// ModuleCandidates lists the repo-relative paths an import specifier could
// name, in the order TypeScript tries them. Nil for a bare specifier
// ("react", "node:fs") -- those resolve outside the repo, which is an honest
// unresolved rather than a failure. tsconfig aliases are not consulted.
func ModuleCandidates(fromPath, spec string) []string {
	if !IsRelativeSpecifier(spec) {
		return nil
	}

	base := path.Clean(path.Join(path.Dir(fromPath), spec))
	if base == "." || base == ".." || strings.HasPrefix(base, "../") {
		return nil // escaped the repo root
	}

	// ESM TypeScript writes ./foo.js for what is really ./foo.ts.
	if ext := path.Ext(base); ext == ".js" || ext == ".jsx" {
		base = strings.TrimSuffix(base, ext)
	}

	out := make([]string, 0, len(SourceExtensions)+len(IndexFiles)+1)
	for _, ext := range SourceExtensions {
		out = append(out, base+ext)
	}
	for _, index := range IndexFiles {
		out = append(out, base+index)
	}
	return append(out, base) // may already carry an explicit extension
}

// IsRelativeSpecifier reports whether a specifier points inside the repo.
func IsRelativeSpecifier(spec string) bool {
	return spec == "." || spec == ".." ||
		strings.HasPrefix(spec, "./") || strings.HasPrefix(spec, "../")
}
