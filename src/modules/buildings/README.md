# buildings

Owner of `world.buildings` and the `BUILDING` cells of `world.grid.occupancy`.

Everything the park can construct: the entrance gate and ticket office, the safari lodge, tented camp
units, the restaurant boma, gift shop, ranger station, veterinary clinic, workshop, hides, viewing
tower, windpump and trough, feeding station, staff village houses, toilets, car park and fence gates.

## How it renders in so few draw calls

Every opaque surface in the module — thatch, sawn timber, weathered poles, coursed rubble stone,
limewashed plaster, corrugated iron, tent canvas, concrete, split reed and painted steel — lives in
**one pair of `DataArrayTexture`s** (`textures.js`): RGB+metalness and normal.xy+roughness+AO, ten
512² layers each, generated on the GPU through `ctx.textures.gpu()`. Geometry carries a per-vertex
`aLayer` index and `material.js` extends `MeshStandardMaterial` through `onBeforeCompile` to sample
the arrays instead of `map` / `normalMap` / `roughnessMap` / `metalnessMap` / `aoMap`, keeping
three's lights, shadows, fog and envMap intact. That is the same idiom `terrain` uses for its splat
layers.

So one building type = **one opaque draw call**, plus at most two small extras:

| bucket | material | used by |
|---|---|---|
| `opaque` | array material (10 surfaces) | every type |
| `glow` | window panes + lamp globes; vertex colour is the *emissive* tint, ramped by time of day | most types |
| `shiny` | pool / trough water and photovoltaic glass | lodge, pump, ranger |
| `sign` | the carved park-name board (2D canvas texture) | gate, shop |

Each type is modelled **once** into that set of merged geometries and drawn with `InstancedMesh`, so
twenty staff houses cost exactly what one costs.

UVs are always **world metres ÷ a per-family tile size** (`TILE` in `textures.js`), so texel density
is identical on a 0.14 m post and a 12 m wall.

### Thatch

`thatch.js` builds a real makuti roof rather than a smooth cone: a lofted surface from an eave
polygon to a ridge polyline, noise-displaced so it undulates, plus discrete **course lips** whose
lower edge is displaced per column (no two straws end at the same height), a fat ragged eave course
and a rolled ridge capping. `hipOutline()` gives hipped rectangular roofs, `coneOutline()` gives
rondavel cones. Roofs you can stand under get an `underside` surface in the reed layer.

## Colour

Albedo constants in `textures.js` are **true linear** values. The core sRGB double-encode bug is
fixed, so nothing here is darkened to compensate for tone mapping. Thatch is a golden brown
(linear ≈ 0.33/0.21/0.08 → sRGB ≈ 0.61/0.50/0.31), timber a warm mid brown, stone a mid grey.
The arrays are written with an explicit `linearToSRGBv()` into a `NoColorSpace` target — one encode —
and decoded in the shader.

## Public API — `ctx.modules.get('buildings')`

```js
catalogue()                              // → [{ key, name, category, desc, w, d, height, cost,
                                         //     upkeep, staff, capacity, appeal, beds, houses, jobs,
                                         //     rules:{ roadAccess, maxSlope, allowWater, zone, flatten } }]
getType(type)                            // → one catalogue row, or null
types()                                  // → ['gate','lodge','tent',…]

canPlace(type, x, z, rot = 0, opts = {}) // → { ok:boolean, reasons:string[] }
                                         //   reasons: 'unknown-type' | 'out-of-bounds' | 'water' |
                                         //   'too-steep' | 'occupied' | 'no-road-access' | 'wrong-zone'
                                         //   opts: { ignoreOccupancy, ignoreRoads }
place(type, x, z, rot = 0, opts = {})    // → id | null. opts: { force, flatten, ignoreRoads,
                                         //   ignoreOccupancy }. Flattens the terrain under the
                                         //   footprint via terrain.flatten() when that module is up.
remove(id)                               // → boolean
clear()                                  // remove every building

get(id)                                  // → record | null
list(type?)                              // → record[]
count(type?)                             // → number
findNearest(type, x, z)                  // → record & { distance } | null  (type null = any type)

preview(type, x, z, rot = 0, valid = true) // ghost mesh for the build tool; preview(null) hides it
setState(id, { staff, visitors, state })   // → boolean

heightOf(type)                           // → metres from the ground to the top of the silhouette
setParkName(name) / getParkName()        // the carved gate sign; setting it rebuilds the texture
stats()                                  // → { drawCalls, triangles, buildings, types }
group                                    // the module's THREE.Group
```

