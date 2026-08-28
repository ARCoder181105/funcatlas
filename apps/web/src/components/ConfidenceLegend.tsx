import { cn } from "../lib/cn";
import { CONFIDENCE, CONFIDENCE_ORDER } from "../lib/confidence";
import { ConfidenceRule } from "./ConfidenceRule";
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
        const { label, meaning, textClass } = CONFIDENCE[tier];

        return (
          <Item key={tier} size="sm" className="items-baseline gap-3 px-0">
            <ItemMedia className="pt-1.5">
              <ConfidenceRule tier={tier} className="w-7" />
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
