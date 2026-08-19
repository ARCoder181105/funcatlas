import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Testing Library only registers its own cleanup when vitest globals are on.
// They are off deliberately -- explicit imports keep each test file honest
// about what it uses -- so unmounting is wired up here instead. Without it a
// component leaks into the next test's queries.
afterEach(cleanup);

// jsdom does not implement matchMedia, and two things in the tree call it on
// mount: shadcn's use-mobile hook and Framer Motion's useReducedMotion. Without
// this, mounting anything under SidebarProvider throws from inside an effect,
// which surfaces as an unrelated "element not found" a second later.
//
// Answering `false` means: a desktop viewport, and no reduced-motion
// preference. A test that needs either can override this per case.
// Base UI's ScrollArea calls this on a timer to wait out a running animation.
// jsdom implements no Web Animations API, so the call throws from inside a
// setTimeout, where no test can catch it -- it surfaces as an unhandled error
// attributed to whichever test happened to be running. Nothing is animating
// here, so an empty list is the honest answer.
if (typeof Element !== "undefined" && Element.prototype.getAnimations === undefined) {
  Element.prototype.getAnimations = () => [];
}

// Also absent from jsdom, and both react-resizable-panels and React Flow
// construct one on mount. Without it the explorer fails to render at all.
//
// A no-op on purpose. Making it report a size drives react-resizable-panels
// into a re-layout loop that fails most of the suite, and React Flow still
// will not draw edges without a real layout engine behind it -- so edge
// rendering is verified in a browser and `lib/graph.test.ts` covers the part
// that decides what the edges are.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

// React Flow reads the pane's transform through DOMMatrixReadOnly when it
// measures a node, and jsdom has no implementation. It only started throwing
// once `lib/graph.ts` stopped pre-declaring node dimensions -- before that
// React Flow considered every node measured and never took this path, which is
// the same shortcut that left real edges undrawn in the browser.
//
// The identity matrix is the honest answer here: nothing in these tests pans or
// zooms the canvas.
if (typeof window !== "undefined" && (window as { DOMMatrixReadOnly?: unknown }).DOMMatrixReadOnly === undefined) {
  class IdentityMatrix {
    readonly m11 = 1;
    readonly m22 = 1;
    readonly m41 = 0;
    readonly m42 = 0;
  }
  (window as unknown as { DOMMatrixReadOnly: unknown }).DOMMatrixReadOnly = IdentityMatrix;
}

if (typeof window !== "undefined" && window.matchMedia === undefined) {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      // Deprecated, but Framer Motion still reaches for these.
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}
