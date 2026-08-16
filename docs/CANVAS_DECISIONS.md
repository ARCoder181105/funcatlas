# Canvas decisions

Decisions taken **during** Phase 3b, after the plan in `TASKLIST.md` was written. They are here
because they changed the shape of the canvas rather than the look of it, and a commit message is a
bad place to look them up six weeks later.

`docs/UI_GUIDE.md` stays the source of truth for look-and-feel. This file records *why the canvas
behaves the way it does*.

---

## 1. The map grows by clicking, and nothing is removed

**Decided:** during B5, replacing the original design.
**Status:** built.

The first version asked for a depth up front (a `1..10` select), fetched one traversal from the
selected function, and drew the whole thing. Clicking a node in that graph threw it away and drew a
new one centred on whatever was clicked.

It now works the other way round:

- Clicking a function in a file card starts a map with that function and its direct calls.
- Clicking any function already on the map opens *its* direct calls beside it.
- **Every ancestor stays.** The map is the path the reader took through the graph, and losing the
  ancestors loses the path.

**Why.** Depth-up-front asks a question the reader cannot answer yet — they have to guess a number
before seeing anything, and the answer is usually "too many nodes" or "not far enough". Expanding
one step at a time makes depth a consequence of exploring rather than a parameter, and it removes a
control from a canvas that had too many.

**What it cost.** `buildGraph` takes a *list* of traversal responses instead of one, and depth is no
longer read off the response. Each response reports depth relative to whatever *it* expanded, so
distance from the root is computed breadth-first along the merged edges. Breadth-first specifically:
a function reached by two paths lands in the shallower column, otherwise the layout jumps every time
a longer route to an existing node is opened.

**What it bought, unexpectedly.** Ghost nodes used to be possible only at depth 1, because
`GET /api/functions/:id/edges` returns direct calls for *one* function and the traversal cannot
return unresolved edges at all. Now that every expansion carries its own `edges`, an unresolved call
is drawn wherever it was actually made. The honesty promise in `PRD.md` §8 got materially better as
a side effect of a UX change.

**Not built:** collapsing a branch. Nothing removes nodes yet. Add it when a map gets big enough to
need pruning — the state is a list of expanded ids, so removing one is a filter.

---

## 2. Depth and direction controls are gone

**Decided:** during B5.
**Status:** built.

Two `Select` controls sat at the top-left of the canvas: **depth** (`1..10`) and **direction**
(*What it calls* / *What calls it*). Both are removed.

- **Depth** is replaced by clicking, per decision 1.
- **Direction** was cut outright. The canvas is outbound only: *what does this call*.

**Why direction went entirely, not just off the canvas.** Leaving the prop while nothing could set
it would have left the whole arrow-reversal path in `buildGraph` unreachable and untestable — dead
flexibility, which is worse than a missing feature because it looks maintained. The API still
supports `direction`, so bringing it back is a prop and a branch rather than a redesign.

The inbound tests were deleted with the code they covered.

---

## 3. The confidence key is a strip, not a panel

**Decided:** during B5.
**Status:** first version built; position and content still open.

The canvas carried the same full legend the sign-in card uses — three tiers, each with a sentence of
explanation, in a bordered panel bottom-left. On a canvas it was far too large and competed with the
graph.

The canvas now uses `ConfidenceKey`: one row, three strokes with one-word labels, in a pill.
Meanings moved into tooltips. The sign-in card keeps the full prose version (`ConfidenceLegend`),
because a reader meeting the idea for the first time needs the sentences.

Both read `lib/confidence.ts`, so the two can never describe the tiers differently.

**Still to settle** — position and exact content. Options on the table:

| Option | Shape | Trade |
|---|---|---|
| **A — bottom-left pill** (built) | One row, 3 strokes + labels, tooltips for meaning | Always visible, ~260×28px. Where a chart puts its legend. |
| **B — bottom-right, above the minimap** | Same strip, other corner | Groups the "chrome" together; leaves bottom-left clear for the graph. |
| **C — collapsed to an icon** | A single `?` button that opens the full legend | Smallest footprint; costs a click to read, and an unexplained dotted line is the thing the product must not have. |
| **D — in the header, not the canvas** | Strip moves out of the graph entirely | Canvas is pure graph. Legend is further from what it explains. |

Recommendation: **A**, moving to **B** if the bottom-left corner turns out to be where nodes tend to
land. **C** is the one to avoid — PRD §8 turns on the reader understanding a dotted line, and hiding
the key behind a click works against that.

---

## 4. Node dimensions are declared, not measured

**Decided:** during B5, after edges silently failed to render.
**Status:** built.

React Flow will not draw an edge until both of its nodes have dimensions in its store, and it fills
those in from a `ResizeObserver` after layout. Where that measurement never arrives the nodes still
render and the edges silently do not — a graph that looks like a set of functions calling nothing,
which is the one thing this canvas must never show.

`lib/graph.ts` therefore states `NODE_WIDTH` and `NODE_HEIGHT` up front, and the node components are
pinned to the same numbers (`h-11 w-52`). Changing one without the other misaligns every edge
endpoint.

This is also why edge rendering has no automated test: jsdom has no layout engine, and a
`ResizeObserver` stub that reports a size drives `react-resizable-panels` into a re-layout loop that
fails most of the suite. What decides *what* the edges are is covered exhaustively in
`lib/graph.test.ts`; whether they paint is checked in a browser.

---

## 5. A provider per surface

**Decided:** during B5.
**Status:** built.

The file card and the mind-map are two different `<ReactFlow>` instances. Mounting the second into a
`<ReactFlowProvider>` the first had already populated left it with stale internals and its edges
never rendered. `Canvas` now branches *above* the provider so each surface gets its own.

---

## 6. Still on the list

Raised but not yet specified. Recorded so they are not lost.

- Other canvas utilities the reader mentioned wanting, to be defined.
- Collapsing an expanded branch (see decision 1).
- `reactflow@11` → `@xyflow/react@12`. v11 is the retired package name and works; the migration is
  worth doing when there is a reason beyond tidiness, not mid-phase.
