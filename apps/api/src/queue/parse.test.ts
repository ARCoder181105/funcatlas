import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { env } from "../env.js";
import { enqueueParse, jobKey, onParseComplete, parseQueue, queueConnection } from "./parse.js";

const REPO = "https://github.com/owner/repo";

// The queue needs a real Redis. CI runs one; a machine without it skips rather
// than failing, which is how the Go integration tests behave too.
const reachable = await queueConnection
  .ping()
  .then(() => true)
  .catch(() => false);

const describeQueue = reachable ? describe : describe.skip;

afterAll(async () => {
  await parseQueue.close();
  queueConnection.disconnect();
});

describeQueue("enqueueParse", () => {
  beforeEach(async () => {
    await parseQueue.obliterate({ force: true });
    await queueConnection.del(`parse-dirty:${jobKey(REPO)}`);
  });

  // R13: a push storm sends one delivery per commit, and each one must not
  // become its own parse.
  it("collapses repeated enqueues for one repository onto a single job", async () => {
    await enqueueParse({ githubUrl: REPO, incremental: false });
    await enqueueParse({ githubUrl: REPO, incremental: true });
    await enqueueParse({ githubUrl: REPO, incremental: true });

    expect(await parseQueue.getJobCountByTypes("waiting")).toBe(1);
  });

  // R12: two parses of one repository must not run at once. Different
  // repositories are unrelated and must not collapse into each other.
  it("keeps separate repositories separate", async () => {
    await enqueueParse({ githubUrl: REPO, incremental: false });
    await enqueueParse({ githubUrl: "https://github.com/owner/other", incremental: false });

    expect(await parseQueue.getJobCountByTypes("waiting")).toBe(2);
  });

  // The gap jobId dedup leaves: the job in flight is parsing an older commit,
  // so a push that arrives mid-parse would otherwise be dropped and the graph
  // would sit stale until someone pushed again.
  it("re-queues a repository pushed to while its parse was running", async () => {
    await enqueueParse({ githubUrl: REPO, incremental: false });
    // The push that lands mid-parse, collapsed onto the running job.
    await enqueueParse({ githubUrl: REPO, incremental: true });

    // The parse finishes and its job leaves the queue.
    await parseQueue.remove(jobKey(REPO));
    expect(await parseQueue.getJobCountByTypes("waiting")).toBe(0);

    await onParseComplete({ githubUrl: REPO, incremental: false });

    expect(await parseQueue.getJobCountByTypes("waiting")).toBe(1);
    const job = await parseQueue.getJob(jobKey(REPO));
    expect(job?.data.incremental).toBe(true);
  });

  it("does not re-queue a repository nobody pushed to", async () => {
    await enqueueParse({ githubUrl: REPO, incremental: false });
    await parseQueue.remove(jobKey(REPO));

    await onParseComplete({ githubUrl: REPO, incremental: false });

    expect(await parseQueue.getJobCountByTypes("waiting")).toBe(0);
  });
});

describe("jobKey", () => {
  it("is stable and unique per repository", () => {
    expect(jobKey(REPO)).toBe(jobKey(REPO));
    expect(jobKey(REPO)).not.toBe(jobKey("https://github.com/owner/other"));
  });

  // BullMQ rejects a jobId containing ':', and a URL is mostly punctuation.
  // Flattening the punctuation instead would collide: owner a-b/c and a/b-c.
  it("survives being used as a BullMQ job id", () => {
    expect(jobKey(REPO)).not.toContain(":");
    expect(jobKey("https://github.com/a-b/c")).not.toBe(jobKey("https://github.com/a/b-c"));
  });
});

// A queue name nobody set would silently share one queue across environments.
it("takes its queue name from the environment", () => {
  expect(parseQueue.name).toBe(env.QUEUE_NAME);
});
