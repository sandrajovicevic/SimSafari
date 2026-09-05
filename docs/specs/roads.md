# roads — spec

Owner of `world.roads` (graph) and road meshes. Reference: Cities: Skylines II roads + real safari tracks (Kruger tar
roads, Serengeti dirt tracks, gravel with ruts).

## Must deliver
* **Graph**: nodes + edges in `world.roads`. `api.addRoad(points:[[x,z],...], kind='dirt'|'gravel'|'paved', width?)` →
  smooth Catmull-Rom centreline, node snapping (≤ 6 m) to existing nodes/edges (splitting edges), returns edge ids.
  `removeRoad(edgeId)`, `nearestEdge(x,z)` → `{edge, s, dist, point}`, `pathfind(nodeA, nodeB)` → node list (A*),
  `sampleEdge(edgeId, s, out)` → position + tangent (used by traffic), `getLanes(edgeId)`, `graphVersion()`.
  Marks `world.grid.occupancy = OCC.ROAD` under the road. Emits `road:added/removed/changed`.
* **Meshes**: ribbon swept along the centreline, sampled every 2 m, conforming to `world.getHeight` (+0.05 m), with
  cross-section: crown, shoulders that blend into terrain (skirt/alpha fade), tyre ruts for dirt (two darker channels),
  gravel edges, paved: asphalt with edge lines and faded centre dashes. Junctions: blended patch at nodes with ≥ 3 edges,
  no overlapping z-fighting ribbons (draw order or depth offset). Culverts/bridge deck where the road crosses water
  (`world.isWater`) — simple plank/concrete bridge with railings.
* **Materials**: `ctx.textures.pbr()` sets: dry dirt with pebbles, gravel, asphalt with cracks/patches; normal + roughness;
  dust colour tint towards terrain colour at the edges. Macro variation along length.
* **Terrain integration**: if `terrain` API exists, flatten across the road width (`terrain.flatten` along the path,
  banked into slope) and paint `BIOME.ROAD_DUST` 3 m beyond the edge.
* Signs/markers: a few instanced wooden direction signs at junctions and km stones (small, tasteful).

## Presets
`overview` (a loop road network with 4 junctions and a bridge, 15 h), `close` (dirt track detail at 20 m, 16.5 h),
`paved` (tar road with markings, 10 h), `junction` (3-way junction, 17 h), `night` (21.5 h).
Stage on the flat fallback ground if terrain is absent, on generated terrain if present.

## Budget
≤ 40 draw calls for a 20-edge network, ≤ 200 k triangles.
