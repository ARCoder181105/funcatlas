import type { HTMLAttributes } from "react";
import { cn } from "../../lib/cn";

/** A raised surface with a hairline edge -- the sign-in card, the file card,
 *  the canvas legend. Hairline rather than shadow: a chart is drawn, not lit. */
export function Panel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-token border border-surface-border bg-surface-raised", className)}
      {...props}
    />
  );
}
