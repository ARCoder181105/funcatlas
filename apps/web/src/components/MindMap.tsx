import { useMemo } from "react";
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  type Edge,
  type Node,
} from "reactflow";
import { AlertTriangle } from "lucide-react";
import { ApiError } from "../lib/api";
import { cn } from "../lib/cn";
import { useExpansions } from "../lib/functions";
import { buildGraph, FUNCTION_NODE, GHOST_NODE, type GraphNodeData } from "../lib/graph";
import { useTheme } from "../lib/theme";
import { PALETTE } from "../lib/tokens";
import { useUiStore } from "../store/ui";
import { ConfidenceEdge } from "./ConfidenceEdge";
import { ConfidenceKey } from "./ConfidenceKey";
import { FunctionNode, GhostNode } from "./FunctionNode";
import { Badge } from "./ui/badge";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "./ui/empty";
import { Skeleton } from "./ui/skeleton";

/**
 * Hoisted: React Flow compares these by identity, and a new object each render
 * remounts every node and replays every edge animation.
 */
const NODE_TYPES = { [FUNCTION_NODE]: FunctionNode, [GHOST_NODE]: GhostNode };
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

  const expansions = useExpansions(expandedFunctionIds);
  const palette = PALETTE[mode];

  const graph = useMemo(() => buildGraph(expansions.data), [expansions.data]);

  // Focus mode: the selected function's immediate neighbourhood stays lit and
  // everything else dims. Computed here rather than in the nodes so each one
  // does not have to know the whole graph to decide how to draw itself.
  const { nodes, edges } = useMemo(
    () => focus(graph.nodes, graph.edges, selectedFunctionId),
    [graph, selectedFunctionId],
  );

  // Only the very first load is a blank canvas. Expanding keeps what is
  // already drawn on screen while the new branch arrives, because taking the
  // map away to fetch one more column is worse than a moment of nothing.
  if (expansions.isPending && graph.nodes.length === 0) {
    return <MindMapSkeleton />;
  }

  if (expansions.error !== null && graph.nodes.length === 0) {
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

      <Panel position="bottom-left">
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
