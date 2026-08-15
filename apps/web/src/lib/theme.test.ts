import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { THEME_STORAGE_KEY, useTheme } from "./theme";

describe("theme", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove("dark");
    useTheme.setState({ mode: "light" });
  });

  it("uses the same storage key as the pre-paint script", () => {
    // index.html resolves the theme before React boots, so it cannot import
    // this module and the key is written out twice. Two different strings
    // would mean the reader's choice is stored and then never read back --
    // a preference that silently resets on every reload.
    const html = readFileSync(resolve(__dirname, "../../index.html"), "utf8");
    expect(html).toContain(`"${THEME_STORAGE_KEY}"`);
  });

  it("toggles the class the stylesheet keys off", () => {
    useTheme.getState().setMode("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    useTheme.getState().setMode("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("persists the choice so a reload keeps it", () => {
    useTheme.getState().setMode("dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });

  it("toggle moves between exactly the two modes", () => {
    useTheme.getState().toggle();
    expect(useTheme.getState().mode).toBe("dark");

    useTheme.getState().toggle();
    expect(useTheme.getState().mode).toBe("light");
  });

  it("switches the session even when storage is unavailable", () => {
    // Safari in private browsing throws on setItem. Losing the preference is
    // not a reason for the button to do nothing.
    const setItem = window.localStorage.setItem;
    window.localStorage.setItem = () => {
      throw new Error("QuotaExceededError");
    };

    try {
      expect(() => useTheme.getState().setMode("dark")).not.toThrow();
      expect(useTheme.getState().mode).toBe("dark");
      expect(document.documentElement.classList.contains("dark")).toBe(true);
    } finally {
      window.localStorage.setItem = setItem;
    }
  });
});
