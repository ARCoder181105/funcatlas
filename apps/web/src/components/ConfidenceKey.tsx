import { cn } from "../lib/cn";
import { CONFIDENCE, CONFIDENCE_ORDER } from "../lib/confidence";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

/**
 * The canvas key: three strokes and three words, on one line.
 *
 * The sign-in card gets the full prose version (`ConfidenceLegend`) because a
 * reader meeting the idea for the first time needs the sentences. On the canvas
 * they have already read it, so this is a reminder rather than an explanation
 * -- the meanings move into tooltips and the panel stops competing with the
 * graph for space.
 *
 * Both read `lib/confidence.ts`, so the two cannot describe the tiers
 * differently.
 */
export function ConfidenceKey({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-full border bg-card/90 px-3 py-1.5 backdrop-blur-sm",
        className,
      )}
    >
      {CONFIDENCE_ORDER.map((tier) => {
        const { label, meaning, strokeDasharray, textClass } = CONFIDENCE[tier];

        return (
          <Tooltip key={tier}>
            <TooltipTrigger
              render={
                <span className="flex cursor-help items-center gap-1.5">
                  {/* The stroke itself, not a colour chip: the pattern is what
                      carries the meaning, and a dot would show only the hue. */}
                  <svg width="18" height="2" viewBox="0 0 18 2" className={textClass} aria-hidden>
                    <line
                      x1="0"
                      y1="1"
                      x2="18"
                      y2="1"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeDasharray={strokeDasharray}
                    />
                  </svg>
                  <span className={cn("text-[10px] leading-none", textClass)}>{label}</span>
                </span>
              }
            />
            <TooltipContent side="top" className="max-w-56">
              {meaning}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
