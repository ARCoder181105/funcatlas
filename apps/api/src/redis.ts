import { Redis } from "ioredis";
import {
  REDIS_COMMAND_TIMEOUT_MS,
  REDIS_CONNECT_TIMEOUT_MS,
  REDIS_MAX_RETRIES,
} from "./constants.js";
import { env } from "./env.js";

/**
 * The session store.
 *
 * Every option here exists to make a Redis outage *fail* rather than hang.
 * ioredis defaults to retrying a command forever, so `createSession` never
 * settled: signing in left the button on "Signing in…" with no error, ever,
 * and no log line either, because nothing had failed yet. R31.
 *
 * The queue's connection is deliberately the opposite -- BullMQ's blocking
 * commands require `maxRetriesPerRequest: null`, which is exactly the setting a
 * request path must not have. See queue/parse.ts.
 */
export const redis = new Redis(env.REDIS_URL, {
  connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
  commandTimeout: REDIS_COMMAND_TIMEOUT_MS,
  // Finite, so a command gives up instead of queueing behind a dead socket.
  maxRetriesPerRequest: REDIS_MAX_RETRIES,
});
