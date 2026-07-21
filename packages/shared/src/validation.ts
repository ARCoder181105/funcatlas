import { z } from "zod";

/** Zod schemas for API I/O. Single source shared by api + web. */

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
