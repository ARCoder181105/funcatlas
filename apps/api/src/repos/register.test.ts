import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { ParseError, normaliseRepoUrl, runParser } from "./register.js";

const dir = mkdtempSync(path.join(tmpdir(), "funcatlas-parser-stub-"));

afterAll(() => {
  // Left behind on purpose if a test fails mid-run: these are a few bytes in
  // the OS temp directory, and having them to look at beats tidiness.
});

/** A stand-in for the parser binary, so these tests never clone anything. */
function stubParser(name: string, script: string): string {
  const file = path.join(dir, name);
  writeFileSync(file, `#!/bin/sh\n${script}\n`);
  chmodSync(file, 0o755);
  return file;
}

describe("normaliseRepoUrl", () => {
  // repos.github_url is the uniqueness key, so every spelling that means the
  // same repository has to collapse to one string -- otherwise the same repo
  // registers twice and produces two disjoint graphs.
  it.each([
    "https://github.com/owner/repo",
    "https://github.com/owner/repo/",
    "https://github.com/owner/repo.git",
    "https://github.com/owner/repo///",
    "https://GitHub.com/owner/repo",
    "https://www.github.com/owner/repo",
    "https://github.com/owner/repo?tab=readme-ov-file",
    "https://github.com/owner/repo#readme",
  ])("collapses %s", (raw) => {
    expect(normaliseRepoUrl(raw)).toBe("https://github.com/owner/repo");
  });

  it("leaves the owner and repo case alone", () => {
    // Hosts are case-insensitive; path segments are not, and GitHub shows the
    // canonical casing.
    expect(normaliseRepoUrl("https://github.com/ARCoder181105/funcatlas")).toBe(
      "https://github.com/ARCoder181105/funcatlas",
    );
  });
});

describe("runParser", () => {
  it("resolves when the parser exits 0", async () => {
    const bin = stubParser("ok", "exit 0");
    await expect(
      runParser("https://github.com/owner/repo", bin),
    ).resolves.toBeUndefined();
  });

  it("passes the URL as an argument, not through a shell", async () => {
    // If this reached a shell, the `;` would end the command and `touch` would
    // run. Whatever the parser is handed must arrive as one argv entry.
    const marker = path.join(dir, "pwned");
    const bin = stubParser(
      "echo-args",
      `printf '%s' "$2" > "${path.join(dir, "seen")}"`,
    );
    const hostile = `https://github.com/owner/repo; touch ${marker}`;

    await runParser(hostile, bin);

    const { existsSync, readFileSync } = await import("node:fs");
    expect(existsSync(marker)).toBe(false);
    expect(readFileSync(path.join(dir, "seen"), "utf8")).toBe(hostile);
  });

  it("reports a non-zero exit with the tail of stderr", async () => {
    const bin = stubParser(
      "fail",
      'echo "clone failed: repository not found" >&2\nexit 1',
    );

    await expect(
      runParser("https://github.com/owner/repo", bin),
    ).rejects.toThrow(ParseError);
    await expect(
      runParser("https://github.com/owner/repo", bin),
    ).rejects.toMatchObject({
      timedOut: false,
      detail: expect.stringContaining("repository not found"),
    });
  });

  it("reports the reason out of the parser's zap JSON, not the log", async () => {
    // What the parser really writes when a repository is private or missing.
    // Shipping these lines verbatim put a stack trace in the dialog.
    const logs = [
      `{"level":"info","ts":1,"caller":"clone/clone.go:33","msg":"cloning repo","url":"https://github.com/o/r"}`,
      `{"level":"fatal","ts":2,"caller":"parser/main.go:48","msg":"clone/prepare failed","error":"clone failed: Cloning into '/tmp/funcatlas-clone-1'...\\nfatal: could not read Username for 'https://github.com': terminal prompts disabled\\n","stacktrace":"main.main\\n\\t/home/u/parser/main.go:48"}`,
    ];
    // Via a file, not an inline echo: the real message contains the single
    // quotes git puts round a path, and sh would eat them.
    const log = path.join(dir, "zap.log");
    writeFileSync(log, logs.join("\n") + "\n");
    const bin = stubParser("zap-fail", `cat "${log}" >&2\nexit 1`);

    const detail = await runParser("https://github.com/o/r", bin).catch(
      (err: ParseError) => err.detail,
    );

    expect(detail).toBe(
      "fatal: could not read Username for 'https://github.com': terminal prompts disabled",
    );
    expect(detail).not.toContain("stacktrace");
  });

  it("kills a parser that hangs, rather than holding the request open", async () => {
    const bin = stubParser("hang", "sleep 30");

    await expect(
      runParser("https://github.com/owner/repo", bin, 200),
    ).rejects.toMatchObject({
      timedOut: true,
    });
  });

  it("reports a missing binary rather than throwing something unhandled", async () => {
    await expect(
      runParser(
        "https://github.com/owner/repo",
        path.join(dir, "does-not-exist"),
      ),
    ).rejects.toThrow(ParseError);
  });
});
