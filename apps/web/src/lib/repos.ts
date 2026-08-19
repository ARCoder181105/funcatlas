import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { RepoListResponse, RepoTreeResponse } from "@funcatlas/shared";
import { api } from "./api";

/**
 * Repository listing, registration, and the file tree.
 *
 * Query keys are arrays with the id in them, so two repositories never share a
 * cache entry and switching between them does not show the wrong tree while
 * the right one loads.
 */

export const REPOS_KEY = ["repos"] as const;

export const treeKey = (repoId: number) => ["repo", repoId, "tree"] as const;

export function useRepos() {
  return useQuery<RepoListResponse>({
    queryKey: REPOS_KEY,
    queryFn: () => api.listRepos(),
  });
}

/**
 * The file tree for one repository.
 *
 * A repository with no files is a valid answer -- the API distinguishes
 * "parsed, nothing to show" from "no such repository" deliberately -- so an
 * empty `files` array must reach the component rather than being treated as a
 * failure to load.
 */
export function useRepoTree(repoId: number | null) {
  return useQuery<RepoTreeResponse>({
    queryKey: treeKey(repoId ?? 0),
    queryFn: () => api.tree(repoId as number),
    enabled: repoId !== null,
    // A parsed tree only changes when the repository is re-parsed, which today
    // means a fresh registration -- and that invalidates this key itself.
    staleTime: Infinity,
  });
}

/**
 * Registers a repository, which parses it inline.
 *
 * This holds the request open for the whole clone and parse, up to the API's
 * `PARSE_TIMEOUT_MS` (five minutes by default). Nothing here may impose a
 * shorter deadline: a client that gives up first reports failure on a parse
 * that is still running and about to succeed. TanStack Query has no timeout of
 * its own, and `retry: false` matters for the same reason -- a retry would
 * start a second five-minute parse of a repository that already failed for a
 * real reason.
 *
 * Phase 4's queue replaces the inline spawn; `apps/api/src/repos/register.ts`
 * carries the `ponytail:` marker.
 */
export function useRegisterRepo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (githubUrl: string) => api.registerRepo(githubUrl),
    retry: false,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: REPOS_KEY }),
  });
}
