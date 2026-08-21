import { z } from "zod";
import {
  GITHUB_HOSTS,
  SEARCH_LIMIT,
  SEARCH_MAX_LIMIT,
  SEARCH_QUERY_MAX_LENGTH,
  TRAVERSAL_DEFAULT_DEPTH,
  TRAVERSAL_DIRECTIONS,
  TRAVERSAL_MAX_DEPTH,
} from "./constants.js";

/** Zod schemas for API I/O. Single source shared by api + web. */

/** Depth is capped here, not just defaulted: an unbounded recursive CTE over a
 *  cyclic graph does not return. */
export const traversalQuerySchema = z.object({
  depth: z.coerce
    .number()
    .int()
    .positive()
    .max(TRAVERSAL_MAX_DEPTH)
    .default(TRAVERSAL_DEFAULT_DEPTH),
  direction: z.enum(TRAVERSAL_DIRECTIONS).default("out"),
});

export type TraversalQueryInput = z.infer<typeof traversalQuerySchema>;

/** Substring matching would accept https://evil.com/#github.com. The host has
 *  to be parsed out and compared, not searched for. */
function isGitHubRepoUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || !GITHUB_HOSTS.includes(url.hostname)) {
    return false;
  }
  // Exactly owner/repo. Anything shorter is not a repository, anything longer
  // is a path inside one.
  return url.pathname.replace(/\.git$/, "").split("/").filter(Boolean).length === 2;
}

export const repoUrlSchema = z.object({
  githubUrl: z.string().url().refine(isGitHubRepoUrl, {
    message: "Must be a GitHub repository URL, like https://github.com/owner/repo",
  }),
});

export const searchQuerySchema = z.object({
  repoId: z.coerce.number().int().positive(),
  query: z.string().min(1).max(SEARCH_QUERY_MAX_LENGTH),
  limit: z.coerce.number().int().positive().max(SEARCH_MAX_LIMIT).default(SEARCH_LIMIT),
});

export const oauthCallbackSchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
});

/** A positive-integer id path parameter. The same shape for every table. */
export const idSchema = z.coerce.number().int().positive();

export type RepoUrlInput = z.infer<typeof repoUrlSchema>;
export type SearchQueryInput = z.infer<typeof searchQuerySchema>;
export type OAuthCallbackInput = z.infer<typeof oauthCallbackSchema>;
