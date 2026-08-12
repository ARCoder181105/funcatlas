import type { LightMyRequestResponse } from "fastify";

/** The `name=value` pair a browser would echo back from a response's
 *  Set-Cookie, or null if the response set no such cookie. */
export function cookieHeader(res: LightMyRequestResponse, name: string): string | null {
  const header = res.headers["set-cookie"];
  const all = Array.isArray(header) ? header : header === undefined ? [] : [String(header)];
  const match = all.find((c) => c.startsWith(`${name}=`));
  return match === undefined ? null : (match.split(";")[0] ?? null);
}
