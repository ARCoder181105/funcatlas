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
 * ioredis reports an outage as one of a handful of shapes rather than a typed
 * error: a timeout, a closed connection, a refused socket, or the retry ceiling.
 * Matching on the message is unlovely and is what the library gives us.
 */
function isRedisUnavailable(err: unknown): boolean {
  if (!(err instanceof Error)) {
    return false;
  }
  return (
    err.name === "MaxRetriesPerRequestError" ||
    err.message.includes("Command timed out") ||
    err.message.includes("Connection is closed") ||
    err.message.includes("Stream isn't writeable") ||
    err.message.includes("ECONNREFUSED")
  );
}

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

  /**
   * A Redis outage is a 503, not a 500.
   *
   * Handled once, here, rather than guarded at every call site: sessions,
   * logout, the webhook's replay check and the queue all reach Redis, and a
   * guard per caller is how the next caller ends up without one. 503 says
   * "try again", which is true -- 500 says the request was malformed, which
   * is not.
   */
  app.setErrorHandler((err, req, reply) => {
    if (isRedisUnavailable(err)) {
      req.log.error({ err }, "redis unavailable");
      return reply.code(503).send({ error: "temporarily unavailable" });
    }
    req.log.error({ err }, "unhandled error");
    return reply.send(err);
  });

  app.get("/healthz", async () => ({ status: "ok", env: env.NODE_ENV }));

  registerAuth(app);
  // Outside registerApi's session gate: GitHub sends no cookie, and the HMAC
  // is what authenticates it.
  await registerWebhook(app);
  await registerApi(app);

  return app;
}
