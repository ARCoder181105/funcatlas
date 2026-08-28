import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { HERO_EDGES } from "../../lib/hero-graph";
import { HeroGraph } from "./HeroGraph";

function edgePaths(): SVGPathElement[] {
  return Array.from(document.querySelectorAll<SVGPathElement>("g > path"));
}

describe("HeroGraph", () => {
  it("draws the three tiers as three different lines", () => {
    render(<HeroGraph />);

    const paths = edgePaths();
    expect(paths).toHaveLength(HERO_EDGES.length);

    // The regression this exists for: Framer's `pathLength` writes an inline
    // stroke-dasharray, which collapses solid, dashed and dotted into one
    // pattern. The graph still animates, still looks fine, and has stopped
    // saying the only thing it is there to say (PRD §8).
    const patterns = new Set(
      paths.map((path) => path.getAttribute("stroke-dasharray")),
    );
    expect(patterns.size).toBe(3);

    // Solid is the absence of a pattern, not a pattern that looks solid.
    expect(patterns).toContain(null);
  });

  it("describes itself for a reader who cannot see it", () => {
    render(<HeroGraph />);

    const graph = screen.getByRole("img", { name: "A resolved call graph" });
    expect(graph).toHaveAccessibleDescription(/could not be resolved/i);
  });

  it("labels the unresolved callee instead of hiding it", () => {
    render(<HeroGraph />);

    // The map shows its own boundary (UI_GUIDE §3.2). Dropping the ghost node
    // would make the hero claim a completeness the parser never promised.
    expect(screen.getByText("formatError")).toBeInTheDocument();
    expect(screen.getByText("Unresolved")).toBeInTheDocument();
  });
});
