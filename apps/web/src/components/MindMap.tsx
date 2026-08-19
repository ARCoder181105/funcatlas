import { useEffect, useMemo, useRef } from "react";
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  useReactFlow,
  type Node,
} from "reactflow";
import { AlertTriangle } from "lucide-react";
import { ApiError } from "../lib/api";
import { useExpansions, useSources } from "../lib/functions";
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
import { useAnimatedNodes } from "../lib/useAnimatedNodes";
import { panToReveal } from "../lib/viewport";
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
  const codeFunctionIds = useUiStore((state) => state.codeFunctionIds);

  const selectedFileId = useUiStore((state) => state.selectedFileId);
  const selectedRepoId = useUiStore((state) => state.selectedRepoId);
  const tree = useRepoTree(selectedRepoId);

  const expansions = useExpansions(expandedFunctionIds);
  const palette = PALETTE[mode];
  const flow = useReactFlow();
  /** The pane's own size, for deciding whether a card is already on screen. */
  const paneRef = useRef<HTMLDivElement | null>(null);

  // Cards showing their source are sized to it, so the layout needs the text
  // as well as the card. One query key, shared with the card itself.
  const sources = useSources(codeFunctionIds);

  const graph = useMemo(
    () => buildGraph(expansions.data, rootFunctionIds, collapsedFunctionIds, codeFunctionIds, sources),
    [expansions.data, rootFunctionIds, collapsedFunctionIds, codeFunctionIds, sources],
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
  // Its own memo, so the file card's props keep their identity while the graph
  // around it changes. Rebuilding this object on every expansion would defeat
  // the card's own memo and re-render the whole list for a card that has not
  // changed.
  const file = useMemo(
    () => tree.data?.files.find((candidate) => candidate.id === selectedFileId),
    [tree.data, selectedFileId],
  );
  const fileData = useMemo(
    () => (file === undefined ? null : { fileId: file.id, path: file.path, language: file.language }),
    [file],
  );

  const withFile = useMemo(() => {
    if (fileData === null) {
      return graph;
    }

    const fileNodeId = `file-${fileData.fileId}`;
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
          data: fileData,
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
  }, [graph, fileData, palette.surface.border]);

  /**
   * A new file frames itself.
   *
   * `fitView` as a prop runs once, on mount, and the canvas mounts before a
   * file is chosen -- so the file card arrived wherever the camera happened to
   * be pointing, which for a reader who had panned around was off the edge of
   * the screen entirely. Framing on the file rather than on every change: this
   * is the one moment the map starts over.
   */
  useEffect(() => {
    if (selectedFileId === null) return;
    const id = requestAnimationFrame(() => {
      flow.fitView({ padding: 0.3, maxZoom: 1, duration: 400 });
    });
    return () => cancelAnimationFrame(id);
  }, [selectedFileId, flow]);

  /**
   * Bring whatever was just opened into view, and move no further than that.
   *
   * `fitView` as a prop only runs on mount, so every expansion added a column
   * outside the viewport and the screen never moved -- which reads exactly
   * like nothing happened.
   *
   * The first fix over-corrected: it centred on the new card at zoom 1, which
   * threw away the reader's zoom on every click and pushed the file card --
   * one column to the left of the graph -- off the edge of the screen. What
   * the reader reported as the file card "disappearing" was the camera
   * leaving it behind. `panToReveal` pans the minimum instead, and returns
   * null when the card is already on screen, so clicking something you can
   * see moves nothing at all.
   */
  useEffect(() => {
    if (selectedFunctionId === null) return;
    const target = withFile.nodes.find((node) => node.data?.functionId === selectedFunctionId);
    const pane = paneRef.current;
    if (target === undefined || pane === null) return;

    // A frame late on purpose: React Flow measures the new nodes first, and
    // panning before that uses stale positions.
    const id = requestAnimationFrame(() => {
      const box = pane.getBoundingClientRect();
      const next = panToReveal(
        {
          x: target.position.x,
          y: target.position.y,
          width: target.width ?? NODE_WIDTH,
          height: target.height ?? NODE_HEIGHT,
        },
        flow.getViewport(),
        { width: box.width, height: box.height },
      );

      if (next !== null) {
        // The zoom the reader chose is carried through untouched.
        flow.setViewport({ ...next, zoom: flow.getViewport().zoom }, { duration: 400 });
      }
    });
    return () => cancelAnimationFrame(id);
  }, [selectedFunctionId, withFile.nodes, flow]);

  /*
   * There is no focus mode.
   *
   * Selecting a function used to dim everything outside its immediate
   * neighbourhood. On a map the reader has been building for a while that is
   * most of their own work greyed out, and it fired on every click -- including
   * opening a card's source, where the cards being compared are exactly the
   * ones that went transparent. The selected card marks itself with a ring
   * instead, which says the same thing without taking anything away.
   */
  const gliding = useAnimatedNodes(withFile.nodes);

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
      ref={paneRef}
      nodes={gliding}
      edges={withFile.edges}
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
        // Smaller than the library's default. It is an overview, not a second
        // canvas, and its default size takes a corner of a surface that is
        // already carrying the graph, a key and the controls.
        className="!m-2 !h-24 !w-36 !border-border !bg-card"
      />
    </ReactFlow>
  );
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
