import { useQueries } from "@tanstack/react-query";
import type { TraversalResponse } from "@funcatlas/shared";
import { api } from "./api";

/** Function-scoped queries. The traversal today; B6 adds the source. */

/**
 * Depth 1, always.
 *
 * The map grows a column at a time by clicking, so asking for more would fetch
 * branches the reader has not opened and draw a graph they did not ask for.
 */
const EXPANSION_DEPTH = 1;

export const expansionKey = (fnId: number) => ["function", fnId, "edges", EXPANSION_DEPTH] as const;

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
