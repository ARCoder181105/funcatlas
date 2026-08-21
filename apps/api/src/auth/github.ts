import { GitHub } from "arctic";
import { env } from "../env.js";
import { GITHUB_USER_ENDPOINT } from "./constants.js";

export const github = new GitHub(
  env.GITHUB_CLIENT_ID,
  env.GITHUB_CLIENT_SECRET,
  env.GITHUB_REDIRECT_URI,
);


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
