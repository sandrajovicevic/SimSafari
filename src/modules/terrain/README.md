# terrain

Owner of `world.terrain` (heights, biome ids, water level). Builds the heightfield mesh, the
triplanar PBR splat shader, the river/pan water surfaces, a low-detail world-edge apron, and the
terrain edit API (`raise`/`lower`/`flatten`/`smooth`/`paintBiome`/`setWaterLevel`). Reference:
Serengeti / Masai Mara / Kruger aerial and ground photography.

## Files

| file | purpose |
|---|---|
| `index.js` | module definition, edit API, generation entry point, dispose |
| `generate.js` | CPU heightfield generation (river, kopjes, escarpment, pans) + biome classification |
| `mesh.js` | chunked heightfield geometry (4×4 chunks), per-chunk normals, shadow-cast heuristic |
| `material.js` | the splat `MeshStandardMaterial` (`onBeforeCompile`) — two-scale UV blend + triplanar |
| `textures.js` | six procedural PBR layer sets (grass/dryGrass/dirt/rock/sand/mud), packed into two `DataArrayTexture`s |
| `water.js` | river/pan water geometry + material (depth absorption, tight sun glint) |
| `apron.js` | world-edge continuation ring (~6.5× world half-size) sampling the splat's own layer textures so the map doesn't end in a floating slab |
| `showcase.js` | presets + `stage()`, repositions cameras onto the seed's actual generated features |

## Public API (`ctx.modules.get('terrain')`)

```js
generate({ preset = 'savannah', seed } = {})
// Fills world.terrain from the seeded generator. Sets waterLevel, classifies biome, calls
// world.updateHeightStats(), emits 'terrain:ready'. Returns { kopjes, pans, river, escarpment }.

getBounds() → { x0, z0, x1, z1, minHeight, maxHeight, waterLevel }
getChunkAt(x, z) → { cx, cz, x0, z0, x1, z1, minH, maxH, maxSlope, mesh } | null
sampleMoisture(x, z) → number            // 0..1, river proximity / low ground / pan proximity
getBiomeName(id) → string                // BIOME_NAMES[id]
getFeatures() → { river, pointOnRiver(t), kopjes, pans, escarpment } | null
getWaterLevelAt(x, z) → number           // a pan's own level inside its footprint, else world.terrain.waterLevel
isWaterAt(x, z) → boolean                // ground height below the LOCAL water body (pans included)
getHeightTexture() → THREE.DataTexture   // R16F 513², updated on every edit — used by water depth/dust shaders
getMaterial() → THREE.MeshStandardMaterial  // the splat material, for other modules that want to match it
normalAt(x, z, out = [0,1,0]) → out      // heightfield normal via central differences (array, not Vector3)

raise(x, z, r, amount)
lower(x, z, r, amount)                   // = raise(x, z, r, -amount)
flatten(x, z, r, targetH)                // targetH defaults to the current height at (x,z)
smooth(x, z, r, strength = 1)
paintBiome(x, z, r, biome)               // biome ∈ [0,7]; sets gen.painted so it survives reclassification
clearPaint(x, z, r)                      // un-paint and reclassify from the procedural rules
setWaterLevel(h)                         // rewrites world.terrain.waterLevel and every non-pan localLevel

BIOME, BIOME_NAMES                       // { grass:0, dryGrass:1, dirt:2, rock:3, sand:4, wetland:5, riverbed:6, roadDust:7 }
```

Every edit call is a localized falloff (`(1-t²)²` over radius `r`), updates only the touched chunks
and the control textures, calls `world.updateHeightStats()`, and emits `terrain:modified {x0,z0,x1,z1}`.

## Events

| event | direction | payload |
|---|---|---|
| `terrain:ready` | emits | `{}` — after `generate()` completes |
| `terrain:modified` | emits | `{x0,z0,x1,z1}` — after any edit, including `setWaterLevel` (whole map) |

Consumes nothing directly; `roads` listens for both of the above to know when to re-flatten/re-paint
under its network.

## Presets

`overview`, `plains`, `kopje`, `river`, `escarpment`, `close`, `night` (per spec). `showcase.js`
computes real feature positions from `getFeatures()` each stage and re-anchors every preset's
camera target onto them (kopje = tallest kopje, river/close/night = points along the actual river
centreline, escarpment = the actual ridge line), so the views are correct for any seed, not just
seed 1.

## Rendering technique notes (see file-header comments for the shader source)

* **Triplanar on steep faces**: `material.js` ramps a `tri` factor from `smoothstep(0.09, 0.50, slope)`
  and blends the usual two-scale XZ planar sample with X/Y-projected samples weighted by the squared
  world normal, using an orthonormal tangent frame built on N (valid at `N.y == 0`, i.e. vertical
  faces) instead of the old world-XZ-biased frame. This is what fixed the black vertically-stretched
  cliff-face smear from round 1.
