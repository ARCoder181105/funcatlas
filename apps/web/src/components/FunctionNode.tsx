import { motion } from "framer-motion";
import { ChevronRight, CircleDashed, Dot } from "lucide-react";
import { Handle, Position, type NodeProps } from "reactflow";
import { cn } from "../lib/cn";
import type { GraphNodeData } from "../lib/graph";
import { useMotionEnabled, useMotionTransition } from "../lib/motion";
import { useUiStore } from "../store/ui";
import { Badge } from "./ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

/**
 * The two node kinds live together because the ghost is defined by contrast
 * with the function node -- same shell, deliberately different skin -- and
 * splitting them would either duplicate that shell or hide the contrast in
 * another file.
 */

/** Handles on both sides: a node is a target of the edge that reached it and
 *  the source of the ones going on from it. React Flow needs both to anchor
 *  geometry even where only one is used. */
function Anchors() {
  return (
    <>
      <Handle type="target" position={Position.Left} className="!size-1.5 !border-0 !bg-border" />
      <Handle type="source" position={Position.Right} className="!size-1.5 !border-0 !bg-border" />
    </>
  );
}

/** A function the resolver placed. */
export function FunctionNode({ data }: NodeProps<GraphNodeData>) {
  const selectedFunctionId = useUiStore((state) => state.selectedFunctionId);
  const toggleFunction = useUiStore((state) => state.toggleFunction);
  const transition = useMotionTransition("spring");
  const animated = useMotionEnabled();

  const active = data.functionId !== null && data.functionId === selectedFunctionId;

  return (
    <motion.button
      type="button"
      initial={animated ? { opacity: 0, scale: 0.9 } : false}
      animate={{ opacity: 1, scale: 1 }}
      transition={transition}
      // Grows the map rather than replacing it, and closes again on a second
      // click. Several functions stay open at once; the map is their union.
      onClick={() => data.functionId !== null && toggleFunction(data.functionId)}
      aria-expanded={data.isLeaf ? undefined : data.expanded}
      aria-label={
        data.isLeaf
          ? `${data.label} — calls nothing`
          : data.expanded
            ? `${data.label} — close its calls`
            : `${data.label} — open its calls`
      }
      className={cn(
        "nodrag flex h-11 w-52 items-center gap-2 rounded-token border px-3",
        "bg-card text-left transition-colors duration-micro",
        "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
        data.isRoot
          ? "border-primary shadow-[0_0_0_3px_color-mix(in_oklch,var(--primary)_18%,transparent)]"
          : "border-border hover:border-ring",
        active && !data.isRoot ? "border-ring bg-accent" : null,
      )}
    >
      <Anchors />

      <span className="min-w-0 flex-1">
        <span className="block truncate font-mono text-xs text-foreground">{data.label}</span>
        {/* The qualified name only when it says more than the name does --
            `Repo.sync` earns a second line, `getUser` does not. */}
        {data.qualifiedName !== null && data.qualifiedName !== data.label ? (
          <span className="block truncate font-mono text-[10px] text-muted-foreground">
            {data.qualifiedName}
          </span>
        ) : null}
      </span>

      {data.isRoot ? (
        <Badge variant="outline" className="shrink-0 text-[10px]">
          start
        </Badge>
      ) : null}

      {/* Whether clicking does anything. Without this a leaf looks exactly
          like an unopened function, and clicking it reads as a broken canvas
          rather than as a function that calls nothing. */}
      {data.isLeaf ? (
        <Dot strokeWidth={1.5} className="size-4 shrink-0 text-muted-foreground/50" aria-hidden />
      ) : (
        // Rotates rather than swapping glyphs, so the control reads as one
        // thing in two states instead of two different buttons.
        <ChevronRight
          strokeWidth={1.5}
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-transform duration-micro",
            data.expanded ? "rotate-90" : "rotate-0",
          )}
          aria-hidden
        />
      )}
    </motion.button>
  );
}

/**
 * A call the resolver could not place — UI_GUIDE §3.2 signature 3.
 *
 * Drawn as the map's own boundary rather than as an error: dotted, faded, and
 * labelled with the name the parser saw. It is not a function and does not
 * pretend to be one, so it is not clickable and carries no qualified name.
 * Hiding it instead would show the caller calling nothing, which is precisely
 * the dishonesty PRD §8 exists to prevent.
 */
export function GhostNode({ data }: NodeProps<GraphNodeData>) {
  const transition = useMotionTransition("spring");
  const animated = useMotionEnabled();

  const sites =
    data.callLines.length === 0
      ? "call site not recorded"
      : data.callLines.length === 1
        ? `called at line ${data.callLines[0]}`
        : `called at lines ${data.callLines.join(", ")}`;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <motion.div
            initial={animated ? { opacity: 0, scale: 0.9 } : false}
            animate={{ opacity: 1, scale: 1 }}
            transition={transition}
            className={cn(
              "flex h-11 w-52 items-center gap-2 rounded-token px-3",
              // Dotted border and no fill: the same notation as its edge, so
              // the boundary reads as one idea rather than two.
              "border border-dotted border-confidence-unresolved bg-transparent",
            )}
          >
            <Anchors />
            <CircleDashed
              strokeWidth={1.5}
              className="size-3.5 shrink-0 text-confidence-unresolved"
              aria-hidden
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-mono text-xs text-confidence-unresolved">
                {data.label}
              </span>
              <span className="block text-[10px] text-confidence-unresolved/80">unresolved</span>
            </span>
          </motion.div>
        }
      />
      <TooltipContent side="top">
        <p className="font-mono text-xs">{data.label}</p>
        <p className="text-xs">
          The call is real, but which function it reaches could not be determined — {sites}.
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
