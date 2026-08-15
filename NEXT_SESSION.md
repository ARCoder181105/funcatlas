# Next session — frontend reset

Disposable. Delete this file once the new session has picked up the work; it is not part of the
documentation set (`CLAUDE.md` and `TASKLIST.md` remain the sources of truth).

## Why this exists

Phase 3b's backend work is done and correct. The frontend is not good enough. The visual direction
was chosen and the tokens are in place, but only the sign-in screen was ever built, and it was
hand-rolled rather than assembled from a real component library. The next session should treat the
UI as something to redesign with proper tooling, not to continue incrementally.

## Fix this first — the build is red

`npx shadcn init` wrote `apps/web/src/components/ui/button.tsx` alongside the existing
`apps/web/src/components/ui/Button.tsx`. TypeScript refuses two paths differing only in case:

```
TS1261: Already included file name '.../ui/Button.tsx' differs from '.../ui/button.tsx' only in casing.
```

Pick one and delete the other. The same choice applies to `src/lib/utils.ts` (shadcn's `cn`) versus
the existing `src/lib/cn.ts` — two `cn` helpers is the duplication `CLAUDE.md` forbids.

`apps/web/src/index.css` now carries **two theme systems**: shadcn's Nova preset (grayscale `oklch`
variables, Geist) and the project's own via `@config "../tailwind.config.ts"`. Both currently work —
shadcn added `class="dark"` to `<html>`, and the project's `body` rule still wins, so the background
is still `#081014` with IBM Plex Sans. Decide deliberately which system owns the palette rather than
leaving both.

## Prompt for the new session

```
I'm building funcatlas — an interactive visual map of a codebase. A Go/tree-sitter parser
extracts functions and call sites, resolves them into a confidence-tagged call graph in
Postgres, and a React app renders that graph on a React Flow canvas.

ACTIVATE THESE SKILLS FIRST, in this order:
  /redesign-existing-projects   — audit what exists before changing it; this is a redesign,
                                  not a greenfield build
  /design-taste-frontend        — design direction
  /high-end-visual-design       — execution detail: spacing, type, shadows, motion
  /full-output-enforcement      — canvas components are long; stops truncated files

Optional: /imagegen-frontend-web to generate visual references before writing code, and
/impeccable to audit the result at the end.

Do NOT stack /minimalist-ui, /industrial-brutalist-ui and /design-taste-frontend together —
they prescribe conflicting aesthetics. Pick at most one aesthetic skill.

Read these first, in this order:
  1. NEXT_SESSION.md    — why the frontend is being redone, and what is currently broken
  2. CLAUDE.md          — standing instructions, locked stack, conventions
  3. TASKLIST.md        — Phase 3b, chunks B0–B8; B0/B1/B2 done, B3–B8 remaining
  4. docs/UI_GUIDE.md   — current design direction and token table (open to being replaced)
  5. PRD.md §8          — the product's core promise; this one is not negotiable
  6. apps/web/src/      — every frontend file that exists (24 of them)

State: branch phase-3b/canvas-and-search, 6 commits ahead of main, draft PR #26.

The backend is finished and working — 7 REST endpoints behind a GitHub OAuth session gate,
101 passing tests. Bring it up with:
  docker compose up -d postgres redis
  pnpm --filter api dev          # :3000
  pnpm --filter web dev          # :5173
Then open localhost:5173 and click "Continue as a local dev user" — no GitHub OAuth app needed.

THE FRONTEND IS THE JOB. Only the sign-in screen exists. These are still placeholders and are
the actual work:
  apps/web/src/components/Canvas.tsx        (8 lines)
  apps/web/src/components/Sidebar.tsx       (18 lines)
  apps/web/src/components/FunctionCard.tsx  (4 lines)
  apps/web/src/components/CodeBlock.tsx     (4 lines)

What the UI has to do, in one sentence each:
  - Sidebar: a file tree for a repository, from GET /api/repos/:id/tree
  - Canvas: click a file, get a card; click a function, get a mind-map of what it calls
  - Edges: solid = exact match, dashed = name match, dotted = unresolved. This is the whole
    product — see PRD.md §8. An unresolved call must be visible, never hidden.
  - Code block: Shiki-highlighted source, line numbers at the function's real start line
  - ⌘K palette: find any function by name

Frontend stack: Vite + React 19, Tailwind v4 via @tailwindcss/vite (no postcss.config.js),
shadcn initialised with Base UI + Nova preset, TanStack Query, Zustand, Framer Motion,
reactflow v11, Shiki, cmdk, lucide-react. Tests: vitest + Testing Library, 24 passing.

I was not happy with the previous UI. Use real component libraries rather than hand-rolling
primitives. Propose a design direction with screenshots before building it.

Standing rules from CLAUDE.md: one PR per phase; never a Co-Authored-By trailer or any
tool-attribution footer in a commit message or PR body; a test ships in the same commit as
the code it tests; stop at the phase gate.
```

