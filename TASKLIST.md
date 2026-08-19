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
load-bearing: B0 unblocks every test and every typed call, B1 defines the tokens every component
consumes, B2 has to exist before anything can be seen logged in, B3 produces the ids B4 needs, and
B5's node ids are what B6 and B7 select. Each chunk lists:

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
| B1 | A token system as the single source of visual truth, so a colour is never chosen in a component | Any design system that outlives its first designer |
| B2 | Authentication as *derived state* — the server owns it, the client only asks | Every SPA with a session behind it |
| B3 | Pure transforms extracted out of components, so the hard logic is testable without a DOM | React, Vue, Svelte — the pattern outlives the framework |
| B5 | Rendering uncertainty honestly instead of hiding it | Any tool whose output is inferred rather than known |
| B7 | Debounce, cancellation, and why a search box is harder than it looks | Every type-ahead you will ever build |

B5 is the one worth slowing down for. It is where `resolution_confidence` stops being a database
column and becomes the product's central claim — PRD §8. An unresolved edge points at no function
row, so a naive mapper silently drops it, and the canvas confidently shows a function calling
nothing. That is precisely the failure the whole design exists to prevent.

## Decisions taken before starting

Asked and answered at planning time, so they are not re-litigated mid-phase.

- **The visual direction is certainty-as-temperature, in two themes** — `docs/UI_GUIDE.md` §1. Dark
  is "Ember" (warm graphite ground, cyan / apricot / warm slate); light is "Vellum" (cool paper,
  teal / burnt amber / cool slate). The tokens the project shipped with (`#0b0d12` plus `#7c5cff`)
  were a textbook generated-design default. **Revised mid-phase:** B1 first shipped a survey-chart
  palette, which was replaced after review — see UI_GUIDE §7.1 for what was tried and why it went.
- **Login screen, not a landing page.** UI_GUIDE §3.1's animated marketing hero is its own surface
  and its own PR. Logged out shows a centred sign-in card. Nothing in the 3b exit test touches a
  landing page.
- ~~**One file card and one mind-map at a time.**~~ **Reversed mid-phase.** One file card still, but
  the reader opens as many function branches off it as they like, on the same canvas, and collapsing
  a branch remembers what was under it. See `docs/CANVAS_DECISIONS.md` §1 and §1b — that file is the
  model, not this line.
- **shadcn split in half: behaviour yes, styling no.** Its theme layer would duplicate the token
  table in UI_GUIDE §1.1, so the CLI is not run. But anything whose hard part is accessibility —
  focus trap, escape, `aria`, collision-aware positioning — comes from the Radix primitive
  underneath it, styled with our tokens, using shadcn's own source as the reference. A `div` with
  classes is hand-written; a component with keyboard semantics is not. See UI_GUIDE §2.
- **Tests are logic-first.** Every non-trivial transform is a pure function tested directly, plus a
  render smoke test per surface. The smoke tests exist mainly to catch a component that throws.

## What Phase 3b does not build

Not gaps — deliberate scope. Say so now if you disagree, not at the gate.

- **No landing page, no marketing surface, no router.** One authenticated app at `/`. The landing
  page was requested during this phase and is confirmed as the branch immediately *after* the 3b
  gate — it stays out of this PR so the gate keeps measuring what it was written to measure.
- **No saved layouts.** Positions reset on reload; `PLAN.md` cut this from the MVP explicitly.
- ~~**No light theme.**~~ **Reversed mid-phase.** Both themes ship: dark "Ember" and light "Vellum",
  UI_GUIDE §1.1. The cost was structural rather than cosmetic — a utility can no longer resolve to a
  fixed hex, so semantic colours point at CSS variables and `confidenceColor(tier, mode)` exists for
  the canvas, which styles SVG attributes that take neither a class nor an inherited variable.
- **No queue and no webhooks.** Registering a repo still blocks. The UI shows honest progress
  instead of pretending it is fast. Phase 4 replaces the spawn.
- **No mobile canvas.** Desktop-first, per UI_GUIDE §5. The canvas is a power-user surface.

---

## B0 — Typed client, test infrastructure, `cn()`  `[x]`

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

## B1 — Design system: tokens, type, primitives  `[x]`

**Why.** Every component from B2 onward reaches for a colour, a font and a radius. If those are not
defined first they get invented inline, six times, slightly differently — and the fix is then a
sweep through every file instead of one config.

