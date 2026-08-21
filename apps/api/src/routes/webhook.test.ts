import { createHmac, randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { db } from "../db/index.js";
import { env } from "../env.js";
import { WEBHOOK_PATH } from "../queue/constants.js";

// The queue is covered in queue/parse.test.ts. What matters here is whether a
// job is asked for at all, and for which repository.
vi.mock("../queue/parse.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../queue/parse.js")>();
  return { ...actual, enqueueParse: vi.fn() };
});

const { enqueueParse } = await import("../queue/parse.js");
const { buildApp } = await import("../app.js");
const mockedEnqueue = vi.mocked(enqueueParse);

const REPO_URL = "https://github.com/owner/repo";
const pushBody = (fullName = "owner/repo") =>
  JSON.stringify({ ref: "refs/heads/main", repository: { full_name: fullName } });

let app: FastifyInstance;

function sign(body: string): string {
  return "sha256=" + createHmac("sha256", env.GITHUB_WEBHOOK_SECRET).update(body).digest("hex");
}

async function deliver(
  body: string,
  {
    signature,
    event = "push",
    delivery = randomUUID(),
    // Fresh per delivery unless a test pins it: the throttle keys on this, and
    // a shared id would let one test spend another's budget.
    hookId = randomUUID(),
  }: Partial<{
    signature: string;
    event: string;
    delivery: string;
    hookId: string;
  }> = {},
): Promise<LightMyRequestResponse> {
  return app.inject({
    method: "POST",
    url: WEBHOOK_PATH,
    headers: {
      "content-type": "application/json",
      "x-hub-signature-256": signature ?? sign(body),
      "x-github-event": event,
      "x-github-delivery": delivery,
      "x-github-hook-id": hookId,
    },
    payload: body,
  });
}

beforeEach(async () => {
  mockedEnqueue.mockReset();
  await db.execute(sql`TRUNCATE repos, files, functions, edges RESTART IDENTITY CASCADE`);
  await db.execute(
    sql`INSERT INTO repos (github_url, default_branch) VALUES (${REPO_URL}, 'main')`,
  );
  app ??= await buildApp();
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE repos, files, functions, edges RESTART IDENTITY CASCADE`);
  await app.close();
});

describe("POST /webhooks/github", () => {
  it("queues a parse for a signed push", async () => {
    const res = await deliver(pushBody());

    expect(res.statusCode).toBe(200);
    expect(mockedEnqueue).toHaveBeenCalledWith({ githubUrl: REPO_URL, incremental: false });
  });

  // The signature is the only thing authenticating this route, so a body that
  // does not match it must not reach any of the logic below.
  it("401s a tampered body", async () => {
    const res = await deliver(pushBody(), { signature: sign('{"ref":"other"}') });

    expect(res.statusCode).toBe(401);
    expect(mockedEnqueue).not.toHaveBeenCalled();
  });

  it.each([
    ["a missing signature", ""],
    ["a signature with no prefix", "deadbeef"],
    ["a signature of the wrong length", "sha256=abc"],
  ])("401s %s", async (_label, signature) => {
    const res = await deliver(pushBody(), { signature });

    expect(res.statusCode).toBe(401);
    expect(mockedEnqueue).not.toHaveBeenCalled();
  });

  // The signature covers the bytes GitHub sent, not an equivalent document.
  // Fastify's default JSON parser hands back a parsed object and drops the
  // text; re-serialising it produces different bytes for the same data, so the
  // digest stops matching and it reads as a wrong secret. A pretty-printed body
  // is the cheapest thing JSON.stringify cannot reproduce.
  it("verifies against the exact bytes received, not a re-serialised body", async () => {
    const body = JSON.stringify(
      { ref: "refs/heads/main", repository: { full_name: "owner/repo" } },
      null,
      2,
    );
    expect(JSON.stringify(JSON.parse(body))).not.toBe(body);

    const res = await deliver(body);

    expect(res.statusCode).toBe(200);
    expect(mockedEnqueue).toHaveBeenCalledWith({ githubUrl: REPO_URL, incremental: false });
  });

  // GitHub retries a delivery it thinks failed, and the retry carries the same
  // id. Answering a replay with a 4xx is how a working hook gets disabled.
  it("ignores a replayed delivery, and says so with a 200", async () => {
    const delivery = randomUUID();

    const first = await deliver(pushBody(), { delivery });
    const second = await deliver(pushBody(), { delivery });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(second.json()).toMatchObject({ replay: true });
    expect(mockedEnqueue).toHaveBeenCalledTimes(1);
  });

  it("throttles a flood from one repository", async () => {
    // One hook id, so all sixty land in the same bucket -- which is the point.
    const hookId = randomUUID();
    const responses = await Promise.all(
      Array.from({ length: 60 }, () => deliver(pushBody(), { hookId })),
    );

    expect(responses.some((res) => res.statusCode === 429)).toBe(true);
  });

  it.each([
    ["a repository nobody registered", "someone/else"],
  ])("takes no action on %s", async (_label, fullName) => {
    const res = await deliver(pushBody(fullName));

    // 200: not an error, just nothing to do.
    expect(res.statusCode).toBe(200);
    expect(mockedEnqueue).not.toHaveBeenCalled();
  });

  it("ignores events that are not a push", async () => {
    const res = await deliver(pushBody(), { event: "issues" });

    expect(res.statusCode).toBe(200);
    expect(mockedEnqueue).not.toHaveBeenCalled();
  });

  // A repository with a graph already is re-parsed incrementally.
  it("asks for an incremental re-parse once a commit has been recorded", async () => {
    await db.execute(
      sql`UPDATE repos SET last_synced_commit = 'abc123' WHERE github_url = ${REPO_URL}`,
    );

    await deliver(pushBody());

    expect(mockedEnqueue).toHaveBeenCalledWith({ githubUrl: REPO_URL, incremental: true });
  });

  // The route sits outside the /api gate on purpose, and must not have picked
  // up a session requirement by being registered next to one.
  it("needs no session", async () => {
    const res = await deliver(pushBody());
    expect(res.statusCode).not.toBe(401);
  });
});
