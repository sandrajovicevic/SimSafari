# terrain — spec

Owner of `world.terrain` (heights, biome, waterLevel). Reference: Serengeti / Masai Mara / Kruger aerial and ground
photography; Planet Zoo terrain at close range.

## Must deliver
* **Generation** `api.generate({ preset: 'savannah', seed })` fills `world.terrain.heights` (513², 2 m cells, 1024 m world):
  gently rolling plains (relief 5–15 m over 200 m), a meandering river valley with a wetland/floodplain, 2–3 kopjes
  (granite outcrops 15–35 m tall, steep), an escarpment/ridge along one edge (60–100 m rise), a couple of shallow pans
  (waterholes). Seeded, deterministic. Call `world.updateHeightStats()`; set `world.terrain.waterLevel`; classify `biome`
  by height/slope/moisture; emit `terrain:ready`.
* **Mesh**: chunked (e.g. 8×8 chunks), frustum-culled, `receiveShadow`, `castShadow` for steep chunks. Optional LOD for far chunks.
* **Shading** (custom `onBeforeCompile` on `MeshStandardMaterial` or a ShaderMaterial that still receives shadows):
  PBR splat by biome/slope/height using tileable sets from `ctx.textures.pbr()`: green grass, dry golden grass, red-brown
  laterite dirt, granite rock, sand/riverbed, dark wetland mud. **Kill tiling**: macro-noise colour variation at 50–300 m,
  two-scale UV blending (e.g. 4 m and 37 m repeats), slope-based rock with triplanar on steep faces, subtle detail
  normal. Wet darkening near water; dust colour near roads (`BIOME.ROAD_DUST`). Grass colour should read as dry-season
  savannah (golden/olive) with greener bands along the river.
* **Water**: river + pans surface at `waterLevel` (one mesh or per-body), animated normals, fresnel, reflection of sky
  colour at minimum (a planar reflection or env-map is fine), shoreline foam/wetness blend, depth tint. No z-fighting with terrain.
* **Edit API**: `raise(x,z,r,amount)`, `lower`, `flatten(x,z,r,targetH)`, `smooth(x,z,r)`, `paintBiome(x,z,r,biome)`,
  `setWaterLevel(h)`. Each updates only affected chunks, calls `world.updateHeightStats()`, emits `terrain:modified`.
* `api.getBounds()`, `api.getChunkAt(x,z)`, `api.sampleMoisture(x,z)`, `api.getBiomeName(id)`.

## Presets
`overview` (whole park, 15 h), `plains` (close, 16.5 h, grass detail 40 m), `kopje` (rock outcrop, 17 h), `river` (water + wetland, 9 h),
`escarpment` (ridge, 7 h), `night` (21.5 h).

## Budget
≤ 64 draw calls for terrain + water, ≤ 1.2 M triangles at overview, textures ≤ 6 PBR sets at 1024².