There is a second reason, and it is the sharper one. The tokens this project shipped with are
`#0b0d12` with a `#7c5cff` accent: a near-black ground with one bright violet accent. That is a
textbook default — the look a generated design converges on regardless of subject. It says nothing
about call graphs. `docs/UI_GUIDE.md` §1 specifies a deliberate direction instead, derived from the
one thing this product actually claims: that it marks what it does not know.

**Revised after the first pass.** B1 originally shipped a single dark survey-chart palette. On
review it was replaced with a light/dark pair — "Ember" and "Vellum" — and three new typefaces. The
survey-chart attempt is recorded in UI_GUIDE §7.1. The steps below describe what is now in the tree.

**Where.** `apps/web/tailwind.config.ts`, `apps/web/src/index.css`,
`apps/web/src/components/ui/` (`Button.tsx`, `Panel.tsx`, `Skeleton.tsx`),
`apps/web/src/lib/motion.ts`, `apps/web/src/lib/confidence.ts`,
`apps/web/src/lib/confidence.test.ts`, `apps/web/public/fonts/`.

**Do.**

1. Both palettes in `src/lib/tokens.ts` — `surface` / `surface.raised` / `surface.border`, `ink` /
   `ink.muted`, and `confidence.exact` / `confidence.name` / `confidence.unresolved`, once per
   theme. Names carry meaning; no `gray-700`. `tailwind.config.ts` exposes them under a non-colour
   `palette` key and maps the semantic utilities to CSS variables, which `index.css` fills per
   theme; the theme itself is resolved by an inline script in `index.html` before React boots.
2. Self-host the three faces — Bricolage Grotesque (display), Geist (UI), JetBrains Mono (data) —
   and map them to `fontFamily.display` / `.sans` / `.mono`. Self-hosted, not a CDN link: a
   third-party font request on every page load is a dependency and a privacy leak, and it is the
   reason a slow network shows an unstyled page. Via `@fontsource` packages rather than woff2 files
   committed under `public/fonts/` — Vite bundles the same woff2 out of `node_modules` and serves it
   from our origin, which is what "self-hosted" actually required, while keeping the fonts versioned
   and out of git.
3. `lib/confidence.ts` — the single place mapping a `ResolutionConfidence` to its stroke style,
   colour and human label. It reads `CONFIDENCE_STYLE` from `packages/shared` for the style and adds
   only presentation. B5's edges, the legend and the code block all consume this one map. Colour is
   `confidenceColor(tier, mode)` rather than a field, because the canvas needs a raw value and the
   DOM does not.
4. `lib/motion.ts` — the duration and spring constants from UI_GUIDE §4, plus a
   `useReducedMotion()`-backed helper, so honouring the preference is the default path rather than
   something each component remembers.
5. Primitives in `components/ui/`. **Revised:** the original plan hand-wrote `Button`, `Panel` and
   `Skeleton` against the tokens. `Button` now comes from the shadcn CLI on Base UI and is styled by
   the shared variables rather than restyled — the request was to assemble from real component
   libraries rather than hand-roll. `Panel` and `Skeleton` stay hand-written; they are a `div` with
   classes and there is nothing to import.
6. Set the page background and base type in `index.css` from the tokens.
7. `lib/theme.ts` and `ThemeToggle` — the active mode, persisted, with the class applied before the
   first paint.

**Done when.** `confidence.test.ts` proves all three tiers map to distinct styles, colours and
labels *in both themes*, that the styles agree with `CONFIDENCE_STYLE` in `packages/shared` — so the
canvas and the schema can never disagree — that `unresolved` is not a chromatic red, and that every
tier clears 3:1 against its own ground. `theme.test.ts` proves the toggle and the pre-paint script
agree on the storage key. `grep -rE '#[0-9a-fA-F]{6}' apps/web/src --include=*.tsx` returns nothing.
The fonts render offline with the network throttled.

**Watch for.**

- A hex value in a component is the failure this chunk exists to prevent. The grep above is the
  check, and it belongs in the commit, not in someone's memory.
- `confidence.unresolved` must not be red. Unresolved is an honest admission, not an error, and
  colouring it as a failure tells the user the opposite of what PRD §8 promises.
- Do not re-declare the style mapping. `CONFIDENCE_STYLE` already exists in
  `packages/shared/src/constants.ts`; a second copy in the web app is exactly the duplication the
  shared package is for.
- `font-display: swap` without a sized fallback shifts the layout when the real face lands. Match
  the fallback metrics or accept the shift deliberately.
- Tailwind cannot see a class name built by string concatenation. Confidence colours reaching the
  canvas as `text-confidence-${tier}` will be purged from the production CSS and work only in dev.
  Map to complete class strings.
