import type {
  ReachableFunction,
  ResolutionConfidence,
  TraversalResponse,
} from "@funcatlas/shared";
import type { Edge, Node } from "reactflow";

/**
 * Turns the reader's expansions into React Flow nodes and edges.
 *
 * Pure on purpose: this is where `resolution_confidence` stops being a column
 * and becomes the product's central claim (PRD §8), and the failure mode is
 * silent -- a mapper that drops unresolved calls draws a function calling
 * nothing, confidently. That is worth testing without a DOM in the way.
 *
 * Two things about the API's shape drive the design, neither obvious from the
 * response type:
 *
 * 1. `reachable` walks resolved edges only. An unresolved edge points at no
 *    function row, so the recursive CTE cannot return it -- `edges` exists
 *    precisely to surface those.
 * 2. `edges` covers one function's direct calls. That used to cap ghosts at
 *    depth 1; now that the map grows one expansion at a time, each expansion
 *    brings its own, so a ghost appears wherever the call was actually made.
 *
 * Outbound only. "What calls this" was cut from the canvas, and keeping the
 * inbound branch would leave a whole arrow-direction path that nothing can
 * reach and no test can honestly cover. The API still supports `direction`, so
 * bringing it back is a prop and a branch, not a redesign.
 */

/** Layout grid, in flow units. A card is 288px wide; a column narrower than
 *  that overlaps its neighbour at zoom 1. */
export const COLUMN = 300;
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
  /** The function the map was started from -- depth 0, reached by no edge. */
  isRoot: boolean;
  /** Lines the unresolved call was made on. Ghosts only. */
  callLines: number[];

  /**
   * Whether this function's own calls are already drawn.
   *
   * Without it every node looks equally clickable, and the ones that turn out
   * to be leaves do nothing when clicked -- indistinguishable from the canvas
   * being broken. Half the functions in a real repository are leaves.
   */
  expanded: boolean;
  /** Known only once expanded: `true` when opening it drew nothing, because
   *  the function calls nothing the parser could see. */
  isLeaf: boolean;
}

export interface BuiltGraph {
  nodes: Node<GraphNodeData>[];
  edges: Edge[];
  /** How many functions the ceiling dropped. Zero when nothing was cut. */
  truncated: number;
}

export const FILE_CARD_NODE = "fileCard";
export const FUNCTION_NODE = "functionNode";
export const GHOST_NODE = "ghostNode";

/** React Flow needs stable, unique ids. Prefixed so a ghost built from a name
 *  can never collide with a function built from an id. */
const functionId = (id: number) => `fn-${id}`;
const ghostId = (name: string) => `ghost-${name}`;

/**
 * Merges every expansion the reader has opened into one map.
 *
 * The map grows by clicking rather than by asking for a depth up front, so
 * this takes a list: one response per expanded function, each covering that
 * function's direct calls. Nothing is ever removed, which is the whole point
 * -- the reader is building a path and the ancestors are the path.
 *
 * A useful consequence: because every expansion brings its own `edges`, a
 * ghost can appear anywhere the reader has opened, not only beside the root.
 * With a single fixed-depth traversal, unresolved calls past depth 1 were
 * invisible.
 */
