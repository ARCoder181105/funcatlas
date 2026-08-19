import { motion } from "framer-motion";
import { ChevronDown, FileCode2 } from "lucide-react";
import { useFunctionSource } from "../lib/functions";
import { CODE_PREVIEW_LINES } from "../lib/graph";
import { DURATION } from "../lib/motion";
import { useUiStore } from "../store/ui";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/skeleton";

/**
 * The last step of the chain: file, card, mind-map, code (UI_GUIDE §3.2).
 *
 * It fills whatever its card gives it -- `FunctionNode` sets the height, from
 * the same constant the layout spaced the graph with -- and scrolls inside
 * that. Nothing here may grow with the length of the source, or a card would
 * change size after the graph was laid out around it.
 *
 * The markup comes from Shiki and is written straight into the DOM. That is
 * safe here for a specific reason rather than by assumption: Shiki escapes the
 * text it is given and emits nothing but `pre`, `code` and `span`, so a
 * repository containing `<script>` in a string literal renders as characters.
 * Nothing else may be passed to this element.
 */
export function CodeBlock({ functionId, showAll }: { functionId: number; showAll: boolean }) {
  const query = useFunctionSource(functionId);
  const toggleFullSource = useUiStore((state) => state.toggleFullSource);

  if (query.isPending) {
    return <LoadingSource />;
  }

  if (query.isError) {
    return <Note>The source could not be loaded.</Note>;
  }

  const { path, startLine, endLine, html, source } = query.data;
  const lineCount = source === null ? 0 : source.split("\n").length;

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface-raised">
      <header className="flex shrink-0 items-baseline gap-2 border-b border-surface-border px-3 py-2">
        <span className="truncate font-mono text-xs text-ink">{path}</span>
        <span className="shrink-0 font-mono text-xs text-ink-muted">
          {startLine}–{endLine}
        </span>
      </header>

      {html === null ? (
        <Note>
          The parser stored no source for this function. Its calls are still on the map.
        </Note>
      ) : (
        // Clipped, never scrolled. The wheel over this canvas zooms the map, so
        // a scroll region here would make the reader's own gesture mean two
        // things depending on where the pointer landed. `codeCardSize` measured
        // the card to the lines it is showing, and the button below grows it.
        <div className="nodrag relative min-h-0 flex-1 overflow-hidden">
          {/* Line numbers are the file's, not the block's: the counter starts
              one below startLine and index.css increments it per line, so they
              match the file on GitHub. */}
          <motion.div
            // The skeleton and the source are two different shapes; crossing
            // between them instantly reads as a flicker.
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: DURATION.micro, ease: "easeOut" }}
            className="code-block p-3 text-xs leading-relaxed"
            style={{ counterReset: `line ${startLine - 1}` }}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      )}

      {html !== null && lineCount > CODE_PREVIEW_LINES ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => toggleFullSource(functionId)}
          className="nodrag h-8 w-full shrink-0 justify-center gap-1.5 border-t border-surface-border text-xs text-ink-muted"
        >
          <ChevronDown
            strokeWidth={1.5}
            className={`size-3.5 transition-transform duration-micro ${showAll ? "rotate-180" : ""}`}
            aria-hidden
          />
          {showAll ? "Show fewer lines" : `${lineCount - CODE_PREVIEW_LINES} more lines`}
        </Button>
      ) : null}
    </div>
  );
}

/** Shiki's grammars are a real download, so this is a genuine wait rather than
 *  an artificial one (UI_GUIDE §3.3). */
function LoadingSource() {
  return (
    <div className="h-full space-y-2 bg-surface-raised p-3" aria-busy>
      <Skeleton className="h-3 w-2/3" />
      <Skeleton className="h-3 w-1/2" />
      <Skeleton className="h-3 w-4/5" />
      <Skeleton className="h-3 w-3/5" />
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    // h-full for the standalone case, flex-1 for the one inside the column.
    <div className="flex h-full min-h-0 flex-1 items-start gap-2 bg-surface-raised p-4 text-sm text-ink-muted">
      <FileCode2 className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} aria-hidden />
      <p>{children}</p>
    </div>
  );
}
