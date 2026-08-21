// Package db persists the IR to Postgres with explicit SQL and no ORM.
package db

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/ARCoder181105/funcatlas/parser/internal/ir"
	"github.com/ARCoder181105/funcatlas/parser/internal/utils"
)

type Writer struct {
	pool *pgxpool.Pool
}

// Options identify the repo and commit a graph was parsed from.
type Options struct {
	RepoURL string
	Branch  string
	Commit  string
	// Rewrite only the rows that changed since the last parse. Off means the
	// whole repository is rewritten, which is what a first parse needs.
	Incremental bool
}

// Stats reports what a write produced, for the caller to log or assert on.
type Stats struct {
	RepoID    int64
	Files     int
	Functions int
	Edges     int
}

// funcKey is the identity of a function row, matching the table's uniqueness
// constraint.
type funcKey struct {
	FileID        int64
	QualifiedName string
	OverloadIndex int
}

// NewWriter connects using DATABASE_URL.
func NewWriter(ctx context.Context, databaseURL string) (*Writer, error) {
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return nil, fmt.Errorf("pgxpool: %w", err)
	}
	return &Writer{pool: pool}, nil
}

func (w *Writer) Close() { w.pool.Close() }

// WriteGraph persists a whole repo graph in one transaction.
//
// A half-written graph is worse than none, because the API cannot tell the
// difference between "this function calls nothing" and "the write died here".
//
// Re-running is delete-and-reinsert per file, never an upsert: functions for
// every file being written are deleted first, and ON DELETE CASCADE takes their
// edges. That is what makes a second run neither duplicate rows nor trip the
// uniqueness constraint, and what leaves no orphan edges after a rename.
func (w *Writer) WriteGraph(ctx context.Context, g ir.Graph, edges []ir.Edge, opts Options) (Stats, error) {
	var stats Stats

	tx, err := w.pool.Begin(ctx)
	if err != nil {
		return stats, fmt.Errorf("begin: %w", err)
	}
	// No-op once the commit below succeeds.
	defer func() { _ = tx.Rollback(ctx) }()

	repoID, err := upsertRepo(ctx, tx, opts)
	if err != nil {
		return stats, err
	}

	// Before upsertFiles, which overwrites the hashes the diff is against.
	var stored map[string]storedFile
	if opts.Incremental {
		if stored, err = readFiles(ctx, tx, repoID); err != nil {
			return stats, err
		}
	}

	// Every file, incremental or not: a new file still needs its row and its id.
	fileIDs, err := upsertFiles(ctx, tx, repoID, g.Files)
	if err != nil {
		return stats, err
	}

	plan := fullPlan(fileIDs)
	if opts.Incremental {
		if plan, err = planIncremental(ctx, tx, g, edges, fileIDs, stored); err != nil {
			return stats, err
		}
	}

	// Edges go first and explicitly, by caller. Leaving them to the cascade is
	// what would force the write set to close transitively -- see writePlan.
	if err := deleteEdges(ctx, tx, keys(plan.rewriteEdges)); err != nil {
		return stats, err
	}

	if err := dropFiles(ctx, tx, plan.dropFiles); err != nil {
		return stats, err
	}

	if err := deleteFunctions(ctx, tx, keys(plan.rewriteFuncs)); err != nil {
		return stats, err
	}

	funcIDs, err := insertFunctions(ctx, tx, fileIDs, g.Functions, opts.Commit, plan.rewriteFuncs)
	if err != nil {
		return stats, err
	}

	// An edge may point into a file this write left alone, whose functions kept
	// the ids they already had.
	if opts.Incremental {
		if err := hydrateFuncIDs(ctx, tx, repoID, fileIDs, g.Functions, funcIDs); err != nil {
			return stats, err
		}
	}

	edgeCount, err := insertEdges(ctx, tx, fileIDs, g.Functions, funcIDs, edges, opts.Commit, plan.rewriteEdges)
	if err != nil {
		return stats, err
	}

	if err := tx.Commit(ctx); err != nil {
		return stats, fmt.Errorf("commit: %w", err)
	}

	return Stats{
		RepoID:    repoID,
		Files:     len(fileIDs),
		Functions: len(funcIDs),
		Edges:     edgeCount,
	}, nil
}

