import type { CookieSerializeOptions } from "@fastify/cookie";
import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../env.js";

/**
 * Cookie plumbing shared by the session cookie and the OAuth state cookie.
 * Both are signed with SESSION_SECRET, so a forged value is rejected before
 * anything downstream looks at it.
 */

/**
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

export function setSignedCookie(
  reply: FastifyReply,
  name: string,
  value: string,
  maxAge: number,
): void {
  reply.setCookie(name, value, cookieOptions(maxAge));
}

/** A signed cookie's value, or null when it is absent or its signature does
 *  not verify. */
export function readSignedCookie(req: FastifyRequest, name: string): string | null {
  const raw = req.cookies[name];
  if (raw === undefined) {
    return null;
  }
  const unsigned = req.unsignCookie(raw);
  return unsigned.valid ? unsigned.value : null;
}

/** Path has to match what set it, or the browser keeps the old cookie. */
export function clearCookie(reply: FastifyReply, name: string): void {
  reply.clearCookie(name, { path: "/" });
}
