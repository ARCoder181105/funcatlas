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

## 4. Node dimensions are computed, and React Flow measures them anyway

**Decided:** during B5, after edges silently failed to render.
**Corrected:** during B8, when the same symptom turned out to have the opposite cause.
**Status:** built.

React Flow will not draw an edge until both of its nodes have been measured. Where that measurement
never arrives the nodes still render and the edges silently do not — a graph that looks like a set of
functions calling nothing, which is the one thing this canvas must never show.

The first reading of that was: *state the size up front so nothing has to be measured*. So every node
carried `width` and `height`, and the components were pinned to the same numbers.

**That was backwards, and it caused the very failure it was meant to prevent.** Those fields are
React Flow's *outputs*, not its inputs. A node that arrives with `width` already set is one it
considers measured, so it never runs the pass that also computes `handleBounds` — and an edge whose
endpoints have no handle bounds is skipped without a word. Landing on a function from the ⌘K palette
drew five cards and nothing joining them. React Flow's own store told the story: four edges present,
five nodes sized, `handleBounds` undefined on every one.

It went unnoticed for three chunks because it is *intermittent*. A node React Flow happens to
re-measure — after a resize, or a slow mount — gets its handle bounds and its edges appear, so most
maps looked right and the palette's did not.

Sizes are still computed up front, because the layout cannot space a graph around boxes it does not
know. They live in `data.size`, the component renders itself at exactly that, and React Flow measures
the result. Nothing writes `node.width`.

**What this costs.** Edge rendering now depends on a `ResizeObserver`, so it cannot be asserted in
jsdom — `lib/graph.test.ts` covers exhaustively *what* the edges are, and whether they paint is a
browser check. It also made React Flow start calling `DOMMatrixReadOnly`, which jsdom lacks; the stub
is in `test-setup.ts` with the reason.

**And one more thing the same bug was hiding.** The draw-in animated `pathLength`, which Framer
implements by writing `stroke-dasharray` into the element's inline style — so the confidence pattern
had to wait for the animation to finish before it could be applied. It never finished: the map
re-lays out constantly, every re-render interrupted the tween, and every edge sat frozen at a dash of
`0.645678px 1px`. Solid, dashed and dotted were one pattern in three colours, which is most of what
`PRD.md` §8 promises, quietly gone. Edges now carry their tier's pattern from the first frame and
arrive with a fade instead.

Verified in a browser: exact is `dash=none` in teal, `name_match` is `6px 4px` in amber, unresolved is
`1px 5px` in slate, and the file card's "declared in" edge is a plain grey line.

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

## 4d. The source drops down inside the card that owns it

**Decided:** during B6, then corrected the same day.
**Status:** built.

The chain ends in source (`UI_GUIDE.md` §3.2). It first shipped as a resizable panel beside the
canvas, on the reasoning that a card is too small to read code in. The reader's verdict was that the
screen was full and the map had lost a third of its width to a second surface — and they were right:
the panel showed *the selection*, so it answered "what does this function do" while sitting as far
from that function as the layout allowed.

It is now a drop-down inside the card. Clicking the code button on a card opens its source in the
card itself; clicking again closes it. Two controls per card, because they answer two questions —
the row opens what the function **calls**, the button opens what it **does** — and tying them
together would grow the map every time the reader wanted to read one body.

**What that costs, and how it is paid.** A card that changes size breaks a fixed grid: 420×324 in a
300-wide column lands on the column beside it and on its own neighbour below. So the layout stopped
being a grid. Column positions are the running total of the widest card in each layer, rows the
running total of the heights above them (`layOut` in `lib/graph.ts`). Opening a card pushes the
graph apart rather than covering it, and `graph.test.ts` asserts no two node rectangles intersect —
rectangles, not positions, because "different position" stopped being the same claim as "does not
overlap" the moment cards differed in size.