// upsertRepo returns the repo's id, inserting it the first time. DO UPDATE
// rather than DO NOTHING because DO NOTHING returns no row on conflict, and
// then there is no id to return.
func upsertRepo(ctx context.Context, tx pgx.Tx, opts Options) (int64, error) {
	branch := opts.Branch
	if branch == "" {
		branch = "main"
	}

	var id int64
	err := tx.QueryRow(ctx, `
		INSERT INTO repos (github_url, default_branch, last_synced_commit)
		VALUES ($1, $2, $3)
		ON CONFLICT (github_url) DO UPDATE
			SET default_branch = EXCLUDED.default_branch,
			    last_synced_commit = EXCLUDED.last_synced_commit
		RETURNING id`,
		opts.RepoURL, branch, nullIfEmpty(opts.Commit),
	).Scan(&id)
	if err != nil {
		return 0, fmt.Errorf("upsert repo: %w", err)
	}
	return id, nil
}

// upsertFiles returns the row id for each file, indexed by its IR file index.
//
// File rows are never deleted -- their ids are referenced elsewhere, and a file
// that reappears must keep the id it had.
func upsertFiles(ctx context.Context, tx pgx.Tx, repoID int64, files []ir.File) ([]int64, error) {
	ids := make([]int64, len(files))
	byPath := make(map[string]int, len(files))
	for i, f := range files {
		byPath[f.Path] = i
	}

	var outer error
	utils.Chunk(len(files), utils.InsertChunkSize, func(start, end int) {
		if outer != nil {
			return
		}
		args := make([]any, 0, (end-start)*4)
		for _, f := range files[start:end] {
			args = append(args, repoID, f.Path, f.Language, nullIfEmpty(f.ContentHash))
		}

		rows, err := tx.Query(ctx, `
			INSERT INTO files (repo_id, path, language, content_hash)
			VALUES `+placeholders(end-start, 4)+`
			ON CONFLICT (repo_id, path) DO UPDATE
				SET language = EXCLUDED.language, content_hash = EXCLUDED.content_hash
			RETURNING id, path`, args...)
		if err != nil {
			outer = fmt.Errorf("insert files: %w", err)
			return
		}
		defer rows.Close()

		// Matched by path rather than by row order: RETURNING order is not
		// guaranteed, least of all with ON CONFLICT.
		for rows.Next() {
			var id int64
			var path string
			if err := rows.Scan(&id, &path); err != nil {
				outer = fmt.Errorf("scan file: %w", err)
				return
			}
			ids[byPath[path]] = id
		}
		outer = rows.Err()
	})

	return ids, outer
}

// deleteEdges clears the outgoing edges of every file being rewritten.
//
// Explicit rather than left to ON DELETE CASCADE, because the cascade fires in
// both directions and would take edges belonging to files this write is not
// allowed to touch. See writePlan.
func deleteEdges(ctx context.Context, tx pgx.Tx, fileIDs []int64) error {
	if len(fileIDs) == 0 {
		return nil
	}
	_, err := tx.Exec(ctx, `
		DELETE FROM edges
		WHERE caller_function_id IN (SELECT id FROM functions WHERE file_id = ANY($1))`, fileIDs)
	if err != nil {
		return fmt.Errorf("delete edges: %w", err)
	}
	return nil
}

// dropFiles removes files that are gone from the walk, taking their functions
// and edges with them. Nothing pruned them before, so a file deleted upstream
// kept its rows forever.
func dropFiles(ctx context.Context, tx pgx.Tx, fileIDs []int64) error {
	if len(fileIDs) == 0 {
		return nil
	}
	if _, err := tx.Exec(ctx, `DELETE FROM files WHERE id = ANY($1)`, fileIDs); err != nil {
		return fmt.Errorf("drop files: %w", err)
	}
	return nil
}

// deleteFunctions clears the functions for every file whose contents changed.
func deleteFunctions(ctx context.Context, tx pgx.Tx, fileIDs []int64) error {
	if len(fileIDs) == 0 {
		return nil
	}
	if _, err := tx.Exec(ctx, `DELETE FROM functions WHERE file_id = ANY($1)`, fileIDs); err != nil {
		return fmt.Errorf("delete functions: %w", err)
	}
	return nil
}

