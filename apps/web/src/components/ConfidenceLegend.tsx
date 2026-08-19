import { cn } from "../lib/cn";
import { CONFIDENCE, CONFIDENCE_ORDER } from "../lib/confidence";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "./ui/item";

/**
 * The three edge styles and what they mean.
 *
 * One component, used on the sign-in card and on the canvas: an unexplained
 * dotted line is noise, and explaining it in two places is how the two
 * explanations drift apart. Everything it renders comes from `lib/confidence`,
 * which reads the stroke styles from `packages/shared` -- so this cannot
 * disagree with what the canvas actually draws.
 */
export function ConfidenceLegend({ className }: { className?: string }) {
  return (
    <ItemGroup className={cn("gap-0", className)}>
      {CONFIDENCE_ORDER.map((tier) => {
        const { label, meaning, strokeDasharray, textClass } = CONFIDENCE[tier];

        return (
          <Item key={tier} size="sm" className="items-baseline gap-3 px-0">
            <ItemMedia className="pt-1.5">
              {/* The actual line, not a colour chip. A swatch would show the
                  hue but not the pattern, and the pattern is the part that
                  carries the meaning. currentColor, so it follows the theme. */}
              <svg
                width="28"
                height="2"
                viewBox="0 0 28 2"
                className={textClass}
                aria-hidden
                focusable="false"
              >
                <line
                  x1="0"
                  y1="1"
                  x2="28"
                  y2="1"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeDasharray={strokeDasharray}
                />
              </svg>
            </ItemMedia>

            <ItemContent>
              <ItemTitle className={cn("font-mono text-[11px] tracking-tight", textClass)}>
                {label}
              </ItemTitle>
              <ItemDescription className="text-xs leading-snug">{meaning}</ItemDescription>
            </ItemContent>
          </Item>
        );
      })}
    </ItemGroup>
  );
}
