import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { env } from "../env.js";
import { devLogin } from "../test-helpers.js";

/**
 * Every /api route, so adding one without gating it fails here. The ids do not
 * have to exist -- the gate runs before the handler, which is the point.
 */
const GATED: { method: "GET" | "POST"; url: string }[] = [
  { method: "GET", url: "/api/repos" },
  { method: "POST", url: "/api/repos" },
  { method: "GET", url: "/api/repos/1/tree" },
  { method: "GET", url: "/api/files/1/functions" },
  { method: "GET", url: "/api/functions/1/source" },
  { method: "GET", url: "/api/functions/1/edges" },
  { method: "GET", url: "/api/repos/1/search?query=x" },
];

/** Reachable logged out, by necessity: you cannot log in through a gate that
 *  requires being logged in. */
// Ungated, and asserted here to be. POST /webhooks/github is ungated too but
// does not belong in this list: it answers 401 to an unsigned request, so "not
// 401" is the wrong assertion for it. Its own auth is covered in
// routes/webhook.test.ts.
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
  it.each(GATED)("401s $method $url with no cookie", async ({ method, url }) => {
    const res = await app.inject({ method, url });
    expect(res.statusCode).toBe(401);
  });

  it.each(GATED)("401s $method $url with a forged cookie", async ({ method, url }) => {
    const res = await app.inject({
      method,
      url,
      // Well-formed, unsigned, and never issued.
      headers: { cookie: `${env.SESSION_COOKIE_NAME}=${"a".repeat(64)}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it.each(GATED)("lets a session through to $method $url", async ({ method, url }) => {
    const res = await app.inject({ method, url, headers: { cookie: await sessionCookie() } });

    // What comes back is A6's problem -- 501 from a stub, 404 from the live
    // traversal against an empty database. Only "not 401" is being asserted.
    expect(res.statusCode).not.toBe(401);
  });

  it.each(OPEN)("leaves %s open", async (url) => {
    const res = await app.inject({ method: "GET", url });
    expect(res.statusCode).not.toBe(401);
  });
});
