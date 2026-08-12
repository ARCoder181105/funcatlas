import type { FastifyInstance } from "fastify";
import { requireSession } from "../auth/session.js";
import { registerGraphRoutes } from "./graph.js";
import { registerRepoRoutes } from "./repos.js";

/**
 * Everything under /api, behind one session gate. docs/SECURITY.md requires
 * every graph-serving endpoint to be gated even in single-user mode.
 *
 * One hook on one encapsulated scope, not a gate per route group -- a second
 * group with its own copy of the hook is how the third group ends up without
 * one. The encapsulation is load-bearing: the same hook on the root instance
 * would gate /healthz and /auth/login, and nobody could ever log in.
 */
export async function registerApi(app: FastifyInstance) {
  await app.register(async (api) => {
    api.addHook("preHandler", requireSession);

    registerRepoRoutes(api);
    registerGraphRoutes(api);
  });
}
