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

/**
 * Declared, not measured.
 *
 * React Flow will not draw an edge until both of its nodes have dimensions in
 * its store, and it fills those in from a ResizeObserver after layout. When
 * that measurement does not arrive the nodes still render and the edges
 * silently do not -- a graph that looks like a set of functions calling
 * nothing, which is the one thing this canvas must never show.
 *
 * So every node states its size here and the components are pinned to the same
 * numbers. A card that opens its source is a different size, not an unknown
 * one: the layout below reads these and spaces the graph accordingly, which is
 * what keeps an opened card from landing on its neighbours.
 */
export const NODE_WIDTH = 208;
export const NODE_HEIGHT = 44;

/**
 * A closed card is as wide as its name, within reason.
 *
 * At a fixed 208px every card was the width of the longest name anyone might
 * have, and `Ky.prototype.parseJsonWithSchema` was truncated to nothing on the
 * same canvas as `get`. Names are what the reader navigates by, so the card is
 * measured from the name and the graph is spaced around the result.
 */
export const NODE_MIN_WIDTH = 176;

/**
 * Mono at 12px for the name, 10px for the qualified name under it, and then
 * everything that shares the row with them: the chevron, the code button, the
 * padding and the gaps -- plus the "start" badge on a branch root, which is
 * what was squeezing `cloneRetryOptions` down to `cloneRet...` on a card
 * supposedly measured to fit it.
 *
 * 7.2px a character, measured off a rendered name rather than off the code
 * block: the block came out at 6.6 and using that here left every long name a
 * few pixels short of its row, which the row then wrapped.
 */
const LABEL_CHAR = 7.2;
const SUBLABEL_CHAR = 5.5;
const CARD_CHROME = 118;
const ROOT_BADGE = 50;

export function functionCardWidth(
  label: string,
  qualifiedName: string | null,
  isRoot = false,
): number {
  const sublabel = qualifiedName !== null && qualifiedName !== label ? qualifiedName.length : 0;
  const text = Math.max(label.length * LABEL_CHAR, sublabel * SUBLABEL_CHAR);
  const chrome = CARD_CHROME + (isRoot ? ROOT_BADGE : 0);

  // No ceiling. A name is what the reader navigates by, and a card that caps
  // its width just moves the truncation somewhere less obvious.
  return Math.max(text + chrome, NODE_MIN_WIDTH);
}

/**
 * A card showing its source, sized to the source it is showing.
 *
 * A fixed box made every function the same shape as the worst one: a
 * three-line helper got a scrollbar's worth of empty space and a wide function
 * got clipped at 420px with the ends of its lines out of reach. The card is
 * measured from the text instead -- longest line for the width, line count for
 * the height -- with a floor so a one-line function is still readable, and no
 * ceiling, because a ceiling is only ever reached by hiding something.
 *
 * These are the defaults, used until the source has arrived.
 */
export const CODE_WIDTH = 460;
export const CODE_HEIGHT = 260;

export const CODE_MIN_WIDTH = 320;
export const CODE_MIN_HEIGHT = 140;

/**
 * How many lines a card shows before offering the rest.
 *
 * Same rule as the file card: nothing inside a node scrolls, because the wheel
 * over this canvas zooms the map. A long function is shown a screenful at a
 * time and grows when asked.
 */
export const CODE_PREVIEW_LINES = 24;

/**
 * Measured off the rendered block rather than guessed: JetBrains Mono at 12px
 * comes out at 6.6px a character, the 4ch gutter and its margin at 48, and the
 * card's padding and header at 26 and 33.
 *
 * They are estimates of a real measurement, which is the trade §4 makes on
 * purpose -- the alternative is measuring the card after it renders, and a
 * layout that depends on measurement is the one that leaves edges undrawn.
 */
const CHAR_WIDTH = 6.6;
const LINE_HEIGHT = 19.5;
const GUTTER = 48;
const PADDING = 26;
const HEADER = 33;

/**
 * Room around the code, not just room for it.
 *
 * A card cut to exactly the text is a box the code is wedged into: the last
 * character sits on the border and every line ends at the edge. The reader
 * asked for a two-by-two block of source to get a three-by-three card, so the
 * measurement is scaled and then given a fixed margin on top -- the scale is
 * what makes a small function feel unhurried, the margin is what stops a wide
 * one losing its last few characters to rounding.
 */
const roomy = (needed: number) => needed * 1.15 + 24;

