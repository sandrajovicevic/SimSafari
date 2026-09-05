# roads

Owner of `world.roads` (node/edge graph) and every road mesh: dirt/gravel/paved ribbons, junction
patches, timber/concrete bridge decks over water, and instanced signposts/lamps/km-stones. Reference:
Cities: Skylines II road tooling + real safari tracks (Kruger tar, Serengeti dirt two-tracks, gravel
with ruts).

## Files

| file | purpose |
|---|---|
| `index.js` | module definition, public API, dirty-rebuild scheduling, dispose |
| `graph.js` | node/edge graph: `addRoad` (Catmull-Rom smoothing, node/edge snapping, edge splitting), A* `pathfind`/`route`, `nearestEdge`/`nearestNode`, `sampleEdge`, occupancy stamping |
| `ribbon.js` | mesh builder: per-edge ribbons conforming to `world.getHeight`, junction patches, bridge decks, water-span detection |
| `materials.js` | procedural PBR sets (dirt/gravel/asphalt/planks/concrete/staging-ground) + the road surface shader (ruts, shoulder dust, markings) |
| `terrainConform.js` | flattens the heightfield under a road and paints `BIOME.ROAD_DUST` beyond the edge, when `terrain` is present |
| `props.js` | instanced signposts, junction fingerposts, km stones, solar lamps |
| `showcase.js` | presets + `stage()`: lays a fixed loop network, adds a river crossing if none exists, locates the real bridge/edges for camera framing |

## Public API (`ctx.modules.get('roads')`)

```js
KINDS   // { dirt:{width:4.5,cost:1.35,rank:0}, gravel:{width:5.0,cost:1.15,rank:1}, paved:{width:6.0,cost:1.0,rank:2} }

addRoad(points, kind = 'dirt', width) → edgeId[]
// points: [[x,z], ...] or [{x,z}, ...]. Control points within SNAP_DIST (6 m) of an existing node or
// edge snap to it (splitting the edge if needed). Returns the new edge id(s) (one per snapped segment).
removeRoad(edgeId) → boolean
clear()                                   // removes every road
nearestEdge(x, z, maxDist) → { edge, s, dist, point:{x,z} } | null
nearestNode(x, z, maxDist) → node | null
pathfind(a, b) → nodeId[] | null          // A*, node ids only
route(a, b) → { nodes, edges, length } | null
sampleEdge(edgeId, s, out) → { position: Vector3, tangent: Vector3 }
// out is reused if passed; pass null/undefined to get a fresh one (needed the first time — see gap below).
getLanes(edgeId) → { width, laneWidth, count: 2, leftHand: true, lanes: [{index,offset,forward,from,to}, ...] }
graphVersion() → number                   // bumped on every graph mutation
getEdge(id) → edge | null
getNode(id) → node | null
edges() → Map<id, edge>
nodes() → Map<id, node>
stats() → { edges, nodes, length, dirt, gravel, paved, junctions, build:{drawables,triangles,ms,junctions,bridges,edges,props} }
rebuild()                                 // force a synchronous mesh rebuild (normally automatic next frame)
isDirty() → boolean
setDustColor(r, g, b)                     // recolour the shoulder-dust blend uniform shared by all three kinds
group                                     // (getter) the THREE.Group all road/bridge/prop meshes live under
```

Edge shape: `{ id, a, b, kind, width, points:[x,z,...], cum, length, ys }`. Node shape:
`{ id, x, z, edges:[edgeId,...] }`.

## Events

| event | direction | payload |
|---|---|---|
| `road:added` / `road:removed` / `road:changed` | emits | `{edgeId}` (`edgeId: null` on a full rebuild) |
| `terrain:ready` | consumes | marks the network dirty so it re-flattens/re-paints onto the new heightfield |
| `terrain:modified` | consumes | marks dirty (debounced 0.4 s) unless the edit was roads' own `terrainConform` write |
| `time:set` | consumes | recomputes the night factor for reflective paint / lamp emissive |

## Presets

`overview` (loop network: paved spine, gravel loop, dirt tracks, 5 junctions, 2+ bridges),
`close` (dirt two-track at ~20 m), `paved` (tar road with markings), `junction` (3-way junction),
`bridge` (a timber crossing), `night`. `showcase.js` lays one fixed set of control-point paths
regardless of whether `terrain` is loaded; on real generated terrain the fixed coordinates rarely
land exactly on the actual river, so `stage()` now walks every edge with `sampleEdge` +
`world.isWater` after building to find the actual longest dirt-preferred water crossing and
re-targets the `bridge` preset camera onto it (falls back to whatever crossing exists if no dirt
edge crosses water). `close`, `paved`, `junction` keep their authored fixed targets, verified this
round to still land on the intended subject on the current seed.

