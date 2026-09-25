# zoning

Habitat / visitor / service zone painting, habitat quality tracking, a ground overlay decal, and
instanced boundary fences. Owns `world.grid.zone`, `world.grid.habitatId`, `world.habitats`.

## Purpose

Turns the raw 4 m zoning grid (`world.grid`, owned per `ARCHITECTURE.md` §3) into playable habitats:
paint a region as HABITAT / VISITOR / SERVICE, flood-fill contiguous HABITAT cells into stable
`world.habitats` entries with computed physical stats, score those habitats per species (delegating to
`simulation` when present), and render both a toggleable zoning-tool ground overlay and terrain-
conforming wooden-post fences with gates wherever a road crosses.

## Files

- `state.js` — shared mutable state (`Z`) imported by every file below.
- `grid.js` — `paint`/`paintCells`/`erase`/`fill`/`getZone`, the derived NO_BUILD sweep, `cellsInRadius`,
  `isBuildable`, `nearestHabitat`.
- `habitats.js` — flood fill into `world.habitats` with stable ids, per-habitat stats, boundary tracing
  (used by `fences.js` and the public `boundary()`), and `getHabitatQuality`.
- `overlay.js` — the ground overlay fill decal (mesh + shader + live data texture).
- `boundaries.js` — the smooth dashed boundary ribbon: traces every region interface once (crack
  following), melts 1-cell teeth (Taubin, clamped to ≤3.2 m of the true partition), rounds corners with
  Chaikin cutting, and draws one animated marching-ants ribbon along the smoothed contour.
- `fences.js` — instanced posts + wire rails, gate detection against `roads`.
- `index.js` — module definition, event wiring, public API.
- `showcase.js` — presets.

## Public API (`ctx.modules.get('zoning')`)

```js
ZONE                                    // { NONE:0, HABITAT:1, VISITOR:2, SERVICE:3, NO_BUILD:4 } (re-exported from core/World.js)

// ---- painting (all return the array of grid-cell indices actually changed) ----
paint(x, z, radius, zone)               // paint a disc; NO_BUILD is not a valid target (rejected, warns)
paintCells(indices, zone)               // paint an explicit list of grid-cell indices
erase(x, z, radius)                     // set a disc back to NONE (auto NO_BUILD cells are left alone)
fill(x, z, zone)                        // paint-bucket: flood every cell 4-connected to (x,z) sharing its current zone
getZone(x, z)                           // -> zone id at (x, z)

// ---- queries ----
cellsInRadius(x, z, radius)             // -> grid-cell indices within radius of (x, z)
isBuildable(x, z, w, d)                 // -> bool: every cell under a w×d rect is zone-buildable + occupancy-free
nearestHabitat(x, z)                    // -> { id, distance } | null (distance to the habitat's bbox, 0 if inside)

// ---- habitats ----
getHabitat(id)                          // -> world.habitats entry | null
habitatAt(x, z)                         // -> world.habitats entry | null
listHabitats()                          // -> [entry, ...]
getHabitatQuality(id, species)          // -> 0..1, delegates to simulation.scoreHabitat() when present
boundary(id)                            // -> [[ [x,z], ... ], ...] one or more polylines (best-effort chaining)
renameHabitat(id, name)                 // -> bool

// ---- overlay ----
setOverlay(bool)                        // show/hide the ground overlay decal (off by default in the game)
getOverlay()                            // -> bool
```

### `world.habitats` entry shape

```js
{
  id, name,
  cells: Int32Array,                    // grid-cell indices
  area,                                 // m²
  water, shade, cover, roughness, grass,// 0..1 physical stats (see "Known gaps" for cover/water/grass)
  species: Set<string>,                 // species currently standing inside (from world.animals, live)
  quality,                              // 0..1, mean getHabitatQuality() over `species`
  fenced,                               // 0..1, fraction of boundary edges that are fenced (not a gate)
  centroid: {x,z}, bbox: {x0,z0,x1,z1}, // for nearestHabitat() / camera framing
}
```

## Zone semantics

