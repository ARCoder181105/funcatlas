import { useEffect } from "react";
import Lenis from "lenis";

/**
 * Smooth scrolling, on the landing page only.
 *
 * Mounted from `Landing` rather than from the app root on purpose: on the
 * canvas the wheel already means zoom, and handing those events to a scroll
 * library would fight React Flow for every gesture.
 *
 * `autoRaf` lets Lenis own its own frame loop, which is one less thing here to
 * get wrong on unmount.
 */
export function useSmoothScroll(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;

    const lenis = new Lenis({ autoRaf: true });
    return () => lenis.destroy();
  }, [enabled]);
}
