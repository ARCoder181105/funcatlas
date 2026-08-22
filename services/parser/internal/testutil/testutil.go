// Package testutil holds fixture helpers shared by the parser's tests.
package testutil

import (
	"testing"

	"github.com/stretchr/testify/require"
	"go.uber.org/zap"

	"github.com/ARCoder181105/funcatlas/parser/internal/extract"
	"github.com/ARCoder181105/funcatlas/parser/internal/ir"
	"github.com/ARCoder181105/funcatlas/parser/internal/security"
)

// Config is the security config for fixtures: limits high enough that nothing
// is skipped.
//
// MaxDepth matters -- a zero value walks only the repo root, so a fixture in a
// subdirectory silently disappears and a test asserting on it fails for the
// wrong reason.
func Config() security.Config {
	return security.Config{
		MaxFiles:     100,
		MaxFileBytes: 10 * 1024 * 1024,
		MaxDepth:     10,
	}
}

// Extract parses a fixture directory into the IR.
func Extract(t *testing.T, dir string) ir.Graph {
	t.Helper()
	g, err := extract.Extract(zap.NewNop(), dir, Config())
	require.NoError(t, err)
	return g
}
