# UI / UX Guide

The product must feel **premium and "crazy-cool"** — on par with the best modern developer tools,
not a default CRUD UI. This guide is the single source of truth for look-and-feel so the UI is
*decided*, not bolted on. It pairs with the stack in `docs/TECH_STACK.md`.

---

## 1. Design language — certainty as temperature

Two themes, both carrying one idea: **the three confidence tiers run from cool to warm to neutral**,
so a reader learns the scale once and reads it everywhere.

This is not a theme picked for looks. The product's entire claim is that it tells you what it does
not know — `exact` / `name_match` / `unresolved`, drawn solid / dashed / dotted (`PRD.md` §8). The
palette has to make that scale legible before the legend is ever read, and it has to keep the least
certain tier *quiet without being invisible* — an unresolved call is an admission, not an alarm.

The earlier survey-chart direction (marine ink, warm bone, verdigris) was replaced after review. It
is recorded in §7 as a direction that was tried, not as a mistake to avoid.

### 1.1 Tokens

Every value lives in `apps/web/src/lib/tokens.ts`, once per theme. Nothing is hardcoded in a
component — `grep -rE '#[0-9a-fA-F]{6}' apps/web/src --include=*.tsx` returns nothing, and that grep
is the check.

**Dark — "Ember."** A warm graphite ground against a cool accent, which is the pairing the
alternatives did not make.

| Role | Token | Value | Why |
|---|---|---|---|
| Ground | `surface` | `#141210` | Warm near-black with a coffee undertone, not a neutral grey. |
| Raised | `surface.raised` | `#1d1a17` | Panels, cards, the sidebar. |
| Rule | `surface.border` | `#2f2a25` | Hairlines and graticule. |
| Ink | `ink` | `#f3ede5` | Warm off-white, matched to the ground's temperature. |
| Ink, quiet | `ink.muted` | `#9d9388` | Secondary labels, counts. |
| `exact` | `confidence.exact` | `#4cc9f0` | Cool cyan against a warm ground — the strongest separation available. |
| `name_match` | `confidence.name` | `#f2a154` | Apricot. Reported, not verified. |
| `unresolved` | `confidence.unresolved` | `#8a7f73` | Warm slate at ~9% saturation. Shares the ground's hue family, so it recedes into the map. |

**Light — "Vellum."** A drawing on cool paper. Deliberately not cream: cream with a serif display is
the single most common generated look there is (§7).

| Role | Token | Value | Why |
|---|---|---|---|
| Ground | `surface` | `#f2f5f7` | Cool paper. |
| Raised | `surface.raised` | `#ffffff` | Panels, cards, the sidebar. |
| Rule | `surface.border` | `#d9e1e8` | Hairlines and graticule. |
| Ink | `ink` | `#0f1a24` | Near-black with a blue cast, matched to the paper. |
| Ink, quiet | `ink.muted` | `#566573` | Secondary labels, counts. |
| `exact` | `confidence.exact` | `#0d7c6b` | Deep teal — the cool end of the same scale. |
| `name_match` | `confidence.name` | `#b26a00` | Burnt amber. |
| `unresolved` | `confidence.unresolved` | `#75838f` | Cool slate, dark enough to hold as a hairline on paper. |

Two rules bind both palettes, and `confidence.test.ts` enforces them:

1. **`unresolved` is never a chromatic red.** Colouring an honest admission as a failure tells the
   reader the opposite of what PRD §8 promises. Checked as saturation *and* hue, because a warm
   neutral legitimately has red as its largest channel while being visibly grey.
2. **Every tier clears 3:1 against its own ground.** A dotted line nobody can see fails PRD §8 as
   surely as not drawing it at all.

Focus, links and active state use `confidence.exact`. One accent, doing double duty, because it
already means "known" everywhere else on the canvas.

**How the two themes reach a component.** `tailwind.config.ts` exposes both palettes under a
non-colour `palette` key, and `index.css` reads them back with `theme()` into one CSS variable per
role. Semantic utilities (`bg-surface`, `text-ink`, `text-confidence-exact`) point at those
variables, so they follow the active theme without a `dark:` prefix anywhere. The palettes are *not*
under `colors`: that would also generate `bg-palette-dark-surface`, and any component reaching for
one would be pinned to a single theme.

The canvas is the exception. React Flow styles edges with real SVG attributes, which take neither a
class name nor an inherited variable, so it calls `confidenceColor(tier, mode)` for a raw value.
That function reads the same `tokens.ts` entry the variable does.

### 1.2 Type

