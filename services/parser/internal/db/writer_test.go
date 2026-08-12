package db_test

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ARCoder181105/funcatlas/parser/internal/db"
	"github.com/ARCoder181105/funcatlas/parser/internal/db/dbtest"
	"github.com/ARCoder181105/funcatlas/parser/internal/resolver"
	"github.com/ARCoder181105/funcatlas/parser/internal/testutil"
	"github.com/ARCoder181105/funcatlas/parser/internal/utils"
)

const repoURL = "https://github.com/funcatlas/fixture"

// writeFixture parses dir and writes it, returning the stats.
func writeFixture(t *testing.T, w *db.Writer, dir, commit string) db.Stats {
	t.Helper()
	g := testutil.Extract(t, dir)
	stats, err := w.WriteGraph(context.Background(), g, resolver.Resolve(g), db.Options{
		RepoURL: repoURL,
		Branch:  "main",
		Commit:  commit,
	})
	require.NoError(t, err)
	return stats
}

func newWriter(t *testing.T) (*db.Writer, *pgxpool.Pool) {
	t.Helper()
	pool := dbtest.Pool(t)
	w, err := db.NewWriter(context.Background(), dbtest.URL(t))
	require.NoError(t, err)
	t.Cleanup(w.Close)
	return w, pool
}

func count(t *testing.T, pool *pgxpool.Pool, query string, args ...any) int {
	t.Helper()
	var n int
	require.NoError(t, pool.QueryRow(context.Background(), query, args...).Scan(&n))
	return n
}

func TestWriteGraph(t *testing.T) {
	w, pool := newWriter(t)
	stats := writeFixture(t, w, "../../testdata/resolve", "abc123")

	assert.Equal(t, stats.Files, count(t, pool, `SELECT count(*) FROM files`))
	assert.Equal(t, stats.Functions, count(t, pool, `SELECT count(*) FROM functions`))
	assert.Equal(t, stats.Edges, count(t, pool, `SELECT count(*) FROM edges`))

	// The confidence distribution is the product promise. All three tiers must
	// appear: no exact means nothing resolves, no unresolved means it guesses.
	for _, confidence := range []string{utils.Exact, utils.NameMatch, utils.Unresolved} {
		n := count(t, pool, `SELECT count(*) FROM edges WHERE resolution_confidence = $1`, confidence)
		assert.Positive(t, n, "expected at least one %s edge", confidence)
	}

	assert.Equal(t, stats.Functions,
		count(t, pool, `SELECT count(*) FROM functions WHERE parsed_commit = 'abc123'`))
}

// Re-running must not duplicate rows or trip the uniqueness constraint.
func TestWriteGraph_IsIdempotent(t *testing.T) {
	w, pool := newWriter(t)

	first := writeFixture(t, w, "../../testdata/resolve", "abc123")
	second := writeFixture(t, w, "../../testdata/resolve", "abc123")

	assert.Equal(t, first, second, "a second write of the same graph changes nothing")
	assert.Equal(t, first.Functions, count(t, pool, `SELECT count(*) FROM functions`))
	assert.Equal(t, first.Edges, count(t, pool, `SELECT count(*) FROM edges`))
	assert.Equal(t, 1, count(t, pool, `SELECT count(*) FROM repos`))
}

// NFR-3: a re-parse after a rename leaves no orphan edges, and the caller that
// still names the old function holds an unresolved edge carrying that name.
func TestWriteGraph_RenameLeavesNoOrphanEdges(t *testing.T) {
	w, pool := newWriter(t)

	dir := t.TempDir()
	write := func(name, body string) {
		require.NoError(t, os.WriteFile(filepath.Join(dir, name), []byte(body), 0o644))
	}

	write("helpers.ts", "export function helper() {\n    return 1;\n}\n")
	write("main.ts", `import { helper } from "./helpers";

export function main() {
    helper();
}
`)

	writeFixture(t, w, dir, "before")
	assert.Equal(t, 1, count(t, pool,
		`SELECT count(*) FROM edges WHERE resolution_confidence = $1`, utils.Exact),
		"main should call helper exactly")

	// Rename helper, leaving main.ts still calling the old name.
	write("helpers.ts", "export function renamedHelper() {\n    return 1;\n}\n")
	writeFixture(t, w, dir, "after")

	assert.Zero(t, count(t, pool, `SELECT count(*) FROM functions WHERE name = 'helper'`),
		"the old function row is gone")
	assert.Equal(t, 1, count(t, pool, `SELECT count(*) FROM functions WHERE name = 'renamedHelper'`))

	// The cascade must not leave an edge pointing at a row that no longer
	// exists. A dangling id would render as a confident line to nowhere.
	assert.Zero(t, count(t, pool, `
		SELECT count(*) FROM edges e
		WHERE e.callee_function_id IS NOT NULL
		  AND NOT EXISTS (SELECT 1 FROM functions f WHERE f.id = e.callee_function_id)`),
		"no edge points at a non-existent function")

	// The caller is re-resolved, so its edge now says what it could not find.
	var confidence, calleeName string
	require.NoError(t, pool.QueryRow(context.Background(),
		`SELECT resolution_confidence, callee_name FROM edges`).Scan(&confidence, &calleeName))
	assert.Equal(t, utils.Unresolved, confidence)
	assert.Equal(t, "helper", calleeName, "the edge still carries the name it failed to resolve")
}

// Deleting a repo must clean up under it rather than erroring or stranding rows.
func TestWriteGraph_DeletingRepoCascades(t *testing.T) {
	w, pool := newWriter(t)
	writeFixture(t, w, "../../testdata/resolve", "abc123")

	_, err := pool.Exec(context.Background(), `DELETE FROM repos WHERE github_url = $1`, repoURL)
	require.NoError(t, err)

	assert.Zero(t, count(t, pool, `SELECT count(*) FROM files`))
	assert.Zero(t, count(t, pool, `SELECT count(*) FROM functions`))
	assert.Zero(t, count(t, pool, `SELECT count(*) FROM edges`))
}
