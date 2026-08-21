import { createHash } from "node:crypto";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { env } from "../env.js";

/** What the worker needs to run one parse. */
export interface ParseJob {
  githubUrl: string;
  /** A first parse writes the whole repository; a re-parse scopes the write. */
  incremental: boolean;
}

export const JOB_NAME = "parse";

/**
 * BullMQ's own connection.
 *
 * Its blocking commands require maxRetriesPerRequest: null, which is exactly
 * the setting the request path must not have -- there it turns a Redis outage
 * into a hung request rather than a failed one. See redis.ts, which is the
 * session store and keeps the default policy.
 */
export const queueConnection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

export const parseQueue = new Queue<ParseJob>(env.QUEUE_NAME, { connection: queueConnection });

/**
 * One job id per repository, which is what makes a push storm collapse.
 *
 * BullMQ ignores an add whose jobId is already waiting or active, so R12 (two
 * parses of one repository corrupting the graph) and R13 (one job per commit in
 * a storm) both fall out of this rather than needing a lock or a debounce timer.
 *
 * Hashed because a jobId may not contain ':', and a URL is mostly punctuation.
 * Replacing the punctuation instead would collide: github.com/a-b/c and
 * github.com/a/b-c flatten to the same string.
 */
export function jobKey(githubUrl: string): string {
  return `repo-${createHash("sha256").update(githubUrl).digest("hex").slice(0, 16)}`;
}

/** Set while a push arrived for a repository whose parse was already running. */
function dirtyKey(githubUrl: string): string {
  return `parse-dirty:${jobKey(githubUrl)}`;
}

/**
 * Queues a parse, collapsing onto one already queued or running.
 *
 * When it collapses, the repository is marked dirty: the job in flight is
 * parsing an older commit, so dropping the push outright would leave the graph
 * behind until someone pushed again. onParseComplete re-enqueues instead.
 */
export async function enqueueParse(job: ParseJob): Promise<void> {
  const jobId = jobKey(job.githubUrl);

  // ponytail: read-then-write, so two adds racing can both see nothing and both
  // enqueue. BullMQ still collapses them by jobId -- the only cost is a dirty
  // flag that outlives its reason, which is one extra parse.
  if (await parseQueue.getJob(jobId)) {
    await queueConnection.set(dirtyKey(job.githubUrl), "1", "EX", DIRTY_TTL_SECONDS);
    return;
  }

  await parseQueue.add(JOB_NAME, job, {
    jobId,
    // Removed on completion so the next push is not collapsed onto a finished
    // job. Failures are kept: a repository stuck failing is worth seeing.
    removeOnComplete: true,
    removeOnFail: KEEP_FAILED_JOBS,
  });
}

/**
 * Re-queues a repository that was pushed to while its parse was running.
 *
 * DEL returns whether the key existed, so the check and the clear are one
 * round trip and two workers finishing together cannot both re-enqueue.
 */
export async function onParseComplete(job: ParseJob): Promise<void> {
  if ((await queueConnection.del(dirtyKey(job.githubUrl))) === 0) {
    return;
  }
  // Safe to add under the same id: BullMQ removes a job from the queue before
  // it emits completed, so the id is free by the time this runs.
  await enqueueParse({ githubUrl: job.githubUrl, incremental: true });
}

/** Long enough to outlive a parse, short enough not to strand a stale flag. */
const DIRTY_TTL_SECONDS = 3600;
const KEEP_FAILED_JOBS = 50;
