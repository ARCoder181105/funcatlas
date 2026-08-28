import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { APP_ROUTE } from "@funcatlas/shared";
import { buildApp } from "../app.js";
import { env } from "../env.js";
import { cookieHeader } from "../test-helpers.js";
import { readSession } from "./session.js";

const TOKEN_ENDPOINT = "https://github.com/login/oauth/access_token";
const USER_ENDPOINT = "https://api.github.com/user";

const STATE_COOKIE = "funcatlas_oauth_state";

const githubUser = { id: 4242, login: "octocat" };
const accessToken = "gho_test_token";

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await app.close();
});

/** Stands in for github.com. Arctic passes a Request object; our own client
 *  passes a URL string, so both shapes have to be understood. */
function stubGitHub(responses: Record<string, () => Response>) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const respond = responses[url];
    if (respond === undefined) {
      throw new Error(`unstubbed fetch to ${url}`);
    }
    return respond();
  });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Starts a login, returning the state to send back and the cookie that
 *  authorises it. */
async function beginLogin(): Promise<{ state: string; cookie: string }> {
  const res = await app.inject({ method: "GET", url: "/auth/login" });
  const location = res.headers.location;
  const state = new URL(String(location)).searchParams.get("state");
  const cookie = cookieHeader(res, STATE_COOKIE);

  if (state === null || cookie === null) {
    throw new Error("login did not start a flow");
  }
  return { state, cookie };
}

