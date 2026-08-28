import type { ResolutionConfidence } from "@funcatlas/shared";

/**
 * The graph the landing page draws, and the geometry it is drawn with.
 *
 * A fixture, not a screenshot and not a fetch: the landing page talks to no
 * API (see `App.tsx`). It is still a real drawing -- the same three edge
 * styles, the same rule that ambiguity resolves to `unresolved`, and the ghost
 * node from `docs/UI_GUIDE.md` §3.2 marking the edge of what was charted.
 *
 * The shape is a request handler, because that is the code a reader already
 * has a mental model of. Every tier here is one a real repository produces:
 * `logger.info` is a name match because more than one `info` is in scope, and
 * `formatError` is unresolved because it arrives through a barrel re-export,
 * which `docs/PARSING_STRATEGY.md` lists as a limit we do not guess past.
 *
 * Data and coordinates live here rather than in the component so the component
 * is markup and this is testable.
 */

export interface HeroNode {
  id: string;
  label: string;
  /** Column index. Also the stagger index: the graph draws outward, so a
   *  node's depth is when it appears. */
  depth: number;
  /** Top-left, in viewBox units. */
  x: number;
  y: number;
  /**
   * A callee the resolver could not reach -- drawn at the map's edge, dotted
   * and faded, labelled with the name the parser actually saw. Not an error
   * and not hidden: the map showing its own boundary (UI_GUIDE §3.2).
   */
  ghost?: boolean;
}

export interface HeroEdge {
  from: string;
  to: string;
  tier: ResolutionConfidence;
}

/** Wide rather than tall: the hero sits beside the headline, and the graph
 *  reads left to right because that is the direction calls run. */
export const HERO_VIEWBOX = { width: 560, height: 360 } as const;

/** One size for every node. Measured off `handleRequest` at mono 12px, which
 *  is the longest label here; a card narrower than its own name is the bug
 *  `graph-constants.ts` exists to avoid on the canvas. */
export const HERO_NODE = { width: 132, height: 36, radius: 8 } as const;

const COLUMN = [20, 214, 408] as const;

export const HERO_NODES: HeroNode[] = [
  { id: "handleRequest", label: "handleRequest", depth: 0, x: COLUMN[0], y: 162 },
  { id: "parseBody", label: "parseBody", depth: 1, x: COLUMN[1], y: 54 },
  { id: "validate", label: "validate", depth: 1, x: COLUMN[1], y: 162 },
  { id: "loggerInfo", label: "logger.info", depth: 1, x: COLUMN[1], y: 270 },
  { id: "readStream", label: "readStream", depth: 2, x: COLUMN[2], y: 54 },
  { id: "formatError", label: "formatError", depth: 2, x: COLUMN[2], y: 222, ghost: true },
];

export const HERO_EDGES: HeroEdge[] = [
  { from: "handleRequest", to: "parseBody", tier: "exact" },
  { from: "handleRequest", to: "validate", tier: "exact" },
  { from: "parseBody", to: "readStream", tier: "exact" },
  { from: "handleRequest", to: "loggerInfo", tier: "name_match" },
  { from: "validate", to: "formatError", tier: "unresolved" },
];

/** What the graph says, for anyone who cannot see it. The tiers are named
 *  because they are the point, not the decoration. */
export const HERO_ALT =
  "A call graph of a request handler. handleRequest calls parseBody and validate as exact " +
  "matches, and logger.info as a name match. validate calls formatError, which could not be " +
  "resolved and is drawn at the edge of the map.";

const byId = new Map(HERO_NODES.map((node) => [node.id, node]));

export function heroNode(id: string): HeroNode {
  const node = byId.get(id);
  if (node === undefined) throw new Error(`hero graph has no node ${id}`);
  return node;
}

/**
 * A cubic from the right edge of the caller to the left edge of the callee,
 * with both control points on the horizontal midline. The same shape React
 * Flow's bezier edge draws, so the hero and the canvas agree about what a call
 * looks like.
 */
export function heroEdgePath(edge: HeroEdge): string {
  const from = heroNode(edge.from);
  const to = heroNode(edge.to);

  const x1 = from.x + HERO_NODE.width;
  const y1 = from.y + HERO_NODE.height / 2;
  const x2 = to.x;
  const y2 = to.y + HERO_NODE.height / 2;
  const mid = x1 + (x2 - x1) / 2;

  return `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`;
}
