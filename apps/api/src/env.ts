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
  // Where the OAuth callback sends the browser once a session exists. The web
  // app, not this one -- see .env.example.
  WEB_APP_URL: z.string().url(),
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
  PARSE_TIMEOUT_MS: z.coerce.number().int().positive().default(300_000),
  // How many repositories the worker parses at once. Each one is a whole
  // tree-sitter pass, so this is a CPU count, not a connection count.
  PARSE_CONCURRENCY: z.coerce.number().int().positive().default(2),
});

export const env = schema.parse(process.env);
