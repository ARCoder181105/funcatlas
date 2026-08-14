# Phase 3b — Canvas and Search

The live task list. Phase 3a put a session gate in front of a confidence-tagged call graph and made
all seven endpoints real, exercisable with `curl`. Phase 3b is the first phase with a face: the
sidebar, the canvas, the code block and the palette that turn those endpoints into something a
person can explore.

**Branch:** `phase-3b/canvas-and-search`
**Reference:** [`PLAN.md`](PLAN.md) Phase 3 · [`docs/UI_GUIDE.md`](docs/UI_GUIDE.md) ·
[`PRD.md`](PRD.md) §8

## How to work through this

Claude implements; you review at the phase gate. One chunk at a time, top to bottom — the order is
load-bearing: B0 unblocks every test and every typed call, B1 has to exist before anything can be
seen logged in, B2 produces the ids B3 needs, and B4's node ids are what B5 and B6 select. Each
chunk lists:

- **Why** — the reason it exists, so it can be pushed back on if the reason is wrong.
- **Where** — the files it touches.
- **Do** — the work, broken into steps.
- **Done when** — the objective test. Not "the code compiles".
- **Watch for** — the specific bugs to check for before the chunk is committed.

Write the test in the same commit as the code it tests. Commit one chunk at a time with an
imperative message. `[ ]` todo · `[~]` in progress · `[x]` done.

## What this phase actually teaches

| Chunks | Concept | Where else you'll meet it |
|---|---|---|
| B0 | One type definition serving both sides of the wire, so drift is a compile error | Every full-stack TypeScript codebase |
| B1 | Authentication as *derived state* — the server owns it, the client only asks | Every SPA with a session behind it |
| B2 | Pure transforms extracted out of components, so the hard logic is testable without a DOM | React, Vue, Svelte — the pattern outlives the framework |
| B4 | Rendering uncertainty honestly instead of hiding it | Any tool whose output is inferred rather than known |
| B6 | Debounce, cancellation, and why a search box is harder than it looks | Every type-ahead you will ever build |

B4 is the one worth slowing down for. It is where `resolution_confidence` stops being a database
column and becomes the product's central claim — PRD §8. An unresolved edge points at no function
row, so a naive mapper silently drops it, and the canvas confidently shows a function calling
nothing. That is precisely the failure the whole design exists to prevent.

## Decisions taken before starting

Asked and answered at planning time, so they are not re-litigated mid-phase.

- **Login screen, not a landing page.** UI_GUIDE §3.1's animated marketing hero is its own surface
  and its own PR. Logged out shows a centred sign-in card. Nothing in the 3b exit test touches a
  landing page.
- **One file card and one mind-map at a time.** UI_GUIDE §3.2's multi-open canvas multiplies canvas
  state — namespaced node ids, per-card layout, focus scoped across cards. Additive later, not a
  rewrite.
- **No shadcn CLI.** `clsx` + `tailwind-merge` give a `cn()` helper; the three or four primitives
  actually needed are hand-written against the tokens already in `tailwind.config.ts`. The generated
  shadcn theme layer would duplicate those tokens.
- **Tests are logic-first.** Every non-trivial transform is a pure function tested directly, plus a
  render smoke test per surface. The smoke tests exist mainly to catch a component that throws.

## What Phase 3b does not build

Not gaps — deliberate scope. Say so now if you disagree, not at the gate.

- **No landing page, no marketing surface, no router.** One authenticated app at `/`.
- **No saved layouts.** Positions reset on reload; `PLAN.md` cut this from the MVP explicitly.
- **No light theme.** Dark-mode-first per UI_GUIDE §1; light is a stretch goal.
- **No queue and no webhooks.** Registering a repo still blocks. The UI shows honest progress
  instead of pretending it is fast. Phase 4 replaces the spawn.
- **No mobile canvas.** Desktop-first, per UI_GUIDE §5. The canvas is a power-user surface.

---

## B0 — Typed client, test infrastructure, `cn()`  `[ ]`

