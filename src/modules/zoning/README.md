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
- `overlay.js` — the ground overlay decal (mesh + shader + live data texture).
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

- **Overlay** (`overlay.js`, 1 draw call): a terrain-conforming mesh (128×128 quads, heights baked from
  `world.getHeight`, rebuilt on `terrain:modified`) with a live `DataTexture` (R=zone id, G/B=habitatId
  lo/hi byte) sampled per-fragment. The shader tints HABITAT/VISITOR/SERVICE fills, traces a soft
  anti-aliased line at every zone/habitat boundary (metre-accurate regardless of mesh resolution) with an
  animated world-space "marching ants" dash, and adds a plank-line tint inside VISITOR cells for the
  boardwalk read. NONE and NO_BUILD never fill (see "Zone semantics" for why NO_BUILD staying invisible
  matters — it covers every road and river on the map).
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

zoning's own group holds exactly 3 draw calls regardless of preset (1 overlay mesh + 2 fence
`InstancedMesh`es for posts/rails — no per-habitat multiplication), well under the 20-call spec budget
(overlay 1–2, fences ≤6). Figures below are for the **whole scene** (terrain + props + animals + roads +
zoning together, as the screenshot tool reports) since that is what actually renders in the showcase.

| preset | draw calls (scene) | triangles (scene) | console errors |
|---|---|---|---|
| `overview` | 150 | 4,045,072 | 0 |
| `close` | 140 | 3,971,880 | 0 |
| `overlay` | 158 | 4,021,607 | 0 |
| `night` | 154 | 4,299,376 | 0 |

`fps`/`frameMs` are not reported here — under SwiftShader they are not representative (see CLAUDE.md) and
were ~0.1–0.2 fps / 300–560 ms per frame across all four, dominated by `props`' grass field rebuild
(150–480 ms of the `props.update()` cost per shot), not by zoning.

## Known gaps (honest)

- **Habitat outlines are grid-quantised (a 4 m staircase), not a smooth curve** — `paint()` only ever fills
  whole grid cells, so an organic-looking blob is really a union of cell squares. The overlay shader draws
  a bold, soft-edged, animated dashed line to make that boundary read as *intentionally drawn* rather than
  jagged (this replaced an earlier pass where the line was only a faint 0.6 m antialiasing band, which at
  in-game camera distances just looked like a hard/blocky cell edge with no visible dash — screenshotted,
  caught, and fixed by widening the line to 1.4 m and pushing it to a bright gold at up to full alpha).
  The underlying cell-grid shape itself, however, is not smoothed and will not be — that is the real shape
  of what was painted, matching Cities: Skylines II's own zoning grid.
- **The boardwalk plank tint uses `fwidth()`-based analytic antialiasing**, not mipmapping — it stays clean
  at the showcase's camera distances (verified in `close` and the near-top-down `overlay` preset) but a
  camera far closer to grazing-angle than either preset uses could still show minor shimmer, since `fwidth`
  only estimates one pixel of derivative, not a true prefiltered footprint.
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
- **Species-set changes are batched, not instant.** `animal:spawned`/`animal:died` set a flag; the next
  full `rebuildHabitats()` (which recomputes `species` and `quality`) happens up to ~1.2 s later, not on
  the same frame. Physical stats (water/shade/cover/roughness/grass/area) do not change on animal
  spawn/death at all — only `species` and `quality` do.
- **`quality` on a habitat with no species present defaults to 0.6** (a neutral placeholder), not a real
  score for any particular species — call `getHabitatQuality(id, species)` for a species-specific number.
- **Stable habitat ids use a 15%-cell-overlap heuristic** against the previous flood fill, not persistent
  per-cell tracking. A habitat cut into two roughly-equal halves by a new road can occasionally hand its
  old id to the smaller half rather than the larger one.
- **`isBuildable()` checks a padded rectangle of grid cells**, not an exact rotated footprint — fine for
  axis-aligned rectangular buildings, conservative (slightly larger exclusion) for anything else.
- **No undo.** Every paint/erase/fill mutates `world.grid` immediately; there is no history stack (the
  `tools` module, if it wants one, must keep it).
