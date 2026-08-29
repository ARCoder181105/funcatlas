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
  /**
   * A third ink, and the only colour in here that carries no canvas meaning.
   *
   * The two spot inks plus a neutral say everything resolution has to say, but
   * on a page three thousand pixels long they say it in two hues and the page
   * reads flat. A map is drawn in three inks: land, route, and water. This is
   * the water.
   *
   * **Landing page only.** It appears on eyebrows, section detail and hover
   * states, and never on the canvas -- there, a colour that means nothing would
   * be competing with three that mean something. It sits at 174°, a clear 53°
   * off `exact` and 153° off `name`, so it cannot be misread as either.
   */
  spot: string;
}

/**
 * The scale is a two-colour press: two spot inks and a neutral.
 *
 * A printer with two plates and paper has exactly three things to say, which
 * is exactly how many answers resolution has. Ultramarine is the fact, fired
 * clay is the report, and the ash is what neither plate covered. The order is
 * read as ink weight rather than as temperature, so it survives being drawn as
 * a hairline on a canvas the reader is zoomed out of.
 *
 * This replaced Ember/Vellum, which ran cyan through apricot to a warm slate.
 * The reasoning there was sound and the execution was fine; it was changed
 * because cyan-on-near-black is the single most common developer-tool accent
 * there is, and §7 of `docs/UI_GUIDE.md` is about not landing on the look
 * every tool in this category already has.
 */

/** Dark — "Ultramarine". Near-black with a blue cast, so both inks sit on a
 *  ground that belongs to the same press run. */
const ULTRAMARINE: Palette = {
  surface: {
    DEFAULT: "#0a0b10",
    raised: "#12141c",
    border: "#242839",
  },
  ink: {
    DEFAULT: "#eceefa",
    muted: "#8b90a8",
  },
  confidence: {
    exact: "#6b8cff",
    name: "#e0885a",
    /**
     * Ash at about 11% saturation, in the ground's own hue family so it
     * recedes into the map rather than standing out of it. Deliberately not
     * red: an unresolved call is an honest admission that resolution could not
     * reach the callee, not a failure -- colouring it as an error tells the
     * user the opposite of what PRD §8 promises.
     */
    unresolved: "#767c92",
  },
  onAccent: "#080a14",
  spot: "#2ad4c4",
};

/**
 * Light — "Letterpress". Cool paper rather than cream; cream with a serif
 * display is the most common generated look there is, and the cool grey stays
 * out of it. Both inks darken rather than changing hue, which is what a press
 * would actually do on white stock.
 */
const LETTERPRESS: Palette = {
  surface: {
    DEFAULT: "#f1f2f7",
    raised: "#ffffff",
    border: "#d8dbe6",
  },
  ink: {
    DEFAULT: "#12141f",
    muted: "#5a5f74",
  },
  confidence: {
    exact: "#2a44c4",
    name: "#a55424",
    /** Cool ash, dark enough to hold as a hairline on paper. */
    unresolved: "#71768a",
  },
  onAccent: "#ffffff",
  /** Darker than the dark theme's, to clear 4.5:1 as text on paper. */
  spot: "#0b7268",
};

export const PALETTE: Record<ThemeMode, Palette> = {
  dark: ULTRAMARINE,
  light: LETTERPRESS,
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