**Why.** `apps/web/src/lib/api.ts` types every response as `unknown`, so nothing downstream can be
written safely and no wrong field access is a compile error. `apps/web` has no test runner at all
(`"test": "echo \"no tests yet\""`), which makes the standing "a test ships with the code it tests"
rule unenforceable for the entire phase. Both have to be true before any component is worth writing.

**Where.** `packages/shared/src/types.ts`, `apps/api/src/graph/queries.ts`,
`apps/web/src/lib/api.ts`, `apps/web/src/lib/cn.ts`, `apps/web/vitest.config.ts`,
`apps/web/src/test-setup.ts`, `apps/web/package.json`.

**Do.**

1. Add response interfaces to `packages/shared/src/types.ts` — `RepoSummary`, `FileNode`,
   `FunctionSummary`, `SearchResult`, `FunctionSource`, `CallEdge`, `TraversalResponse`. One
   definition, both sides.
2. Annotate the return types in `apps/api/src/graph/queries.ts` with those interfaces, so the API
   drifting from the shared type fails `pnpm -r typecheck` rather than at runtime in the browser.
3. Rewrite `apps/web/src/lib/api.ts`: same `request<T>`, every method typed, and add the calls that
   are missing — `me`, `logout`, `registerRepo`, `tree`, `functionSource`. Never a bare `fetch`.
4. Add `clsx` + `tailwind-merge`; `src/lib/cn.ts` is the two-line merge helper.
5. Add `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom` as dev deps;
   `vitest.config.ts` with the jsdom environment and a setup file; real `test` script.

**Done when.** `pnpm --filter web test` runs a real suite and passes. `grep -c unknown
apps/web/src/lib/api.ts` is 0. A deliberate field-name typo in `queries.ts` fails typecheck.

**Watch for.**

- `request<T>` currently spreads `...init` *after* `headers`, so passing headers silently drops the
  content-type. Check before adding a POST that relies on it.
- A `Promise<T>` cast is not validation. The types describe what the API promises; they do not
  verify it. Say so in a comment rather than implying runtime safety.
- Vitest config in `apps/web` must not inherit `apps/api`'s — that one is jsdom-less and sets
  `fileParallelism: false` for Postgres, neither of which applies here.

---

## B1 — Auth shell: login screen, session state, logout  `[ ]`

**Why.** Everything else in the phase is behind a session, and the web app currently has no concept
of one. It also closes a bug found while planning: `APP_PUBLIC_URL` is `http://localhost:3000`, and
it is used in exactly one place — the post-OAuth redirect — so a successful login lands the user on
the API's port instead of the app. Nothing caught it in 3a because 3a had no browser.

**Where.** `apps/web/src/App.tsx`, `apps/web/src/components/LoginScreen.tsx`,
`apps/web/src/components/AppHeader.tsx`, `apps/web/src/lib/session.ts`, `.env`, `.env.example`,
`DEVELOPMENT.md`.

**Do.**

1. Point `APP_PUBLIC_URL` at the web app (`http://localhost:5173`) in `.env.example`, and note in
   `DEVELOPMENT.md` that this is the post-login landing URL, not the API's own address.
2. `useSession()` — a TanStack Query hook over `GET /auth/me`. A 401 is a *successful answer*
   meaning "logged out", not a failure to retry.
3. `LoginScreen` — centred card, product name, one "Sign in with GitHub" button that navigates to
   `${API_URL}/auth/login`. A dev-login button rendered only under `import.meta.env.DEV`.
4. `AppHeader` — the logged-in GitHub login, and a logout button that POSTs and then invalidates the
   session query.
5. `App.tsx` becomes three states: resolving (skeleton), logged out (`LoginScreen`), logged in (the
   explorer shell).

**Done when.** With the API running: loading the app logged out shows the sign-in card; dev-login
lands on the explorer; logout returns to the card and a reload stays there. Tests cover all three
states against a mocked `/auth/me`.