- `HABITAT` / `VISITOR` / `SERVICE` are the only zones a caller can paint.
- `NO_BUILD` is **derived, not paintable**: `grid.js` sweeps the whole grid on init and again (rect-scoped
  where possible) after `terrain:modified`, `road:changed`, `building:placed/removed`, forcing every cell
  under water or `OCC.ROAD`/`OCC.BUILDING` occupancy to `NO_BUILD` regardless of what was painted there,
  and reverting it to `NONE` the moment that condition clears. `paint()`/`fill()` never target NO_BUILD.
- Painting into a HABITAT/VISITOR/SERVICE cell that is currently water or road-occupied is accepted but
  immediately overridden back to NO_BUILD by the sweep that follows — so a habitat can never silently
  include a river cell.

## Events

| event | when |
|---|---|
| `zone:changed` `{cells, zone}` | after `paint`/`paintCells`/`erase`/`fill` actually change cells |
| `habitat:changed` `{id}` | once per habitat id touched by a flood-fill rebuild (new, updated, or about to be removed) |

Consumed: `terrain:modified`, `terrain:ready`, `road:changed`, `building:placed`, `building:removed`,
`animal:spawned`, `animal:died` (species-set changes are batched — see Known gaps).

## Rendering

- **Overlay** (`overlay.js` + `boundaries.js`, 2 draw calls): a terrain-conforming fill mesh (128×128
  quads, heights baked from `world.getHeight`, rebuilt on `terrain:modified`) with a live `DataTexture`
  (R=zone id, G/B=habitatId lo/hi byte) sampled per-fragment tints HABITAT/VISITOR/SERVICE fills and
  feathers them into the ground over ~a cell, plus a plank-line tint inside VISITOR cells for the
  boardwalk read. The boundary LINE is a separate ribbon (`boundaries.js`): region interfaces are traced
  once each, corner-rounded, and drawn as one smooth animated "marching ants" contour (11.4 m dash cycle,
  2.2 cycles/s) so boundaries read as smoothed zoning-tool lines at any camera angle, never as the 4 m
  cell staircase. Every smoothed point is clamped to ≤3.2 m (`MAX_PULL`, raised from 2.0 m on
  2026-09-22 to straighten 2-cell boardwalk corridors) of the exact cell partition, so a line can cut a
  single-cell corner but cannot leak into a neighbouring region: the thinnest paintable corridor (4 m
  brush) still leaves ≥4 m between two edges pulling toward each other. NONE and NO_BUILD never fill (see
  "Zone semantics" for why NO_BUILD staying invisible matters — it covers every road and river on the
  map).
