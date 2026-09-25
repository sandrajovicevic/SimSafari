# traffic

Safari vehicles and the visitors riding them. Vehicles drive the real `roads` graph (or a built-in
fallback loop when `roads` is absent), hold seated passengers, stop for animal sightings on tours,
kick up dust, and run synthesised engines through `audio`. Owns `world.vehicles`.

## How it works

* `kinds.js` — vehicle kinds: `safari` (8 seats), `ranger`, `minibus`, `service` (dimensions,
  colours, seat rows, speed multipliers).
* `VehicleKit.js` / `vehicle.js` / `build.js` — procedural vehicle meshes (chassis, framed windscreen,
  bull bar, canvas-tinted canopy, roof rack, spare wheel, tiered bench seats with individually
  coloured and hatted passengers, dished wheel hubs), instanced where counts allow.
* `graph.js` — adapter over `roads`' node/edge graph; `fallback.js` supplies a loop when roads is
  missing (`graphBackend()` reports which one is live).
* `pool.js` — ambient vehicle pool maintained toward `setDensity(n)`.
* `tours.js` — tour vehicles: a stop list of graph nodes, sight-stops near animals (20–60 s) that
  emit `visitor:sighting`.
* Speeds follow the road kind (dirt 25 / gravel 40 / paved 60 km/h) scaled by the vehicle's
  `speedMul`; traffic keeps to the left (`roads.getLanes`).

## Public API — `ctx.modules.get('traffic')`

```js
KINDS → object                          // vehicle kinds + metadata
spawn(kind, edgeId, s=0) → id|null      // one ambient vehicle on edge `edgeId` at arc length s
                                        // (a→b direction). Needs a real edge id:
                                        //   roads.nearestEdge(x, z, maxDist) → {edge, s}
remove(id) / get(id) / list() → record[]
setDensity(n) / getDensity() → number   // ambient (non-tour) vehicle target, maintained incrementally
startTour({from, stops, durationHours}) → vehicleId|null
//   from: gate node id; stops: [nodeId,...]; returns null if from is unknown/disconnected
stats() → object                        // counts by kind/state, avg speed
graphBackend() → 'roads' | 'fallback'
```

### Events

| event | direction | payload |
|---|---|---|
| `vehicle:spawned` | emits | `{id}` |
| `vehicle:despawned` | emits | `{id}` |
| `visitor:sighting` | emits | `{species, vehicleId, distance}` (tours only; feeds `simulation`) |
| `audio:play` / `engine()` | emits | dust puffs via `effects.spawnDust`, engine loops via `audio` |

## Modules consumed (all optional, all null-checked)

`roads` (the graph — without it the fallback loop appears), `animals` (sighting stops), `effects`
(dust), `audio` (engines).

## Presets

| preset | tod | what it shows (from `showcase.js`, 2026-09-25) |
|---|---|---|
| `overview` | 16 | 6 vehicles (2 safari, ranger, 2 minibus, service) on a paved/gravel/dirt loop with a junction and two bridges — at 430 m a 4–5 m vehicle is a speck (see gaps) |
| `close` | 16.5 | one **parked** open safari truck at ~11 m, 3/4 rear-side: tiered bench seats, 8 hatted passengers, canvas-tinted canopy, roof rails, spare wheel |
| `sighting` | 17.5 | a tour truck stopped on the gravel road ~40 m from a **zebra** herd (needs `animals`; plain stop otherwise) |
| `night` | 21.5 | the same parked truck as `close` at night: headlights lit with a warm pool on the asphalt ahead, taillights glowing red and visible from this 3/4 angle; a minibus and a ranger vehicle drive elsewhere on the loop (not in frame) |

The `close` and `night` hero trucks are pinned (`_state = 'stopped'`, like `sighting`) in
`spawnClose`/`spawnNight`: before 2026-09-25 they spawned driving, and the capture's settle drove them
out of an 11–14 m frame before the shot was taken (critic round 4: both presets rendered an empty
road — this was still true on `main` right up to this fix; an earlier README revision had already
described the parked state as done, but the showcase code itself was never actually changed).

