import { Bezel } from "./Bezel";
import { Section } from "./Section";

/**
 * The product, photographed.
 *
 * `UI_GUIDE.md` §3.1 forbids the *hero* being a screenshot, and it stays a
 * live drawing. This is a different argument: there is no hosted instance, so
 * a visitor cannot reach the canvas by clicking anything. Showing it is the
 * only way they ever see what the tool actually does, and the reason the
 * walkthrough section was cut -- "they can just go and use it" -- stopped being
 * true when the deploy became web-only.
 *
 * A real capture rather than a drawing, because a drawing of your own product
 * is a claim and a screenshot is evidence.
 *
 * Two files and a `<picture>`, not one image with a filter: the two themes are
 * genuinely different palettes (`lib/tokens.ts`), and a dark screenshot
 * inverted is neither of them. `media` here is the OS preference rather than
 * the in-app toggle, which is a known limit -- switching the theme by hand does
 * not switch this image. Wiring it to the toggle would mean reading theme state
 * into a component that otherwise needs none, for a picture most readers scroll
 * past once.
 */
export function CanvasShot() {
  return (
    <Section
      tier="exact"
      eyebrow="The canvas"
      title="A file, its functions, and the calls between them."
      lede="The tree on the left is the index. Open a file and its card springs onto the canvas; open a function and the map branches out from it, each edge drawn in the style of the answer behind it."
    >
      <Bezel innerClassName="overflow-hidden p-0">
        <picture>
          <source srcSet="/canvas-dark.png" media="(prefers-color-scheme: dark)" />
          <img
            src="/canvas-light.png"
            alt="The funcatlas canvas: a file tree on the left, a file card on the canvas, and a mind-map of its functions branching to the right with solid, dashed and dotted edges."
            width={2560}
            height={1440}
            loading="lazy"
            decoding="async"
            className="block h-auto w-full rounded-3xl"
          />
        </picture>
      </Bezel>
    </Section>
  );
}
