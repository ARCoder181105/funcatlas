import type { ResolutionConfidence } from "@funcatlas/shared";
import { cn } from "../../lib/cn";
import { CONFIDENCE, CONFIDENCE_ORDER } from "../../lib/confidence";
import { useMotionEnabled } from "../../lib/motion";
import { ConfidenceRule } from "../ConfidenceRule";
import { Fades } from "../animate-ui/primitives/effects/fade";
import { Bezel } from "./Bezel";
import { Section } from "./Section";

/**
 * What produces each tier, in a sentence a reader can check against their own
 * codebase. The tier's name and meaning come from `lib/confidence`, which the
 * canvas legend also reads -- so this page cannot end up describing a scale
 * the product does not draw.
 */
const CAUSE: Record<ResolutionConfidence, string> = {
  exact: "The import was followed to a declaration, and only one function could be the target.",
  name_match:
    "A function with that name is in scope. Another one elsewhere may be the function actually called.",
  unresolved:
    "The call is real and its target is ambiguous: a barrel re-export, a default import, a path alias.",
};

export function Tiers() {
  const animate = useMotionEnabled();

  const cards = CONFIDENCE_ORDER.map((tier) => {
    const { label, meaning, textClass } = CONFIDENCE[tier];

    return (
      <li key={tier}>
        <Bezel className="h-full" innerClassName="flex h-full flex-col gap-4 p-6">
          <ConfidenceRule tier={tier} />

          <p className={cn("font-mono text-xs tracking-tight", textClass)}>{label}</p>

          <p className="text-sm leading-relaxed text-ink">{meaning}</p>

          <p className="mt-auto text-xs leading-relaxed text-ink-muted">{CAUSE[tier]}</p>
        </Bezel>
      </li>
    );
  });

  return (
    <Section
      tier="exact"
      eyebrow="Resolution"
      title="Certainty is the product, not a footnote on it."
      lede="Every call gets one of three answers, and each is drawn as a different line. The scale is learned once and read everywhere: on the canvas, in the legend, and here."
    >
      {/* Staggered in tier order, so the three arrive most certain first and
          the scale is read in the direction it means something. One gesture
          for the set rather than three cards each deciding for themselves --
          the same treatment the coverage chips get. */}
      <ul className="grid gap-4 md:grid-cols-3">
        {animate ? (
          <Fades inView inViewMargin="-64px" holdDelay={70}>
            {cards}
          </Fades>
        ) : (
          cards
        )}
      </ul>

      <p className="mt-8 max-w-2xl text-sm leading-relaxed text-ink-muted">
        An unresolved call is an admission, not an error, and it is never coloured like one. A tool
        that guesses is worse than a tool that stops, because a wrong edge is read as fact and costs
        more than the missing one it replaced.
      </p>
    </Section>
  );
}
