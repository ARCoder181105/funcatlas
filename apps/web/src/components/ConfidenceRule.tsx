import type { ResolutionConfidence } from "@funcatlas/shared";
import { cn } from "../lib/cn";
import { CONFIDENCE } from "../lib/confidence";

/**
 * One tier, drawn as the line the canvas draws it as.
 *
 * A colour swatch would show the hue and lose the pattern, and the pattern is
 * the part that carries the meaning. `currentColor` through the tier's text
 * class, so it follows the theme without reading it.
 *
 * Shared by the legend (fixed 28px) and the landing page (full width, as a
 * section rule): the same three lines, drawn once.
 */
export function ConfidenceRule({
  tier,
  className,
}: {
  tier: ResolutionConfidence;
  className?: string;
}) {
  return (
    <svg
      height="2"
      aria-hidden
      focusable="false"
      className={cn("w-full", CONFIDENCE[tier].textClass, className)}
    >
      <line
        x1="0"
        y1="1"
        x2="100%"
        y2="1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeDasharray={CONFIDENCE[tier].strokeDasharray}
      />
    </svg>
  );
}
