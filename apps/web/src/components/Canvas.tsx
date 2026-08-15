import { useMemo } from "react";
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlowProvider,
  type Node,
} from "reactflow";
import "reactflow/dist/base.css";
import { Map } from "lucide-react";
import { useRepoTree } from "../lib/repos";
import { PALETTE } from "../lib/tokens";
import { useTheme } from "../lib/theme";
import { useUiStore } from "../store/ui";
import { FileCard, type FileCardData } from "./FileCard";
import { MindMap } from "./MindMap";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "./ui/empty";

/**
 * Hoisted to module scope on purpose.
 *
 * React Flow compares this object by identity. Declared inside the component
 * it is a new object on every render, which unmounts and remounts every node
 * -- the card's fetch restarts and its spring animation replays on any state
 * change anywhere above it.
 */
const NODE_TYPES = { fileCard: FileCard };

/** The graticule's two scales, in flow units (UI_GUIDE §3.2 signature 1). */
const GRID_FINE = 26;
const GRID_COARSE = 130;

/**
 * The chart surface.
 *
 * `ReactFlowProvider` wraps rather than being assumed: B5 adds controls that
 * need the flow's store from outside `<ReactFlow>` itself, and adding the
 * provider later means moving state that has already been written against its
 * absence.
 */
export function Canvas() {
  const selectedFunctionId = useUiStore((state) => state.selectedFunctionId);

  // A provider per surface, and the branch above the provider on purpose.
  // The file card and the mind-map are two different graphs, and React Flow's
  // store lives on the provider: mounting the second <ReactFlow> into a
  // provider the first had already populated leaves the new instance with
  // stale internals, and its edges never render.
  if (selectedFunctionId !== null) {
    return (
      <ReactFlowProvider>
        <div className="relative h-full w-full">
          <MindMap />
        </div>
      </ReactFlowProvider>
    );
  }

  return (
    <ReactFlowProvider>
      <CanvasSurface />
    </ReactFlowProvider>
  );
}

function CanvasSurface() {
  const mode = useTheme((state) => state.mode);
  const selectedRepoId = useUiStore((state) => state.selectedRepoId);
  const selectedFileId = useUiStore((state) => state.selectedFileId);
  const tree = useRepoTree(selectedRepoId);

  const palette = PALETTE[mode];

  const nodes = useMemo<Node<FileCardData>[]>(() => {
    const file = tree.data?.files.find((candidate) => candidate.id === selectedFileId);
    if (file === undefined) {
      return [];
    }

    return [
      {
        id: `file-${file.id}`,
        type: "fileCard",
        position: { x: 0, y: 0 },
        data: { fileId: file.id, path: file.path, language: file.language },
      },
    ];
  }, [tree.data, selectedFileId]);

  return (
    // React Flow measures this parent and renders nothing into a zero-height
    // one, with no error at all. The h-full chain from #root to here is what
    // makes the canvas visible, so it is stated rather than inherited.
    <div className="relative h-full w-full">
      {nodes.length === 0 ? <EmptyCanvas hasRepo={selectedRepoId !== null} /> : null}

      <ReactFlow
        nodes={nodes}
        edges={[]}
        nodeTypes={NODE_TYPES}
        fitView
        // A card is 288px wide; without this the fit zooms so far in on a
        // single node that the reader lands inside it.
        fitViewOptions={{ padding: 0.35, maxZoom: 1 }}
        minZoom={0.2}
        maxZoom={1.75}
        proOptions={{ hideAttribution: false }}
      >
        {/* Two scales, as a ruled chart has: a fine grid with a heavier rule
            every fifth line. Drawn by React Flow into SVG, so it pans and
            zooms with the graph instead of sitting behind it. */}
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

        <Controls
          showInteractive={false}
          className="!border-surface-border !bg-surface-raised !shadow-none [&>button]:!border-surface-border [&>button]:!bg-surface-raised [&>button]:!fill-ink-muted [&>button:hover]:!bg-accent"
        />

        <MiniMap
          pannable
          zoomable
          // SVG attributes, so these take raw values rather than classes --
          // the same hex the utilities resolve to, from one source.
          maskColor={`${palette.surface.DEFAULT}cc`}
          nodeColor={palette.surface.border}
          nodeStrokeColor={palette.confidence.exact}
          className="!border-surface-border !bg-surface-raised"
        />
      </ReactFlow>
    </div>
  );
}

/** An invitation to act, in the interface's voice (UI_GUIDE §3.3). */
function EmptyCanvas({ hasRepo }: { hasRepo: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6">
      <Empty className="max-w-sm">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Map strokeWidth={1.5} aria-hidden />
          </EmptyMedia>
          <EmptyTitle>{hasRepo ? "Open a file" : "Chart a repository"}</EmptyTitle>
          <EmptyDescription>
            {hasRepo
              ? "Pick a file from the tree and its functions appear here."
              : "Choose a repository in the sidebar, or add one, and its files appear in the tree."}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  );
}
