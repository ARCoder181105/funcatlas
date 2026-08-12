import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Integration tests share one Postgres, so they must not interleave.
    fileParallelism: false,
    include: ["src/**/*.test.ts"],
  },
});
