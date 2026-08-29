import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Keeps the env schema, `.env.example` and the CI workflow from drifting.
 *
 * `env.ts` calls `schema.parse` at module scope, so a required key that is not
 * set anywhere takes down every file that imports the app — the failure is a
 * ZodError at import time, seven test files at once, and nothing in it points
 * at the workflow that forgot to set it. That is exactly how CI stayed red
 * across several pushes when `APP_PUBLIC_URL` was renamed to `WEB_APP_URL`
 * here and not there.
 *
 * The schema is read as text rather than imported: importing it would run the
 * same `parse` this test exists to reason about.
 */

const repoRoot = path.resolve(import.meta.dirname, "../../..");

function read(relative: string): string {
  return readFileSync(path.join(repoRoot, relative), "utf8");
}

/**
 * Keys the schema declares with neither `.default(...)` nor `.optional()`,
 * which are therefore required at startup. Parsed from the source so adding
 * one to `env.ts` is enough to make this test start demanding it.
 *
 * `.optional()` joined `.default(` here when FUNCATLAS_SINGLE_USER and the
 * three GitHub OAuth credentials became conditional: they are legitimately
 * absent, and the old heuristic demanded them in CI.
 */
function requiredKeys(): string[] {
  const source = read("apps/api/src/env.ts");
  const body = source.slice(source.indexOf("z.object({"), source.indexOf("export const env"));

  return [...body.matchAll(/^\s{2}([A-Z][A-Z0-9_]*):\s*([\s\S]*?)(?=^\s{2}[A-Z][A-Z0-9_]*:|^\}\))/gm)]
    .filter(
      ([, , definition]) =>
        definition !== undefined &&
        !definition.includes(".default(") &&
        !definition.includes(".optional("),
    )
    .map(([, key]) => key as string);
}

describe("environment", () => {
  it("finds required keys to check", () => {
    // A regex that silently matches nothing would make every assertion below
    // vacuously true.
    expect(requiredKeys().length).toBeGreaterThan(5);
    expect(requiredKeys()).toContain("WEB_APP_URL");
  });

  it("documents every required key in .env.example", () => {
    const example = read(".env.example");

    for (const key of requiredKeys()) {
      expect(example, `${key} is required but missing from .env.example`).toMatch(
        new RegExp(`^\\s*#?\\s*${key}=`, "m"),
      );
    }
  });

  it("sets every required key in the CI workflow", () => {
    // Without this the suite fails in CI and passes locally, because locally
    // there is a .env and in CI there is not.
    const workflow = read(".github/workflows/node-ci.yml");

    for (const key of requiredKeys()) {
      expect(workflow, `${key} is required but not set in node-ci.yml`).toMatch(
        new RegExp(`^\\s*${key}:`, "m"),
      );
    }
  });
});
