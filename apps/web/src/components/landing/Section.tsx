import type { ReactNode } from "react";
import type { ResolutionConfidence } from "@funcatlas/shared";
import { cn } from "../../lib/cn";
import { ConfidenceRule } from "../ConfidenceRule";
import { Reveal } from "./Reveal";
import { LANDING_SHELL } from "./shell";

/**
 * One section of the landing page: a rule, an eyebrow, a heading, a lede, and
 * the content.
 *
 * The rule is the page's structural device and it is not decoration -- its
 * dash pattern is a confidence tier, and each section takes the tier that is
 * true of it. The tiers section is solid, languages is dashed because support
 * genuinely is partial past the ECMAScript family, and the closing section is
 * dotted because what it states are the product's limits. A reader who has
 * scrolled the page has read the notation three times before ever reaching the
 * canvas.
 *
 * The generous padding is deliberate and belongs to this surface only
 * (UI_GUIDE §3.1): the canvas is dense by nature, and marketing whitespace on
 * a file tree is how a tool starts feeling like a brochure.
 */
export function Section({
  tier,
  eyebrow,
  title,
  lede,
  children,
  className,
}: {
  tier: ResolutionConfidence;
  eyebrow: string;
  title: string;
  lede?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "border-t border-surface-border/50 py-24 sm:py-32",
        className,
      )}
    >
      <div className={LANDING_SHELL}>
        <Reveal>
          <ConfidenceRule tier={tier} className="max-w-24" />

          <p className="mt-6 font-mono text-[11px] tracking-[0.2em] text-ink-muted uppercase">
            {eyebrow}
          </p>

          <h2 className="mt-4 max-w-2xl font-display text-3xl tracking-tight text-balance text-ink sm:text-4xl">
            {title}
          </h2>

          {lede === undefined ? null : (
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-ink-muted">
              {lede}
            </p>
          )}
        </Reveal>

        <Reveal className="mt-12 sm:mt-16">{children}</Reveal>
      </div>
    </section>
  );
}
