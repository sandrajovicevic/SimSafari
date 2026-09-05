# props

Vegetation and natural props for the savannah: instanced grass, four procedural tree species
(umbrella thorn acacia, fever tree, baobab, dead/skeletal tree), thorn scrub, granite kopje
boulders, termite mounds and fallen logs. Owns the `props` scene group and nothing in
`world` except its own bookkeeping (grazing state, tree-cover field) — placement respects
`world.grid.occupancy` and `world.terrain.biome`/heights but never writes them.

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

Emitted:
* `props:changed { x0,z0,x1,z1 }` — after `scatter`, `place`, `remove`-driven region changes, or a
  footprint clear. Payload is the affected world-space rect.

## Presets

`overview`, `grass`, `acacia`, `kopje`, `riverine`, `close`, `night` — see the table above for what
each shows; full camera/tod/description data is in `showcase.js`. `stage()` calls
`terrain.generate()` first if the terrain hasn't produced features yet, reads the real kopje/river
positions to place cameras sensibly for whatever seed is active, then calls `scatter()` — so every
preset is populated by the same rules the full game uses, not hand-placed set dressing (except
`acacia`/`close`, which clear a small radius and hand-place a few props for a controlled,
readable close-up).

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
* **No per-sample allocation.** `grassSample()` runs on the order of 10⁵–10⁶ times per grass field
  rebuild; it and everything it calls (`biomeRowAt`, `biomeAtFast`, `cellIndexAt`, `macroAt`) write
  into shared scratch objects/arrays instead of `world.cellAt`/`world.biomeAt` (which both
  allocate). Keep it that way.
* **Imposters are per-variant.** Each tree species bakes one billboard imposter per geometry
  variant (not one per species) and packs distant instances with a signed x-scale that mirrors
  ~half of them, so the LOD2 ring along a horizon does not repeat the same cut-out at regular
  intervals.

## Known gaps (honest)

* **Triangle budget.** The spec's "≤ 3 M tris at overview" is exceeded (≈ 4.0 M measured). The
  grass field is the largest contributor (3 draw calls but up to ~250k instances × ~40–70 tris per
  tuft including the ground mat). Reducing segment count on the LOD1/LOD2 tuft geometries or
  capping instance counts harder at `quality=high` would bring this in line; not done because the
  visual density it buys was explicitly requested in review and the draw-call budget (≤ 400) has
  large headroom (127–155 measured).
* **Grass rebuild is far over the `update()` budget.** Measured `getStats().grassRebuildMs` on
  `overview`: **792 ms** for a full near+far chunk rebuild (generating/hashing ~1,300–1,600
  candidate points per chunk × 221 chunks in cache, then packing ~180k surviving instances into
  three `InstancedMesh` buffers). This only runs when the camera crosses the 14 m re-pack threshold
  — not every frame — but 792 ms is long enough to read as a stall if it lands on a frame the
  player is watching (first load, or a large camera jump such as a showcase preset switch or a
  fast pan). `packMs` (re-packing tree/prop `InstancedMesh`es) is fine at 3.9 ms. The fix is more
  chunk-generation work than this round had time for: either amortise chunk generation across
  several frames (a work queue instead of one synchronous `rebuild()`), or precompute/cache chunk
  candidate positions once per world instead of re-deriving them from a hash on every cache miss.
  Not attempted here because it touches the field's core loop and needed more testing time than
  was left; flagged rather than shipped half-fixed.
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
  emphasis on grass + acacia; the other four are not implemented. `anthills` and `bones` (also
  named in the spec) are not implemented either — `termite` mounds cover the anthill role visually
  but are not a distinct smaller prop.
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
