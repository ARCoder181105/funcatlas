# Security Considerations

This project clones and reads arbitrary user-supplied repositories. That's a real attack surface even though parsing itself only needs read access to source text.

## Principles

- **Parsing never requires execution.** Tree-sitter reads file contents and produces a syntax tree — it does not need `npm install`, `pip install`, build scripts, or any other code from the target repo to run. The clone/parse pipeline should never invoke the repo's own install/build/test scripts.
- **Isolate the clone + parse step.** Even without deliberately executing the repo's code, git hooks and certain tooling can trigger unexpected behavior on clone/checkout. Run cloning and parsing inside a container at minimum; a microVM (e.g. Firecracker-style isolation) is a stronger option if handling many untrusted third-party repos at scale.
- **Mount only what's needed.** The parser process should only have access to the cloned repo's directory — never the host filesystem, credentials, or other users' cloned repos.
- **No network access from the parse step.** The parser doesn't need outbound network access once the clone is done; blocking it removes a whole class of potential exfiltration or supply-chain risk from a malicious repo. **This is a goal, not something the running product currently enforces** — see "Where the isolation actually applies" below before relying on it.
- **Auth.** GitHub OAuth for user login. The scope is `read:user`, not `repo` -- GitHub OAuth apps have no read-only repository scope, and `repo` grants write access to every private repository the user can reach (R26). Private repositories are therefore out of scope until a phase needs them. Webhook payloads must be signature-verified (GitHub's HMAC signature) before being trusted and enqueued.
- **Tenant isolation.** If this ever serves more than one user, cloned repos and parse jobs must not share state, disk, or memory across users/repos — treat each clone as its own isolated workspace, cleaned up after use.

## Where the isolation actually applies

Read this before quoting anything above as a guarantee. **The container constraints are real and
tested, and the running product does not use them.**

There are two ways the parser runs, and only one is sandboxed:

| Path | How it runs | Sandboxed? |
|---|---|---|
| `make parser-isolated` | `docker compose run --rm --no-deps parser` against the `parser` service, which sets `network_mode: "none"`, `read_only: true`, `cap_drop: [ALL]` and a non-root user | **Yes.** This is the harness the constraints were written for. |
| The product, on every path | `apps/api/src/repos/register.ts` calls `execFile(env.PARSER_BIN, [...])` from the queue worker | **No.** A plain child process of the worker, with the worker's network, filesystem and user. |

So `--network none`, the read-only rootfs and the dropped capabilities apply when you deliberately
invoke the harness, and at no other time. `make start` does not use them, and neither would a
composed stack — `docker-compose.yml`'s `parser` service is the harness, which is why it can carry
`network_mode: "none"` and a `depends_on` on Postgres without anyone noticing the contradiction.

**What is genuinely enforced on every path**, because it lives in the parser rather than around it
(`services/parser/internal/security`, covered by `security` package tests):

- Symlinks hard-fail the run; every path is bounded to the clone root.
- Files over `PARSER_MAX_FILE_BYTES` (1 MB) are skipped, and `PARSER_MAX_FILES` /
  `PARSER_MAX_DEPTH` / `PARSER_SKIP_PATHS` cap the walk.
- The clone is `git clone --depth 1` with `GIT_TERMINAL_PROMPT=0` and empty `GIT_ASKPASS` /
  `SSH_ASKPASS`, so a private or missing repository fails immediately instead of blocking on a
  credential prompt (R32).
- The repo's own install, build and test scripts are never invoked. Parsing does not execute code.
- The clone is removed afterwards, on the failure path too.

Closing the gap is **R38**. The two routes both cost something: having the worker shell out to
`docker run` means mounting the Docker socket into it, which grants root-equivalent control of the
host and trades one security property for a worse one; doing it with namespaces, seccomp or
bubblewrap avoids that but is Linux-only and a project in its own right.

## Concrete input hardening (enforced in the clone/parse step)

- **Symlink / path-traversal guard.** Never follow symlinks. Resolve every file path and reject it unless it is strictly inside the clone root (rejects `../../etc/passwd` and symlinks pointing outside the repo). This applies to both parsing and to serving raw source.
- **Repo/clone bombs.** Cap total file count, per-file size (skip files >1MB), and directory depth. Skip binary/non-text files and anything under `node_modules`/`.git`/build output. A 100k-file repo or a 50MB minified file must not OOM the parser. Respecting `.gitignore` is deferred post-MVP — the skip-list already covers where the volume is.
- **Webhook DoS / replay.** HMAC verification alone is insufficient: enforce a timestamp/replay window, per-repo job throttling, and a max-concurrent-parse cap so a flood of webhooks can't exhaust resources.
- **API authorization.** Every graph-serving endpoint is session-gated; anonymous requests are rejected even in single-user mode.
- **SQL / CTE safety.** All queries are parameterized; the recursive N-hop traversal CTE is depth-bounded to prevent runaway queries.

## What this project does NOT need (for now)

- Full code-execution sandboxing (Firecracker/gVisor-grade isolation for *running* arbitrary code) — not required, since parsing is read-only. Revisit only if a future feature actually executes repo code (e.g. running tests).
- Complex per-request sandbox lifecycle management — relevant for AI agents that run many arbitrary commands; this project's parse step is a single, bounded, non-executing operation per job.

## Checklist before handling real users' private repos

- [ ] Clone/parse runs in an isolated container, not the host running the API — **the container exists and is tested; the product does not use it.** `make parser-isolated` runs the parser under `network_mode: "none"`, a read-only rootfs, `cap_drop: ALL` and a non-root user. The queue worker runs the same binary through `execFile`, in its own process space. Ticked from Phase 1 until the landing-page branch, on the strength of the harness rather than of the running path. R38.
- [x] No install/build scripts from the target repo are ever invoked — parsing reads file contents into a syntax tree and nothing else. This one holds on every path, container or not, because it is a property of tree-sitter rather than of the sandbox.
- [ ] Parser process has no outbound network access (`--network none`, read-only mount, dropped caps) — **only under `make parser-isolated`.** Same gap as the box above, and note the parser needs network for `git clone` in the first place, so a real sandbox has to admit a clone stage before it drops the interface.
- [ ] Symlink / path-traversal escapes are checked — **path validation done; descriptor-based TOCTOU protection deferred again in Phase 4.** `Walk` hard-fails on any symlink and `ContainsRoot` bounds every path, so an escape needs a directory swapped between the check and the open. That is a real race and a narrow one: the parser reads a checkout it made itself, seconds earlier, from a `--depth 1` clone of a public repository. **The original wording justified this partly by "in a container with no network and no capabilities", which R38 shows is not true of the running path** — the deferral still stands on the rest, but it stands on less than it appeared to. Revisit when it parses a tree someone else can write to.
- [x] File-count, per-file size (>1MB), and depth caps are enforced; binary/`node_modules`/`.git` skipped
- [x] Webhook signatures are verified, replay-protected, and per-repo throttled — HMAC-SHA256 over the **raw bytes** (`routes/webhook.ts`), delivery ids held in Redis with `SET NX`, and a per-hook rate limit. Replay protection is by delivery id rather than a timestamp window: GitHub sends no timestamp, and the id is what a retry repeats.
- [x] All graph endpoints are session-gated — one `preHandler` on one encapsulated scope (`routes/index.ts`), asserted route by route in `routes/graph.test.ts`. Shipped in Phase 3a; the box was never ticked. The webhook is deliberately outside that gate and is authenticated by its signature instead.
- [x] Recursive N-hop CTE is depth-bounded and parameterized — capped at `TRAVERSAL_MAX_DEPTH` by the Zod schema, and the only identifiers reaching `sql.raw` come from a closed map keyed by an already-narrowed union. Shipped in Phase 2; the box was never ticked.
- [ ] OAuth tokens are minimally scoped and refreshed — **scope done, refresh deferred.** `read:user` and nothing more (R26): the only scope that reads private repositories is `repo`, which also grants write to every one of them. Refresh is deferred because nothing uses the token: the parser clones over public HTTPS and never sees a session. It becomes real work the moment a phase needs a private repository.
- [x] Secrets come from env vars via `.env.example`, never committed — every one is a required key in `env.ts`, and `env.test.ts` reads that file as text to assert each non-defaulted key also appears in `.env.example` and in CI. Shipped in Phase 3a; the box was never ticked.
- [x] Cloned repo data is cleaned up after parsing — `Prepare` returns a cleanup func the parser defers, covering the failure path too. `main` was restructured to return an error rather than call `logger.Fatal`, which calls `os.Exit` and skips every defer.
