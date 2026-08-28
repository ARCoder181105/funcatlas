import { useId } from "react";
import { motion } from "framer-motion";
import { cn } from "../../lib/cn";
import { CONFIDENCE } from "../../lib/confidence";
import { EDGE_STAGGER_SECONDS } from "../../lib/constants";
import {
  HERO_ALT,
  HERO_EDGES,
  HERO_NODE,
  HERO_NODES,
  HERO_VIEWBOX,
  heroEdgePath,
} from "../../lib/hero-graph";
import { DURATION, EASE_DRAW, useMotionEnabled } from "../../lib/motion";

/**
 * The hero: a call graph drawing itself, not a picture of one.
 *
 * Plain SVG rather than React Flow. React Flow wants a measured container and
 * brings pan, zoom and handles that a hero has no use for, along with the
 * `node.width` trap in `docs/CANVAS_DECISIONS.md` §4. A fixed viewBox scales
 * on its own and cannot drop an edge in silence.
 *
 * **Do not animate `pathLength`.** Framer implements it by writing an inline
 * `stroke-dasharray`, which overwrites the dash pattern that distinguishes the
 * three tiers -- solid, dashed and dotted all come out identical, which is the
 * one picture this product must never show (PRD §8). The draw is a mask
 * sweeping across instead, so every path keeps the dash pattern it was given.
 *
 * The sweep runs left to right and the graph is laid out by depth, so the
 * sweep *is* the stagger: one animated element for the whole orchestrated
 * moment (UI_GUIDE §4).
 */
export function HeroGraph({ className }: { className?: string }) {
  const animate = useMotionEnabled();
  const id = useId();
  const titleId = `${id}-title`;
  const descId = `${id}-desc`;
  const maskId = `${id}-reveal`;

  return (
    <svg
      viewBox={`0 0 ${HERO_VIEWBOX.width} ${HERO_VIEWBOX.height}`}
      role="img"
      aria-labelledby={titleId}
      aria-describedby={descId}
      className={cn("h-auto w-full", className)}
    >
      <title id={titleId}>A resolved call graph</title>
      <desc id={descId}>{HERO_ALT}</desc>

      {animate ? (
        <defs>
          <mask id={maskId}>
            {/* Translated rather than resized: a transform is the one thing
                cheap to animate, and it leaves the paths' own attributes
                untouched, which is the whole point. */}
            <motion.rect
              width={HERO_VIEWBOX.width}
              height={HERO_VIEWBOX.height}
              fill="white"
              initial={{ x: -HERO_VIEWBOX.width }}
              animate={{ x: 0 }}
              transition={{ duration: DURATION.page, ease: EASE_DRAW }}
            />
          </mask>
        </defs>
      ) : null}

      <g
        mask={animate ? `url(#${maskId})` : undefined}
        fill="none"
        strokeWidth={1.5}
      >
        {HERO_EDGES.map((edge) => (
          <path
            key={`${edge.from}-${edge.to}`}
            d={heroEdgePath(edge)}
            className={CONFIDENCE[edge.tier].strokeClass}
            strokeDasharray={CONFIDENCE[edge.tier].strokeDasharray}
            strokeLinecap="round"
          />
        ))}
      </g>

      {HERO_NODES.map((node) => (
        <motion.g
          key={node.id}
          initial={animate ? { opacity: 0 } : false}
          animate={{ opacity: 1 }}
          transition={{
            duration: DURATION.panel,
            delay: animate ? node.depth * EDGE_STAGGER_SECONDS : 0,
          }}
        >
          <rect
            x={node.x}
            y={node.y}
            width={HERO_NODE.width}
            height={HERO_NODE.height}
            rx={HERO_NODE.radius}
            strokeWidth={1}
            className={
              node.ghost === true
                ? cn("fill-none", CONFIDENCE.unresolved.strokeClass)
                : "fill-surface-raised stroke-surface-border"
            }
            strokeDasharray={
              node.ghost === true
                ? CONFIDENCE.unresolved.strokeDasharray
                : undefined
            }
          />

          <text
            x={node.x + HERO_NODE.width / 2}
            y={node.y + HERO_NODE.height / 2}
            textAnchor="middle"
            dominantBaseline="central"
            className={cn(
              "font-mono text-[12px]",
              node.ghost === true ? "fill-confidence-unresolved" : "fill-ink",
            )}
          >
            {node.label}
          </text>

          {/* The signature (UI_GUIDE §3.2): the map naming its own boundary
              rather than hiding it. Said in a word, because a dotted outline
              alone reads as a style rather than as a claim. */}
          {node.ghost === true ? (
            <text
              x={node.x + HERO_NODE.width / 2}
              y={node.y + HERO_NODE.height + 16}
              textAnchor="middle"
              className="fill-confidence-unresolved font-mono text-[10px] tracking-wide"
            >
              {CONFIDENCE.unresolved.label}
            </text>
          ) : null}
        </motion.g>
      ))}
    </svg>
  );
}
