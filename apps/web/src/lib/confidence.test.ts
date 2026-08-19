import { describe, expect, it } from "vitest";
import { CONFIDENCE_STYLE, RESOLUTION_CONFIDENCE } from "@funcatlas/shared";
import { CONFIDENCE, CONFIDENCE_ORDER, confidenceColor } from "./confidence";
import { PALETTE, type ThemeMode } from "./tokens";

const MODES: ThemeMode[] = ["light", "dark"];

describe("confidence presentation", () => {
  it("covers every tier the schema allows", () => {
    // RESOLUTION_CONFIDENCE mirrors the CHECK constraint on
    // edges.resolution_confidence. A tier added there and missed here would
    // otherwise render as an undefined style.
    expect(Object.keys(CONFIDENCE).sort()).toEqual([...RESOLUTION_CONFIDENCE].sort());
    expect(CONFIDENCE_ORDER.sort()).toEqual([...RESOLUTION_CONFIDENCE].sort());
  });

  it("agrees with the shared style map rather than restating it", () => {
    // The canvas and the database must not disagree about which tier is
    // dashed. This is the assertion that stops a second copy drifting.
    for (const tier of RESOLUTION_CONFIDENCE) {
      expect(CONFIDENCE[tier].style).toBe(CONFIDENCE_STYLE[tier]);
    }
  });

  it("draws each tier differently, in both themes", () => {
    const styles = RESOLUTION_CONFIDENCE.map((tier) => CONFIDENCE[tier].style);
    const labels = RESOLUTION_CONFIDENCE.map((tier) => CONFIDENCE[tier].label);

    // Three tiers that render identically would collapse the whole promise in
    // PRD §8 -- a guess would be indistinguishable from a fact.
    expect(new Set(styles).size).toBe(RESOLUTION_CONFIDENCE.length);
    expect(new Set(labels).size).toBe(RESOLUTION_CONFIDENCE.length);

    for (const mode of MODES) {
      const colors = RESOLUTION_CONFIDENCE.map((tier) => confidenceColor(tier, mode));
      expect(new Set(colors).size, `${mode} reuses a colour across tiers`).toBe(
        RESOLUTION_CONFIDENCE.length,
      );
    }
  });

  it("gives solid no dash pattern and the other two different ones", () => {
    expect(CONFIDENCE.exact.strokeDasharray).toBeUndefined();
    // SVG has no `dotted` keyword; both are dasharrays and only the dash
    // length separates them.
    expect(CONFIDENCE.name_match.strokeDasharray).toBeDefined();
    expect(CONFIDENCE.unresolved.strokeDasharray).toBeDefined();
    expect(CONFIDENCE.name_match.strokeDasharray).not.toBe(CONFIDENCE.unresolved.strokeDasharray);
  });

  it("does not colour unresolved as an error, in either theme", () => {
    // PRD §8: an unresolved call is an honest admission, not a failure.
    // Reading as red would tell the user the opposite.
    //
    // Checked as saturation rather than "is the red channel highest", because
    // a warm neutral legitimately has red as its largest channel while being
    // visibly grey. What disqualifies a colour here is being chromatic AND in
    // the red band, not one or the other.
    for (const mode of MODES) {
      const { saturation, hue } = hsl(confidenceColor(tier("unresolved"), mode));
      const chromatic = saturation > 0.25;
      const inRedBand = hue >= 340 || hue <= 20;
      expect(chromatic && inRedBand, `${mode} draws unresolved as an error colour`).toBe(false);
    }
  });

  it("keeps every tier legible against its own ground", () => {
    // A dotted line the reader cannot see is the same failure as not drawing
    // it. 3:1 is the WCAG floor for a non-text graphical object.
    for (const mode of MODES) {
      for (const tier of RESOLUTION_CONFIDENCE) {
        const ratio = contrast(confidenceColor(tier, mode), PALETTE[mode].surface.DEFAULT);
        expect(ratio, `${tier} on the ${mode} ground is ${ratio.toFixed(2)}:1`).toBeGreaterThan(3);
      }
    }
  });

  it("gives the two themes genuinely different colours", () => {
    // Both palettes resolving to the same hex would mean one of them was never
    // filled in, and the light theme would be an unreadable dark-on-dark.
    for (const tier of RESOLUTION_CONFIDENCE) {
      expect(confidenceColor(tier, "light")).not.toBe(confidenceColor(tier, "dark"));
    }
    expect(PALETTE.light.surface.DEFAULT).not.toBe(PALETTE.dark.surface.DEFAULT);
  });

  it("orders the legend from most certain to least", () => {
    expect(CONFIDENCE_ORDER).toEqual(["exact", "name_match", "unresolved"]);
  });

  it("explains each tier in words, not just in ink", () => {
    // An unexplained dotted line is noise. The legend needs prose per tier.
    for (const t of RESOLUTION_CONFIDENCE) {
      expect(CONFIDENCE[t].meaning.length).toBeGreaterThan(10);
      expect(CONFIDENCE[t].textClass).toMatch(/^text-confidence-/);
    }
  });
});

/** Narrows a literal to the union without repeating the cast at each use. */
function tier(value: (typeof RESOLUTION_CONFIDENCE)[number]) {
  return value;
}

function rgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

function hsl(hex: string): { hue: number; saturation: number } {
  const [r, g, b] = rgb(hex).map((c) => c / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const lightness = (max + min) / 2;

  if (delta === 0) {
    return { hue: 0, saturation: 0 };
  }

  const saturation = delta / (1 - Math.abs(2 * lightness - 1));

  let hue: number;
  if (max === r) {
    hue = 60 * (((g - b) / delta) % 6);
  } else if (max === g) {
    hue = 60 * ((b - r) / delta + 2);
  } else {
    hue = 60 * ((r - g) / delta + 4);
  }

  return { hue: (hue + 360) % 360, saturation };
}

/** WCAG relative luminance. */
function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((c) => {
    const channel = c / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const one = luminance(a);
  const two = luminance(b);
  return (Math.max(one, two) + 0.05) / (Math.min(one, two) + 0.05);
}
