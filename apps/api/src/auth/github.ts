import { GitHub } from "arctic";
import { env } from "../env.js";
import { GITHUB_USER_ENDPOINT } from "./constants.js";

/**
 * Built on demand rather than at import.
 *
 * Under FUNCATLAS_SINGLE_USER the credentials are absent and no OAuth route is
 * registered, so constructing this at module load would fail on a client
 * nothing was ever going to call. `env.ts` guarantees all three are present
 * whenever single-user mode is off, which is the only time this runs.
 */
let client: GitHub | null = null;

export function githubClient(): GitHub {
  client ??= new GitHub(
    env.GITHUB_CLIENT_ID as string,
    env.GITHUB_CLIENT_SECRET as string,
    env.GITHUB_REDIRECT_URI as string,
  );
  return client;
}


/** Only what a session needs. The rest of the profile is not ours to keep. */
export interface GitHubUser {
  id: number;
  login: string;
}

/** Identifies the token holder. Throws on anything but a well-formed 200 --
 *  the caller turns that into a 400, never a 500. */
export async function fetchGitHubUser(accessToken: string): Promise<GitHubUser> {
  const res = await fetch(GITHUB_USER_ENDPOINT, {
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/vnd.github+json",
      // GitHub rejects requests without one.
      "user-agent": "funcatlas",
    },
  });

  if (!res.ok) {
    throw new Error(`github /user responded ${res.status}`);
  }

  const body: unknown = await res.json();
  const user = body as Partial<GitHubUser>;
  if (typeof user.id !== "number" || typeof user.login !== "string") {
    throw new Error("github /user returned an unexpected shape");
  }
  return { id: user.id, login: user.login };
}