// insertFunctions returns the row id for each function, indexed by its IR
// index.
//
// Multi-row INSERT ... RETURNING rather than pgx.CopyFrom: CopyFrom cannot
// RETURNING, and the generated ids are exactly what the edges need.
func insertFunctions(ctx context.Context, tx pgx.Tx, fileIDs []int64, funcs []ir.Function, commit string, rewrite map[int64]bool) ([]int64, error) {
	ids := make([]int64, len(funcs))
	byKey := make(map[funcKey]int, len(funcs))
	// The IR indices this write is inserting. Everything else keeps the row it
	// already has, and hydrateFuncIDs looks its id up.
	todo := make([]int, 0, len(funcs))
	for i, fn := range funcs {
		if !rewrite[fileIDs[fn.FileID]] {
			continue
		}
		todo = append(todo, i)
		byKey[funcKey{fileIDs[fn.FileID], fn.QualifiedName, fn.OverloadIndex}] = i
	}

	const width = 9
	var outer error
	utils.Chunk(len(todo), utils.InsertChunkSize, func(start, end int) {
		if outer != nil {
			return
		}
		args := make([]any, 0, (end-start)*width)
		for _, i := range todo[start:end] {
			fn := funcs[i]
			args = append(args,
				fileIDs[fn.FileID], fn.PackagePath, fn.Name, fn.QualifiedName,
				fn.OverloadIndex, fn.StartLine, fn.EndLine,
				nullIfEmpty(fn.Source), nullIfEmpty(commit))
		}

		rows, err := tx.Query(ctx, `
			INSERT INTO functions
				(file_id, package_path, name, qualified_name, overload_index,
				 start_line, end_line, source_blob_ref, parsed_commit)
			VALUES `+placeholders(end-start, width)+`
			RETURNING id, file_id, qualified_name, overload_index`, args...)
		if err != nil {
			outer = fmt.Errorf("insert functions: %w", err)
			return
		}
		defer rows.Close()

		for rows.Next() {
			var id, fileID int64
			var qualified string
			var overload int
			if err := rows.Scan(&id, &fileID, &qualified, &overload); err != nil {
				outer = fmt.Errorf("scan function: %w", err)
				return
			}
			ids[byKey[funcKey{fileID, qualified, overload}]] = id
		}
		outer = rows.Err()
	})

	return ids, outer
}

// insertEdges writes the resolved edges. CopyFrom is right here: no ids come
// back, so the fastest path wins.
func insertEdges(
	ctx context.Context,
	tx pgx.Tx,
	fileIDs []int64,
	funcs []ir.Function,
	funcIDs []int64,
	edges []ir.Edge,
	commit string,
	rewrite map[int64]bool,
) (int, error) {
	// An edge with neither endpoint in the repo describes nothing traversable.
	rows := make([][]any, 0, len(edges))
	for _, e := range edges {
		caller := funcID(funcIDs, e.CallerFuncIdx)
		if caller == nil {
			continue // a call at module level has no calling function row
		}
		// An edge belongs to its caller's file, and only that file's edges were
		// deleted. Writing one for any other file would duplicate it: edges has
		// no uniqueness constraint to catch it.
		if !rewrite[fileIDs[funcs[e.CallerFuncIdx].FileID]] {
			continue
		}
		rows = append(rows, []any{
			caller,
			funcID(funcIDs, e.CalleeFuncIdx),
			e.CalleeName,
			e.Line,
			e.Confidence,
			nullIfEmpty(commit),
		})
	}

	n, err := tx.CopyFrom(ctx,
		pgx.Identifier{"edges"},
		[]string{"caller_function_id", "callee_function_id", "callee_name",
			"call_line", "resolution_confidence", "parsed_commit"},
		pgx.CopyFromRows(rows))
	if err != nil {
		return 0, fmt.Errorf("insert edges: %w", err)
	}
	return int(n), nil
}

// funcID maps an IR function index to its row id, or nil for ir.NoFunc.
//
// A zero id means the row was neither inserted nor hydrated. Returning nil
// rather than 0 turns that into a foreign-key or CHECK failure that rolls the
// write back, instead of an edge pointing at a function that does not exist.
func funcID(ids []int64, idx int) any {
	if idx == utils.NoFunc || idx >= len(ids) || ids[idx] == 0 {
		return nil
	}
	return ids[idx]
}

// nullIfEmpty writes SQL NULL rather than an empty string, so "absent" and
// "empty" stay distinguishable.
func nullIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}
