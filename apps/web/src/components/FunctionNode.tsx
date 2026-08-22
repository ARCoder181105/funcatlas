import { memo } from "react";
import { motion } from "framer-motion";
import { Code2, CircleDashed } from "lucide-react";
import { Handle, Position, type NodeProps } from "reactflow";
import { cn } from "../lib/cn";
import { sameNodeData, type GraphNodeData } from "../lib/graph";
import { NODE_HEIGHT } from "../lib/graph-constants";
import { DURATION, useMotionEnabled, useMotionTransition } from "../lib/motion";
import { useUiStore } from "../store/ui";
import { CodeBlock } from "./CodeBlock";
import { ExpandIndicator, expandLabel } from "./ExpandIndicator";
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
      <Handle
        type="target"
        position={Position.Left}
        className="!size-1.5 !border-0 !bg-border"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!size-1.5 !border-0 !bg-border"
      />
    </>
  );
}

/**
 * A function the resolver placed, and -- on request -- what it says.
 *
 * Two controls, because they answer two questions: the row opens what this
 * function *calls*, and the code button opens what it *does*. The source drops
 * down inside the card rather than into a panel beside the canvas, so the code
 * stays attached to the function it belongs to and the map keeps the whole
 * width. `lib/graph.ts` knows both sizes and spaces the graph around whichever
 * one is showing.
 */
function FunctionCard({ data }: NodeProps<GraphNodeData>) {
  const selectedFunctionId = useUiStore((state) => state.selectedFunctionId);
  const toggleFunction = useUiStore((state) => state.toggleFunction);
  const toggleCode = useUiStore((state) => state.toggleCode);
  const transition = useMotionTransition("spring");
  const animated = useMotionEnabled();

  const active =
    data.functionId !== null && data.functionId === selectedFunctionId;

  return (
    <motion.div
      // The box the layout reserved, in `style` rather than animated: it has to
      // be true on the first frame and with no frames at all. A card showing
      // its source is sized to that source, so this is not two constants -- see
      // `codeCardSize`. The growth is a CSS transition below: decoration over a
      // value that is already correct.
      style={data.size}
      initial={animated ? { opacity: 0, scale: 0.9 } : false}
      animate={{ opacity: 1, scale: 1 }}
      // A card lifts under the pointer. Small on purpose: it says "this is a
      // thing you can act on" without the canvas twitching as the pointer
      // crosses it.
      whileHover={animated ? { y: -2 } : undefined}
      transition={transition}
      className={cn(
        "flex flex-col overflow-hidden rounded-token border bg-card",
        // The card grows into its new box rather than snapping to it. Paired
        // with `useAnimatedNodes` re-spacing the graph over the same beat.
        "transition-colors duration-micro motion-safe:transition-[width,height,background-color,border-color] motion-safe:duration-panel motion-safe:ease-out",
        data.isRoot
          ? "border-primary shadow-[0_0_0_3px_color-mix(in_oklch,var(--primary)_18%,transparent)]"
          : "border-border",
        active && !data.isRoot ? "border-ring bg-accent" : null,
      )}
    >
      <Anchors />

      <div
        className="flex shrink-0 items-center gap-1 pr-1.5"
        style={{ height: NODE_HEIGHT }}
      >
        <button
          type="button"
          // Grows the map rather than replacing it, and closes again on a
          // second click. Several functions stay open at once; the map is
          // their union.
          onClick={() =>
            data.functionId !== null && toggleFunction(data.functionId)
          }
          aria-expanded={data.isLeaf ? undefined : data.expanded}
          aria-label={expandLabel(data.label, data.expanded, data.isLeaf)}
          className={cn(
            // nodrag: without it React Flow reads the press as the start of a
            // node drag and the click never lands.
            "nodrag flex h-full min-w-0 flex-1 items-center gap-2 rounded-token px-3 text-left",
            "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate font-mono text-xs text-foreground">
              {data.label}
            </span>
            {/* The qualified name only when it says more than the name does --
                `Repo.sync` earns a second line, `getUser` does not. */}
            {data.qualifiedName !== null &&
            data.qualifiedName !== data.label ? (
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

          {/* Only when it differs from the file being read -- see
              `foreignLanguage`. This is where a reader finds out that the call
              they followed left the language, which is also where the resolver
              stops being able to say anything exact. */}
          {data.foreignLanguage !== null ? (
            <Badge
              variant="secondary"
              className="shrink-0 font-mono text-[10px] font-normal"
            >
              {data.foreignLanguage}
            </Badge>
          ) : null}

          {/* Whether clicking does anything. Without this a leaf looks exactly
              like an unopened function, and clicking it reads as a broken
              canvas rather than as a function that calls nothing. */}
          <ExpandIndicator open={data.expanded} leaf={data.isLeaf} />
        </button>

        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                onClick={() =>
                  data.functionId !== null && toggleCode(data.functionId)
                }
                aria-expanded={data.showCode}
                aria-label={
                  data.showCode
                    ? `${data.label} — hide its source`
                    : `${data.label} — show its source`
                }
                className={cn(
                  "nodrag flex size-7 shrink-0 items-center justify-center rounded-md",
                  "text-muted-foreground transition-colors duration-micro hover:bg-muted",
                  "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
                  data.showCode ? "bg-muted text-foreground" : null,
                )}
              >
                <Code2 strokeWidth={1.5} className="size-3.5" aria-hidden />
              </button>
            }
          />
          <TooltipContent side="top">
            {data.showCode ? "Hide source" : "Show source"}
          </TooltipContent>
        </Tooltip>
      </div>

      {data.showCode && data.functionId !== null ? (
        // Whatever is left of the card, scrolling inside: source length is
        // unbounded, and a node that grew with it could not be placed without
        // measuring it first.
        <motion.div
          // Fades in behind the card's own growth, so the source arrives with
          // the space made for it rather than snapping in at full strength.
          initial={animated ? { opacity: 0 } : false}
          animate={{ opacity: 1 }}
          transition={{ duration: DURATION.panel, ease: "easeOut" }}
          className="min-h-0 flex-1 border-t border-border"
        >
          <CodeBlock
            functionId={data.functionId}
            showAll={data.showAllSource}
          />
        </motion.div>
      ) : null}
    </motion.div>
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
function Ghost({ data }: NodeProps<GraphNodeData>) {
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
            style={data.size}
            className={cn(
              "flex items-center gap-2 rounded-token px-3",
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
              <span className="block text-[10px] text-confidence-unresolved/80">
                unresolved
              </span>
            </span>
          </motion.div>
        }
      />
      <TooltipContent side="top">
        <p className="font-mono text-xs">{data.label}</p>
        <p className="text-xs">
          The call is real, but which function it reaches could not be
          determined — {sites}.
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Re-render on what the card *is*, never on where it is.
 *
 * The map glides between layouts by tweening positions sixty times a second
 * (`useAnimatedNodes`), and React Flow passes each node its coordinates as
 * props -- so without this every card, including the Shiki markup inside an
 * open one, re-rendered on every frame of every animation. That is what made
 * the motion stutter. The wrapper's transform still moves each frame; only the
 * card inside it stays put.
 */
const sameCard = (a: NodeProps<GraphNodeData>, b: NodeProps<GraphNodeData>) =>
  sameNodeData(a.data, b.data) && a.selected === b.selected;

export const FunctionNode = memo(FunctionCard, sameCard);
export const GhostNode = memo(Ghost, sameCard);
