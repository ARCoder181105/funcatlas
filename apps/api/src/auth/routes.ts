import type { FastifyInstance } from "fastify";
import { GitHub } from "arctic";
import { env } from "../env.js";

// GitHub OAuth via arctic. Still stubs: the real state handling, code exchange
// and logout land in A2. "state-placeholder" below is a live CSRF hole.
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