* **Biome-boundary softening**: the control-texture lookup UV is domain-warped by three octaves of
  simplex noise (`uWarpA/B/C`, ~1–11 m amplitude) before sampling, so a boundary that is a hard 2 m
  step on the CPU-side classification grid reads as organic noisy fingers in the render.
  `uBlendDepth` also height-blends the six layers rather than hard-cutting them.
* **Distance specular anti-aliasing (round 3)**: the wet band (`aux.g`, river banks / pan rims)
  used to drop roughness to 0.34, and at overview distances the GGX lobe was far narrower than a
  screen pixel while mip-averaged detail normals fed it variance — that rendered as the white
  speckle clusters hugging every waterline (blind round 3, "waterline sparkle blotches").
  Cross-checked on real hardware (AMD RX 5700 XT, ANGLE D3D11 — `tools/shots/gpu-check-*.png`)
  before fixing: a genuine shader aliasing bug, not a SwiftShader artifact. Fix: wet roughness
  floor raised to 0.50, roughness climbs +0.35 over 200–800 m camera distance (distant ground
  goes matte; close range untouched), detail normal flattens to 15 % past 700 m. `water.js`
  fades its explicit Blinn glint (×0.1 by 800 m) and flattens wave normals over the same range.
  The round-3 "fence ring" sparkle was the same wet band — the night rings are circular pan rims,
  not zoning fences (no zoning change needed); remaining night sparkle on road lines belongs to
  `roads`' reflective paint, out of terrain's scope.
* **De-regularized layer stamps (round 3)**: the grass/dryGrass streak motif (old single
  anisotropic `tfbm(uv·(1,7))` stamp that repeated identically every tile) is now a
  locally-rotated, domain-warped two-octave field with a patchy intensity mask
  (`bladesField`/`bladesMask` in `textures.js`), and the dirt crack motif wobbles off the
  voronoi edge in two scales whose intensity comes and goes (`crackField`) at half its old
  albedo contrast. The splat shader also samples the two tile scales at fixed odd-angle
  rotations (`rot2`, 0.13 / 0.37 rad) so their repeats cannot align into a visible grid.
  Palette/layer colours are unchanged — pattern redistribution only, no albedo shift.
  Cost is one shader-side warp; the CPU classification grid itself is unchanged.
* **Water**: `water.js` no longer relies on the standard PBR specular lobe (roughness raised to 0.96
  so it contributes almost nothing) and instead adds one explicit, narrow Blinn-Phong sun glint term.
  Colour is Beer–Lambert depth absorption (`uExt` per-channel extinction) between a wet-sand/mud bed
  colour and a dark silt/tannin body colour — this is what fixed the water blowing out to white.
  `envMapIntensity` is forced to 0.10 in `updateWaterSky()` every frame because `environment`'s
  `setEnvMap()` rewrites `envMapIntensity` on every tracked material whenever the PMREM regenerates.
* **Apron**: `apron.js` builds a ring of decreasing detail from the world border out to ~6.5×
  `world.half`, sharing height samples with the true edge at ring 0 (no seam at the handoff), rising
  into low distant "highlands" (`rise = 45·t² + ridged noise`) so the rim always sits above a
  ground-level camera's horizon instead of leaving a gap that shows the sky dome's below-horizon
  colour as a dark band. Since round 3 the apron's material samples the SAME packed layer texture
  arrays as the playable splat (`layers.tAlb`/`tNrm`) through the splat's two-scale UV scheme,
  height blend and full tint chain, with an analytic plains control (dry grass dominant, laterite
  `pt` patches, slope dirt/rock mirroring `classifySample`). Near the border the baked control aux
  (moisture/wet/macro) is sampled clamped and faded to the analytic field over 20–220 m, so
  macro-variation blotches and the riverine green band continue across the world border instead of
  stepping to a different-detail slab.
  **Sharp border features no longer extend radially (2026-09-25, round-5 major fix).** Hard-sharing
  the border heights along every ray turned the escarpment's west/east border crossings (~86–90 m
  columns over a ~150–190 m stretch) into two ruler-straight hairline ridges across the apron
  (critic-unprojected to ≈(−504,−355)→(−945,−625) and (511,−342)→(761,−487)). Now ring 0 keeps the
  exact border heights, while beyond it the border height's deviation from a wide low-passed plains
  baseline (two ±384 m wrapped box passes along the perimeter) decays radially (`exp(−(t/0.07)²)`,
  gone by ring 5 ≈ 450 m) and is smeared along the perimeter with a kernel widening from 0 to ±384 m,
  so the ridge ends in a short broad shoulder instead of a fin. Verified at both reported segments:
  `tools/shots/seb-before-terrain-overview-15.png` (before, both lines) →
  `seb-after2-terrain-overview-15.png` / `seb-after2-terrain-overview-12.png` (after, both clean at
  two sun angles) and `seb-after2-terrain-escarpment-7.png` (grazing dawn light); geometry-only
  change — same draw calls (35 overview) and triangle count (1,090,924).
