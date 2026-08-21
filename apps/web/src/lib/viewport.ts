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

import { REVEAL_MARGIN } from "./constants";

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

/**
 * The box around a card and whatever it just drew.
 *
 * Revealing only the card the reader clicked reveals something they were
 * already looking at -- they clicked it -- and leaves the column it just opened
 * off the screen, which is the "nothing happened" complaint again. The thing to
 * bring into view is the card *and its new children*.
 */
export function boundingBox(boxes: Box[]): Box | null {
  if (boxes.length === 0) {
    return null;
  }

  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));

  return { x: left, y: top, width: right - left, height: bottom - top };
}

/**
 * The new viewport offset, or `null` when the card is already comfortably in
 * view and the camera should stay exactly where it is.
 */
export function panToReveal(
  node: Box,
  viewport: Viewport,
  pane: { width: number; height: number },
  margin = REVEAL_MARGIN,
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
 * A box larger than the pane can never fit, and the temptation is to align its
 * leading edge. That is what took the file card off the screen: opening a
 * source card makes a box wider than the canvas, so the camera snapped its left
 * edge to the margin and swept everything to the left of it away -- the file
 * card included, for as long as the card stayed open.
 *
 * So a box too large to frame moves the camera only when its leading edge is
 * *also* off screen. Reading starts at the top-left; if that corner is already
 * in view, the reader can see where the thing begins, and the far edge running
 * past the screen is what panning is for.
 */
function shift(position: number, size: number, pane: number, margin: number): number {
  if (size > pane - margin * 2) {
    return position < margin ? margin - position : 0;
  }
  if (position < margin) {
    return margin - position;
  }
  if (position + size > pane - margin) {
    return pane - margin - (position + size);
  }
  return 0;
}
