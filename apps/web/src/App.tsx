import { AppHeader } from "./components/AppHeader";
import { Canvas } from "./components/Canvas";
import { LoginScreen } from "./components/LoginScreen";
import { Sidebar } from "./components/Sidebar";
import { Skeleton } from "./components/ui/Skeleton";
import { useSession } from "./lib/session";

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
    <div className="flex h-full w-full flex-col">
      <AppHeader user={session.data} />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-hidden">
          <Canvas />
        </main>
      </div>
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