## Rendering technique notes

* **Cross-section**: crown + two darker tyre-rut channels (`aRoad.x` = signed across-metres) on dirt
  and gravel, faded centre dashes + edge lines on paved, a `uSkirt`-wide alpha feather beyond the
  road edge so the mesh boundary itself is invisible, and a **shoulder dust band** — up to 1.8 m wide,
  broken up by two octaves of noise — that blends the surface colour toward `uDust` (terrain-matched
  ochre) before the alpha feather even starts. This is what fixed "ribbon reads as a painted line."
* **Colour**: dirt/gravel/asphalt albedo is authored as **true linear colour** (core's `srgb:true`
  path does the single encode) at values roughly matching the surrounding ground's tone — dirt is a
  mid ochre-brown only slightly lighter than laterite/dry-grass, asphalt is near-black worn tar, not
  light concrete grey.
* **Terrain conform**: when `terrain` exists, `terrainConform.js` flattens the heightfield under
  every edge's width (banked to the local slope) and paints `BIOME.ROAD_DUST` ~3 m beyond, then
  triggers a refresh of only the touched terrain chunks.
* **Bridges**: `ribbon.js` detects water spans along an edge (`world.isWater` sampled every metre,
  merged with a 4 m margin) and swaps that stretch for a timber (dirt/gravel) or concrete (paved)
  deck with railings, arched slightly above the flat chord.
* **Junctions**: nodes with ≥ 3 incident edges get a fanned patch keyed to the highest-rank kind
  present (paved > gravel > dirt); 2-way same-kind nodes get a shared cross-section frame so there is
  no seam; different-kind 2-way nodes get a short trimmed transition patch.

## Measured (this session, SwiftShader software GL, 1280×720, `--settle 15`)

| preset | tod | draw calls | triangles | console errors |
|---|---|---|---|---|
| overview | 15 | 66 | 1,492,149 | 0 |
| close | 16.5 | 60 | 1,197,673 | 0 |
| paved | 10 | 60 | 1,197,673 | 0 |
| junction | 17 | 64 | 1,264,057 | 0 |
| bridge | 9 | 65 | 1,329,169 | 0 |
| night | 21.5 | 67 | 1,361,937 | 0 |

Road-owned draw calls (excluding `terrain`/`environment`/fallback, which dominate the totals above):
at most 3 surface meshes (dirt/gravel/paved, one draw call each — geometry for every edge of a kind
is merged into a single `BufferGeometry`) + up to 2 bridge meshes (wood/concrete, merged the same
way) + instanced sign/lamp/km-stone batches from `props.js` (one draw call per instanced type). For
the 12-edge / 5-junction / several-bridge overview network this is at most ~10 road-owned draw calls
— well inside the ≤ 40 budget for a 20-edge network.

## Known gaps (honest)

* **`sampleEdge(edgeId, s, out)` allocates a fresh `{position:Vector3, tangent:Vector3}` only when
  `out` is falsy** — pass `null` the first time and reuse the same object on every later call to stay
  allocation-free. Passing a plain `{x,z}`-shaped object instead (rather than one with real `Vector3`
  members) throws, since the implementation calls `out.position.set(...)`. `traffic` (when built)
  needs to know this.
* **The showcase network's fixed control-point coordinates are tuned for the generated-terrain
  river's typical position for seed 1**, not derived from `terrain.getFeatures()` the way `terrain`'s
  own showcase re-anchors every preset. It works because `ensureBridge()` adds a crossing if none
  exists and `stage()` now re-targets the `bridge` camera dynamically, but a very different seed could
  still produce a network that crosses the river at an awkward angle or not at all along the paved
  spine.
* **No traffic-facing lane geometry beyond `getLanes()`'s two-lane assumption** — every road kind
  reports exactly 2 lanes with a fixed `leftHand: true` convention; there's no notion of one-lane
  dirt tracks (realistic for a safari track) or shoulder pull-outs.
* **Signs/lamps are placed by `props.js`'s own heuristic** at junctions and along km markers; they
  are not aware of `buildings` or `props` (vegetation) placement, so a sign can in principle end up
  inside a tree canopy once `props` finishes populating the world.
* **Night lighting is self-contained** (emissive lamps + reflective paint) rather than responding to
  `environment`'s moonlight the way daylight materials respond to the sun — see `terrain`'s README for
  the wider near-black-night finding; roads only reads better at night because of its own added
  emissive elements, not because its base material is any brighter under ambient light.
* **Bridge deck arch height and rail spacing are fixed constants**, not derived from span length, so
  a very long or very short water crossing gets the same rail density and the same arch sag fraction.
