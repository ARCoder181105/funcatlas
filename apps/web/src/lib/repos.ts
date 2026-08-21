import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  PARSE_POLL_INTERVAL_MS,
  PARSE_STATUSES_PENDING,
  type ParseStatus,
  type RepoListResponse,
  type RepoTreeResponse,
} from "@funcatlas/shared";
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

/**
 * The repository list, re-asked while any repository is still being parsed.
 *
 * The interval is live only while something is pending and stops at `ready` or
 * `failed`. A poll with no terminal state is a spinner that never resolves,
 * which UI_GUIDE §3.3 calls out as worse than no loading state at all.
 */
export function useRepos() {
  return useQuery<RepoListResponse>({
    queryKey: REPOS_KEY,
    queryFn: () => api.listRepos(),
    refetchInterval: (query) =>
      query.state.data?.repos.some((repo) => PARSE_STATUSES_PENDING.includes(repo.parseStatus))
        ? PARSE_POLL_INTERVAL_MS
        : false,
  });
}

/**
 * Drops a repository's cached tree when its parse finishes.
 *
 * The tree is cached with `staleTime: Infinity`, which was right when the only
 * way to re-parse was to register again. A webhook re-parse changes the graph
 * under a cache that has no reason to suspect it, so the transition into
 * `ready` is what has to invalidate it.
 */
export function useInvalidateParsedTrees() {
  const queryClient = useQueryClient();
  const { data } = useRepos();
  const previous = useRef(new Map<number, ParseStatus>());

  useEffect(() => {
    if (data === undefined) return;
    const seen = previous.current;

    for (const repo of data.repos) {
      const before = seen.get(repo.id);
      if (before !== undefined && before !== "ready" && repo.parseStatus === "ready") {
        void queryClient.invalidateQueries({ queryKey: treeKey(repo.id) });
      }
      seen.set(repo.id, repo.parseStatus);
    }
  }, [data, queryClient]);
}

/** A repository's tree is worth asking for only once its parse has finished. */
export function useRepoParseStatus(repoId: number | null): ParseStatus | null {
  const { data } = useRepos();
  if (repoId === null) return null;
  return data?.repos.find((repo) => repo.id === repoId)?.parseStatus ?? null;
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
  const status = useRepoParseStatus(repoId);

  return useQuery<RepoTreeResponse>({
    queryKey: treeKey(repoId ?? 0),
    queryFn: () => api.tree(repoId as number),
    // Not while a parse is queued or running: the tree would come back empty
    // and the sidebar would say the repository has no files, which is a
    // different claim from "not yet".
    enabled: repoId !== null && status !== "queued" && status !== "parsing",
    // A parsed tree only changes when the repository is re-parsed, and the poll
    // in useRepos is what notices that and invalidates this key.
    staleTime: Infinity,
  });
}

/**
 * Registers a repository. Returns as soon as the parse is queued.
 *
 * It used to hold the request open for the whole clone and parse, up to the
 * API's PARSE_TIMEOUT_MS. Now the response carries a row with
 * `parseStatus: "queued"` and the listing poll is what reports progress, so
 * `retry: false` is about a failed *registration* rather than a failed parse --
 * a parse that fails says so in `parseError` and is not a mutation error at all.
 */
export function useRegisterRepo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (githubUrl: string) => api.registerRepo(githubUrl),
    retry: false,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: REPOS_KEY }),
  });
}
