import { Github } from "lucide-react";
import { api } from "../lib/api";
import { cn } from "../lib/cn";
import { useDevLogin } from "../lib/session";
import { Button, buttonVariants } from "./ui/Button";
import { Panel } from "./ui/Panel";

/**
 * Signed out. One card, and nothing else.
 *
 * The marketing landing page is a separate surface and a separate PR
 * (UI_GUIDE §3.1). What this screen does carry is the graticule, so the chart
 * language is established before the canvas is ever reached -- the boldness
 * for this phase is spent there, not here.
 */
export function LoginScreen() {
  const devLogin = useDevLogin();

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden p-6">
      <div className="graticule pointer-events-none absolute inset-0 opacity-30" aria-hidden />

      <Panel className="relative w-full max-w-md p-8">
        <h1 className="font-display text-3xl tracking-tight text-ink">funcatlas</h1>

        <p className="mt-3 text-sm leading-relaxed text-ink-muted">
          A map of every function and call in a repository. Calls it cannot resolve are drawn as
          unresolved, never guessed.
        </p>

        {/* An anchor, not a button: an OAuth redirect is a real navigation and
            cannot be followed by fetch. */}
        <a
          href={api.loginUrl()}
          className={cn(buttonVariants({ variant: "primary" }), "mt-8 w-full")}
        >
          <Github className="size-4" aria-hidden />
          Sign in with GitHub
        </a>

        {import.meta.env.DEV ? (
          <div className="mt-4 border-t border-surface-border pt-4">
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              disabled={devLogin.isPending}
              onClick={() => devLogin.mutate()}
            >
              {devLogin.isPending ? "Signing in…" : "Continue as a local dev user"}
            </Button>
            <p className="mt-2 text-center text-xs text-ink-muted">
              Development only. Skips GitHub, so no OAuth app is needed.
            </p>
            {devLogin.isError ? (
              <p className="mt-2 text-center text-xs text-confidence-name">
                Could not sign in locally. Is the API running?
              </p>
            ) : null}
          </div>
        ) : null}
      </Panel>
    </div>
  );
}