## Skills installed in this repo

`npx skills add Leonxlnx/taste-skill` put 13 skills in `.claude/skills/`. They are **gitignored** —
local to this machine. On a fresh clone, run that command again.

| Skill | Use for |
|---|---|
| `redesign-existing-projects` | Audit an existing UI, find generic patterns. Start here. |
| `design-taste-frontend` | Design direction, anti-templated. |
| `high-end-visual-design` | Spacing, type, shadow, motion detail. |
| `impeccable` | Audit and polish a finished interface. |
| `imagegen-frontend-web` | Generate visual references before coding. |
| `image-to-code` | Design an image first, then implement to match it. |
| `full-output-enforcement` | Prevents truncated long files. |
| `minimalist-ui`, `industrial-brutalist-ui`, `stitch-design-taste` | Specific aesthetics — pick at most one. |
| `brandkit`, `imagegen-frontend-mobile`, `design-taste-frontend-v1` | Not relevant here. |

`frontend-design` (Anthropic's own) is installed at `~/.claude/skills/`, so it is available in every
project without reinstalling.

Only `.claude/skills/` is read by Claude Code. `npx skills add` also writes `.agents/`, `.codex/`,
`.github/agents/`, `.github/skills/` and `.github/hooks/` for other tools — about 7.5 MB that can be
deleted if only Claude Code is used. `.github/hooks/impeccable.json` registers a `postToolUse` hook
that runs `node .github/skills/impeccable/scripts/hook.mjs` after every edit; keep it only if that
is wanted.

## Component libraries worth using

| Library | Verdict |
|---|---|
| [ui.shadcn.com](https://ui.shadcn.com/) | Initialised already — Base UI, Nova preset. `npx shadcn@latest add <component>`. |
| [animate-ui.com](https://animate-ui.com/) | React + Tailwind + Framer Motion + Base UI. Matches this stack; installs through the shadcn CLI. |
| [uupm.cc](https://www.uupm.cc/) | Searchable database of UI styles, palettes and font pairings. |
| [impeccable.style](https://impeccable.style/) | Already installed as a skill. |
| [lenis.dev](https://lenis.dev/) | Only for a marketing landing page. On the canvas it fights React Flow's wheel handling. |
| [inspira-ui.com](https://inspira-ui.com/docs/en) | **Vue/Nuxt — will not work in this React app.** It is the Vue port of Aceternity UI; use Aceternity or magicui for that look in React. |

## Two things not to undo

Everything visual is open to replacement. These two are not cosmetic:

1. **`src/lib/confidence.ts` imports `CONFIDENCE_STYLE` from `packages/shared`** rather than
   restating it. That is what keeps the canvas and the database from disagreeing about which edge is
   dashed. A second copy of that mapping is a silent correctness bug.
2. **An unresolved call has no callee row**, so a naive traversal-to-nodes mapper drops it and the
   canvas then shows a function calling nothing. `GET /api/functions/:id/edges` returns `edges`
   separately from `reachable` for exactly this reason. Unresolved calls must be rendered — as ghost
   nodes, or however the new design prefers — but never omitted. `PRD.md` §8.

## Where the backend is

Finished, tested, and not the problem.

| Endpoint | Returns |
|---|---|
| `GET /auth/me` | `{ userId, login }`, or 401 when signed out |
| `POST /auth/logout` | 204 |
| `POST /auth/dev-login` | 204, non-production only |
| `GET /api/repos` | `{ repos: RepoSummary[] }` |
| `POST /api/repos` | Registers and parses. Blocks for the whole parse — up to `PARSE_TIMEOUT_MS`. |
| `GET /api/repos/:id/tree` | `{ repoId, files: FileNode[] }` — flat, path-ordered; the client nests |
| `GET /api/files/:id/functions` | `{ fileId, functions: FunctionSummary[] }` — no source |
| `GET /api/functions/:id/source` | `{ source, startLine, endLine, path, language }` |
| `GET /api/functions/:id/edges` | `{ reachable, edges }` — see note 2 above |
| `GET /api/repos/:id/search` | `{ results: SearchResult[] }` — already ranked, do not re-sort |

Every response type is declared once in `packages/shared/src/types.ts` and consumed by both sides.
