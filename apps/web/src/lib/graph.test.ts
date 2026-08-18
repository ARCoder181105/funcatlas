import type {
  CallEdge,
  ReachableFunction,
  ResolutionConfidence,
  TraversalResponse,
} from "@funcatlas/shared";
import type { Node } from "reactflow";
import { describe, expect, it } from "vitest";
import {
  buildGraph,
  CODE_HEIGHT,
  CODE_WIDTH,
  FUNCTION_NODE,
  GHOST_NODE,
  NODE_CEILING,
  NODE_HEIGHT,
  NODE_WIDTH,
  type GraphNodeData,
} from "./graph";

function fn(
  id: number,
  depth: number,
  viaFunctionId: number | null,
  confidence: ResolutionConfidence | null,
  name = `fn${id}`,
): ReachableFunction {
  return { id, name, qualifiedName: name, fileId: 1, depth, confidence, viaFunctionId };
}

function call(id: number, calleeName: string, callLine: number | null): CallEdge {
  return { id, calleeFunctionId: null, calleeName, callLine, confidence: "unresolved" };
}

function resolved(id: number, calleeFunctionId: number, calleeName: string): CallEdge {
  return { id, calleeFunctionId, calleeName, callLine: 1, confidence: "exact" };
}

/** One expansion. `buildGraph` takes a list of them, so every call site wraps
 *  this in an array -- `expansions()` below builds a multi-step map. */
function response(
  reachable: ReachableFunction[],
  edges: CallEdge[] = [],
  functionId = 1,
): TraversalResponse[] {
  return [{ functionId, depth: 1, direction: "out", reachable, edges }];
}

/** The root of every fixture below. */
const ROOT = fn(1, 0, null, null, "generateText");

/**
 * No two cards share any pixel.
 *
 * Stated as rectangles rather than as positions: cards are no longer all the
 * same size, so "different position" stopped being the same claim as "does not
 * overlap". Every fixture that lays anything out ends here.
 */
function expectNoOverlap(nodes: Node<GraphNodeData>[]): void {
  const box = (node: Node<GraphNodeData>) => ({
    left: node.position.x,
    right: node.position.x + (node.width ?? NODE_WIDTH),
    top: node.position.y,
    bottom: node.position.y + (node.height ?? NODE_HEIGHT),
  });

  for (const a of nodes) {
    for (const b of nodes) {
      if (a.id === b.id) continue;
      const [one, two] = [box(a), box(b)];
      const overlaps =
        one.left < two.right && two.left < one.right && one.top < two.bottom && two.top < one.bottom;
      expect(overlaps, `${a.id} overlaps ${b.id}`).toBe(false);
    }
  }
}

