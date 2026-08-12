import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { env } from "./env.js";

/** The `name=value` pair a browser would echo back from a response's
 *  Set-Cookie, or null if the response set no such cookie. */
export function cookieHeader(res: LightMyRequestResponse, name: string): string | null {
  const header = res.headers["set-cookie"];
  const all = Array.isArray(header) ? header : header === undefined ? [] : [String(header)];
  const match = all.find((c) => c.startsWith(`${name}=`));
  return match === undefined ? null : (match.split(";")[0] ?? null);
}

/** Takes the dev-login shortcut and returns the session cookie a browser would
 *  send back. Only registered outside production, which is where tests run. */
export async function devLogin(app: FastifyInstance): Promise<string> {
  const res = await app.inject({ method: "POST", url: "/auth/dev-login" });
  const cookie = cookieHeader(res, env.SESSION_COOKIE_NAME);
  if (cookie === null) {
    throw new Error(`dev-login set no session cookie (status ${res.statusCode})`);
  }
  return cookie;
}
