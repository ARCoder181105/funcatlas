# Security Considerations

This project clones and reads arbitrary user-supplied repositories. That's a real attack surface even though parsing itself only needs read access to source text.

## Principles

- **Parsing never requires execution.** Tree-sitter reads file contents and produces a syntax tree — it does not need `npm install`, `pip install`, build scripts, or any other code from the target repo to run. The clone/parse pipeline should never invoke the repo's own install/build/test scripts.
- **Isolate the clone + parse step.** Even without deliberately executing the repo's code, git hooks and certain tooling can trigger unexpected behavior on clone/checkout. Run cloning and parsing inside a container at minimum; a microVM (e.g. Firecracker-style isolation) is a stronger option if handling many untrusted third-party repos at scale.
- **Mount only what's needed.** The parser process should only have access to the cloned repo's directory — never the host filesystem, credentials, or other users' cloned repos.
- **No network access from the parse step.** The parser doesn't need outbound network access to do its job; blocking it removes a whole class of potential exfiltration or supply-chain risk from a malicious repo.
- **Private repo auth.** GitHub OAuth for user login; webhook payloads must be signature-verified (GitHub's HMAC signature) before being trusted and enqueued.
- **Tenant isolation.** If this ever serves more than one user, cloned repos and parse jobs must not share state, disk, or memory across users/repos — treat each clone as its own isolated workspace, cleaned up after use.

## What this project does NOT need (for now)

- Full code-execution sandboxing (Firecracker/gVisor-grade isolation for *running* arbitrary code) — not required, since parsing is read-only. Revisit only if a future feature actually executes repo code (e.g. running tests).
- Complex per-request sandbox lifecycle management — relevant for AI agents that run many arbitrary commands; this project's parse step is a single, bounded, non-executing operation per job.

## Checklist before handling real users' private repos

- [ ] Clone/parse runs in an isolated container, not the host running the API
- [ ] No install/build scripts from the target repo are ever invoked
- [ ] Parser process has no outbound network access
- [ ] Webhook signatures are verified before jobs are enqueued
- [ ] OAuth tokens are scoped to the minimum GitHub permissions needed (repo read, not admin)
- [ ] Cloned repo data is cleaned up after parsing, not left indefinitely on disk
