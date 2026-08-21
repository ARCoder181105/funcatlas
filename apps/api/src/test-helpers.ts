import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { createSession, type Session } from "./auth/session.js";
import { env } from "./env.js";

/** The `name=value` pair a browser would echo back from a response's
 *  Set-Cookie, or null if the response set no such cookie. */
export function cookieHeader(res: LightMyRequestResponse, name: string): string | null {
  const header = res.headers["set-cookie"];
  const all = Array.isArray(header) ? header : header === undefined ? [] : [String(header)];
  const match = all.find((c) => c.startsWith(`${name}=`));
  return match === undefined ? null : (match.split(";")[0] ?? null);
}

/** Empty access token: nothing calls GitHub with a session's credentials, and
 *  a fake one that looks real is worse than none. */
const TEST_USER: Session = { userId: 0, login: "test", accessToken: "" };

/**
 * A real session cookie, minted directly.
 *
 * This used to POST /auth/dev-login. That route was a login with no credential
 * and it has been deleted (R30) -- but every gated test still needs a session,
 * and a route that exists only so tests can authenticate is a route an attacker
 * can reach too. Signing the cookie here keeps the shortcut in the test helper,
 * where it cannot be deployed.
 */
export async function devLogin(app: FastifyInstance): Promise<string> {
  const id = await createSession(TEST_USER);
  // The same signature @fastify/cookie applies on the way out, so this is
  // indistinguishable from a cookie the server set.
  return `${env.SESSION_COOKIE_NAME}=${app.signCookie(id)}`;
}
