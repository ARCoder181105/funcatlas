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

**The scale is a two-colour press.** Two spot inks and a neutral: a printer with two plates and
paper has exactly three things to say, which is exactly how many answers resolution has. Ultramarine
is the fact, fired clay is the report, and the ash is what neither plate covered. Read as ink weight
rather than as temperature, so it survives being drawn as a hairline on a canvas the reader is
zoomed out of.

**Revised after the landing-page branch.** This replaced Ember/Vellum, which ran cyan through
apricot to a warm slate. The reasoning there was sound and the execution was fine; it was changed
because cyan-on-near-black is the single most common developer-tool accent there is, and §7 is about
not landing on the look every tool in this category already has.

**Dark — "Ultramarine."** Near-black with a blue cast, so both inks sit on a ground that belongs to
the same press run.

| Role | Token | Value | Why |
|---|---|---|---|
| Ground | `surface` | `#0a0b10` | Near-black, a trace of blue, no saturation to speak of. |
| Raised | `surface.raised` | `#12141c` | Panels, cards, the sidebar. |
| Rule | `surface.border` | `#242839` | Hairlines and card edges. |
| Ink | `ink` | `#eceefa` | Off-white, matched to the ground's cast. |
| Ink, quiet | `ink.muted` | `#8b90a8` | Secondary labels, counts. |
| `exact` | `confidence.exact` | `#6b8cff` | Ultramarine. The first plate: verified. |
| `name_match` | `confidence.name` | `#e0885a` | Fired clay. The second plate: reported, not verified. |
| `unresolved` | `confidence.unresolved` | `#767c92` | Ash at ~11% saturation. Shares the ground's hue family, so it recedes into the map. |

**Light — "Letterpress."** Cool paper, deliberately not cream: cream with a serif display is the
single most common generated look there is (§7). Both inks darken rather than changing hue, which is
what a press would do on white stock.

| Role | Token | Value | Why |
|---|---|---|---|
| Ground | `surface` | `#f1f2f7` | Cool paper. |
| Raised | `surface.raised` | `#ffffff` | Panels, cards, the sidebar. |
| Rule | `surface.border` | `#d8dbe6` | Hairlines and card edges. |
| Ink | `ink` | `#12141f` | Near-black with a blue cast, matched to the paper. |
| Ink, quiet | `ink.muted` | `#5a5f74` | Secondary labels, counts. |
| `exact` | `confidence.exact` | `#2a44c4` | Ultramarine, darkened for white stock. |
| `name_match` | `confidence.name` | `#a55424` | Fired clay, darkened the same way. |
| `unresolved` | `confidence.unresolved` | `#71768a` | Cool ash, dark enough to hold as a hairline on paper. |

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

**A Base UI popup does not unmount itself.** A closing `Dialog` keeps `data-closed`, stays in the
DOM, stays on screen and goes on taking clicks — it is waiting for an exit animation whose
completion it never observes (`getAnimations()` comes back empty while the popup still has
`animation-name: exit`). It cost an afternoon on the ⌘K palette: selecting a result moved the canvas
behind a palette that would not go away, and Escape could not shift it either. Both dialogs now
render their content only while open:

```tsx
{open ? <DialogContent>…</DialogContent> : null}
```

Any new `Dialog`, `Popover` or `Sheet` needs the same. A test that asserts state rather than the DOM
will not catch it — assert the thing is gone from the page.

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

A single centred card: wordmark, one line saying what the tool does, the confidence legend, and one
**Sign in with GitHub** button. Nothing else. No hero, no feature grid, no footer, and no graticule
— which is now true of the canvas too; see the graticule note in §3.2.

The legend earns its place here where a background texture did not: it is the notation the canvas is
about to use, and reading it once beats decoding it later.

**The marketing landing page shipped on the `landing-page` branch.** It is a second full surface
that no phase's exit test touches, so it never belonged in a phase review. Requested during 3b and
named the next branch after that gate; Phases 4 and 5 went first.

It is the one surface that takes the maximal spatial treatment: section padding at `py-24` and
above, nested double-bezel cards, and a hero that is a live drawing graph rather than a screenshot.
The canvas is dense by nature and does not; matching complexity to the surface is the point, and
applying marketing whitespace to a file tree is how a tool starts feeling like a brochure.

### 3.1a Landing page (`/`) · the `landing-page` branch

`apps/web/src/components/landing/`. Title block, hero, tiers, pipeline, index, coverage, closing
call to action, footer.

- **Routing.** `/` is the landing page and `/app` is the canvas; anything else falls to the landing
  page, and there is no 404. `lib/router.tsx` is thirty-odd lines over `pushState` rather than a
  router library: two static routes, no parameters, no loaders. `useSession` lives behind `/app`, so
  **the landing page issues no request to our API and renders with the backend down.**
- **The structural device is the product's notation.** Each section rule is a confidence tier's dash
  pattern, and each section takes the tier that is true of it — solid over resolution and the
  pipeline, dashed over coverage because support past the ECMAScript family genuinely is partial,
  dotted over the limits. `ConfidenceRule` draws it and the legend uses the same component.
- **One colour rule.** No colour appears that does not carry its canvas meaning. The accent is the
  hue that already means "known"; clay appears only on a name match, ash only on unresolved.
