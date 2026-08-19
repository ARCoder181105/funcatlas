// Shared TS types. Row types are inferred from the Drizzle schema in
// ./schema.ts, so they are not re-declared here.

import type { RESOLUTION_CONFIDENCE, TRAVERSAL_DIRECTIONS } from "./constants.js";

export type ResolutionConfidence = (typeof RESOLUTION_CONFIDENCE)[number];
export type TraversalDirection = (typeof TRAVERSAL_DIRECTIONS)[number];

/** One function reached by a traversal, with how it was reached. */
export interface ReachableFunction {
  id: number;
  name: string;
  qualifiedName: string;
  fileId: number;
  depth: number;
  /** Confidence of the edge that reached it; null for the starting function. */
  confidence: ResolutionConfidence | null;
  /** The function the edge came from; null for the starting function. */
  viaFunctionId: number | null;
}

/**
 * What the API sends back, defined once for both sides of the wire.
 *
 * The API annotates its query functions with these, so a column rename that
 * does not reach the client is a typecheck failure rather than an `undefined`
 * in a component. Note what this is not: the web app casts responses to these
 * types, it does not validate against them. They describe the contract; only
 * the API keeps it.
 */

/** A repository, as returned by registration. */
export interface RegisteredRepo {
  id: number;
  githubUrl: string;
  defaultBranch: string;
  /** Null until a parse has recorded one. */
  lastSyncedCommit: string | null;
}

/** A repository in the listing, with how much of it has been parsed. */
export interface RepoSummary extends RegisteredRepo {
  createdAt: string;
  fileCount: number;
  functionCount: number;
}

/** One file. The tree arrives flat and path-ordered; the client nests it. */
export interface FileNode {
  id: number;
  path: string;
  language: string;
  functionCount: number;
}

/** A function without its body -- a file with two hundred functions would
 *  otherwise ship two hundred bodies to render a list of names. */
export interface FunctionSummary {
  id: number;
  name: string;
  qualifiedName: string;
  packagePath: string;
  overloadIndex: number;
  startLine: number;
  endLine: number;
}

/** A search hit: a function, plus the file it was found in. */
export interface SearchResult extends FunctionSummary {
  fileId: number;
  path: string;
}

/** One function's source, with the file it came from. */
export interface FunctionSource {
  id: number;
  /** Null when the parser stored no source for it. */
  source: string | null;
  startLine: number;
  endLine: number;
  path: string;
  language: string;
}

/**
 * A direct call out of a function.
 *
 * `calleeFunctionId` is null exactly when `confidence` is `unresolved` -- the
 * schema enforces the pair (migration 0002). An unresolved call still has a
 * name, and that name is all the canvas can honestly draw.
 */
export interface CallEdge {
  id: number;
  calleeFunctionId: number | null;
  calleeName: string;
  callLine: number | null;
  confidence: ResolutionConfidence;
}

export interface RepoListResponse {
  repos: RepoSummary[];
}

export interface RepoTreeResponse {
  repoId: number;
  files: FileNode[];
}

export interface FileFunctionsResponse {
  fileId: number;
  functions: FunctionSummary[];
}

export interface SearchResponse {
  repoId: number;
  query: string;
  results: SearchResult[];
}

/** `reachable` walks resolved edges only; `edges` is every direct call out of
 *  the start, including the unresolved ones a traversal can never reach. */
export interface TraversalResponse {
  functionId: number;
  depth: number;
  direction: TraversalDirection;
  reachable: ReachableFunction[];
  edges: CallEdge[];
}

/** Who is logged in. Never carries the access token -- see auth/routes.ts. */
export interface SessionUser {
  userId: number;
  login: string;
}
