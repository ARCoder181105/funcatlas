import { create } from "zustand";
import type { ThemeMode } from "./tokens";
export { THEME_STORAGE_KEY } from "./constants";
import { THEME_STORAGE_KEY } from "./constants";

/**
 * Which palette is active, and the one place that changes it.
 *
 * The preference itself is resolved before React boots, by the inline script in
 * `index.html` -- a theme decided in an effect paints the wrong colours for a
 * frame first, and on this app that is a full-screen flash. That script is
 * therefore the source of truth at startup, and this store reads the class it
 * set rather than recomputing the preference and risking a different answer.
 */

/** What the document is actually painted as, not what we would have chosen. */
function currentMode(): ThemeMode {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

interface ThemeState {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
}

export const useTheme = create<ThemeState>((set, get) => ({
  mode: currentMode(),

  setMode: (mode) => {
    document.documentElement.classList.toggle("dark", mode === "dark");
    // Wrapped: Safari in private browsing throws on setItem, and losing the
    // preference is not a reason to fail the click.
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch {
      /* preference is not persisted; the session still switches */
    }
    set({ mode });
  },

  toggle: () => {
    get().setMode(get().mode === "dark" ? "light" : "dark");
  },
}));
