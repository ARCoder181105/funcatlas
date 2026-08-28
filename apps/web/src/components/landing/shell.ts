/**
 * The landing page's one content width.
 *
 * Written once because four surfaces share it -- the title block, the hero,
 * every section and the footer -- and when they each carried their own max
 * width the wordmark did not line up with the headline under it.
 *
 * Wide on purpose. A 64rem measure centred on a modern display reads as a
 * column floating in a field of ground rather than as a page. Prose inside
 * still caps itself at a readable measure; it is the layout that fills the
 * screen, not the paragraphs.
 */
export const LANDING_SHELL = "mx-auto w-full max-w-[104rem] px-6 sm:px-10 lg:px-16";
