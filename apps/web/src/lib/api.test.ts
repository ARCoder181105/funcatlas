import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "./api";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function respond(status: number, body: string | null = null) {
  fetchMock.mockResolvedValue(new Response(body, { status }));
}

/** The URL and init of the single call made. */
function lastCall(): [string, RequestInit & { headers: Record<string, string> }] {
  return fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
}

describe("request", () => {
  it("sends the session cookie", async () => {
    respond(200, JSON.stringify({ userId: 1, login: "dev" }));

    await api.me();

    const [url, init] = lastCall();
    expect(url).toMatch(/\/auth\/me$/);
    // Without this the cookie never leaves the browser and every call is a 401.
    expect(init.credentials).toBe("include");
  });

  it("keeps the json content type on a request that has a body", async () => {
    respond(201, JSON.stringify({ id: 1 }));

    await api.registerRepo("https://github.com/owner/repo");

    const [, init] = lastCall();
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ githubUrl: "https://github.com/owner/repo" }));
    // Fastify parses the body by content type; without this the API answers
    // 415 to a request that otherwise looks correct. That no caller can
    // overwrite it is enforced by RequestOptions, not by this test.
    expect(init.headers["content-type"]).toBe("application/json");
  });

  it("resolves a 204 instead of failing to parse an empty body", async () => {
    respond(204);

    await expect(api.logout()).resolves.toBeUndefined();
  });
});

describe("errors", () => {
  it("throws ApiError carrying the status", async () => {
    respond(401, JSON.stringify({ error: "unauthorized" }));

    // 401 is how the app learns it is signed out, so the status has to survive.
    await expect(api.me()).rejects.toMatchObject({ status: 401, message: "unauthorized" });
  });

  it("surfaces the detail a failed parse returns", async () => {
    respond(502, JSON.stringify({ error: "parser failed", detail: "fatal: repository not found" }));

    await expect(api.registerRepo("https://github.com/owner/gone")).rejects.toMatchObject({
      status: 502,
      message: "parser failed",
      detail: "fatal: repository not found",
    });
  });

  it("survives an error body that is not our json", async () => {
    // A proxy or a crashed process answers with HTML or nothing at all.
    respond(504, "<html>Gateway Timeout</html>");

    const error = await api.listRepos().catch((err: unknown) => err);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(504);
    expect((error as ApiError).message).toContain("Gateway Timeout");
  });
});

describe("query strings", () => {
  it("omits parameters that were not given", async () => {
    respond(200, JSON.stringify({ functionId: 1, reachable: [], edges: [] }));

    await api.edgesForFunction(1);

    // `?depth=undefined` is a 400 from the Zod coercion, not a default.
    expect(lastCall()[0]).toMatch(/\/api\/functions\/1\/edges$/);
  });

  it("includes the parameters that were", async () => {
    respond(200, JSON.stringify({ functionId: 1, reachable: [], edges: [] }));

    await api.edgesForFunction(1, { depth: 3, direction: "in" });

    expect(lastCall()[0]).toContain("?depth=3&direction=in");
  });

  it("encodes a search term instead of splicing it into the url", async () => {
    respond(200, JSON.stringify({ repoId: 1, query: "", results: [] }));

    await api.search(1, "a b&c=d");

    expect(lastCall()[0]).toContain("query=a+b%26c%3Dd");
  });
});
