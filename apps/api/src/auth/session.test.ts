import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { env } from "../env.js";
import { redis } from "../redis.js";
import { cookieHeader } from "../test-helpers.js";
import {
  createSession,
  destroySession,
  readSession,
  requireSession,
  setSessionCookie,
  type Session,
} from "./session.js";

const user: Session = { userId: 4242, login: "octocat", accessToken: "gho_secret" };

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();

  // Routes can still be added until the first inject triggers ready(). Building
  // on the real app rather than a hand-rolled one keeps the cookie plugin
  // configured exactly as production has it, signing secret included.
  app.get("/probe", { preHandler: requireSession }, async (req) => ({
    login: req.session?.login,
  }));

  app.get("/probe-login", async (_req, reply) => {
    const id = await createSession(user);
    setSessionCookie(reply, id);
    return reply.send({ id });
  });
});

afterAll(async () => {
  await app.close();
});

/** Logs in the way a browser would, returning the cookie header to send back
 *  and the session id behind it. */
async function login(): Promise<{ cookie: string; id: string }> {
  const res = await app.inject({ method: "GET", url: "/probe-login" });
  const cookie = cookieHeader(res, env.SESSION_COOKIE_NAME);
  if (cookie === null) {
    throw new Error("login set no session cookie");
  }
  return { cookie, id: (res.json() as { id: string }).id };
}

describe("the session store", () => {
  it("round-trips a session", async () => {
    const id = await createSession(user);
    expect(await readSession(id)).toEqual(user);
  });

  it("expires with SESSION_TTL", async () => {
    const id = await createSession(user);
    const ttl = await redis.ttl(`session:${id}`);

    // Within a second of the configured TTL rather than exactly it: the round
    // trip takes time.
    expect(ttl).toBeGreaterThan(env.SESSION_TTL - 2);
    expect(ttl).toBeLessThanOrEqual(env.SESSION_TTL);
  });

  it("reads a destroyed session as null", async () => {
    const id = await createSession(user);
    await destroySession(id);
    expect(await readSession(id)).toBeNull();
  });

  it("reads a corrupt value as null rather than throwing", async () => {
    await redis.setex("session:not-json", 60, "{{{");
    expect(await readSession("not-json")).toBeNull();
  });
});

describe("requireSession", () => {
  it("passes a real session through to the handler", async () => {
    const { cookie } = await login();
    const res = await app.inject({ method: "GET", url: "/probe", headers: { cookie } });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ login: user.login });
  });

  it("401s with no cookie", async () => {
    const res = await app.inject({ method: "GET", url: "/probe" });
    expect(res.statusCode).toBe(401);
  });

  it("401s on an unknown session id", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/probe",
      headers: { cookie: `${env.SESSION_COOKIE_NAME}=deadbeef` },
    });
    expect(res.statusCode).toBe(401);
  });

  it("401s on a live session id presented without its signature", async () => {
    const { id } = await login();
    const unsigned = `${env.SESSION_COOKIE_NAME}=${id}`;

    const res = await app.inject({ method: "GET", url: "/probe", headers: { cookie: unsigned } });

    // The id is real and the session is live behind it, so this 401 can only
    // come from the signature check. Drop that check and the test goes green
    // at 200, which is the point of writing it this way round.
    expect(res.statusCode).toBe(401);
  });

  it("401s once the session is destroyed, even with a valid cookie", async () => {
    const { cookie, id } = await login();
    await destroySession(id);

    const res = await app.inject({ method: "GET", url: "/probe", headers: { cookie } });
    expect(res.statusCode).toBe(401);
  });
});
