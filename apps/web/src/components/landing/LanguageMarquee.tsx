import { cn } from "../../lib/cn";
import { LANGUAGE_MARK, type LanguageMark } from "../../lib/language-marks";
import { useMotionEnabled } from "../../lib/motion";

/**
 * The eight languages, as a strip that drifts.
 *
 * The two groups below this say which of them resolve across files; this is
 * only the roll call, so it can be one continuous line. Motion earns its place
 * by doing something static markup cannot: a strip that moves reads as a list
 * with no end, which is the impression "eight and counting" wants.
 *
 * A CSS keyframe over `transform`, not a scroll library. The track holds the
 * set twice and translates by exactly half its width, so the seam lands where
 * the first copy ends and the loop is invisible. `motion-safe:` means reduced
 * motion gets the same strip standing still, not an empty one -- the content is
 * the point and the drift is decoration.
 */
const LANGUAGES: { name: string; mark: LanguageMark }[] = [
  { name: "TypeScript", mark: LANGUAGE_MARK.typescript },
  { name: "TSX", mark: LANGUAGE_MARK.react },
  { name: "JavaScript", mark: LANGUAGE_MARK.javascript },
  { name: "JSX", mark: LANGUAGE_MARK.react },
  { name: "Go", mark: LANGUAGE_MARK.go },
  { name: "Rust", mark: LANGUAGE_MARK.rust },
  { name: "Python", mark: LANGUAGE_MARK.python },
  { name: "Java", mark: LANGUAGE_MARK.java },
];

export function LanguageMarquee() {
  const animate = useMotionEnabled();

  return (
    // The mask fades both ends into the ground, so items enter and leave
    // rather than being clipped mid-glyph against a hard edge.
    <div
      className="relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]"
      role="list"
      aria-label="Languages funcatlas reads"
    >
      {/* The spacing is per-item padding, not `gap`, and that is the whole
          trick. `gap` sits *between* items, so a 16-item track has 15 of them:
          half the width is one set plus seven and a half gaps, while a
          seamless loop needs one set plus a whole one. Translating -50% then
          lands half a gap short and the strip visibly jumps every cycle. With
          each item carrying its own trailing space the two halves are exactly
          equal and -50% is exactly one set. */}
      <div
        className={
          animate
            ? "flex w-max animate-[marquee_38s_linear_infinite] hover:[animation-play-state:paused]"
            : "flex flex-wrap justify-center gap-x-14 gap-y-6"
        }
      >
        {(animate ? [...LANGUAGES, ...LANGUAGES] : LANGUAGES).map((language, index) => (
          <Mark
            key={`${language.name}-${index}`}
            name={language.name}
            mark={language.mark}
            spaced={animate}
            // The second copy exists only to make the loop seamless, so it is
            // hidden from the list a screen reader walks.
            duplicate={index >= LANGUAGES.length}
          />
        ))}
      </div>
    </div>
  );
}

function Mark({
  name,
  mark,
  duplicate,
  spaced,
}: {
  name: string;
  mark: LanguageMark;
  duplicate: boolean;
  /** Trailing space carried by the item rather than by a `gap`, so the two
   *  halves of the looping track measure identically. */
  spaced: boolean;
}) {
  return (
    <div
      role={duplicate ? "presentation" : "listitem"}
      aria-hidden={duplicate || undefined}
      className={cn(
        "group flex shrink-0 items-center gap-2.5 text-ink-muted transition-colors duration-panel hover:text-ink",
        spaced && "pe-14",
      )}
    >
      <svg viewBox="0 0 24 24" className="size-6 fill-current" aria-hidden focusable="false">
        <path d={mark.path} />
      </svg>
      <span className="font-mono text-sm whitespace-nowrap">{name}</span>
    </div>
  );
}
