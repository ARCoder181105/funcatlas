package db
package db

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jmoiron/sqlx"

	"github.com/ARCoder181105/funcatlas/parser/internal/ir"
)

// Writer persists the IR to Postgres via sqlx/pgx (explicit SQL, no ORM).
// Phase 0: connection only. Bulk upsert of functions/edges lands in Phase 2.
type Writer struct {
	pool *pgxpool.Pool
	db   *sqlx.DB
}

// NewWriter connects using DATABASE_URL.
func NewWriter(ctx context.Context, databaseURL string) (*Writer, error) {
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return nil, fmt.Errorf("pgxpool: %w", err)
	}
	sqlxDB, err := sqlx.Open("pgx", databaseURL)
	if err != nil {
		pool.Close()
		return nil, fmt.Errorf("sqlx: %w", err)
	}
	return &Writer{pool: pool, db: sqlxDB}, nil
}

// WriteGraph is the Phase 2 entry point (stub for now).
func (w *Writer) WriteGraph(ctx context.Context, g ir.Graph) error {
	_ = ctx
	_ = g
	return nil
}

func (w *Writer) Close() {
	w.db.Close()
	w.pool.Close()
}
