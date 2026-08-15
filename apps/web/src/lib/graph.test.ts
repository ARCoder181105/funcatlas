import type {
  CallEdge,
  ReachableFunction,
  ResolutionConfidence,
  TraversalDirection,
  TraversalResponse,
} from "@funcatlas/shared";
import { describe, expect, it } from "vitest";
import { buildGraph, GHOST_NODE, FUNCTION_NODE, NODE_CEILING } from "./graph";

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

function response(
  reachable: ReachableFunction[],
  edges: CallEdge[] = [],
  direction: TraversalDirection = "out",
): TraversalResponse {
  return { functionId: 1, depth: 5, direction, reachable, edges };
}

/** The root of every fixture below. */
const ROOT = fn(1, 0, null, null, "generateText");

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

  it("does not draw ghosts on an inbound traversal", () => {
    // `edges` is always the start's *outgoing* calls, whatever the direction.
    // On an inbound graph they describe something else entirely.
    const built = buildGraph(response([ROOT], [call(10, "logger.debug", 1)], "in"));

    expect(built.nodes.filter((node) => node.type === GHOST_NODE)).toHaveLength(0);
    expect(built.showsGhosts).toBe(false);
  });

  it("puts ghosts past the last resolved layer", () => {
    const { nodes } = buildGraph(
      response([ROOT, fn(2, 1, 1, "exact"), fn(3, 2, 2, "exact")], [call(10, "logger.debug", 1)]),
    );

    const deepest = Math.max(
      ...nodes.filter((node) => node.type === FUNCTION_NODE).map((node) => node.data.depth),
    );
    const ghost = nodes.find((node) => node.type === GHOST_NODE);

    // The map showing its own boundary, drawn where a chart puts uncharted
    // water -- not tangled among the functions it does know.
    expect(ghost?.data.depth).toBe(deepest + 1);
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

    const ys = nodes
      .filter((node) => node.data.depth === 1)
      .map((node) => node.position.y)
      .sort((a, b) => a - b);

    expect((ys[0] ?? 0) + (ys[1] ?? 0)).toBe(0);
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

  it("points an inbound edge from caller to callee, not the way it was walked", () => {
    // An inbound traversal walks callers, so the function reached is the
    // caller. Drawing it the same way as an outbound edge would reverse every
    // arrow on the graph.
    const outward = buildGraph(response([ROOT, fn(2, 1, 1, "exact")], [], "out"));
    const inward = buildGraph(response([ROOT, fn(2, 1, 1, "exact")], [], "in"));

    expect(outward.edges[0]?.source).toBe("fn-1");
    expect(outward.edges[0]?.target).toBe("fn-2");

    expect(inward.edges[0]?.source).toBe("fn-2");
    expect(inward.edges[0]?.target).toBe("fn-1");
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
