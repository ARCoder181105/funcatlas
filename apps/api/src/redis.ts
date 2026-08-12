import { Redis } from "ioredis";
import { env } from "./env.js";

/**
 * The session store.
 *
 * Default retry policy on purpose. BullMQ requires maxRetriesPerRequest: null
 * for its blocking commands, which is exactly the setting a request path must
 * not have -- it turns a Redis outage into a hung request instead of a failed
 * one. Phase 4's queue gets its own connection.
 */
export const redis = new Redis(env.REDIS_URL);
