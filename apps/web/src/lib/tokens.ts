/**
 * Every colour in the product, defined once.
 *
 * `docs/UI_GUIDE.md` §1.1 is the prose and the reasoning; this file is the
 * source. `tailwind.config.ts` imports it, so a Tailwind utility class and an
 * SVG stroke on the canvas cannot drift apart -- React Flow styles edges with
 * real SVG attributes, which cannot take a class name.
 *
 * The direction is a survey chart: marine ink ground, warm bone ink, and a
 * confidence triad that carries the product's central claim.
 */

export const COLOR = {
  surface: {
    /** Marine ink. A blue-black with real hue, not a neutral near-black. */
    DEFAULT: "#081014",
    raised: "#0f1a20",
    /** Hairlines, panel edges, and the canvas graticule. */
    border: "#1c2a33",
  },
  ink: {
    /** Warm bone -- chart paper inverted. Deliberately not a cool grey. */
    DEFAULT: "#e8dcc8",
    muted: "#8b9299",
  },
  confidence: {
    /** Verdigris: engraved copper, the colour of a surveyed line. */
    exact: "#5fb3a1",
    /** Brass. Reported, not verified. */
    name: "#d9a441",
    /**
     * Muted slate, and deliberately not red. An unresolved call is an honest
     * admission that resolution could not reach the callee, not a failure --
     * colouring it as an error tells the user the opposite of what PRD §8
     * promises.
     */
    unresolved: "#6b7f8c",
  },
} as const;

/**
 * Focus rings, links, active state.
 *
 * The same verdigris that means "known" on the canvas, so the interface has
 * one accent rather than two competing ones. Aliased rather than repeated, so
 * there is still a single hex.
 */
export const ACCENT = COLOR.confidence.exact;