The card's size is still *declared*, never measured (§4): the source scrolls inside a fixed height,
because source length is unbounded and a node that grew with it could not be placed. `nowheel` on
that scroller, or the wheel zooms the canvas instead of scrolling the code.

**Line numbers are the file's.** Shiki emits one `<span class="line">` per line, so the numbers are
a CSS counter: `CodeBlock` sets `counter-reset: line <startLine - 1>` inline and `index.css`
increments it. No transformer, no per-line DOM building, and a function at line 400 reads 400 rather
than 1 — which is what makes the block match GitHub.

**Fetch and highlight are one query.** Both are async and neither is useful alone, so one queryFn
covers both and the card has a single pending state: one skeleton over the request *and* Shiki's
first grammar load, rather than a skeleton followed by a flash of unhighlighted text.

---

## 4e. Closing means closing, everywhere

**Decided:** after the reader found the file card one-way.
**Status:** built.

Two inconsistencies, both of which made the canvas feel like it only opened things.

**The file card had no visible way to close a branch.** Its rows toggled, but the affordance was a
tick that appeared *once the branch was open* — which says "this is on", not "press to turn it off".
Rows and cards now share one control (`ExpandIndicator`): a chevron that rotates, with the matching
`aria-label` from `expandLabel`. Shared rather than copied, because the second copy is the one that
goes stale.

**A closed branch used to stay on the canvas.** Collapsing keeps the card and hides its descendants
(§1b) — correct in the middle of a map, where that card's own chevron is the only way back. It is
wrong for a branch root: that one is opened and closed from its row on the file card, so leaving it
behind means pressing "close" and watching the card sit exactly where it was. `buildGraph` therefore
drops collapsed roots from the walk entirely, and nothing else changes — the structure is still in
`expandedFunctionIds` and the query cache, so reopening restores every generation at once.

Verified against `sindresorhus/ky`: 32 nodes, closing one branch leaves 21, reopening returns to the
same 32 with an identical node set.

---

## 4f. The map moves, and nothing dims

**Decided:** after "they all are pretty much like a static", then "don't make the other card
transparent".
**Status:** built.

Three things, all about the canvas feeling alive rather than correct-but-frozen.

**Cards glide, they do not teleport.** `buildGraph` re-lays the whole map out whenever anything
opens or closes, and React Flow applies the result on the next frame — so a card that had to move
two hundred pixels to make room simply appeared two hundred pixels away. `useAnimatedNodes` tweens
the positions over 420ms.

The tween runs over the **positions**, not over CSS transforms. A CSS transition on
`.react-flow__node` would have been one line, but React Flow computes every edge path from the
positions in its store: the cards would slide while their edges were already drawn at the
destination, detached, for the length of the animation.

It also keeps the positions in a ref and forces a redraw with a counter, rather than holding the
animated array in state. Holding it in state means every render that produces a new (but equal)
`nodes` array restarts the tween, which sets state, which renders — an update loop React kills
mid-frame inside React Flow's own store updater, taking the app with it. That is not hypothetical:
it happened, from `useQueries`'s `combine` handing back a fresh array each render. `useSources`
caches on a signature of its contents for the same reason.

**There is no focus mode.** Selecting a function used to dim everything outside its immediate
neighbourhood. On a map the reader has been building for a while that is most of their own work
greyed out, and it fired on *every* click — including opening a card's source, where the cards being
compared are exactly the ones that went transparent. It also dimmed the file card, which read as the
file having closed itself. The selected card carries a ring instead: same information, nothing taken
away. `UI_GUIDE.md` §3.2 is corrected; the `focus` function and its tests are deleted rather than
left unreachable.

**Everything else that moves.** Cards lift 2px under the pointer; the source fades in behind the
card's growth; the card grows into its new box on a CSS transition rather than snapping. All of it
sits behind `motion-safe:` or `useMotionEnabled`, so a reduced-motion reader gets the final state
rather than a faster animation. A background tab gets the final state too — `document.hidden` skips
the tween, because a tab with no animation frames would otherwise hold the map at the positions it
had when the reader looked away.

