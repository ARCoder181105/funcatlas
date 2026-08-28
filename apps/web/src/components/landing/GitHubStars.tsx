import { Github, Star } from "lucide-react";
import { SlidingNumber } from "../animate-ui/primitives/texts/sliding-number";
import { GITHUB_REPO_URL } from "../../lib/constants";
import { useGitHubStars } from "../../lib/github";
import { useMotionEnabled } from "../../lib/motion";

/**
 * A link to the source, carrying the star count once it arrives.
 *
 * The count rolls up from zero rather than appearing, because it lands late
 * and a number that pops in reads as a layout shift. Reduced motion gets the
 * final figure with no roll.
 *
 * The link is the component and the count is an ornament on it: GitHub
 * rate-limits anonymous callers, so `isSuccess` is the common failure and the
 * control has to stay useful without it.
 */
export function GitHubStars() {
  const stars = useGitHubStars();
  const animate = useMotionEnabled();

  return (
    <a
      href={GITHUB_REPO_URL}
      target="_blank"
      rel="noreferrer"
      aria-label={
        stars.isSuccess
          ? `funcatlas on GitHub, ${stars.data} stars`
          : "funcatlas on GitHub"
      }
      className="group inline-flex items-center gap-2 rounded-full border border-surface-border px-3 py-1.5 text-ink-muted transition-colors duration-micro hover:border-confidence-exact/40 hover:text-ink focus-visible:ring-2 focus-visible:ring-confidence-exact focus-visible:outline-none active:scale-[0.98]"
    >
      <Github strokeWidth={1.5} className="size-4" aria-hidden />

      {stars.isSuccess ? (
        <span className="flex items-center gap-1 font-mono text-xs" aria-hidden>
          <Star
            strokeWidth={1.5}
            className="size-3.5 transition-colors duration-micro group-hover:text-confidence-name"
            aria-hidden
          />
          <SlidingNumber number={stars.data} fromNumber={animate ? 0 : undefined} />
        </span>
      ) : null}
    </a>
  );
}
