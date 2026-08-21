# Security Considerations

This project clones and reads arbitrary user-supplied repositories. That's a real attack surface even though parsing itself only needs read access to source text.

## Principles

- **Parsing never requires execution.** Tree-sitter reads file contents and produces a syntax tree — it does not need `npm install`, `pip install`, build scripts, or any other code from the target repo to run. The clone/parse pipeline should never invoke the repo's own install/build/test scripts.
- **Isolate the clone + parse step.** Even without deliberately executing the repo's code, git hooks and certain tooling can trigger unexpected behavior on clone/checkout. Run cloning and parsing inside a container at minimum; a microVM (e.g. Firecracker-style isolation) is a stronger option if handling many untrusted third-party repos at scale.
- **Mount only what's needed.** The parser process should only have access to the cloned repo's directory — never the host filesystem, credentials, or other users' cloned repos.
- **No network access from the parse step.** The parser doesn't need outbound network access to do its job; blocking it removes a whole class of potential exfiltration or supply-chain risk from a malicious repo. This is enforced as a **hard runtime constraint** (`docker run --network none`, read-only mount, dropped capabilities) — not just a note.
- **Auth.** GitHub OAuth for user login. The scope is `read:user`, not `repo` -- GitHub OAuth apps have no read-only repository scope, and `repo` grants write access to every private repository the user can reach (R26). Private repositories are therefore out of scope until a phase needs them. Webhook payloads must be signature-verified (GitHub's HMAC signature) before being trusted and enqueued.
- **Tenant isolation.** If this ever serves more than one user, cloned repos and parse jobs must not share state, disk, or memory across users/repos — treat each clone as its own isolated workspace, cleaned up after use.

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

- [x] Clone/parse runs in an isolated container, not the host running the API
- [x] No install/build scripts from the target repo are ever invoked
- [x] Parser process has no outbound network access (`--network none`, read-only mount, dropped caps)
- [ ] Symlink / path-traversal escapes are checked — **path validation done; descriptor-based TOCTOU protection deferred again in Phase 4.** `Walk` hard-fails on any symlink and `ContainsRoot` bounds every path, so an escape needs a directory swapped between the check and the open. That is a real race and a narrow one: the parser reads a checkout it made itself, seconds earlier, in a container with no network and no capabilities. Revisit when it parses a tree someone else can write to.
- [x] File-count, per-file size (>1MB), and depth caps are enforced; binary/`node_modules`/`.git` skipped
- [x] Webhook signatures are verified, replay-protected, and per-repo throttled — HMAC-SHA256 over the **raw bytes** (`routes/webhook.ts`), delivery ids held in Redis with `SET NX`, and a per-hook rate limit. Replay protection is by delivery id rather than a timestamp window: GitHub sends no timestamp, and the id is what a retry repeats.
- [x] All graph endpoints are session-gated — one `preHandler` on one encapsulated scope (`routes/index.ts`), asserted route by route in `routes/graph.test.ts`. Shipped in Phase 3a; the box was never ticked. The webhook is deliberately outside that gate and is authenticated by its signature instead.
- [x] Recursive N-hop CTE is depth-bounded and parameterized — capped at `TRAVERSAL_MAX_DEPTH` by the Zod schema, and the only identifiers reaching `sql.raw` come from a closed map keyed by an already-narrowed union. Shipped in Phase 2; the box was never ticked.
- [ ] OAuth tokens are minimally scoped and refreshed — **scope done, refresh deferred.** `read:user` and nothing more (R26): the only scope that reads private repositories is `repo`, which also grants write to every one of them. Refresh is deferred because nothing uses the token: the parser clones over public HTTPS and never sees a session. It becomes real work the moment a phase needs a private repository.
- [x] Secrets come from env vars via `.env.example`, never committed — every one is a required key in `env.ts`, and `env.test.ts` reads that file as text to assert each non-defaulted key also appears in `.env.example` and in CI. Shipped in Phase 3a; the box was never ticked.
- [x] Cloned repo data is cleaned up after parsing — `Prepare` returns a cleanup func the parser defers, covering the failure path too. `main` was restructured to return an error rather than call `logger.Fatal`, which calls `os.Exit` and skips every defer.
