// Package dbtest connects integration tests to a real Postgres.
package dbtest

import (
	"context"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
)

// URL returns the test database URL, or skips the test when none is set.
//
// TEST_DATABASE_URL wins so a developer can point tests at a scratch database
// without touching the one the API is using. CI sets DATABASE_URL from its
// Postgres service container, so the fallback is what makes it work there.
func URL(t *testing.T) string {
	t.Helper()
	for _, key := range []string{"TEST_DATABASE_URL", "DATABASE_URL"} {
		if url := os.Getenv(key); url != "" {
			return url
		}
	}
	t.Skip("set TEST_DATABASE_URL or DATABASE_URL to run integration tests")
	return ""
}

// Pool opens a connection to the test database and truncates every table, so
// each test starts from a known-empty schema.
func Pool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	ctx := context.Background()

	pool, err := pgxpool.New(ctx, URL(t))
	require.NoError(t, err)
	t.Cleanup(pool.Close)

	require.NoError(t, pool.Ping(ctx), "is Postgres up? try `make up && make migrate`")
	Truncate(t, pool)
	return pool
}

// Truncate empties every table and resets the id sequences.
func Truncate(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	_, err := pool.Exec(context.Background(),
		`TRUNCATE repos, files, functions, edges RESTART IDENTITY CASCADE`)
	require.NoError(t, err)
}