- **The hero is plain SVG, not React Flow**, and the draw is a mask sweeping across rather than an
  animated `pathLength` — that writes an inline `stroke-dasharray` and flattens all three tiers into
  one pattern. `HeroGraph.test.tsx` asserts three distinct dash values for exactly that reason.
  The graph carries a ghost node: the signature from §3.2, leading with what the tool cannot do.
- **Smooth scrolling is mounted from `Landing` only** (Lenis). At the app root it would take the
  wheel away from the canvas, where the wheel means zoom.
- **What it deliberately is not:** no sticky bar and no floating glass pill (there is nowhere to
  navigate to), no bento grid, no gradient mesh, no glow, no backdrop blur. §1.3 and §7.

**Installed, not written.** Three animate-ui pieces via the shadcn CLI — `effects/fade` for the
section reveals, `texts/sliding-number` for the star count, `components-base-files` for the index
tree. Every generated file was edited and says so at the top, because `add --overwrite` reverts it
silently: they ship importing `motion/react` and `@base-ui-components/react`, which are second
copies of the `framer-motion` and `@base-ui/react` this project locks, and the files component's
git-status slot carried hardcoded green/amber/red that became a function count instead.

### 3.2 Canvas explorer (authenticated)
- **Sidebar — the index.** An atlas has an index, and the file tree is it. Collapsible, directories
  before files, function count per file, paths in mono. ⌘K jumps to any function by name.
- **Card → mind-map → code:** click file → card springs in → click card → function mind-map
  branches out (edge-draw animation) → click function → Shiki-highlighted code block.
- **Edges by confidence:** solid (`exact`) / dashed (`name_match`) / dotted (`unresolved`), coloured
  per §1.1. This is the product; see `PRD.md` §8.
- ~~**The graticule.**~~ **Cut in B8.** The ruled background was signature 1 — the thing that made the
  surface read as a chart rather than a diagram tool. It was also a field of thin lines behind a
  drawing made of thin lines, and it won: the reader could not tell solid from dotted against it, and
  reported the edges as missing when they were there all along. The ground is plain now. When two
  elements use the same visual language and only one of them carries meaning, the other one goes.
- **Minimap:** overview always available. There is no focus mode — dimming everything outside the
  selection greyed out most of the map the reader had just built, and it fired on every click,
  including opening a card's source. The selected card marks itself with a ring instead
  (`docs/CANVAS_DECISIONS.md` §4f).
- **Several branches at once, and collapsing remembers.** The file card and the graph share one
  canvas; opening a function from the card starts a branch, several can be open, and closing one
  hides its subtree without forgetting it. `docs/CANVAS_DECISIONS.md` §1 and §1b carry the model —
  read those before changing how the canvas grows.

**The signature.** Two things, and nothing else in the UI competes with them:

1. **A real chart legend**, drawn where a chart carries it, showing the three line styles with their
   names. An unexplained dotted line is noise; an explained one is the whole point.
2. **Unresolved calls are drawn as uncharted territory** — ghost nodes at the map's edge, labelled
   with the callee name the parser saw, dotted and faded. Not hidden, not errors. The map shows its
   own boundary.

There were three. **The ruled surface was signature 1 and was cut in B8** — see the graticule note
above. Two signatures that survive contact with the drawing beat three where one of them fights it,
and the count is not the point: nothing has been promoted to fill the gap, because nothing needed to.

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
- The sign-in card and the landing page must work on mobile.

## 5.1 Quality floor

Met without announcing it, on every surface: visible keyboard focus, escapable overlays, a
reachable tab order through tree, palette and canvas, and `prefers-reduced-motion` honoured.

## 6. Deferred (post-MVP)

- Several *file* cards at once. One file card at a time, with as many function branches off it as
  the reader opens (§3.2).
- Freehand annotation layer (see `../PLAN.md`).
- Custom theming UI, saved layouts/perspectives.

**No longer deferred.** The light theme shipped in Phase 3b alongside the dark one — both palettes
are in §1.1 and both are enforced by `confidence.test.ts`. The marketing landing page shipped on the
`landing-page` branch (§3.1a).

## 7. What this must not look like

Kept explicit, because the failure mode here is converging on a look that reads as generated
regardless of subject. Three clusters to stay out of:

1. Warm cream ground (near `#F4F1EA`), high-contrast serif display, terracotta accent. **This is why
   the light theme is cool paper `#f1f2f7` and not cream.**
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
  clearly as temperature does. The *idea* survives in the legend (§3.2) — it outlived the graticule,
  which was cut in B8.
- **Space Grotesk** as the display face. Dropped because it appears on every "reads as
  AI-generated" list, this document's §7 included.
- **Ember / Vellum** (near-black + cyan `#4cc9f0` / apricot / warm slate; cool paper + deep teal).
  Shipped through Phases 3b to 5 and replaced on the landing-page branch. Nothing was wrong with it
  in isolation: it passed both palette rules and read clearly. It went because cyan on near-black is
  the accent every developer tool already uses, which §7 exists to keep us off. The *structure* it
  established survived intact -- three tiers, one accent doing double duty, `unresolved` quiet and
  achromatic -- and Ultramarine/Letterpress only changed the inks.
