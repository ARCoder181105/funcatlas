import type { ReactNode } from "react";
import { APP_ROUTE } from "@funcatlas/shared";
import { ArrowRight } from "lucide-react";
import { cn } from "../../lib/cn";
import { GITHUB_REPO_URL, SHOWCASE } from "../../lib/constants";
import { Link } from "../../lib/router";
import { buttonVariants } from "../ui/button";

/**
 * The page's only call to action, and it says the same thing in both places it
 * appears -- the hero and the closing section. One name for one action, kept
 * through the flow (UI_GUIDE §3.4).
 *
 * Two destinations, because there are two kinds of build.
 *
 * Normally it goes to `/app` rather than straight to the OAuth endpoint: the
 * sign-in card is the surface that carries "Sign in with GitHub" (§3.1), and
 * sending a reader through it is how they learn the confidence legend before
 * the canvas uses it.
 *
 * In a showcase build there is no API behind `/app`, so sending anyone there
 * would be sending them to an error. It points at the repository instead and
 * says so: **the label changes with the destination.** A button that still read
 * "Open the atlas" and opened GitHub would be the same lie in a friendlier
 * voice.
 */
export function OpenAtlas({
  size = "lg",
  className,
}: {
  size?: "sm" | "lg";
  className?: string;
}) {
  const classes = cn(buttonVariants({ size }), "group", className);

  if (SHOWCASE) {
    return (
      <a href={GITHUB_REPO_URL} target="_blank" rel="noreferrer" className={classes}>
        Run it yourself
        <Well />
      </a>
    );
  }

  return (
    <Link to={APP_ROUTE} className={classes}>
      Open the atlas
      <Well />
    </Link>
  );
}

/** The arrow rides in its own well, so the control reads as a thing with a
 *  moving part rather than as text with a glyph after it. */
function Well(): ReactNode {
  return (
    <span
      className="ml-1 inline-flex size-6 items-center justify-center rounded-full bg-surface/20 transition-transform duration-micro group-hover:translate-x-0.5"
      aria-hidden
    >
      <ArrowRight strokeWidth={1.5} className="size-3.5" />
    </span>
  );
}
