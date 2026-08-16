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

**Collapsing** was added after the fact, and it is a *view* flag rather than a deletion. See 1b.

---

## 1b. Several branches, and collapsing remembers

**Decided:** after the reader described the interaction they wanted.
**Status:** built.

The model, in their words: a file card with three functions, two of them opened; one branch explored
three generations deep and the other two; closing the second branch collapses everything under it;
reopening it brings the whole structure back exactly as it was.

That needs three things the first version did not have.

**Several roots.** Opening a function from the file card starts a *branch*, and there can be many.
`rootFunctionIds` holds them, the file card marks which of its rows are open, and the depth walk
starts from all of them at once. Each root sits in the first column with its own edge from the file
card.

**Collapse as a flag, not a deletion.** Three lists, and the distinction between them is the whole
feature:

| State | Meaning |
|---|---|
| `rootFunctionIds` | branches opened from the file card |
| `expandedFunctionIds` | every function ever opened — **memory**, never pruned |
| `collapsedFunctionIds` | explicitly closed — **visibility** |

Closing a function adds it to `collapsedFunctionIds` and removes nothing. The breadth-first walk
draws a collapsed node (there has to be something to click to reopen) but does not walk *through*
it, so its descendants simply do not get a depth and are filtered out.

**Reopening is free and exact.** Because nothing was forgotten and every expansion is cached under
its own TanStack Query key, removing the collapse flag restores the entire subtree in one render —
not one generation per click, and with no refetch.

Verified against `sindresorhus/ky`: one branch three deep is 14 nodes, a second branch takes it to
30, collapsing the second drops to 15, and reopening returns to 30 with an identical node set.

**One bug this surfaced.** `useExpansions` filters out queries that have not resolved, which
reorders the list — so `responses[0]` was whichever expansion loaded first, not the function the
reader started from. Every depth is measured from that anchor, so the map silently pruned itself to
one subtree. Roots are now passed in from the store, and `graph.test.ts` pins it.

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

## 4b. The file card lives on the canvas, not on a canvas of its own

**Decided:** after seeing it in use.
**Status:** built.

There used to be two `<ReactFlow>` surfaces: one drawing the file card, and one drawing the function
graph that *replaced* it. Opening a function made the file you were reading disappear.

Now there is one canvas. The file card is a node on it, one column to the left of the function it
opened and joined to it by a plain "declared in" edge — deliberately not a confidence tier, because
a function being declared in a file is a fact rather than an inference, and drawing it in the same
notation as a call would say something untrue.

The chain reads: **file card → function → its callees → theirs**, with nothing removed at any step.

This also retires decision 5 below: with a single `<ReactFlow>` there is no second instance to
inherit a populated provider store.

---

## 4c. The view follows the graph, and a node says whether it opens

**Decided:** after "it is not growing".
**Status:** built.

Two things made a working feature look broken:

- **`fitView` only runs on mount.** Every expansion added a column outside the viewport, so the map
  grew and the screen did not move. It now re-fits after the node count changes, animated over
  400ms and a frame late — React Flow has to measure the new nodes before their bounds can be
  fitted.
- **A leaf looked exactly like an unopened function.** Clicking one did nothing, which is
  indistinguishable from a broken canvas, and roughly half the functions in a real repository are
  leaves. Nodes now carry `expanded` and `isLeaf`: a chevron means "opens", a dot means "calls
  nothing", nothing means "already open". The `aria-label` says the same thing in words.

**And one real bug they exposed:** functions and ghosts were laid out in two separate passes, each
centring its own depth column on the same axis, so a ghost and a function at the same depth were
placed on top of each other. One pass over both fixes it, and `graph.test.ts` now asserts no two
nodes share a position — a test that fails on the old code with `two nodes at 600,0`.

---

## 5. A provider per surface

**Decided:** during B5. **Superseded by 4b.**

The file card and the mind-map were two different `<ReactFlow>` instances, and mounting the second
into a `<ReactFlowProvider>` the first had already populated left it with stale internals whose
edges never rendered. `Canvas` branched above the provider so each surface got its own.

Kept here because the symptom — nodes render, edges silently do not — is worth recognising if two
surfaces ever come back. There is only one canvas now, so the workaround is gone.

---

## 6. Open questions

Raised and not settled. Each has enough context here to decide without re-deriving it.

**The confidence key's content.** Position is settled — top-right (§3 lists the alternatives and why
bottom-left lost). What is still open is what it shows: today three strokes with one-word labels and
meanings in tooltips. Constraint: `PRD.md` §8 turns on the reader understanding a dotted line, so
whatever replaces it must stay readable without interaction. Hiding the key behind a click is the
one option to avoid.

**`reactflow@11` → `@xyflow/react@12`.** v11 is the retired package name; v12 is the same team under
the current name. v11 renders correctly under React 19 including StrictMode — `Canvas.test.tsx` pins
that, and it was the Phase 0 risk. The reader has twice offered to migrate. Deferred both times
because nothing is broken and a migration mid-phase buys tidiness at the cost of re-verifying every
canvas behaviour by hand, none of which has an automated edge test to catch a regression. Worth
doing when there is a second reason.

**A router.** The Back button leaves the app entirely, because there are no routes — `TASKLIST.md`
cut them from 3b. The reader noticed and it is a fair complaint: URL-addressable repo, file and
function would make Back walk the selection and make a function linkable. It belongs with the
landing-page PR, which introduces a second route anyway.

**Collapsing individual nodes inside a branch** works (§1b). What does not exist is any way to close
*everything* at once, or to remove a branch entirely rather than collapse it. Nobody has asked yet.

**Other canvas utilities** the reader has mentioned wanting but not yet specified.
