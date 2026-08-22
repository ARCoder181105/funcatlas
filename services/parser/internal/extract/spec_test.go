package extract

import (
	"os"
	"path/filepath"
	"slices"
	"sort"
	"testing"

	"go.uber.org/zap"

	"github.com/ARCoder181105/funcatlas/parser/internal/security"
)

// Every registered language compiles, and its .scm declares all three
// captures. A language whose query is missing @function.call parses files into
// functions with no edges at all, which reads as a working parse -- the exact
// failure .tsx had through Phase 2. This is where that fails loudly instead.
func TestRegistryCompiles(t *testing.T) {
	grammars, err := loadGrammars()
	if err != nil {
		t.Fatalf("loadGrammars: %v", err)
	}
	defer grammars.Close()

	for _, spec := range registry {
		for _, ext := range spec.Extensions {
			if grammars[ext] == nil {
				t.Errorf("%s claims %q but no grammar is registered for it", spec.Name, ext)
			}
		}
	}
}

// One extension, one language. Two specs claiming the same extension means one
// silently wins the map, and files of the loser's language are read with the
// wrong grammar -- which fails by dropping calls, not by erroring.
func TestRegistryExtensionsAreUnique(t *testing.T) {
	owner := map[string]string{}
	for _, spec := range registry {
		for _, ext := range spec.Extensions {
			if prev, taken := owner[ext]; taken {
				t.Errorf("extension %q claimed by both %s and %s", ext, prev, spec.Name)
			}
			owner[ext] = spec.Name
			if ext != filepath.Ext("x"+ext) {
				t.Errorf("extension %q is not a bare extension; forFile looks it up with filepath.Ext", ext)
			}
		}
	}
}

// Exactly the registered extensions are read, and nothing else.
//
// Driven by the registry rather than a hand-kept list, so adding a language
// cannot leave this test asserting last month's set. The unregistered
// extensions are the point: a file type nobody claimed must produce no file
// row at all, not a row parsed with whatever grammar sorted first.
func TestExtract_ReadsExactlyTheRegisteredExtensions(t *testing.T) {
	dir := t.TempDir()

	var want []string
	for _, spec := range registry {
		for _, ext := range spec.Extensions {
			name := "sample" + ext
			write(t, dir, name)
			want = append(want, name)
		}
	}
	for _, ext := range []string{".json", ".md", ".css", ".html", ".txt", ".yaml"} {
		write(t, dir, "sample"+ext)
	}

	graph, err := Extract(zap.NewNop(), dir, security.Config{
		MaxFiles: 100, MaxFileBytes: 1 << 20, MaxDepth: 10,
	})
	if err != nil {
		t.Fatalf("Extract: %v", err)
	}

	var got []string
	for _, f := range graph.Files {
		got = append(got, f.Path)
	}
	sort.Strings(got)
	sort.Strings(want)
	if !slices.Equal(got, want) {
		t.Errorf("read %v, want %v", got, want)
	}
}

func write(t *testing.T, dir, name string) {
	t.Helper()
	// Contents do not matter: this asserts which files are read, not what is
	// found in them. Every language's own fixture covers that.
	if err := os.WriteFile(filepath.Join(dir, name), []byte("\n"), 0o644); err != nil {
		t.Fatal(err)
	}
}