describe("GET /auth/login", () => {
  it("redirects to GitHub with a fresh state and the narrow scope", async () => {
    const res = await app.inject({ method: "GET", url: "/auth/login" });

    expect(res.statusCode).toBe(302);
    const url = new URL(String(res.headers.location));
    expect(url.origin).toBe("https://github.com");
    expect(url.searchParams.get("client_id")).toBe(env.GITHUB_CLIENT_ID);
    expect(url.searchParams.get("redirect_uri")).toBe(env.GITHUB_REDIRECT_URI);
    // Widening this to `repo` would also grant write access to every private
    // repository the user can reach.
    expect(url.searchParams.get("scope")).toBe("read:user");
    expect(url.searchParams.get("state")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("issues a different state each time", async () => {
    const first = await beginLogin();
    const second = await beginLogin();
    expect(first.state).not.toBe(second.state);
  });
});

describe("GET /auth/callback", () => {
  it("completes the flow and leaves a usable session", async () => {
    stubGitHub({
      [TOKEN_ENDPOINT]: () => json({ access_token: accessToken, token_type: "bearer" }),
      [USER_ENDPOINT]: () => json(githubUser),
    });

    const { state, cookie } = await beginLogin();
    const res = await app.inject({
      method: "GET",
      url: `/auth/callback?code=valid-code&state=${state}`,
      headers: { cookie },
    });

    expect(res.statusCode).toBe(302);
    // The canvas, not the web app's root -- the root is the marketing landing
    // page, and pitching the product to someone who has just signed in to it
    // is the failure this asserts against.
    expect(res.headers.location).toBe(new URL(APP_ROUTE, env.WEB_APP_URL).toString());

    // Reaching here proves the state in the redirect and the state in the
    // cookie are the same value -- nothing else compares them.
    const sessionCookie = cookieHeader(res, env.SESSION_COOKIE_NAME);
    expect(sessionCookie).not.toBeNull();

    const me = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { cookie: String(sessionCookie) },
    });
    expect(me.json()).toEqual({ userId: githubUser.id, login: githubUser.login });
  });

  it("keeps the access token out of every response", async () => {
    stubGitHub({
      [TOKEN_ENDPOINT]: () => json({ access_token: accessToken, token_type: "bearer" }),
      [USER_ENDPOINT]: () => json(githubUser),
    });

    const { state, cookie } = await beginLogin();
    const callback = await app.inject({
      method: "GET",
      url: `/auth/callback?code=valid-code&state=${state}`,
      headers: { cookie },
    });
    const sessionCookie = String(cookieHeader(callback, env.SESSION_COOKIE_NAME));
    const me = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { cookie: sessionCookie },
    });

    expect(callback.body).not.toContain(accessToken);
    expect(sessionCookie).not.toContain(accessToken);
    expect(me.body).not.toContain(accessToken);

    // It is in Redis, which is the only place it belongs.
    const id = decodeURIComponent(sessionCookie.split("=")[1] ?? "").split(".")[0] ?? "";
    expect((await readSession(id))?.accessToken).toBe(accessToken);
  });

  // The two rejection cases below stub a *working* GitHub on purpose. With the
  // exchange guaranteed to succeed, a 400 can only have come from the state
  // check -- delete that check and these turn into 302s.
  it("400s when the callback carries no state cookie", async () => {
    stubGitHub({
      [TOKEN_ENDPOINT]: () => json({ access_token: accessToken, token_type: "bearer" }),
      [USER_ENDPOINT]: () => json(githubUser),
    });

    const { state } = await beginLogin();
    const res = await app.inject({
      method: "GET",
      url: `/auth/callback?code=valid-code&state=${state}`,
    });

    expect(res.statusCode).toBe(400);
  });

  it("400s when the state does not match the cookie", async () => {
    stubGitHub({
      [TOKEN_ENDPOINT]: () => json({ access_token: accessToken, token_type: "bearer" }),
      [USER_ENDPOINT]: () => json(githubUser),
    });

    const { cookie } = await beginLogin();
    const other = await beginLogin();

    const res = await app.inject({
      method: "GET",
      url: `/auth/callback?code=valid-code&state=${other.state}`,
      headers: { cookie },
    });

    // The CSRF case: a callback this browser did not start.
    expect(res.statusCode).toBe(400);
  });

  it("rejects a bad state without exchanging the code", async () => {
    // Stubbed rather than spied bare, so a regression here fails the assertion
    // instead of quietly reaching github.com from the test suite.
    stubGitHub({
      [TOKEN_ENDPOINT]: () => json({ access_token: accessToken, token_type: "bearer" }),
      [USER_ENDPOINT]: () => json(githubUser),
    });

    const { cookie } = await beginLogin();
    await app.inject({
      method: "GET",
      url: "/auth/callback?code=valid-code&state=deadbeef",
      headers: { cookie },
    });

    // The code must not reach GitHub before the callback is known to be ours.
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("does not let one state be used twice", async () => {
    stubGitHub({
      [TOKEN_ENDPOINT]: () => json({ access_token: accessToken, token_type: "bearer" }),
      [USER_ENDPOINT]: () => json(githubUser),
    });

    const { state, cookie } = await beginLogin();
    const url = `/auth/callback?code=valid-code&state=${state}`;

    const first = await app.inject({ method: "GET", url, headers: { cookie } });
    expect(first.statusCode).toBe(302);

    // The browser would have dropped the state cookie after the first call,
    // because the callback cleared it.
    expect(cookieHeader(first, STATE_COOKIE)).toBe(`${STATE_COOKIE}=`);

    const replayed = await app.inject({ method: "GET", url });
    expect(replayed.statusCode).toBe(400);
  });

  it("400s, not 500s, when GitHub rejects the code", async () => {
    stubGitHub({
      // What GitHub actually returns for a spent or forged code: a 200 with an
      // error body.
      [TOKEN_ENDPOINT]: () => json({ error: "bad_verification_code" }),
    });

    const { state, cookie } = await beginLogin();
    const res = await app.inject({
      method: "GET",
      url: `/auth/callback?code=stale-code&state=${state}`,
      headers: { cookie },
    });

    expect(res.statusCode).toBe(400);
  });

  it("400s when the user lookup fails", async () => {
    stubGitHub({
      [TOKEN_ENDPOINT]: () => json({ access_token: accessToken, token_type: "bearer" }),
      [USER_ENDPOINT]: () => json({ message: "Bad credentials" }, 401),
    });

    const { state, cookie } = await beginLogin();
    const res = await app.inject({
      method: "GET",
      url: `/auth/callback?code=valid-code&state=${state}`,
      headers: { cookie },
    });

    expect(res.statusCode).toBe(400);
  });

  it("400s on a callback missing its code", async () => {
    const { state, cookie } = await beginLogin();
    const res = await app.inject({
      method: "GET",
      url: `/auth/callback?state=${state}`,
      headers: { cookie },
    });

    expect(res.statusCode).toBe(400);
  });
});

describe("POST /auth/logout", () => {
  it("destroys the session and clears the cookie", async () => {
    stubGitHub({
      [TOKEN_ENDPOINT]: () => json({ access_token: accessToken, token_type: "bearer" }),
      [USER_ENDPOINT]: () => json(githubUser),
    });

    const { state, cookie } = await beginLogin();
    const callback = await app.inject({
      method: "GET",
      url: `/auth/callback?code=valid-code&state=${state}`,
      headers: { cookie },
    });
    const sessionCookie = String(cookieHeader(callback, env.SESSION_COOKIE_NAME));
    const id = decodeURIComponent(sessionCookie.split("=")[1] ?? "").split(".")[0] ?? "";

    const res = await app.inject({
      method: "POST",
      url: "/auth/logout",
      headers: { cookie: sessionCookie },
    });

    expect(res.statusCode).toBe(204);
    expect(cookieHeader(res, env.SESSION_COOKIE_NAME)).toBe(`${env.SESSION_COOKIE_NAME}=`);
    // Clearing the cookie is not enough on its own -- a copy of it would still
    // work if the Redis entry survived.
    expect(await readSession(id)).toBeNull();
  });

  it("succeeds without a session, so logging out twice is not an error", async () => {
    const res = await app.inject({ method: "POST", url: "/auth/logout" });
    expect(res.statusCode).toBe(204);
  });
});

describe("GET /auth/me", () => {
  it("401s when logged out", async () => {
    const res = await app.inject({ method: "GET", url: "/auth/me" });
    expect(res.statusCode).toBe(401);
  });
});

describe("the deleted dev-login shortcut", () => {
  // R30: a login with no credential. It was gated to non-production, which
  // meant it only had to be reachable once -- a non-production NODE_ENV on a
  // host anyone could reach was a session for the asking.
  it("does not exist, in any environment", async () => {
    const res = await app.inject({ method: "POST", url: "/auth/dev-login" });
    expect(res.statusCode).toBe(404);

    // The real login is still there, so this proves the route is gone rather
    // than the app being broken.
    expect((await app.inject({ method: "GET", url: "/auth/login" })).statusCode).toBe(302);
  });
});

