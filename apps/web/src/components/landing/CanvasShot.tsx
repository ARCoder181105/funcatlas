import { Bezel } from "./Bezel";
import { Section } from "./Section";

/**
 * The product itself, photographed rather than described.
 *
 * Two files, not one with a filter: the canvas is not a screenshot that can be
 * recoloured, and a dark image inverted for a light page would misstate the
 * three tier colours -- which are the one thing this picture is here to show.
 * Class-based `dark:` rather than `prefers-color-scheme`, because the theme
 * toggle sets the class and the media query would ignore it.
 *
 * `hidden` on the inactive one rather than an opacity swap: both are decoded
 * either way, but only one is laid out, so the section has a single height.
 */
const SHOT_ALT =
  "The funcatlas canvas: hono's accepts function branching into a solid exact " +
  "call, a dashed name match, and dotted unresolved calls.";

export function CanvasShot() {
  return (
    <Section
      tier="exact"
      eyebrow="The canvas"
      title="One function, and everything it reaches."
      lede="hono's accepts helper, opened from its file card. Three calls leave it and each one is drawn for how well it is known: parseAccept is resolved exactly, match only by name, and header not at all."
    >
      <Bezel innerClassName="overflow-hidden p-1">
        {/* Intrinsic size given so the row does not reflow when the file
            lands -- the images are 2720x1440. */}
        <img
          src="/canvas-dark.png"
          alt={SHOT_ALT}
          width={2720}
          height={1440}
          loading="lazy"
          className="hidden w-full rounded-[1.25rem] dark:block"
        />
        <img
          src="/canvas-light.png"
          alt={SHOT_ALT}
          width={2720}
          height={1440}
          loading="lazy"
          className="w-full rounded-[1.25rem] dark:hidden"
        />
      </Bezel>
    </Section>
  );
}
