# UI / UX Guide

The product must feel **premium and "crazy-cool"** — on par with the best modern developer tools,
not a default CRUD UI. This guide is the single source of truth for look-and-feel so the UI is
*decided*, not bolted on. It pairs with the stack in `docs/TECH_STACK.md`.

---

## 1. Design language — the survey chart

The direction is **a nautical survey chart, inverted for a screen**.

This is not a theme picked for looks. The product's entire claim is that it tells you what it does
not know — `exact` / `name_match` / `unresolved`, drawn solid / dashed / dotted (`PRD.md` §8).
Chart-makers solved that problem centuries ago and built a formal notation for it: a sounding is
surveyed, reported, or doubtful, and the chart says which. Our three tiers are the same three
tiers. Borrowing the notation makes the edge styles *legible* — a legend the user reads once — where
an arbitrary palette would leave them decorative.

The name was already `atlas`.

### 1.1 Tokens

Every value below lives in `apps/web/tailwind.config.ts`. Nothing is hardcoded in a component.

| Role | Token | Value | Why |
|---|---|---|---|
| Ground | `surface` | `#081014` | Marine ink. A blue-black with real hue, not neutral near-black. |
| Raised | `surface.raised` | `#0f1a20` | Panels, cards, the sidebar. |
| Rule | `surface.border` | `#1c2a33` | Hairlines and graticule. |
| Ink | `ink` | `#e8dcc8` | **Warm bone, not cool grey.** Chart paper inverted — the one deliberate risk. |
| Ink, quiet | `ink.muted` | `#8b9299` | Secondary labels, counts. |
| `exact` | `confidence.exact` | `#5fb3a1` | Verdigris — engraved copper, the colour of a surveyed line. |
| `name_match` | `confidence.name` | `#d9a441` | Brass. Reported, not verified. |
| `unresolved` | `confidence.unresolved` | `#6b7f8c` | Muted slate, deliberately **not** red. Unresolved is an honest admission, not an error, and colouring it as a failure would misstate the product. |

Focus, links and active state use `confidence.exact`. One accent, doing double duty, because it
already means "known" everywhere else on the canvas.

### 1.2 Type

Three roles. Loaded self-hosted, subset, never from a CDN at runtime.

- **Display** — *Space Grotesk*. Geometric per the original brief, but with enough oddity in its
  letterforms to not read as the default UI sans. Used with restraint: headings and the wordmark.
- **UI / body** — *IBM Plex Sans*. Drawn for technical documentation, which is what this is.
- **Data / labels** — *IBM Plex Mono*. File paths, qualified names, line numbers, counts.

Monospace covers **code and code identifiers**, widened from "code only": a path and a
`qualified_name` *are* identifiers, and on a chart the labels are the point. Setting them apart from
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
| Command palette | cmdk (⌘K) |
| Icons | lucide-react |
| State | Zustand (UI) + TanStack Query (server) |

**On shadcn/ui — split the two things it gives you.**

shadcn is a styling layer over Radix primitives. Those halves have very different value here.

*Its styling is not used.* `components.json`, `tailwindcss-animate` and a CSS-variable theme would
duplicate the token table in §1.1, and a component styled for a generic dark theme has to be
restyled against these tokens anyway. Running the CLI buys generated code to maintain.

*Its behaviour is used, taken from Radix directly.* Anything whose hard part is accessibility —
focus trapping, escape handling, `aria` wiring, collision-aware positioning — is not worth
hand-rolling and is easy to get subtly wrong. Depend on the Radix primitive and style it with our
tokens; read shadcn's source as the reference for how, because it is a good reference.

The rule: **behaviour from Radix, styling from §1.1, nothing generated.** A component that is a
`div` with classes — button, panel, skeleton, legend, card — is hand-written; a component with
keyboard and focus semantics is not. cmdk already brings its own dialog, so the palette needs
nothing extra.

## 3. Surfaces

### 3.1 Sign-in (logged out) · Phase 3b

A single centred card: wordmark, one line saying what the tool does, one **Sign in with GitHub**
button. Nothing else. No hero, no feature grid, no footer.

**The marketing landing page is deferred out of Phase 3b** and gets its own PR — an animated
drifting-graph hero, scroll-in feature cards and a footer are a second full surface, and the 3b
exit test does not touch any of it. When it is built, it follows §1 like everything else.

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

1. **The canvas is a chart surface, not a dot grid.** A fine graticule, with depth layers as faint
   ruled bands. The background says "survey", so nothing else has to.
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

- Marketing landing page — its own PR after Phase 3b (§3.1).
- Multi-open canvas — several file cards and mind-maps at once (§3.2).
- Freehand annotation layer (see `../PLAN.md`).
- Light theme, custom theming UI, saved layouts/perspectives.

## 7. What this must not look like

Kept explicit, because the failure mode here is converging on a look that reads as generated
regardless of subject. Three clusters to stay out of:

1. Warm cream ground (near `#F4F1EA`), high-contrast serif display, terracotta accent.
2. Near-black ground with one bright acid-green or violet accent. **The tokens this project shipped
   with — `#0b0d12` plus `#7c5cff` — were exactly this.** §1.1 replaced them.
3. Broadsheet layout: hairline rules, zero border-radius, dense newspaper columns.

Each is legitimate for some brief. None was chosen for *this* one. Before adding any visual
element, ask whether it encodes something true about a call graph, or whether it is simply what a
dark developer tool tends to look like.
