import { useMemo } from "react";
import {
  TRAVERSAL_DIRECTIONS,
  TRAVERSAL_MAX_DEPTH,
  type TraversalDirection,
} from "@funcatlas/shared";
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
import { useTraversal } from "../lib/functions";
import { buildGraph, FUNCTION_NODE, GHOST_NODE, type GraphNodeData } from "../lib/graph";
import { useTheme } from "../lib/theme";
import { PALETTE } from "../lib/tokens";
import { useUiStore } from "../store/ui";
import { ConfidenceLegend } from "./ConfidenceLegend";
import { ConfidenceEdge } from "./ConfidenceEdge";
import { FunctionNode, GhostNode } from "./FunctionNode";
import { Badge } from "./ui/badge";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "./ui/empty";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Skeleton } from "./ui/skeleton";

/**
 * Hoisted: React Flow compares these by identity, and a new object each render
 * remounts every node and replays every edge animation.
 */
const NODE_TYPES = { [FUNCTION_NODE]: FunctionNode, [GHOST_NODE]: GhostNode };
const EDGE_TYPES = { confidence: ConfidenceEdge };

const GRID_FINE = 26;
const GRID_COARSE = 130;

const DIRECTION_LABEL: Record<TraversalDirection, string> = {
  out: "What it calls",
  in: "What calls it",
};

/** Offered depths. Bounded by the server's own cap, so the control cannot ask
 *  for a traversal the API will reject. */
const DEPTHS = Array.from({ length: TRAVERSAL_MAX_DEPTH }, (_, index) => index + 1);

/**
 * The mind-map: one function, and what it reaches.
 *
 * This is the product. Every edge is drawn at the confidence the resolver
 * actually had, and a call it could not place is drawn anyway, as a ghost at
 * the boundary — see `lib/graph.ts` for why dropping it would be the one
 * dishonesty PRD §8 forbids.
 */
export function MindMap() {
  const mode = useTheme((state) => state.mode);
  const selectedFunctionId = useUiStore((state) => state.selectedFunctionId);
  const depth = useUiStore((state) => state.traversalDepth);
  const direction = useUiStore((state) => state.traversalDirection);
  const setDepth = useUiStore((state) => state.setTraversalDepth);
  const setDirection = useUiStore((state) => state.setTraversalDirection);

  const traversal = useTraversal(selectedFunctionId, depth, direction);
  const palette = PALETTE[mode];

  const graph = useMemo(
    () => (traversal.data === undefined ? null : buildGraph(traversal.data)),
    [traversal.data],
  );

  // Focus mode: the selected function's immediate neighbourhood stays lit and
  // everything else dims. Computed here rather than in the nodes so each one
  // does not have to know the whole graph to decide how to draw itself.
  const { nodes, edges } = useMemo(
    () => focus(graph?.nodes ?? [], graph?.edges ?? [], selectedFunctionId),
    [graph, selectedFunctionId],
  );

  if (traversal.isPending) {
    return <MindMapSkeleton />;
  }

  if (traversal.isError) {
    return (
      <Empty className="h-full">
        <EmptyHeader>
          <EmptyTitle>The call graph did not load</EmptyTitle>
          <EmptyDescription>
            {traversal.error instanceof ApiError
              ? (traversal.error.detail ?? traversal.error.message)
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

      <Panel position="top-left" className="flex items-end gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="direction" className="text-[10px] text-muted-foreground uppercase">
            Direction
          </Label>
          <Select
            value={direction}
            onValueChange={(next) => setDirection(next as TraversalDirection)}
          >
            <SelectTrigger id="direction" size="sm" className="w-40 bg-card">
              {/* Without the render prop the trigger shows the raw value --
                  "out" rather than "What it calls". */}
              <SelectValue>{(value: TraversalDirection) => DIRECTION_LABEL[value]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {TRAVERSAL_DIRECTIONS.map((value) => (
                <SelectItem key={value} value={value}>
                  {DIRECTION_LABEL[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="depth" className="text-[10px] text-muted-foreground uppercase">
            Depth
          </Label>
          <Select value={String(depth)} onValueChange={(next) => setDepth(Number(next))}>
            <SelectTrigger id="depth" size="sm" className="w-20 bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DEPTHS.map((value) => (
                <SelectItem key={value} value={String(value)}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {graph !== null && graph.truncated > 0 ? (
          // Stopping early without saying so is the same lie as hiding an
          // unresolved call.
          <Badge variant="outline" className="mb-1 gap-1.5 border-confidence-name">
            <AlertTriangle strokeWidth={1.5} className="size-3 text-confidence-name" aria-hidden />
            {graph.truncated} more not drawn
          </Badge>
        ) : null}
      </Panel>

      {/* Bottom-left, where a chart carries its legend. An unexplained dotted
          line is noise; an explained one is the entire point. */}
      <Panel position="bottom-left" className="max-w-xs">
        <div className="rounded-token border bg-card/90 px-3 py-2 backdrop-blur-sm">
          <ConfidenceLegend />
          {graph !== null && !graph.showsGhosts ? (
            <p className="mt-2 border-t pt-2 text-[10px] leading-snug text-muted-foreground">
              Unresolved calls are only known for the function you started from, so they are not
              drawn while looking at callers.
            </p>
          ) : null}
        </div>
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
      <Skeleton className="h-12 w-40" />
      <div className="flex flex-col gap-4">
        <Skeleton className="h-12 w-40" />
        <Skeleton className="h-12 w-40" />
        <Skeleton className="h-12 w-40" />
      </div>
    </div>
  );
}
