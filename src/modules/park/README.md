# park

DEMO (wave 3). The complete playable demo park — a running game state built through every other
module's public API, not hand-placed set dressing. This is what the whole-game critic and the
gameplay-fidelity checklist judge against. Owns nothing in `world` itself (no `world.park`); it only
calls the APIs of `terrain`, `roads`, `zoning`, `buildings`, `props`, `animals`, `traffic` and
`simulation`, each of which owns and writes its own part of `world` as documented in its own README.

## What it builds

Per `docs/specs/park.md`, `buildPark()` (`build.js`) lays out, on whatever terrain the current seed
generated:

* An **entrance gate** near the south edge (world convention: `z+ = south`, per
  `terrain/generate.js`), connected by a **paved road** to a **lodge complex** — lodge, restaurant,
  gift shop, ranger station, car park — all sited with the same spiral-search-around-an-anchor
  pattern `buildings`' own showcase uses (`buildings.canPlace()` is the ground truth; a forced
  placement is a last resort, never silent).
* A **gravel loop road** built as six hand-nudged segments (so every vertex is a real graph node,
  not just a spline control point) around the park interior, plus **two dirt spurs** branching off
  the loop to the two habitats real safari roads wouldn't run a graded gravel loop straight through:
  the pride kopje and the river.
* **Four fenced habitats** (`zoning.paint`, several overlapping discs per habitat for an organic
  boundary — real fences and gates appear automatically wherever a road crosses, per `zoning`'s own
  boundary-edge gate detection):
  * **Plains** — zebra, wildebeest, impala — sited at one loop vertex chosen for being the *most
    open* (farthest from any kopje/river/pan) of the six.
  * **Acacia Woodland** (browsers) — giraffe, elephant — the second-most-open loop vertex; the
    browsers' own patch gets an extra, denser acacia pass (`props.scatter` with `acacia.density:1.6`
    layered on top of the base scatter, `clear:false`) so "browsers ... with acacias" is literally
    true, not just incidentally likely.
  * **Pride Kopje** (predators) — lions — centred on the largest kopje `terrain.getFeatures()`
    reports for the active seed, reached by a dirt spur off the loop vertex nearest that kopje.
  * **River Wetland** — hippo, buffalo — centred beside (not inside) the river channel, at whichever
    bank is dry ground, reached by the second dirt spur.
* **Two hides and a viewing tower** at the wetland, the plains and the pride kopje respectively,
  placed the same spiral-search way as every other building.
* **Props scattered by biome** — the base game scatters automatically via `props`' own
  `terrain:ready` listener; the showcase path calls `props.scatter({})` explicitly (that listener is
  gated on `!ctx.isShowcase`, so a lone `?module=park` run would otherwise be bare ground).
* **Four safari vehicles on tour** (`traffic.startTour({from, stops, durationHours: 4})`), routed from
  the gate to different combinations of the four habitats via real graph node ids.