Three roles. Self-hosted via `@fontsource`, never from a CDN at runtime.

- **Display** — *Bricolage Grotesque*. Variable width and optical size, with letterforms odd enough
  not to read as the default UI sans. Used with restraint: the wordmark and headings.
- **UI / body** — *Geist*. Quiet and tight, drawn for dense product surfaces. Nothing about it
  competes with the canvas.
- **Data / labels** — *JetBrains Mono*. File paths, qualified names, line numbers, counts. Taller
  x-height than the alternatives at the 11–13px the canvas actually uses, which is the only size
  that matters here.

Monospace covers **code and code identifiers**, widened from "code only": a path and a
`qualified_name` *are* identifiers, and on a map the labels are the point. Setting them apart from
prose is what makes the tree scannable.

### 1.3 Restraint

Boldness is spent in exactly one place — the signature in §3.2. Everything around it stays quiet:
no gradient meshes, no glows, no glass. If a decoration does not encode something true about the
graph, cut it.

## 2. Libraries (locked)

| Concern | Choice |
|---|---|
| Styling | Tailwind CSS + `cn()` (`clsx` + `tailwind-merge`) |
| Animation | Framer Motion |
| Canvas | React Flow |
| Code highlight | Shiki |
| Command palette | shadcn `command` (cmdk underneath) |
| Icons | lucide-react, `strokeWidth={1.5}` |
| Components | shadcn/ui on Base UI, `base-nova` style |
| State | Zustand (UI) + TanStack Query (server) |

**On shadcn/ui — install it, do not reimplement it.**

The rule is: **`npx shadcn@latest add <name>` first, hand-written only when the registry has
nothing.** A component that already exists is less code to review, less to maintain, and better on
accessibility than the version we would write this afternoon. Check before concluding it is not
there — `curl -s -o /dev/null -w "%{http_code}" https://ui.shadcn.com/r/styles/base-nova/<name>.json`
answers in a second.

*This reverses the earlier position*, which was "behaviour from Radix, styling from §1.1, nothing
generated" — the CLI was to be avoided because its theme layer would duplicate the token table. That
concern turned out to be solvable rather than fundamental: §1.1's variables are wired to shadcn's
own variable names, so a generated component lands on this palette without being restyled at all.
The theme layer is not a competing system; it is the delivery mechanism.

In the tree today: `button`, `card`, `input`, `badge`, `separator`, `skeleton`, `scroll-area`,
`tooltip`, `collapsible`, `sidebar`, `sheet`, `item`, `field`, `label`, `empty`, `spinner`,
`command`, `dialog`, `dropdown-menu`, `select`, `textarea`, `input-group`, `sonner`.

Two things to know about generated files:

- **They are ours once generated.** Editing them is normal and expected; that is the model. Where an
  edit matters — `skeleton.tsx` carries `motion-safe:` so its shimmer honours reduced motion — the
  file says so in a comment, because `add --overwrite` silently reverts it.
- **`add` collides on case.** The CLI writes `skeleton.tsx` next to a hand-written `Skeleton.tsx`,
  and TypeScript refuses two paths differing only in case (TS1261). Delete the hand-written one.

## 3. Surfaces

### 3.1 Sign-in (logged out) · Phase 3b

A single centred card: wordmark, one line saying what the tool does, one **Sign in with GitHub**
button. Nothing else. No hero, no feature grid, no footer.

**The marketing landing page gets its own PR, opened after the Phase 3b gate.** It is a second full
surface and the 3b exit test does not touch any of it, so it does not belong in the same review. It
was requested during 3b and is no longer "someday" — it is the next branch after the gate, and it
follows §1 like everything else.

The landing page is the one surface that takes the maximal spatial treatment: section padding at
`py-24` and above, nested double-bezel cards, and a hero that is a live drawing graph rather than a
screenshot. The canvas is dense by nature and does not; matching complexity to the surface is the
point, and applying marketing whitespace to a file tree is how a tool starts feeling like a
brochure.

### 3.2 Canvas explorer (authenticated)
- **Sidebar — the index.** An atlas has an index, and the file tree is it. Collapsible, directories
  before files, function count per file, paths in mono. ⌘K jumps to any function by name.
- **Card → mind-map → code:** click file → card springs in → click card → function mind-map
  branches out (edge-draw animation) → click function → Shiki-highlighted code block.
- **Edges by confidence:** solid (`exact`) / dashed (`name_match`) / dotted (`unresolved`), coloured
  per §1.1. This is the product; see `PRD.md` §8.
