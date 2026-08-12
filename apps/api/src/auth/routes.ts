import { randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { oauthCallbackSchema } from "@funcatlas/shared";
import { env } from "../env.js";
import { clearCookie, readSignedCookie, setSignedCookie } from "./cookies.js";
import { fetchGitHubUser, github } from "./github.js";
import {
  clearSessionCookie,
  createSession,
  destroySession,
  requireSession,
  sessionIdFrom,
  setSessionCookie,
} from "./session.js";

/**
 * GitHub OAuth, authorization-code flow.
 *
 * `state` is what ties a callback to the login that started it. Without it an
 * attacker can hand a victim a crafted callback URL and have the victim's
 * browser complete a login as the attacker.
 */

const STATE_COOKIE = "funcatlas_oauth_state";

/** Long enough to finish a login, short enough that an abandoned one expires
 *  rather than lingering. */
const STATE_TTL = 600;

const STATE_BYTES = 32;

/**
 * read:user only.
 *
 * GitHub OAuth apps have no read-only repository scope: the choice is `repo`,
 * which also grants *write* to every private repository the user can reach, or
 * a scope that cannot see private repositories at all. Nothing here reads a
 * private repository -- the parser clones over public HTTPS -- so the narrow
 * scope is correct until a phase actually needs the other one.
 */
const SCOPES = ["read:user"];

/** Constant-time compare, so a mismatch reveals nothing through timing.
 *  Length is checked first: timingSafeEqual throws on unequal lengths. */
function sameState(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function registerAuth(app: FastifyInstance) {
  app.get("/auth/login", async (_req, reply) => {
    const state = randomBytes(STATE_BYTES).toString("hex");
    setSignedCookie(reply, STATE_COOKIE, state, STATE_TTL);

    // arctic 3's createAuthorizationURL is synchronous.
    return reply.redirect(github.createAuthorizationURL(state, SCOPES).toString());
  });

  app.get("/auth/callback", async (req, reply) => {
    const params = oauthCallbackSchema.safeParse(req.query);
    if (!params.success) {
      return reply.code(400).send({ error: "invalid callback parameters" });
    }

    const expected = readSignedCookie(req, STATE_COOKIE);
    // Cleared whatever happens next, so a state cannot be replayed.
    clearCookie(reply, STATE_COOKIE);

    // State before code, always. The code is only worth exchanging once this
    // callback is known to belong to a login this browser started.
    if (expected === null || !sameState(expected, params.data.state)) {
      return reply.code(400).send({ error: "invalid oauth state" });
    }

    let sessionId: string;
    try {
      const tokens = await github.validateAuthorizationCode(params.data.code);
      const accessToken = tokens.accessToken();
      const user = await fetchGitHubUser(accessToken);
      sessionId = await createSession({ userId: user.id, login: user.login, accessToken });
    } catch (err) {
      // Logged, not returned: the reason a token exchange failed is between us
      // and GitHub.
      req.log.warn({ err }, "oauth code exchange failed");
      return reply.code(400).send({ error: "oauth exchange failed" });
    }

    setSessionCookie(reply, sessionId);
    return reply.redirect(env.APP_PUBLIC_URL);
  });

  // POST, not GET: with SameSite=Lax a cross-site GET navigation still carries
  // the cookie, so a GET logout can be triggered by any page that can make the
  // browser navigate. A cross-site POST carries no Lax cookie at all.
  app.post("/auth/logout", async (req, reply) => {
    const id = sessionIdFrom(req);
    if (id !== null) {
      await destroySession(id);
    }
    clearSessionCookie(reply);
    return reply.code(204).send();
  });

  // Field by field on purpose: spreading the session would put the access
  // token in the response body.
  app.get("/auth/me", { preHandler: requireSession }, async (req) => ({
    userId: req.session?.userId,
    login: req.session?.login,
  }));
}
