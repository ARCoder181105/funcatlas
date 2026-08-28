import { ThemeToggle } from "../ThemeToggle";
import { GitHubStars } from "./GitHubStars";
import { OpenAtlas } from "./OpenAtlas";

/**
 * A chart's title block, not a navigation bar.
 *
 * Deliberately not sticky and deliberately not a floating pill: there is
 * nowhere to navigate to -- no in-page anchors, three controls -- so a bar
 * that follows the reader down the page would be encoding nothing. The closing
 * section carries the call to action instead.
 */
export function LandingHeader() {
  return (
    <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-6 py-6">
      <span className="font-display text-lg tracking-tight text-ink">funcatlas</span>

      <div className="flex items-center gap-2">
        <GitHubStars />
        <ThemeToggle />

        {/* Hidden on the narrowest widths, where the hero's own call to action
            is already on screen and a second one crowds the wordmark out. */}
        <OpenAtlas size="sm" className="hidden sm:inline-flex" />
      </div>
    </header>
  );
}