/** The box a card needs to show this source without scrolling. */
export function codeCardSize(
  source: string | null | undefined,
  showAll = false,
): { width: number; height: number } {
  if (source === null || source === undefined || source === "") {
    return { width: CODE_WIDTH, height: CODE_HEIGHT };
  }

  const lines = source.split("\n");
  // Tabs are what TypeScript in the wild is actually indented with, and one
  // counts as far more than one character on screen.
  const longest = Math.max(...lines.map((line) => line.replace(/\t/g, "  ").length));
  const shown = showAll ? lines.length : Math.min(lines.length, CODE_PREVIEW_LINES);
  const more = lines.length > shown ? MORE_ROW : 0;

  return {
    // No ceiling here either: a line the card cannot show is a line the reader
    // came to read.
    width: Math.max(roomy(longest * CHAR_WIDTH + GUTTER + PADDING), CODE_MIN_WIDTH),
    // No ceiling once the reader has asked for the whole thing. That ceiling is
    // what the scrollbar used to hide behind.
    height: Math.max(roomy(shown * LINE_HEIGHT + HEADER + PADDING) + more, CODE_MIN_HEIGHT),
  };
}

/** Clear space between cards, whatever their size. */
const GAP_X = 92;
const GAP_Y = 48;

/**
 * The file card is measured like every other card.
 *
 * It shipped at a fixed 288x(whatever fits), with its list of functions inside
 * a 256px scroll area -- so a file with a dozen functions hid most of them
 * behind a scrollbar, and a long name like
 * `cloneSearchParametersForInitHook` wrapped onto a second line inside a row
 * built for one. It grows in both directions instead, and the layout places it
 * against its own width so a wide card cannot reach the first column.
 */
export const FILE_CARD_MIN_WIDTH = 288;

/**
 * How many functions a card shows before offering the rest.
 *
 * Nothing on this canvas scrolls except the canvas. A scroll region inside a
 * node competes with the wheel that zooms the map -- the reader's gesture means
 * two things depending on where the pointer happens to be, which is the kind of
 * ambiguity that makes an interface feel broken rather than dense. So a card
 * that cannot show everything says how much is left and grows when asked.
 */
export const FILE_PREVIEW_ROWS = 10;

/**
 * Measured off the rendered card rather than estimated, because the difference
 * showed up as content overflowing a box that was supposed to fit it: a row is
 * 38px with an 8px gap under it, the line-number badge and chevron beside a
 * name take 92, the header is 56 plus a line of path, the list and the card
 * between them add 38 of padding, and the "show the rest" row is 38.
 */
const ROW_HEIGHT = 46;
const ROW_CHROME = 92;
const FILE_HEADER = 56;
const PATH_LINE = 17;
const LIST_PADDING = 38;
const MORE_ROW = 38;

/**
 * Wide enough for the longest name, tall enough for every row it is showing.
 *
 * Neither axis is capped. The card is exactly as wide as its longest name and
 * exactly as tall as the rows it is drawing, because every cap is a place where
 * content gets clipped, wrapped or hidden behind a scrollbar instead.
 */
export function fileCardSize(
  names: string[],
  path: string,
  showAll = false,
): { width: number; height: number } {
  const longest = names.reduce((widest, name) => Math.max(widest, name.length), 0);
  const width = Math.max(longest * LABEL_CHAR + ROW_CHROME, FILE_CARD_MIN_WIDTH);

  // The path wraps rather than truncating -- it is an identifier and the tail
  // is what disambiguates it -- so a long one makes the header taller.
  const pathLines = Math.max(1, Math.ceil((path.length * LABEL_CHAR) / (width - 72)));
  const rows = showAll ? names.length : Math.min(names.length, FILE_PREVIEW_ROWS);
  const more = names.length > rows ? MORE_ROW : 0;

  return {
    width,
    height:
      FILE_HEADER + pathLines * PATH_LINE + Math.max(rows, 1) * ROW_HEIGHT + LIST_PADDING + more,
  };
}

/** Where the file card sits: its own width clear of the first column, so
 *  widening it moves it left rather than into the graph. */
export function fileCardPosition(width: number): { x: number; y: number } {
  return { x: -(width + GAP_X), y: -40 };
}

/** One column of the old fixed grid. The file card is placed against this
 *  rather than against a measured layer. */
