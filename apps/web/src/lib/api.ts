import type {
  FileFunctionsResponse,
  FunctionSource,
  RegisteredRepo,
  RepoListResponse,
  RepoTreeResponse,
  SearchResponse,
  SessionUser,
  TraversalDirection,
  TraversalResponse,
} from "@funcatlas/shared";

/**
 * The only place the browser talks to the API. Extend `request<T>` rather than
 * calling `fetch` anywhere else -- credentials, error shape and the 204 case
 * are handled once, here.
 *
 * The response types describe the contract the API promises. They are casts,
 * not validation: nothing here checks the body at runtime, so a server that
 * breaks the contract produces a wrong type rather than an error.
 */

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

/**
 * Everything `fetch` takes except the headers, which `request` owns.
 *
 * Allowing a caller to pass headers means one of them eventually replaces the
 * content type its own body is encoded in, and the API answers 415 to a call
 * that looks correct. Removing the option is a compile-time guarantee where a
 * careful spread order would only have been a convention.
 */
type RequestOptions = Omit<RequestInit, "headers">;

/** A response that was not ok. Callers branch on `status` -- notably 401,
 *  which means "logged out", not "retry". */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly detail?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Every route's error body is `{ error, detail? }`. A proxy or a crash can
 *  answer with something else, so parsing is allowed to fail. */
async function errorFrom(res: Response): Promise<ApiError> {
  const body = await res.text();
  try {
    const parsed = JSON.parse(body) as { error?: string; detail?: string };
    return new ApiError(res.status, parsed.error ?? res.statusText, parsed.detail);
  } catch {
    return new ApiError(res.status, body === "" ? res.statusText : body);
  }
}

async function request<T>(path: string, init?: RequestOptions): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    ...init,
    // Only when there is a body to describe. Fastify rejects a request that
    // announces JSON and then sends nothing -- FST_ERR_CTP_EMPTY_JSON_BODY,
    // a 400 -- which is what a bodyless POST like logout or dev-login is.
    // After the spread, so the type above is not the only thing keeping it.
    headers: init?.body === undefined ? {} : { "content-type": "application/json" },
  });

  if (!res.ok) {
    throw await errorFrom(res);
  }

  // 204 carries no body, and res.json() on an empty one throws.
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

/** Encodes values and drops the ones that are not set, so a caller never
 *  builds `?limit=undefined`. */
function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      search.set(key, String(value));
    }
  }
  const encoded = search.toString();
  return encoded === "" ? "" : `?${encoded}`;
}

export const api = {
  /** Where the sign-in button navigates. An OAuth redirect cannot be followed
   *  by fetch, so this is a URL, not a request. */
  loginUrl: () => `${API_URL}/auth/login`,

  /** Throws `ApiError` with status 401 when signed out -- that is an answer,
   *  not a failure. */
  me: () => request<SessionUser>("/auth/me"),

  logout: () => request<void>("/auth/logout", { method: "POST" }),

  /** Signs in as a fixed local user without GitHub. The route 404s in
   *  production and Phase 4 deletes it -- call it only under
   *  `import.meta.env.DEV`. */
  devLogin: () => request<void>("/auth/dev-login", { method: "POST" }),

  listRepos: () => request<RepoListResponse>("/api/repos"),

  /** Runs the parser inline, so this holds until the clone and parse finish.
   *  Phase 4's queue replaces it. */
  registerRepo: (githubUrl: string) =>
    request<RegisteredRepo>("/api/repos", {
      method: "POST",
      body: JSON.stringify({ githubUrl }),
    }),

  tree: (repoId: number) => request<RepoTreeResponse>(`/api/repos/${repoId}/tree`),

  functionsForFile: (fileId: number) =>
    request<FileFunctionsResponse>(`/api/files/${fileId}/functions`),

  functionSource: (fnId: number) => request<FunctionSource>(`/api/functions/${fnId}/source`),

  edgesForFunction: (fnId: number, options?: { depth?: number; direction?: TraversalDirection }) =>
    request<TraversalResponse>(
      `/api/functions/${fnId}/edges${query({ depth: options?.depth, direction: options?.direction })}`,
    ),

  search: (repoId: number, q: string, limit?: number) =>
    request<SearchResponse>(`/api/repos/${repoId}/search${query({ query: q, limit })}`),
};
