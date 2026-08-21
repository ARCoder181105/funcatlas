import { randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { oauthCallbackSchema } from "@funcatlas/shared";
import { env } from "../env.js";
import {
  OAUTH_SCOPES,
  OAUTH_STATE_BYTES,
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_TTL,
} from "./constants.js";
import { clearCookie, readSignedCookie, setSignedCookie } from "./cookies.js";
import { fetchGitHubUser, github } from "./github.js";
import {
  clearSessionCookie,
  createSession,
  destroySession,
  requireSession,
  sessionIdFrom,
  setSessionCookie,
  type Session,
} from "./session.js";

/**
 * GitHub OAuth, authorization-code flow.
 *
 * `state` is what ties a callback to the login that started it. Without it an
 * attacker can hand a victim a crafted callback URL and have the victim's
 * browser complete a login as the attacker.
 */

/** Constant-time compare, so a mismatch reveals nothing through timing.
 *  Length is checked first: timingSafeEqual throws on unequal lengths. */
function sameState(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function registerAuth(app: FastifyInstance) {
  app.get("/auth/login", async (_req, reply) => {
    const state = randomBytes(OAUTH_STATE_BYTES).toString("hex");
    setSignedCookie(reply, OAUTH_STATE_COOKIE, state, OAUTH_STATE_TTL);

    // arctic 3's createAuthorizationURL is synchronous.
    return reply.redirect(github.createAuthorizationURL(state, OAUTH_SCOPES).toString());
  });

  app.get("/auth/callback", async (req, reply) => {
    const params = oauthCallbackSchema.safeParse(req.query);
    if (!params.success) {
      return reply.code(400).send({ error: "invalid callback parameters" });
    }

    const expected = readSignedCookie(req, OAUTH_STATE_COOKIE);
    // Cleared whatever happens next, so a state cannot be replayed.
    clearCookie(reply, OAUTH_STATE_COOKIE);

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
    // The web app, not this one. Redirecting to the API's own origin lands a
    // freshly signed-in user on a JSON endpoint.
    return reply.redirect(env.WEB_APP_URL);
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

  // Removed in Phase 4 hardening.
  //
  // Gated around the registration rather than inside the handler: in
  // production the route does not exist and answers 404. A guarded handler
  // would answer 401, which tells a prober there is something here worth
  // finding credentials for.
  if (env.NODE_ENV !== "production") {
    app.post("/auth/dev-login", async (_req, reply) => {
      setSessionCookie(reply, await createSession(DEV_USER));
      return reply.code(204).send();
    });
  }
}

/** Empty access token: nothing in this phase calls GitHub with a session's
 *  credentials, and a fake one that looks real is worse than none. */
const DEV_USER: Session = { userId: 0, login: "dev", accessToken: "" };
