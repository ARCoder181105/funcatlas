import { describe, expect, it } from "vitest";
import { panToReveal } from "./viewport";

const PANE = { width: 1000, height: 700 };
const STILL = { x: 0, y: 0, zoom: 1 };

describe("panToReveal", () => {
  it("does not move at all when the card is already on screen", () => {
    // The whole point. Clicking a card you can see should not shift the map
    // under you, and every click used to re-centre the camera.
    expect(panToReveal({ x: 300, y: 200, width: 208, height: 44 }, STILL, PANE)).toBeNull();
  });

  it("brings a card that is off the left edge just inside it", () => {
    const next = panToReveal({ x: -400, y: 100, width: 208, height: 44 }, STILL, PANE);

    // Far enough to clear the margin, and not one pixel further -- centring it
    // instead is what pushed the file card off the other side.
    expect(next).toEqual({ x: 456, y: 0 });
  });

  it("brings a card that is off the right edge back without touching the other axis", () => {
    const next = panToReveal({ x: 1200, y: 100, width: 208, height: 44 }, STILL, PANE);

    expect(next?.x).toBe(1000 - 56 - (1200 + 208));
    expect(next?.y).toBe(0);
  });

  it("reads the card's position through the current zoom", () => {
    // At half zoom a card 1200 units out is 600 pixels out, which is on screen.
    const zoomed = { x: 0, y: 0, zoom: 0.5 };

    expect(panToReveal({ x: 1200, y: 200, width: 208, height: 44 }, zoomed, PANE)).toBeNull();
  });

  it("aligns the leading edge of a card too large to fit", () => {
    // A card showing four hundred lines cannot be framed. Its top-left is
    // where reading starts, so that is the corner that gets the screen.
    const next = panToReveal({ x: -50, y: -50, width: 1400, height: 900 }, STILL, PANE);

    expect(next).toEqual({ x: 106, y: 106 });
  });

  it("leaves the zoom out of it entirely", () => {
    // Only an offset is returned: the reader's zoom is theirs, and resetting
    // it to 1 on every click was half the complaint.
    const next = panToReveal({ x: -400, y: 100, width: 208, height: 44 }, { x: 0, y: 0, zoom: 2 }, PANE);

    expect(next).not.toBeNull();
    expect(Object.keys(next ?? {}).sort()).toEqual(["x", "y"]);
  });
});