* **Simulation at speed 1** (`ctx.app.setSpeed(1)`) with the economy left at its untouched, sane
  defaults (`world.economy`: $250,000 cash, $25 ticket price — this module places buildings/animals
  through each module's raw API, the same way every other builder's showcase does, which has no cost
  side effect; only the player's `tools` module charges for construction).
* `ui` and `audio` need nothing from this module — `ui` shows itself whenever it isn't showcasing a
  *different* module (so it's visible in the full game and hidden in `?module=park`, per spec), and
  `audio`'s ambience runs unconditionally once the engine is unlocked by a user gesture.

## Public API — `ctx.modules.get('park')`

```js
loadDemo() → Promise<report>
// Clears any prior park-owned state (clearPark()) and builds the demo on the world's CURRENT seed.
// Idempotent — safe to call again. This is what runs automatically on core:ready in the full game.

newGame(seed) → Promise<report>
// Clears prior state, and if `seed` differs from world.seed, reseeds terrain (see Known gaps for
// what this does and does not reseed), then builds the demo exactly as loadDemo() does.

isBuilt() → boolean
```

`report` (also returned internally to the showcase, and usable for debugging):
```js
{
  gate: {x,z,nodeId}, lodgeSite: {x,z,nodeId},
  habitats: { plains|browsers|predators|wetland: {id,name,x,z,radius} },
  buildings: { gate|lodge|restaurant|shop|ranger|parking|hideWetland|hidePlains|tower: {id,x,z,forced} },
  animals: { plains|browsers|predators|wetland: <count spawned> },
  vehicles: [vehicleId, ...],   // the four tour vehicles
  roads: <roads.stats() at build time>,
  economy: {...world.economy at build time},
  warnings: [ "<module> absent: ..." ],   // when an optional dependency wasn't loaded
}
```

## Registering as the default game start

`index.js`'s `init()` checks `!ctx.isShowcase` (true exactly when there is no `?module=` — i.e. the
full game) and, if so, registers a **one-shot** `core:ready` listener that calls `api.loadDemo()`.
There is no save/load system anywhere in this project (checked: no `localStorage`, no save API in
`src/`), so "no save exists" is unconditionally true today and the demo always becomes the default
start. `park` lists every module it composes as `optional`, which puts it last in the registry's
topological init order — every other module is already initialised by the time `park.init()` itself
runs — but `core:ready` is still the documented, explicit hook per `docs/specs/park.md`, rather than
relying on init order alone.

No core change was needed: the registry discovers every `src/modules/*/index.js` by glob
(`ModuleRegistry.available`), and the full-game path (`App.start()` with no `?module=`) already loads
every discovered module — `park` is simply one more of them. `docs/requests/park.md` was not created;
there was nothing to ask the integrator for.

## Presets (`showcase.js`)

Each preset calls the *same* `buildPark()` used by `loadDemo()`/`newGame()` (a fresh page load per
screenshot, per `tools/screenshot.mjs`'s own design — no cross-preset state to manage), then
re-anchors its camera onto whatever actually got placed for the active seed, following the same
"mutate the exported `presets` object in place before core reads it" idiom `terrain/showcase.js` uses.

| preset | tod | what it demonstrates |
|---|---|---|
| `overview` | 15 | the whole park: entrance + lodge complex south, gravel loop with two dirt spurs, four fenced habitats |
| `gate` | 9 | the entrance gate at morning opening, safari trucks on the paved approach |
| `lodge` | 17.5 | the lodge complex at golden hour: lodge, restaurant, shop, ranger station, car park |
| `habitat` | 16 | the plains-grazer habitat: zebra/wildebeest/impala behind the fence, a hide at the boundary |
| `tour` | 16.5 | a safari truck beside the pride kopje habitat (see Known gaps re: the one extra showcase-only vehicle) |
| `close` | 16.5 | the lodge veranda close: thatch, timber, stone plinth, pool |
| `night` | 21.5 | the lodge lit at night |

## Gameplay-loop verification (measured)

<!-- FILLED IN AFTER THE SCRIPTED BROWSER RUN -->

## Measured performance

<!-- FILLED IN AFTER SCREENSHOTS -->

## Known gaps (honest)

* **`newGame(seed)` only reseeds terrain and this module's own placement rng, not every module's
  internal randomness.** Every other module forks its own `ctx.rng` once, at `ModuleRegistry._makeCtx`
  time, from whatever `world.seed` the `World` was constructed with — before `park.init()` (last in
  topo order) ever runs. Calling `terrain.generate({seed})` again rebuilds the heightfield on the new
  seed, and this module's own `rng.fork('park:' + seed)` gives a different park layout, but
  `animals`'/`props`'/`buildings`' *own* per-module rng streams are unaffected — a genuinely fresh game
  would need those modules to expose a reseed hook, which none currently do. Documented rather than
  worked around: this is a real limitation of the module contract (§2), not something `park` can fix
  from outside `src/core/`.
* **The `tour` showcase preset spawns one extra vehicle** directly beside whichever habitat the camera
  is framing (`traffic.spawn('safari', ...)` at the nearest road point), on top of the four tour
  vehicles the demo always builds. A screenshot's settle window is a few seconds of sim time — nowhere
  near enough for one of the four real tour trucks to travel from the gate to a habitat under its own
  simulated pace — so without this, the `tour` preset would show an empty road. The live game's four
  tour vehicles reach every habitat in real (accelerated) time; this extra vehicle exists only for the
  screenshot and is not part of `loadDemo()`/`newGame()`.
* **Site-finding is a bounded spiral search (`findSpot`/`placeBuilding`, 60 tries), not an exhaustive
  scan** like `buildings`' own showcase `findSite()`. It has been reliable on the seeds this was tested
  against; a very unlucky seed (e.g. one whose entire south edge is river) could still force a
  placement (`forced: true` in the report) rather than finding a truly good spot. Forced placements
  still flatten the terrain under their footprint, so nothing floats or clips, but the site may read as
  less levelled than its neighbours.
* **Predators/wetland habitat siting trusts `terrain.getFeatures()`'s kopje/river shape.** If `terrain`
  changes its generator's feature counts or scale, the "most open loop vertex" / "nearest-kopje loop
  vertex" heuristic may need retuning — it is seed-general, not hardcoded to specific coordinates, but
  has only been validated against the current savannah generator.
* **No village/staff housing, no second lodge tier (tented camp), no feeding stations/water pumps** —
  the spec's minimum viable lodge complex (lodge, restaurant, shop, ranger, parking) is built; several
  other catalogue types (`tent`, `house`, `feeder`, `pump`, `toilets`, `fencegate`) exist in `buildings`
  but are not part of the default demo layout. Would be straightforward additions with the same
  `placeBuilding()` helper.
* **Habitat quality/prey-predator scoring depends on `sim.reconcileFromWorld()` being called after
  animals are spawned** (since this module bypasses `simulation.buyAnimals()` and calls
  `animals.spawn()` directly, for a cost-free starting population) — done once, right after all four
  habitats are populated. A later in-game population change made through `animals.spawn()`/`remove()`
  directly (bypassing `simulation`'s own population API) would need the same reconciliation; the
  player's own tools (habitat quality panels, buy/sell) go through `simulation`'s API, which keeps its
  own bookkeeping in sync, so this only matters for code that pokes `animals` directly.
* **No LOD-aware camera framing check** — preset cameras are placed by formula (habitat anchor ±
  offset, loop-vertex midpoints) rather than hand-verified per seed; a very different seed's terrain
  could occasionally frame a preset less well than seed 1 (the one every screenshot below was taken
  against).
* **Two hides + one tower, not more** — the spec says "hides and a viewing tower" (plural hides,
  singular tower); this module builds exactly two hides (wetland, plains) and one tower (pride kopje).
  Browsers has no dedicated viewpoint.