---

## 4g. A card is the size of the code in it

**Decided:** after "the width and height are like static, they are just not able to show the
complete code".
**Status:** built.

The first version gave every open card the same 420×280 box. That makes every function the shape of
the worst one: a three-line helper gets a scrollbar's worth of empty space, and a function with
100-character lines is clipped with the ends of its lines out of reach.

`codeCardSize` measures the card from the text instead — longest line for the width, line count for
the height — clamped to 320–1040 wide and 140–560 tall. The character metrics are measured off the
rendered block (6.6px per character at 12px JetBrains Mono, a 48px gutter, 26px of padding, a 33px
header) rather than guessed. Verified: a 13-line function whose longest line is 105 characters gets
a 767px card and does not scroll sideways.

The source has to reach the layout for this, not just the card, so `MindMap` subscribes to the same
query the card uses — same key, one request — and passes the text into `buildGraph`. The size is
still *declared* rather than measured after render (§4): estimating from the text keeps the whole
layout independent of anything the environment has to measure, which is what keeps edges drawn.

---

## 4h. Nothing inside a node scrolls, and no card has a size cap

**Decided:** after "I don't like scroll bar", and the reason behind it: *"because we are on canvas
the scroll is doing work — one is scrolling and one is like zoom in and zoom out, it makes things
complex"*.
**Status:** built.

That observation is the whole rule. Over this canvas the wheel zooms the map. A scroll region
inside a node means the reader's own gesture changes meaning depending on where the pointer
happens to be — the same wheel either scrolls a list or zooms the graph, and there is no way to tell
which without looking. That is not density, it is ambiguity.

So no node scrolls. Instead:

- **Cards are measured to their content.** `fileCardSize` from the longest function name and the
  number of rows, `codeCardSize` from the longest line and the line count. Both are exact enough
  that nothing overflows — verified in a browser by asserting `scrollHeight <= clientHeight` on
  every element inside a card.
- **A card too big for one screenful previews and grows.** Ten rows on a file card, twenty-four
  lines on a source card, then a row that says how many are left and opens the rest. The card
  expands, the layout re-spaces around it, and `useAnimatedNodes` glides the neighbours out of the
  way. Verified: `test/hooks.ts` shows 10 rows and "91 more", and expands to 101 rows in a 4757px
  card with nothing clipped.
- **Neither axis is capped.** The caps went after the reader asked for them to go, and they were
  wrong anyway: a maximum width is just a place where clipping happens somewhere less obvious. A
  170-line function with 195-character lines gets a 1589×3948 card. It is enormous, and reading it
  is what the canvas's zoom is *for* — which is the point of not having a second scroller inside it.

**Two measurement lessons, both found the hard way.** The row component ships as `flex-wrap`, so a
name a few pixels too long dropped its line number onto a second line and made every row taller than
the card was measured for — it is `flex-nowrap` now. And a character in a card name renders at
7.2px, not the 6.6px measured off the code block; using the code figure left every long name a few
pixels short of its row, which is what the wrapping was reacting to. Both numbers are measured off
rendered DOM, and both are wrong the moment the type scale changes.

---

## 4i. The ground is plain

**Decided:** during B8, by the reader, after the edge bugs were fixed.
**Status:** built.

The canvas carried a two-level ruled grid — a fine 26px graticule under a coarse 130px one — as
signature 1 of `UI_GUIDE.md` §3.2: the thing that made the surface read as a chart rather than as a
diagram tool.

It is gone, and the reason is worth keeping. A field of thin lines sat behind a drawing made of thin
lines, and the background won. Solid, dashed and dotted are the product's whole claim (`PRD.md` §8)
and they were competing with a decoration that meant nothing. The reader reported the edges as
missing while they were rendering correctly — the notation was there and unreadable, which for this
canvas is the same as absent.

Chanel's rule, which B8 asks for by name: the element carrying the least meaning goes. Here it was
also the element doing the most damage.

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
