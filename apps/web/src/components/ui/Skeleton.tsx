import type { HTMLAttributes } from "react";
import { cn } from "../../lib/cn";

/**
 * A placeholder in the shape of what is loading. Skeletons, not spinners,
 * wherever the shape is known (UI_GUIDE §3.3).
 *
 * `motion-safe:` rather than a plain `animate-pulse`: the shimmer is
 * non-essential motion, so it does not run for a reader who asked for less of
 * it. The placeholder itself still shows.
 */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("motion-safe:animate-pulse rounded-token bg-surface-border/60", className)}
      {...props}
    />
  );
}
