/** Every shared literal used by both the API and the web app. */

/** Mirrors the CHECK constraint on edges.resolution_confidence. */
export const RESOLUTION_CONFIDENCE = ["exact", "name_match", "unresolved"] as const;

/** Edge style per confidence tier. A guess is never drawn as a fact (PRD §8). */
export const CONFIDENCE_STYLE = {
  exact: "solid",
  name_match: "dashed",
  unresolved: "dotted",
} as const;

/** Graph traversal directions: callees ("what does this call") or callers
 *  ("what breaks if I change this"). */
export const TRAVERSAL_DIRECTIONS = ["out", "in"] as const;

/** Depth bounds for the recursive CTE. Capped server-side: an unbounded
 *  traversal over a cyclic graph does not return. */
export const TRAVERSAL_DEFAULT_DEPTH = 5;
export const TRAVERSAL_MAX_DEPTH = 10;

/** The starting function is depth 0; its direct calls are depth 1. */
export const TRAVERSAL_ROOT_DEPTH = 0;
