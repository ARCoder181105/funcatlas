import type {
  ReachableFunction,
  ResolutionConfidence,
  TraversalDirection,
  TraversalResponse,
} from "@funcatlas/shared";
import type { Edge, Node } from "reactflow";

/**
 * Turns one traversal response into React Flow nodes and edges.
 *
 * Pure on purpose: this is where `resolution_confidence` stops being a column
 * and becomes the product's central claim (PRD §8), and the failure mode is
 * silent -- a mapper that drops unresolved calls draws a function calling
 * nothing, confidently. That is worth testing without a DOM in the way.
 *
 * Three things about the API's shape drive the design here, and none of them
 * is obvious from the response type:
 *
 * 1. `reachable` walks resolved edges only. An unresolved edge points at no
 *    function row, so the recursive CTE cannot return it -- `edges` exists
 *    precisely to surface those.
 * 2. `edges` is the *start function's* direct calls, nothing deeper. So a
 *    ghost can only ever appear at depth 1. Unresolved calls further out are
 *    invisible, and `GHOST_HORIZON` below says so in the interface rather
 *    than letting the map imply the boundary is complete.
 * 3. `edges` is always outgoing (`caller_function_id = fnId`) regardless of
 *    `direction`. On an inbound traversal those calls belong to a different
 *    graph entirely, so ghosts are rendered for `out` only.
 */

/** Layout grid, in flow units. A card is 288px wide; a column narrower than
 *  that overlaps its neighbour at zoom 1. */
const COLUMN = 300;
const ROW = 92;

/**
 * Declared, not measured.
 *
 * React Flow will not draw an edge until both of its nodes have dimensions in
 * its store, and it fills those in from a ResizeObserver after layout. When
 * that measurement does not arrive the nodes still render and the edges
 * silently do not -- a graph that looks like a set of functions calling
 * nothing, which is the one thing this canvas must never show.
 *
 * These nodes are a fixed size by design, so the size is stated up front and
 * the layout stops depending on the environment measuring anything. The node
 * components below are pinned to the same numbers.
 */
export const NODE_WIDTH = 208;
export const NODE_HEIGHT = 44;

/**
 * Above this the tab stops being usable before the graph stops being drawn.
 * Truncation is reported rather than silent -- a map that quietly stops early
 * is the same lie as one that hides an unresolved call.
 */
export const NODE_CEILING = 2000;

export type GraphNodeKind = "function" | "ghost";

export interface GraphNodeData {
  kind: GraphNodeKind;
  /** What the node is called: a function name, or the name the parser saw. */
  label: string;
  /** Null on a ghost, which is a name rather than a function -- selecting one
   *  would ask the API for a row that does not exist. */
  functionId: number | null;
  /** Absent on a ghost -- there is no definition to qualify. */
  qualifiedName: string | null;
  fileId: number | null;
  depth: number;
  /** The start of the traversal. Reached by no edge, so it has no confidence. */
  isRoot: boolean;
  /** Lines the unresolved call was made on. Ghosts only. */
  callLines: number[];
}

export interface BuiltGraph {
  nodes: Node<GraphNodeData>[];
  edges: Edge[];
  /** How many functions the ceiling dropped. Zero when nothing was cut. */
  truncated: number;
  /** True when ghosts are meaningful for this direction -- see note 3 above. */
  showsGhosts: boolean;
}

export const FUNCTION_NODE = "functionNode";
export const GHOST_NODE = "ghostNode";

/** React Flow needs stable, unique ids. Prefixed so a ghost built from a name
 *  can never collide with a function built from an id. */
const functionId = (id: number) => `fn-${id}`;
const ghostId = (name: string) => `ghost-${name}`;

export function buildGraph(response: TraversalResponse): BuiltGraph {
  const { reachable, edges, direction } = response;

  // The CTE returns each function once even through a cycle -- mutual
  // recursion is normal in real code -- but keying by id here means a future
  // change to that query cannot quietly produce a duplicate node.
  const byId = new Map<number, ReachableFunction>();
  for (const fn of reachable) {
    if (!byId.has(fn.id)) {
      byId.set(fn.id, fn);
    }
  }

  const unique = [...byId.values()].sort(compareReachable);
  const kept = unique.slice(0, NODE_CEILING);
  const truncated = unique.length - kept.length;
  const keptIds = new Set(kept.map((fn) => fn.id));

  const ghosts = direction === "out" ? collectGhosts(edges) : [];
  const deepestKept = kept.reduce((max, fn) => Math.max(max, fn.depth), 0);

  const nodes: Node<GraphNodeData>[] = [
    ...layOut(kept.map(toFunctionNode)),
    // Ghosts sit one column past the last resolved layer: the map's own
    // boundary, drawn where a chart puts uncharted water.
    ...layOut(ghosts.map((ghost) => toGhostNode(ghost, deepestKept + 1))),
  ];

  return {
    nodes,
    edges: [
      ...functionEdges(kept, keptIds, direction),
      ...ghostEdges(response.functionId, ghosts, deepestKept + 1),
    ],
    truncated,
    showsGhosts: direction === "out",
  };
}

/** Shallowest first, then by id, so layout is stable across refetches. */
function compareReachable(a: ReachableFunction, b: ReachableFunction): number {
  return a.depth === b.depth ? a.id - b.id : a.depth - b.depth;
}

interface Ghost {
  name: string;
  callLines: number[];
}

