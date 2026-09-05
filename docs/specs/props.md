# props — spec

Vegetation and natural props: the thing that makes a savannah look like a savannah. Reference: Serengeti acacia
woodland, Masai Mara grassland, kopjes with candelabra euphorbia, baobabs; Planet Zoo foliage.

## Must deliver
* **Grass**: GPU-instanced grass blades/tufts (billboard cards with alpha-tested procedural blade textures or
  geometry blades), density from biome (`world.terrain.biome`) and moisture, colour from biome (golden dry / greener
  near water) with macro noise, wind sway via `ctx.materials.withWind`, camera-distance fade, ≥ 200 k instances at
  `quality=high` within ~350 m of the camera, chunked regeneration as the camera moves. Ground-cover cards for the far range.
* **Trees**: procedural species built in code with LOD: umbrella thorn acacia (flat crown, layered canopy cards +
  branch geometry), fever tree, baobab (fat trunk), sausage tree, doum palm, candelabra euphorbia, marula. Canopy from
  clustered alpha-tested leaf cards with procedural leaf texture (`ctx.textures.gpu`), bark PBR with normal map,
  wind sway. LOD0 (< 120 m) full, LOD1 (< 350 m) reduced, LOD2 billboard imposter (rendered from the LOD0 mesh into a
  texture at init). All instanced per species/LOD. Cast shadows (LOD0/1).
* **Shrubs/bushes**, **rocks** (kopje boulders with procedural granite PBR, triplanar), **termite mounds**, **dead trees /
  fallen logs**, **anthills**, **bones**.
* **Placement**: `api.scatter({ region, seed, rules })` using `ctx.rng`/`ctx.noise` with biome/slope/water rules
  (acacias on plains, riverine trees along water, euphorbia on kopjes, no trees on roads/buildings — read
  `world.grid.occupancy`). `api.place(kind, x, z, opts)`, `api.remove(id)`, `api.clear(region)`, `api.coverAt(x, z)` →
  tree cover 0–1 (for habitats), `api.grassDensityAt(x,z)`, `api.graze(x, z, r, amount)` (animals eat grass → density drops, regrows in `tick`), `api.kinds()`.
* React to `terrain:modified` (re-place in the rect), `road:added`, `building:placed` (clear footprint).

## Presets
`overview` (acacia savannah on terrain, 16.5 h), `grass` (close on grass at 6 m, 17 h), `acacia` (one tree at 20 m,
15 h), `kopje` (boulders + euphorbia, 17.5 h), `riverine` (trees along water, 8 h), `night` (21.5 h).

## Budget
≤ 400 draw calls total, ≤ 3 M tris at overview; `update()` ≤ 1.5 ms (chunk streaming amortised).
