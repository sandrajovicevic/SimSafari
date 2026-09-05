# traffic — spec

Owner of `world.vehicles`. Safari vehicles carrying visitors along the road graph, plus service vehicles.
Reference: Cities: Skylines II traffic behaviour; real open-sided Land Cruiser / Land Rover safari trucks.

## Must deliver
* **Vehicles**: procedurally built open safari truck (cab, tiered bench seats with 6–9 seated visitors as low-poly
  figures with varied clothing colours, canopy, roof rack, spare wheel, wheels that roll, suspension bob on dirt),
  ranger pickup, minibus, service truck. PBR paint (khaki/olive/white) with dust accumulation, glass, chrome, tyres with
  tread normal. Headlights + taillights emissive at night (spot lights only for the 2 nearest vehicles). Instanced per type
  where possible; ≤ 3 draw calls per vehicle otherwise.
* **Movement**: follow `roads.sampleEdge` with lane offset (drive on the left), speed by road kind (dirt 25 km/h,
  gravel 40, paved 60), slow for junctions/bends/other vehicles (car-following), stop at sightings (see below), turn
  at junctions using `roads.pathfind` towards a target, reverse on dead ends. Wheel contact via `world.getHeight` under
  each wheel (body pitch/roll).
* **Tours**: `api.startTour({from: gateNodeId, stops, durationHours})` → vehicle spawns at the gate, visits waypoints,
  returns; **sightings**: when within 60 m of an animal group (`ctx.modules.get('animals')?.nearest`) with line of sight,
  stop 20–60 s, emit `visitor:sighting {species, vehicleId, distance}`; passengers turn to look (head yaw).
  Emits `vehicle:spawned/despawned`. `api.spawn(kind, edgeId, s)`, `api.remove(id)`, `api.list()`, `api.setDensity(n)`.
* Dust puffs on dirt via `ctx.modules.get('effects')?.spawnDust`; engine sound via `ctx.modules.get('audio')?.engine`.
* Works on the road module's showcase network; if roads is absent, drive a built-in test loop.

## Presets
`overview` (6 vehicles on a loop with a junction, 16 h), `close` (truck at 8 m with passengers, 16.5 h), `sighting`
(truck stopped near zebras if animals exists, 17.5 h), `night` (headlights, 21.5 h).

## Budget
≤ 80 draw calls for 10 vehicles; `update()` ≤ 2 ms.
