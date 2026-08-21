import { Worker } from "bullmq";
import { db } from "../db/index.js";
import { env } from "../env.js";
import { setParseStatus } from "../graph/queries.js";
import { ParseError, runParser } from "../repos/register.js";
import { onParseComplete, queueConnection, type ParseJob } from "./parse.js";

/**
 * Runs parses off the request path.
 *
 * Its own process, not the Fastify one: a parse is CPU-heavy and long, and
 * sharing an event loop with request serving is the coupling this phase exists
 * to remove.
 */
export function createParseWorker(): Worker<ParseJob> {
  const worker = new Worker<ParseJob>(
    env.QUEUE_NAME,
    async (job) => {
      const { githubUrl, incremental } = job.data;
      await setParseStatus(db, githubUrl, "parsing");
      try {
        await runParser(githubUrl, { incremental });
      } catch (err) {
        // The reason, not the log: failureReason already reduces the parser's
        // zap output to the one line that says why.
        const why = err instanceof ParseError ? (err.detail || err.message) : String(err);
        await setParseStatus(db, githubUrl, "failed", why);
        throw err;
      }
      await setParseStatus(db, githubUrl, "ready");
    },
    { connection: queueConnection, concurrency: env.PARSE_CONCURRENCY },
  );

  worker.on("completed", (job) => {
    void onParseComplete(job.data);
  });

  return worker;
}
