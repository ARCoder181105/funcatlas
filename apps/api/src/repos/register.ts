import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { GITHUB_HOST } from "@funcatlas/shared";
import { env } from "../env.js";

const run = promisify(execFile);

/** Enough of the parser's stderr to say what went wrong, not enough to ship a
 *  log file to the client. */
const STDERR_TAIL_LINES = 5;

/**
 * Canonical form of a GitHub repository URL: https, lowercase host, no
 * trailing slash, no .git, no query or fragment.
 *
 * Without this the same repository registers twice under two spellings and
 * produces two disjoint graphs, since repos.github_url is the uniqueness key.
 *
 * Assumes the URL already passed repoUrlSchema.
 */
export function normaliseRepoUrl(raw: string): string {
  const url = new URL(raw);
  const path = url.pathname.replace(/\.git$/, "").replace(/\/+$/, "");
  // Rebuilt field by field, which is what drops ?tab=readme and #anchor.
  // Every accepted host collapses to one, so www and bare are not two repos.
  return `https://${GITHUB_HOST}${path}`;
}

export class ParseError extends Error {
  constructor(
    message: string,
    /** True when the parser was killed at the timeout rather than failing. */
    readonly timedOut: boolean,
    /** Tail of the parser's stderr, safe to hand back to the caller. */
    readonly detail: string,
  ) {
    super(message);
    this.name = "ParseError";
  }
}

/**
 * Clones and parses a repository, writing the graph to Postgres.
 *
 * execFile with an argv array, never a shell: the URL is user input, and no
 * amount of validation makes string interpolation into a command line safe.
 *
 * ponytail: synchronous, so a large repository holds the request open for as
 * long as the parse takes. Phase 4 replaces this with the queue.
 */
export async function runParser(
  githubUrl: string,
  bin = env.PARSER_BIN,
  timeout = env.PARSE_TIMEOUT_MS,
): Promise<void> {
  try {
    await run(
      bin,
      [
        "--repo",
        githubUrl,
        "--repo-url",
        githubUrl,
        "--write",
        "--format",
        "summary",
      ],
      { timeout },
    );
  } catch (err) {
    const timedOut = (err as { killed?: boolean }).killed === true;
    throw new ParseError(
      timedOut ? "parser timed out" : "parser failed",
      timedOut,
      stderrTail(err),
    );
  }
}

function stderrTail(err: unknown): string {
  const stderr = (err as { stderr?: unknown }).stderr;
  if (typeof stderr !== "string") {
    return "";
  }
  const lines = stderr.split("\n").filter(Boolean);
  return failureReason(lines) ?? lines.slice(-STDERR_TAIL_LINES).join("\n");
}

/**
 * The reason out of the parser's zap JSON, rather than the log itself.
 *
 * Every line is a JSON object; the last one carrying an `error` is the failure.
 * Its last line is the one that says why -- git leads with "Cloning into
 * '/tmp/…'" and puts the actual "fatal: …" underneath.
 */
function failureReason(lines: readonly string[]): string | undefined {
  for (let i = lines.length - 1; i >= 0; i--) {
    let reason: unknown;
    try {
      reason = (JSON.parse(lines[i]!) as { error?: unknown }).error;
    } catch {
      continue; // not a log line
    }
    if (typeof reason === "string" && reason.trim() !== "") {
      return reason.split("\n").filter(Boolean).at(-1);
    }
  }
  return undefined;
}
