import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

/**
 * A panel sitting in a tray, rather than lying flat on the page.
 *
 * `docs/UI_GUIDE.md` §3.1 asks the landing page -- and only the landing page --
 * for nested double-bezel cards. Two enclosures, concentric radii from the
 * existing scale, and a hairline on each. No shadow, no glass, no glow: §1.3
 * cuts a decoration that encodes nothing, and depth here comes from the
 * nesting itself.
 *
 * The canvas does not use this. Cards there are dense by nature, and a tray
 * around each one would cost the reader space they need for the graph.
 */
export function Bezel({
  children,
  className,
  innerClassName,
}: {
  children: ReactNode;
  className?: string;
  innerClassName?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-4xl border border-surface-border/60 bg-surface-raised/30 p-1.5",
        className,
      )}
    >
      <div
        className={cn(
          "h-full rounded-3xl border border-surface-border bg-surface-raised",
          innerClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}
