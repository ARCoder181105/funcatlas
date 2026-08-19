import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SessionUser } from "@funcatlas/shared";
import { api, ApiError } from "./api";

/**
 * Who is signed in. The server owns the answer; this only asks.
 *
 * There is no client-side "logged in" flag to keep in sync -- the session
 * cookie is HttpOnly and unreadable from JavaScript by design, so the only
 * honest way to know is to ask the API.
 */

export const SESSION_KEY = ["session"] as const;

/** `null` means signed out. Loading and error are the query's own states. */
export function useSession() {
  return useQuery<SessionUser | null>({
    queryKey: SESSION_KEY,
    queryFn: async () => {
      try {
        return await api.me();
      } catch (err) {
        // A 401 is the server answering "nobody", not failing to answer.
        // Letting it through as an error would retry it three times with
        // backoff and hold the app on a skeleton while it did.
        if (err instanceof ApiError && err.status === 401) {
          return null;
        }
        throw err;
      }
    },
    // Nothing changes a session except signing in or out, and both of those
    // go through this file.
    staleTime: Infinity,
  });
}

export function useLogout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.logout(),
    onSuccess: () => {
      // Set, not invalidated: the cookie is already gone, so asking /auth/me
      // again only produces a 401 the app can already infer. A bare clear()
      // is worse still -- it drops the session entry, the mounted observer
      // sees no data and refetches, and the app flashes a skeleton on its way
      // to the sign-in card.
      queryClient.setQueryData(SESSION_KEY, null);
      // Everything else was fetched with that session's cookie and must not
      // outlive it.
      queryClient.removeQueries({
        predicate: (query) => query.queryKey[0] !== SESSION_KEY[0],
      });
    },
  });
}

/**
 * Signs in as a fixed local user, skipping GitHub entirely.
 *
 * The route behind this does not exist in production (`auth/routes.ts` gates
 * the registration, not the handler) and Phase 4 deletes it. `import.meta.env.DEV`
 * at the call site keeps the button out of a production bundle as well.
 */
export function useDevLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.devLogin(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SESSION_KEY }),
  });
}
