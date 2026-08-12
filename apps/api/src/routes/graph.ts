import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { functionIdSchema, traversalQuerySchema } from "@funcatlas/shared";
import { db } from "../db/index.js";
import { directEdges, functionExists, traverse } from "../graph/queries.js";

/** Graph reads. Registered inside the gated /api scope by routes/index.ts. */
export function registerGraphRoutes(api: FastifyInstance) {
  /** Real in A6. */
  const notYet = async (_req: FastifyRequest, reply: FastifyReply) =>
    reply.code(501).send({ error: "not implemented yet" });

  api.get("/api/repos/:repoId/tree", notYet);
  api.get("/api/files/:fileId/functions", notYet);
  api.get("/api/functions/:fnId/source", notYet);
  api.get("/api/repos/:repoId/search", notYet);

  api.get("/api/functions/:fnId/edges", async (req, reply) => {
    const id = functionIdSchema.safeParse((req.params as { fnId: string }).fnId);
    if (!id.success) {
      return reply.code(400).send({ error: "invalid function id" });
    }

    const query = traversalQuerySchema.safeParse(req.query);
    if (!query.success) {
      return reply.code(400).send({ error: query.error.issues[0]?.message ?? "invalid query" });
    }

    // Without this an unknown id returns an empty traversal, which reads as
    // "this function calls nothing".
    if (!(await functionExists(db, id.data))) {
      return reply.code(404).send({ error: "function not found" });
    }

    const { depth, direction } = query.data;
    const [reachable, edges] = await Promise.all([
      traverse(db, id.data, depth, direction),
      directEdges(db, id.data),
    ]);

    return reply.send({ functionId: id.data, depth, direction, reachable, edges });
  });
}
