import { CONFIDENCE_STYLE, type ResolutionConfidence } from "@funcatlas/shared";
import { PALETTE, type ThemeMode } from "./tokens";

/**
 * How each confidence tier is drawn and described. One map, consumed by the
 * canvas edges, the legend and the code block.
 *
 * The stroke style is not chosen here -- it comes from `CONFIDENCE_STYLE` in
 * `@funcatlas/shared`, which the API and the schema also read. This file adds
 * only presentation, so the canvas and the database cannot disagree about
 * which tier is dashed.
 */

/**
 * SVG dash patterns, in user units.
 *
 * React Flow draws edges as SVG paths, and SVG has no `dotted` keyword the way
 * CSS borders do -- both dashed and dotted are a `stroke-dasharray`, and the
 * difference is the length of the dash.
 */
const DASH_ARRAY: Record<(typeof CONFIDENCE_STYLE)[ResolutionConfidence], string | undefined> = {
  solid: undefined,
  dashed: "6 4",
  dotted: "1 5",
};

/** Which palette entry a tier reads. The tiers and the palette keys are named
 *  differently on purpose -- `name_match` is a schema value, `name` is a
 *  colour -- so the mapping is stated once here instead of at each call site. */
const PALETTE_KEY: Record<ResolutionConfidence, keyof (typeof PALETTE)["dark"]["confidence"]> = {
  exact: "exact",
  name_match: "name",
  unresolved: "unresolved",
};

export interface ConfidencePresentation {
  /** Solid, dashed or dotted -- from the shared constant. */
  style: (typeof CONFIDENCE_STYLE)[ResolutionConfidence];
  /** `undefined` for a solid line, which has no dash pattern. */
  strokeDasharray: string | undefined;
  /** For the legend and node labels. A complete literal: Tailwind cannot see
   *  a class name built by concatenation and would purge it. Resolves through
   *  a CSS variable, so it follows the active theme on its own. */
  textClass: string;
  /** What the tier is called in the interface. */
  label: string;
  /** What it actually means, shown in the canvas legend. */
  meaning: string;
}

export const CONFIDENCE: Record<ResolutionConfidence, ConfidencePresentation> = {
  exact: {
    style: CONFIDENCE_STYLE.exact,
    strokeDasharray: DASH_ARRAY[CONFIDENCE_STYLE.exact],
    textClass: "text-confidence-exact",
    label: "Exact",
    meaning: "Matched to this function.",
  },
  name_match: {
    style: CONFIDENCE_STYLE.name_match,
    strokeDasharray: DASH_ARRAY[CONFIDENCE_STYLE.name_match],
    textClass: "text-confidence-name",
    label: "Name match",
    meaning: "A function with this name is in scope, but it may not be the one called.",
  },
  unresolved: {
    style: CONFIDENCE_STYLE.unresolved,
    strokeDasharray: DASH_ARRAY[CONFIDENCE_STYLE.unresolved],
    textClass: "text-confidence-unresolved",
    label: "Unresolved",
    meaning: "The call is real, but which function it reaches could not be determined.",
  },
};

/**
 * The raw stroke colour for a tier, in the active theme.
 *
 * A function rather than a field on the map above, because React Flow styles
 * edges with real SVG attributes: they cannot take a Tailwind class and do not
 * inherit the CSS variable that `textClass` resolves through. Everything drawn
 * in the DOM should use `textClass` and let the variable do the switching --
 * this is for the canvas only.
 */
export function confidenceColor(tier: ResolutionConfidence, mode: ThemeMode): string {
  return PALETTE[mode].confidence[PALETTE_KEY[tier]];
}

/** Legend order: most certain first, so the list reads as a scale. */
export const CONFIDENCE_ORDER: ResolutionConfidence[] = ["exact", "name_match", "unresolved"];