**Watch for.**

- TanStack Query retries failed queries three times by default. A 401 must not become four requests
  and a multi-second blank screen — `retry: false`, or a 401-aware retry predicate.
- The sign-in button is a full navigation (`window.location.href`), never `fetch` — an OAuth
  redirect cannot be followed by XHR.
- Logout is a POST. A GET logout is exactly the hole `routes.ts` documents.
- `credentials: "include"` is already in `request<T>`; confirm the cookie actually rides along from
  `:5173` to `:3000` rather than assuming it. Differing ports are same-site, so `SameSite=Lax`
  should send it — verify, do not reason about it.

---

## B2 — Repo picker and the sidebar file tree  `[ ]`

**Why.** The canvas needs a `repoId` and a `fileId` to show anything, and there is currently no way
to obtain either. This is also where `GET /api/repos` and `POST /api/repos` stop being curl-only.

**Where.** `apps/web/src/lib/tree.ts`, `apps/web/src/lib/tree.test.ts`,
`apps/web/src/components/Sidebar.tsx`, `apps/web/src/components/RepoPicker.tsx`,
`apps/web/src/components/Skeleton.tsx`, `apps/web/src/store/ui.ts`.

**Do.**

1. `lib/tree.ts` — a pure transform from the flat, path-ordered `FileNode[]` the API returns into a
   nested directory tree. The API returns flat deliberately (`queries.ts` says so); the nesting is
   the client's job, and being pure is what makes it testable without a DOM.
2. `RepoPicker` — lists registered repos with their file and function counts; a URL field registers
   a new one. Registration blocks for as long as the parse takes, so it needs a real pending state
   naming what is happening, not a disabled button.
3. `Sidebar` — collapsible tree, directories first then alphabetical, function count per file,
   lucide icons, skeleton rows while loading. Selecting a file writes `selectedFileId`.
4. Extend `store/ui.ts` with `selectedRepoId`; selecting a repo clears the file and function
   selection, since ids from one repo mean nothing in another.

**Done when.** `lib/tree.test.ts` covers root-level files, nesting, deep chains, directory-before-file
ordering and the empty repo. Registering a real repository through the UI produces a browsable tree.

**Watch for.**

- `PARSE_TIMEOUT_MS` is five minutes and registration is synchronous. Whatever timeout the browser
  or TanStack Query applies must be longer, or the UI reports failure on a parse that is still
  running and will succeed.
- Two files can share a directory prefix without sharing a directory (`src/app.ts` vs
  `src/apple/x.ts`). Split on `/`, never `startsWith`.
- A repo with zero files is a valid answer, not an error — 3a made that distinction deliberately.
- Selecting a repo must clear `selectedFileId`. A stale file id from another repo 404s, and the
  canvas would show the previous repo's card.

---

## B3 — Canvas and the file card  `[ ]`

**Why.** The first surface where React Flow does real work, and the first honest test of a risk
carried since Phase 0: `reactflow@11.11.4` is the retired package name (v12 is `@xyflow/react`) and
declares `react >=17`. It installs and builds under React 19 — neither of which is the same as
rendering under StrictMode. Proving that here, before four chunks are built on top, is the whole
reason this chunk comes before the mind-map.

**Where.** `apps/web/src/components/Canvas.tsx`, `apps/web/src/components/FileCard.tsx`,
`apps/web/src/components/Canvas.test.tsx`, `apps/web/src/store/ui.ts`.

**Do.**

1. Smoke test first: mount a React Flow canvas with two nodes inside `<React.StrictMode>` and assert
   both render. If v11 cannot do that on React 19, stop and raise it before writing anything else.
2. `Canvas` — `ReactFlowProvider`, background, controls, minimap, tokens from `tailwind.config.ts`.
3. `FileCard` — a custom node: file path, language, the file's functions from
   `GET /api/files/:id/functions`. Springs in via Framer Motion. Clicking a function sets
   `selectedFunctionId`.
