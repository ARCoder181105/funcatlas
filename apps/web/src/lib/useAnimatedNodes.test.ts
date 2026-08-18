import { act, renderHook } from "@testing-library/react";
import type { Node } from "reactflow";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAnimatedNodes } from "./useAnimatedNodes";

/**
 * The tween is driven by requestAnimationFrame, so the clock is faked and
 * advanced by hand. Real timers here would mean sleeping for the length of the
 * animation and asserting on whatever frame happened to land.
 */

/**
 * Reduced motion is mocked at this module's own boundary rather than through
 * `matchMedia`: Framer reads the query once, at import, so overriding it inside
 * a test is too late to change the answer.
 */
const motion = vi.hoisted(() => ({ enabled: true }));
vi.mock("./motion", () => ({ useMotionEnabled: () => motion.enabled }));

function node(id: string, x: number, y = 0): Node {
  return { id, position: { x, y }, data: {} };
}

const at = (nodes: Node[], id: string) => nodes.find((candidate) => candidate.id === id)?.position;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useAnimatedNodes", () => {
  it("glides a node to its new position rather than jumping it there", () => {
    const { result, rerender } = renderHook(({ nodes }) => useAnimatedNodes(nodes), {
      initialProps: { nodes: [node("a", 0)] },
    });

    rerender({ nodes: [node("a", 400)] });

    // Part way: on the canvas rather than at either end of the move. This is
    // the whole point -- the map re-spaces itself constantly, and a card that
    // is simply drawn 400px away reads as a static interface.
    act(() => {
      vi.advanceTimersByTime(120);
    });
    const midway = at(result.current, "a")?.x ?? 0;
    expect(midway).toBeGreaterThan(0);
    expect(midway).toBeLessThan(400);

    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(at(result.current, "a")).toEqual({ x: 400, y: 0 });
  });

  it("puts a node that has just appeared where it belongs", () => {
    const { result, rerender } = renderHook(({ nodes }) => useAnimatedNodes(nodes), {
      initialProps: { nodes: [node("a", 0)] },
    });

    rerender({ nodes: [node("a", 0), node("b", 300)] });
    act(() => {
      vi.advanceTimersByTime(16);
    });

    // Flying it in from wherever the layout's origin happens to be is motion
    // that means nothing; the card's own mount animation covers its arrival.
    expect(at(result.current, "b")).toEqual({ x: 300, y: 0 });
  });

  it("carries on from where the eye left it when the map moves mid-glide", () => {
    const { result, rerender } = renderHook(({ nodes }) => useAnimatedNodes(nodes), {
      initialProps: { nodes: [node("a", 0)] },
    });

    rerender({ nodes: [node("a", 400)] });
    act(() => {
      vi.advanceTimersByTime(120);
    });
    const interrupted = at(result.current, "a")?.x ?? 0;

    // A second expansion while the first is still animating. Restarting from
    // the old position would snap the card backwards.
    rerender({ nodes: [node("a", 800)] });
    act(() => {
      vi.advanceTimersByTime(16);
    });
    expect(at(result.current, "a")?.x ?? 0).toBeGreaterThanOrEqual(interrupted);

    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(at(result.current, "a")).toEqual({ x: 800, y: 0 });
  });

  it("does not animate when the reader has asked for less motion", () => {
    motion.enabled = false;

    try {
      const { result, rerender } = renderHook(({ nodes }) => useAnimatedNodes(nodes), {
        initialProps: { nodes: [node("a", 0)] },
      });

      rerender({ nodes: [node("a", 400)] });

      // No frame advanced: the node is already there. A reduced-motion reader
      // gets the final state, not a faster animation.
      expect(at(result.current, "a")).toEqual({ x: 400, y: 0 });
    } finally {
      motion.enabled = true;
    }
  });
});
