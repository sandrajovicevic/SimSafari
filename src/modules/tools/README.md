# tools

Owner of `world.selection`. The in-game build tools — the player's hands: terraform, road draw,
zone paint, place building, release animal, and select/inspect (the default tool). Drives
`terrain`/`roads`/`zoning`/`buildings`/`animals` through their public APIs with null checks
throughout (any of them may be absent), renders every cursor/ghost/preview ribbon in the WebGL
canvas, and keeps a >= 50-step undo/redo history. Reference: Cities: Skylines II tool feel —
snapping, guides, previews, undo.

## Files

| file | purpose |
|---|---|
| `index.js` | module definition: the tool framework (`activate`/`deactivate`/`current`), undo/redo, `world.selection` ownership, global key handling (Esc/Delete/Ctrl+Z/Ctrl+Y), the render-loop hookup for cursors |
| `common.js` | shared cost constants, `spend()`, cell-iteration helpers used for undo bookkeeping, `pickEntity()`/`entityPosition()` for select/inspect |
| `cursors.js` | `RingCursor` (terrain/zone brush decal), `RoadRibbon` (Catmull-Rom preview + node markers + snap indicator), `SelectionMarker` — all pre-allocated, mutated in place per frame |
| `UndoStack.js` | bounded (64) undo/redo stack of `{label, undo(ctx), redo(ctx)}` ops |
| `SelectTool.js` | default tool: click to pick, sets `world.selection` |
| `TerrainTool.js` | raise/lower/flatten/smooth/paint-biome |
| `RoadTool.js` | click-to-place road path, bulldoze mode |
| `ZoneTool.js` | brush/fill/erase zone painting via `zoning` |
| `BuildingTool.js` | ghost preview + place/bulldoze via `buildings` |
| `AnimalTool.js` | release-into-habitat + inspect via `animals` |
| `showcase.js` | scripted deterministic session + 6 presets |

## Public API — `ctx.modules.get('tools')`

```js
activate(name, options = {}) → boolean
// name: 'select' | 'terrain' | 'road' | 'zone' | 'building' | 'animal'.
// Fails (returns false, emits ui:notify) if any of the tool's `needs` modules is not loaded —
// "missing modules → tool disabled with a ui:notify", per spec. Deactivates the previous tool first.
// Always sets ctx.input.toolActive = true (the left mouse button belongs to the active tool,
// select included — CameraRig then reserves left-drag-to-pan for when no game exists yet).
deactivate()                              // → activate('select')
current() → { tool, options }             // options is a shallow copy — safe to inspect, not mutate
availableTools() → string[]               // tool names whose `needs` are all currently loaded
isActive(name) → boolean

setOption(key, value)                     // patches the current tool's options object in place
getOptions() → object                     // shallow copy of the current tool's options

undo() → boolean                          // pop + invert the most recent op; false if the stack is empty
redo() → boolean
canUndo() / canRedo() → boolean
historySize() → { undo, redo }            // stack depths (cap 64, spec asks >= 50)

select(kind, id)                          // sets world.selection directly + emits selection:changed
clearSelection()                          // select(null, null)
requestDelete() → boolean                 // see "Delete confirmation" below

group                                     // (getter) THREE.Group 'tools' — ring cursor, road ribbon, selection marker
```

### Per-tool `options` (passed to `activate(name, options)`, patched via `setOption`)

| tool | options | defaults |
|---|---|---|
| `terrain` | `mode` (`raise\|lower\|flatten\|smooth\|paintBiome`), `radius`, `strength`, `biome` | `raise`, 8, 6, `BIOME.GRASS` |
| `road` | `kind` (`dirt\|gravel\|paved`), `bulldoze` | `dirt`, false |
| `zone` | `zone` (a `ZONE.*` id), `radius`, `mode` (`paint\|erase\|fill`) | `ZONE.HABITAT`, 12, `paint` |
| `building` | `type` (a buildings catalogue key or `null`), `rot` (radians), `bulldoze` | `null`, 0, false |
| `animal` | `species` (a species id or `null` — `null` means "click an animal to inspect instead of releasing") | `null` |
| `select` | (none) | |

## Tool framework mechanics

* Every tool implements a shared shape: `activate(ctx,S,opts)`, `deactivate(ctx,S)`,
  `pointerDown(ctx,S,e)`, `pointerUp(ctx,S,e)`, `update(ctx,S,dt)`, `key(ctx,S,e)`. `index.js` wires
  these to the core's own `input:down` / `input:up` / `input:key` events (emitted by `App.js` from
  real DOM pointer/keyboard events) — every tool method is error-isolated (a throw is logged and does
  not break the next frame).
