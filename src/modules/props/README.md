# props

Vegetation and natural props for the savannah: instanced grass, four procedural tree species
(umbrella thorn acacia, fever tree, baobab, dead/skeletal tree), thorn scrub, granite kopje
boulders, termite mounds and fallen logs. Owns the `props` scene group and nothing in
`world` except its own bookkeeping (grazing state, tree-cover field) — placement respects
`world.grid.occupancy` and `world.terrain.biome`/heights but never writes them.

The scatter and the grass field **follow `world.vegetation`** (P2 prerequisite, 2026-09-26): grazed,
burnt or regrown cover thins and restores the same trees, shrubs and grass tufts — see "Vegetation
grid" below. It also draws a second layer (`plants.js`) for cover **above** the natural baseline — the
P1 food-web plant catalogue (`core/Plants.js`, `docs/specs/p1-food-web.md`). See "P1 vegetation layer".

## What it looks like

| preset | screenshot | shows |
|---|---|---|
| `overview` | `tools/shots/props-overview-auto.png` | Whole savannah at 16:30: acacia groves thickening toward the river and thinning onto the open plain, kopjes with scrub, escarpment along the north edge, riverine gallery |
| `acacia` | `tools/shots/props-acacia-auto.png` | One umbrella thorn at 20 m: bare bole forking high, wide flat-topped canopy, correct silhouette |
| `grass` | `tools/shots/props-grass-auto.png` | Dry-season sward at close range: individual tufts, blade shading, macro colour drift, a kopje and acacia line on the horizon |
| `kopje` | `tools/shots/props-kopje-auto.png` | Granite boulder pile with lichen staining, thorn scrub rooted in the cracks |
| `riverine` | `tools/shots/props-riverine-auto.png` | Dense fever-tree gallery forest along the river in morning light, lime-yellow bark |
| `close` | `tools/shots/props-close-auto.png` | Ground detail: termite mound, thorn bush, fallen log, dead tree and boulder against dry grass |
| `night` | `tools/shots/props-night-auto.png` | Moonlit acacia silhouettes over grass and a kopje (very dark after `environment`'s auto-exposure ceiling was tightened from 60→4 for physical realism — see Known gaps) |
| `unburnt` | `tools/shots/after-props-unburnt.png` | Control for `burnt`: a wooded patch by the river at 14:00 with a staged uniform natural baseline, cover = natural (scatter drawn exactly as without the grid) |
| `burnt` | `tools/shots/after-props-burnt.png` | Same view, cover staged to 0 in a 60 m disc and to 35 % of natural in a ring out to 95 m: grass, fever trees, acacias and scrub gone in the disc and thinned in the ring; rocks/termite mounds/logs stay |
| `plants` | `tools/shots/props-plants-auto.png` | All 10 P1 food-web plants laid out with staged test cover (docs/specs/p1-food-web.md): four grass tussocks and the sour-plum bush/aloe row in front, umbrella thorn/knobthorn/marula/baobab spaced out behind — see "P1 vegetation layer" below |

`tools/shots/diag-noprops.png` is a controlled test with the whole `props` group hidden
(`scene.getObjectByName('props').visible = false`), used during development to prove that the
terrain-seam and horizon-line artefacts visible in earlier rounds were `terrain`'s, not this
module's — confirmed independently by the terrain builder and reassigned in `docs/STATUS.json`.

## Public API (`ctx.modules.get('props')`)

```js
scatter({ region, seed, rules, kinds, clear })
```
Populate `region` (`{x0,z0,x1,z1}`, default the whole world) using the seeded placement rules
(`RULES` in `index.js`, one per kind: acacia, fever, baobab, dead, shrub, boulder, termite, log).
`seed` forks a new RNG stream (default: the module's own `place` fork). `rules` merges per-kind
overrides, e.g. `{ acacia: { density: 1.4 } }` (density scales the sampling grid, so 2× density
is 2× the expected count, not the spacing). `kinds` restricts which species are scattered (default
all). `clear` (default `true`) removes existing props in `region` first — pass `false` to layer
more props onto an already-scattered area (used by the `kopje`/`riverine` presets). Returns the
total item count after scattering.

```js
place(kind, x, z, opts = {})
```
Place one prop. `kind` is one of `kinds()`. `opts`: `{ variant, scale, rotY, y, id }` — `variant`
picks a specific geometry variant (random if omitted), `y` overrides the terrain height sample.
Returns the new prop's id, or `null` for an unknown `kind`.

```js
remove(id)                          // → boolean, true if it existed
clear(region)                       // → count removed; region omitted clears the whole world
```

```js
coverAt(x, z)                       // → 0..1 tree/shade cover, for habitat scoring
grassDensityAt(x, z)                // → 0..1 current grazeable grass density
graze(x, z, r, amount = 0.25)       // animals eat grass in a disc; regrows in tick(). → amount eaten
```
`coverAt` is a splat of every tree's crown radius onto the 4 m zoning grid (`world.grid`), rebuilt
incrementally as trees are placed/removed. `graze` reduces a 256×256-cell grazing multiplier that
`grassDensityAt`/the grass field both read; `tick()` regrows it toward 1 at ~4.5%/game-hour,
faster nowhere in particular (uniform rate — see Known gaps).

```js
grassRatioAt(x, z)                  // → 0..1 Σ grass cover / Σ natural grass cover (bilinear over 16 m cells)
```
**How `graze()` and the food web combine.** Both are multiplicative on the biome density:
`grassDensityAt = biome/slope/moisture density × graze multiplier (props-local, 4 m cells, short-term
trampling, regrows in `tick()`) × grassRatioAt (simulation's stock)`. The rendered field uses the same
product (the graze multiplier is baked into grass chunks, the ratio is applied at pack time), so
`grassDensityAt` and what is drawn agree. `graze()` never writes `world.vegetation`; simulation's own
grazing is what moves the ratio. If `animals` ever calls `graze()` for the same herds simulation
already grazes, the effect is counted twice — callers should use one or the other.

```js
kinds()                             // → ['acacia','fever','baobab','dead','shrub','boulder','termite','log']
kindInfo(kind)                      // → { kind, type:'tree'|'prop', variants, height, crownR, hasImposter } | null
getStats()                          // → live counts + timings, see below
setGrassEnabled(v)                  // toggle the grass field (perf debugging)
refresh()                           // force a full re-pack + grass rebuild next frame
```

`getStats()` shape:
```js
{
  items, trees, props,              // placed-prop counts (props = non-tree kinds)
  grassInstances,                   // sum of the three grass LOD instance counts
  grassCounts: [lod0, lod1, lod2],
  grassChunks,                      // cached near+far grass chunks currently in memory
  instancedMeshesDrawn,             // InstancedMesh draw calls actually issued this pack
  packMs, grassRebuildMs,           // last prop-pack / grass-rebuild wall time (ms)
  vegHiddenTrees, vegHiddenShrubs,  // scatter trees / shrubs currently hidden by the vegetation grid
  vegNoBaseline,                    // grid-bound items with no woody natural cover within 80 m (drawn unconditionally)
  vegApplyMs, vegApplies,           // last vegetation-grid apply wall time (ms), applies so far
}
```

## Events

Consumed:
* `terrain:ready` — (re-)generates the macro noise field and, outside showcase mode, scatters the
  whole park once terrain has real heights/biomes.
* `terrain:modified` — re-seats every prop in the edited rect on the new height, drops any that
  are now underwater or on too steep a slope, invalidates overlapping grass chunks.
* `road:added` / `road:changed` — removes props whose position falls within the road's carriageway
  width of its centreline.
* `building:placed` — clears props in a padded footprint around the building.
* `vegetation:changed` `{x0,z0,x1,z1}` — (1) `plants.js` re-derives the above-baseline cells in the
  rect; (2) the rect is unioned into a pending rect that `update()` applies at most once per 0.5 s
  (immediately for the first apply and in the showcase): ratios for its cells (+ a 2-cell halo for the
  neighbourhood fallback), visibility of the scatter items in them, `coverAt` splat rebuilt only if an
  item flipped, and a grass repack (no chunk regeneration) only if a grass ratio moved.

Emitted:
* `props:changed { x0,z0,x1,z1 }` — after `scatter`, `place`, `remove`-driven region changes, or a
  footprint clear. Payload is the affected world-space rect.

## Presets

`overview`, `grass`, `acacia`, `kopje`, `riverine`, `close`, `night`, `plants`, `unburnt`, `burnt` — see the table above
for what each shows; full camera/tod/description data is in `showcase.js`. `stage()` calls
`terrain.generate()` first if the terrain hasn't produced features yet, reads the real kopje/river
positions to place cameras sensibly for whatever seed is active, then calls `scatter()` — so every
preset is populated by the same rules the full game uses, not hand-placed set dressing (except
`acacia`/`close`, which clear a small radius and hand-place a few props for a controlled,
readable close-up, and `plants`, see below).

## Vegetation grid (natural scatter ↔ `world.vegetation`)

simulation owns `world.vegetation.cover` and snapshots its seeded state in `.natural`. The biome
scatter + `GrassField` are the drawing of that natural state, so they now follow the grid in both
directions (no second layer, no new positions):

* **Trees/shrubs.** Each scattered item stores its vegetation cell, a ratio slot and a fixed threshold
  `u ∈ [0,1)` (hash of its position — stable across clear/re-scatter). It is drawn only while
  `ratio > u`, `ratio = clamp(cover / natural, 0, 1)` for its slot. 30 % of natural → ~30 % of the
  same trees; regrowth brings the same ones back.

  | scatter kind | slot | fallback when that slot's natural cover is 0 in the cell |
  |---|---|---|
  | acacia | `umbrella_thorn` | cell's total tree ratio → 5×5-cell (80 m) tree ratio → 80 m woody ratio → 1 |
  | baobab | `baobab` | same chain |
  | fever | cell's total tree cover (no catalogue entry) | 80 m tree ratio → 80 m woody ratio → 1 |
  | shrub | aloe + sour plum together (the scatter's generic thorn scrub is neither exactly) | 80 m shrub ratio → 80 m woody ratio → 1 |
  | dead, boulder, termite, log | never change | — |

  The neighbourhood fallback exists because simulation seeds trees sparsely (P = site × treeDensity):
  measured in the full game (seed 1) **1,586** grid-bound items sat in a cell with no woody baseline of
  their own and would have survived a fire; with the 80 m fallback that is **0** (`vegNoBaseline`).
  natural = 0 all the way out → ratio 1 → drawn as before (e.g. the showcase, where simulation isn't
  loaded; `burnt`/`unburnt` stage a baseline themselves).
* **Grass.** Per cell `Σ grass cover / Σ natural grass cover` (1 where natural is 0), sampled
  bilinearly so a burn edge fades over one 16 m cell instead of stepping. Every tuft candidate carries a
  keep threshold (`grass.js` stride slot 10, derived from already-drawn hash values so today's field is
  byte-identical) tested at **pack** time — a cover change costs a repack, never a chunk regeneration.
  While every ratio is 1 the pack loops skip the lookup (`veg.active`).
* `coverAt()` (habitat shade) drops hidden trees.
* Budget: 0 extra draw calls (hidden items are simply not packed), no per-frame allocations (the
  apply iterates `S.items` only when a throttled rect is pending). Whole-world apply measured
  1.3–5.0 ms (`vegApplyMs`, SwiftShader, 4,788 items), once at start-up and after a reseed.
* Proof: `burnt` vs `unburnt` presets, and an in-game test burn — `--game --preset close --tod 14`
  with an `--eval` that zeroes all cover in a 60 m disc at the rig target (`tools/shots/a2-game-close-14-burnt.png`
  vs `a2-game-close-14.png`): 17 trees + 46 shrubs hidden, grass gone in the disc, 0 errors.

### Measured (P2-prerequisite pass, 2026-09-26, seed 1, SwiftShader 1920×1080, same commands before/after)

| capture | draws before → after | triangles before → after | errors | `props.updateMs` / `updatePeakMs` before → after |
|---|---|---|---:|---|
| `--game --preset overview --tod 14` | 336 → 336 | 4,499,309 → 4,539,265 (+0.9 %) | 0 | 12.00 / 28.8 → 13.20 / 42.9 |
| same, 2 repeats each (stash vs tree) | 336 / 336 | 4.52–4.53 M / 4.49–4.54 M | 0 | before 13.15 / 30.3, 12.25 / 25.8 · after 12.19 / 31.5, 13.05 / 37.9 |
| `--game --preset close --tod 14` | 408 → 408 | 5,678,126 → 5,629,392 | 0 | 9.47 / 13.2 → 9.52 / 16.4 |
| `--module props --preset overview` | 134 → 134 | 3,879,710 → 3,879,710 | 0 | 0.004 / 0.1 → 0.005 / 0.1 |
| `--module props --preset acacia` | 135 → 135 | 3,495,573 → 3,495,573 | 0 | 0.008 / 0.2 → 0.004 / 0.1 |
| `--module props --preset plants` | 182 → 182 | 3,824,827 → 3,824,827 | 0 | 0.005 / 0.1 → 0 / 0 |
| `--module props --preset unburnt` / `burnt` | 145 / 145 | 3,629,956 / 2,921,842 | 0 | 0.006 / 0.1, 0.016 / 0.1 (33 trees + 96 shrubs hidden) |

Mean `updateMs` is unchanged within run-to-run noise (it is dominated by grass chunk streaming, still
in progress at capture: 90–120 pending chunks). **`updatePeakMs` on game overview was higher in all
three after-runs (31.5–42.9) than the three before-runs (25.8–30.3)**; in the game every grass ratio
is 1, so the new per-frame work is one flag test in the grass pack loop and a timer — I believe this
is SwiftShader streaming noise but have not proven it. Whole-world grid apply: 1.6–1.8 ms in game,
17–31 ms in showcase captures (measured during page start-up contention; one-shot).

## P1 vegetation layer (`world.vegetation`, `plants.js`)

Draws the P1 food-web plant catalogue (`core/Plants.js`, `docs/specs/p1-food-web.md`) from
`world.vegetation` cover — **additive** to the biome-driven `scatter()`/`GrassField` above, not
merged into them (see Known gaps for why). props only ever *reads* `world.vegetation`: it rebuilds
placement for whatever cells are in a `vegetation:changed` event's rect (plus the initial state on
init), and never writes the grid itself, anywhere outside `showcase.js`'s staged test values for the
`plants` preset (the simulation builder's real seeding/spread is on another branch and not landed
here, so the grid is all zeros in the actual game today).

| plant | form | mesh | reused generator |
|---|---|---|---|
| Red-oat grass, couch, weeping lovegrass, river sedge | grass | one shared tuft geometry, tinted per species via `instanceColor` | `grass.js: buildTuft` |
| Aloe | shrub | rosette of tapered blade cards | new (`plants.js: buildAloeGeo`) |
| Sour plum | shrub | stem + foliage-card dome | `rocks.js: buildShrub` |
| Umbrella thorn | tree | flat crown, bark+leaf | `trees.js` acacia species (same geometry/material as the regular scatter's `acacia` — it's the same tree) |
| Knobthorn | tree | wider, less-flat crown, bark+leaf | `trees.js: growCanopy/bakeBark/bakeLeafDisc`, new params; reuses `fever`'s bark and the broadleaf material |
| Marula | tree | round dome crown, bark+leaf | `trees.js: growCanopy/bakeBark/bakeLeafDisc`, new params; reuses `baobab`'s bark and the broadleaf material |
| Baobab | tree | fat lathe trunk, bark+leaf | `trees.js` baobab species (same geometry/material as the regular scatter's `baobab`) |

Placement is deterministic per 16 m vegetation cell: instance count is `round(cover × maxPerCell)`
(grass 8/cell/species, shrub 3/cell, tree 2/cell), with at least one instance whenever a cell's
cover for that plant is above a small noise floor (a flat `cover × maxPerCell` rounds to 0 almost
everywhere for a low-ceiling species like baobab, whose `maxCover` is 0.15 — see `Plants.js`).
Position within the cell, rotation and scale come from `ctx.rng.fork('plants:cell:' + cellIndex)`,
so the same cover always reproduces the same instances. Ground-conformed via `world.getHeight`.

Budget: 12 `InstancedMesh` draw calls total (grass 1, aloe 1, the five two-part species — sour
plum/umbrella thorn/knobthorn/marula/baobab — 2 each), fixed capacities (not grown dynamically,
unlike the main scatter's `ensureGroups()`), no per-frame allocations, hard-culled beyond 300 m
(no LOD tiers — see Known gaps). `rebuildRect()` (cell-record recomputation, scoped to the changed
rect) is cheap and runs immediately; the GPU repack (which also re-culls by camera distance, so it
re-runs on camera movement past the same 8 m threshold `index.js`'s own pack loop uses) is throttled
to at most once per 0.5 s of accumulated `dirty` time, per the contract.

Measured (`node tools/screenshot.mjs --module props --preset plants --w 1280 --h 720`, seed 1,
`quality=high`, SwiftShader): **182 draw calls, 3,824,827 triangles, 0 console errors** — plants
contribute at most 12 of those draw calls; the rest is the regular scatter/grass field still running
underneath. `getStats()` after settling: `plantsCells: 10` (one live cell per staged plant — the 20 m
stage spacing keeps every species in its own vegetation cell), `plantsRepackMs: 0.2`.

Regression check, before vs. after this layer was added (clean-tree baseline via `git stash`, same
capture commands):

| capture | draw calls | triangles | `modules.props.updateMs` | `updatePeakMs` |
|---|---:|---:|---:|---:|
| `props overview tod=15`, before | 134 | 3,879,710 | — | — |
| `props overview tod=15`, after | 134 | 3,879,710 | 0.008 | 0.1 |
| `--game --preset low --tod 14`, before | 381 | 5,666,767 | 10.259 | 27.4 |
| `--game --preset low --tod 14`, after | 381 | 5,813,247 | 9.967 | 14.8 |

No regression: draw calls are identical (the real game's `world.vegetation` is all zeros until the
simulation builder's seeding lands, so `plants.js` has nothing to pack there), and `updateMs`/
`updatePeakMs` are within normal SwiftShader run-to-run noise (both slightly *lower* after — the
pre-existing grass-streaming cost this module already carries, see the design notes below, dominates
either way). The small triangle delta in the `--game` row (+2.6%) is scatter/grass chunk-timing
variance between runs, not the new layer (it contributes 0 triangles when `world.vegetation` is
empty).

## Measured performance

All numbers from `node tools/screenshot.mjs --module props --preset <p> --w 1280 --h 720
--settle 15`, `quality=high`, seed 1, SwiftShader software GL. Draw calls and triangle counts are
real (renderer.info); `fps`/`frameMs` under SwiftShader are not representative of GPU performance
per project convention and are omitted here.

| preset | draw calls | triangles | console errors |
|---|---:|---:|---:|
| overview | 127 | 3,995,078 | 0 |
| acacia | 139 | 3,686,197 | 0 |
| grass | 125 | 3,727,967 | 0 |
| kopje | 137 | 3,356,559 | 0 |
| riverine | 150 | 3,979,118 | 0 |
| close | 141 | 3,671,827 | 0 |
| night | 155 | 4,259,069 | 0 |

All within the module's soft budget (≤ 400 draw calls, ≤ 3 M tris "at overview" per
`docs/specs/props.md` — triangle count runs somewhat over that at these presets, see Known gaps).
Draw calls stay in the low hundreds because everything is instanced: the grass field is exactly 3
`InstancedMesh`es (LOD0/1/2) regardless of instance count (150k–250k instances depending on
preset and camera position), and every tree/prop species+variant+LOD combination is one
`InstancedMesh` per geometry part (bark, leaf, stem…), typically 2–4 per tree species and 1–2 per
non-tree prop.

`getStats()` on the `overview` preset after settling (measured, `--eval
"__SIM__.app.registry.get('props').getStats()"` after 30 settle frames):
```
items: 5584   trees: 828   props: 4756
grassInstances: 179808   grassCounts: [15302, 92000, 72506]   grassChunks: 221
instancedMeshesDrawn: 43   packMs: 3.9   grassRebuildMs: 792
```
`packMs` (re-packing every tree/prop InstancedMesh) is well inside budget. `grassRebuildMs` is not:
792 ms for a full near+far chunk rebuild is far over the "≤ 1.5 ms avg, amortised" target. It only
runs when the camera crosses the 14 m re-pack threshold (not every frame — see Known gaps), but a
single rebuild that expensive will read as a stall if it lands on a frame the player is watching,
particularly on first load or after a large camera jump (e.g. a showcase preset switch).

## Design notes worth knowing before touching this code

* **Colour space.** `core/Textures.gpu({ srgb: true })` used to double-encode sRGB (shader-side
  encode plus an sRGB render-target format that the GPU encodes again on write), which made every
  procedural texture in the project render far too bright. This was fixed in core (see
  `CLAUDE.md` § Colour authoring). `textures.js` still carries a GLSL helper `A(vec3)` at every
  albedo call site — it is now the identity function, kept so the nine/twelve call sites stay
  legible as "this is authored linear albedo" rather than being silently unmarked. Author true
  linear values; do not reintroduce compensation.
* **Canopy shape.** The umbrella-thorn silhouette (`trees.js: bakeLeafDisc`) is built as a
  flattened-dome *volume* of foliage cards sampled uniformly over the crown's plan area (not one
  card per branch tip), plus a dedicated "roof course" of larger, near-horizontal cards laid
  directly on the crown surface — that roof course is what makes the top edge read as one level
  line instead of a spray of branch tips against the sky. Cards are then snapped partway toward
  the nearest branch tip so the foliage still visually hangs off wood. Branch geometry
  (`growCanopy`) targets points on the same crown-surface function (`y = H − depth·(r/R)^pow`) so
  skeleton and foliage agree on the crown's shape.
* **Grass LOD seams.** Grass is packed from two independently-cached chunk grids (16 m "near",
  64 m "far") into three `InstancedMesh`es by distance. Each tuft geometry variant carries a
  built-in ground-colour quad ("mat") sized so that `density × (2·mat·scaleXZ)²` is constant across
  all three LOD rings — get this wrong (as earlier rounds did) and the LOD boundary reads as a
  visible arc where coverage jumps. If you change a LOD's spacing or scale multiplier in
  `grass.js`, you must re-solve the paired `mat` constant in `buildTuft()`'s call sites (see the
  comment on `QUALITY` in `grass.js`).
* **Tuft mats + placement re-solved against terrain's photo ground (2026-09-25, critic round 4
  majors 1+2).** Terrain's ground switched to photo-derived layers after the tuft palette was
  authored, and the stale values announced themselves: every tuft's baked ground mat read as a
  hard-edged dark-olive polygon on the brighter photo sward, and the sampling lattice read as
  diagonal rows of tufts at close/mid range. Three levers moved, all verified against real-GPU
  `grass`/`close` captures (`tools/shots/fix-props-grass-v1.png`, `fix-props-close-v1.png`):
  the instance palette in `index.js` (`DRY`/`GREEN`, lifted ~30% to the photo layers' linear
  means), the mat's per-corner shade (uniform 0.86 → 0.94–1.10 mottle straddling the blade-base
  value, seeded from the same forked `ctx.rng`), and the per-candidate jitter in `_genChunk()`
  (±35% → ±46% of the cell, still a seeded hash — never `Math.random`). The mat SIZE constants
  are untouched: the coverage equation above still holds.
* **No per-sample allocation.** `grassSample()` runs on the order of 10⁵–10⁶ times per grass field
  rebuild; it and everything it calls (`biomeRowAt`, `biomeAtFast`, `cellIndexAt`, `macroAt`) write
  into shared scratch objects/arrays instead of `world.cellAt`/`world.biomeAt` (which both
  allocate). Keep it that way.
* **Lit imposters (2026-09-26, blind critics round 6+7 issue 3).** Each view (side card, top crown
  card) is baked twice: unlit albedo, and a normal + occlusion card (`imposter.js: normalBakeMaterial`):
  rgb = world normal (leaf-card normal blended 70 % toward an ellipsoid fitted to the crown's bounding
  box — raw card normals are noise at 5–20 px), a = occlusion (how far behind the crown's front surface
  along the view the visible foliage sits, × a darker underside). The billboard's shading normal comes
  from that card (side card rotated into the cylindrical billboard frame, mirrored with the instance's
  signed width), so at overview a crown has a sun side, a shadow side and darker gaps between clumps
  instead of a flat disc. Empty texels clear to an encoded +Y normal so mips don't drift toward 0.
  Same geometry, same draw calls; +2 small render targets per tree variant (9 variants).
* **Imposters are per-variant.** Each tree species bakes one billboard imposter per geometry
  variant (not one per species) and packs distant instances with a signed x-scale that mirrors
  ~half of them, so the LOD2 ring along a horizon does not repeat the same cut-out at regular
  intervals.

## Known gaps (honest)

* **Imposters still have no cast shadow and one silhouette per view.** The overview crowns now shade
  as volumes, but they don't drop a shadow on the ground (the LOD geometry does), and the crown card is
  one top-down bake, so every tree of a variant has the same outline from above (mirroring halves the
  repetition). An octahedral multi-view bake would fix the silhouette; a ground-shadow quad in the same
  draw call would fix the missing shadow. Not done.
* **Vegetation grid gaps.** (1) Dead trees, boulders, termite mounds and logs never react — a fire
  leaves them standing (by design, per the task; P2 may want charred dead trees). (2) The terrain's
  ground colour doesn't change: a burnt disc shows unburnt photo ground with no grass on it — terrain's
  job. (3) A burn is cell-granular (16 m): tree visibility steps per cell, only grass is bilinear.
  (4) Trees with no woody natural cover within 80 m are still drawn unconditionally (0 in the seed-1
  game; could be non-zero on other seeds). (5) Fever trees and shrubs use aggregate slots, not a
  catalogue plant. (6) `plants.js` still draws its own individuals for cover above natural, placed
  independently of the scatter, so regrowth *above* the baseline adds new trees at new positions.
* **Integration with the simulation's seeding (integrator, 2026-09-26).** Once `simulation` seeded
  natural cover across the whole map, this additive layer redrew what the biome scatter already
  draws: game `close` 14 h went from 4.99 M to 12.6 M triangles and read as closed-canopy forest with
  trunk-only baobabs. Fixed by drawing only cover **above** `world.vegetation.natural` (the seeded
  snapshot, written by simulation) and by guaranteeing an individual only at ≥ ½ of a plant's
  `maxCover`, so slow natural regrowth stays probabilistic. Re-measured: `close` 14 h 408 draws /
  5.04 M tris, `overview` 14 h 336 / 4.48 M, 0 errors; the park's demo planting shows 20 plant cells.
  Grazing/burning **below** the natural baseline is now drawn by the scatter itself (see "Vegetation
  grid"); above it is still `plants.js`'s additive layer.

* **Triangle budget.** The spec's "≤ 3 M tris at overview" is exceeded (≈ 4.0 M measured). The
  grass field is the largest contributor (3 draw calls but up to ~250k instances × ~40–70 tris per
  tuft including the ground mat). Reducing segment count on the LOD1/LOD2 tuft geometries or
  capping instance counts harder at `quality=high` would bring this in line; not done because the
  visual density it buys was explicitly requested in review and the draw-call budget (≤ 400) has
  large headroom (127–155 measured).
* **Grass rebuild used to be far over the `update()` budget — now amortised (FIXED).** A camera jump
  past the 14 m re-pack threshold used to synchronously generate every not-yet-cached chunk in range
  in one `rebuild()` call: critic round 3 measured 132–263 ms on every preset (90–175× the
  ARCHITECTURE ≤ 1.5 ms/frame target), and — because a showcase preset switch IS such a threshold
  crossing — this fired on literally every preset load, not as a rare edge case. `grass.js`'s
  `update()` now queues only the chunks actually missing for the new view (`_queueMissing`, closest
  first) and generates a time/count-bounded slice per call (`_drainQueue`, ~3 ms / ≤24 chunks);
  `_repack()` packs whatever is currently cached each call, silently skipping chunks still queued, so
  the field visibly grows in over a couple of seconds on a big jump instead of freezing for one.
  Measured with a 424 m `lookAt` jump in the live game (`--game` mode, not the showcase): the queued
  205 chunks drained at 6–17 ms per frame instead of one 450+ ms frame — still above the strict
  1.5 ms target on a still-streaming frame, but no longer a single catastrophic stall, and normal
  small pans (a handful of ring-edge chunks) complete in one frame well under budget. Two cases
  intentionally still drain the WHOLE queue synchronously, matching the old behaviour on purpose: the
  very first population after a fresh load (a one-time "loading" cost, not the repeated-jump stutter
  this amortises) and every update in the showcase (`ctx.isShowcase`), which is a one-shot static
  render for screenshots/critics, not live gameplay — there is no frame to protect, and the tooling
  expects a fully-populated field on capture. `packMs` (re-packing tree/prop `InstancedMesh`es) is a
  separate, unrelated stat and is fine at ~4 ms. Not fixed in this pass: the packing step itself
  (`_repack`) still scans every cached candidate in view on every qualifying call, uncapped, and its
  cost visibly grows as more chunks stream in (measured up to ~10 ms once several hundred chunks were
  cached) — amortizing that too would be the natural next step if per-frame cost during a big jump
  still needs tightening further.
* **Grazing regrowth has no spatial variation.** `tick()` regrows every grazed grid cell at the
  same flat rate; a real savannah regrows faster near water. `docs/specs/props.md` does not
  require this, but it would be a natural follow-up once `animals` is actually calling `graze()`.
* **No wind gust variation between grass and trees.** Both use `ctx.materials.withWind` off the
  same global time/direction uniform, which is correct, but grass and tree canopies always sway in
  perfect phase-lock at the same frequency scaled differently — real grass and canopy foliage have
  different response frequencies to gusts. Would need a second wind uniform set in `Materials.js`
  (a core change) to fix properly.
* **`fever` and `baobab` biome rules were tuned by eye against one seed (1).** They read correctly
  for that seed's river/kopje layout (see `riverine` preset) but have not been checked against a
  wide sweep of seeds; a very different river geometry could produce too little/too much riverine
  gallery.
* **Species list is short of the full spec.** `docs/specs/props.md` asks for sausage tree, doum
  palm, candelabra euphorbia and marula in addition to what's built. Acacia, fever tree, baobab and
  dead tree were prioritised as the four with the most silhouette impact per the module brief's
  emphasis on grass + acacia; the other three (not marula — see the P1 vegetation layer above,
  which does have a marula generator, just not wired into the base `scatter()`/`RULES`) are not
  implemented. `anthills` and `bones` (also named in the spec) are not implemented either —
  `termite` mounds cover the anthill role visually but are not a distinct smaller prop.
* **`graze()`'s `regrowAcc`/`grazeRect` bookkeeping only invalidates grass chunks every ~2 game
  hours**, batching grass-visual regrowth rather than updating it continuously; grass density
  values read through `grassDensityAt`/habitat scoring update immediately, only the *rendered*
  tuft density lags by up to that batching window.
* **`night` preset reads as near-black.** After `environment`'s auto-exposure ceiling was lowered
  from 60 to 4 (a deliberate realism fix on their side — unbounded exposure was making every dark
  scene artificially bright), a true moonless-adjacent 21:30 scene renders close to black on an
  SDR screenshot, same as it would with a real camera at that light level with no night-vision
  gain. Props' own tree/grass colours are unchanged and correct (verified by comparing to the
  `acacia`/`overview` daytime shots, which are unaffected). Not treated as a props bug; noted here
  so a critic scoring the `night` screenshot on visibility alone has the context.
* **No LOD2 (billboard) tier for non-tree props.** Boulders, termite mounds, shrubs and logs have
  LOD0/LOD1 only (`PROP_CULL` hard-cuts them beyond a fixed radius instead of falling back to an
  impostor); acceptable given their much lower crown/triangle cost relative to trees, but a
  boulder-heavy kopje scene at long range gets a harder pop than trees do.

### P1 vegetation layer (`plants.js`) known gaps

* **Additive above the baseline only.** Below the natural baseline the scatter/grass now follow the
  grid (see "Vegetation grid"); above it this layer still draws independently. The spec allows this ("if too invasive,
  draw additively and document why"). Both existing systems are tuned, critic-passed, and keyed on
  biome/macro-noise rather than per-plant cover; re-deriving grass tuft density or tree placement
  from `world.vegetation` inside `RULES`/`grassSample()` — while also keeping the existing look
  those systems were scored on — was judged too large a change for this wave. The two layers can
  currently place a `world.vegetation` tree and a `RULES`-scattered acacia within metres of each
  other; not addressed here.
* **Single LOD, hard 300 m cull, no billboards.** Unlike the main scatter (imposters past ~330 m)
  or grass (three LOD rings), the P1 layer draws one quality level and simply stops drawing past
  300 m — satisfies the letter of "LOD beyond 300 m" (nothing draws past it) but not really its
  intent (no falloff). Not a problem yet: `world.vegetation` is all zeros in the real game until
  the simulation builder's seeding/spread lands, so there is nothing to cull today.
* **Fixed, ungrown `InstancedMesh` capacities** (grass 8000, aloe/sour-plum/tree species 150–400 —
  see `CAPS` in `plants.js`), unlike the main scatter's `ensureGroups()` which grows on demand.
  Sized for plausible cover densities; a world with sustained high cover for every plant type in
  every cell simultaneously (not realistic given the catalogue's `maxCover` ceilings, but not
  impossible) would silently drop instances past the cap rather than grow to fit, same failure mode
  as any other capped `InstancedMesh` in this file.
* **Knobthorn and marula reuse existing bark/leaf textures** (fever's bark + the broadleaf material
  for both) rather than getting their own — only their skeleton geometry (crown shape, trunk
  proportions) is species-specific. Umbrella thorn and baobab are the real thing (literally the same
  geometry/material as the main scatter's `acacia`/`baobab`), so 2 of 4 tree species in this layer
  have bespoke textures and 2 don't.
* **Per-cell jitter spans the whole 16 m cell**, so an instance can render up to ~11 m from its
  cell's centre. Fine for gameplay (cover is what's authoritative, not exact position), but it
  means the `plants` showcase preset's staged test cells need to be spaced well apart (≥ 20 m, see
  `PLANT_STAGE_OFFSETS` in `showcase.js`) so two adjacent staged species can't jitter into visually
  overlapping/occluding each other — found during development when a first, tighter layout (13 m
  spacing) intermittently hid the aloe and one tree behind their neighbours.
* **Density-to-instance-count is a flat heuristic**, not derived from the spec's real ecology
  (`spread`/`food`/hectare terms belong to `simulation`, not `props`). `round(cover × maxPerCell)`
  with a floor of 1 instance for any non-trivial cover is a placeholder that looks reasonable at the
  cover values used for staging; it has not been tuned against real simulation-seeded cover (that
  data doesn't exist on this branch yet).
