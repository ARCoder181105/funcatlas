import path from "node:path";
import { config } from "dotenv";
import { defineConfig } from "vitest/config";

// Integration tests read DATABASE_URL and REDIS_URL from the environment and
// skip without them. Vitest does not load .env, so locally they skipped while
// passing in CI -- a green tick proving nothing.
config({ path: path.resolve(import.meta.dirname, "../..", ".env") });

export default defineConfig({
  test: {
    // Integration tests share one Postgres, so they must not interleave.
    fileParallelism: false,
    include: ["src/**/*.test.ts"],
  },
});
