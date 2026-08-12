import type { FastifyInstance, FastifyRequest } from "fastify";
import { idSchema, searchQuerySchema, traversalQuerySchema } from "@funcatlas/shared";
import { db } from "../db/index.js";
import {
  directEdges,
  exists,
  fileFunctions,
  functionSource,
  repoTree,
  searchFunctions,
  traverse,
} from "../graph/queries.js";

/** A positive-integer path parameter, or null when it is not one. */
function idParam(req: FastifyRequest, name: string): number | null {
  const raw = (req.params as Record<string, string>)[name];
  const parsed = idSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Graph reads. Registered inside the gated /api scope by routes/index.ts. */
export function registerGraphRoutes(api: FastifyInstance) {
  api.get("/api/repos/:repoId/tree", async (req, reply) => {
    const repoId = idParam(req, "repoId");
    if (repoId === null) {
      return reply.code(400).send({ error: "invalid repository id" });
    }
    // An unknown repo would otherwise return [], which reads as "this
    // repository has no files".
    if (!(await exists(db, "repo", repoId))) {
      return reply.code(404).send({ error: "repository not found" });
    }

    return reply.send({ repoId, files: await repoTree(db, repoId) });
  });

  api.get("/api/files/:fileId/functions", async (req, reply) => {
    const fileId = idParam(req, "fileId");
    if (fileId === null) {
      return reply.code(400).send({ error: "invalid file id" });
    }
    if (!(await exists(db, "file", fileId))) {
      return reply.code(404).send({ error: "file not found" });
    }

    return reply.send({ fileId, functions: await fileFunctions(db, fileId) });
  });

  api.get("/api/functions/:fnId/source", async (req, reply) => {
    const fnId = idParam(req, "fnId");
    if (fnId === null) {
      return reply.code(400).send({ error: "invalid function id" });
    }

    const source = await functionSource(db, fnId);
    if (source === null) {
      return reply.code(404).send({ error: "function not found" });
    }

    return reply.send(source);
  });

  api.get("/api/repos/:repoId/search", async (req, reply) => {
    const params = searchQuerySchema.safeParse({
      ...(req.query as Record<string, unknown>),
      repoId: (req.params as { repoId: string }).repoId,
    });
    if (!params.success) {
      return reply.code(400).send({ error: params.error.issues[0]?.message ?? "invalid query" });
    }

    const { repoId, query, limit } = params.data;
    if (!(await exists(db, "repo", repoId))) {
      return reply.code(404).send({ error: "repository not found" });
    }

    return reply.send({ repoId, query, results: await searchFunctions(db, repoId, query, limit) });
  });

  api.get("/api/functions/:fnId/edges", async (req, reply) => {
    const fnId = idParam(req, "fnId");
    if (fnId === null) {
      return reply.code(400).send({ error: "invalid function id" });
    }

    const query = traversalQuerySchema.safeParse(req.query);
    if (!query.success) {
      return reply.code(400).send({ error: query.error.issues[0]?.message ?? "invalid query" });
    }

    // Without this an unknown id returns an empty traversal, which reads as
    // "this function calls nothing".
    if (!(await exists(db, "function", fnId))) {
      return reply.code(404).send({ error: "function not found" });
    }

    const { depth, direction } = query.data;
    const [reachable, edges] = await Promise.all([
      traverse(db, fnId, depth, direction),
      directEdges(db, fnId),
    ]);

    return reply.send({ functionId: fnId, depth, direction, reachable, edges });
  });
}
