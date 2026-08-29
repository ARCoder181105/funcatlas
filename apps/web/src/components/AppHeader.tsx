import type { SessionUser } from "@funcatlas/shared";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useLogout } from "../lib/session";
import { ThemeToggle } from "./ThemeToggle";
import { Button } from "./ui/button";
import { Separator } from "./ui/separator";

/** Who is signed in, the way out, and the control for the file tree. */
export function AppHeader({
  user,
  sidebarCollapsed,
  onToggleSidebar,
}: {
  user: SessionUser;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
}) {
  const logout = useLogout();
  // The label names what the control does, not what the tree currently is
  // (UI_GUIDE §3.4).
  const sidebarLabel = sidebarCollapsed ? "Show the file tree" : "Hide the file tree";

  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-surface-border px-3">
      <div className="flex items-center gap-2">
        {/* In the header rather than floating over the tree: it has to stay
            reachable once the panel is dragged to nothing, and a control
            inside the thing it hides cannot be. */}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onToggleSidebar}
          aria-label={sidebarLabel}
          title={sidebarLabel}
        >
          {sidebarCollapsed ? (
            <PanelLeftOpen strokeWidth={1.5} aria-hidden />
          ) : (
            <PanelLeftClose strokeWidth={1.5} aria-hidden />
          )}
        </Button>

        <Separator orientation="vertical" className="h-4" />

        <span className="font-display text-sm tracking-tight text-ink">funcatlas</span>
      </div>

      <div className="flex items-center gap-2">
        <span className="font-mono text-xs text-ink-muted">{user.login}</span>
        <ThemeToggle />
        {/* No sign-out under FUNCATLAS_SINGLE_USER: the server registers no
            /auth/logout, so the button would POST at a 404, and there is no
            session to end in the first place. */}
        {user.singleUser ? null : (
          <Button
            variant="ghost"
            size="sm"
            disabled={logout.isPending}
            onClick={() => logout.mutate()}
          >
            {logout.isPending ? "Signing out…" : "Sign out"}
          </Button>
        )}
      </div>
    </header>
  );
}
