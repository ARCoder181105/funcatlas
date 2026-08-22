package extract

import (
	"path/filepath"
	"testing"
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