* **Colour**: all albedo is authored as **true linear colour** consumed by `ctx.textures.pbr()`
  (core's `srgb:true` path does the single sRGB encode — see `CLAUDE.md`). No saturation/contrast
  compensation is applied in the shader (`uSat`/`uContrast` sit at neutral); the earlier round's
  compensation for the (now-fixed) core double-encode bug has been removed.
* **Photo layers (2026-09-25)**: the dryGrass/dirt/rock layer slices are overwritten at init with
  the Poly Haven 1k originals (`textures/polyhaven/<asset>/`, colour + OpenGL normal + roughness as
  three CC0 maps; the packed normal-XY+roughness surface map is composed at load, `textures.js` →
  `applyPhotoLayers`). The photo's mean colour is re-tinted per channel (linear) to the procedural
  layer's mean, so the scans contribute real structure without shifting the art-directed palette.
  Fallback chain: originals → 2026-09-24 habitta 512 px packs (`textures/polyhaven-via-habitta/`,
  kept registered and on disk) → fully procedural layers; every step is verified by capture
  (2026-09-25: `d3d11-after-*` vs `d3d11-before-*`, plus `fallback-habitta-close` and
  `fallback-procedural-close` on SwiftShader — draw calls and triangles identical across all
  three paths, palette unchanged).
* **Kopjes**: `generate.js` builds each kopje as a stack of angular blocks — superellipse footprints
  (`|u|^p + |v|^p = 1`, p = 3..7 → rounded-rectangular in plan), near-vertical sides, flat tops, each
  sliced by 2–3 tilted fracture planes (the exfoliation joints real kopjes show), unioned with `max()`
  so intersections stay sharp. Plinth → mid blocks → cap block, plus a talus of small half-buried
  slabs around the foot. Angular, not the old rounded-dome `max(rounded domes)` cauliflower shape.

## Measured (this session, SwiftShader software GL, 1280×720, `--settle 15`)

| preset | tod | draw calls | triangles | console errors |
|---|---|---|---|---|
| overview | 15 | 35 | 1,090,924 | 0 |
| plains | 16.5 | 24 | 730,476 | 0 |
| kopje | 17 | 36 | 1,123,692 | 0 |
| river | 9 | 38 | 1,189,228 | 0 |
| escarpment | 7 | 40 | 1,254,764 | 0 |
| night | 21.5 | 44 | 1,353,068 | 0 |

Terrain + water draw calls: 16 chunk meshes (4×4, always resident) + 1 water mesh + 1 apron mesh =
18 base, plus whatever `environment` and the fallback add to the total shown above. Well inside the
≤ 64 terrain+water budget. Triangle count is mesh-resolution-bound (513² heightfield, 4×4 chunks,
128 apron segments × 22 rings), not draw-call-bound.

## Known gaps (honest)

* **Edit cost (2026-09-25).** `afterEdit()` used to re-pack the whole 513² splat control texture on
  every edit (~135 ms each, so every frame of a brush drag). It now calls `packControlRect()` for the
  edited sample rect (+1 for the blur): verified byte-identical weight textures against a full repack,
  one `raise()` ~8–13 ms under SwiftShader. `setWaterLevel()`/`generate()` still do the full repack.
  Not fixed: the full control/height textures are still re-uploaded to the GPU on each edit.

* **Night water fixed 2026-09-25** (critic r4 #1: water ~2.5–3× brighter than ground and sky at night).
  Cause: the in-column scatter floor in `water.js` was divided by exposure, so its *displayed*
  brightness stayed at its daytime level all night. It now also scales with a daylight factor `uDay`
  (1 by day, 0.08 at night). Verified: `terrain-night-21_5.png` and `game-overview-21_5.png` show dark
  water with a faint sky reflection, lamps the brightest points; `terrain-river-auto.png` (9 h)
  unchanged. Still open from the same review: illegible ripples (#3, see below).

* **Escarpment fluted-column motif broken up, 2026-09-25** (critic r4 #2: uniform, equal-width
  vertical grooves the full length of the ridge). Root cause: `flute`/`flute2` in `generate.js` fed
  `ridged2D` a raw, unwarped `(x, z)` at a single fixed wavelength (26 m), so every groove along the
  whole 1024 m ridge came out the same width and spacing — visible at every distance tested, not just
  close range, exactly as the critic found. Fixed with three changes, all gated by the existing cliff
  mask (`cm`), same heightfield/mesh, no new draw call:
  1. domain-warp the sample position before `ridged2D`, using two warp octaves (34 m and 130 m —
     comparable to the groove period itself, not just a slow large-scale shift, which was tried first
     and only moved whole runs of grooves sideways together without changing their relative spacing);
  2. a slow along-ridge multiplier (0.22×–1.5×) on flute amplitude so some stretches read deeply
     fluted and others read almost smooth, instead of uniform depth everywhere;
  3. a `de`-keyed (height-keyed) terrace term giving horizontal ledges/strata banding across the
     flutes, and a worley boulder-clump term added to the talus cone at the base for irregular
     rockfall lobes instead of a smooth uniform cone.
  Verified with a same-camera before/after pixel diff (8.7% of pixels changed by >6/255, up to 157/255
  in places) and by eye at both showcase distances: `escarpment` preset
  (`tools/shots/terrain-escarpment-auto.png`, post-fix) now shows a visibly jagged, irregular skyline
  and varying groove width/depth instead of a uniform comb, and `overview`/15h
  (`tools/shots/terrain-overview-15.png`) confirms it at the module's other standard distance. This is
  a heightfield-geometry fix (`generate.js`), not a shader/material change — the fluting is real
   relief, not a texture pattern. **Still open**: at very close range (<3 m) the underlying ridged noise
  is still recognisable as noise rather than true stratified rock, and no vegetation/talus breakup
  from other modules (props) was added — out of this module's scope.

* **Two-scale texture repeats are broken up, not eliminated.** The round-3 rotations, warps and
  masks stop the 3.7 m grass stamp and the dirt crack lattice from reading as motifs (verified
  in round-3 after shots), but the underlying 1024² tiles still repeat; a dedicated texture
  bombing / per-cell UV variation pass would be the next step if a critic ever catches the
  repeat again at extreme close range.

* **Night is close to unlit black.** Confirmed this is not terrain-specific: `environment`'s own
  night showcase (`tools/shots/env-night-exposurefix.png`) and `props`'s night showcase
  (`tools/shots/props-night-auto.png`) show the same near-total-black ground with almost no ambient
  fill, even for plain test geometry. `roads` reads better at night only because it adds its own
  emissive lamp point-lights and reflective paint on top of the same base lighting — the ground
  material itself is not brighter. This looks like an `environment`-owned ambient/moonlight
  intensity issue, out of scope for this module to fix.
* **Triplanar rock is a single macro pattern repeated at two scales**, not a true multi-frequency
  rock shader; at extreme close range (< 3 m) on a cliff face the two-scale blend can still be
  spotted as a repeat, though anisotropy and the two UV scales (6.5 m / two-scale planar) keep it
  from tiling obviously at showcase distances.
* **Kopje boulders are still one shared parametric block generator** (superellipse + fracture
  planes) rather than hand-varied forms; three kopjes from three different seeds will feel like the
  same "species" of rock formation, just recombined.
* **No LOD beyond the 4×4 chunk split.** All 16 chunks render at full 513² resolution regardless of
  camera distance; the spec's "optional LOD for far chunks" was not implemented. Not currently a
  budget problem (35–44 draw calls vs. a 64 soft cap), but a far/overview camera pays the same
  per-vertex cost as a close one.
* **Escarpment fracture pattern is fbm/ridged-noise-driven**, not a true stratified rock-layer model.
  The repeating-column artifact this used to produce at showcase distances is fixed (see above,
  2026-09-25); what remains is that a slow close flythrough along the whole 1024 m ridge would still
  reveal the underlying noise as noise rather than distinct rock strata.
* **Water is a flat-shaded per-cell mesh** (built only where the heightfield dips near a body's
  level), not a continuous surface with wave geometry — ripples are entirely a normal-map effect, so
  silhouette/edge waves are absent.
* **`paintBiome`/`clearPaint` do not repaint the apron** — the apron is a fixed procedural material
  independent of `world.terrain.biome`, so a paint edit right at the world border will not be
  reflected past x/z = ±512.
* **Apron continuation residuals (round 3, after the splat-material extension)**: the ground texture,
  detail frequency and tint chain now continue across the border, but (a) props' tree/shrub cover and
  roads still stop at the world edge (other modules), so at overview the apron is ~15% brighter than
  tree-shaded interior plains (a 0.95 albedo gain compensates most of the rest); (b) far-field
  macro-variation blotches use GLSL noise, so their exact positions differ from the CPU-baked interior
  field across the seam (frequency and contrast match; the 20–220 m clamped-aux fade keeps the near
  border continuous); (c) the escarpment plateau exits the north border as flat plains, since the
  apron ring deliberately continues plains only.
