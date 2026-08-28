import { APP_ROUTE } from "@funcatlas/shared";
import { ArrowRight } from "lucide-react";
import { cn } from "../../lib/cn";
import { Link } from "../../lib/router";
import { buttonVariants } from "../ui/button";

/**
 * The page's only call to action, and it says the same thing in both places it
 * appears — the hero and the closing section. One name for one action, kept
 * through the flow (UI_GUIDE §3.4).
 *
 * It goes to `/app` rather than straight to the OAuth endpoint: the sign-in
 * card is the surface that carries "Sign in with GitHub" (§3.1), and sending a
 * reader through it is how they learn the confidence legend before the canvas
 * uses it.
 */
export function OpenAtlas({ size = "lg", className }: { size?: "sm" | "lg"; className?: string }) {
  return (
    <Link to={APP_ROUTE} className={cn(buttonVariants({ size }), "group", className)}>
      Open the atlas
      {/* The arrow rides in its own well, so the control reads as a thing with
          a moving part rather than as text with a glyph after it. */}
      <span
        className="ml-1 inline-flex size-6 items-center justify-center rounded-full bg-surface/20 transition-transform duration-micro group-hover:translate-x-0.5"
        aria-hidden
      >
        <ArrowRight strokeWidth={1.5} className="size-3.5" />
      </span>
    </Link>
  );
}
