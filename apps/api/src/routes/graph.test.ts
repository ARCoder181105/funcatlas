import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { env } from "../env.js";
import { devLogin } from "../test-helpers.js";

/**
 * Every /api route, so adding one without gating it fails here. The ids do not
 * have to exist -- the gate runs before the handler, which is the point.
 */
const GATED = [
  "/api/repos",
  "/api/repos/1/tree",
  "/api/files/1/functions",
  "/api/functions/1/source",
  "/api/functions/1/edges",
  "/api/repos/1/search?query=x",
];

/** Reachable logged out, by necessity: you cannot log in through a gate that
 *  requires being logged in. */
const OPEN = ["/healthz", "/auth/login"];

let app: FastifyInstance;
let session: string | undefined;

beforeAll(async () => {
  app = await buildApp();
});

/** Logged in lazily, not in beforeAll: a gate wide enough to catch
 *  /auth/dev-login would abort the whole suite there, and "20 skipped" hides
 *  which rule broke. */
async function sessionCookie(): Promise<string> {
  session ??= await devLogin(app);
  return session;
}

afterAll(async () => {
  await app.close();
});

describe("the /api gate", () => {
  it.each(GATED)("401s %s with no cookie", async (url) => {
    const res = await app.inject({ method: "GET", url });
    expect(res.statusCode).toBe(401);
  });

  it.each(GATED)("401s %s with a forged cookie", async (url) => {
    const res = await app.inject({
      method: "GET",
      url,
      // Well-formed, unsigned, and never issued.
      headers: { cookie: `${env.SESSION_COOKIE_NAME}=${"a".repeat(64)}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it.each(GATED)("lets a session through to %s", async (url) => {
    const res = await app.inject({ method: "GET", url, headers: { cookie: await sessionCookie() } });

    // What comes back is A6's problem -- 501 from a stub, 404 from the live
    // traversal against an empty database. Only "not 401" is being asserted.
    expect(res.statusCode).not.toBe(401);
  });

  it.each(OPEN)("leaves %s open", async (url) => {
    const res = await app.inject({ method: "GET", url });
    expect(res.statusCode).not.toBe(401);
  });
});
