import { useRef, useState } from "react";
import type { SessionUser } from "@funcatlas/shared";
import type { PanelImperativeHandle } from "react-resizable-panels";
import { AppHeader } from "./components/AppHeader";
import { Canvas } from "./components/Canvas";
import { CommandPalette } from "./components/CommandPalette";
import { LoginScreen } from "./components/LoginScreen";
import { ResolvingSession } from "./components/ResolvingSession";
import { Sidebar } from "./components/Sidebar";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "./components/ui/resizable";
import { SidebarProvider } from "./components/ui/sidebar";
import { TooltipProvider } from "./components/ui/tooltip";
import { Link } from "./lib/router";
import { useSession } from "./lib/session";
import {
  CANVAS_DEFAULT,
  GITHUB_REPO_URL,
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
 * The canvas route, and everything only it needs.
 *
 * Its own module so `App.tsx` can load it lazily. React Flow alone is most of
 * the main bundle, and the landing page cannot use any of it -- on a showcase
 * build nobody ever reaches this route at all, so none of this is fetched.
 *
 * Three states, and the server decides which: resolving, signed out, signed in.
 * There is no local "is logged in" flag to drift out of sync -- the cookie is
 * HttpOnly, so `useSession` asking the API is the only honest answer.
 */
export default function AppRoute() {
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

/**
 * The API could not be reached at all -- which is different from being signed
 * out, and showing a sign-in button here would send the user to a dead link.
 *
 * Written for two readers, because both really arrive here. One is running the
 * stack and has forgotten a process. The other followed a link to a deploy
 * where only the web app is up, and "run `pnpm dev`" means nothing to them --
 * they need to know the page is not broken and where the source is.
 */
function SessionUnavailable() {
  return (
    <div className="flex h-full w-full items-center justify-center p-6">
      <div className="max-w-md text-center">
        <p className="font-display text-lg text-ink">The canvas cannot reach its API</p>

        <p className="mt-3 text-sm leading-relaxed text-ink-muted">
          Charting a repository needs the API, the parse worker, Postgres and Redis. None of them
          answered, so there is nothing to draw.
        </p>

        <p className="mt-3 text-sm leading-relaxed text-ink-muted">
          Running it locally? Start them with <span className="font-mono text-ink">make start</span>{" "}
          and reload. Otherwise the{" "}
          <a
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="text-confidence-exact underline underline-offset-4"
          >
            source
          </a>{" "}
          has the setup, and the{" "}
          <Link to="/" className="text-confidence-exact underline underline-offset-4">
            overview
          </Link>{" "}
          explains what it does.
        </p>
      </div>
    </div>
  );
}
