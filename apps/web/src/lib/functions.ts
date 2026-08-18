import { useQueries, useQuery } from "@tanstack/react-query";
import type { FunctionSource, TraversalResponse } from "@funcatlas/shared";
import { api } from "./api";
import { highlight } from "./highlight";

/** Function-scoped queries: the traversal, and the source behind it. */

/**
 * Depth 1, always.
 *
 * The map grows a column at a time by clicking, so asking for more would fetch
 * branches the reader has not opened and draw a graph they did not ask for.
 */
const EXPANSION_DEPTH = 1;

export const expansionKey = (fnId: number) => ["function", fnId, "edges", EXPANSION_DEPTH] as const;

export const sourceKey = (fnId: number) => ["function", fnId, "source"] as const;

/** The source plus its highlighted markup. `html` is null exactly when the
 *  parser stored no source. */
export interface HighlightedSource extends FunctionSource {
  html: string | null;
}

/**
 * Fetch and highlight in one query.
 *
 * Both are async and neither is useful alone, so keeping them in one queryFn
 * gives the code block a single pending state -- one skeleton covering the
 * request and the highlighter's first load, rather than a skeleton followed by
 * a flash of unhighlighted text. Cached forever: source at a commit does not
 * change, and re-highlighting on every click is the slow part.
 */
export function useFunctionSource(fnId: number | null) {
  return useQuery({
    queryKey: sourceKey(fnId ?? 0),
    enabled: fnId !== null,
    staleTime: Infinity,
    queryFn: async (): Promise<HighlightedSource> => {
      const fn = await api.functionSource(fnId as number);
      return { ...fn, html: fn.source === null ? null : await highlight(fn.source, fn.language) };
    },
  });
}

/**
 * One query per opened function, merged into a single result.
 *
 * `useQueries` rather than a loop of `useQuery` because the list length
 * changes as the reader expands, and hooks cannot be called conditionally.
 * Each expansion caches under its own key, so re-opening a function already on
 * the map costs nothing and collapsing-then-reopening is instant.
 */
export function useExpansions(functionIds: number[]) {
  return useQueries({
    queries: functionIds.map((fnId) => ({
      queryKey: expansionKey(fnId),
      queryFn: () => api.edgesForFunction(fnId, { depth: EXPANSION_DEPTH, direction: "out" as const }),
      staleTime: Infinity,
    })),
    combine: (results) => ({
      // Only the expansions that have arrived. A half-drawn map is correct as
      // far as it goes; waiting for all of them would blank the canvas every
      // time the reader opened one more function.
      data: results
        .map((result) => result.data)
        .filter((data): data is TraversalResponse => data !== undefined),
      isPending: results.some((result) => result.isPending),
      error: results.find((result) => result.error !== null)?.error ?? null,
    }),
  });
}
