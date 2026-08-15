import type { SessionUser } from "@funcatlas/shared";
import { useLogout } from "../lib/session";
import { Button } from "./ui/button";

/** Who is signed in, and the way out. */
export function AppHeader({ user }: { user: SessionUser }) {
  const logout = useLogout();

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-surface-border px-4">
      <span className="font-display text-sm tracking-tight text-ink">funcatlas</span>

      <div className="flex items-center gap-3">
        <span className="font-mono text-xs text-ink-muted">{user.login}</span>
        <Button
          variant="ghost"
          size="sm"
          disabled={logout.isPending}
          onClick={() => logout.mutate()}
        >
          {logout.isPending ? "Signing out…" : "Sign out"}
        </Button>
      </div>
    </header>
  );
}
