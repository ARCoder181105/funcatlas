import path from "node:path";
import { config } from "dotenv";
import { z } from "zod";

// dotenv resolves against the working directory, and this package is started
// from both the repo root (turbo) and apps/api (tsx, vitest). Anchor to this
// file so the root .env is found either way. Missing file is not an error --
// CI supplies the environment directly.
config({ path: path.resolve(import.meta.dirname, "../../..", ".env") });

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
});

export const env = schema.parse(process.env);
