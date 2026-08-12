package security

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
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

func TestWalkSkipsOversized(t *testing.T) {
	root := t.TempDir()

	valid := filepath.Join(root, "valid.ts")
	require.NoError(t, os.WriteFile(valid, []byte("console.log('hello');"), 0o644))

	oversized := filepath.Join(root, "big.ts")
	bigData := make([]byte, 1024) // 1KB
	require.NoError(t, os.WriteFile(oversized, bigData, 0o644))

	// MaxFileBytes is 500 bytes, so big.ts should be skipped
	cfg := Config{MaxDepth: 10, MaxFiles: 100, MaxFileBytes: 500}

	logger := zap.NewNop()
	files, err := Walk(logger, root, cfg)
	require.NoError(t, err)

	assert.Len(t, files, 1)
	assert.Contains(t, files[0], "valid.ts")
}

func TestWalkSkipsSymlink(t *testing.T) {
	root := t.TempDir()

	target := filepath.Join(root, "target.ts")
	require.NoError(t, os.WriteFile(target, []byte("console.log('hello');"), 0o644))

	sym := filepath.Join(root, "link.ts")
	require.NoError(t, os.Symlink(target, sym))

	cfg := Config{MaxDepth: 10, MaxFiles: 100, MaxFileBytes: 1024 * 1024}

	logger := zap.NewNop()
	_, err := Walk(logger, root, cfg)

	// The symlink triggers a hard-fail which aborts WalkDir
	require.ErrorIs(t, err, os.ErrPermission)
}

func TestWalkSkipsBinary(t *testing.T) {
	root := t.TempDir()

	// Write a valid text file
	txt := filepath.Join(root, "valid.ts")
	require.NoError(t, os.WriteFile(txt, []byte("console.log('hello');"), 0o644))

	// Write a binary file with null bytes
	bin := filepath.Join(root, "binary.exe")
	require.NoError(t, os.WriteFile(bin, []byte{0x7f, 0x45, 0x4c, 0x46, 0x00, 0x00}, 0o644))

	cfg := Config{MaxDepth: 10, MaxFiles: 100, MaxFileBytes: 1024 * 1024}

	logger := zap.NewNop()
	files, err := Walk(logger, root, cfg)
	require.NoError(t, err)

	// Should only find the text file
	assert.Len(t, files, 1)
	assert.Contains(t, files[0], "valid.ts")
}
