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
| `close` | 16.5 | one **parked** open safari truck at ~11 m, 3/4 rear-side: tiered bench seats, 8 hatted passengers, canvas-tinted canopy, roof rails, spare wheel |
| `sighting` | 17.5 | a tour truck stopped on the gravel road ~40 m from a **zebra** herd (needs `animals`; plain stop otherwise) |
| `night` | 21.5 | the same parked truck as `close` at night: headlights lit with a warm pool on the asphalt ahead; a minibus and a ranger vehicle drive elsewhere on the loop (not in frame). The taillights read as two red lamps at the rear even from this side view — the lens geometry has wrap-around side wings and the emissive was raised (2.2 → ~6.2 at full night) after critic round 4; re-verified in `tools/shots/traffic-night-21_5-gpu.png` (2026-09-25) |

The `close` and `night` hero trucks are pinned (`_state = 'stopped'`, like `sighting`): before
2026-09-25 they spawned driving, and the capture's 3.6 s settle drove them out of an 11–14 m frame
(critic round 4: both presets rendered an empty road).

## Measured

* `close` preset: **106 draw calls, 0 console errors** (wave-2 integration review, independently
  re-checked 2026-09-04). Re-verified 2026-09-25 on the real GPU (ANGLE D3D11, 1280×720, seed 1,
  default settle): `close` 108 draws / 3.19 M tris, `night` 130 draws / 3.06 M tris, 0 console
  errors, and both hero trucks stay in frame (`tools/shots/traffic-close-16_5-gpu.png`,
  `traffic-night-21_5-gpu.png`).
* World-state check in the same review: 6 vehicles with plausible in-bounds positions on the live
  graph; `graphBackend()` = `'roads'`.

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
* **Integrator re-check on the current pipeline (2026-09-25):** the builder session that made the
  changes below worked from a stale pre-iteration-1 checkout, so its screenshots predate the
  exposure-neutral effects chain. Re-shot on current `main`: hubs/lug bosses, hats, bull bar, canopy
  trim and the night taillights (small red glows at the rear, `traffic-night-21_5.png`) all read; the
  **body paint still reads as brown with a heavy speckle rather than clean khaki**
  (`traffic-close-16_5.png`) — partly fixed, not done.
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
* About 5 draw calls per vehicle when kinds do not share pools (15 for 3 vehicles of 3 kinds) — inside
  the module budget, above the spec's ≤3-per-vehicle guidance.
* No vehicle–animal collision avoidance beyond slowing: a truck stops near a herd only on tour
  sight-stops; ambient trucks drive through anything (roads only, so in practice they miss animals).
* No dust settling/puddles after rain stops; dust rate scales with speed only.
* Engine sound is one diesel loop per vehicle (see audio README); no gear shifts.
* This README replaced a one-line DRAFT left when the original builder's documentation was cut short
  (API spend limit); the code is the builder's, unmodified.
