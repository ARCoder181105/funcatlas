import { Section } from "./Section";

/**
 * Four steps, numbered because this genuinely is a sequence — each one takes
 * the output of the one before it. Numbering anything else on this page would
 * be decoration wearing a structural costume.
 */
const STEPS = [
  {
    title: "Clone, without running anything",
    body: "Nothing from the repository is executed: no install, no build, no test scripts. Parsing only reads text. The clone is depth-one over public HTTPS, symlinks fail the run rather than being followed, files over 1 MB are skipped, and the checkout is deleted afterwards, including when the parse fails.",
  },
  {
    title: "Extract",
    body: "tree-sitter walks every file for function declarations and call sites. One pinned grammar per extension, never shared, because a mismatched grammar fails silently and drops every call in the file.",
  },
  {
    title: "Resolve",
    body: "Each call site is matched against the symbol table and given a confidence tier. The table is partitioned by language, so no edge can cross a language boundary, and ambiguity resolves to unresolved.",
  },
  {
    title: "Explore",
    body: "The graph opens on a canvas: the file tree as an index, a file card, a function mind-map branching from it, and the source inline. ⌘K jumps to any function by name.",
  },
] as const;

export function HowItWorks() {
  return (
    <Section
      tier="exact"
      eyebrow="Pipeline"
      title="From a repository URL to a graph you can walk."
    >
      <ol className="grid gap-x-10 gap-y-10 sm:grid-cols-2">
        {STEPS.map((step, index) => (
          <li key={step.title} className="flex gap-5">
            <span
              className="mt-0.5 font-mono text-xs tabular-nums text-confidence-exact"
              aria-hidden
            >
              {String(index + 1).padStart(2, "0")}
            </span>

            <div>
              <h3 className="font-display text-lg tracking-tight text-ink">
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                {step.body}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </Section>
  );
}
