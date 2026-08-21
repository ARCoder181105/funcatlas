import { Worker } from "bullmq";
import { env } from "../env.js";
import { runParser } from "../repos/register.js";
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
      await runParser(job.data.githubUrl, { incremental: job.data.incremental });
    },
    { connection: queueConnection, concurrency: env.PARSE_CONCURRENCY },
  );

  worker.on("completed", (job) => {
    void onParseComplete(job.data);
  });

  return worker;
}
