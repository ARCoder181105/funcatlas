import { useEffect, useMemo } from "react";
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  useReactFlow,
  type Edge,
  type Node,
} from "reactflow";
import { AlertTriangle } from "lucide-react";
import { ApiError } from "../lib/api";
import { cn } from "../lib/cn";
import { useExpansions } from "../lib/functions";
import { useRepoTree } from "../lib/repos";
import {
  buildGraph,
  COLUMN,
  FILE_CARD_NODE,
  FUNCTION_NODE,
  GHOST_NODE,
  NODE_HEIGHT,
  NODE_WIDTH,
  type GraphNodeData,
} from "../lib/graph";
import { useTheme } from "../lib/theme";
import { PALETTE } from "../lib/tokens";
import { useUiStore } from "../store/ui";
import { ConfidenceEdge } from "./ConfidenceEdge";
import { ConfidenceKey } from "./ConfidenceKey";
import { FileCard } from "./FileCard";
import { FunctionNode, GhostNode } from "./FunctionNode";
import { Badge } from "./ui/badge";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "./ui/empty";
import { Skeleton } from "./ui/skeleton";

/**
 * Hoisted: React Flow compares these by identity, and a new object each render
 * remounts every node and replays every edge animation.
 */
const NODE_TYPES = {
  [FILE_CARD_NODE]: FileCard,
  [FUNCTION_NODE]: FunctionNode,
  [GHOST_NODE]: GhostNode,
};
const EDGE_TYPES = { confidence: ConfidenceEdge };

const GRID_FINE = 26;
const GRID_COARSE = 130;

/**
 * The mind-map: one function, and what it reaches.
 *
 * It grows by clicking. Opening a function draws its direct calls beside it,
 * and clicking any of those draws theirs -- nothing already on the canvas is
 * taken away, so the map is the path the reader took through the graph.
 *
 * Every edge is drawn at the confidence the resolver actually had, and a call
 * it could not place is drawn anyway, as a ghost at the boundary. See
 * `lib/graph.ts` for why dropping one would be the dishonesty PRD §8 forbids.
 */
