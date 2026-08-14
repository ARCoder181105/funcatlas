import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Separate from vite.config.ts, which types its config with vite's own
// defineConfig and so has no `test` key. The dev-server proxy there is
// irrelevant here: tests stub fetch rather than reach a server.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
