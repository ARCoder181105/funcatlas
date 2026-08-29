import { randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { APP_ROUTE, oauthCallbackSchema } from "@funcatlas/shared";
import { env } from "../env.js";
import {
  OAUTH_SCOPES,
  OAUTH_STATE_BYTES,
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_TTL,
} from "./constants.js";
import { clearCookie, readSignedCookie, setSignedCookie } from "./cookies.js";
import { fetchGitHubUser, githubClient } from "./github.js";
import {
  clearSessionCookie,
  createSession,
  destroySession,
  isSingleUser,
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

/** Constant-time compare, so a mismatch reveals nothing through timing.
 *  Length is checked first: timingSafeEqual throws on unequal lengths. */
function sameState(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function registerAuth(app: FastifyInstance) {
  // Under FUNCATLAS_SINGLE_USER the three OAuth routes are never registered,
  // so they answer 404 rather than existing and refusing -- a handler that
  // returns 401 tells a prober there is something here worth credentials for.
  // /auth/me stays: the web app calls it to learn who it is.
  if (isSingleUser()) {
    app.log.warn(
      { login: env.FUNCATLAS_SINGLE_USER },
      "FUNCATLAS_SINGLE_USER is set: this API has no authentication. Every " +
        "request is treated as this user and there is no sign-in. Do not " +
        "expose this process beyond localhost. See docs/RISKS.md R39.",
    );
    registerMe(app);
    return;
  }

  app.get("/auth/login", async (_req, reply) => {
    const state = randomBytes(OAUTH_STATE_BYTES).toString("hex");
    setSignedCookie(reply, OAUTH_STATE_COOKIE, state, OAUTH_STATE_TTL);

    // arctic 3's createAuthorizationURL is synchronous.
    return reply.redirect(githubClient().createAuthorizationURL(state, OAUTH_SCOPES).toString());
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
      const tokens = await githubClient().validateAuthorizationCode(params.data.code);
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
    // The web app's canvas, not this API and not the web app's root. The root
    // is the marketing landing page, so a bare origin here would sign someone
    // in and then show them the pitch for the product they just signed in to.
    return reply.redirect(new URL(APP_ROUTE, env.WEB_APP_URL).toString());
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

  registerMe(app);
}

/**
 * Who the caller is. Registered on both paths, because the web app asks this
 * before it renders anything and has no other way to learn the answer.
 *
 * Field by field on purpose: spreading the session would put the access token
 * in the response body.
 */
function registerMe(app: FastifyInstance) {
  app.get("/auth/me", { preHandler: requireSession }, async (req) => ({
    userId: req.session?.userId,
    login: req.session?.login,
    singleUser: isSingleUser(),
  }));
}
