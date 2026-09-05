# SimSafari — Architecture

Construction-and-management simulation inspired by Maxis's *SimSafari* (1998).
Three.js (r185) + Vite, plain ES modules, no framework, no TypeScript, no bundler magic.

This document is the contract. Builders own exactly one folder under `src/modules/`.
Only the **integrator** edits `src/core/`, `index.html`, `vite.config.js`, `tools/`, or this file.

---

## 1. Folder layout

```
index.html                 entry (integrator only)
vite.config.js
ARCHITECTURE.md            this contract (integrator only)
CLAUDE.md                  rules for agents working in this repo
docs/STATUS.json           persisted critic scores + open issues, per module
docs/critic/               critic reports (markdown) per module per round
tools/                     node-side tooling (integrator only)
  screenshot.mjs           headless-Chrome verification tool (§6)
  shots/                   PNG + JSON output of the screenshot tool (gitignored)
src/
  main.js                  boots core/App
  core/                    SHARED — integrator only
    App.js                 renderer, scene, camera, loop, window.__SIM__
    World.js               shared world data model (§3)
    ModuleRegistry.js      discovery, dependency order, failure isolation (§5)
    EventBus.js            typed-by-convention pub/sub (§4)
    Rng.js                 seeded RNG (sfc32) with named forks
    Noise.js               seeded simplex 2D/3D + fbm
    CameraRig.js           map-style orbit camera + named presets
    Showcase.js            ?module=…&preset=…&tod=… routing
    Perf.js                fps / draw-call / per-module timing
    Log.js                 console capture into __SIM__.errors
    Textures.js            procedural PBR texture helpers (albedo/normal/roughness)
    Materials.js           shared material factory (standard PBR setup, wind, etc.)
    Units.js               constants and unit helpers
  modules/
    terrain/               heightfield mesh, splat/biome shading, terrain edits, water surface
    environment/           sun/sky/atmosphere, clouds, weather, time of day, night, fog
    animals/               species catalogue, meshes+animation, needs, behaviour (herds, predation, sleep)
    roads/                 road graph → road meshes, junctions, dirt/gravel/paved
    zoning/                habitat/enclosure/visitor zoning grid, fences, painting
    buildings/             lodge, gate, hides, water holes, ranger stations, catalogue + meshes
    props/                 vegetation (acacia, grass, shrubs, baobab), rocks, termite mounds, instancing
    traffic/               safari vehicles and visitors on the road graph, spawn/despawn, pathing
    effects/               post-processing (bloom, SSAO, color grade), dust, heat haze, particles
    simulation/            the economy + population + happiness + visitor sim (headless, no rendering)
    tools/                 in-game build tools: terraform, road draw, zone paint, place building
    ui/                    HUD, toolbar, panels, tooltips, graphs — plain DOM/CSS
    audio/                 ambience (day/night savannah), animal calls, UI sounds — procedural WebAudio
    savannah/              DEMO: stages a complete, hand-tuned African savannah scene using all modules
    park/                  DEMO: a complete playable park (habitats, roads, buildings, visitors, economy)
```

Every module folder contains at least:

```
src/modules/<id>/index.js       default export: module definition (§2)
src/modules/<id>/README.md      what it does, public API, events, known gaps (kept honest)
src/modules/<id>/showcase.js    the module's showcase presets (§6)
```

