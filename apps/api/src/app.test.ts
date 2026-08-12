import { afterAll, beforeAll, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.js";

// The point of buildApp is that a route can be exercised without binding a
// port. If inject stops working, every route test in this phase goes with it.
let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
});

afterAll(async () => {
  await app.close();
});

it("answers /healthz through inject, without listening", async () => {
  const res = await app.inject({ method: "GET", url: "/healthz" });

  expect(res.statusCode).toBe(200);
  expect(res.json()).toMatchObject({ status: "ok" });
  expect(app.server.listening).toBe(false);
});
