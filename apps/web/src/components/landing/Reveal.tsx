import type { ReactNode } from "react";
import { Fade } from "../animate-ui/primitives/effects/fade";
import { useMotionEnabled } from "../../lib/motion";

/**
 * A section arriving as it is scrolled to. Opacity only.
 *
 * No slide, no blur, no scale: the hero is the page's one orchestrated moment
 * (UI_GUIDE §4), and a section that also moves turns that into scattered
 * effects -- which is the most reliable tell of a generated design.
 *
 * `Fade` does not check `prefers-reduced-motion` itself, so the branch is
 * here: reduced motion renders the content with no wrapper at all rather than
 * a wrapper that animates instantly.
 */
export function Reveal({
  children,
  className,
  delay,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const animate = useMotionEnabled();

  if (!animate) {
    return <div className={className}>{children}</div>;
  }

  return (
    <Fade inView inViewMargin="-80px" delay={delay} className={className}>
      {children}
    </Fade>
  );
}
