import path from "node:path";
import { config } from "dotenv";
import { z } from "zod";

// This package is started from both the repo root (turbo) and apps/api (tsx,
// vitest), and anything resolved against the working directory differs between
// the two. Anchor to this file instead; the path is the same from src/ and
// from the compiled dist/.
const repoRoot = path.resolve(import.meta.dirname, "../../..");

// A missing .env is not an error -- CI supplies the environment directly.
config({ path: path.join(repoRoot, ".env") });

// Fail-fast env validation. All keys mirror .env.example.
const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  APP_PUBLIC_URL: z.string().url(),
  CORS_ORIGIN: z.string(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  QUEUE_NAME: z.string().min(1),

  GITHUB_CLIENT_ID: z.string().min(1),
  GITHUB_CLIENT_SECRET: z.string().min(1),
  GITHUB_REDIRECT_URI: z.string().url(),
  GITHUB_WEBHOOK_SECRET: z.string().min(1),

  SESSION_SECRET: z.string().min(16),
  SESSION_COOKIE_NAME: z.string().min(1).default("funcatlas_session"),
  SESSION_TTL: z.coerce.number().int().positive().default(604800),

  // Built by `make go-build-bin`. Absolute, because the API's working
  // directory depends on how it was started.
  PARSER_BIN: z.string().min(1).default(path.join(repoRoot, "services/parser/bin/parser")),
  // Registration runs the parser inline, so this is also how long a request
  // can hang. Phase 4 moves the work to the queue and this stops mattering.
  PARSE_TIMEOUT_MS: z.coerce.number().int().positive().default(300_000),
});

export const env = schema.parse(process.env);
