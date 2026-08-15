/**
 * Every colour in the product, defined once per theme.
 *
 * `docs/UI_GUIDE.md` §1.1 is the prose and the reasoning; this file is the
 * source. `tailwind.config.ts` exposes it under a non-colour `palette` key so
 * `index.css` can read a value back with `theme()` without also generating a
 * `bg-palette-dark-*` utility that would hardcode one theme.
 *
 * Two palettes, not one, because the canvas needs raw values: React Flow
 * styles edges with real SVG attributes, which cannot take a class name or
 * inherit a CSS variable through a Tailwind utility. A component reads the
 * active mode and indexes this object; everything else reads the CSS variable
 * that `index.css` derives from the same entry.
 */

export type ThemeMode = "light" | "dark";

export interface Palette {
  surface: {
    DEFAULT: string;
    raised: string;
    border: string;
  };
  ink: {
    DEFAULT: string;
    muted: string;
  };
  confidence: {
    exact: string;
    name: string;
    unresolved: string;
  };
  /** Text drawn on top of `confidence.exact`, which doubles as the accent. */
  onAccent: string;
}

/**
 * Dark — "Ember". A warm graphite ground against a cool accent, which is the
 * pairing the alternatives did not make: certainty reads as temperature, from
 * cyan through apricot to a warm slate that is barely chromatic at all.
 */
const EMBER: Palette = {
  surface: {
    DEFAULT: "#141210",
    raised: "#1d1a17",
    border: "#2f2a25",
  },
  ink: {
    DEFAULT: "#f3ede5",
    muted: "#9d9388",
  },
  confidence: {
    exact: "#4cc9f0",
    name: "#f2a154",
    /**
     * A warm slate at about 9% saturation. Deliberately not red: an
     * unresolved call is an honest admission that resolution could not reach
     * the callee, not a failure -- colouring it as an error tells the user the
     * opposite of what PRD §8 promises. It shares the ground's hue family, so
     * it recedes into the map rather than standing out of it.
     */
    unresolved: "#8a7f73",
  },
  onAccent: "#04161c",
};

/**
 * Light — "Vellum". A drawing on cool paper rather than cream; cream with a
 * serif display is the most common generated look there is, and the cool grey
 * stays out of it.
 */
const VELLUM: Palette = {
  surface: {
    DEFAULT: "#f2f5f7",
    raised: "#ffffff",
    border: "#d9e1e8",
  },
  ink: {
    DEFAULT: "#0f1a24",
    muted: "#566573",
  },
  confidence: {
    exact: "#0d7c6b",
    name: "#b26a00",
    /** Cool slate, dark enough to stay legible as a hairline on paper. */
    unresolved: "#75838f",
  },
  onAccent: "#ffffff",
};

export const PALETTE: Record<ThemeMode, Palette> = {
  dark: EMBER,
  light: VELLUM,
};

/** The mode used when the browser states no preference. */
export const DEFAULT_MODE: ThemeMode = "dark";

/**
 * Focus rings, links, active state, primary buttons.
 *
 * The same hue that means "known" on the canvas, so the interface has one
 * accent rather than two competing ones. Aliased rather than repeated, so
 * there is still a single hex per theme.
 */
export function accent(mode: ThemeMode): string {
  return PALETTE[mode].confidence.exact;
}
