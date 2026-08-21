/** Queue literals: job naming, retention, and the dirty-repository flag. */

export const PARSE_JOB_NAME = "parse";

/** Long enough to outlive a parse, short enough not to strand a stale flag. */
export const PARSE_DIRTY_TTL_SECONDS = 3600;

/** Completed jobs are dropped so the next push is not collapsed onto a
 *  finished one; failures are kept, because a repository stuck failing is
 *  worth being able to see. */
export const KEEP_FAILED_JOBS = 50;
