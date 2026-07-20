# UI / UX Guide

The product must feel **premium and "crazy-cool"** — on par with the best modern developer tools,
not a default CRUD UI. This guide is the single source of truth for look-and-feel so the UI is
*decided*, not bolted on. It pairs with the stack in `docs/TECH_STACK.md`.

---

## 1. Design language

- **Mode:** dark-mode-first, with a light theme as a stretch goal.
- **Accent:** one signature accent color (e.g. electric violet / cyan) used sparingly for focus,
  links, and active edges. Define as a Tailwind token, not hardcoded.
- **Tokens:** color, spacing, radius, shadow, and motion durations live in the Tailwind config /
  a `tokens.ts` file — one place, consumed everywhere.
- **Type:** a clean geometric sans for UI; monospace (via Shiki) only for code.
- **Vibe:** "technical but alive" — subtle gradients/glow on key surfaces, restrained, not noisy.

## 2. Libraries (locked)

| Concern | Choice |
|---|---|
| Styling | Tailwind CSS + shadcn/ui |
| Animation | Framer Motion |
| Canvas | React Flow |
| Code highlight | Shiki |
| Command palette | cmdk (⌘K) |
| Icons | lucide-react |
| State | Zustand (UI) + TanStack Query (server) |

## 3. Surfaces

### 3.1 Landing page (`/` route, same app)
- Animated hero: a live, slowly-drifting React Flow graph as the backdrop (real parsed data if
  available, else a stylized demo graph).
- Headline + subhead stating the core value ("see the shape of any codebase").
- Feature cards with scroll-in animations (Framer Motion `whileInView`).
- "Try a repo" CTA → OAuth login → canvas.
- Footer with links, repo link, tech badges.

### 3.2 Canvas explorer (authenticated)
- **Sidebar:** collapsible IDE-like file tree; ⌘K palette jumps to any function by name.
- **Card → mind-map → code:** click file → card springs in → click card → function mind-map
  branches out (edge-draw animation) → click function → Shiki-highlighted code block.
- **Edges by confidence:** solid (`exact`) / dashed (`name_match`) / dotted (`unresolved`).
- **Minimap + focus mode:** overview always available; selecting a function dims the rest.
- **Multi-open:** several files/mind-maps can coexist on one canvas.

### 3.3 States (the "cool vs amateur" line)
- **Empty:** inviting illustration + "paste a repo URL" prompt.
- **Loading:** skeleton cards / shimmer, not spinners where avoidable.
- **Error:** friendly, actionable messages (e.g. parse failed → show which file).

## 4. Motion principles

- Purposeful, not decorative: motion explains *where* you are (route transitions, expand/collapse).
- Durations: 150–300ms for micro-interactions, 400–600ms for page/hero.
- Respect `prefers-reduced-motion` — disable non-essential animation.
- Spring physics for cards/edges; easing curves for routes.

## 5. Responsiveness

- Desktop-first (it's a power-user tool), but the landing page must be mobile-friendly.
- Canvas toolbars collapse to icon-only on narrow widths.

## 6. Deferred (post-MVP)

- Excalidraw freehand annotation layer (see `ROADMAP.md`).
- Light theme, custom theming UI, saved layouts/perspectives.