Module folders never import from another module folder. Cross-module access goes
through `ctx.modules.get(id)` (returns the other module's `api` or `null`) and the event bus.
Importing from `src/core/` is allowed and encouraged.

---

## 2. Module contract

```js
// src/modules/<id>/index.js
export default {
  id: 'terrain',                 // folder name
  version: 1,
  dependencies: ['environment'], // ids this module needs before init(); [] if none
  optional: ['effects'],         // ids it will use if present, never requires

  // Called once. Build meshes, subscribe to events, register API. Must not throw.
  async init(ctx) {},

  // Called every rendered frame. dt in seconds (clamped ≤ 0.1). t = elapsed seconds.
  update(dt, t) {},

  // Called at fixed simulation rate (10 Hz game time). simDt in game-hours.
  tick(simDt) {},

  // Tear everything down (used by showcase switching and by hot reload).
  dispose() {},

  // Public API. Frozen after init(). Other modules see this via ctx.modules.get(id).
  api: {},

  // Showcase mode (§6). presets: { name: { camera, tod, description } }. stage() builds the scene.
  showcase: { presets: {}, async stage(ctx, presetName) {} },
};
```

`ctx` handed to `init()`, `stage()`:

| field | type | notes |
|---|---|---|
| `ctx.world` | World | shared data model (§3) |
| `ctx.events` | EventBus | `on(name, fn)`, `off`, `emit(name, payload)`; listeners are error-isolated |
| `ctx.rng` | Rng | forked from the world seed with the module id — deterministic per module |
| `ctx.noise` | Noise | seeded simplex/fbm, same seed as `ctx.rng` |
| `ctx.scene` | THREE.Scene | add your `THREE.Group` here; name it `<id>` |
| `ctx.camera` | THREE.PerspectiveCamera | read-only for most modules |
| `ctx.renderer` | THREE.WebGLRenderer | read caps; do not change global state |
| `ctx.rig` | CameraRig | `setPreset(name)`, `lookAt(x,z,dist,pitch,yaw)`, `registerPreset` |
| `ctx.modules` | `{ get(id) }` | other modules' `api` or `null` |
| `ctx.log` | Logger | `info/warn/error`; errors are recorded per-module |
| `ctx.quality` | `'low'|'medium'|'high'` | from `?quality=`, default `high` |
| `ctx.textures` | Textures | procedural PBR texture helpers |
| `ctx.materials` | Materials | shared material factory |
| `ctx.app` | App | `setRenderFn(fn)` (effects only), `requestFrame()`, `time` |
| `ctx.isShowcase` | boolean | true when running a single module's showcase |

Rules:

* `init()` **must not throw**. Anything that can fail (shader compile, big allocation) is wrapped
  and reported via `ctx.log.error(err)`. The registry also wraps it — see §5 — but a module that
  throws is a failed module and scores 0.
* All geometry in **metres, +Y up**, world centred at origin (§3). One Three.js unit = 1 m.
* **No `Math.random()`**. Use `ctx.rng` / `ctx.noise`. The repo has a lint check for this.
* **No network fetches**. Everything is procedural (§8). `fetch()` of textures is forbidden.
* Add all scene objects under one `THREE.Group` named after the module so the integrator and
  the screenshot tool can toggle or count them.
* `dispose()` must release geometries, materials, textures, render targets, DOM nodes and audio nodes.
* `update()` must be allocation-free in steady state (reuse vectors, no per-frame `new`).
* Modules must not read the DOM except `ui` (which owns `#ui-root`) and `tools` (pointer events on the canvas via `ctx.app.input`).

---

## 3. Shared world data model (`src/core/World.js`)

One `World` instance; modules read it freely and write only the parts they own.

```
world.seed            number         from ?seed=, default 1
world.size            1024           metres; square; x,z ∈ [-512, 512]

world.terrain         owner: terrain
  .res                513            samples per side (cell = size/(res-1) = 2 m)
  .cell               2
  .heights            Float32Array   res*res, metres, row-major, index = iz*res + ix
  .biome              Uint8Array     res*res, biome id per sample (0 grass,1 dry grass,2 dirt,3 rock,4 sand,5 wetland,6 riverbed,7 road-dust)
  .waterLevel         number         metres; heights below it are water
  .minHeight/.maxHeight
world.getHeight(x,z)                 bilinear, clamped to bounds
world.getNormal(x,z,out)             from central differences
world.isWater(x,z)
world.inBounds(x,z)
world.raycastGround(ray, out)        analytic march against heightfield

world.grid            owner: zoning (zone), buildings (occupancy)
  .cell               4              metres
  .res                256
  .zone               Uint8Array     0 none,1 habitat,2 visitor,3 service,4 no-build(water/road)
  .habitatId          Uint16Array    which habitat a cell belongs to (0 none)
  .occupancy          Uint8Array     0 free, 1 building, 2 road, 3 prop-blocked
world.cellAt(x,z) → {ix,iz,index}; world.cellCenter(ix,iz) → {x,z}

world.habitats        owner: zoning     Map<id, {id, name, cells:Int32Array, area, species:Set, water, shade, cover, quality}>
world.roads           owner: roads      { nodes: Map<id,{id,x,z}>, edges: Map<id,{id,a,b,kind:'dirt'|'gravel'|'paved',width,points:[x,z,...]}>, version }
world.buildings       owner: buildings  Map<id, {id, type, x, z, rot, w, d, state, staff, visitors}>
world.animals         owner: animals    Map<id, {id, species, x, z, y, heading, speed, state, herd, needs:{food,water,rest,safety,social}, happiness, age, sex}>
world.vehicles        owner: traffic    Map<id, {id, kind, edge, s, x, z, heading, passengers}>
world.visitors        owner: simulation { count, inPark, satisfaction, seenSpecies: Map<species,count>, log:[] }
world.economy         owner: simulation { cash, income, expenses, ticketPrice, loans, history:[{day,cash,income,expenses,visitors}] }
world.time            owner: core       { hour (0-24 float), day, speed (game-hours per real-second), paused }
world.weather         owner: environment { cloud (0-1), rain (0-1), wind:{x,z,speed}, temperature, season:'dry'|'wet', haze }
world.selection       owner: tools      { kind, id }
```

Ownership means *writes*. Anyone reads. Writers must emit the matching event (§4) after a change.

---

## 4. Events (`ctx.events`)

Names are `domain:verb`. Payloads are plain objects. Listeners that throw are logged and detached
after 5 consecutive throws.

| event | emitted by | payload |
|---|---|---|
| `core:ready` | core | `{}` after all modules initialised |
| `core:resize` | core | `{width,height}` |
| `time:set` | core | `{hour, day}` when time is set explicitly (showcase, UI) |
| `time:tick` | core | `{hour, day, simDt}` every sim tick |
| `terrain:modified` | terrain | `{x0,z0,x1,z1}` bounds in metres |
| `terrain:ready` | terrain | `{}` after mesh is built |
| `weather:changed` | environment | `{cloud, rain, wind, season}` |
| `zone:changed` | zoning | `{cells:[index,...], zone}` |
| `habitat:changed` | zoning | `{id}` |
| `road:added` / `road:removed` / `road:changed` | roads | `{edgeId}` |
| `building:placed` / `building:removed` | buildings | `{id, type}` |
| `props:changed` | props | `{x0,z0,x1,z1}` |
| `animal:spawned` / `animal:died` / `animal:state` | animals | `{id, species, state?}` |
| `vehicle:spawned` / `vehicle:despawned` | traffic | `{id}` |
| `visitor:sighting` | traffic/simulation | `{species, vehicleId}` |
| `economy:updated` | simulation | `{cash, income, expenses, day}` |
| `sim:day` | simulation | `{day, report}` |
| `tool:selected` | tools | `{tool}` |
| `tool:applied` | tools | `{tool, detail}` |
| `ui:notify` | any | `{level:'info'|'warn'|'error', text}` |
| `audio:play` | any | `{sound, x?, z?, gain?}` |
| `module:failed` | core | `{id, phase, error}` |

---

## 5. Failure isolation

* Modules are discovered by `import.meta.glob('../modules/*/index.js')` and imported lazily. A
  syntax error or throw at import time fails **only that module**.
* Dependencies are resolved topologically. If a dependency failed, dependents still initialise but
  `ctx.modules.get(dep)` returns `null`; they must handle that.
* `init()`, `update()`, `tick()`, `dispose()` and every event listener run inside `try/catch`.
  A module that throws 5 frames in a row is **quarantined**: its `update/tick` are no longer
  called, its group stays in the scene, `__SIM__.modules[id].status = 'quarantined'`.
* The render loop itself never depends on any module. If everything fails you still get a sky
  colour, a ground plane and a working camera.
* `ui` renders in `#ui-root` outside the canvas; a UI exception cannot stop rendering.

---

## 6. Verification loop

### Showcase mode

`http://localhost:5173/?module=terrain&preset=overview&tod=16.5&seed=1&quality=high`

* Core loads only `terrain` + its `dependencies` + any `optional` that exist, calls `stage(ctx, preset)`.
* `tod` sets `world.time.hour`; `environment` (if loaded) lights accordingly. If `environment`
  is not loaded, core provides a fallback sun+hemisphere so a module is still visible.
* Presets are `{ camera: {x,y,z, tx,ty,tz} | 'presetName', tod, description }`. Each module
  must define at least `overview`, `close`, `night` presets.

### Screenshot tool

```
node tools/screenshot.mjs --module terrain --preset overview --tod 16 [--seed 1] [--quality high] [--w 1920 --h 1080]
node tools/screenshot.mjs --all            # every module × every preset
node tools/screenshot.mjs --game           # the full game (no ?module) at 3 presets × 3 times
```

Writes `tools/shots/<module>-<preset>-<tod>.png` and `.json`:

```json
{ "module":"terrain","preset":"overview","tod":16,"ready":true,"errors":[],"warnings":[],
  "fps":31.2,"frameMs":32,"drawCalls":412,"triangles":1834000,"programs":14,"textures":22,
  "memoryMB":180,"modules":{"terrain":{"status":"ok","updateMs":0.4}}, "gpu":"SwiftShader",
  "note":"fps under SwiftShader software GL is not representative of GPU performance" }
```

The tool waits for `window.__SIM__.ready === true`, then 40 more frames, then captures.
It fails (exit 1) if `ready` isn't reached in 60 s or if any error was logged.

**Nothing is claimed that has not been screenshotted and looked at.**

### `window.__SIM__`

```
ready:boolean  errors:[]  warnings:[]  fps  frameMs  drawCalls  triangles
modules:{id:{status:'ok'|'failed'|'quarantined', error?, updateMs}}
setTimeOfDay(h)  setCameraPreset(name)  setCamera({x,y,z,tx,ty,tz})  capture()→stats
world  events  app
```

---

## 7. Performance budget (1080p, `quality=high`, discrete GPU reference)

| metric | budget |
|---|---|
| frame time | ≤ 20 ms (≥ 50 fps) |
| draw calls | ≤ 1500 total; per module soft cap 200 (props 400, animals 200, terrain 64) |
| triangles | ≤ 6 M on screen |
| textures | ≤ 512 MB GPU |
| JS heap | ≤ 600 MB |
| per-module `update()` | ≤ 1.5 ms avg (animals/traffic ≤ 3 ms) |
| shadow map | 1 cascaded set (CSM 3 cascades, 2048²) owned by environment |

Instancing is mandatory for anything with > 20 copies. LOD is mandatory for anything visible at
> 300 m. Per-frame allocations are zero in steady state.

Under the headless SwiftShader renderer used by the screenshot tool, fps is *not* the budget
metric; draw calls, triangles and console errors are.

---

## 8. Asset policy

CC0 only. In this environment the egress proxy blocks Poly Haven, ambientCG and every CDN
(verified with `curl`: 403 CONNECT), so **every asset is procedural**: textures are generated
with `core/Textures.js` (noise-driven albedo, height→normal, roughness), meshes are built from
Three.js geometries and code, animals are procedurally modelled and animated (bone-less
skinning via vertex shaders or hierarchical groups), audio is WebAudio synthesis.
No binary files are committed except what the screenshot tool writes to `tools/shots/` (gitignored).
If the proxy is later opened, downloaded CC0 assets go under `public/assets/<source>/` with a
`LICENSE.txt` naming the source; the module reads them via `ctx.assets` (integrator adds it).

---

## 9. Rendering conventions

* `renderer.outputColorSpace = SRGBColorSpace`, `toneMapping = ACESFilmic`, exposure owned by environment.
* Shadows: `PCFShadowMap` (r185 deprecated PCFSoft); only environment's sun casts. Modules set `castShadow/receiveShadow`.
* Physically based lights (three default): sun ≈ 100 000 lux scaled through exposure, sky via hemisphere + PMREM from procedural sky.
* Material base: `MeshStandardMaterial`/`MeshPhysicalMaterial` via `ctx.materials`. Custom shaders extend via `onBeforeCompile` and must be documented in the module README.
* Camera: perspective, 45° vertical FOV, near 0.5, far 4000. Map-style rig (pan/rotate/zoom, pitch clamp 10–85°).
* Coordinate helpers: `Units.js` exports `M = 1`, `KM = 1000`, `hourToSunAngle(h)`.

---

## 10. Simulation model (fidelity to SimSafari 1998)

The original loop, which `simulation` must implement and `ui` must expose:

* **Habitats**: painted regions with terrain, water, vegetation, and cover. Each species has
  preferences (grass/tree density, water proximity, terrain roughness, herd space, predator distance).
  Habitat *quality* per species = weighted match of preferences → drives happiness, breeding, migration.
* **Animals**: needs (food, water, rest, safety, social). Grazers/browsers eat vegetation (props
  density drops, regrows). Predators hunt when hungry. Herds move together. Unhappy animals leave the
  park boundary or die. Population growth needs happiness > threshold.
* **Visitors**: arrive at the gate by day, ride safari vehicles along roads; satisfaction depends
  on species seen (variety, rarity, proximity), road comfort, lodge quality, price. Satisfaction
  drives word-of-mouth → arrival rate.
* **Economy**: income = tickets + lodge; expenses = staff + roads/buildings upkeep + animal care.
  Daily report. Bankruptcy = game over state (UI).
* **Village / staff** (SimSafari had a village whose prosperity depends on park success): modelled
  as staff satisfaction affecting upkeep efficiency. Simplified; documented as such.

Sim runs at 10 ticks per game-hour of real speed 1; time speed 0/1/3/10.

---

## 11. Agent roles and waves

* **Builder** (one per module): owns `src/modules/<id>/` only. Reads this doc. Ships showcase
  presets, README with honest gaps, screenshots of its own module, and a list of
  `core-change-requests` in `docs/requests/<id>.md` when it needs something from core.
* **Integrator** (one): the only writer to `src/core/`, `index.html`, `tools/`, `docs/STATUS.json`
  schema. Applies requests, fixes seams, keeps the dev server up.
* **Critic** (one per module round): no code. Takes its own screenshots (several times of day, zoom
  levels), checks API contract, errors, perf; scores 0–10 vs reference domain (§12). Writes
  `docs/critic/<id>-round<n>.md` and updates `docs/STATUS.json`.
* **Waves**: (1) terrain, environment, animals, roads, simulation, ui, audio, effects →
  (2) zoning, buildings, props, traffic, tools → (3) savannah, park. Integrator between waves.

## 12. Scoring

10 indistinguishable from reference · 8.5 AAA with nits · 7 good indie · 5 programmer art · 0 broken/missing.
Pass = ≥ 8.5 **and** zero console errors **and** within budget (§7).
Nature modules benchmark against real savannah/wildlife photography and Planet Zoo;
built modules against Cities: Skylines II. Scores are never inflated; `docs/STATUS.json` is the truth.
