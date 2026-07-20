import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import pino from "pino";
import { env } from "./env.js";
import { registerAuth } from "./auth/routes.js";
import { registerGraph } from "./routes/graph.js";

const logger = pino({ level: env.LOG_LEVEL });

const app = Fastify({ logger });

await app.register(cors, { origin: env.CORS_ORIGIN, credentials: true });
await app.register(rateLimit, { max: 100, timeWindow: "1 minute" });

app.get("/healthz", async () => ({ status: "ok", env: env.NODE_ENV }));

registerAuth(app);
registerGraph(app);

try {
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
} catch (err) {
  logger.error(err);
  process.exit(1);
}
