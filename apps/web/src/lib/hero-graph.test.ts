import { describe, expect, it } from "vitest";
import { CONFIDENCE_STYLE } from "@funcatlas/shared";
import { HERO_ALT, HERO_EDGES, HERO_NODES, heroEdgePath, heroNode } from "./hero-graph";

describe("the hero fixture", () => {
  it("names an existing node at both ends of every edge", () => {
    const ids = new Set(HERO_NODES.map((node) => node.id));

    for (const edge of HERO_EDGES) {
      expect(ids).toContain(edge.from);
      expect(ids).toContain(edge.to);
    }
  });

  it("shows all three tiers", () => {
    // The hero exists to teach the scale. Losing a tier to an edit would leave
    // it teaching two thirds of it, and nothing else would fail.
    const tiers = new Set(HERO_EDGES.map((edge) => edge.tier));

    expect(tiers).toEqual(new Set(Object.keys(CONFIDENCE_STYLE)));
  });

  it("puts the one ghost node at the end of the unresolved edge", () => {
    const ghosts = HERO_NODES.filter((node) => node.ghost === true);
    const unresolved = HERO_EDGES.filter((edge) => edge.tier === "unresolved");

    expect(ghosts).toHaveLength(1);
    expect(unresolved.map((edge) => edge.to)).toEqual(ghosts.map((node) => node.id));
  });

  it("draws a callee to the right of its caller", () => {
    // The reveal sweeps left to right and is the only thing staggering the
    // draw, so a callee placed left of its caller would appear before the call
    // that reaches it.
    for (const edge of HERO_EDGES) {
      expect(heroNode(edge.to).depth).toBeGreaterThan(heroNode(edge.from).depth);
    }
  });

  it("describes every tier it draws, for a reader who cannot see it", () => {
    expect(HERO_ALT).toMatch(/exact/i);
    expect(HERO_ALT).toMatch(/name match/i);
    expect(HERO_ALT).toMatch(/resolved/i);
  });
});

describe("heroEdgePath", () => {
  it("runs from the caller's right edge to the callee's left edge", () => {
    const path = heroEdgePath({ from: "handleRequest", to: "parseBody", tier: "exact" });

    // 20 + 132 wide, centred on 162 + 18; target starts at 214, centred on 72.
    expect(path).toBe("M 152 180 C 183 180, 183 72, 214 72");
  });

  it("refuses a node it does not have rather than drawing from NaN", () => {
    expect(() => heroEdgePath({ from: "handleRequest", to: "nope", tier: "exact" })).toThrow(
      /no node nope/,
    );
  });
});