describe("buildGraph", () => {
  it("treats the starting function as a node with no inbound edge", () => {
    // It is reached by no edge at all -- confidence and viaFunctionId are both
    // null on it -- which is a different thing from being unresolved.
    const { nodes, edges } = buildGraph(response([ROOT]));

    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.data.isRoot).toBe(true);
    expect(nodes[0]?.type).toBe(FUNCTION_NODE);
    expect(edges).toHaveLength(0);
  });

  it("gives each confidence tier its own edge, without choosing the style here", () => {
    const { edges } = buildGraph(
      response([
        ROOT,
        fn(2, 1, 1, "exact"),
        fn(3, 1, 1, "name_match"),
        fn(4, 1, 1, "unresolved"),
      ]),
    );

    // The tier is carried, not translated: lib/confidence.ts owns the mapping
    // and reads CONFIDENCE_STYLE from packages/shared.
    expect(edges.map((edge) => edge.data.confidence).sort()).toEqual([
      "exact",
      "name_match",
      "unresolved",
    ]);
    expect(new Set(edges.map((edge) => edge.type))).toEqual(new Set(["confidence"]));
  });

  it("turns an unresolved call into a ghost node rather than dropping it", () => {
    // The failure this whole chunk exists to prevent: an unresolved edge
    // reaches no function row, so a mapper built only from `reachable` shows a
    // function calling nothing. PRD §8.
    const { nodes, edges } = buildGraph(response([ROOT], [call(10, "logger.debug", 42)]));

    const ghost = nodes.find((node) => node.type === GHOST_NODE);
    expect(ghost).toBeDefined();
    expect(ghost?.data.label).toBe("logger.debug");
    expect(ghost?.data.callLines).toEqual([42]);

    // And it is connected, not floating.
    expect(edges).toHaveLength(1);
    expect(edges[0]?.target).toBe(ghost?.id);
    expect(edges[0]?.data.confidence).toBe("unresolved");
  });

  it("leaves no edge pointing at a node that is not there", () => {
    const { nodes, edges } = buildGraph(
      response([ROOT, fn(2, 1, 1, "exact")], [call(10, "logger.debug", 1)]),
    );

    const ids = new Set(nodes.map((node) => node.id));
    for (const edge of edges) {
      expect(ids.has(edge.source), `dangling source ${edge.source}`).toBe(true);
      expect(ids.has(edge.target), `dangling target ${edge.target}`).toBe(true);
    }
  });

  it("merges call sites sharing a callee name into one ghost", () => {
    // The decision B5 asks to be made deliberately. A ghost is the name the
    // parser saw, and two calls saw one name; the lines record that there
    // were two sites without claiming they reach the same definition.
    const { nodes, edges } = buildGraph(
      response([ROOT], [call(10, "logger.debug", 40), call(11, "logger.debug", 12)]),
    );

    const ghosts = nodes.filter((node) => node.type === GHOST_NODE);
    expect(ghosts).toHaveLength(1);
    expect(ghosts[0]?.data.callLines).toEqual([12, 40]);
    // One edge, not two overlapping ones between the same pair.
    expect(edges).toHaveLength(1);
  });

  it("keeps different callee names as different ghosts", () => {
    const { nodes } = buildGraph(
      response([ROOT], [call(10, "logger.debug", 1), call(11, "logger.warn", 2)]),
    );

    expect(nodes.filter((node) => node.type === GHOST_NODE)).toHaveLength(2);
  });

  it("puts a ghost one column past the function that made the call", () => {
    const { nodes } = buildGraph(
      response([ROOT, fn(2, 1, 1, "exact"), fn(3, 2, 2, "exact")], [call(10, "logger.debug", 1)]),
    );

    const ghost = nodes.find((node) => node.type === GHOST_NODE);

    // Beside its caller, not past the whole map. The unresolved call belongs
    // to the root here, so parking it past the deepest resolved node would
    // draw a long edge back to a function three columns away.
    expect(ghost?.data.depth).toBe(1);
  });

  it("merges several expansions into one map, keeping the earlier ones", () => {
    // The reader grows the map by clicking, and losing an ancestor would lose
    // the path they took to get there.
    const built = buildGraph([
      ...response([ROOT, fn(2, 1, 1, "exact")]),
      ...response([fn(2, 0, null, null), fn(3, 1, 2, "exact")], [], 2),
    ]);

    expect(built.nodes.map((node) => node.id).sort()).toEqual(["fn-1", "fn-2", "fn-3"]);
    expect(built.edges.map((edge) => edge.id).sort()).toEqual(["e-1-2", "e-2-3"]);
  });

  it("measures depth from the root across expansions, not per response", () => {
    // Each response reports depth 0 or 1 relative to whatever it expanded, so
    // a column has to be counted along the edges instead.
    const built = buildGraph([
      ...response([ROOT, fn(2, 1, 1, "exact")]),
      ...response([fn(2, 0, null, null), fn(3, 1, 2, "exact")], [], 2),
    ]);

    const depth = (id: string) => built.nodes.find((n) => n.id === id)?.data.depth;
    expect(depth("fn-1")).toBe(0);
    expect(depth("fn-2")).toBe(1);
    expect(depth("fn-3")).toBe(2);
  });

  it("hangs a ghost off whichever expansion actually made the call", () => {
    // The old fixed-depth traversal only ever knew the root's unresolved
    // calls. Growing one expansion at a time means each brings its own.
    const built = buildGraph([
      ...response([ROOT, fn(2, 1, 1, "exact")]),
      ...response([fn(2, 0, null, null)], [call(10, "logger.debug", 7)], 2),
    ]);

    const ghost = built.nodes.find((node) => node.type === GHOST_NODE);
    expect(ghost?.data.depth).toBe(2);
    expect(built.edges.some((edge) => edge.source === "fn-2" && edge.target === ghost?.id)).toBe(
      true,
    );
  });

  it("never places two nodes on top of each other", () => {
    // Functions and ghosts used to be laid out in separate passes, each
    // centring its own column on the same axis -- so a ghost and a function
    // at the same depth landed in exactly the same place.
    const built = buildGraph([
      ...response([ROOT, fn(2, 1, 1, "exact"), fn(3, 1, 1, "exact")], [call(10, "logger.debug", 1)]),
      ...response([fn(2, 0, null, null), fn(4, 1, 2, "exact")], [call(11, "fetch", 2)], 2),
    ]);

    expectNoOverlap(built.nodes);
  });

  it("keeps cards apart when one of them opens its source", () => {
    // The card grows in both directions, so both axes have to give: a 420-wide
    // card in a 300-wide column lands on the column beside it, and a 324-tall
    // one lands on its own neighbour below.
    const responses = [
      ...response([ROOT, fn(2, 1, 1, "exact"), fn(3, 1, 1, "exact")], [call(10, "logger.debug", 1)]),
      ...response([fn(2, 0, null, null), fn(4, 1, 2, "exact")], [], 2),
    ];

    const open = buildGraph(responses, [1], [], [2]);
    const node = (id: number) => open.nodes.find((candidate) => candidate.id === `fn-${id}`);

    expect(node(2)?.width).toBe(CODE_WIDTH);
    expect(node(2)?.height).toBe(NODE_HEIGHT + CODE_HEIGHT);
    expect(node(2)?.data.showCode).toBe(true);
    // Its neighbours are not: only the card that was asked for.
    expect(node(3)?.width).toBe(NODE_WIDTH);

    expectNoOverlap(open.nodes);

    // And the column past it moved right to make room, rather than the card
    // growing over it.
    const shut = buildGraph(responses, [1], [], []);
    const xOf = (built: typeof open, id: number) =>
      built.nodes.find((candidate) => candidate.id === `fn-${id}`)?.position.x ?? 0;
    expect(xOf(open, 4)).toBeGreaterThan(xOf(shut, 4));
  });

  it("measures from the anchor it is given, not from whichever response arrived first", () => {
    // Expansions resolve out of order and the pending ones are filtered out,
    // so responses[0] is not the function the reader started from. Taking the
    // anchor from there prunes the map to one subtree without saying so.
    const outOfOrder = [
      ...response([fn(2, 0, null, null), fn(3, 1, 2, "exact")], [], 2),
      ...response([ROOT, fn(2, 1, 1, "exact")], [], 1),
    ];

    const built = buildGraph(outOfOrder, [1]);
    expect(built.nodes.map((node) => node.id).sort()).toEqual(["fn-1", "fn-2", "fn-3"]);

    // Without the explicit anchor it would keep only fn-2's subtree.
    expect(buildGraph(outOfOrder).nodes.map((node) => node.id).sort()).toEqual(["fn-2", "fn-3"]);
  });

  it("hides a collapsed branch's descendants but keeps the branch itself", () => {
    // Collapsing has to leave something to click to reopen, and everything
    // below it has to disappear -- including its ghosts.
    const responses = [
      ...response([ROOT, fn(2, 1, 1, "exact")]),
      ...response([fn(2, 0, null, null), fn(3, 1, 2, "exact")], [call(9, "logger.debug", 4)], 2),
    ];

    const open = buildGraph(responses, [1], []);
    expect(open.nodes.map((n) => n.id).sort()).toEqual(["fn-1", "fn-2", "fn-3", "ghost-logger.debug"]);

    const shut = buildGraph(responses, [1], [2]);
    expect(shut.nodes.map((n) => n.id).sort()).toEqual(["fn-1", "fn-2"]);
    // And the same responses reopen to exactly what was there before.
    expect(buildGraph(responses, [1], []).nodes.map((n) => n.id).sort()).toEqual(
      open.nodes.map((n) => n.id).sort(),
    );
  });

  it("takes a closed branch off the canvas entirely, and brings it back whole", () => {
    // A root is opened and closed from its row on the file card, so unlike a
    // card deeper in the map it does not need to stay behind to be clickable.
    // Leaving it there means pressing "close" and watching the card sit where
    // it was.
    const responses = [
      ...response([ROOT, fn(2, 1, 1, "exact")]),
      ...response([fn(50, 0, null, null), fn(51, 1, 50, "exact")], [call(9, "fetch", 4)], 50),
    ];

    const both = buildGraph(responses, [1, 50], []);
    expect(both.nodes.map((n) => n.id).sort()).toEqual([
      "fn-1",
      "fn-2",
      "fn-50",
      "fn-51",
      "ghost-fetch",
    ]);

    // Nothing of the second branch survives -- not its root, not its
    // generations, not its ghosts.
    const shut = buildGraph(responses, [1, 50], [50]);
    expect(shut.nodes.map((n) => n.id).sort()).toEqual(["fn-1", "fn-2"]);

    expect(buildGraph(responses, [1, 50], []).nodes.map((n) => n.id).sort()).toEqual(
      both.nodes.map((n) => n.id).sort(),
    );
  });

  it("draws several branches from one file, each from its own root", () => {
    const built = buildGraph(
      [
        ...response([ROOT, fn(2, 1, 1, "exact")]),
        ...response([fn(50, 0, null, null), fn(51, 1, 50, "exact")], [], 50),
      ],
      [1, 50],
    );

    expect(built.nodes.map((n) => n.id).sort()).toEqual(["fn-1", "fn-2", "fn-50", "fn-51"]);
    // Both roots sit in the first column.
    const depth = (id: string) => built.nodes.find((n) => n.id === id)?.data.depth;
    expect(depth("fn-1")).toBe(0);
    expect(depth("fn-50")).toBe(0);
  });

  it("drops an expansion that no longer hangs off the anchor", () => {
    // Closing a function in the middle leaves the ones it had opened with
    // nothing above them. Every response also carries its own function at
    // depth 0, so without pruning those would float as if they were roots.
    const built = buildGraph([
      ...response([ROOT, fn(2, 1, 1, "exact")]),
      // fn 4 was opened through fn 3, and fn 3 is no longer expanded.
      ...response([fn(3, 0, null, null), fn(4, 1, 3, "exact")], [], 3),
    ]);

    expect(built.nodes.map((node) => node.id).sort()).toEqual(["fn-1", "fn-2"]);
    expect(built.edges.every((edge) => !edge.id.includes("3"))).toBe(true);
  });

  it("returns an empty map when nothing has been expanded", () => {
    expect(buildGraph([])).toEqual({ nodes: [], edges: [], truncated: 0 });
  });

  it("turns depth into columns and spreads a layer across rows", () => {
    const { nodes } = buildGraph(
      response([ROOT, fn(2, 1, 1, "exact"), fn(3, 1, 1, "exact"), fn(4, 2, 2, "exact")]),
    );

    const at = (id: number) => nodes.find((node) => node.id === `fn-${id}`)?.position;

    expect(at(1)?.x).toBe(0);
    expect(at(2)?.x).toBe(at(3)?.x);
    expect(at(2)?.x).toBeGreaterThan(at(1)?.x ?? 0);
    expect(at(4)?.x).toBeGreaterThan(at(2)?.x ?? 0);
    // Same layer, different rows.
    expect(at(2)?.y).not.toBe(at(3)?.y);
  });

  it("centres a layer rather than hanging it below the one above", () => {
    const { nodes } = buildGraph(response([ROOT, fn(2, 1, 1, "exact"), fn(3, 1, 1, "exact")]));

    // Centres, not top-left corners: cards differ in height now, so the layer
    // is centred on the middle of its stack rather than on its first row.
    const centres = nodes
      .filter((node) => node.data.depth === 1)
      .map((node) => node.position.y + (node.height ?? NODE_HEIGHT) / 2)
      .sort((a, b) => a - b);

    expect((centres[0] ?? 0) + (centres[1] ?? 0)).toBe(0);
  });

  it("produces one node per function when the graph has a cycle", () => {
    // Mutual recursion is normal, and the CTE already returns each function
    // once. Keying by id here means a change to that query cannot quietly
    // start duplicating nodes.
    const { nodes } = buildGraph(
      response([ROOT, fn(2, 1, 1, "exact"), fn(1, 2, 2, "exact", "generateText")]),
    );

    expect(nodes.filter((node) => node.id === "fn-1")).toHaveLength(1);
    expect(nodes).toHaveLength(2);
  });

  it("truncates at the ceiling and says how much it cut", () => {
    const many = [ROOT, ...Array.from({ length: NODE_CEILING + 50 }, (_, i) => fn(i + 2, 1, 1, "exact"))];
    const built = buildGraph(response(many));

    // Freezing the tab is not an option, and neither is stopping early
    // without saying so.
    expect(built.nodes).toHaveLength(NODE_CEILING);
    expect(built.truncated).toBe(51);
  });

  it("keeps the shallowest layers when it truncates", () => {
    const many = [
      ROOT,
      ...Array.from({ length: NODE_CEILING, }, (_, i) => fn(i + 2, 1, 1, "exact")),
      fn(99999, 9, 1, "exact", "deepest"),
    ];
    const built = buildGraph(response(many));

    // Cutting the near neighbourhood to keep a distant one would remove
    // exactly the part the reader came for.
    expect(built.nodes.some((node) => node.id === "fn-1")).toBe(true);
    expect(built.nodes.some((node) => node.id === "fn-99999")).toBe(false);
  });

  it("drops an edge whose other end the ceiling removed", () => {
    // Rather than leaving React Flow with an edge into nothing, which it
    // renders as a line to the origin.
    const many = [
      ROOT,
      ...Array.from({ length: NODE_CEILING - 1 }, (_, i) => fn(i + 2, 1, 1, "exact")),
      fn(90000, 2, 88888, "exact"),
    ];
    const built = buildGraph(response(many));
    const ids = new Set(built.nodes.map((node) => node.id));

    for (const edge of built.edges) {
      expect(ids.has(edge.source) && ids.has(edge.target)).toBe(true);
    }
  });

  it("does not draw a resolved direct call twice", () => {
    // A resolved direct call appears in `reachable` and in `edges` both.
    const built = buildGraph(
      response([ROOT, fn(2, 1, 1, "exact")], [resolved(10, 2, "fn2")]),
    );

    expect(built.edges).toHaveLength(1);
  });

  it("carries depth on the edge so the draw-in can be staggered by layer", () => {
    const { edges } = buildGraph(response([ROOT, fn(2, 1, 1, "exact"), fn(3, 2, 2, "exact")]));

    expect(edges.find((edge) => edge.target === "fn-2")?.data.depth).toBe(1);
    expect(edges.find((edge) => edge.target === "fn-3")?.data.depth).toBe(2);
  });

  it("gives every node and edge a unique id", () => {
    const { nodes, edges } = buildGraph(
      response(
        [ROOT, fn(2, 1, 1, "exact"), fn(3, 1, 1, "name_match")],
        [call(10, "logger.debug", 1), call(11, "fetch", 2)],
      ),
    );

    expect(new Set(nodes.map((n) => n.id)).size).toBe(nodes.length);
    expect(new Set(edges.map((e) => e.id)).size).toBe(edges.length);
    // A ghost named after a number must not collide with a function id.
    expect(nodes.every((n) => n.id.startsWith("fn-") || n.id.startsWith("ghost-"))).toBe(true);
  });

  it("handles a function with no calls at all", () => {
    const built = buildGraph(response([ROOT], []));

    expect(built.nodes).toHaveLength(1);
    expect(built.edges).toHaveLength(0);
    expect(built.truncated).toBe(0);
  });
});