4. Empty state per UI_GUIDE §3.3 — inviting, not a blank rectangle.

**Done when.** Clicking a file in the sidebar makes a card appear on the canvas listing that file's
functions, and the StrictMode smoke test passes.

**Watch for.**

- React Flow needs an explicitly sized parent. A `height: 100%` chain that breaks anywhere renders a
  zero-height canvas with no error at all.
- `nodeTypes` and `edgeTypes` defined inline re-create the object every render and remount every
  node. Hoist them to module scope.
- The function list is intentionally source-free (`queries.ts` says why). Do not reach for `source`
  here; that is B5's request.

---

## B4 — Mind-map: traversal to nodes and edges, styled by confidence  `[ ]`

**Why.** This is the product. `resolution_confidence` has been carried faithfully through the
parser, the resolver, the schema and the API for two phases specifically so that this chunk can draw
a guess differently from a fact. PRD §8 calls it the reason to trust the tool.

**Where.** `apps/web/src/lib/graph.ts`, `apps/web/src/lib/graph.test.ts`,
`apps/web/src/components/FunctionNode.tsx`, `apps/web/src/components/Canvas.tsx`.

**Do.**

1. `lib/graph.ts` — pure: `{ reachable, edges }` from `GET /api/functions/:id/edges` into React Flow
   nodes and edges. Layered layout, `depth` on one axis and index within depth on the other. No
   layout dependency; a layered tree does not need one.
2. Unresolved edges have `calleeFunctionId: null` and reach no function row, so the traversal cannot
   return them — `directEdges` exists precisely to surface them. Each becomes a distinct *ghost*
   node built from `calleeName`, visibly not-a-function. Dropping them would show a function calling
   nothing, which is the exact dishonesty PRD §8 forbids.
3. Edge style comes from `CONFIDENCE_STYLE` in `packages/shared/src/constants.ts` — solid, dashed,
   dotted. Import it; never re-declare the mapping.
4. A legend on the canvas saying what the three styles mean. An unexplained dotted line is noise.
5. Direction and depth controls, bounded by `TRAVERSAL_MAX_DEPTH`.
6. Node ceiling of 2000: truncate and say so rather than freezing the tab.
7. Focus mode — the selected function's neighbourhood stays lit, the rest dims.
8. `prefers-reduced-motion` disables the edge-draw animation.

**Done when.** `lib/graph.test.ts` proves: each confidence tier maps to its own style; an unresolved
edge yields a ghost node rather than a dangling or dropped edge; depth becomes layers; a cycle
(mutual recursion is normal, and the CTE returns each function once) produces no duplicate node; the
ceiling truncates. On a real repo, all three edge styles are visibly present.

**Watch for.**

- The starting function has `confidence: null` and `viaFunctionId: null`. It is a node with no
  inbound edge, not an unresolved one.
- `reachable` and `edges` overlap: a resolved direct call appears in both. Key nodes by function id
  so it is not added twice.
- Two unresolved calls to the same `calleeName` from different callers are two call sites. Decide
  deliberately whether that is one ghost node or two, and write down which.
- React Flow needs stable, unique node ids. Ghost nodes have no function id — prefix them so they
  can never collide with a real one.

---

## B5 — The code block  `[ ]`

**Why.** The last step of the UI_GUIDE §3.2 chain — file, card, mind-map, code. Without it the
canvas can show that a function exists and what it calls, but never what it does.

**Where.** `apps/web/src/components/CodeBlock.tsx`, `apps/web/src/lib/highlight.ts`,
`apps/web/src/components/CodeBlock.test.tsx`.

**Do.**

1. `lib/highlight.ts` — a lazily created Shiki highlighter, loading only the languages in use and a
   single dark theme, behind a dynamic import so it stays out of the initial bundle.
2. `CodeBlock` — fetches `GET /api/functions/:id/source`, renders it highlighted, with line numbers
   offset to the function's real `startLine` so they match the file on GitHub.
3. `source` is nullable in the schema. Render a plain explanation when the parser stored none, never
   a blank panel.
