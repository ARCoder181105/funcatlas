/** Queue literals: job naming, retention, and the dirty-repository flag. */

export const PARSE_JOB_NAME = "parse";

/** Long enough to outlive a parse, short enough not to strand a stale flag. */
export const PARSE_DIRTY_TTL_SECONDS = 3600;

/** Completed jobs are dropped so the next push is not collapsed onto a
 *  finished one; failures are kept, because a repository stuck failing is
 *  worth being able to see. */
export const KEEP_FAILED_JOBS = 50;

// --- Webhook --------------------------------------------------------------

export const WEBHOOK_PATH = "/webhooks/github";

/** GitHub's headers. Named rather than typed inline so a misspelling is a
 *  compile error in one place instead of a signature that never matches. */
export const WEBHOOK_SIGNATURE_HEADER = "x-hub-signature-256";
export const WEBHOOK_EVENT_HEADER = "x-github-event";
export const WEBHOOK_DELIVERY_HEADER = "x-github-delivery";
/** The hook's own id: stable per configured webhook, so per repository. */
export const WEBHOOK_HOOK_ID_HEADER = "x-github-hook-id";

/** The prefix GitHub puts on the digest it sends. */
export const WEBHOOK_SIGNATURE_PREFIX = "sha256=";

/**
 * How long a delivery id is remembered.
 *
 * GitHub retries a delivery it thinks failed, and a retry carries the same id.
 * Long enough to cover those; short enough that the key set stays bounded.
 */
export const WEBHOOK_REPLAY_TTL_SECONDS = 3600;

/** Namespace for delivery ids in Redis. */
export const WEBHOOK_DELIVERY_PREFIX = "webhook-delivery:";

/**
 * Per-repository ceiling on deliveries.
 *
 * The queue already collapses a storm into one job, so this is about the cost
 * of verifying and looking up, not about parse load.
 */
export const WEBHOOK_RATE_MAX = 30;
export const WEBHOOK_RATE_WINDOW = "1 minute";
