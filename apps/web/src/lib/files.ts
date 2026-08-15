import { useQuery } from "@tanstack/react-query";
import type { FileFunctionsResponse } from "@funcatlas/shared";
import { api } from "./api";

/**
 * The functions in one file.
 *
 * Deliberately source-free: `apps/api/src/graph/queries.ts` leaves the body out
 * because a file with two hundred functions would otherwise ship two hundred
 * bodies to render a list of names. The code block asks for one function's
 * source separately (B6).
 */

export const fileFunctionsKey = (fileId: number) => ["file", fileId, "functions"] as const;

export function useFileFunctions(fileId: number | null) {
  return useQuery<FileFunctionsResponse>({
    queryKey: fileFunctionsKey(fileId ?? 0),
    queryFn: () => api.functionsForFile(fileId as number),
    enabled: fileId !== null,
    // Only a re-parse changes what is in a file, and that arrives as a new
    // repository registration, which invalidates its own keys.
    staleTime: Infinity,
  });
}
