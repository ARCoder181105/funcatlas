import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { edges, files, functions, repos } from "@funcatlas/shared/schema";
import { buildApp } from "../app.js";
import { db } from "../db/index.js";
import { devLogin } from "../test-helpers.js";

/**
 * The read surface, against real Postgres.
 *
 * Two repositories on purpose: an endpoint that forgets to scope by repository
 * looks correct with one.
 */
let app: FastifyInstance;
let session: string;

const id = {
  repo: 0,
  otherRepo: 0,
  file: 0,
  otherFile: 0,
  getUser: 0,
  forgetPassword: 0,
  noSource: 0,
  otherRepoGetUser: 0,
};

async function get(url: string): Promise<LightMyRequestResponse> {
  return app.inject({ method: "GET", url, headers: { cookie: session } });
}

beforeAll(async () => {
  app = await buildApp();
  session = await devLogin(app);

  await db.execute(sql`TRUNCATE repos, files, functions, edges RESTART IDENTITY CASCADE`);

  const [repo, other] = await db
    .insert(repos)
    .values([
      { githubUrl: "https://github.com/funcatlas/read", defaultBranch: "main" },
      { githubUrl: "https://github.com/funcatlas/other", defaultBranch: "master" },
    ])
    .returning();
  id.repo = repo!.id;
  id.otherRepo = other!.id;

  const [srcFile, emptyFile, otherFile] = await db
    .insert(files)
    .values([
      { repoId: id.repo, path: "src/user.ts", language: "typescript" },
      { repoId: id.repo, path: "src/empty.ts", language: "typescript" },
      { repoId: id.otherRepo, path: "src/user.ts", language: "typescript" },
    ])
    .returning();
  id.file = srcFile!.id;
  id.otherFile = otherFile!.id;

  const inserted = await db
    .insert(functions)
    .values([
      {
        fileId: id.file,
        packagePath: "src",
        name: "getUser",
        qualifiedName: "getUser",
        startLine: 10,
        endLine: 12,
        sourceBlobRef: "function getUser() {\n  return db.user;\n}",
      },
      {
        fileId: id.file,
        packagePath: "src",
        name: "forgetPassword",
        qualifiedName: "forgetPassword",
        startLine: 1,
        endLine: 3,
        sourceBlobRef: "function forgetPassword() {}",
      },
      {
        fileId: id.file,
        packagePath: "src",
        name: "get_user_raw",
        qualifiedName: "get_user_raw",
        startLine: 20,
        endLine: 21,
        // The parser stores null when a body was not captured.
        sourceBlobRef: null,
      },
      {
        // Exists to make the LIKE-escaping test falsifiable: an unescaped
        // "get_user" pattern means get + any character + user, which matches
        // this and not get_user_raw alone.
        fileId: id.file,
        packagePath: "src",
        name: "getXuser",
        qualifiedName: "getXuser",
        startLine: 30,
        endLine: 31,
        sourceBlobRef: "function getXuser() {}",
      },
      {
        // Declared inside a callback, so its scope cannot be pointed at. Real,
        // findable, and ranked below the definitions -- one test file can hold
        // sixty of these.
        fileId: id.file,
        packagePath: "src",
        name: "getSession",
        qualifiedName: "<anonymous>.getSession",
        startLine: 40,
        endLine: 41,
        sourceBlobRef: "() => {}",
      },
      {
        fileId: id.otherFile,
        packagePath: "src",
        name: "getUser",
        qualifiedName: "getUser",
        startLine: 1,
        endLine: 2,
        sourceBlobRef: "function getUser() {}",
      },
    ])
    .returning();

  const byName = Object.fromEntries(inserted.map((fn) => [`${fn.fileId}:${fn.name}`, fn.id]));
  id.getUser = byName[`${id.file}:getUser`]!;
  id.forgetPassword = byName[`${id.file}:forgetPassword`]!;
  id.noSource = byName[`${id.file}:get_user_raw`]!;
  id.otherRepoGetUser = byName[`${id.otherFile}:getUser`]!;

  await db.insert(edges).values({
    callerFunctionId: id.getUser,
    calleeFunctionId: id.forgetPassword,
    calleeName: "forgetPassword",
    callLine: 11,
    resolutionConfidence: "exact",
  });

  // emptyFile stays empty on purpose: "no functions" has to be distinguishable
  // from "no such file".
  expect(emptyFile).toBeDefined();
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE repos, files, functions, edges RESTART IDENTITY CASCADE`);
  await app.close();
});

describe("GET /api/repos", () => {
  it("lists repositories with how much of each was parsed", async () => {
    const res = await get("/api/repos");
    const { repos: listed } = res.json() as {
      repos: { id: number; githubUrl: string; fileCount: number; functionCount: number }[];
    };

    expect(res.statusCode).toBe(200);
    const read = listed.find((r) => r.id === id.repo);
    // Two files, five functions -- not ten, which is what the join yields
    // without a DISTINCT on the file count.
    expect(read).toMatchObject({ fileCount: 2, functionCount: 5 });
  });
});

describe("GET /api/repos/:repoId/tree", () => {
  it("returns the repository's files, ordered by path, with counts", async () => {
    const res = await get(`/api/repos/${id.repo}/tree`);
    const { files: tree } = res.json() as {
      files: { path: string; functionCount: number }[];
    };

    expect(res.statusCode).toBe(200);
    expect(tree.map((f) => f.path)).toEqual(["src/empty.ts", "src/user.ts"]);
    // A file with no functions is still a file.
    expect(tree.map((f) => f.functionCount)).toEqual([0, 5]);
  });

  it("does not leak another repository's files", async () => {
    const res = await get(`/api/repos/${id.otherRepo}/tree`);
    const { files: tree } = res.json() as { files: { id: number }[] };

    expect(tree.map((f) => f.id)).toEqual([id.otherFile]);
  });

  it("404s on an unknown repository", async () => {
    // Not [] -- "no files" and "no such repository" are different answers.
    expect((await get("/api/repos/999999/tree")).statusCode).toBe(404);
  });

  it("400s on an id that is not a positive integer", async () => {
    expect((await get("/api/repos/abc/tree")).statusCode).toBe(400);
    expect((await get("/api/repos/-1/tree")).statusCode).toBe(400);
  });
});

describe("GET /api/files/:fileId/functions", () => {
  it("returns functions in source order, without their bodies", async () => {
    const res = await get(`/api/files/${id.file}/functions`);
    const { functions: list } = res.json() as {
      functions: { name: string; startLine: number }[];
    };

    expect(res.statusCode).toBe(200);
    expect(list.map((f) => f.name)).toEqual([
      "forgetPassword",
      "getUser",
      "get_user_raw",
      "getXuser",
      "getSession",
    ]);
    // Shipping every body to render a list of names is the thing this avoids.
    expect(res.body).not.toContain("return db.user");
  });

  it("returns an empty list for a file that has none", async () => {
    const tree = (await get(`/api/repos/${id.repo}/tree`)).json() as {
      files: { id: number; path: string }[];
    };
    const empty = tree.files.find((f) => f.path === "src/empty.ts")!;

    const res = await get(`/api/files/${empty.id}/functions`);
    expect(res.statusCode).toBe(200);
    expect((res.json() as { functions: unknown[] }).functions).toEqual([]);
  });

  it("404s on an unknown file", async () => {
    expect((await get("/api/files/999999/functions")).statusCode).toBe(404);
  });
});

describe("GET /api/functions/:fnId/source", () => {
  it("returns the source with the file it came from", async () => {
    const res = await get(`/api/functions/${id.getUser}/source`);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      source: "function getUser() {\n  return db.user;\n}",
      startLine: 10,
      endLine: 12,
      path: "src/user.ts",
      language: "typescript",
    });
  });

  it("returns null source rather than 404 when the parser stored none", async () => {
    const res = await get(`/api/functions/${id.noSource}/source`);

    // The function exists; only its body is missing.
    expect(res.statusCode).toBe(200);
    expect((res.json() as { source: string | null }).source).toBeNull();
  });

  it("404s on an unknown function", async () => {
    expect((await get("/api/functions/999999/source")).statusCode).toBe(404);
  });
});

describe("GET /api/repos/:repoId/search", () => {
  it("ranks a prefix match above a substring match", async () => {
    const res = await get(`/api/repos/${id.repo}/search?query=get`);
    const { results } = res.json() as { results: { name: string }[] };

    expect(res.statusCode).toBe(200);
    // Both contain "get"; only getUser starts with it. getSession is a prefix
    // match too, but it lives in an anonymous scope, so it sorts below every
    // function whose scope can be pointed at -- including forgetPassword,
    // which only matches as a substring.
    expect(results.map((r) => r.name)).toEqual([
      "getUser",
      "getXuser",
      "get_user_raw",
      "forgetPassword",
      "getSession",
    ]);
  });

  it("ranks a function declared in an anonymous scope below the definitions", async () => {
    // They stay findable -- hiding them would be the same dishonesty as
    // dropping an unresolved edge -- but a repository's test file can hold
    // sixty callbacks called `fetch`, and burying every real definition under
    // them makes search useless on exactly the repositories that need it.
    const res = await get(`/api/repos/${id.repo}/search?query=getS`);
    const { results } = res.json() as { results: { name: string }[] };

    expect(results.map((r) => r.name)).toEqual(["getSession"]);
  });

  it("searches case-insensitively and carries the file path", async () => {
    const res = await get(`/api/repos/${id.repo}/search?query=GETUSER`);
    const { results } = res.json() as { results: { name: string; path: string }[] };

    expect(results[0]).toMatchObject({ name: "getUser", path: "src/user.ts" });
  });

  it("stays inside the repository it was asked about", async () => {
    const res = await get(`/api/repos/${id.repo}/search?query=getUser`);
    const { results } = res.json() as { results: { id: number }[] };

    // Both repositories have a getUser. Dropping the files.repo_id join
    // returns the other one too.
    expect(results.map((r) => r.id)).not.toContain(id.otherRepoGetUser);
  });

  it("treats _ as a literal, not a wildcard", async () => {
    const res = await get(`/api/repos/${id.repo}/search?query=get_user`);
    const { results } = res.json() as { results: { name: string }[] };

    // Unescaped, "get_user" also matches "getUser" -- _ is "any character".
    expect(results.map((r) => r.name)).toEqual(["get_user_raw"]);
  });

  it("honours limit", async () => {
    const res = await get(`/api/repos/${id.repo}/search?query=e&limit=1`);
    expect((res.json() as { results: unknown[] }).results).toHaveLength(1);
  });

  it("400s on an empty query and 404s on an unknown repository", async () => {
    expect((await get(`/api/repos/${id.repo}/search?query=`)).statusCode).toBe(400);
    expect((await get("/api/repos/999999/search?query=x")).statusCode).toBe(404);
  });
});