- **Minimap + focus mode:** overview always available; selecting a function dims the rest.
- **Multi-open** is deferred past 3b — one file card and one mind-map at a time. Namespaced node
  ids and focus scoped across cards are additive later, not a rewrite.

**The signature.** Three things, and nothing else in the UI competes with them:

1. **The canvas is a ruled surface, not a dot grid.** A fine graticule at two scales, with depth
   layers as faint ruled bands. The background says "measured", so nothing else has to.
2. **A real chart legend**, bottom-left where a chart carries it, drawing the three line styles with
   their names. An unexplained dotted line is noise; an explained one is the whole point.
3. **Unresolved calls are drawn as uncharted territory** — ghost nodes at the map's edge, labelled
   with the callee name the parser saw, dotted and faded. Not hidden, not errors. The map shows its
   own boundary.

### 3.3 States (the "cool vs amateur" line)
- **Empty:** an invitation to act, in the interface's voice — "Chart a repository", not "No data".
- **Loading:** skeletons matching the shape that is coming, not spinners.
- **Error:** what failed and what to do about it. Name the repository, name the reason. Errors do
  not apologise and are never vague.

### 3.4 Words

Copy is design material, not decoration, and it is where a good-looking UI most often gives itself
away.

- Name things as the user recognises them: a **repository**, a **file**, a **function**. Never a
  "node", a "record" or an "entity".
- Active voice, and a control says what it does: **Chart repository**, not *Submit*.
- An action keeps its name through the whole flow — the button that says **Sign out** produces a
  screen that says signed out.
- Sentence case. Plain verbs. No filler, no exclamation marks, no cleverness where specificity
  works better.

## 4. Motion principles

- Purposeful, not decorative: motion explains *where* you are (route transitions, expand/collapse).
- Durations: 150–300ms for micro-interactions, 400–600ms for page/hero.
- Respect `prefers-reduced-motion` — disable non-essential animation.
- Spring physics for cards/edges; easing curves for routes.
- **One orchestrated moment, not scattered effects.** The mind-map's edges draw in staggered by
  depth, like a route being plotted. Everything else is quiet. Scattered animation is the most
  reliable tell of a generated design.

## 5. Responsiveness

- Desktop-first (it's a power-user tool). The canvas is not a phone surface.
- Canvas toolbars collapse to icon-only on narrow widths.
- The sign-in card and, when it exists, the landing page must work on mobile.

## 5.1 Quality floor

Met without announcing it, on every surface: visible keyboard focus, escapable overlays, a
reachable tab order through tree, palette and canvas, and `prefers-reduced-motion` honoured.

## 6. Deferred (post-MVP)

- Multi-open canvas — several file cards and mind-maps at once (§3.2).
- Freehand annotation layer (see `../PLAN.md`).
- Custom theming UI, saved layouts/perspectives.

**No longer deferred.** The light theme shipped in Phase 3b alongside the dark one — both palettes
are in §1.1 and both are enforced by `confidence.test.ts`. The marketing landing page moved from
"post-MVP" to "the branch after the 3b gate" (§3.1).

## 7. What this must not look like

Kept explicit, because the failure mode here is converging on a look that reads as generated
regardless of subject. Three clusters to stay out of:

1. Warm cream ground (near `#F4F1EA`), high-contrast serif display, terracotta accent. **This is why
   the light theme is cool paper `#f2f5f7` and not cream.**
2. Near-black ground with one bright acid-green or violet accent. **The tokens this project shipped
   with — `#0b0d12` plus `#7c5cff` — were exactly this.**
3. Broadsheet layout: hairline rules, zero border-radius, dense newspaper columns.

Each is legitimate for some brief. None was chosen for *this* one. Before adding any visual
element, ask whether it encodes something true about a call graph, or whether it is simply what a
dark developer tool tends to look like.

### 7.1 Directions that were tried

Recorded so they are not re-proposed as if new, and not treated as mistakes.

- **The survey chart** (marine ink `#081014`, warm bone `#e8dcc8`, verdigris / brass / slate). The
  reasoning was sound — chart-makers built a formal notation for surveyed, reported and doubtful
  soundings, and our three tiers are the same three tiers. It was replaced on review: the palette
  read as muddy in practice, and the low-chroma bone-on-navy pairing did not carry the tier scale as
  clearly as temperature does. The *idea* survives in the graticule and the legend (§3.2).
- **Space Grotesk** as the display face. Dropped because it appears on every "reads as
  AI-generated" list, this document's §7 included.