4. Skeleton while the highlighter loads — it is a genuine async cost, not an artificial one.

**Done when.** Clicking a function on the mind-map shows its highlighted source with correct
absolute line numbers, and the null-source case is covered by a test.

**Watch for.**

- Creating a highlighter per render is a large, slow allocation each time. Create once, reuse.
- Shiki emits HTML. It is highlighting source already stored by our own parser, but note explicitly
  why `dangerouslySetInnerHTML` is acceptable here rather than leaving a reader to wonder.
- Line numbers start at `startLine`, not at 1. A code block numbered from 1 for a function at line
  400 is worse than no numbers.

---

## B6 — Search and the ⌘K palette  `[ ]`

**Why.** The half of the phase's exit test that the canvas does not cover: *find a function by
name*. `GET /api/repos/:id/search` already ranks prefix matches above substring matches; nothing
surfaces it.

**Where.** `apps/web/src/components/CommandPalette.tsx`, `apps/web/src/lib/useDebounced.ts`,
`apps/web/src/lib/useDebounced.test.ts`, `apps/web/src/App.tsx`.

**Do.**

1. `useDebounced` — one small hook, tested with fake timers. Every keystroke hitting Postgres is a
   self-inflicted load test.
2. `CommandPalette` — cmdk, opened by ⌘K and Ctrl+K, closed by Escape. Results show the function
   name, its qualified name and its file path; the API already returns all three.
3. Selecting a result selects the file and the function, so the card, mind-map and code block all
   follow from one keystroke.
4. Distinct empty states: nothing typed, no matches, and no repository selected.

**Done when.** ⌘K opens the palette, typing a function name from a real repo finds it, and Enter
lands on that function with its source shown. The debounce hook has its own test.

**Watch for.**

- cmdk does its own filtering by default. The server already ranked these results; re-filtering
  client-side discards that ranking. Turn it off.
- Search is repo-scoped. With no repo selected the palette must say so, not query `/api/repos/undefined/search`.
- Out-of-order responses: a slow "get" answering after a fast "getUser" shows results for the wrong
  query. TanStack Query keys handle it — confirm the key includes the query text.
- ⌘K must not fire while focus is inside the repo URL field.

---

## B7 — States, docs, and the exit gate  `[ ]`

**Why.** UI_GUIDE §3.3 calls the empty, loading and error states "the cool vs amateur line", and
they are the easiest thing to leave half-done across six chunks. The docs are load-bearing for the
next phase and go stale the moment a phase closes.

**Where.** every component; `CLAUDE.md`, `PLAN.md`, `README.md`, `DEVELOPMENT.md`,
`docs/RISKS.md`, `TASKLIST.md`.

**Do.**

1. Audit every surface for its three states. Skeletons, not spinners, wherever a shape is known.
2. Error states name what failed and what to do — a failed parse says which repository and why.
3. Verify `prefers-reduced-motion` end to end, not per component.
4. Keyboard: the tree, the palette and the canvas are all reachable and escapable.
5. Update the docs: `CLAUDE.md` status and known gaps, `PLAN.md` Phase 3b result, `README.md`,
   `DEVELOPMENT.md` for running the web app, `docs/RISKS.md` for anything new this phase surfaced.
6. Run the exit gate and record what actually happened, including numbers.

**Done when — the phase exit test.** Against a real repository, logged in through the browser:

- sign in, register a repository, watch it parse;
- browse the file tree, open a file, see its card;
- open a function's mind-map and see all three edge styles, with at least one unresolved ghost;
- click a function and read its highlighted source at the correct line numbers;
- ⌘K, type a function name, land on it;
- `pnpm -r build`, `pnpm -r test` and `pnpm -r lint` all clean.

**Watch for.**

- A skeleton that never resolves is worse than a spinner. Every loading state needs its terminal
  state checked.
- Docs claiming the phase did something it did not. The commands in `CLAUDE.md` are the arbiter.
