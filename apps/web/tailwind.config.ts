import type { Config } from "tailwindcss";
import { PALETTE } from "./src/lib/tokens";

// Two themes, so a utility cannot resolve to a fixed hex -- `bg-surface` has to
// mean "whichever ground is active". The semantic names below therefore point
// at CSS variables, and `index.css` fills those variables per theme by reading
// `palette` back with theme().
//
// `palette` sits outside `colors` on purpose. Under `colors` it would also
// generate bg-palette-dark-surface and friends, and a component reaching for
// one of those would be pinned to a single theme -- exactly the bug this shape
// exists to prevent. docs/UI_GUIDE.md §1 carries the reasoning.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      palette: PALETTE,
      colors: {
        surface: {
          DEFAULT: "var(--surface)",
          raised: "var(--surface-raised)",
          border: "var(--surface-border)",
        },
        ink: {
          DEFAULT: "var(--ink)",
          muted: "var(--ink-muted)",
        },
        confidence: {
          exact: "var(--confidence-exact)",
          name: "var(--confidence-name)",
          unresolved: "var(--confidence-unresolved)",
        },
      },
      fontFamily: {
        // Bricolage Grotesque carries variable width and optical size, and its
        // letterforms are odd enough not to read as the default UI sans. Kept
        // to the wordmark and headings; restraint is what stops it becoming a
        // costume.
        display: ["Bricolage Grotesque Variable", "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ["Geist Variable", "ui-sans-serif", "system-ui", "sans-serif"],
        // Code and code identifiers: paths, qualified names, line numbers,
        // counts. Taller x-height than Plex Mono at the 11-13px the canvas
        // actually uses, which is the only size that matters here.
        mono: ["JetBrains Mono Variable", "ui-monospace", "monospace"],
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
