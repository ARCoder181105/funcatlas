import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev server proxies API calls to the Fastify backend (apps/api).
// VITE_API_URL is read in the browser; this proxy is a convenience for /api paths.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.VITE_API_URL ?? "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
  envPrefix: ["VITE_"],
});