* **Cursor**: `ctx.app.input.ground`/`.groundValid` (core raycasts the heightfield every frame) drives
  the ring cursor (terrain/zone) and the building ghost every frame in `update()`; the road ribbon
  reads the same point as its live "next point" preview.
* **Continuous drag**: terrain/zone read `ctx.app.input.buttons & 1` each frame to keep applying while
  the left button stays down, rather than only on the initiating `pointerdown`.

## Undo/redo model

A >= 50-step (actually 64) bounded stack of `{label, undo(ctx), redo(ctx)}`. Every op replays through
the owning module's own public API wherever the operation is exactly invertible that way, rather than
poking module-owned state directly:

* **Terrain raise/lower** — a pure additive falloff (`H[i] += amount·f`), so the exact inverse is
  calling `terrain.raise` again with `-amount`. Every `(x,z,r,amount)` applied during a stroke is
  recorded and replayed (negated for undo, forward for redo) through `terrain.raise` — terrain's own
  chunk/water/texture refresh pipeline always runs correctly as a result.
* **Terrain flatten/smooth/paintBiome** — lossy (blend-to-target / averaging / hard set), so instead
  the *touched cells'* value is captured the first time each is touched in the stroke (a `Map`, not a
  full-array clone — cheap even for a large radius), and undo/redo write those exact values back into
  `world.terrain.heights`/`.biome` directly, then call `terrain.raise(cx, cz, coverR, 0)` — a
  zero-amount call that runs terrain's complete `afterEdit()` pipeline (chunk rebuild, water check,
  control-texture upload, `terrain:modified`) with no actual height change. No terrain-internal access
  is used; both tricks work purely through the public API in `terrain/README.md`.
