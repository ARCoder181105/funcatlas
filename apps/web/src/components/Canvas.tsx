import { Map } from "lucide-react";
import { ReactFlowProvider } from "reactflow";
import "reactflow/dist/base.css";
import { useUiStore } from "../store/ui";
import { MindMap } from "./MindMap";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "./ui/empty";

/**
 * The chart surface.
 *
 * One React Flow, always. It used to be two -- a file-card canvas that a
 * function-graph canvas replaced -- which meant the file you were reading
 * disappeared the moment you opened a function in it. `MindMap` now draws the
 * file card and the functions together, so the chain reads file to function to
 * callees and nothing is taken away.
 *
 * That also retires the provider-per-surface workaround: with a single
 * `<ReactFlow>` there is no second instance to inherit a populated store.
 */
export function Canvas() {
  const selectedRepoId = useUiStore((state) => state.selectedRepoId);
  const selectedFileId = useUiStore((state) => state.selectedFileId);

  if (selectedFileId === null) {
    return <EmptyCanvas hasRepo={selectedRepoId !== null} />;
  }

  return (
    // React Flow measures this parent and renders nothing into a zero-height
    // one, with no error at all. The h-full chain from #root to here is what
    // makes the canvas visible, so it is stated rather than inherited.
    //
    // The whole width, again: source used to open in a panel beside this one,
    // which took a third of the canvas away from the map. It now drops down
    // inside the card that owns it.
    <div className="relative h-full w-full">
      <ReactFlowProvider>
        <MindMap />
      </ReactFlowProvider>
    </div>
  );
}

/** An invitation to act, in the interface's voice (UI_GUIDE §3.3). */
function EmptyCanvas({ hasRepo }: { hasRepo: boolean }) {
  return (
    <div className="flex h-full w-full items-center justify-center p-6">
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
