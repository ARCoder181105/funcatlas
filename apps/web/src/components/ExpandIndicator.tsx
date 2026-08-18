import { ChevronRight, Dot } from "lucide-react";
import { cn } from "../lib/cn";

/**
 * One control, two states, in both places a function can be opened: the file
 * card's rows and the cards on the canvas.
 *
 * They used to disagree -- a row said "open" with a tick that only appeared
 * once it was open, and a card said it with a rotating chevron -- so the file
 * card looked like it had no way to close anything. Shared here rather than
 * copied, because the moment there are two of these one of them goes stale.
 */
export function ExpandIndicator({
  open,
  leaf = false,
  className,
}: {
  open: boolean;
  /** The function calls nothing, so opening it would draw nothing. */
  leaf?: boolean;
  className?: string;
}) {
  if (leaf) {
    return (
      <Dot
        strokeWidth={1.5}
        className={cn("size-4 shrink-0 text-muted-foreground/50", className)}
        aria-hidden
      />
    );
  }

  return (
    // Rotates rather than swapping glyphs, so the control reads as one thing in
    // two states instead of two different buttons.
    <ChevronRight
      strokeWidth={1.5}
      className={cn(
        "size-3.5 shrink-0 text-muted-foreground transition-transform duration-micro",
        open ? "rotate-90" : "rotate-0",
        className,
      )}
      aria-hidden
    />
  );
}

/** What the chevron means, in words, for anyone not looking at it. */
export function expandLabel(name: string, open: boolean, leaf = false): string {
  if (leaf) return `${name} — calls nothing`;
  return open ? `${name} — close its calls` : `${name} — open its calls`;
}
