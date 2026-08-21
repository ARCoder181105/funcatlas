import { motion } from "framer-motion";
import type { ResolutionConfidence } from "@funcatlas/shared";
import { BaseEdge, getBezierPath, type EdgeProps } from "reactflow";
import { CONFIDENCE, confidenceColor } from "../lib/confidence";
import { DURATION, useMotionEnabled } from "../lib/motion";
import { useTheme } from "../lib/theme";
import { EDGE_STAGGER_SECONDS } from "../lib/constants";

export interface ConfidenceEdgeData {
  confidence: ResolutionConfidence;
  depth: number;
}

/**
 * One call, drawn at the confidence the resolver actually had.
 *
 * Solid, dashed or dotted comes from `lib/confidence.ts`, which reads
 * `CONFIDENCE_STYLE` out of `packages/shared` -- the same constant the API and
 * the schema read. Nothing about the mapping is decided here; this component
 * only draws it.
 */
export function ConfidenceEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
}: EdgeProps<ConfidenceEdgeData>) {
  const mode = useTheme((state) => state.mode);
  const animated = useMotionEnabled();

  const [path] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const tier = data?.confidence ?? "unresolved";
  const presentation = CONFIDENCE[tier];
  const color = confidenceColor(tier, mode);

  return (
    <>
      {/* BaseEdge carries React Flow's own interaction path; the visible
          stroke is the motion path below it. */}
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={{ stroke: "transparent" }} />

      <motion.path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        // The tier's pattern, always, and never handed to the animation.
        //
        // This used to draw itself in with `pathLength`, which Framer
        // implements by writing `stroke-dasharray` into the element's inline
        // style -- so the pattern had to wait for the animation to finish. It
        // never finished: the map re-lays out constantly and every re-render
        // interrupted the tween, leaving every edge frozen at a dash of
        // `0.645678px 1px`. Solid, dashed and dotted were one pattern in three
        // colours, which is most of what PRD §8 promises, quietly gone.
        //
        // The arrival is a fade now. Less to look at, and true.
        strokeDasharray={presentation.strokeDasharray}
        initial={animated ? { opacity: 0 } : false}
        animate={{ opacity: 1 }}
        transition={{
          duration: DURATION.panel,
          delay: (data?.depth ?? 0) * EDGE_STAGGER_SECONDS,
          ease: "easeOut",
        }}
        // The edge is decoration for a screen reader: the node labels and the
        // legend already say what it means.
        aria-hidden
      />
    </>
  );
}
