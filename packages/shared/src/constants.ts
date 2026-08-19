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

/**
 * The scope the parser gives a function declared inside an anonymous one --
 * a callback, a test body, an IIFE. Mirrors `utils.Anonymous` in the Go
 * parser, which builds the qualified name.
 *
 * They are real functions and stay findable, but a repository's test file can
 * hold sixty `<anonymous>.fetch` helpers, so search ranks them below functions
 * with a name their scope can be pointed at.
 */
export const ANONYMOUS_SCOPE = "<anonymous>";

/** The host a stored repository URL is normalised to. */
export const GITHUB_HOST = "github.com";

/** Hosts a repository URL may name. Compared against a parsed hostname, never
 *  searched for as a substring. */
export const GITHUB_HOSTS: readonly string[] = [GITHUB_HOST, "www.github.com"];