export function buildGraph(
  responses: TraversalResponse[],
  rootIds: number[] = [],
  collapsedIds: number[] = [],
): BuiltGraph {
  // Roots are passed in rather than read off `responses[0]`. Expansions arrive
  // as their queries resolve and the pending ones are filtered out, so the
  // first element is whichever came back first, not what the reader opened --
  // measuring from the wrong one prunes the map to a subtree, silently.
  const roots = rootIds.length > 0 ? rootIds : responses.slice(0, 1).map((r) => r.functionId);
  if (roots.length === 0) {
    return { nodes: [], edges: [], truncated: 0 };
  }

  const collapsed = new Set(collapsedIds);
  // What the reader has already opened, and which of those turned out to call
  // nothing. Both ride on the node so it can say whether clicking does
  // anything at all.
  const expandedIds = new Set(responses.map((response) => response.functionId));
  const leafIds = new Set(
    responses
      .filter((response) => response.reachable.length <= 1 && response.edges.length === 0)
      .map((response) => response.functionId),
  );

  // Keyed by id across every response: expansions overlap constantly -- the
  // function you just opened was already on screen as somebody's callee -- and
  // a cycle can return the same function from two directions.
  const byId = new Map<number, ReachableFunction>();
  for (const response of responses) {
    for (const fn of response.reachable) {
      if (!byId.has(fn.id)) {
        byId.set(fn.id, fn);
      }
    }
  }

  // Edges first: depth is measured along them, so it cannot be read off the
  // per-response `depth`, which is only ever 0 or 1 and is relative to
  // whichever function that response expanded.
  const linked = new Map<string, LinkedEdge>();
  for (const response of responses) {
    for (const fn of response.reachable) {
      if (fn.viaFunctionId === null || fn.confidence === null) {
        continue;
      }
      const key = `${fn.viaFunctionId}->${fn.id}`;
      if (!linked.has(key)) {
        linked.set(key, { from: fn.viaFunctionId, to: fn.id, confidence: fn.confidence });
      }
    }
  }

  const depths = depthsFrom(roots, linked.values(), collapsed);

  // Only what still hangs off the anchor. Closing a function in the middle of
  // the map leaves the ones it had opened with nothing above them, and every
  // expansion contributes its own function at depth 0 -- without this they
  // would float, disconnected, as if they were roots of their own.
  const unique = [...byId.values()]
    .filter((fn) => depths.has(fn.id))
    .sort((a, b) => (depths.get(a.id) ?? 0) - (depths.get(b.id) ?? 0) || a.id - b.id);
  const kept = unique.slice(0, NODE_CEILING);
  const truncated = unique.length - kept.length;
  const keptIds = new Set(kept.map((fn) => fn.id));

  // One ghost group per expanded function, so an unresolved call hangs off the
  // function that actually made it.
  const ghostGroups = responses
    .filter((response) => depths.has(response.functionId) && !collapsed.has(response.functionId))
    .map((response) => ({
      callerId: response.functionId,
      ghosts: collectGhosts(response.edges),
    }));

  // One layout pass over functions and ghosts together. Two passes centred
  // each set on the same axis independently, so a ghost and a function in the
  // same column were placed on top of each other.
  const nodes = layOut([
    ...kept.map((fn) =>
      toFunctionNode(fn, depths.get(fn.id) ?? 0, expandedIds.has(fn.id), leafIds.has(fn.id)),
    ),
    ...ghostGroups.flatMap(({ callerId, ghosts }) =>
      ghosts.map((ghost) => toGhostNode(ghost, (depths.get(callerId) ?? 0) + 1)),
    ),
  ]);

  return {
    nodes,
    edges: [
      ...functionEdges([...linked.values()], keptIds, depths),
      ...ghostGroups.flatMap(({ callerId, ghosts }) =>
        keptIds.has(callerId)
          ? ghostEdges(callerId, ghosts, (depths.get(callerId) ?? 0) + 1)
          : [],
      ),
    ],
    truncated,
  };
}

interface LinkedEdge {
  from: number;
  to: number;
  confidence: ResolutionConfidence;
}

/**
 * How far each function sits from the root, measured along the edges actually
 * drawn.
 *
 * Breadth-first, so a function reached by two paths lands in the shallower
 * column -- otherwise the layout would jump every time the reader expanded a
 * longer route to something already on screen.
 */
function depthsFrom(
  rootIds: number[],
  edges: Iterable<LinkedEdge>,
  collapsed: Set<number>,
): Map<number, number> {
  const next = new Map<number, number[]>();
  for (const edge of edges) {
    next.set(edge.from, [...(next.get(edge.from) ?? []), edge.to]);
  }

  // Several roots: the reader can open two functions out of one file and
  // explore both. Each starts its own branch at depth 0.
  const depths = new Map<number, number>(rootIds.map((id) => [id, 0]));
  const queue = [...rootIds];

  while (queue.length > 0) {
    const current = queue.shift() as number;
    const depth = depths.get(current) ?? 0;

    // A collapsed function is still drawn -- there has to be something to
    // click to reopen it -- but the walk stops there, so nothing below it
    // appears. Its subtree stays in the response list, which is what makes
    // reopening restore the whole thing rather than one generation.
    if (collapsed.has(current)) {
      continue;
    }

    for (const child of next.get(current) ?? []) {
      if (!depths.has(child)) {
        depths.set(child, depth + 1);
        queue.push(child);
      }
    }
  }

  return depths;
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

function toFunctionNode(
  fn: ReachableFunction,
  depth: number,
  expanded: boolean,
  isLeaf: boolean,
): Node<GraphNodeData> {
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
      depth,
      // Depth measured from the root of the whole map, not the per-response
      // flag: a function is the start of its own expansion while being a
      // callee three columns in.
      isRoot: depth === 0,
      callLines: [],
      expanded,
      isLeaf,
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
      // A ghost is a name, not a function: there is nothing to open.
      expanded: false,
      isLeaf: true,
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
  linked: LinkedEdge[],
  keptIds: Set<number>,
  depths: Map<number, number>,
): Edge[] {
  const edges: Edge[] = [];

  for (const edge of linked) {
    // The ceiling may have cut either end, which would leave an edge pointing
    // at a node that is not on the canvas.
    if (!keptIds.has(edge.from) || !keptIds.has(edge.to)) {
      continue;
    }

    edges.push(
      confidenceEdge(
        `e-${edge.from}-${edge.to}`,
        functionId(edge.from),
        functionId(edge.to),
        edge.confidence,
        depths.get(edge.to) ?? 0,
      ),
    );
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
