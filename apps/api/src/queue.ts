import { Redis } from "ioredis";
import { env } from "./env.js";

// BullMQ-style queue handle. The Go parser is the consumer (Phase 4).
// For Phase 0 we only expose the connection + queue name; the producer
// is wired when repo registration lands (Phase 3).
export const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
export const QUEUE_NAME = env.QUEUE_NAME;
