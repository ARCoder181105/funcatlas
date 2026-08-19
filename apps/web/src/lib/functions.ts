import { useRef } from "react";
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
  return useQuery({ ...sourceQuery(fnId ?? 0), enabled: fnId !== null });
}

function sourceQuery(fnId: number) {
  return {
    queryKey: sourceKey(fnId),
    staleTime: Infinity,
    queryFn: async (): Promise<HighlightedSource> => {
      const fn = await api.functionSource(fnId);
      return { ...fn, html: fn.source === null ? null : await highlight(fn.source, fn.language) };
    },
  };
}

/**
 * The source behind every card currently showing one.
 *
 * The canvas needs it too, not just the card: a card is sized to the text it
 * holds, and the layout has to know that size to space the graph around it.
 * Same query key as `useFunctionSource`, so the card and the canvas share one
 * request rather than making two.
 */
export function useSources(fnIds: number[]): Map<number, string | null> {
  const entries = useQueries({
    queries: fnIds.map(sourceQuery),
    combine: (results) =>
      results
        .map((result) => result.data)
        .filter((data): data is HighlightedSource => data !== undefined)
        .map((data) => [data.id, data.source] as const),
  });

  // Cached against what it contains, not what it is.
  //
  // `useQueries` rebuilds its query list every render, so `combine` hands back
  // a fresh array each time and a Map built from it would be a new object on
  // every render -- which re-runs `buildGraph`, produces new node objects, and
  // restarts the canvas animation that watches them, on a loop.
  const signature = entries.map(([id, source]) => `${id}:${source?.length ?? -1}`).join("|");
  const cache = useRef({ signature: "", map: new Map<number, string | null>() });

  if (cache.current.signature !== signature) {
    cache.current = { signature, map: new Map(entries) };
  }

  return cache.current.map;
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
