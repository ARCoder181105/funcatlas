/**
 * Where the camera has to move to show a card, and no further.
 *
 * The canvas used to centre itself on whatever was clicked, at zoom 1. Two
 * things went wrong with that, and both read as the interface losing your
 * place: the file card sits a column to the left of the graph, so centring on
 * anything the reader opened pushed it off the screen -- they reported the file
 * card "disappearing" -- and forcing zoom 1 threw away whatever zoom they had
 * chosen to see the map with.
 *
 * A reader who clicks a card that is already on screen expects nothing to move
 * at all. So this answers a narrower question: what is the *smallest* pan that
 * brings this card fully into view, and is any pan needed at all?
 */

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** React Flow's transform: the pane's offset in screen pixels, and its scale. */
export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

/** Clear space kept between a revealed card and the edge it was closest to. */
const MARGIN = 56;

/**
 * The new viewport offset, or `null` when the card is already comfortably in
 * view and the camera should stay exactly where it is.
 */
export function panToReveal(
  node: Box,
  viewport: Viewport,
  pane: { width: number; height: number },
  margin = MARGIN,
): { x: number; y: number } | null {
  const left = viewport.x + node.x * viewport.zoom;
  const top = viewport.y + node.y * viewport.zoom;
  const width = node.width * viewport.zoom;
  const height = node.height * viewport.zoom;

  const dx = shift(left, width, pane.width, margin);
  const dy = shift(top, height, pane.height, margin);

  return dx === 0 && dy === 0 ? null : { x: viewport.x + dx, y: viewport.y + dy };
}

/**
 * One axis. Zero when the card already fits inside the margins.
 *
 * A card larger than the pane can never fit, so its leading edge is aligned
 * instead -- reading starts at the top-left of a card, and a card scrolled to
 * its bottom-right corner is worse than one whose far edge is off screen.
 */
function shift(position: number, size: number, pane: number, margin: number): number {
  if (size > pane - margin * 2) {
    return margin - position;
  }
  if (position < margin) {
    return margin - position;
  }
  if (position + size > pane - margin) {
    return pane - margin - (position + size);
  }
  return 0;
}
