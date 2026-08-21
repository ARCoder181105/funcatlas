/**
 * Auth literals: sessions, OAuth, and the one GitHub endpoint this calls.
 *
 * Server-side only by construction. Nothing here is reachable from the browser
 * bundle, which is where a session byte-length or a scope list belongs.
 */

// --- Sessions -------------------------------------------------------------

/** 256 bits. A session id is a bearer credential; it has to be unguessable. */
export const SESSION_ID_BYTES = 32;

/** Namespace for session keys in Redis, so a scan can tell them apart. */
export const SESSION_KEY_PREFIX = "session:";

// --- OAuth ----------------------------------------------------------------

export const OAUTH_STATE_COOKIE = "funcatlas_oauth_state";

/** Long enough to finish a login, short enough that an abandoned one expires
 *  rather than lingering. */
export const OAUTH_STATE_TTL = 600;

export const OAUTH_STATE_BYTES = 32;

/**
 * read:user only.
 *
 * GitHub OAuth apps have no read-only repository scope: the choice is `repo`,
 * which also grants *write* to every private repository the user can reach, or
 * a scope that cannot see private repositories at all. Nothing here reads a
 * private repository -- the parser clones over public HTTPS -- so the narrow
 * scope is correct until a phase actually needs the other one. See RISKS R26.
 */
export const OAUTH_SCOPES = ["read:user"];

/** The only GitHub API endpoint this service calls. */
export const GITHUB_USER_ENDPOINT = "https://api.github.com/user";