/**
 * One ghost per distinct callee name, not one per call site.
 *
 * The deliberate decision B5 asks for. A ghost is not a claim about a
 * function -- it is *the name the parser saw*, and two calls to `logger.debug`
 * saw one name. Splitting them would draw two identical unknowns and imply we
 * know they differ; merging draws one boundary marker and lets the call lines
 * on it say there were two sites. Neither asserts they resolve to the same
 * definition, because nothing here knows that.
 */
function collectGhosts(edges: TraversalResponse["edges"]): Ghost[] {
  const byName = new Map<string, Ghost>();

  for (const edge of edges) {
    // The schema pairs these: unresolved exactly when there is no callee row
    // (migration 0002). Checking the id rather than the tier means a future
    // tier that also lacks a callee still lands here instead of vanishing.
    if (edge.calleeFunctionId !== null) {
      continue;
    }

    const existing = byName.get(edge.calleeName);
    if (existing === undefined) {
      byName.set(edge.calleeName, {
        name: edge.calleeName,
        callLines: edge.callLine === null ? [] : [edge.callLine],
      });
      continue;
    }

    if (edge.callLine !== null) {
      existing.callLines.push(edge.callLine);
    }
  }

  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function toFunctionNode(fn: ReachableFunction): Node<GraphNodeData> {
  return {
    id: functionId(fn.id),
    type: FUNCTION_NODE,
    position: { x: 0, y: 0 },
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
    data: {
      kind: "function",
      label: fn.name,
      functionId: fn.id,
      qualifiedName: fn.qualifiedName,
      fileId: fn.fileId,
      depth: fn.depth,
      // The start is reached by no edge at all: `confidence` and
      // `viaFunctionId` are both null on it. That makes it a node without an
      // inbound edge, not an unresolved one.
      isRoot: fn.viaFunctionId === null,
      callLines: [],
    },
  };
}

function toGhostNode(ghost: Ghost, depth: number): Node<GraphNodeData> {
  return {
    id: ghostId(ghost.name),
    type: GHOST_NODE,
    position: { x: 0, y: 0 },
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
    data: {
      kind: "ghost",
      label: ghost.name,
      functionId: null,
      qualifiedName: null,
      fileId: null,
      depth,
      isRoot: false,
      callLines: [...ghost.callLines].sort((a, b) => a - b),
    },
  };
}

/**
 * Layered: depth on one axis, index within depth on the other.
 *
 * No layout library. A layered tree needs a column index and a row index, and
 * pulling in dagre to compute two integers is a dependency that has to be
 * maintained for the life of the project.
 */
function layOut(nodes: Node<GraphNodeData>[]): Node<GraphNodeData>[] {
  const byDepth = new Map<number, Node<GraphNodeData>[]>();
  for (const node of nodes) {
    const layer = byDepth.get(node.data.depth) ?? [];
    layer.push(node);
    byDepth.set(node.data.depth, layer);
  }

  for (const [depth, layer] of byDepth) {
    // Centred on the axis, so a wide layer does not push the graph off to one
    // side of everything above it.
    const offset = ((layer.length - 1) * ROW) / 2;
    layer.forEach((node, index) => {
      node.position = { x: depth * COLUMN, y: index * ROW - offset };
    });
  }

  return nodes;
}

/**
 * One edge per reached function, from the function it was reached through.
 *
 * `reachable` and `edges` overlap -- a resolved direct call appears in both --
 * so edges are built from `reachable` alone and `edges` contributes only the
 * unresolved ones. Building from both would draw every depth-1 call twice.
 */
function functionEdges(
  reachable: ReachableFunction[],
  keptIds: Set<number>,
  direction: TraversalDirection,
): Edge[] {
  const edges: Edge[] = [];

  for (const fn of reachable) {
    if (fn.viaFunctionId === null || fn.confidence === null) {
      continue;
    }
    // The ceiling may have cut the function this one was reached through,
    // which would leave an edge pointing at a node that is not on the canvas.
    if (!keptIds.has(fn.viaFunctionId)) {
      continue;
    }

    // An inbound traversal walks callers, so the function that was *reached*
    // is the caller and the one it was reached through is the callee. Drawing
    // the arrow the same way in both directions would point every inbound
    // edge backwards.
    const [source, target] =
      direction === "out"
        ? [functionId(fn.viaFunctionId), functionId(fn.id)]
        : [functionId(fn.id), functionId(fn.viaFunctionId)];

    edges.push(confidenceEdge(`e-${fn.viaFunctionId}-${fn.id}`, source, target, fn.confidence, fn.depth));
  }

  return edges;
}

/** One edge per ghost, matching one ghost per name. The call sites are on the
 *  node; two overlapping edges between the same pair would say nothing extra. */
function ghostEdges(rootId: number, ghosts: Ghost[], depth: number): Edge[] {
  return ghosts.map((ghost) =>
    confidenceEdge(
      `e-${rootId}-${ghostId(ghost.name)}`,
      functionId(rootId),
      ghostId(ghost.name),
      "unresolved",
      depth,
    ),
  );
}

/**
 * The style is not chosen here. `data.confidence` is carried to the edge
 * component, which reads `lib/confidence.ts` -- which in turn reads
 * `CONFIDENCE_STYLE` from `packages/shared`. Re-declaring the mapping at any
 * of those layers is how the canvas and the schema start disagreeing.
 *
 * `depth` rides along so the draw-in can be staggered by layer, like a route
 * being plotted outward rather than every line appearing at once.
 */
function confidenceEdge(
  id: string,
  source: string,
  target: string,
  confidence: ResolutionConfidence,
  depth: number,
): Edge {
  return {
    id,
    source,
    target,
    type: "confidence",
    data: { confidence, depth },
  };
}
