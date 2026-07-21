import type { FastifyInstance } from "fastify";

// Graph endpoints (Phase 3). Session-gated stubs for now.
// Real handlers read from `db` (Drizzle over postgres.js).
export function registerGraph(app: FastifyInstance) {
  const stub = (_req: unknown, reply: { code: (n: number) => { send: (b: unknown) => void } }) =>
    reply.code(501).send({ error: "not implemented yet" });

  app.get("/api/repos", stub);
  app.get("/api/repos/:repoId/tree", stub);
  app.get("/api/files/:fileId/functions", stub);
  app.get("/api/functions/:fnId/edges", stub);
  app.get("/api/functions/:fnId/source", stub);
  app.get("/api/repos/:repoId/search", stub);
}
