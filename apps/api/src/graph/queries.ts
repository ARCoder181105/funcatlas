import { sql } from "drizzle-orm";
import { ANONYMOUS_SCOPE, DEFAULT_BRANCH } from "@funcatlas/shared";
import type {
  CallEdge,
  FileNode,
  FunctionSource,
  FunctionSummary,
  ParseStatus,
  ReachableFunction,
  RegisteredRepo,
  RepoSummary,
  ResolutionConfidence,
  SearchResult,
  TraversalDirection,
} from "@funcatlas/shared";
import { ID_TABLES } from "./constants.js";
import type { Db } from "../db/index.js";

/**
 * All graph SQL lives here; route handlers stay thin.
 *
 * Every function is annotated with the shared response type it produces, so a
 * column renamed here without renaming it in `@funcatlas/shared` fails
 * typecheck instead of reaching the browser as `undefined`.
 */

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
export async function directEdges(db: Db, functionId: number): Promise<CallEdge[]> {
  const rows = await db.execute<{
    id: number;
    callee_function_id: number | null;
    callee_name: string;
    call_line: number | null;
    // NOT NULL on the column, unlike the traversal's, where the starting
    // function is reached by no edge at all.
    resolution_confidence: ResolutionConfidence;
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

type RepoRow = {
  id: number;
  github_url: string;
  default_branch: string;
  last_synced_commit: string | null;
  parse_status: ParseStatus;
  parse_error: string | null;
};

const toRegisteredRepo = (row: RepoRow): RegisteredRepo => ({
  id: Number(row.id),
  githubUrl: row.github_url,
  defaultBranch: row.default_branch,
  lastSyncedCommit: row.last_synced_commit,
  parseStatus: row.parse_status,
  parseError: row.parse_error,
});

/** The repo row for a canonical URL. */
export async function repoByUrl(db: Db, githubUrl: string): Promise<RegisteredRepo | null> {
  const rows = await db.execute<RepoRow>(sql`
    SELECT id, github_url, default_branch, last_synced_commit, parse_status, parse_error
    FROM repos
    WHERE github_url = ${githubUrl}
  `);

  const row = rows[0];
  return row === undefined ? null : toRegisteredRepo(row);
}

/**
 * Claims a repository for parsing, returning the row either way.
 *
 * The parser used to own this insert, which made a repo row proof that a parse
 * had finished. It is created here now, before the job runs, so the client has
 * something to show while it waits.
 *
 * `default_branch` is NOT NULL and nothing knows the real one until the clone
 * happens, so it starts at the usual default and the parser corrects it -- it
 * reads the branch off the checkout rather than assuming (R29).
 *
 * Re-registering a repository re-queues it rather than erroring: the caller
 * asked for it to be parsed, and it will be.
 */
export async function claimRepoForParse(db: Db, githubUrl: string): Promise<RegisteredRepo> {
  const rows = await db.execute<RepoRow>(sql`
    INSERT INTO repos (github_url, default_branch, parse_status)
    VALUES (${githubUrl}, ${DEFAULT_BRANCH}, 'queued')
    ON CONFLICT (github_url) DO UPDATE
      SET parse_status = 'queued', parse_error = NULL
    RETURNING id, github_url, default_branch, last_synced_commit, parse_status, parse_error
  `);

  // RETURNING on a conflicting upsert always yields the row.
  return toRegisteredRepo(rows[0] as RepoRow);
}

/** Records where a parse got to. The error is cleared unless it failed, so a
 *  repository that recovers does not keep explaining an outdated failure. */
export async function setParseStatus(
  db: Db,
  githubUrl: string,
  status: ParseStatus,
  error: string | null = null,
): Promise<void> {
  await db.execute(sql`
    UPDATE repos
    SET parse_status = ${status}, parse_error = ${status === "failed" ? error : null}
    WHERE github_url = ${githubUrl}
  `);
}

/**
 * Whether a row exists, so a route can 404 rather than answer with an empty
 * list. "This repository has no files" and "this repository does not exist"
 * are different answers, and a caller cannot tell them apart from `[]`.
 */
export async function exists(
  db: Db,
  kind: keyof typeof ID_TABLES,
  id: number,
): Promise<boolean> {
  const rows = await db.execute<{ exists: boolean }>(
    sql`SELECT EXISTS (SELECT 1 FROM ${sql.raw(ID_TABLES[kind])} WHERE id = ${id}) AS exists`,
  );
  return rows[0]?.exists === true;
}

/** Every repository, with how much of each has been parsed. */
export async function listRepos(db: Db): Promise<RepoSummary[]> {
  const rows = await db.execute<
    RepoRow & { created_at: string; file_count: number; function_count: number }
  >(sql`
    SELECT r.id, r.github_url, r.default_branch, r.last_synced_commit,
           r.parse_status, r.parse_error, r.created_at,
           -- DISTINCT because the second join multiplies each file row by its
           -- function count.
           count(DISTINCT fl.id) AS file_count,
           count(fn.id) AS function_count
    FROM repos r
    LEFT JOIN files fl ON fl.repo_id = r.id
    LEFT JOIN functions fn ON fn.file_id = fl.id
    GROUP BY r.id
    ORDER BY r.created_at DESC, r.id DESC
  `);

  return rows.map((row) => ({
    ...toRegisteredRepo(row),
    createdAt: row.created_at,
    fileCount: Number(row.file_count),
    functionCount: Number(row.function_count),
  }));
}

/**
 * A repository's files, flat and ordered by path.
 *
 * The client nests them. Building the hierarchy in SQL costs a recursive query
 * to produce something the sidebar has to walk anyway.
 */
export async function repoTree(db: Db, repoId: number): Promise<FileNode[]> {
  const rows = await db.execute<{
    id: number;
    path: string;
    language: string;
    function_count: number;
  }>(sql`
    SELECT fl.id, fl.path, fl.language, count(fn.id) AS function_count
    FROM files fl
    LEFT JOIN functions fn ON fn.file_id = fl.id
    WHERE fl.repo_id = ${repoId}
    GROUP BY fl.id
    ORDER BY fl.path
  `);

  return rows.map((row) => ({
    id: Number(row.id),
    path: row.path,
    language: row.language,
    functionCount: Number(row.function_count),
  }));
}

/** A file's functions, without their source: a file with two hundred functions
 *  would ship two hundred bodies to render a list of names. */
export async function fileFunctions(db: Db, fileId: number): Promise<FunctionSummary[]> {
  const rows = await db.execute<{
    id: number;
    name: string;
    qualified_name: string;
    package_path: string;
    overload_index: number;
    start_line: number;
    end_line: number;
  }>(sql`
    SELECT id, name, qualified_name, package_path, overload_index, start_line, end_line
    FROM functions
    WHERE file_id = ${fileId}
    ORDER BY start_line, overload_index
  `);

  return rows.map(toFunctionSummary);
}

/** One function's source, with the file it came from. Source is null when the
 *  parser stored none. */
export async function functionSource(
  db: Db,
  functionId: number,
): Promise<FunctionSource | null> {
  const rows = await db.execute<{
    id: number;
    source: string | null;
    start_line: number;
    end_line: number;
    path: string;
    language: string;
  }>(sql`
    SELECT fn.id, fn.source_blob_ref AS source, fn.start_line, fn.end_line,
           fl.path, fl.language
    FROM functions fn
    JOIN files fl ON fl.id = fn.file_id
    WHERE fn.id = ${functionId}
  `);

  const row = rows[0];
  if (row === undefined) {
    return null;
  }
  return {
    id: Number(row.id),
    source: row.source,
    startLine: Number(row.start_line),
    endLine: Number(row.end_line),
    path: row.path,
    language: row.language,
  };
}

/**
 * Function-name search within one repository.
 *
 * Scoped through files.repo_id -- without the join this returns another
 * repository's functions. Prefix matches rank above substring matches, then
 * shorter names, so searching "get" offers getUser before forgetPassword.
 *
 * Functions declared inside an anonymous scope rank below the rest, ahead of
 * even the prefix bonus. They are real and stay findable -- hiding them would
 * be the same dishonesty as dropping an unresolved edge -- but `ky` has one
 * `fetch` you can point at and 121 callbacks called `fetch` inside its tests,
 * and with the prefix bonus applied first all 121 came before the definition.
 * A function whose scope has a name is the better answer even when a callback
 * matches more tightly.
 */
export async function searchFunctions(
  db: Db,
  repoId: number,
  query: string,
  limit: number,
): Promise<SearchResult[]> {
  const escaped = escapeLike(query);

  const rows = await db.execute<{
    id: number;
    name: string;
    qualified_name: string;
    package_path: string;
    overload_index: number;
    start_line: number;
    end_line: number;
    file_id: number;
    path: string;
  }>(sql`
    SELECT fn.id, fn.name, fn.qualified_name, fn.package_path, fn.overload_index,
           fn.start_line, fn.end_line, fl.id AS file_id, fl.path
    FROM functions fn
    JOIN files fl ON fl.id = fn.file_id
    WHERE fl.repo_id = ${repoId}
      AND fn.name ILIKE ${`%${escaped}%`}
    ORDER BY (fn.qualified_name LIKE ${`${ANONYMOUS_SCOPE}%`}),
             (fn.name ILIKE ${`${escaped}%`}) DESC,
             length(fn.name), fn.name, fn.id
    LIMIT ${limit}
  `);

  return rows.map((row) => ({
    ...toFunctionSummary(row),
    fileId: Number(row.file_id),
    path: row.path,
  }));
}

/** % and _ are LIKE wildcards. Someone searching for get_user means the
 *  underscore literally, not "any character". Backslash is Postgres's default
 *  LIKE escape, so no ESCAPE clause is needed. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** Shared by the file listing and search, which return the same function
 *  fields. */
function toFunctionSummary(row: {
  id: number;
  name: string;
  qualified_name: string;
  package_path: string;
  overload_index: number;
  start_line: number;
  end_line: number;
}) {
  return {
    id: Number(row.id),
    name: row.name,
    qualifiedName: row.qualified_name,
    packagePath: row.package_path,
    overloadIndex: Number(row.overload_index),
    startLine: Number(row.start_line),
    endLine: Number(row.end_line),
  };
}
