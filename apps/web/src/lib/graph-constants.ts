/**
 * Canvas geometry: every measurement the layout in `graph.ts` is built from.
 *
 * The numbers are measured off rendered components, not guessed, and each one
 * keeps the note explaining what it was measured from -- a bare number here
 * would be unmaintainable in a way the scattered version at least was not.
 *
 * See `docs/CANVAS_DECISIONS.md` §4 for why the layout needs sizes up front at
 * all, and why **nothing may set `node.width` / `node.height`**.
 */

// --- Function nodes -------------------------------------------------------

/**
 * The size the layout assumes before React Flow has measured anything.
 *
 * Set on `data.size`, never on `node.width`: React Flow treats a node that
 * already has width and height as measured, never computes its `handleBounds`,
 * and then skips every edge touching it in silence. Landing on a function from
 * the palette drew five cards and nothing joining them, which is the one
 * picture this canvas must never show (PRD §8).
 */
export const NODE_WIDTH = 208;
export const NODE_HEIGHT = 44;

/**
 * A closed card is as wide as its name, within reason.
 *
 * At a fixed 208px every card was the width of the longest name anyone might
 * have, and `Ky.prototype.parseJsonWithSchema` was truncated to nothing on the
 * same canvas as `get`. Names are what the reader navigates by, so the card is
 * measured from the name and the graph is spaced around the result.
 */
export const NODE_MIN_WIDTH = 176;

/**
 * Mono at 12px for the name, 10px for the qualified name under it, and then
 * everything that shares the row with them: the chevron, the code button, the
 * padding and the gaps -- plus the "start" badge on a branch root, which is
 * what was squeezing `cloneRetryOptions` down to `cloneRet...` on a card
 * supposedly measured to fit it.
 *
 * 7.2px a character, measured off a rendered name rather than off the code
 * block: the block came out at 6.6 and using that here left every long name a
 * few pixels short of its row, which the row then wrapped.
 */
export const LABEL_CHAR = 7.2;
export const SUBLABEL_CHAR = 5.5;
export const CARD_CHROME = 118;
export const ROOT_BADGE = 50;

// --- Code cards -----------------------------------------------------------

/** Defaults, used until the source has arrived. */
export const CODE_WIDTH = 460;
export const CODE_HEIGHT = 260;

export const CODE_MIN_WIDTH = 320;
export const CODE_MIN_HEIGHT = 140;

/**
 * How many lines a card shows before offering the rest.
 *
 * Same rule as the file card: nothing inside a node scrolls, because the wheel
 * over this canvas zooms the map. A long function is shown a screenful at a
 * time and grows when asked.
 */
export const CODE_PREVIEW_LINES = 24;

/**
 * Measured off the rendered block rather than guessed: JetBrains Mono at 12px
 * comes out at 6.6px a character, the 4ch gutter and its margin at 48, and the
 * card's padding and header at 26 and 33.
 *
 * They are estimates of a real measurement, which is the trade §4 makes on
 * purpose -- the alternative is measuring the card after it renders, and a
 * layout that depends on measurement is the one that leaves edges undrawn.
 */
export const CHAR_WIDTH = 6.6;
export const LINE_HEIGHT = 19.5;
export const GUTTER = 48;
export const PADDING = 26;
export const HEADER = 33;

// --- File cards -----------------------------------------------------------

/**
 * The file card is measured like every other card.
 *
 * It shipped at a fixed 288x(whatever fits), with its list of functions inside
 * a 256px scroll area -- so a file with a dozen functions hid most of them
 * behind a scrollbar, and a long name like
 * `cloneSearchParametersForInitHook` wrapped onto a second line inside a row
 * built for one. It grows in both directions instead, and the layout places it
 * against its own width so a wide card cannot reach the first column.
 */
export const FILE_CARD_MIN_WIDTH = 288;

/**
 * How many functions a card shows before offering the rest.
 *
 * Nothing on this canvas scrolls except the canvas. A scroll region inside a
 * node competes with the wheel that zooms the map -- the reader's gesture means
 * two things depending on where the pointer happens to be, which is the kind of
 * ambiguity that makes an interface feel broken rather than dense. So a card
 * that cannot show everything says how much is left and grows when asked.
 */
export const FILE_PREVIEW_ROWS = 10;

/**
 * Measured off the rendered card rather than estimated, because the difference
 * showed up as content overflowing a box that was supposed to fit it: a row is
 * 38px with an 8px gap under it, the line-number badge and chevron beside a
 * name take 92, the header is 56 plus a line of path, the list and the card
 * between them add 38 of padding, and the "show the rest" row is 38.
 */
export const ROW_HEIGHT = 46;
export const ROW_CHROME = 92;
export const FILE_HEADER = 56;
export const PATH_LINE = 17;
export const LIST_PADDING = 38;
export const MORE_ROW = 38;

/**
 * The two bodies that are not a list of rows, and are not one row tall either.
 *
 * A file the parser found nothing in shows a title and a sentence explaining
 * that; a file still loading shows four skeleton rows. Sizing both as "one row"
 * clipped the explanation halfway through its second line -- the card said
 * there was nothing here and then cut off why.
 */
export const EMPTY_BODY = 104;
export const PENDING_BODY = 116;

// --- Layout ---------------------------------------------------------------

/** Clear space between cards, whatever their size. */
export const GAP_X = 92;
export const GAP_Y = 48;

/**
 * Above this the tab stops being usable before the graph stops being drawn.
 * Truncation is reported rather than silent -- a map that quietly stops early
 * is the same lie as one that hides an unresolved call.
 */
export const NODE_CEILING = 2000;

// --- Node type names ------------------------------------------------------

export const FILE_CARD_NODE = "fileCard";
export const FUNCTION_NODE = "functionNode";
export const GHOST_NODE = "ghostNode";
