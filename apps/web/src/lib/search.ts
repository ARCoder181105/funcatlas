import { useQuery } from "@tanstack/react-query";
import { SEARCH_LIMIT, type SearchResponse } from "@funcatlas/shared";
import { api } from "./api";

/**
 * Function-name search, scoped to one repository.
 *
 * The API already ranks prefix matches above substring matches. Nothing here
 * re-sorts or re-filters: the palette turns cmdk's own filtering off for the
 * same reason, because a second opinion applied client-side quietly discards
 * the ranking the server did with the whole index in front of it.
 */

export const searchKey = (repoId: number, query: string) =>
  ["repo", repoId, "search", query] as const;

export function useSearch(repoId: number | null, query: string) {
  return useQuery<SearchResponse>({
    // The text is part of the key, so a slow "get" answering after a fast
    // "getUser" lands in its own cache entry instead of overwriting the
    // results on screen.
    queryKey: searchKey(repoId ?? 0, query),
    queryFn: () => api.search(repoId as number, query, SEARCH_LIMIT),
    // Search is repo-scoped, and an empty box is not a query -- asking the API
    // for "" would return the first N functions in the repository, which looks
    // like a result and is not one.
    enabled: repoId !== null && query.trim() !== "",
    staleTime: 30_000,
  });
}
