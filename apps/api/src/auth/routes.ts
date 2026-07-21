import type { FastifyInstance } from "fastify";
import { GitHub } from "arctic";
import { env } from "../env.js";

// GitHub OAuth (arctic). Session handling via oslo is wired in Phase 3.
// For Phase 0 this registers the authorize/callback routes as stubs that
// return 501 until session storage is implemented.
export function registerAuth(app: FastifyInstance) {
  const github = new GitHub(
    env.GITHUB_CLIENT_ID,
    env.GITHUB_CLIENT_SECRET,
    env.GITHUB_REDIRECT_URI,
  );

  app.get("/auth/login", async (_req, reply) => {
    const url = await github.createAuthorizationURL("state-placeholder", ["repo"]);
    return reply.redirect(url.toString());
  });

  app.get("/auth/callback", async (_req, reply) => {
    // TODO(phase3): exchange code, create session, set cookie.
    return reply.code(501).send({ error: "auth not implemented yet" });
  });

  app.get("/auth/logout", async (_req, reply) => {
    return reply.code(501).send({ error: "auth not implemented yet" });
  });
}
