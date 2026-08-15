import { useState } from "react";
import { motion } from "framer-motion";
import type { ResolutionConfidence } from "@funcatlas/shared";
import { BaseEdge, getBezierPath, type EdgeProps } from "reactflow";
import { CONFIDENCE, confidenceColor } from "../lib/confidence";
import { DURATION, useMotionEnabled } from "../lib/motion";
import { useTheme } from "../lib/theme";

export interface ConfidenceEdgeData {
  confidence: ResolutionConfidence;
  depth: number;
}

/** Seconds per layer. The phase's one orchestrated moment is the graph
 *  plotting itself outward, so the delay has to come from the layer rather
 *  than from each edge deciding for itself (UI_GUIDE §4). */
const STAGGER = 0.09;

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
  // The dash pattern and the draw-in both want stroke-dasharray, so they
  // cannot run at once: the line draws with no pattern, then takes its own on
  // arrival. Without this a dotted edge animates as a crawl of dots.
  const [drawn, setDrawn] = useState(!animated);

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
        strokeDasharray={drawn ? presentation.strokeDasharray : undefined}
        initial={animated ? { pathLength: 0, opacity: 0 } : false}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{
          duration: DURATION.panel,
          delay: (data?.depth ?? 0) * STAGGER,
          ease: "easeOut",
        }}
        onAnimationComplete={() => setDrawn(true)}
        // The edge is decoration for a screen reader: the node labels and the
        // legend already say what it means.
        aria-hidden
      />
    </>
  );
}
