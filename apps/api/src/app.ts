import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import { env } from "./env.js";
import { redis } from "./redis.js";
import { registerAuth } from "./auth/routes.js";
import { registerApi } from "./routes/index.js";
import { registerWebhook } from "./routes/webhook.js";

/**
 * Builds the app without listening, so tests drive it through app.inject()
 * instead of binding a port. index.ts is the only place that listens.
 */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    // Fastify 5 builds its own pino from a config object; passing an instance
    // fails with FST_ERR_LOG_INVALID_LOGGER_CONFIG.
    logger: env.NODE_ENV === "test" ? false : { level: env.LOG_LEVEL },
  });

  await app.register(cors, { origin: env.CORS_ORIGIN, credentials: true });
  await app.register(cookie, { secret: env.SESSION_SECRET });
  await app.register(rateLimit, { max: 100, timeWindow: "1 minute" });

  // The session client holds an open socket, which keeps the process alive on
  // shutdown and stops vitest from exiting.
  app.addHook("onClose", async () => {
    await redis.quit();
  });

  app.get("/healthz", async () => ({ status: "ok", env: env.NODE_ENV }));

  registerAuth(app);
  // Outside registerApi's session gate: GitHub sends no cookie, and the HMAC
  // is what authenticates it.
  await registerWebhook(app);
  await registerApi(app);

  return app;
}
