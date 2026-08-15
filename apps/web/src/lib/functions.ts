import { useQuery } from "@tanstack/react-query";
import {
  TRAVERSAL_DEFAULT_DEPTH,
  type TraversalDirection,
  type TraversalResponse,
} from "@funcatlas/shared";
import { api } from "./api";

/** Function-scoped queries. The traversal today; B6 adds the source. */

export const traversalKey = (
  fnId: number,
  depth: number,
  direction: TraversalDirection,
) => ["function", fnId, "edges", depth, direction] as const;

/**
 * What a function calls, or what calls it.
 *
 * Depth and direction are in the key, not just the request: with them left out
 * a change to either shows the previous graph until the new one lands, which
 * on a confidence-tagged map means showing edges that were never asked for.
 */
export function useTraversal(
  fnId: number | null,
  depth: number = TRAVERSAL_DEFAULT_DEPTH,
  direction: TraversalDirection = "out",
) {
  return useQuery<TraversalResponse>({
    queryKey: traversalKey(fnId ?? 0, depth, direction),
    queryFn: () => api.edgesForFunction(fnId as number, { depth, direction }),
    enabled: fnId !== null,
    staleTime: Infinity,
  });
}
