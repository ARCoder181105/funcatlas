import { describe, expect, it } from "vitest";
import { CONFIDENCE_STYLE, RESOLUTION_CONFIDENCE } from "@funcatlas/shared";
import { CONFIDENCE, CONFIDENCE_ORDER } from "./confidence";
import { COLOR } from "./tokens";

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

  it("draws each tier differently", () => {
    const styles = RESOLUTION_CONFIDENCE.map((tier) => CONFIDENCE[tier].style);
    const colors = RESOLUTION_CONFIDENCE.map((tier) => CONFIDENCE[tier].color);
    const labels = RESOLUTION_CONFIDENCE.map((tier) => CONFIDENCE[tier].label);

    // Three tiers that render identically would collapse the whole promise in
    // PRD §8 -- a guess would be indistinguishable from a fact.
    expect(new Set(styles).size).toBe(RESOLUTION_CONFIDENCE.length);
    expect(new Set(colors).size).toBe(RESOLUTION_CONFIDENCE.length);
    expect(new Set(labels).size).toBe(RESOLUTION_CONFIDENCE.length);
  });

  it("gives solid no dash pattern and the other two different ones", () => {
    expect(CONFIDENCE.exact.strokeDasharray).toBeUndefined();
    // SVG has no `dotted` keyword; both are dasharrays and only the dash
    // length separates them.
    expect(CONFIDENCE.name_match.strokeDasharray).toBeDefined();
    expect(CONFIDENCE.unresolved.strokeDasharray).toBeDefined();
    expect(CONFIDENCE.name_match.strokeDasharray).not.toBe(CONFIDENCE.unresolved.strokeDasharray);
  });

  it("does not colour unresolved as an error", () => {
    // PRD §8: an unresolved call is an honest admission, not a failure.
    // Reading as red would tell the user the opposite.
    expect(CONFIDENCE.unresolved.color).toBe(COLOR.confidence.unresolved);
    expect(CONFIDENCE.unresolved.color).not.toBe(COLOR.confidence.exact);

    const [red, green, blue] = hexToRgb(CONFIDENCE.unresolved.color);
    expect(red).toBeLessThan(Math.max(green, blue));
  });

  it("orders the legend from most certain to least", () => {
    expect(CONFIDENCE_ORDER).toEqual(["exact", "name_match", "unresolved"]);
  });

  it("explains each tier in words, not just in ink", () => {
    // An unexplained dotted line is noise. The legend needs prose per tier.
    for (const tier of RESOLUTION_CONFIDENCE) {
      expect(CONFIDENCE[tier].meaning.length).toBeGreaterThan(10);
      expect(CONFIDENCE[tier].textClass).toMatch(/^text-confidence-/);
    }
  });
});

function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}
