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
 * How many search results one page holds.
 *
 * Shared because both sides act on it: the API defaults its `limit` to this,
 * and the palette compares against it to say "the first 50" rather than
 * presenting a truncated list as the whole answer. Written twice it drifts, and
 * the drift is a heading that lies.
 */
export const SEARCH_LIMIT = 50;

/** Ceilings on what a search may ask for. These bound the query, not the UI. */
export const SEARCH_MAX_LIMIT = 200;
export const SEARCH_QUERY_MAX_LENGTH = 200;

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

/**
 * Where a repository is in its parse. Mirrors the CHECK constraint added in
 * migration 0004.
 *
 * `queued` and `parsing` are transient; `ready` and `failed` are terminal. The
 * client polls while a repository is in the first pair and stops at the second
 * -- a poll with no terminal state is a spinner that never resolves.
 */
export const PARSE_STATUSES = ["queued", "parsing", "ready", "failed"] as const;

/** The statuses worth asking about again. */
export const PARSE_STATUSES_PENDING: readonly string[] = ["queued", "parsing"];

/** How often the client re-asks while any repository is still being parsed. */
export const PARSE_POLL_INTERVAL_MS = 2000;

/** Assumed until a clone reveals the real one. The parser reads the branch off
 *  the checkout rather than trusting this -- see RISKS R29, where every
 *  repository on master was recorded as being on main. */
export const DEFAULT_BRANCH = "main";

/** The host a stored repository URL is normalised to. */
export const GITHUB_HOST = "github.com";

/** Hosts a repository URL may name. Compared against a parsed hostname, never
 *  searched for as a substring. */
export const GITHUB_HOSTS: readonly string[] = [GITHUB_HOST, "www.github.com"];
