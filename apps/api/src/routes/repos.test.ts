import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { db } from "../db/index.js";
import { devLogin } from "../test-helpers.js";

// Registration enqueues; it no longer parses. The queue itself is covered in
// queue/parse.test.ts against a real Redis, so here it is mocked and what is
// being tested is the route's own contract: the row it writes, the status it
// reports, and that exactly one job is asked for.
vi.mock("../queue/parse.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../queue/parse.js")>();
  return { ...actual, enqueueParse: vi.fn() };
});

const { enqueueParse } = await import("../queue/parse.js");
const { buildApp } = await import("../app.js");
const mockedEnqueue = vi.mocked(enqueueParse);

const REPO_URL = "https://github.com/owner/repo";

let app: FastifyInstance;
let session: string;

async function post(body: Record<string, unknown>): Promise<LightMyRequestResponse> {
  return app.inject({
    method: "POST",
    url: "/api/repos",
    headers: { cookie: session },
    payload: body,
  });
}

beforeEach(async () => {
  mockedEnqueue.mockReset();
  await db.execute(sql`TRUNCATE repos, files, functions, edges RESTART IDENTITY CASCADE`);
  app ??= await buildApp();
  session ??= await devLogin(app);
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE repos, files, functions, edges RESTART IDENTITY CASCADE`);
  await app.close();
});

describe("POST /api/repos", () => {
  // 202, not 201: the repository exists, its graph does not yet. Returning 201
  // would claim a resource the client cannot read anything out of.
  it("accepts the repository and queues the parse", async () => {
    const res = await post({ githubUrl: REPO_URL });

    expect(res.statusCode).toBe(202);
    expect(res.json()).toMatchObject({ githubUrl: REPO_URL, parseStatus: "queued" });
    expect(mockedEnqueue).toHaveBeenCalledWith({ githubUrl: REPO_URL, incremental: false });
  });

  // The whole point of the queue: a large repository must not hold the request
  // open. Nothing here waits on a parse, so nothing here can be slow.
  it("returns without running the parser", async () => {
    const started = Date.now();
    await post({ githubUrl: REPO_URL });
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("writes the row before the job, so a worker never sees a missing repository", async () => {
    mockedEnqueue.mockImplementation(async () => {
      const rows = await db.execute<{ n: number }>(
        sql`SELECT count(*)::int AS n FROM repos WHERE github_url = ${REPO_URL}`,
      );
      expect(rows[0]?.n).toBe(1);
    });

    await post({ githubUrl: REPO_URL });

    expect(mockedEnqueue).toHaveBeenCalled();
  });

  it.each([
    "https://github.com/owner/repo.git",
    "https://github.com/owner/repo/",
    "https://www.github.com/owner/repo",
  ])("treats %s as the same repository", async (spelling) => {
    const first = await post({ githubUrl: REPO_URL });
    const second = await post({ githubUrl: spelling });

    expect(second.json()).toMatchObject({ id: (first.json() as { id: number }).id });
    // The canonical URL is what the queue is handed, so a second spelling
    // cannot become a second repository or a second job.
    expect(mockedEnqueue).toHaveBeenLastCalledWith({
      githubUrl: REPO_URL,
      incremental: false,
    });
  });

  // Re-registering is a request to parse again, not an error. The status goes
  // back to queued and any previous failure stops being reported.
  it("re-queues a repository that is already registered", async () => {
    await post({ githubUrl: REPO_URL });
    await db.execute(
      sql`UPDATE repos SET parse_status = 'failed', parse_error = 'clone failed'
          WHERE github_url = ${REPO_URL}`,
    );

    const res = await post({ githubUrl: REPO_URL });

    expect(res.json()).toMatchObject({ parseStatus: "queued", parseError: null });
  });

  // A repository with a graph already is re-parsed incrementally; a fresh one
  // has nothing to scope a write against.
  it("asks for an incremental re-parse once a commit has been recorded", async () => {
    await post({ githubUrl: REPO_URL });
    await db.execute(
      sql`UPDATE repos SET last_synced_commit = 'abc123' WHERE github_url = ${REPO_URL}`,
    );

    await post({ githubUrl: REPO_URL });

    expect(mockedEnqueue).toHaveBeenLastCalledWith({ githubUrl: REPO_URL, incremental: true });
  });

  it.each([
    ["a non-GitHub host", "https://evil.com/owner/repo"],
    ["a host that merely contains the string", "https://evil.com/#github.com"],
    ["a path inside a repository", "https://github.com/owner/repo/blob/main/index.ts"],
    ["the owner alone", "https://github.com/owner"],
    ["not a url at all", "owner/repo"],
  ])("400s on %s", async (_label, githubUrl) => {
    const res = await post({ githubUrl });

    expect(res.statusCode).toBe(400);
    // Nothing is queued for input that failed validation.
    expect(mockedEnqueue).not.toHaveBeenCalled();
  });

  it("400s on a missing body", async () => {
    const res = await post({});
    expect(res.statusCode).toBe(400);
    expect(mockedEnqueue).not.toHaveBeenCalled();
  });
});

describe("GET /api/repos", () => {
  it("reports each repository's parse status", async () => {
    await post({ githubUrl: REPO_URL });

    const res = await app.inject({
      method: "GET",
      url: "/api/repos",
      headers: { cookie: session },
    });

    expect(res.json()).toMatchObject({
      repos: [{ githubUrl: REPO_URL, parseStatus: "queued", parseError: null }],
    });
  });
});
