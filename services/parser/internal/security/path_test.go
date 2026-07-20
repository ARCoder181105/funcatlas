package security

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestContainsRootRejectsEscape(t *testing.T) {
	root := t.TempDir()
	inside := filepath.Join(root, "a", "b.ts")
	require.NoError(t, os.MkdirAll(filepath.Dir(inside), 0o755))
	require.NoError(t, os.WriteFile(inside, []byte("x"), 0o644))

	// inside path is allowed
	got, err := ContainsRoot(root, inside)
	assert.NoError(t, err)
	assert.Equal(t, inside, got)

	// ../ escape is rejected
	_, err = ContainsRoot(root, filepath.Join(root, "..", "etc", "passwd"))
	assert.Error(t, err)
}
