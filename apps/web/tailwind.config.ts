import type { Config } from "tailwindcss";
import { ACCENT, COLOR } from "./src/lib/tokens";

// Dark-mode-first, survey-chart direction. The colours come from
// src/lib/tokens.ts rather than being written here, so the canvas -- which
// styles SVG strokes directly and cannot use a class -- reads the same values.
// docs/UI_GUIDE.md §1 carries the reasoning.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: { ...COLOR, accent: ACCENT },
      fontFamily: {
        // Space Grotesk is geometric, per the original brief, but odd enough
        // in its letterforms not to read as the default UI sans.
        display: ["Space Grotesk Variable", "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ["IBM Plex Sans Variable", "ui-sans-serif", "system-ui", "sans-serif"],
        // Code and code identifiers: paths, qualified names, line numbers,
        // counts. On a chart the labels are the point (UI_GUIDE §1.2).
        mono: ["IBM Plex Mono", "ui-monospace", "monospace"],
      },
      borderRadius: {
        token: "0.75rem",
      },
      transitionDuration: {
        // UI_GUIDE §4: micro-interactions 150-300ms, page-level 400-600ms.
        micro: "180ms",
        panel: "280ms",
        page: "500ms",
      },
    },
  },
  plugins: [],
} satisfies Config;
