import { afterEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

/**
 * `FUNCATLAS_SINGLE_USER` removes authentication entirely, so what it does has
 * to be pinned rather than assumed.
 *
 * `env` is parsed once at import, so each case rebuilds the module graph under
 * a stubbed environment -- stubbing after the import would leave the
 * already-parsed value in place and every assertion would pass against the
 * same build. The same technique the deleted dev-login's production test used.
 */
async function buildWith(login: string | undefined): Promise<FastifyInstance> {
  vi.resetModules();
  if (login === undefined) {
    vi.stubEnv("FUNCATLAS_SINGLE_USER", "");
  } else {
    vi.stubEnv("FUNCATLAS_SINGLE_USER", login);
  }

  const { buildApp } = await import("../app.js");
  return buildApp();
}

/** Each rebuild opens its own Redis connection; without closing it the run
 *  hangs on an open handle after the last test. */
async function close(app: FastifyInstance) {
  const { redis } = await import("../redis.js");
  await app.close();
  redis.disconnect();
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("with FUNCATLAS_SINGLE_USER set", () => {
  it("answers a gated route without any cookie", async () => {
    const app = await buildWith("octocat");
    try {
      const res = await app.inject({ method: "GET", url: "/api/repos" });

      // The gate is the whole point: this exact request is 401 without it,
      // which the sibling case below asserts rather than assumes.
      expect(res.statusCode).toBe(200);
    } finally {
      await close(app);
    }
  });

  it("does not register the OAuth routes at all", async () => {
    const app = await buildWith("octocat");
    try {
      // 404, not 401. A handler that exists and refuses tells a prober there
      // is something here worth finding credentials for -- the same reasoning
      // that shaped the dev-login gate in R30.
      for (const url of ["/auth/login", "/auth/callback", "/auth/logout"]) {
        const res = await app.inject({ method: "GET", url });
        expect(res.statusCode, url).toBe(404);
      }
    } finally {
      await close(app);
    }
  });

  it("tells the web app there is nobody to sign out", async () => {
    const app = await buildWith("octocat");
    try {
      const res = await app.inject({ method: "GET", url: "/auth/me" });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ login: "octocat", singleUser: true });
    } finally {
      await close(app);
    }
  });
});

describe("without it", () => {
  it("still refuses an anonymous request", async () => {
    const app = await buildWith(undefined);
    try {
      const res = await app.inject({ method: "GET", url: "/api/repos" });

      expect(res.statusCode).toBe(401);
    } finally {
      await close(app);
    }
  });

  it("still registers the OAuth entry point", async () => {
    const app = await buildWith(undefined);
    try {
      const res = await app.inject({ method: "GET", url: "/auth/login" });

      // A broken rebuild that registered nothing would pass the 404 assertion
      // above for the wrong reason. This is what stops that.
      expect(res.statusCode).toBe(302);
    } finally {
      await close(app);
    }
  });
});
