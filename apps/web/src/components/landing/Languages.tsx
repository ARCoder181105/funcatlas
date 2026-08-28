import { Bezel } from "./Bezel";
import { Section } from "./Section";

/**
 * Eight languages, in the two groups that are actually true of them.
 *
 * The grouping is the honest footnote, which is why there is no asterisk: past
 * the ECMAScript family the parser extracts functions and calls and resolves
 * only within a file. Saying "eight languages" and leaving that in the docs
 * would be the kind of claim this product exists not to make.
 */
const GROUPS = [
  {
    heading: "Resolved across files",
    detail: "Imports are followed, so a call reaches a definition in another file.",
    languages: ["TypeScript", "TSX", "JavaScript", "JSX"],
  },
  {
    heading: "Extracted, resolved within a file",
    detail: "Every function and call site is charted. Cross-file resolution is not built yet.",
    languages: ["Go", "Rust", "Python", "Java"],
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
      <div className="grid gap-4 md:grid-cols-2">
        {GROUPS.map((group) => (
          <Bezel key={group.heading} innerClassName="p-6">
            <h3 className="font-display text-lg tracking-tight text-ink">{group.heading}</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">{group.detail}</p>

            <ul className="mt-5 flex flex-wrap gap-2">
              {group.languages.map((language) => (
                <li
                  key={language}
                  className="rounded-full border border-surface-border px-3 py-1 font-mono text-[11px] text-ink"
                >
                  {language}
                </li>
              ))}
            </ul>
          </Bezel>
        ))}
      </div>
    </Section>
  );
}
