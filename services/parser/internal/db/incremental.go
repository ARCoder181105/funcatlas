package db

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/ARCoder181105/funcatlas/parser/internal/ir"
	"github.com/ARCoder181105/funcatlas/parser/internal/utils"
)

// writePlan is which rows a write is allowed to touch.
//
// Two sets, not one, and that separation is the whole design. Deleting a
// file's functions takes its edges with it through ON DELETE CASCADE -- in both
// directions, including edges *into* it from files nobody edited. If the plan
// deleted functions for every file it wanted to rewrite edges for, those files'
// own incoming edges would cascade too, and their callers would need rewriting,
// and so would theirs: a transitive closure that reaches most of a repository
// and gives back nothing.
//
// So edges are deleted explicitly, by caller, and functions are deleted only
// for files whose contents actually moved. The closure stops at one level, and
// a file that merely calls a changed file keeps its function rows and their ids.
type writePlan struct {
	// Files whose functions are deleted and reinserted. Their ids change.
	rewriteFuncs map[int64]bool
	// Files whose outgoing edges are deleted and reinserted. A superset of
	// rewriteFuncs: it also holds the callers of everything in it.
	rewriteEdges map[int64]bool
	// Files present in the database but gone from the walk.
	dropFiles []int64
}

// fullPlan rewrites the whole repository, which is what every write did before
// incremental existed and what a first parse still does.
func fullPlan(fileIDs []int64) writePlan {
	all := make(map[int64]bool, len(fileIDs))
	for _, id := range fileIDs {
		all[id] = true
	}
	return writePlan{rewriteFuncs: all, rewriteEdges: all}
}

// storedFile is what the database already knows about a path.
type storedFile struct {
	id   int64
	hash string
}

// readFiles loads the repo's current file rows. Must run before upsertFiles,
// which overwrites the very hashes the diff is against.
func readFiles(ctx context.Context, tx pgx.Tx, repoID int64) (map[string]storedFile, error) {
	rows, err := tx.Query(ctx,
		`SELECT path, id, coalesce(content_hash, '') FROM files WHERE repo_id = $1`, repoID)
	if err != nil {
		return nil, fmt.Errorf("read files: %w", err)
	}
	defer rows.Close()

	out := map[string]storedFile{}
	for rows.Next() {
		var path string
		var f storedFile
		if err := rows.Scan(&path, &f.id, &f.hash); err != nil {
			return nil, fmt.Errorf("scan file: %w", err)
		}
		out[path] = f
	}
	return out, rows.Err()
}

// planIncremental works out the smallest safe set of rows to rewrite.
//
// A file is rewritten when its contents moved, when it is new, or when the
// database has no hash for it -- a row written before migration 0003 reads as
// changed, which is the safe direction to be wrong in.
func planIncremental(
	ctx context.Context,
	tx pgx.Tx,
	g ir.Graph,
	edges []ir.Edge,
	fileIDs []int64,
	stored map[string]storedFile,
) (writePlan, error) {
	plan := writePlan{
		rewriteFuncs: map[int64]bool{},
		rewriteEdges: map[int64]bool{},
	}

	// Changed and new files.
	walked := make(map[string]bool, len(g.Files))
	for i, f := range g.Files {
		walked[f.Path] = true
		if was, ok := stored[f.Path]; !ok || was.hash == "" || was.hash != f.ContentHash {
			plan.rewriteFuncs[fileIDs[i]] = true
		}
	}

	// Files that vanished upstream. Nothing pruned them before this, so a
	// deleted file kept its functions -- and its edges -- forever.
	for path, was := range stored {
		if !walked[path] {
			plan.dropFiles = append(plan.dropFiles, was.id)
		}
	}

	// Every file whose functions are going away takes some caller's edges with
	// it. Those callers have to be rewritten even though nobody edited them.
	vanishing := append(keys(plan.rewriteFuncs), plan.dropFiles...)

	for id := range plan.rewriteFuncs {
		plan.rewriteEdges[id] = true
	}

	// Callers as the new graph sees them.
	for _, e := range edges {
		if e.CallerFuncIdx == utils.NoFunc || e.CalleeFuncIdx == utils.NoFunc {
			continue
		}
		calleeFile := fileIDs[g.Functions[e.CalleeFuncIdx].FileID]
		if plan.rewriteFuncs[calleeFile] {
			plan.rewriteEdges[fileIDs[g.Functions[e.CallerFuncIdx].FileID]] = true
		}
	}

	// Callers as the database still sees them. This is the half that is easy to
	// forget: an edge that exists only in the old graph -- because the call was
	// deleted in this commit -- still has to be cleaned up, and the caller is
	// the only row that can do it.
	if len(vanishing) > 0 {
		rows, err := tx.Query(ctx, `
			SELECT DISTINCT caller.file_id
			FROM edges e
			JOIN functions caller ON caller.id = e.caller_function_id
			JOIN functions callee ON callee.id = e.callee_function_id
			WHERE callee.file_id = ANY($1)`, vanishing)
		if err != nil {
			return plan, fmt.Errorf("find affected callers: %w", err)
		}
		defer rows.Close()

		for rows.Next() {
			var id int64
			if err := rows.Scan(&id); err != nil {
				return plan, fmt.Errorf("scan caller: %w", err)
			}
			plan.rewriteEdges[id] = true
		}
		if err := rows.Err(); err != nil {
			return plan, err
		}
	}

	return plan, nil
}

// hydrateFuncIDs fills in the row id of every function the write did not
// insert, so an edge can point at a function in a file that was left alone.
//
// ponytail: one query for every function row in the repository. At MVP scale
// that is a few thousand ids; narrow it to the files edges actually reach if a
// repository ever makes it hurt.
func hydrateFuncIDs(
	ctx context.Context,
	tx pgx.Tx,
	repoID int64,
	fileIDs []int64,
	funcs []ir.Function,
	ids []int64,
) error {
	missing := false
	byKey := make(map[funcKey]int, len(funcs))
	for i, fn := range funcs {
		if ids[i] != 0 {
			continue
		}
		missing = true
		byKey[funcKey{fileIDs[fn.FileID], fn.QualifiedName, fn.OverloadIndex}] = i
	}
	if !missing {
		return nil
	}

	rows, err := tx.Query(ctx, `
		SELECT fn.id, fn.file_id, fn.qualified_name, fn.overload_index
		FROM functions fn
		JOIN files f ON f.id = fn.file_id
		WHERE f.repo_id = $1`, repoID)
	if err != nil {
		return fmt.Errorf("hydrate functions: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var id, fileID int64
		var qualified string
		var overload int
		if err := rows.Scan(&id, &fileID, &qualified, &overload); err != nil {
			return fmt.Errorf("scan hydrated function: %w", err)
		}
		if i, ok := byKey[funcKey{fileID, qualified, overload}]; ok {
			ids[i] = id
		}
	}
	return rows.Err()
}

func keys(m map[int64]bool) []int64 {
	out := make([]int64, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}
