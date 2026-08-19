import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Separate from vite.config.ts, which types its config with vite's own
// defineConfig and so has no `test` key. The dev-server proxy there is
// irrelevant here: tests stub fetch rather than reach a server.
export default defineConfig({
  plugins: [react()],
  // The same alias as vite.config.ts and tsconfig.json. Without it every
  // shadcn component importing "@/lib/utils" fails to resolve under vitest
  // only, which reads as a broken test rather than a missing alias.
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
