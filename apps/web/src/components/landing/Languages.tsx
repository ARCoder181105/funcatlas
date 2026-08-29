import { cn } from "../../lib/cn";
import { Bezel } from "./Bezel";
import { LanguageMarquee } from "./LanguageMarquee";
import { Section } from "./Section";

/**
 * Eight languages, in the two groups that are actually true of them.
 *
 * The grouping is the honest footnote, which is why there is no asterisk: past
 * the ECMAScript family the parser extracts functions and calls and resolves
 * only within a file. Saying "eight languages" and leaving that in the docs
 * would be the kind of claim this product exists not to make.
 *
 * The strip above the cards is the roll call and the cards are the caveat. The
 * marks live only in the strip: repeating all eight logos inside the cards
 * would say the same thing twice on one screen, and the cards are carrying the
 * distinction rather than the names.
 */
const GROUPS = [
  {
    heading: "Resolved across files",
    detail:
      "Imports are followed, so a call in one file reaches a definition in another and the edge is drawn exact.",
    languages: "TypeScript · TSX · JavaScript · JSX",
    tone: "text-confidence-exact",
  },
  {
    heading: "Extracted, resolved within a file",
    detail:
      "Every function and call site is charted, and a call inside its own file still resolves. Reaching across files is not built yet.",
    languages: "Go · Rust · Python · Java",
    tone: "text-confidence-name",
  },
] as const;

export function Languages() {
  return (
    <Section
      tier="name_match"
      eyebrow="Coverage"
      title="Eight languages, and two different depths."
      lede="Support is not uniform, so it is not presented as though it were. The rule above this heading is dashed for the same reason the canvas draws a name match dashed: reported, not verified."
    >
      <LanguageMarquee />

      <div className="mt-14 grid gap-4 md:grid-cols-2">
        {GROUPS.map((group) => (
          <Bezel key={group.heading} innerClassName="flex h-full flex-col gap-3 p-7">
            <h3 className="font-display text-xl tracking-tight text-ink [font-variation-settings:'wght'_540]">
              {group.heading}
            </h3>

            <p className="text-sm leading-relaxed text-ink-muted">{group.detail}</p>

            {/* Coloured by the tier each group's calls actually produce across
                files: exact for the first, name match for the second. The one
                place in this section where a colour is a claim. */}
            <p className={cn("mt-auto pt-2 font-mono text-xs", group.tone)}>{group.languages}</p>
          </Bezel>
        ))}
      </div>
    </Section>
  );
}
