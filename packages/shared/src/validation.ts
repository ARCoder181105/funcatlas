import { z } from "zod";
import {
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

export const repoUrlSchema = z.object({
  githubUrl: z.string().url().refine((s) => s.includes("github.com"), {
    message: "Must be a GitHub repository URL",
  }),
});

export const searchQuerySchema = z.object({
  repoId: z.coerce.number().int().positive(),
  query: z.string().min(1).max(200),
  limit: z.coerce.number().int().positive().max(200).default(50),
});

export const oauthCallbackSchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
});

export const functionIdSchema = z.coerce.number().int().positive();

export type RepoUrlInput = z.infer<typeof repoUrlSchema>;
export type SearchQueryInput = z.infer<typeof searchQuerySchema>;
export type OAuthCallbackInput = z.infer<typeof oauthCallbackSchema>;
