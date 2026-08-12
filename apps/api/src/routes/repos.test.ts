import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { db } from "../db/index.js";
import { devLogin } from "../test-helpers.js";
import { ParseError } from "../repos/register.js";

// The spawn itself is covered in repos/register.test.ts against stub binaries.
// Here it is mocked so the route's own behaviour -- what it does with a
// success, a failure and a timeout -- is what is being tested.
vi.mock("../repos/register.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../repos/register.js")>();
  return { ...actual, runParser: vi.fn() };
});

const { runParser } = await import("../repos/register.js");
const { buildApp } = await import("../app.js");
const mockedRunParser = vi.mocked(runParser);

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

/** Stands in for a parser run that wrote a repo row, which is what the route
 *  reads back. */
function parserWrites(url = REPO_URL) {
  mockedRunParser.mockImplementation(async () => {
    await db.execute(sql`
      INSERT INTO repos (github_url, default_branch) VALUES (${url}, 'main')
      ON CONFLICT (github_url) DO NOTHING
    `);
  });
}

beforeEach(async () => {
  mockedRunParser.mockReset();
  await db.execute(sql`TRUNCATE repos, files, functions, edges RESTART IDENTITY CASCADE`);
  app ??= await buildApp();
  session ??= await devLogin(app);
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE repos, files, functions, edges RESTART IDENTITY CASCADE`);
  await app.close();
});

describe("POST /api/repos", () => {
  it("registers a repository and returns the row the parser wrote", async () => {
    parserWrites();

    const res = await post({ githubUrl: REPO_URL });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ githubUrl: REPO_URL, defaultBranch: "main" });
  });

  it.each([
    "https://github.com/owner/repo.git",
    "https://github.com/owner/repo/",
    "https://www.github.com/owner/repo",
  ])("treats %s as the same repository", async (spelling) => {
    parserWrites();

    const first = await post({ githubUrl: REPO_URL });
    const second = await post({ githubUrl: spelling });

    expect(second.json()).toMatchObject({ id: (first.json() as { id: number }).id });
    // The canonical URL is what the parser is handed, so it cannot write a
    // second row under the other spelling.
    expect(mockedRunParser).toHaveBeenLastCalledWith(REPO_URL);
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
    // Nothing gets spawned for input that failed validation.
    expect(mockedRunParser).not.toHaveBeenCalled();
  });

  it("400s on a missing body", async () => {
    const res = await post({});
    expect(res.statusCode).toBe(400);
    expect(mockedRunParser).not.toHaveBeenCalled();
  });

  it("502s when the parser fails, and says why", async () => {
    mockedRunParser.mockRejectedValue(
      new ParseError("parser failed", false, "clone failed: repository not found"),
    );

    const res = await post({ githubUrl: REPO_URL });

    expect(res.statusCode).toBe(502);
    expect(res.json()).toMatchObject({ detail: expect.stringContaining("not found") });
  });

  it("504s when the parser times out", async () => {
    mockedRunParser.mockRejectedValue(new ParseError("parser timed out", true, ""));

    const res = await post({ githubUrl: REPO_URL });

    // Distinct from 502 on purpose: a timeout is worth retrying, a clone
    // failure is not.
    expect(res.statusCode).toBe(504);
  });

  it("502s when the parser exits clean but writes nothing", async () => {
    mockedRunParser.mockResolvedValue(undefined);

    const res = await post({ githubUrl: REPO_URL });

    // A 201 here would hand back a repository that does not exist.
    expect(res.statusCode).toBe(502);
  });
});
