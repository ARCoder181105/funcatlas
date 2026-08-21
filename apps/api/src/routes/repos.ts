import type { FastifyInstance } from "fastify";
import { repoUrlSchema } from "@funcatlas/shared";
import { db } from "../db/index.js";
import { claimRepoForParse, listRepos } from "../graph/queries.js";
import { enqueueParse } from "../queue/parse.js";
import { normaliseRepoUrl } from "../repos/register.js";

/** Repository registration. Registered inside the gated /api scope by
 *  routes/index.ts. */
export function registerRepoRoutes(api: FastifyInstance) {
  api.get("/api/repos", async (_req, reply) => reply.send({ repos: await listRepos(db) }));

  api.post("/api/repos", async (req, reply) => {
    const body = repoUrlSchema.safeParse(req.body);
    if (!body.success) {
      return reply.code(400).send({
        error: body.error.issues[0]?.message ?? "invalid repository url",
      });
    }

    const githubUrl = normaliseRepoUrl(body.data.githubUrl);

    // The row first, then the job. A worker that picks the job up before the
    // row exists has nothing to mark as parsing.
    const repo = await claimRepoForParse(db, githubUrl);
    // A repository already in the graph is being re-parsed, so the write is
    // scoped to what changed.
    await enqueueParse({ githubUrl, incremental: repo.lastSyncedCommit !== null });

    // 202, not 201: the repository exists, its graph does not yet. The client
    // polls parseStatus rather than holding a request open for the parse.
    return reply.code(202).send(repo);
  });
}