export const COLUMN = NODE_WIDTH + GAP_X;

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

  /** Whether the card is showing the function's source. Drives the node's own
   *  size, which is what the layout spaces around. */
  showCode: boolean;

  /** Whether that source is every line or the first `CODE_PREVIEW_LINES` of
   *  them. Nothing scrolls here; the card grows instead. */
  showAllSource: boolean;

  /** The box the layout reserved for this card. The component renders itself at
   *  exactly this size -- two places deciding it is how cards start
   *  overlapping. */
  size: { width: number; height: number };
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
  codeIds: number[] = [],
  /** Source by function id, for the cards showing it. Absent until the request
   *  lands, which is what `CODE_WIDTH`/`CODE_HEIGHT` are the default for. */
  sources: Map<number, string | null> = new Map(),
  /** Cards showing every line rather than the first screenful. */
  fullSourceIds: number[] = [],
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
  const showingCode = new Set(codeIds);
  const showingAll = new Set(fullSourceIds);
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

  // A closed branch leaves the canvas entirely.
  //
  // Deeper in the map a collapsed card has to stay -- its own chevron is the
  // only way back -- but a branch root is opened and closed from its row on the
  // file card, so leaving the card behind means clicking "close" and watching
  // the card stay put. Nothing is forgotten: the row still reopens the whole
  // structure from `expandedFunctionIds` and the query cache.
  const depths = depthsFrom(
    roots.filter((id) => !collapsed.has(id)),
    linked.values(),
    collapsed,
  );

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
      toFunctionNode(
        fn,
        depths.get(fn.id) ?? 0,
        expandedIds.has(fn.id),
        leafIds.has(fn.id),
        showingCode.has(fn.id),
        sources.get(fn.id),
        showingAll.has(fn.id),
      ),
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
  showCode: boolean,
  source: string | null | undefined,
  showAllSource: boolean,
): Node<GraphNodeData> {
  const code = codeCardSize(source, showAllSource);
  const size = showCode
    ? { width: code.width, height: NODE_HEIGHT + code.height }
    : { width: functionCardWidth(fn.name, fn.qualifiedName, depth === 0), height: NODE_HEIGHT };

  return {
    id: functionId(fn.id),
    type: FUNCTION_NODE,
    position: { x: 0, y: 0 },
    width: size.width,
    height: size.height,
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
      showCode,
      showAllSource,
      size,
    },
  };
}

function toGhostNode(ghost: Ghost, depth: number): Node<GraphNodeData> {
  // Measured like a function card, so the name the parser saw is readable
  // rather than truncated -- on a ghost the name is the only thing there is.
  const width = functionCardWidth(ghost.name, null);

  return {
    id: ghostId(ghost.name),
    type: GHOST_NODE,
    position: { x: 0, y: 0 },
    width,
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
      // A ghost is a name, not a function: there is nothing to open and no
      // source to read.
      expanded: false,
      isLeaf: true,
      showCode: false,
      showAllSource: false,
      size: { width, height: NODE_HEIGHT },
    },
  };
}

/**
 * Layered: depth on one axis, order within the layer on the other -- and every
 * step measured from the cards themselves.
 *
 * A fixed grid was enough while every card was the same size. It stopped being
 * enough the moment a card could open its source: one 420x324 card in a
 * 300-wide column lands on both its neighbour and the column beside it. Column
 * positions are therefore the running total of the widest card in each layer,
 * and rows the running total of the heights above them, so opening a card
 * pushes the graph apart instead of overlapping it.
 *
 * Still no layout library. This is two running sums; pulling in dagre to
 * compute them is a dependency to maintain for the life of the project.
 */
function layOut(nodes: Node<GraphNodeData>[]): Node<GraphNodeData>[] {
  const byDepth = new Map<number, Node<GraphNodeData>[]>();
  for (const node of nodes) {
    const layer = byDepth.get(node.data.depth) ?? [];
    layer.push(node);
    byDepth.set(node.data.depth, layer);
  }

  // Ascending, because each column's x depends on every column before it.
  const depths = [...byDepth.keys()].sort((a, b) => a - b);
  let x = 0;

  for (const depth of depths) {
    const layer = byDepth.get(depth) ?? [];
    const heights = layer.map((node) => node.height ?? NODE_HEIGHT);
    const stack = sum(heights) + GAP_Y * (layer.length - 1);

    // Centred on the axis, so a tall layer does not hang below the one above.
    let y = -stack / 2;
    layer.forEach((node, index) => {
      node.position = { x, y };
      y += (heights[index] ?? NODE_HEIGHT) + GAP_Y;
    });

    x += Math.max(...layer.map((node) => node.width ?? NODE_WIDTH)) + GAP_X;
  }

  return nodes;
}

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

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
