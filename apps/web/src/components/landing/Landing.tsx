import { useMotionEnabled } from "../../lib/motion";
import { useSmoothScroll } from "../../lib/useSmoothScroll";
import { CanvasShot } from "./CanvasShot";
import { ClosingCta } from "./ClosingCta";
import { Hero } from "./Hero";
import { HowItWorks } from "./HowItWorks";
import { Index } from "./Index";
import { LandingFooter } from "./LandingFooter";
import { LandingHeader } from "./LandingHeader";
import { Languages } from "./Languages";
import { Tiers } from "./Tiers";

/**
 * The marketing surface, at `/`.
 *
 * It calls no API. The session is resolved inside the canvas route, not here,
 * so this page renders whether or not the backend is up -- which is the least
 * a page whose job is to explain the product can do.
 *
 * Smooth scrolling is mounted here rather than at the app root: the canvas
 * treats the wheel as zoom, and a scroll library at the root would take those
 * gestures away from it.
 */
export function Landing() {
  useSmoothScroll(useMotionEnabled());

  return (
    <div className="min-h-svh bg-surface">
      <LandingHeader />

      <main>
        <Hero />
        <Tiers />
        <CanvasShot />
        <HowItWorks />
        <Index />
        <Languages />
        <ClosingCta />
      </main>

      <LandingFooter />
    </div>
  );
}
