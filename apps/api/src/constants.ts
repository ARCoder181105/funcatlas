/**
 * Service-wide literals — the ones no single module owns.
 *
 * Anything belonging to one area lives in that area's constants file:
 * `auth/constants.ts`, `queue/constants.ts`, `repos/constants.ts`,
 * `graph/constants.ts`.
 */

// --- Redis ----------------------------------------------------------------

/**
 * Bounds on the session store, so an outage fails a request instead of hanging
 * it. ioredis retries forever by default, which is how signing in ended up
 * sitting on "Signing in…" with no error and no log line. R31.
 */
export const REDIS_CONNECT_TIMEOUT_MS = 2000;
export const REDIS_COMMAND_TIMEOUT_MS = 2000;
export const REDIS_MAX_RETRIES = 1;
