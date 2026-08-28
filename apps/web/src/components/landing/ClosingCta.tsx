import { OpenAtlas } from "./OpenAtlas";
import { Section } from "./Section";

/** The limits, under a dotted rule, because that is what a dotted line means
 *  everywhere else in this product. */
const LIMITS = [
  "Public repositories only. The OAuth scope is read:user, and the parser clones over public HTTPS.",
  "Nothing is written to your GitHub account — no commits, no issues, no status checks.",
  "A push updates the graph through a webhook, so what you are looking at is the current commit.",
] as const;

export function ClosingCta() {
  return (
    <Section
      tier="unresolved"
      eyebrow="Before you start"
      title="Chart a repository."
      lede="Sign in with GitHub, paste a repository URL, and walk the graph it produces."
    >
      <div className="flex flex-col gap-10 sm:flex-row sm:items-start sm:justify-between">
        <ul className="max-w-lg space-y-3">
          {LIMITS.map((limit) => (
            <li key={limit} className="text-sm leading-relaxed text-ink-muted">
              {limit}
            </li>
          ))}
        </ul>

        <OpenAtlas className="shrink-0 self-start" />
      </div>
    </Section>
  );
}
