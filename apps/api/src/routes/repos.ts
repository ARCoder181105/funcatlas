import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { repoUrlSchema } from "@funcatlas/shared";
import { db } from "../db/index.js";
import { repoByUrl } from "../graph/queries.js";
import { ParseError, normaliseRepoUrl, runParser } from "../repos/register.js";

/** Repository registration. Registered inside the gated /api scope by
 *  routes/index.ts. */
export function registerRepoRoutes(api: FastifyInstance) {
  /** Real in A6. */
  const notYet = async (_req: FastifyRequest, reply: FastifyReply) =>
    reply.code(501).send({ error: "not implemented yet" });

  api.get("/api/repos", notYet);

  api.post("/api/repos", async (req, reply) => {
    const body = repoUrlSchema.safeParse(req.body);
    if (!body.success) {
      return reply.code(400).send({
        error: body.error.issues[0]?.message ?? "invalid repository url",
      });
    }

    const githubUrl = normaliseRepoUrl(body.data.githubUrl);

    try {
      await runParser(githubUrl);
    } catch (err) {
      if (err instanceof ParseError) {
        // Logged whole, returned in part: the client gets enough to act on,
        // the log keeps everything.
        req.log.error({ err, githubUrl }, "parse failed");
        return reply
          .code(err.timedOut ? 504 : 502)
          .send({ error: err.message, detail: err.detail });
      }
      throw err;
    }

    // The parser owns the insert, so this reads back what it wrote. A missing
    // row means the parser exited 0 without writing, which is a failure the
    // exit code did not report.
    const repo = await repoByUrl(db, githubUrl);
    if (repo === null) {
      req.log.error({ githubUrl }, "parser succeeded but wrote no repo row");
      return reply.code(502).send({ error: "parser wrote no repository" });
    }

    return reply.code(201).send(repo);
  });
}
