import { motion, type Variants } from "framer-motion";
import { Check, FileCode2 } from "lucide-react";
import { Handle, Position, type NodeProps } from "reactflow";
import { cn } from "../lib/cn";
import { useFileFunctions } from "../lib/files";
import { DURATION, useMotionEnabled, useMotionTransition } from "../lib/motion";
import { useUiStore } from "../store/ui";
import { Badge } from "./ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Empty, EmptyDescription, EmptyTitle } from "./ui/empty";
import { Item, ItemActions, ItemContent, ItemGroup, ItemTitle } from "./ui/item";
import { ScrollArea } from "./ui/scroll-area";
import { Skeleton } from "./ui/skeleton";

/** What the canvas puts in `node.data` for this node type. */
export interface FileCardData {
  fileId: number;
  path: string;
  language: string;
}

/**
 * The card's one piece of motion: the function list plots itself in, row by
 * row, the way a route is drawn rather than switched on.
 *
 * Kept to a container and a child so the timing lives in one place. The delay
 * is capped because a file with eighty functions would otherwise take three
 * seconds to finish arriving, and the reader is waiting on the last row.
 */
const LIST: Variants = {
  hidden: {},
  shown: { transition: { staggerChildren: 0.02, delayChildren: 0.04 } },
};

const ROW: Variants = {
  hidden: { opacity: 0, x: -6 },
  shown: { opacity: 1, x: 0, transition: { duration: DURATION.micro, ease: "easeOut" } },
};

/**
 * A file, and the functions in it. The first thing on the canvas.
 *
 * Clicking a function selects it, which is what B5's mind-map traverses from.
 * The card fetches its own list rather than being handed one, so opening a
 * different file does not re-render every node the canvas holds.
 */
export function FileCard({ data }: NodeProps<FileCardData>) {
  const functions = useFileFunctions(data.fileId);
  const selectedFunctionId = useUiStore((state) => state.selectedFunctionId);
  const rootFunctionIds = useUiStore((state) => state.rootFunctionIds);
  const collapsedFunctionIds = useUiStore((state) => state.collapsedFunctionIds);
  const toggleRoot = useUiStore((state) => state.toggleRoot);
  const transition = useMotionTransition("spring");
  const animated = useMotionEnabled();

  return (
    <motion.div
      initial={animated ? { opacity: 0, scale: 0.96 } : false}
      animate={{ opacity: 1, scale: 1 }}
      transition={transition}
    >
      {/* Only a source handle: a file card is where a traversal starts, so
          nothing points into it. React Flow still needs one to anchor the
          edge geometry B5 draws. */}
      <Handle type="source" position={Position.Right} className="!bg-surface-border" />

      <Card size="sm" className="w-72 gap-0 shadow-lg">
        <CardHeader className="flex-row items-start gap-2 border-b pb-(--card-spacing)">
          <FileCode2
            strokeWidth={1.5}
            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            {/* The full path, wrapped rather than truncated: a path is an
                identifier, and the tail is what disambiguates it. */}
            <CardTitle className="font-mono text-xs leading-snug break-all">{data.path}</CardTitle>
            <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{data.language}</p>
          </div>
        </CardHeader>

        <CardContent className="px-1.5">
          <FunctionList
            query={functions}
            selectedFunctionId={selectedFunctionId}
            openIds={rootFunctionIds.filter((id) => !collapsedFunctionIds.includes(id))}
            onSelect={toggleRoot}
            animated={animated}
          />
        </CardContent>
      </Card>
    </motion.div>
  );
}

function FunctionList({
  query,
  selectedFunctionId,
  openIds,
  onSelect,
  animated,
}: {
  query: ReturnType<typeof useFileFunctions>;
  selectedFunctionId: number | null;
  /** Which of these already have a branch on the canvas. */
  openIds: number[];
  onSelect: (id: number) => void;
  animated: boolean;
}) {
  if (query.isPending) {
    return (
      <div className="flex flex-col gap-2 p-1.5">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-5 w-full" />
        ))}
      </div>
    );
  }

  if (query.isError) {
    return (
      <p className="px-2 py-3 text-xs text-destructive">
        The functions in this file did not load.
      </p>
    );
  }

  const functions = query.data.functions;

  if (functions.length === 0) {
    return (
      <Empty className="gap-1 px-2 py-5">
        <EmptyTitle className="text-sm">No functions here</EmptyTitle>
        <EmptyDescription className="text-xs">
          The parser read this file and found nothing it recognises as a function.
        </EmptyDescription>
      </Empty>
    );
  }

  return (
    // Capped rather than unbounded: a file with two hundred functions would
    // make a node taller than the viewport and impossible to place.
    <ScrollArea className="max-h-64">
      {/* The list arrives as one gesture rather than as N separate fades: the
          container drives the stagger, so the rows cannot drift out of step
          with each other (UI_GUIDE §4). */}
      <motion.div variants={LIST} initial={animated ? "hidden" : false} animate="shown">
        <ItemGroup>
          {functions.map((fn) => {
            const active = fn.id === selectedFunctionId;
            const open = openIds.includes(fn.id);

            return (
              <Item
                key={fn.id}
                size="xs"
                className={cn(
                  // nodrag: without it React Flow reads the press as the start
                  // of a node drag and the click never lands.
                  "nodrag cursor-pointer text-left",
                  active ? "bg-accent text-accent-foreground" : "hover:bg-muted",
                )}
                render={
                  <motion.button variants={ROW} type="button" onClick={() => onSelect(fn.id)} />
                }
              >
                <ItemContent>
                  <ItemTitle className="truncate font-mono text-xs">{fn.name}</ItemTitle>
                </ItemContent>
                <ItemActions>
                  {/* Which functions of this file are already on the canvas.
                      Several can be open at once, each its own branch. */}
                  {open ? (
                    <Check
                      strokeWidth={2}
                      className="size-3.5 shrink-0 text-primary"
                      aria-hidden
                    />
                  ) : null}
                  <Badge variant="outline" className="font-mono text-[10px] tabular-nums">
                    {fn.startLine}
                  </Badge>
                </ItemActions>
              </Item>
            );
          })}
        </ItemGroup>
      </motion.div>
    </ScrollArea>
  );
}
