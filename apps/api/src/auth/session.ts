import { randomBytes } from "node:crypto";
import type { CookieSerializeOptions } from "@fastify/cookie";
import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../env.js";
import { redis } from "../redis.js";

/**
 * Opaque server-side sessions.
 *
 * The cookie carries a random id and nothing else. The GitHub access token
 * lives in Redis and is never serialised into a cookie or a response body --
 * anything in the cookie is in the browser, and a token in the browser is a
 * token in whatever manages to read it.
 */

/** 256 bits. A session id is a bearer credential; it has to be unguessable. */
const SESSION_ID_BYTES = 32;

const KEY_PREFIX = "session:";

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

/**
 * Cookie options shared by the session cookie and A2's OAuth state cookie.
 *
 * SameSite=Lax, not Strict: the OAuth callback is a cross-site navigation from
 * github.com, and a Strict cookie is not sent on it -- login would fail with
 * "missing state" every time.
 */
export function cookieOptions(maxAge: number): CookieSerializeOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: env.NODE_ENV === "production",
    signed: true,
    maxAge,
  };
}

/** Creates a session and returns its id. */
export async function createSession(session: Session): Promise<string> {
  const id = randomBytes(SESSION_ID_BYTES).toString("hex");
  await redis.setex(KEY_PREFIX + id, env.SESSION_TTL, JSON.stringify(session));
  return id;
}

export async function readSession(id: string): Promise<Session | null> {
  const raw = await redis.get(KEY_PREFIX + id);
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
  await redis.del(KEY_PREFIX + id);
}

/** Cookie and Redis entry expire together, so a live cookie always has a
 *  session behind it. */
export function setSessionCookie(reply: FastifyReply, id: string): void {
  reply.setCookie(env.SESSION_COOKIE_NAME, id, cookieOptions(env.SESSION_TTL));
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(env.SESSION_COOKIE_NAME, { path: "/" });
}

/** The session id from the request, or null if absent or tampered with. */
export function sessionIdFrom(req: FastifyRequest): string | null {
  const raw = req.cookies[env.SESSION_COOKIE_NAME];
  if (raw === undefined) {
    return null;
  }
  const unsigned = req.unsignCookie(raw);
  return unsigned.valid ? unsigned.value : null;
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
