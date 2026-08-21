import { useEffect, useReducer, useRef } from "react";
import type { Node, XYPosition } from "reactflow";
import { useMotionEnabled } from "./motion";
import { GLIDE_MS } from "./constants";

/**
 * Glides nodes to their new positions instead of teleporting them.
 *
 * `buildGraph` re-lays the whole map out whenever anything opens or closes, and
 * React Flow applies the result on the next frame -- so a card that had to move
 * two hundred pixels to make room simply appeared two hundred pixels away. The
 * map was correct and read as static, which is the same complaint from the
 * other side as a canvas that does not grow.
 *
 * The tween runs over the *positions*, not over CSS transforms. A CSS
 * transition on `.react-flow__node` would be one line, but React Flow computes
 * every edge path from the positions in its store: the nodes would slide and
 * their edges would already be drawn at the destination, detached, for the
 * length of the animation.
 *
 * Positions live in a ref and re-render is forced by a counter, deliberately.
 * Holding the animated array in state instead means every render that produces
 * a new (but equal) `nodes` array restarts the tween, which sets state, which
 * renders -- an update loop that React kills mid-frame inside React Flow's own
 * store updater. Here the tween keys on the positions themselves, so an
 * identical array is free.
 */

/** Fast out of the gate, settling at the end -- the graph is being re-spaced,
 *  not thrown. */
const ease = (t: number) => 1 - (1 - t) ** 3;

const positionsOf = <T,>(nodes: Node<T>[]) =>
  nodes.map((node) => `${node.id}@${Math.round(node.position.x)},${Math.round(node.position.y)}`).join("|");

export function useAnimatedNodes<T>(nodes: Node<T>[]): Node<T>[] {
  const animated = useMotionEnabled();
  /** Where each node is *right now*, mid-tween included, so a change that
   *  arrives during an animation carries on from where the eye left it. */
  const at = useRef(new Map<string, XYPosition>());
  /** Read inside the tween without making the array a dependency of it. */
  const latest = useRef(nodes);
  latest.current = nodes;

  const [, redraw] = useReducer((count: number) => count + 1, 0);
  const target = positionsOf(nodes);

  useEffect(() => {
    const settle = () => {
      at.current = new Map(latest.current.map((node) => [node.id, node.position]));
    };

    // `document.hidden`: a background tab gets no animation frames at all, so a
    // tween started there would leave the map on the positions it had when the
    // reader looked away until they came back.
    if (!animated || document.hidden) {
      settle();
      redraw();
      return;
    }

    // A node that has just appeared starts where it belongs. Flying it in from
    // wherever the last node with that id happened to be is motion that means
    // nothing, and the node's own mount animation already covers its arrival.
    // Rebuilt rather than added to, so ids that have left the map go with them.
    const from = new Map(
      latest.current.map((node) => [node.id, at.current.get(node.id) ?? node.position]),
    );
    at.current = from;

    const started = performance.now();
    let raf = 0;

    const step = (now: number) => {
      const progress = Math.min(1, (now - started) / GLIDE_MS);
      const k = ease(progress);

      for (const node of latest.current) {
        const start = from.get(node.id) ?? node.position;
        at.current.set(node.id, {
          x: start.x + (node.position.x - start.x) * k,
          y: start.y + (node.position.y - start.y) * k,
        });
      }
      redraw();

      if (progress < 1) {
        raf = requestAnimationFrame(step);
      }
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, animated]);

  if (!animated) {
    return nodes;
  }

  // Positions from the tween, everything else from the current nodes -- so a
  // card that changed while the map was moving still renders its change.
  return nodes.map((node) => {
    const position = at.current.get(node.id);
    if (position === undefined || (position.x === node.position.x && position.y === node.position.y)) {
      return node;
    }
    return { ...node, position };
  });
}
