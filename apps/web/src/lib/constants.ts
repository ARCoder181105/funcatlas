/**
 * App-shell literals: panel sizes, persistence keys, motion timings, and the
 * couple of numbers that do not belong to canvas geometry.
 *
 * Canvas measurements live in `graph-constants.ts`, colours live only in
 * `tokens.ts`, and durations shared with Tailwind live in `motion.ts`. Values
 * the API also uses belong in `@funcatlas/shared`, not here -- written on both
 * sides of the wire they drift, and the drift is a UI that lies.
 */

// --- Shell layout ---------------------------------------------------------

/** Both panels declare a size: given only one, the library ignores it and
 *  falls back to an even split. */
export const SIDEBAR_DEFAULT = "22%";
export const SIDEBAR_MIN = "14%";
export const SIDEBAR_MAX = "45%";
export const CANVAS_DEFAULT = "78%";

// --- Persistence ----------------------------------------------------------

/** Shared with the inline script in `index.html`, which cannot import this
 *  module. `theme.test.ts` asserts the two agree. */
export const THEME_STORAGE_KEY = "funcatlas-theme";

/** The whole selection survives a reload -- repository, file, and every branch
 *  the reader opened. Rebuilding a map by hand after every refresh was the
 *  complaint that put this here. */
export const UI_STORAGE_KEY = "funcatlas-ui";

// --- Landing page ---------------------------------------------------------

/** The repository the landing page links to and reads a star count from.
 *  Only the web app needs it, so it stays here rather than in the shared
 *  package. */
export const GITHUB_REPO = "ARCoder181105/funcatlas";
export const GITHUB_REPO_URL = `https://github.com/${GITHUB_REPO}`;

/**
 * This build has no API behind it.
 *
 * A deploy of the web app on its own -- the public face of a tool you run
 * yourself. `/app` would reach nothing, so the landing page sends readers to
 * the repository instead of to an error screen.
 *
 * Build-time rather than a runtime probe, and deliberately so: the landing page
 * makes no request to our API at all, which is what lets it render when the
 * backend is absent. Asking whether the API is up would give that away for a
 * fact the build already knows.
 */
export const SHOWCASE = import.meta.env.VITE_SHOWCASE === "true";

// --- Motion ---------------------------------------------------------------

/** Milliseconds. Page-level motion in UI_GUIDE §4 is 400-600ms, and this moves
 *  the whole graph. */
export const GLIDE_MS = 420;

/** Seconds per layer. The phase's one orchestrated moment is the graph
 *  plotting itself outward, so the delay has to come from the layer rather
 *  than from each edge deciding for itself (UI_GUIDE §4). */
export const EDGE_STAGGER_SECONDS = 0.09;

// --- Viewport -------------------------------------------------------------

/** Clear space kept between a revealed card and the edge it was closest to. */
export const REVEAL_MARGIN = 56;

// --- Graph expansion ------------------------------------------------------

/**
 * Depth 1, always.
 *
 * The map grows a column at a time by clicking, so asking for more would fetch
 * branches the reader has not opened and draw a graph they did not ask for.
 */
export const EXPANSION_DEPTH = 1;
