import { useRef, useState } from "react";
import type { SessionUser } from "@funcatlas/shared";
import type { PanelImperativeHandle } from "react-resizable-panels";
import { AppHeader } from "./components/AppHeader";
import { Canvas } from "./components/Canvas";
import { CommandPalette } from "./components/CommandPalette";
import { LoginScreen } from "./components/LoginScreen";
import { Sidebar } from "./components/Sidebar";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "./components/ui/resizable";
import { SidebarProvider } from "./components/ui/sidebar";
import { Skeleton } from "./components/ui/skeleton";
import { TooltipProvider } from "./components/ui/tooltip";
import { useSession } from "./lib/session";
import {
  CANVAS_DEFAULT,
  SIDEBAR_DEFAULT,
  SIDEBAR_MAX,
  SIDEBAR_MIN,
} from "./lib/constants";

/**
 * Percentages of the group. Strings with an explicit unit, because this library
 * reads a bare number as pixels and the difference is invisible until it is
 * wrong.
 *
 * Both panels declare a size: given only one, the library ignores it and falls
 * back to an even split.
 */

/**
 * Three states, and the server decides which: resolving, signed out, signed in.
 *
 * There is no local "is logged in" flag to drift out of sync -- the cookie is
 * HttpOnly, so `useSession` asking the API is the only honest answer.
 */
export default function App() {
  const session = useSession();

  if (session.isPending) {
    return <ResolvingSession />;
  }

  if (session.isError) {
    return <SessionUnavailable />;
  }

  if (session.data === null) {
    return <LoginScreen />;
  }

  return (
    <TooltipProvider>
      {/* The provider exists because the sidebar's menu components read it;
          width and collapse are owned by the resizable panel below, which is
          the thing the reader actually drags.

          Its wrapper ships as `min-h-svh`, which grows past the viewport
          instead of clipping -- the document then scrolls, and the tree and
          the canvas move together as one page. Pinned to the viewport here so
          each pane owns its own overflow. */}
      <SidebarProvider open className="h-svh min-h-0 overflow-hidden">
        <Explorer user={session.data} />
      </SidebarProvider>
    </TooltipProvider>
  );
}

function Explorer({ user }: { user: SessionUser }) {
  const panel = useRef<PanelImperativeHandle | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  /**
   * One rule, everywhere: collapsed is whatever the panel says it is.
   *
   * Dragging the separator past `minSize` collapses the panel too, so the
   * button cannot own this state -- it would keep offering to hide a tree that
   * is already hidden. Called from both the group's layout callback and the
   * toggle, because neither fires for the other's path.
   */
  const sync = () => setCollapsed(panel.current?.isCollapsed() ?? false);

  const toggle = () => {
    const handle = panel.current;
    if (handle === null) return;

    if (handle.isCollapsed()) {
      handle.expand();
    } else {
      handle.collapse();
    }
    sync();
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
      <AppHeader user={user} sidebarCollapsed={collapsed} onToggleSidebar={toggle} />

      {/* Mounted with the explorer rather than inside the sidebar: ⌘K is a
          window-level shortcut, and a palette that only exists while the tree
          is open would stop answering when the tree is collapsed. */}
      <CommandPalette />

      <ResizablePanelGroup className="min-h-0 flex-1" onLayoutChange={sync}>
        <ResizablePanel
          id="file-tree"
          panelRef={panel}
          defaultSize={SIDEBAR_DEFAULT}
          minSize={SIDEBAR_MIN}
          maxSize={SIDEBAR_MAX}
          collapsible
          collapsedSize={0}
          className="min-w-0 overflow-hidden"
        >
          <Sidebar />
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel id="canvas" defaultSize={CANVAS_DEFAULT} className="min-w-0 overflow-hidden">
          <main className="h-full min-w-0 overflow-hidden">
            <Canvas />
          </main>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

/** The shape of the app, not a spinner (UI_GUIDE §3.3). */
function ResolvingSession() {
  return (
    <div className="flex h-full w-full flex-col" aria-busy>
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-surface-border px-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-16" />
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="w-64 shrink-0 space-y-2 border-r border-surface-border p-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-3/5" />
        </div>
        <div className="flex-1" />
      </div>
    </div>
  );
}

/**
 * The API could not be reached at all -- which is different from being signed
 * out, and showing a sign-in button here would send the user to a dead link.
 */
function SessionUnavailable() {
  return (
    <div className="flex h-full w-full items-center justify-center p-6 text-center">
      <div className="max-w-sm">
        <p className="font-display text-lg text-ink">The API is not responding</p>
        <p className="mt-2 text-sm text-ink-muted">
          Start it with <span className="font-mono text-ink">pnpm dev</span>, then reload.
        </p>
      </div>
    </div>
  );
}