- **Exposure- and night-aware fill/line (2026-09-25, critic r6 #2/#6):** both the fill and the boundary
  ribbon are unlit `ShaderMaterial`s that write straight into the shared HDR scene buffer `effects/
  pipeline.js` then runs through Bloom → Grade → ACES Output using the same `renderer.toneMappingExposure`
  as every lit material (see `environment` README). A fixed-colour probe fragment run through the real
  pipeline showed why the naive fix (scale *alpha* by `1/exposure`) still blew out at night: raw linear
  magnitudes as small as 0.02–0.05 already read back post-pipeline as ~0.6–0.9 (near white) once
  multiplied by the night-range exposure (~12×) that Bloom sees *before* tonemap — alpha blending happens
  in that same HDR buffer, so alpha alone can't fix it. `overlay.js`/`boundaries.js` now take
  `environment.getNightAmount()` and `.getExposure()` each frame (optional dependency; both default to
  day-neutral values — 0 / 1 — when `environment` isn't loaded) and scale the **raw colour magnitude**
  down (fill to ×0.05, line to ×0.22) in step with a `mutedK` factor driven by whichever is higher of
  night-amount or `(exposure − 0.8)/4` (so golden-hour/dawn, which raises exposure before night-amount
  turns on, is caught too — critic's "neon mint over orange dawn grass" at 6.5 h), on top of a smaller
  alpha trim and a cool desaturating tint. The contour keeps a higher floor on both terms than the fill
  (per the brief: "keeping the contour line readable"). The marching-ants gap floor also drops from 0.12
  to 0.02 at night, since at the old floor gap and dash blended into a visually solid glowing tube once
  exposure multiplied everything back up pre-tonemap (critic r6 #6).
- **VISITOR (boardwalk) fill floor + adaptive plank direction (2026-09-25, critic r6 #1):** the fill's
  same-region consensus field never reaches the plain 0.42–0.9 smoothstep range on a 2-cell corridor (see
  `overlay.js`), so VISITOR cells get an extra, much looser floor term (`0.20 * smoothstep(0.10, 0.32,
  field)`, maxed with the normal term) that is visible even on the thinnest paintable corridor. The plank
  seam direction now follows the corridor's own local long axis instead of a fixed world diagonal: a
  cheap 12-tap same-region survival test along ±x/±z (3 taps each direction) picks whichever axis the
  corridor extends further along, so a diagonal boardwalk reads as planks laid across it rather than a
  fixed-angle hatch. This is the **cheap version, not a full SDF clip** (the critic's stronger fix): the
  fill is still driven by the same 5×5 pyramid field as HABITAT/SERVICE, so a corridor that bends sharply
  within one 5-cell window can still show a seam angle lagging the true curve by a cell or two, and the
  fill's edge is feathered rather than clipped exactly to the smoothed boundary ribbon. Good enough that
  the boardwalk is now visible and oriented correctly in every preset (`overview`, `close`, `overlay`,
  `night`); a true SDF clip is listed as a follow-up in Known gaps, not implemented here.
- **Fences** (`fences.js`, 2 draw calls: posts, rails): `traceBoundaryEdges()` walks every outward-facing
  grid-cell edge of each habitat (each is exactly `world.grid.cell` = 4 m, matching real fence-post
  spacing). A post is instanced at every boundary corner, a two-wire rail spans every non-gate edge. An
  edge within ~roadWidth/2 + 2.4 m of any `roads` polyline point is treated as a gate: its rail is
  skipped and its flanking posts are raised 30% as a gate marker — an actual opening a vehicle could pass
  through, not a decorative arch.
- **Visitor boardwalk**: no separate mesh — VISITOR cells get a plank-line tint baked into the overlay
  shader (see above). Cheap (0 extra draw calls) but means it is only visible while the overlay is on.

## Presets (`?module=zoning&preset=<name>`)

| preset | camera | tod | shows |
|---|---|---|---|
| `overview` | orbit, d=260 | 15 | three painted habitats + fences, overlay on |
| `close` | orbit, d=15, on a real boundary point | 16.5 | fence post/rail detail, terrain-conforming |
| `overlay` | near top-down, d=300, pitch 78° | 13 | the overlay as a zoning-tool map: fills, edges, dashes |
| `night` | orbit, d=220 | 21.5 | overlay + fences under moonlight |

`stage()` generates terrain if the module is present (falls back to the flat default world otherwise),
explicitly calls `props.scatter({})` (the full game auto-scatters on `terrain:ready`, but a single-module
showcase does not run that path), paints three organic habitats (several overlapping `paint()` discs, not
plain circles) plus a visitor boardwalk connecting them and a small service yard, names the habitats,
spawns a few animals per habitat if `animals` is present, and turns the overlay on.

## Measured (SwiftShader software GL, `tools/screenshot.mjs`, 1280×720)

zoning's own group holds exactly 4 draw calls regardless of preset (1 overlay fill mesh + 1 boundary
ribbon + 2 fence `InstancedMesh`es for posts/rails — no per-habitat multiplication), well under the
20-call spec budget (overlay 1–2, fences ≤6). Figures below are for the **whole scene** (terrain + props
+ animals + roads + zoning together, as the screenshot tool reports) since that is what actually renders
in the showcase.

| preset | draw calls (scene) | triangles (scene) | console errors | `updateMs` |
|---|---|---|---|---|
| `overview` | 167 | 3,872,613 | 0 | 0.004 (peak 0.10) |
| `close` (16.5 h) | 178 | 3,844,305 | 0 | 0.004 (peak 0.10) |
| `overlay` | 178 | 3,879,916 | 0 | 0.004 (peak 0.10) |
| `night` | *(see note — module page did not finish under this session's CPU contention; 2026-09-25 run measured 169 draws / 4,156,589 tris / 0 errors)* | | | |

Re-measured 2026-09-25 (SwiftShader software GL, 1280×720, seed 1, via `__SIM__.capture(false)` in headless
Chrome rather than `tools/screenshot.mjs`, whose PNG capture is broken in this environment). Whole-scene draw
calls move by ±5 % (and a little more on `close`/`overlay`) between runs with camera frustum and time-of-day —
critic round 6 measured 163/152/171/167 on the same code; zoning's own contribution is constant at 4 draws.

`fps`/`frameMs` are not reported here — under SwiftShader they are not representative (see CLAUDE.md) and
were ~0.1–0.2 fps / 300–560 ms per frame across all four, dominated by `props`' grass field rebuild
(150–480 ms of the `props.update()` cost per shot), not by zoning.

`updateMs` (2026-09-25, steady-state): **0.004 ms mean, 0.10 ms worst frame** once the EMA settles (~2 s after
ready) — well under the 1.5 ms per-module guide. Captures that read `updateMs` within the first second after
`stage()` still show 1.9–2.9 ms, which is the slow EMA (`Perf.recordModule`, α=0.05) tail of the **one-time
boundary-ribbon rebuild** (`updateOverlay`'s `rebuildLines()`, ~20 ms once) — see "Known gaps" for why that is
an edit-time cost, not the per-frame steady state, and why the r6 throttle/cheap-refresh fix is still correct.

## Known gaps (honest)

- **Habitat components (2026-09-25):** painted HABITAT cells join into one habitat through edges *and*
  corners (8-connected), and a component under **10 cells (160 m²)** gets no habitat id — it keeps its
  paint but is not listed, scored, fenced or counted until it grows. This removes the 1–3-cell
  fragments a road or river cut used to leave (critic r6: 12 habitats listed for 4 painted; measured
  after the change in the full game: 7 — the 4 named plus 3 real river/road-split pieces of 6,608,
  1,280 and 432 m²). Not done:
  a river-split habitat still becomes two habitats, and a NO_BUILD line that is only diagonally
  connected (a 1-cell staircase) would not separate two habitats.

- **Painted shapes are grid-quantised; only the drawn line is smoothed** — `paint()` only ever fills
  whole grid cells, so an organic-looking blob is really a union of cell squares. Round 3 replaced the
  shader's cell-staircase line with a traced-and-smoothed contour (Taubin + Chaikin in `boundaries.js`),
  so the boundary reads as a Cities: Skylines II-style smooth dashed curve. The smoothing is clamped to
  3.2 m of the exact partition: it can round a single-cell corner but cannot relocate a boundary. The
  physical cell grid itself is untouched — `fences.js` still places posts on the exact cell edges (a
  fence that follows the smoothed line would float off the cells it legally encloses), so up close the
  fence and the overlay line can diverge by up to ~3 m around tight corners (visible in `close`).
- **The boardwalk plank tint uses `fwidth()`-based analytic antialiasing**, not mipmapping — it stays clean
  at the showcase's camera distances (verified in `close` and the near-top-down `overlay` preset) but a
  camera far closer to grazing-angle than either preset uses could still show minor shimmer, since `fwidth`
  only estimates one pixel of derivative, not a true prefiltered footprint.
- **No full SDF clip for the boardwalk fill (2026-09-25, critic r6 #1).** The fill/plank-direction fix
  (see Rendering) is the cheap version: a floor alpha plus a 12-tap axis pick, still layered on the same
  5×5 same-region field the HABITAT/SERVICE fill uses, not a distance field rasterised from the smoothed
  boundary ribbon. Two consequences, both minor at the showcase's corridor widths and turn radii: a
  corridor that bends sharply inside one 5-cell window can show the plank seam lag the true curve by a
  cell or two, and the fill's own edge is feathered rather than clipped exactly to the ribbon (so very
  close up the fill can extend a little past the line, or fall a little short of it, at a tight corner).
  A follow-up could bake the ribbon into a distance texture and clip/orient off that instead.
- **`cover` (shrubs/rocks) has no direct query.** No module exposes shrub/boulder density at a point (only
  `props.coverAt` for tree canopy). `cover` is approximated as `0.7×rockyBiomeFraction + 0.35×shade` —
  documented as an approximation, not measured shrub cover.
- **`water` is a coarse 8-direction, 30 m ray sample**, not an exact nearest-water distance field. Fine for
  habitat scoring at this grid resolution, but a habitat with water just past a sample gap can read as 0.
- **`boundary(id)` polyline chaining is best-effort.** It walks boundary edges by shared endpoints; at a
  T-junction (a habitat that pinches to one cell width, or an inner "island" of a different zone) the walk
  can terminate a loop early and return more, shorter polylines than the true topology. `fences.js` does
  not depend on this chaining (it consumes the unchained edge list directly), so fence placement is
  unaffected — only the public `boundary()` API can look fragmented in that case.
- **No stone-wall fence variant.** The spec allows "wooden posts + wire, or stone walls near lodges"; only
  the wooden-post-and-wire kind is implemented. Every habitat gets the same fence style regardless of
  proximity to a lodge/gate building.
- **The showcase never builds an actual road**, so no preset demonstrates a real gate opening — the gate
  code path (skip the rail, raise the flanking posts near any `roads` polyline point) is exercised only
  when the `roads` module or another module's showcase/game actually threads a road through a habitat.
  Verified by reading the code path and by a synthetic check, not by a screenshot.
- **Species-set changes are batched, not instant (updated 2026-09-25, critic r6 #5).** `animal:spawned`/
  `animal:died` set a flag; the batched refresh now (a) uses a **frame-count throttle** (72 `update()`
  calls, not a 1.2 s wall-clock accumulator — the old one could fire on the very first frame under
  fast-settle, whose `dt=0.1` per step is 6× a real 60 fps frame) and (b) calls the new
  `refreshSpeciesOnly()` instead of the full `rebuildHabitats()` — it updates `species`/`quality` on every
  existing habitat from the current animal positions without re-flooding the grid, recomputing physical
  stats or rebuilding fences. Physical stats (water/shade/cover/roughness/grass/area) still do not change
  on animal spawn/death at all — only `species` and `quality` do.
  **Measured (2026-09-25):** this did not move `updateMs` in a screenshot capture — instrumented directly,
  the throttle never even fires within a ~40-`update()`-call capture window (72 > 40), and the ~2–2.9 ms
  reading in the Measured table above is actually the slow EMA (`Perf.recordModule`, α=0.05) tail of the
  **one-time boundary-ribbon rebuild** (`updateOverlay`'s `rebuildLines()`, measured directly at ~20 ms)
  that fires once after `stage()` paints the demo habitats — a real cost, but a one-time edit-time cost,
  not the per-frame steady-state cost the 1.5 ms budget is about, and not what critic r6 #5 diagnosed. The
  throttle/cheap-refresh fix is still correct and matters for a long play session with frequent animal
  spawns/deaths (the scenario the wall-clock throttle actually mis-handled), it just doesn't show up in a
  short capture. Not investigated further: whether `rebuildLines()` itself is worth speeding up is a
  separate question from what critic r6 #5 asked for.
- **`quality` on a habitat with no species present defaults to 0.6** (a neutral placeholder), not a real
  score for any particular species — call `getHabitatQuality(id, species)` for a species-specific number.
- **Stable habitat ids use a 15%-cell-overlap heuristic** against the previous flood fill, not persistent
  per-cell tracking. A habitat cut into two roughly-equal halves by a new road can occasionally hand its
  old id to the smaller half rather than the larger one.
- **`isBuildable()` checks a padded rectangle of grid cells**, not an exact rotated footprint — fine for
  axis-aligned rectangular buildings, conservative (slightly larger exclusion) for anything else.
- **No undo.** Every paint/erase/fill mutates `world.grid` immediately; there is no history stack (the
  `tools` module, if it wants one, must keep it).