* **Zone paint/erase/fill** — replays through `zoning.paintCells(indices, zone)` (grouped by each
  cell's captured before/after zone value), so `zoning`'s own habitat/fence rebuild and NO_BUILD
  recompute always run — never a raw `world.grid.zone` write.
* **Road add/bulldoze, building place/bulldoze, animal release/delete** — these are id-returning
  operations with no in-place inverse (`roads.addRoad`/`buildings.place`/`animals.spawn` all mint a
  *new* id), so undo/redo call the module's own add/remove function with the recorded parameters and
  rewrite the op's own closure state with whatever new id comes back, so a further undo/redo cycle
  keeps working. Known consequence: an undone-then-redone road/building/animal has a **different id**
  than the original (documented in Known gaps).
* Cost (see below) is refunded/recharged symmetrically inside every op's `undo`/`redo`.

## Cost model (`common.js` `COST`, `spend()`)

`world.economy` is owned by `simulation`; there is no public "spend" API on it (see
`docs/requests/tools.md` #1), so `spend(ctx, amount)` writes `ctx.world.economy.cash -= amount`
directly and only when `ctx.modules.get('simulation')` is loaded (per spec: "cost charged to
world.economy if simulation is present"), re-emitting `economy:updated`.

| action | cost |
|---|---|
| terrain raise/lower | `|Δheight| · radius² · 0.5 · 3.5` accumulated over the stroke |
| terrain flatten | `radius² · 0.35 · 3.5` per application |
| terrain smooth | `radius² · 0.12 · 4` per application |
| terrain paintBiome | `π·radius² · 0.6 · 0.02` per application |
| road add | `length(m) · 22 · KINDS[kind].cost` |
| road bulldoze | refunds 50% of the same formula |
| zone paint/erase/fill | `cellsTouched · 0.15` |
| building place | the catalogue's `cost` (`buildings.getType(type).cost`) |
| building/generic bulldoze | refunds 50% of the building's `cost` |
| animal release | flat 750 per animal |

These are original numbers (not sourced from a spec table) tuned only to be non-trivial relative to
the default starting cash (250,000) — see Known gaps for how quickly a lodge (320,000 alone) still
puts the demo session into debt.

## Delete confirmation

`requestDelete()` (bound to Delete/Backspace while the select tool is active and something is
selected) is a **two-press confirm**: the first press starts a 3-second window and emits
`tool:confirmRequest` + `ui:notify`; a second press on the *same* selection within that window
performs the bulldoze (building/animal/road — a habitat cannot be bulldozed this way, `ui:notify`s
`info` instead). Escape cancels a pending confirmation.

## Select/inspect tool — how picking works

`pickEntity(ctx, x, z)` in `common.js` finds the nearest building (within `hypot(w,d)/2 + 1.2`
of its footprint), animal (within 2.4 m), road (`roads.nearestEdge(x,z,6)`) or habitat
(`world.grid.habitatId` at the clicked cell), in that priority order by distance. This is a
radius/nearest-lookup against public world state, **not a true mesh raycast**: `buildings` and
`animals` render everything through `InstancedMesh` and expose no public per-instance→record-id
mapping (that bookkeeping is private to each module), so a real raycast-and-resolve-instanceId
pipeline is not available through the documented contract. Documented as a known simplification, not
a bug — it is reliable and cheap, and degrades gracefully (never throws) when a module is absent.

## Events

| event | direction | payload |
|---|---|---|
| `tool:selected` | emits | `{tool, options}` — on every successful `activate()` |
| `tool:applied` | emits | `{tool, detail}` — after every committed action (stroke end, road commit/bulldoze, building place/bulldoze, animal release/delete, zone stroke/fill, undo, redo) |
| `tool:confirmRequest` | emits | `{kind, id, message}` — first Delete press on a selection |
| `selection:changed` | emits | `{kind, id}` — `world.selection` owner |
| `ui:notify` | emits | `{level, text}` — missing-module refusals, placement failures, confirm prompts |
| `economy:updated` | emits | `{cash, income, expenses, day}` — after every `spend()` (see Cost model gap above) |
| `input:down` / `input:up` | consumes | core's raw pointer events (`{button, ground}`) |
| `input:key` | consumes | core's raw key events (`{code, key, shift, ctrl}`) — Escape / Delete / Ctrl+Z / Ctrl+Y handled centrally, then forwarded to the active tool |

## Presets (`showcase.js`)

`stage()` always replays the same **scripted, deterministic session** first — no real pointer events;
every action goes through `ctx.modules.get('tools')`'s own public API plus synthetic
`input:down`/`input:up`/`input:key` events on `ctx.events` (exactly the path a real click takes):
generate terrain -> raise at 3 points -> draw a gravel road (5 points, an S-curve over the seed's
river, picking up a bridge) -> paint a habitat (if `zoning` is loaded) -> place a lodge + a gate
(spiral-search for a valid `canPlace()` spot, force-placing only as a last resort) -> release 3
zebras inside the painted habitat. Then each preset leaves a different tool live in-frame:

| preset | tod | what it shows |
|---|---|---|
| `overview` | 15 | wide shot after the scripted session: the raised ground, the curving gravel road and its bridge, the gate, the lodge, and the painted habitat |
| `road` | 16 | road tool **live**: a new paved path snapped onto the end of the committed gravel road (node-snap), with the preview ribbon, per-segment grade colouring, and the cyan snap-indicator ring |
| `terrain` | 16.5 | terrain tool **live**: the ring cursor over a mound raised by a bounded, deterministic number of applications (see Known gaps for why the drag is frame-bounded, not wall-clock-bounded) |
| `building` | 17 | building tool **live**: the real placed lodge, plus a ghost preview nudged onto it — red (invalid: `occupied`) — demonstrating `canPlace()` validity colouring |
| `close` | 16.5 | select tool: the lodge picked (`tools.select('building', id)`), the pulsing selection-marker ring visible |
| `night` | 21.5 | the same park after dark, lodge still selected |

## Measured (SwiftShader software GL, 1280×720, `--settle 15`, seed 1)

This session's environment ran several other builder agents' own headless Chrome captures
concurrently, which under SwiftShader's software rasterizer made `elapsedMs`/`fps` wildly
unrepresentative from run to run (correctly: `CLAUDE.md`/`ARCHITECTURE.md` both call out that fps
under SwiftShader is not the budget metric). `errors`/`drawCalls`/`triangles` were stable and 0 errors
across every successful capture.

| preset | draw calls | triangles | console errors |
|---|---|---|---|
| overview | 87 | 3,651,757 | 0 |
| terrain | *(see Known gaps — capture pending re-run after the stroke-cap fix)* | | 0 |
| road | *(pending)* | | |
| building | *(pending)* | | |
| close | *(pending)* | | |
| night | *(pending)* | | |

These totals are the **whole frame**: `tools` auto-loads every optional module that exists in this
repo (`terrain`, `roads`, `zoning`, `buildings`, `animals`, `simulation`, plus `environment`/`props`
as *their* dependents), so terrain's chunked splat mesh and props' instanced vegetation dominate the
count the same way they do in every other builder's showcase — `tools`' own contribution is the ring
cursor (1 draw call), the road ribbon + markers + snap ring (3 draw calls), the selection marker (1
draw call) and the building ghost (drawn by `buildings.preview()`, not this module) — at most ~5 draw
calls and a few hundred triangles, well inside any reasonable per-module soft cap.

## Known gaps (honest)

* **Terrain stroke amount is now frame-count-capped, not truly continuous-real-time.** A raise/lower
  stroke stops accumulating height once it has moved 14 m total (`MAX_STROKE_RISE` in
  `TerrainTool.js`), regardless of how long the drag is held. This was added as a direct fix for a
  real bug found while shooting the `terrain` preset in this shared, heavily-contended environment: an
  open stroke left running across the screenshot tool's ready+settle window grew by
  `strength · Σdt` — and `Σdt` scales with how many real animation frames land in that wall-clock
  window, which under concurrent SwiftShader load in this session ranged from a handful of frames to
  several hundred over minutes, once producing a mound so tall the preset's camera ended up **inside**
  it (a blank sky-coloured capture, 0 console errors, drawCalls/triangles matching the real scene — the
  camera was simply embedded in solid terrain looking through unrendered backfaces). The cap fixes
  this for real gameplay too (a stuck mouse button can no longer dig/build without bound), not only for
  the showcase.
* **Select/inspect picking is radius/nearest-based, not a true mesh raycast** (see "How picking
  works" above) — a deliberate simplification given the public API contract, not a bug, but it means a
  click just outside a building's true (rotated) footprint but inside its bounding circle can still
  pick it, and a click on a building that visually overlaps another from the camera's angle always
  resolves to whichever is *nearest in (x,z)*, not whichever is topmost on screen.
  Documented in `docs/requests/tools.md` if the alternative (a real per-instance pick id) is ever added.
  Roads (`nearestEdge`) is the only kind that would already support closer-to-true picking.
  Not fixed this round: there is nothing to raycast against that resolves to a stable id.
- **Undo/redo of road/building/animal actions changes the entity's id.** `roads.addRoad`,
  `buildings.place` and `animals.spawn` all mint a fresh id on every call — there is no "restore under
  this exact id" entry point in any of the three modules — so undoing a bulldoze and then redoing it
  (or vice versa) leaves a *different* id than whatever existed before, even though position/type/kind
  are identical. `world.selection` is cleared rather than left pointing at a stale id across such an
  op. Terrain and zone undo/redo have no such issue (they mutate the shared array in place).
- **`zoning`'s `paintCells` cannot directly restore a captured `NO_BUILD` cell** (only
  `HABITAT|VISITOR|SERVICE|NONE` are valid paint targets) — zone undo/redo remap any captured
  `NO_BUILD` value to `NONE` on restore and rely on `zoning`'s own `recomputeNoBuild()` (called from
  every `paintCells`) to re-assert `NO_BUILD` on any cell that is still actually blocked by water/road.
  This is correct today (`recomputeNoBuild` is a pure function of terrain/road/water state, not
  history) but is a documented assumption — see `docs/requests/tools.md` #2.
* **No true per-tool DOM UI** — the toolbar/panel/radius-and-strength readout the player would see is
  `ui`'s job; this module only exposes `activate()`/`setOption()`/events for `ui` to drive and renders
  every visual cue directly in the WebGL canvas (ring cursor, road ribbon, ghost, selection marker),
  per ARCHITECTURE §2's DOM-ownership rule.
* **Shift+wheel radius adjustment is only a best-effort extra.** `CameraRig`'s `wheel` listener always
  zooms the camera with no modifier check (`src/core/CameraRig.js`), and `tools` cannot intercept or
  cancel that from its own `wheel` listener on the same canvas — both fire. `[`/`]` (radius) and
  `,`/`.` (strength) are the reliable keyboard path. See `docs/requests/tools.md` #3 for the one-line
  `CameraRig` change that would let `tools` own shift+wheel exclusively.
* **`ZoneTool` is exercised through the now-real `zoning` module** (it did not exist for part of this
  build) — `paint`/`erase`/`fill`/`setOverlay`/`getZone` signatures match `zoning/grid.js` exactly and
  the showcase's habitat-paint step runs for real (see Measured), but fill-mode and erase-mode have
  only been exercised by hand, not through a dedicated showcase preset (the spec's five named presets
  don't include one) — `mode: 'fill'`/`'erase'` are implemented and lint-clean but less battle-tested
  than `mode: 'paint'`.
* **Building/road/animal cost numbers are original, not sourced from a design doc** — see "Cost
  model" above; a full-price lodge (320,000) alone exceeds the default starting cash (250,000), so the
  showcase session's final `world.economy.cash` is deliberately negative. This is not a bug (there is
  no hard floor on `spend()`, matching there being no bankruptcy enforcement in this module — that is
  `simulation`'s job) but is worth knowing before reading the measured-numbers economy snapshot.
* **Grade-warning threshold (12%) is checked per preview-ribbon sample against the previous sample**,
  not against the eventual baked road mesh's actual per-vertex grade (`roads`' own ribbon builder may
  smooth/bank differently) — the preview is a good guide, not a guarantee that a red-highlighted
  stretch will still read as steep once `roads.addRoad()` builds the real terrain-conforming mesh.
