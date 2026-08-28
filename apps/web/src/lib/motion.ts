import { useReducedMotion, type Transition } from "framer-motion";

/**
 * Motion constants and the one hook components should reach for.
 *
 * Honouring `prefers-reduced-motion` is the default path here rather than
 * something each component has to remember: a zero-duration transition lands
 * an element in its final state without moving it, so nothing has to branch on
 * whether the animation ran.
 */

/** Seconds, which is Framer's unit. UI_GUIDE §4: 150-300ms for
 *  micro-interactions, 400-600ms for page-level motion. */
export const DURATION = {
  micro: 0.18,
  panel: 0.28,
  page: 0.5,
} as const;

/**
 * A heavy decelerate, for the one thing on the landing page that draws itself.
 *
 * Not `easeOut`: a symmetric built-in curve reads as a tween, and the hero is
 * meant to read as a pen being drawn across a chart -- fast away from rest,
 * settling slowly.
 */
export const EASE_DRAW = [0.32, 0.72, 0, 1] as const;

/** Cards and edges use spring physics; routes and fades use easing (§4). */
const SPRING: Transition = { type: "spring", stiffness: 240, damping: 26 };

const INSTANT: Transition = { duration: 0 };

/**
 * The transition to animate with. `spring` for anything that should feel
 * physical, a named duration for anything that should simply arrive.
 *
 * Named `useMotionTransition`, not `useTransition`, so it is never mistaken
 * for React's hook of that name.
 */
export function useMotionTransition(preset: keyof typeof DURATION | "spring" = "spring"): Transition {
  const reduced = useReducedMotion();

  if (reduced === true) {
    return INSTANT;
  }
  return preset === "spring" ? SPRING : { duration: DURATION[preset], ease: "easeOut" };
}

/**
 * Whether non-essential motion should run at all.
 *
 * For the cases a transition cannot express -- a staggered sequence, an
 * ambient loop -- which should not start rather than run instantly.
 */
export function useMotionEnabled(): boolean {
  return useReducedMotion() !== true;
}
