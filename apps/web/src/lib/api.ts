const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

// Typed fetch client. Session cookie is sent automatically (credentials: include).
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    headers: { "content-type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  listRepos: () => request<unknown[]>("/api/repos"),
  fileTree: (repoId: number) => request<unknown>(`/api/repos/${repoId}/tree`),
  functionsForFile: (fileId: number) =>
    request<unknown>(`/api/files/${fileId}/functions`),
  edgesForFunction: (fnId: number) =>
    request<unknown>(`/api/functions/${fnId}/edges`),
  search: (repoId: number, q: string) =>
    request<unknown>(`/api/repos/${repoId}/search?query=${encodeURIComponent(q)}`),
};
