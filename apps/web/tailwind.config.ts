import type { Config } from "tailwindcss";

// Dark-mode-first. Signature accent is a single token, reused everywhere.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: "#7c5cff",
          soft: "#9d86ff",
        },
        surface: {
          DEFAULT: "#0b0d12",
          raised: "#141821",
          border: "#222838",
        },
      },
      borderRadius: {
        token: "0.75rem",
      },
    },
  },
  plugins: [],
} satisfies Config;