- React Flow styles edges as SVG, which takes no class name, so the confidence colours are needed as
  raw values *and* as classes. Defining them twice is how they drift — `tailwind.config.ts` imports
  `src/lib/tokens.ts` so there is one hex per colour per theme, and the CSS variables in
  `index.css` are read back out of the same config with `theme()`.
- Two themes make "the accent" a function of the active mode. Anything that captures a colour once
  and holds it — a memo, a module-level constant, a React Flow `edgeTypes` object — is a component
  that silently keeps the old palette after a toggle.

---

## B2 — Auth shell: login screen, session state, logout  `[x]`

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

## B3 — Repo picker and the sidebar file tree  `[x]`

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

**What it actually took.** Verified against `sindresorhus/ky` — 53 files, 336 functions, counts
rolling up correctly (`source` 63 + `test` 273 = 336). Four things the plan did not anticipate:

- **The sidebar is resizable and collapsible**, which was asked for mid-phase. Both panels have to
  declare a size; given only one, `react-resizable-panels` ignores it and splits evenly. Its
  `onResize` never fires — collapsed state is read back from the panel handle on every layout
  change, so a drag past the minimum and the header button cannot disagree.
- **`SidebarProvider` ships `min-h-svh`**, which grows past the viewport rather than clipping. The
  document scrolled, so the tree and the canvas moved together as one page.
- **`DropdownMenuLabel` must sit inside a `DropdownMenuGroup`.** Base UI's `GroupLabel` reads the
  group context and throws without one, taking the whole app down rather than just the menu.
- **jsdom has neither `matchMedia` nor `ResizeObserver`**, and `use-mobile` and
  `react-resizable-panels` construct both on mount. Stubbed in `test-setup.ts`.

---

## B4 — Canvas and the file card  `[x]`

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
2. `Canvas` — `ReactFlowProvider`, controls, minimap, all colour from the B1 tokens.
3. **The graticule** — UI_GUIDE §3.2 signature 1. React Flow's `Background` in `lines` variant at
   two scales, hairline in `surface.border`, so the surface reads as a chart rather than the
   default dot grid. It is the cheapest of the three signatures and does the most work: it sets the
   whole direction before a single node is drawn.
4. `FileCard` — a custom node: file path in mono, language, the file's functions from
   `GET /api/files/:id/functions`. Springs in via Framer Motion. Clicking a function sets
   `selectedFunctionId`.
5. Empty state per UI_GUIDE §3.3 — an invitation to act in the interface's voice ("Chart a
   repository"), not a blank rectangle and not "No data".

**Done when.** Clicking a file in the sidebar makes a card appear on the canvas listing that file's
functions, and the StrictMode smoke test passes.

**Watch for.**

- React Flow needs an explicitly sized parent. A `height: 100%` chain that breaks anywhere renders a
  zero-height canvas with no error at all.
- `nodeTypes` and `edgeTypes` defined inline re-create the object every render and remount every
  node. Hoist them to module scope.
- The function list is intentionally source-free (`queries.ts` says why). Do not reach for `source`
  here; that is B6's request.

**What it actually took.** The Phase 0 risk is closed: **`reactflow@11.11.4` renders under
StrictMode on React 19** — both nodes, no duplication on the second mount. `Canvas.test.tsx` pins it
as a library test rather than a component test, so it keeps answering that question after the canvas
around it changes. Verified against `sindresorhus/ky`: clicking `test/main.ts` draws a card with 31
functions at their real start lines, both graticule scales, minimap and controls.

- **jsdom lacks a third DOM API.** Base UI's `ScrollArea` calls `Element.getAnimations` on a timer,
  where no test can catch the throw — it surfaces as an unhandled error blamed on whichever test was
  running. Stubbed in `test-setup.ts` alongside `matchMedia` and `ResizeObserver`.
- **`Item` takes Base UI's `render` prop, not `asChild`.** Worth knowing before reaching for the
  shadcn pattern from the Radix-based docs.
- **The card is `Card` + `Item` + `Badge` + `ScrollArea`**, not hand-written markup, per the standing
  rule in `CLAUDE.md`. The function list plots itself in row by row on a container-driven stagger, so
  the rows cannot drift out of step; `useMotionEnabled` skips it under reduced motion.

---

## B5 — Mind-map: traversal to nodes and edges, styled by confidence  `[x]`

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
3. Edge style and colour come from `lib/confidence.ts` (B1), which reads `CONFIDENCE_STYLE` from
   `packages/shared`. Never re-declare the mapping in a component.
