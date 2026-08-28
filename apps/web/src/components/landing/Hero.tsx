import { Bezel } from "./Bezel";
import { HeroGraph } from "./HeroGraph";
import { OpenAtlas } from "./OpenAtlas";

/**
 * The thesis, stated twice: once in the headline and once as a drawing.
 *
 * Split left and right the way the app itself is -- index on the left, map on
 * the right -- so the page's shape is already the product's shape before a
 * reader signs in.
 *
 * The headline drives Bricolage Grotesque's width and optical-size axes, which
 * is the whole reason the face was chosen (UI_GUIDE §1.2) and is otherwise
 * left unused.
 */
export function Hero() {
  return (
    <section className="mx-auto grid w-full max-w-5xl gap-14 px-6 pt-12 pb-24 sm:pt-20 sm:pb-32 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center lg:gap-16">
      <div>
        <p className="font-mono text-[11px] tracking-[0.18em] text-ink-muted">
          exact · name_match · unresolved
        </p>

        <h1 className="mt-5 font-display text-4xl leading-[1.05] tracking-tight text-balance text-ink [font-variation-settings:'wdth'_86,'opsz'_48] sm:text-5xl lg:text-[3.4rem]">
          A map of every call in a repository — and of where the map ends.
        </h1>

        <p className="mt-6 max-w-xl text-base leading-relaxed text-ink-muted">
          funcatlas clones a repository, extracts every function and call site with tree-sitter, and
          resolves each call to the function it reaches. Where it cannot tell which function that is,
          it says so instead of guessing.
        </p>

        <div className="mt-9 flex flex-wrap items-center gap-3">
          <OpenAtlas />
        </div>

        <p className="mt-6 max-w-md text-xs leading-relaxed text-ink-muted">
          Public repositories. GitHub sign-in at <span className="font-mono">read:user</span> —
          nothing is written to your account.
        </p>
      </div>

      <Bezel innerClassName="p-4 sm:p-6">
        <HeroGraph />
      </Bezel>
    </section>
  );
}
