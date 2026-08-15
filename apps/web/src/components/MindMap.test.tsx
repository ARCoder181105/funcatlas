import type { Edge, Node } from "reactflow";
import { describe, expect, it } from "vitest";
import type { GraphNodeData } from "../lib/graph";
import { focus } from "./MindMap";

function node(id: string, functionId: number | null): Node<GraphNodeData> {
  return {
    id,
    position: { x: 0, y: 0 },
    data: {
      kind: functionId === null ? "ghost" : "function",
      label: id,
      functionId,
      qualifiedName: null,
      fileId: null,
      depth: 0,
      isRoot: false,
      callLines: [],
    },
  };
}

function edge(source: string, target: string): Edge {
  return { id: `${source}-${target}`, source, target };
}

const dimmed = (item: { className?: string }) => (item.className ?? "").includes("opacity-");

describe("focus", () => {
  const nodes = [node("fn-1", 1), node("fn-2", 2), node("fn-3", 3), node("ghost-x", null)];
  const edges = [edge("fn-1", "fn-2"), edge("fn-2", "fn-3"), edge("fn-1", "ghost-x")];

  it("leaves everything lit when nothing is selected", () => {
    // Dimming the whole canvas would be worse than dimming none of it.
    const result = focus(nodes, edges, null);

    expect(result.nodes.some(dimmed)).toBe(false);
    expect(result.edges.some(dimmed)).toBe(false);
  });

  it("leaves everything lit when the selection is not on this graph", () => {
    const result = focus(nodes, edges, 999);
    expect(result.nodes.some(dimmed)).toBe(false);
  });

  it("keeps the selected function and its immediate neighbours lit", () => {
    const result = focus(nodes, edges, 2);
    const lit = result.nodes.filter((n) => !dimmed(n)).map((n) => n.id);

    // fn-2 itself, fn-1 which calls it, fn-3 which it calls.
    expect(lit.sort()).toEqual(["fn-1", "fn-2", "fn-3"]);
  });

  it("dims what the selection does not touch", () => {
    const result = focus(nodes, edges, 3);
    const byId = new Map(result.nodes.map((n) => [n.id, n]));

    expect(dimmed(byId.get("ghost-x")!)).toBe(true);
    expect(dimmed(byId.get("fn-3")!)).toBe(false);
  });

  it("keeps a ghost lit when it is the selection's own neighbour", () => {
    // An unresolved call is part of the neighbourhood, not noise to be hidden
    // the moment focus mode turns on. PRD §8.
    const result = focus(nodes, edges, 1);
    const ghost = result.nodes.find((n) => n.id === "ghost-x");

    expect(dimmed(ghost!)).toBe(false);
  });

  it("only lights an edge when both of its ends are lit", () => {
    const result = focus(nodes, edges, 1);
    const byId = new Map(result.edges.map((e) => [e.id, e]));

    expect(dimmed(byId.get("fn-1-fn-2")!)).toBe(false);
    // fn-2 is lit as a neighbour, but fn-3 is not, so the edge between them
    // would otherwise draw at full strength into a dimmed node.
    expect(dimmed(byId.get("fn-2-fn-3")!)).toBe(true);
  });

  it("does not mutate what it was given", () => {
    const original = structuredClone(nodes);
    focus(nodes, edges, 2);

    expect(nodes).toEqual(original);
  });
});
