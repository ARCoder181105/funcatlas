import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { env } from "./env.js";
import { registerAuth } from "./auth/routes.js";
import { registerGraph } from "./routes/graph.js";

// Fastify 5 builds its own pino from a config object; passing an instance
// fails with FST_ERR_LOG_INVALID_LOGGER_CONFIG.
const app = Fastify({ logger: { level: env.LOG_LEVEL } });

await app.register(cors, { origin: env.CORS_ORIGIN, credentials: true });
await app.register(rateLimit, { max: 100, timeWindow: "1 minute" });

app.get("/healthz", async () => ({ status: "ok", env: env.NODE_ENV }));

registerAuth(app);
registerGraph(app);

try {
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