export function MindMap() {
  const mode = useTheme((state) => state.mode);
  const selectedFunctionId = useUiStore((state) => state.selectedFunctionId);
  const expandedFunctionIds = useUiStore((state) => state.expandedFunctionIds);
  const rootFunctionIds = useUiStore((state) => state.rootFunctionIds);
  const collapsedFunctionIds = useUiStore((state) => state.collapsedFunctionIds);

  const selectedFileId = useUiStore((state) => state.selectedFileId);
  const selectedRepoId = useUiStore((state) => state.selectedRepoId);
  const tree = useRepoTree(selectedRepoId);

  const expansions = useExpansions(expandedFunctionIds);
  const palette = PALETTE[mode];
  const flow = useReactFlow();

  const graph = useMemo(
    () => buildGraph(expansions.data, rootFunctionIds, collapsedFunctionIds),
    [expansions.data, rootFunctionIds, collapsedFunctionIds],
  );

  /**
   * The file card is part of the same canvas, not a surface the mind-map
   * replaces.
   *
   * Clicking a function used to swap one whole React Flow for another, so the
   * file you were reading vanished the moment you opened something in it. It
   * now sits one column to the left of the function it opened, joined to it,
   * so the chain reads file to function to callees without anything
   * disappearing.
   */
  const withFile = useMemo(() => {
    const file = tree.data?.files.find((candidate) => candidate.id === selectedFileId);
    if (file === undefined) {
      return graph;
    }

    const fileNodeId = `file-${file.id}`;
    // Every branch root, not one: the reader can open several functions out of
    // one file and explore each independently.
    const rootNodes = graph.nodes.filter((node) => node.data.depth === 0);

    return {
      ...graph,
      nodes: [
        {
          id: fileNodeId,
          type: FILE_CARD_NODE,
          // One column left of the root, so the function it opened sits beside
          // it rather than on top of it.
          position: { x: -COLUMN - 60, y: -40 },
          data: { fileId: file.id, path: file.path, language: file.language },
          // A file is not a call, so it carries none of the graph node's data.
        } as unknown as Node<GraphNodeData>,
        ...graph.nodes,
      ],
      edges: [
        ...rootNodes.map((rootNode) => ({
          id: `e-${fileNodeId}-${rootNode.id}`,
          source: fileNodeId,
          target: rootNode.id,
          // Not a call and so not a confidence tier: this edge says "declared
          // in", which is a fact rather than an inference.
          type: "smoothstep",
          style: { stroke: palette.surface.border, strokeWidth: 1.5 },
        })),
        ...graph.edges,
      ],
    };
  }, [graph, tree.data, selectedFileId, palette.surface.border]);

  /**
   * Travel to whatever was just opened.
   *
   * `fitView` as a prop only runs on mount, so every expansion added a column
   * outside the viewport and the screen never moved -- which reads exactly
   * like nothing happened. Centring on the new card rather than refitting the
   * whole graph, because a map that has been explored for a while zooms out
   * far enough on a refit that the new branch is unreadable.
   *
   * Keyed on the selection, not the node count: closing a branch changes the
   * count too, and yanking the view somewhere on a collapse is disorienting.
   */
  useEffect(() => {
    if (selectedFunctionId === null) return;
    const target = withFile.nodes.find((node) => node.data?.functionId === selectedFunctionId);
    if (target === undefined) return;

    // A frame late on purpose: React Flow measures the new nodes first, and
    // centring before that uses stale positions.
    const id = requestAnimationFrame(() => {
      flow.setCenter(
        target.position.x + NODE_WIDTH / 2,
        target.position.y + NODE_HEIGHT / 2,
        { zoom: 1, duration: 450 },
      );
    });
    return () => cancelAnimationFrame(id);
  }, [selectedFunctionId, withFile.nodes, flow]);

  // Focus mode: the selected function's immediate neighbourhood stays lit and
  // everything else dims. Computed here rather than in the nodes so each one
  // does not have to know the whole graph to decide how to draw itself.
  const { nodes, edges } = useMemo(
    () => focus(withFile.nodes, withFile.edges, selectedFunctionId),
    [withFile, selectedFunctionId],
  );

  // Only the very first load is a blank canvas. Expanding keeps what is
  // already drawn on screen while the new branch arrives, because taking the
  // map away to fetch one more column is worse than a moment of nothing.
  if (expansions.isPending && withFile.nodes.length === 0) {
    return <MindMapSkeleton />;
  }

  if (expansions.error !== null && withFile.nodes.length === 0) {
    return (
      <Empty className="h-full">
        <EmptyHeader>
          <EmptyTitle>The call graph did not load</EmptyTitle>
          <EmptyDescription>
            {expansions.error instanceof ApiError
              ? (expansions.error.detail ?? expansions.error.message)
              : "The API could not be reached."}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={NODE_TYPES}
      edgeTypes={EDGE_TYPES}
      fitView
      fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
      minZoom={0.15}
      maxZoom={1.75}
      nodesDraggable
      nodesConnectable={false}
    >
      <Background
        id="fine"
        variant={BackgroundVariant.Lines}
        gap={GRID_FINE}
        color={palette.surface.border}
        lineWidth={0.5}
      />
      <Background
        id="coarse"
        variant={BackgroundVariant.Lines}
        gap={GRID_COARSE}
        color={palette.surface.border}
        lineWidth={1}
      />

      {graph.truncated > 0 ? (
        <Panel position="top-left">
          {/* Stopping early without saying so is the same lie as hiding an
              unresolved call. */}
          <Badge variant="outline" className="gap-1.5 border-confidence-name bg-card">
            <AlertTriangle strokeWidth={1.5} className="size-3 text-confidence-name" aria-hidden />
            {graph.truncated} more not drawn
          </Badge>
        </Panel>
      ) : null}

      <Panel position="top-right">
        <ConfidenceKey />
      </Panel>

      <Controls
        showInteractive={false}
        className="!border-border !bg-card !shadow-none [&>button]:!border-border [&>button]:!bg-card [&>button]:!fill-muted-foreground [&>button:hover]:!bg-accent"
      />

      <MiniMap
        pannable
        zoomable
        // SVG attributes take raw values, not classes -- the same hex the
        // utilities resolve to, from the one source in lib/tokens.ts.
        maskColor={`${palette.surface.DEFAULT}cc`}
        nodeColor={(node) =>
          (node.data as GraphNodeData).kind === "ghost"
            ? palette.confidence.unresolved
            : palette.surface.border
        }
        nodeStrokeColor={palette.confidence.exact}
        className="!border-border !bg-card"
      />
    </ReactFlow>
  );
}

/**
 * Dims everything outside the selected function's immediate neighbourhood.
 *
 * Exported for its test: "which nodes stay lit" is a rule, and a rule that
 * only exists inside a `useMemo` cannot be checked without a canvas.
 */
export function focus(
  nodes: Node<GraphNodeData>[],
  edges: Edge[],
  selectedFunctionId: number | null,
): { nodes: Node<GraphNodeData>[]; edges: Edge[] } {
  const selectedId = nodes.find(
    (node) => node.data.functionId !== null && node.data.functionId === selectedFunctionId,
  )?.id;

  // Nothing selected, or the selection is not on this graph: everything stays
  // lit. Dimming the whole canvas would be worse than dimming none of it.
  if (selectedId === undefined) {
    return { nodes, edges };
  }

  const lit = new Set<string>([selectedId]);
  for (const edge of edges) {
    if (edge.source === selectedId) lit.add(edge.target);
    if (edge.target === selectedId) lit.add(edge.source);
  }

  return {
    nodes: nodes.map((node) =>
      lit.has(node.id) ? node : { ...node, className: cn(node.className, "opacity-35") },
    ),
    edges: edges.map((edge) =>
      lit.has(edge.source) && lit.has(edge.target)
        ? edge
        : { ...edge, className: cn(edge.className, "opacity-25") },
    ),
  };
}

/** The shape that is coming: a root and a first layer (UI_GUIDE §3.3). */
function MindMapSkeleton() {
  return (
    <div className="flex h-full items-center gap-16 px-16" aria-busy>
      <Skeleton className="h-11 w-52" />
      <div className="flex flex-col gap-4">
        <Skeleton className="h-11 w-52" />
        <Skeleton className="h-11 w-52" />
        <Skeleton className="h-11 w-52" />
      </div>
    </div>
  );
}