4. **The chart legend** — UI_GUIDE §3.2 signature 2. Bottom-left, where a chart carries it, drawing
   the three line styles with their names. An unexplained dotted line is noise; an explained one is
   the entire point of the product.
5. **Ghost nodes as uncharted territory** — signature 3. Placed past the last resolved layer,
   dotted, faded, labelled with the `calleeName` the parser saw. They are the map showing its own
   boundary, so they must read as deliberate, not as broken nodes.
6. ~~Direction and depth controls.~~ **Cut.** Depth is how many times the reader clicked; direction
   was removed from the canvas entirely rather than left as an unreachable prop. CANVAS_DECISIONS §2.
7. Node ceiling of 2000: truncate and say so rather than freezing the tab.
8. ~~Focus mode — the selected function's neighbourhood stays lit, the rest dims.~~ Built, then
   removed: see `docs/CANVAS_DECISIONS.md` §4f. The selected card carries a ring.
9. The edge-draw animation is this phase's one orchestrated moment (UI_GUIDE §4): edges draw in
   staggered by depth, like a route being plotted. `prefers-reduced-motion` disables it, via the
   B1 helper rather than a local check.

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

## B6 — The code block  `[x]`

**Why.** The last step of the UI_GUIDE §3.2 chain — file, card, mind-map, code. Without it the
canvas can show that a function exists and what it calls, but never what it does.

**Where.** `apps/web/src/components/CodeBlock.tsx`, `apps/web/src/lib/highlight.ts`,
`apps/web/src/components/CodeBlock.test.tsx`.

**Do.**

1. `lib/highlight.ts` — a lazily created Shiki highlighter, loading only the languages in use,
   behind a dynamic import so it stays out of the initial bundle. An off-the-shelf theme
   (`github-dark`, `nord`) is cool-grey on near-black and will sit on the warm Ember ground looking
   pasted in. Pass Shiki two themes derived from the §1.1 tokens instead — it accepts plain theme
   objects and emits both as CSS variables via its `themes` option, so the code block follows the
   toggle without re-highlighting. This is data, not a fork.
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

## B7 — Search and the ⌘K palette  `[x]`

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

## B8 — States, docs, and the exit gate  `[ ]`

**Why.** UI_GUIDE §3.3 calls the empty, loading and error states "the cool vs amateur line", and
they are the easiest thing to leave half-done across six chunks. The docs are load-bearing for the
next phase and go stale the moment a phase closes.

**Where.** every component; `CLAUDE.md`, `PLAN.md`, `README.md`, `DEVELOPMENT.md`,
`docs/RISKS.md`, `TASKLIST.md`.

**Do.**

1. Audit every surface for its three states. Skeletons, not spinners, wherever a shape is known.
2. Error and empty copy against UI_GUIDE §3.4: user-facing nouns, active voice, an action that keeps
   its name through the flow. A failed parse names the repository and the reason.
3. Verify `prefers-reduced-motion` end to end, not per component.
4. Keyboard: the tree, the palette and the canvas are all reachable and escapable, with visible
   focus.
5. **Design critique with screenshots, then one round of fixes.** Screenshot each surface and judge
   it against UI_GUIDE §7 — is anything here a generated-design default rather than a choice made
   for a call graph? Then Chanel's rule: find the one element carrying the least meaning and remove
   it. Record what was cut.
6. Update the docs: `CLAUDE.md` status and known gaps, `PLAN.md` Phase 3b result, `README.md`,
   `DEVELOPMENT.md` for running the web app, `docs/RISKS.md` for anything new this phase surfaced.
7. Run the exit gate and record what actually happened, including numbers.

**Done when — the phase exit test.** Against a real repository, logged in through the browser:

- sign in, register a repository, watch it parse;
- browse the file tree, open a file, see its card;
- open a function's mind-map and see all three edge styles, with at least one unresolved ghost;
- click a function and read its highlighted source at the correct line numbers;
- ⌘K, type a function name, land on it;
- the three signatures from UI_GUIDE §3.2 are all present and legible — graticule, chart legend,
  ghosts at the boundary — and a screenshot of the canvas is worth looking at;
- `pnpm -r build`, `pnpm -r test` and `pnpm -r lint` all clean.

**Watch for.**

- A skeleton that never resolves is worse than a spinner. Every loading state needs its terminal
  state checked.
- Docs claiming the phase did something it did not. The commands in `CLAUDE.md` are the arbiter.
- Design drift across eight chunks. Colour invented in chunk seven does not match colour chosen in
  chunk one; the B1 hex grep is the check, and it runs again here.
