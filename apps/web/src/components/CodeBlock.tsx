import { FileCode2 } from "lucide-react";
import { useFunctionSource } from "../lib/functions";
import { ScrollArea } from "./ui/scroll-area";
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
export function CodeBlock({ functionId }: { functionId: number }) {
  const query = useFunctionSource(functionId);

  if (query.isPending) {
    return <LoadingSource />;
  }

  if (query.isError) {
    return <Note>The source could not be loaded.</Note>;
  }

  const { path, startLine, endLine, html } = query.data;

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
        // nowheel, or the wheel zooms the canvas instead of scrolling the
        // source; nodrag, or a text selection drags the card away.
        <ScrollArea className="nodrag nowheel min-h-0 flex-1">
          {/* Line numbers are the file's, not the block's: the counter starts
              one below startLine and index.css increments it per line, so they
              match the file on GitHub. */}
          <div
            className="code-block p-3 text-xs leading-relaxed"
            style={{ counterReset: `line ${startLine - 1}` }}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </ScrollArea>
      )}
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