A record is `{ id, type, x, z, y, rot, w, d, state, staff, visitors, cost, upkeep, capacity }` and is
the same object stored in `world.buildings`.

### Events

| event | direction | payload |
|---|---|---|
| `building:placed` | emitted | `{ id, type, x, z, rot }` |
| `building:removed` | emitted | `{ id, type }` |
| `time:set` | consumed | re-evaluates the night factor (lit windows, lanterns, lamp lights) |

### World state written

* `world.buildings` — `Map<id, record>`
* `world.grid.occupancy` — footprint cells set to `OCC.BUILDING` on place, back to `OCC.FREE` on remove
  (`world.grid.version` bumped)
* terrain heights, indirectly, through `terrain.flatten()` under each footprint

### Modules consumed (all optional, all null-checked)

`terrain` (`generate`, `flatten`, `getFeatures`, `getWaterLevelAt`, `isWaterAt`) ·
`roads` (`addRoad`, `clear`, `nearestEdge` for the road-access rule) ·
`props` (`scatter`, `clear` — so the showcase is not on bare dirt) ·
`environment` (`setWeather`)

## Catalogue

16 types: `gate` `lodge` `tent` `restaurant` `shop` `ranger` `clinic` `workshop` `hide` `tower`
`pump` `feeder` `house` `toilets` `parking` `fencegate`. Footprint, cost, upkeep, staff, capacity,
visitor appeal and placement rules per type are in `catalogue.js`.

## Presets

| preset | tod | what it shows |
|---|---|---|
| `overview` | 16 | the whole lodge complex from the south-west: gate, lodge, restaurant, shop, ranger, workshop, clinic, tower, hide, pump, tented camp, staff village |
| `lodge` | 17.5 | the safari lodge close: thatch, poles, plinth, deck, pool |
| `gate` | 10 | entrance piers, lintel, park-name board, ticket kiosk, boom |
| `close` | 16.5 | the veranda-to-terrace stair: timber posts on stone footings, deck and stair planking, railings, stone terrace paving, plastered back wall with clerestory windows |
| `hide` | 8 | the hide on stilts: pole legs, plank deck, reed screen walls, thatch roof with exposed rafter tails |
| `night` | 21.5 | the lodge veranda at night: lantern glow on the thatch underside and timber poles, an emissive window, stars overhead |

`stage()` generates the terrain, sets the weather, lays a gravel approach road through the gate,
scatters props, picks a dry open site with `findSite()` (below), then builds the complex through the
module's own `place()`.

### Site selection (`findSite()` in showcase.js)

The showcase terrain has one river (an ~85 m meander that crosses most of the 1024 m map diagonally),
three kopjes and two pans. A handful of hand-picked anchor points for the complex proved unreliable —
measured 0 hits out of 240 candidates on one run — because the river alone crosses close enough to
most of the map that an unlucky anchor list can come back completely empty. `findSite()` instead scans
a uniform grid over the whole buildable area and, for each candidate, samples 9 points across the
complex's real footprint (its bounding box from every building offset used below) rejecting any that
land on rock/wetland/riverbed biome or too close to the water table, then scores the survivors by
average slope. `stage()`'s `put()` helper additionally nudges a single building toward the site centre,
then spirals around its own spot, before giving up and forcing a placement — so an isolated bad patch
inside an otherwise good site doesn't need forcing either.

## Measured

Numbers below are from `tools/shots/buildings-*.json` (SwiftShader software GL, `quality=high`,
1920×1080 for `overview`, 1280×720 for the rest — full frame includes terrain, props, environment
and buildings together; `fps` under SwiftShader is not representative, per `CLAUDE.md`).
The buildings-only row comes from `ctx.modules.get('buildings').stats()`.

| preset | resolution | draw calls (frame) | triangles (frame) | console errors |
|---|---|---|---|---|
| overview | 1920×1080 | 296 | 4,260,251 | 0 |
| lodge | 1280×720 | 276 | 3,847,968 | 0 |
| gate | 1280×720 | 257 | 4,059,583 | 0 |
| close | 1280×720 | 280 | 3,751,873 | 0 |
| hide | 1280×720 | 275 | 3,677,968 | 0 |
| night | 1280×720 | 280 | 3,739,065 | 0 |