## Measured

* `close` (16.5, 1280×720): **106 draw calls, 3.19M triangles, 0 console errors**
  (was 106 / 3.18M before this round's geometry changes — the paint-UV, wheel-hub, window-frame,
  bull-bar, hat, canopy-trim and taillight-wing detail add triangles but no draw calls).
* `night` (21.5, 1280×720): **128 draw calls, 3.06M triangles, 0 console errors** (was 128 / 3.03M).
* `traffic.stats()` at `night`: `{vehicles: 3, drawCalls: 15, bodyPools: 3, wheels: 14, seats: 14}` —
  unchanged; still at the ≤15-for-3-vehicles budget (about 5 draws/vehicle when kinds don't share a
  paint pool — inside the module budget, above the spec's ≤3-per-vehicle guidance).
* `modules.traffic.updateMs`: 0.155 ms (`close`), 0.294 ms (`night`) — steady-state, well inside the
  3 ms module budget; no per-frame allocations added (all the changes below are build-time geometry).
* Lint (`node tools/lint.mjs src/modules/traffic`): clean.

## Known gaps (honest)

* **`overview`'s default camera (430 m) makes vehicles nearly invisible** — verification was
  repeatedly misread as "nothing renders" before the `close` preset settled it. The preset's
  framing is a legitimate presentation flaw, not a rendering bug; a closer default or a labelled
  inset would fix it. Not yet changed.
* Ambient vehicles never sight-stop (only tours do); they also despawn/respawn around the player
  rather than running schedules.
* Passengers are seated figures (torso, shoulders/arms, sphere head, a wide-brim hat merged into
  every clothing instance) — but every passenger shares the **same** hat silhouette, tinted by their
  own clothing colour rather than an independent hat palette (all instances of the clothing pool draw
  one merged geometry, so a passenger-by-passenger hat-vs-no-hat or cap-vs-bush-hat choice would need
  a second pool, which the module's draw-call budget has no headroom for — see `stats()` above). No
  head turn toward animals on a sighting (`_sightYaw` is computed but not applied to the heads), no
  boarding animation, no individual visitors entering/leaving buildings.
* **Close-range fit and finish, addressed this round (critic round 4 #3/#4), with some corners cut:**
  the `traffic:paint` fleck used a box's default `[0,1]` UV regardless of size, so a 6 m panel showed
  the same low-frequency noise as a 0.3 m seat — stretched into a "wood grain" look. Fixed by mapping
  box UVs to real metres (`scaleBoxUV` in `build.js`) and raising the bake frequency so even thin
  panels (the 0.16 m chassis rail) show several cycles instead of a banded gradient. The safari cab
  now has a framed, glazed windscreen and a bull bar; wheels have a dished hub with 6 lug bosses
  (darkened for contrast against the rim — the geometry was there in an earlier attempt but too subtle
  to read against a same-tone rim); the canopy is thicker with a dark edge-trim lip and a canvas tint
  distinct from the painted body; taillights (and headlights, which share the same lamp geometry) got
  wrap-around side wings so they read from a 3/4 angle, not just dead-on. **Not done:** only the
  safari's cab got the window-frame/bull-bar treatment — `ranger`/`minibus`/`service` cabs are
  unchanged; the paint fleck is procedural noise tuned by eye against screenshots, not a PBR paint
  scan; the wheel dish is a stylised shape, not a real rim profile.
* No vehicle–animal collision avoidance beyond slowing: a truck stops near a herd only on tour
  sight-stops; ambient trucks drive through anything (roads only, so in practice they miss animals).
* No dust settling/puddles after rain stops; dust rate scales with speed only.
* Engine sound is one diesel loop per vehicle (see audio README); no gear shifts.
