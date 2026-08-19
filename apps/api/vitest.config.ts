import path from "node:path";
import { config } from "dotenv";
import { defineConfig } from "vitest/config";

// Integration tests read DATABASE_URL and REDIS_URL from the environment and
// skip without them. Vitest does not load .env, so locally they skipped while
// passing in CI -- a green tick proving nothing.
config({ path: path.resolve(import.meta.dirname, "../..", ".env") });

/**
 * Point the whole suite at the test database, once, here.
 *
 * `read.test.ts` and `repos.test.ts` truncate `repos, files, functions, edges`
 * between cases, and they get their connection from `src/db/index.ts` -- which
 * reads `DATABASE_URL`. Only `queries.test.ts` was checking
 * `TEST_DATABASE_URL`, so a plain `make test` silently emptied whatever
 * repository the developer had charted in the app. It happened twice in one
 * afternoon before anyone connected the two.
 *
 * Overriding the variable rather than fixing each file means a test added
 * tomorrow is safe without knowing any of this.
 */
if (process.env.TEST_DATABASE_URL !== undefined) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

export default defineConfig({
  test: {
    // Integration tests share one Postgres, so they must not interleave.
    fileParallelism: false,
    include: ["src/**/*.test.ts"],
    // The override above runs in the config's own process; test files get
    // their own, so it has to be handed across explicitly.
    env: { DATABASE_URL: process.env.DATABASE_URL ?? "" },
  },
});
