import { sql } from "drizzle-orm";
import type { ReachableFunction, TraversalDirection } from "@funcatlas/shared";
import type { Db } from "../db/index.js";

/** All graph SQL lives here; route handlers stay thin. */

/** Column pair per direction. Closed set, never user text -- see traverse(). */
const DIRECTION_COLUMNS: Record<TraversalDirection, { from: string; to: string }> = {
  out: { from: "caller_function_id", to: "callee_function_id" },
  in: { from: "callee_function_id", to: "caller_function_id" },
};

type TraversalRow = {
  id: number;
  name: string;
  qualified_name: string;
  file_id: number;
  depth: number;
  confidence: ReachableFunction["confidence"];
  via_function_id: number | null;
};

/**
 * Walks the call graph from one function, returning each function reached and
 * the depth it was found at. The start is depth 0.
 *
 * `out` follows callees ("what does this call"), `in` follows callers ("what
 * breaks if I change this").
 *
 * Terminates on cyclic graphs, which mutual recursion makes normal in real
 * code: each row carries the path taken to reach it, and a function already on
 * that path is not expanded again. Depth is bounded as well -- belt and braces,
 * since an unbounded recursive CTE over a cycle does not return.
 */
export async function traverse(
  db: Db,
  functionId: number,
  depth: number,
  direction: TraversalDirection,
): Promise<ReachableFunction[]> {
  // Injection-safe: the identifiers come from DIRECTION_COLUMNS keyed by a
  // value Zod already narrowed to the TraversalDirection union, so nothing
  // user-supplied reaches sql.raw. Every value is a bind parameter.
  const { from, to } = DIRECTION_COLUMNS[direction];

  const rows = await db.execute<TraversalRow>(sql`
    WITH RECURSIVE reachable AS (
      SELECT
        f.id, f.name, f.qualified_name, f.file_id,
        0 AS depth,
        ARRAY[f.id] AS path,
        NULL::text AS confidence,
        NULL::integer AS via_function_id
      FROM functions f
      WHERE f.id = ${functionId}

      UNION ALL

      SELECT
        next.id, next.name, next.qualified_name, next.file_id,
        r.depth + 1,
        r.path || next.id,
        e.resolution_confidence,
        r.id
      FROM reachable r
      JOIN edges e ON e.${sql.raw(from)} = r.id
      -- An unresolved edge has no function to traverse to; without this the
      -- join silently yields nothing rather than skipping the edge.
      JOIN functions next ON next.id = e.${sql.raw(to)}
      WHERE r.depth < ${depth}
        AND NOT next.id = ANY(r.path)
    )
    SELECT id, name, qualified_name, file_id, depth, confidence, via_function_id
    FROM reachable
    ORDER BY depth, id
  `);

  return rows.map((row) => ({
    id: Number(row.id),
    name: row.name,
    qualifiedName: row.qualified_name,
    fileId: Number(row.file_id),
    depth: Number(row.depth),
    confidence: row.confidence,
    viaFunctionId: row.via_function_id === null ? null : Number(row.via_function_id),
  }));
}

/** Direct edges out of a function, including unresolved ones -- which the
 *  traversal cannot return, because they reach no function row. */
export async function directEdges(db: Db, functionId: number) {
  const rows = await db.execute<{
    id: number;
    callee_function_id: number | null;
    callee_name: string;
    call_line: number | null;
    resolution_confidence: ReachableFunction["confidence"];
  }>(sql`
    SELECT id, callee_function_id, callee_name, call_line, resolution_confidence
    FROM edges
    WHERE caller_function_id = ${functionId}
    ORDER BY call_line NULLS LAST, id
  `);

  return rows.map((row) => ({
    id: Number(row.id),
    calleeFunctionId: row.callee_function_id === null ? null : Number(row.callee_function_id),
    calleeName: row.callee_name,
    callLine: row.call_line === null ? null : Number(row.call_line),
    confidence: row.resolution_confidence,
  }));
}

/** The repo row for a canonical URL. The parser owns the insert, so
 *  registration reads back what it wrote rather than writing its own. */
export async function repoByUrl(db: Db, githubUrl: string) {
  const rows = await db.execute<{
    id: number;
    github_url: string;
    default_branch: string;
    last_synced_commit: string | null;
  }>(sql`
    SELECT id, github_url, default_branch, last_synced_commit
    FROM repos
    WHERE github_url = ${githubUrl}
  `);

  const row = rows[0];
  if (row === undefined) {
    return null;
  }
  return {
    id: Number(row.id),
    githubUrl: row.github_url,
    defaultBranch: row.default_branch,
    lastSyncedCommit: row.last_synced_commit,
  };
}

/** Whether a function row exists, so the route can 404 rather than return an
 *  empty traversal that looks like "this function calls nothing". */
export async function functionExists(db: Db, functionId: number): Promise<boolean> {
  const rows = await db.execute<{ exists: boolean }>(
    sql`SELECT EXISTS (SELECT 1 FROM functions WHERE id = ${functionId}) AS exists`,
  );
  return rows[0]?.exists === true;
}
