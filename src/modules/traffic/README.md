# traffic

Safari vehicles and the visitors riding them. Vehicles drive the real `roads` graph (or a built-in
fallback loop when `roads` is absent), hold seated passengers, stop for animal sightings on tours,
kick up dust, and run synthesised engines through `audio`. Owns `world.vehicles`.

## How it works

* `kinds.js` — vehicle kinds: `safari` (8 seats), `ranger`, `minibus`, `service` (dimensions,
  colours, seat rows, speed multipliers).
* `VehicleKit.js` / `vehicle.js` / `build.js` — procedural vehicle meshes (chassis, ribbed canopy,
  roof rack, spare wheel, tiered bench seats with individually coloured passengers), instanced where
  counts allow.
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
| `close` | 16.5 | one **parked** open safari truck at ~11 m, 3/4 rear-side: tiered bench seats, 8 passengers, canopy, roof rails, spare wheel |
| `sighting` | 17.5 | a tour truck stopped on the gravel road ~40 m from a **zebra** herd (needs `animals`; plain stop otherwise) |
| `night` | 21.5 | the same parked truck as `close` at night: headlights and taillights lit, headlight pool on the asphalt; a minibus and a ranger vehicle drive elsewhere on the loop (not in frame) |

The `close` and `night` hero trucks are pinned (`_state = 'stopped'`, like `sighting`): before
2026-09-25 they spawned driving, and the capture's 3.6 s settle drove them out of an 11–14 m frame
(critic round 4: both presets rendered an empty road).

## Measured

* `close` preset: **106 draw calls, 0 console errors** (wave-2 integration review, independently
  re-checked 2026-09-04).
* World-state check in the same review: 6 vehicles with plausible in-bounds positions on the live
  graph; `graphBackend()` = `'roads'`.

## Known gaps (honest)

* **`overview`'s default camera (430 m) makes vehicles nearly invisible** — verification was
  repeatedly misread as "nothing renders" before the `close` preset settled it. The preset's
  framing is a legitimate presentation flaw, not a rendering bug; a closer default or a labelled
  inset would fix it. Not yet changed.
* Ambient vehicles never sight-stop (only tours do); they also despawn/respawn around the player
  rather than running schedules.
* Passengers are static figures (box torsos, sphere heads, varied clothing colours) — no arms or hats,
  no head turn toward animals on a sighting (`_sightYaw` is computed but not applied to the heads),
  no boarding animation, no individual visitors entering/leaving buildings.
* **The vehicle reads as programmer art at close range** (critic round 4): striated brown body instead
  of khaki paint, no readable windscreen/cab glass, box headlights, flat disc hubs, slab canopy.
* About 5 draw calls per vehicle when kinds do not share pools (15 for 3 vehicles of 3 kinds) — inside
  the module budget, above the spec's ≤3-per-vehicle guidance.
* No vehicle–animal collision avoidance beyond slowing: a truck stops near a herd only on tour
  sight-stops; ambient trucks drive through anything (roads only, so in practice they miss animals).
* No dust settling/puddles after rain stops; dust rate scales with speed only.
* Engine sound is one diesel loop per vehicle (see audio README); no gear shifts.
* This README replaced a one-line DRAFT left when the original builder's documentation was cut short
  (API spend limit); the code is the builder's, unmodified.
