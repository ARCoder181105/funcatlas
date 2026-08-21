import { randomBytes } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../env.js";
import { SESSION_ID_BYTES, SESSION_KEY_PREFIX } from "./constants.js";
import { redis } from "../redis.js";
import { clearCookie, readSignedCookie, setSignedCookie } from "./cookies.js";

/**
 * Opaque server-side sessions.
 *
 * The cookie carries a random id and nothing else. The GitHub access token
 * lives in Redis and is never serialised into a cookie or a response body --
 * anything in the cookie is in the browser, and a token in the browser is a
 * token in whatever manages to read it.
 */

export interface Session {
  /** GitHub's numeric user id, which is stable across username changes. */
  userId: number;
  login: string;
  accessToken: string;
}

declare module "fastify" {
  interface FastifyRequest {
    /** Set by requireSession. Undefined on any route that is not gated. */
    session?: Session;
  }
}

/** Creates a session and returns its id. */
export async function createSession(session: Session): Promise<string> {
  const id = randomBytes(SESSION_ID_BYTES).toString("hex");
  await redis.setex(SESSION_KEY_PREFIX + id, env.SESSION_TTL, JSON.stringify(session));
  return id;
}

export async function readSession(id: string): Promise<Session | null> {
  const raw = await redis.get(SESSION_KEY_PREFIX + id);
  if (raw === null) {
    return null;
  }
  try {
    return JSON.parse(raw) as Session;
  } catch {
    // A key that is not our JSON is not our session. Treating it as logged out
    // beats a 500 from the preHandler.
    return null;
  }
}

export async function destroySession(id: string): Promise<void> {
  await redis.del(SESSION_KEY_PREFIX + id);
}

/** Cookie and Redis entry expire together, so a live cookie always has a
 *  session behind it. */
export function setSessionCookie(reply: FastifyReply, id: string): void {
  setSignedCookie(reply, env.SESSION_COOKIE_NAME, id, env.SESSION_TTL);
}

export function clearSessionCookie(reply: FastifyReply): void {
  clearCookie(reply, env.SESSION_COOKIE_NAME);
}

export function sessionIdFrom(req: FastifyRequest): string | null {
  return readSignedCookie(req, env.SESSION_COOKIE_NAME);
}

/**
 * preHandler that rejects anonymous requests. Applied once to the whole /api
 * subtree in A4, not repeated per route.
 */
export async function requireSession(req: FastifyRequest, reply: FastifyReply) {
  const id = sessionIdFrom(req);
  const session = id === null ? null : await readSession(id);
  if (session === null) {
    // No detail: whether the id was absent, forged or expired is not the
    // caller's business.
    await reply.code(401).send({ error: "unauthorized" });
    // An async hook only halts the chain by returning the reply.
    return reply;
  }
  req.session = session;
}
