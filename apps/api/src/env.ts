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

  // Optional, and enforced below only when there is actually an OAuth flow to
  // run. Requiring them unconditionally would mean registering a GitHub OAuth
  // app before `docker compose up` did anything, which is exactly the friction
  // FUNCATLAS_SINGLE_USER exists to remove.
  //
  // GITHUB_WEBHOOK_SECRET stays required on both paths: it is a random string
  // anyone can generate, not a credential that has to be registered somewhere.
  GITHUB_CLIENT_ID: z.string().min(1).optional(),
  GITHUB_CLIENT_SECRET: z.string().min(1).optional(),
  GITHUB_REDIRECT_URI: z.string().url().optional(),
  GITHUB_WEBHOOK_SECRET: z.string().min(1),

  /**
   * Run with no authentication at all, as this GitHub login.
   *
   * Set, the API registers no /auth/login, /auth/callback or /auth/logout and
   * every request resolves to this user. It exists so `docker compose up`
   * works without registering a GitHub OAuth app, which was the single
   * largest thing standing between a clone and a running stack.
   *
   * This is not R30 wearing a different hat. R30 was a session-minting
   * endpoint that shipped in every deployment behind a NODE_ENV gate, so the
   * gate had to be right exactly once. Here there is no endpoint to reach and
   * no gate to be wrong: the instance is unauthenticated because a human wrote
   * their username into their own .env. What it is not is safe to expose --
   * the process binds 0.0.0.0 (it must, inside a container) and cannot know
   * what sits in front of it, so compose publishes on 127.0.0.1 and the
   * server warns on every start. R39.
   */
  // Blank counts as unset. `FUNCATLAS_SINGLE_USER=` in a .env is how someone
  // turns this off, and a bare `.min(1)` answers that with a Zod stack trace
  // about a string length instead of just starting normally.
  FUNCATLAS_SINGLE_USER: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().min(1).optional(),
  ),

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

const parsed = schema.parse(process.env);

// Checked here rather than at the first request: a missing client id should
// stop the process on the line that starts it, not surface as a 500 the first
// time somebody clicks sign in.
if (parsed.FUNCATLAS_SINGLE_USER === undefined) {
  const missing = (["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET", "GITHUB_REDIRECT_URI"] as const)
    .filter((key) => parsed[key] === undefined);

  if (missing.length > 0) {
    throw new Error(
      `Missing ${missing.join(", ")}. Either register a GitHub OAuth app and fill them in, ` +
        "or set FUNCATLAS_SINGLE_USER to run with no authentication (see .env.example).",
    );
  }
}

export const env = parsed;
