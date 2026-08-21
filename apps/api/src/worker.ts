import { env } from "./env.js";
import { parseQueue, queueConnection } from "./queue/parse.js";
import { createParseWorker } from "./queue/worker.js";

const worker = createParseWorker();

worker.on("failed", (job, err) => {
  console.error(`parse failed for ${job?.data.githubUrl ?? "unknown"}:`, err.message);
});

console.log(`parse worker listening on "${env.QUEUE_NAME}", concurrency ${env.PARSE_CONCURRENCY}`);

// close() waits for jobs in flight, so a deploy does not leave a repository
// half-parsed -- the write is transactional, but the clone on disk is not.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void (async () => {
      await worker.close();
      await parseQueue.close();
      queueConnection.disconnect();
      process.exit(0);
    })();
  });
}
