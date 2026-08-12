import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "@funcatlas/shared/schema";
import { edges, files, functions, repos } from "@funcatlas/shared/schema";
import { directEdges, functionExists, traverse } from "./queries.js";

const DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

const client = postgres(DATABASE_URL ?? "", { max: 1 });
const db = drizzle(client, { schema });

afterAll(async () => {
  // Leave nothing behind: this database is shared with local development, and
  // stray fixture rows show up as phantom functions in the next parse.
  if (DATABASE_URL) {
    await db.execute(sql`TRUNCATE repos, files, functions, edges RESTART IDENTITY CASCADE`);
  }
  await client.end();
});

/**
 * A graph with a cycle in it, because a traversal test over an acyclic graph
 * proves nothing about termination:
 *
 *   a -> b -> c -> a     (cycle)
 *   b -> d               (exact)
 *   d -> ???             (unresolved: no callee row)
 *   isolated             (no edges)
 */
async function seed() {
  await db.execute(sql`TRUNCATE repos, files, functions, edges RESTART IDENTITY CASCADE`);

  const [repo] = await db
    .insert(repos)
    .values({ githubUrl: "https://github.com/funcatlas/cycle", defaultBranch: "main" })
    .returning();
  const [file] = await db
    .insert(files)
    .values({ repoId: repo!.id, path: "cycle.ts", language: "typescript" })
    .returning();

  const rows = await db
    .insert(functions)
    .values(
      ["a", "b", "c", "d", "isolated"].map((name, i) => ({
        fileId: file!.id,
        packagePath: "",
        name,
        qualifiedName: name,
        startLine: i * 10 + 1,
        endLine: i * 10 + 5,
      })),
    )
    .returning();

  const id = Object.fromEntries(rows.map((r) => [r.name, r.id])) as Record<string, number>;

  await db.insert(edges).values([
    { callerFunctionId: id.a!, calleeFunctionId: id.b!, calleeName: "b", callLine: 2, resolutionConfidence: "exact" },
    { callerFunctionId: id.b!, calleeFunctionId: id.c!, calleeName: "c", callLine: 12, resolutionConfidence: "exact" },
    { callerFunctionId: id.c!, calleeFunctionId: id.a!, calleeName: "a", callLine: 22, resolutionConfidence: "name_match" },
    { callerFunctionId: id.b!, calleeFunctionId: id.d!, calleeName: "d", callLine: 13, resolutionConfidence: "exact" },
    { callerFunctionId: id.d!, calleeFunctionId: null, calleeName: "missingFn", callLine: 32, resolutionConfidence: "unresolved" },
  ]);

  return id;
}

describe.skipIf(!DATABASE_URL)("graph traversal", () => {
  let id: Record<string, number>;

  beforeEach(async () => {
    id = await seed();
  });

  it("returns the start node at depth 0 and terminates on a cycle", async () => {
    const reached = await traverse(db, id.a!, 5, "out");

    // a is the start; b, c, d are reachable. a is never re-expanded through
    // the cycle, so it appears exactly once.
    expect(reached.map((r) => `${r.name}@${r.depth}`)).toEqual(["a@0", "b@1", "c@2", "d@2"]);
    expect(reached.filter((r) => r.name === "a")).toHaveLength(1);
  });

  it("bounds the traversal by depth", async () => {
    const reached = await traverse(db, id.a!, 1, "out");
    expect(reached.map((r) => r.name)).toEqual(["a", "b"]);
  });

  it("reports the edge confidence each function was reached through", async () => {
    const reached = await traverse(db, id.a!, 5, "out");
    const byName = Object.fromEntries(reached.map((r) => [r.name, r]));

    expect(byName.a!.confidence).toBeNull(); // the start was not reached via an edge
    expect(byName.b!.confidence).toBe("exact");
    expect(byName.b!.viaFunctionId).toBe(id.a!);
  });

  it("walks callers when direction is in", async () => {
    // Who reaches d? b directly, and a through b.
    const reached = await traverse(db, id.d!, 5, "in");
    expect(reached.map((r) => `${r.name}@${r.depth}`)).toEqual(["d@0", "b@1", "a@2", "c@3"]);
  });

  it("does not traverse through an unresolved edge", async () => {
    // d's only edge is unresolved, so nothing is reachable beyond it.
    const reached = await traverse(db, id.d!, 5, "out");
    expect(reached.map((r) => r.name)).toEqual(["d"]);
  });

  it("returns only the start for a function with no edges", async () => {
    const reached = await traverse(db, id.isolated!, 5, "out");
    expect(reached.map((r) => r.name)).toEqual(["isolated"]);
  });

  it("lists direct edges including unresolved ones", async () => {
    // The traversal cannot surface these -- they reach no function row -- so
    // the dotted edges the canvas draws come from here.
    const list = await directEdges(db, id.d!);
    expect(list).toEqual([
      { id: expect.any(Number), calleeFunctionId: null, calleeName: "missingFn", callLine: 32, confidence: "unresolved" },
    ]);
  });

  it("knows whether a function exists", async () => {
    expect(await functionExists(db, id.a!)).toBe(true);
    expect(await functionExists(db, 999_999)).toBe(false);
  });
});