**Buildings-only** (`api.stats()` at the `overview` site, 25 buildings across all 16 types):
**34 draw calls, 131,730 triangles** — well inside the spec's ≤ 60 draw calls / ≤ 400 k triangles
budget for the complex. The ~260–300 draw calls and ~3.7–4.3 M triangles above are the **whole
frame** — terrain's chunked splat mesh and props' instanced trees/grass account for the large
majority of both; they are those modules' budgets, not this one's (ARCHITECTURE.md §7 sets terrain's
soft cap at 64 draw calls and props' at 400, against a 1500 total).

## Known gaps

* **`findSite()` cannot always give every building perfectly flat ground.** The showcase's dense
  `canPlace()` slope check (9 points across each footprint, pre-flatten) occasionally still rejects
  one or two of the ~25 placed buildings even inside a good site, because real savannah terrain
  varies locally more than a single average-slope score captures. `put()` nudges the building toward
  the site centre and then spirals around its own spot before giving up; in the current seed this
  still forces exactly 2 of 25 placements (both `too-steep`, never `water`) — visually they read as
  slightly less levelled than their neighbours since `terrain.flatten()` still runs, but nothing
  floats or clips into the ground.
* **No LOD.** Every building instance renders at full detail regardless of camera distance.
  ARCHITECTURE.md §7 requires LOD beyond 300 m; at the showcase's scale this has not yet mattered
  (buildings cluster within ~250 m of the camera in every preset) but a full park with buildings
  scattered across the 1024 m map would want one.
* **`preview()` ghost mesh has no rotation/placement snapping** beyond whatever the caller passes as
  `rot` — the build tool (not yet built, per the wave plan) will need to add its own angle-snap UX.
  `preview()` itself works: pass a type/x/z/rot/valid and it recolours green/red.
  `preview()` also draws only the `opaque` bucket geometry (a merged silhouette), not glow/shiny/sign,
  so a ghost lodge shows no window glass — acceptable for a placement ghost, listed for honesty.
* **Windpump rotor has no wind-driven speed variation beyond a single scalar** — `update()` scales
  spin speed by `world.weather.wind.speed / 3` clamped to `[0, 2]`, so gusts read as a smooth speed
  change, not individual gust impulses.
  Fixed in this pass: the rotor blades/hub were originally authored at local-origin coordinates while
  the spinner pivot was the mast-top world position, so the whole assembly briefly orbited around a
  point far from the mast instead of spinning in place — the blade and hub geometry is now offset to
  the pivot's coordinates before the spinner transform is applied (see the comment in `buildPump()`
  in `builders.js`).
* **Zone rule is defined but not enforced.** Every catalogue entry sets `rules.zone: null`, so
  `canPlace()`'s zone check never actually triggers; `zoning` (a parallel-wave module) is not yet
  built to paint `world.grid.zone`, so there is nothing meaningful to check against yet.
  `canPlace()` already reads `world.grid.zone` correctly and will start enforcing this the moment
  a catalogue entry's `rules.zone` is set to a real zone id.
* **Fence gate, feeder, toilets and parking are not shown in any preset close-up** — only from the
  `overview` distance. They were modelled and are placed in the showcase (visible, small, in the
  overview frame) but did not get a dedicated detail shot; time went to the priority three (lodge,
  gate, hide) plus the showcase-wide site-finding fix instead.
* **The park sign texture is a single fixed size (1024×256) canvas** re-drawn whenever
  `setParkName()` is called; very long park names shrink to fit down to a 20px floor rather than
  wrapping to a second line.
* **No interior geometry.** Doors and windows are openings with glass/timber trim, not navigable
  interiors — there is nothing to see through a window but the glow material's flat colour (day) or
  emissive tint (night). Consistent with every other built module at this stage of the project.
* **This module's showcase depends on terrain's savannah generator for its river/pan/kopje layout**
  (via `terrain.getFeatures()`); if terrain changes that layout's scale or feature counts materially,
  `findSite()`'s scan resolution (40 m grid step, 9-point per-candidate check) may need retuning —
  it is a general-purpose search, not hardcoded to specific coordinates, but has only been validated
  against the current savannah generator's output.
