import { ArrowRight, Github } from "lucide-react";
import { api } from "../lib/api";
import { cn } from "../lib/cn";
import { useDevLogin } from "../lib/session";
import { ConfidenceLegend } from "./ConfidenceLegend";
import { ThemeToggle } from "./ThemeToggle";
import { Button, buttonVariants } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Separator } from "./ui/separator";

/**
 * Signed out. One card, and nothing else.
 *
 * The marketing landing page is a separate surface and a separate PR
 * (UI_GUIDE §3.1). What this screen does carry is the graticule and the
 * confidence legend -- the one thing a reader has to understand before the
 * canvas means anything.
 */
export function LoginScreen() {
  const devLogin = useDevLogin();

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden p-6">
      <div className="graticule pointer-events-none absolute inset-0 opacity-40" aria-hidden />

      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <Card className="relative w-full max-w-md">
        <CardHeader>
          <CardTitle className="font-display text-3xl tracking-tight">funcatlas</CardTitle>
          <CardDescription className="leading-relaxed">
            A map of every function and call in a repository. Calls it cannot resolve are drawn as
            unresolved, never guessed.
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-5">
          <ConfidenceLegend />

          <Separator />

          {/* An anchor, not a button: an OAuth redirect is a real navigation
              and cannot be followed by fetch. */}
          <a
            href={api.loginUrl()}
            className={cn(buttonVariants({ size: "lg" }), "group w-full")}
          >
            <Github strokeWidth={1.5} data-icon="inline-start" aria-hidden />
            Sign in with GitHub
            <ArrowRight
              strokeWidth={1.5}
              data-icon="inline-end"
              className="transition-transform duration-micro group-hover:translate-x-0.5"
              aria-hidden
            />
          </a>

          {import.meta.env.DEV ? (
            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                size="lg"
                className="w-full"
                disabled={devLogin.isPending}
                onClick={() => devLogin.mutate()}
              >
                {devLogin.isPending ? "Signing in…" : "Continue as a local dev user"}
              </Button>
              <p className="text-center text-xs text-ink-muted">
                Development only. Skips GitHub, so no OAuth app is needed.
              </p>
              {devLogin.isError ? (
                <p className="text-center text-xs text-destructive">
                  Could not sign in locally. Is the API running?
                </p>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
