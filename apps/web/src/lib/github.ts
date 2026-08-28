import { useQuery } from "@tanstack/react-query";
import { GITHUB_REPO } from "./constants";

/**
 * The repository's star count.
 *
 * A bare `fetch` rather than `lib/api.ts`'s `request<T>`: that helper carries
 * our credentials and our error shape, and this is a public endpoint on
 * someone else's origin. Sending a session cookie to GitHub would be the bug.
 *
 * Not retried and not required. GitHub rate-limits unauthenticated callers
 * hard, so a failure here is ordinary -- the header falls back to a plain link
 * to the repository, which is the part that actually matters.
 */
export function useGitHubStars() {
  return useQuery({
    queryKey: ["github-stars", GITHUB_REPO],
    retry: false,
    staleTime: Infinity,
    queryFn: async (): Promise<number> => {
      const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}`);
      if (!res.ok) throw new Error(`github responded ${res.status}`);

      const body: unknown = await res.json();
      const count = (body as { stargazers_count?: unknown }).stargazers_count;
      if (typeof count !== "number") throw new Error("github sent no star count");

      return count;
    },
  });
}
