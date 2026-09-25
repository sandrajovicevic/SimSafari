# Asset register

Every file under `public/assets/` must have a row here (ARCHITECTURE §8). No row → not allowed in the repo.
CC-BY entries must also appear in the in-game credits panel.

| path | source URL | author | licence | added | modifications |
|---|---|---|---|---|---|
| `public/assets/models/khronos/Fox.glb` | https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/Fox | PixelMannen (model); tomkranis (rigging & animation); @AsoboStudio, @scurest (glTF conversion) | model CC0 1.0; rig/animation and conversion CC-BY 4.0 | 2026-09-24 | none. **Test fixture only** (`animals/gltfpool.js` FIXTURES, `?animalModel=species:fox`), never mapped to a shipped species. CC-BY credit required if it is ever shown in-game. |
| `public/assets/textures/polyhaven-via-habitta/grass-{color,surface}.jpg` | https://polyhaven.com/a/withered_grass (obtained via https://github.com/danielluis07/habitta `public/textures/ground/`) | Charlotte Baglioni (Poly Haven) | CC0 1.0 | 2026-09-24 | habitta's processing: halved to 512 px, colour tinted, normal XY + roughness packed into `-surface`. At runtime terrain re-tints the colour to its procedural layer mean. Replace with Poly Haven originals once reachable. |
| `public/assets/textures/polyhaven-via-habitta/earth-{color,surface}.jpg` | https://polyhaven.com/a/dry_ground_rocks (via habitta, as above) | Rob Tuytel (Poly Haven) | CC0 1.0 | 2026-09-24 | as above |
| `public/assets/textures/polyhaven-via-habitta/rock-{color,surface}.jpg` | https://polyhaven.com/a/rock_boulder_dry (via habitta, as above) | Dimitrios Savva (photography), Rico Cilliers (processing) (Poly Haven) | CC0 1.0 | 2026-09-24 | as above |
| `public/assets/textures/polyhaven-via-habitta/gravel-{color,surface}.jpg` | https://polyhaven.com/a/gravel_floor_03 (via habitta, as above) | Charlotte Baglioni (Poly Haven) | CC0 1.0 | 2026-09-24 | as above; not used yet (candidate for roads' gravel) |
| `public/assets/textures/polyhaven/withered_grass/withered_grass_diff_1k.jpg` | https://polyhaven.com/a/withered_grass | Charlotte Baglioni (Poly Haven) | CC0 1.0 | 2026-09-25 | none (original 1k colour map; terrain re-tints at runtime to its procedural layer mean) |
| `public/assets/textures/polyhaven/withered_grass/withered_grass_nor_gl_1k.jpg` | https://polyhaven.com/a/withered_grass | Charlotte Baglioni (Poly Haven) | CC0 1.0 | 2026-09-25 | none (original 1k OpenGL normal map; packed with roughness into the runtime surface array) |
| `public/assets/textures/polyhaven/withered_grass/withered_grass_rough_1k.jpg` | https://polyhaven.com/a/withered_grass | Charlotte Baglioni (Poly Haven) | CC0 1.0 | 2026-09-25 | none (original 1k roughness map; packed as above) |
| `public/assets/textures/polyhaven/dry_ground_rocks/dry_ground_rocks_diff_1k.jpg` | https://polyhaven.com/a/dry_ground_rocks | Rob Tuytel (Poly Haven) | CC0 1.0 | 2026-09-25 | none (as above) |
| `public/assets/textures/polyhaven/dry_ground_rocks/dry_ground_rocks_nor_gl_1k.jpg` | https://polyhaven.com/a/dry_ground_rocks | Rob Tuytel (Poly Haven) | CC0 1.0 | 2026-09-25 | none (as above) |
| `public/assets/textures/polyhaven/dry_ground_rocks/dry_ground_rocks_rough_1k.jpg` | https://polyhaven.com/a/dry_ground_rocks | Rob Tuytel (Poly Haven) | CC0 1.0 | 2026-09-25 | none (as above) |
| `public/assets/textures/polyhaven/rock_boulder_dry/rock_boulder_dry_diff_1k.jpg` | https://polyhaven.com/a/rock_boulder_dry | Dimitrios Savva (photography), Rico Cilliers (processing) (Poly Haven) | CC0 1.0 | 2026-09-25 | none (as above) |
| `public/assets/textures/polyhaven/rock_boulder_dry/rock_boulder_dry_nor_gl_1k.jpg` | https://polyhaven.com/a/rock_boulder_dry | Dimitrios Savva (photography), Rico Cilliers (processing) (Poly Haven) | CC0 1.0 | 2026-09-25 | none (as above) |
| `public/assets/textures/polyhaven/rock_boulder_dry/rock_boulder_dry_rough_1k.jpg` | https://polyhaven.com/a/rock_boulder_dry | Dimitrios Savva (photography), Rico Cilliers (processing) (Poly Haven) | CC0 1.0 | 2026-09-25 | none (as above) |
| `public/assets/textures/polyhaven/gravel_floor_03/gravel_floor_03_diff_1k.jpg` | https://polyhaven.com/a/gravel_floor_03 | Charlotte Baglioni (Poly Haven) | CC0 1.0 | 2026-09-25 | none; not referenced by any module yet (candidate for roads' gravel, as the habitta copy was) |
| `public/assets/textures/polyhaven/gravel_floor_03/gravel_floor_03_nor_gl_1k.jpg` | https://polyhaven.com/a/gravel_floor_03 | Charlotte Baglioni (Poly Haven) | CC0 1.0 | 2026-09-25 | none (as above) |
| `public/assets/textures/polyhaven/gravel_floor_03/gravel_floor_03_rough_1k.jpg` | https://polyhaven.com/a/gravel_floor_03 | Charlotte Baglioni (Poly Haven) | CC0 1.0 | 2026-09-25 | none (as above) |
| `public/assets/models/gobkit/Hippo.glb` | https://gobkit.com/freebies/animal/Hippo.glb | Gobkit (Alsomind Tech Co., Ltd.) | CC0 1.0 | 2026-09-25 | none (downloaded as-is; runtime material tint in `animals/gltfpool.js` ASSET_SPECIES). Rigged: idle/walk/attack/dead |
| `public/assets/models/gobkit/Rhino.glb` | https://gobkit.com/freebies/animal/Rhino.glb | Gobkit (Alsomind Tech Co., Ltd.) | CC0 1.0 | 2026-09-25 | none (downloaded as-is; runtime tint). Rigged: idle/walk/attack/dead |
| `public/assets/models/quaternius/Horse_White.glb` | https://quaternius.com/packs/ultimateanimatedanimals.html (Ultimate Animated Animals pack) | Quaternius | CC0 1.0 | 2026-09-25 | converted `.gltf` (base64 buffer) → `.glb`; mapped to **zebra** (runtime tint). 13 clips. Honest stand-in: no UVs → no stripes possible |
| `public/assets/models/quaternius/Bull.glb` | https://quaternius.com/packs/ultimateanimatedanimals.html (same pack) | Quaternius | CC0 1.0 | 2026-09-25 | converted `.gltf` → `.glb`; mapped to **buffalo AND wildebeest** (two runtime tints, one file). 13 clips |
| `public/assets/models/quaternius/Deer.glb` | https://quaternius.com/packs/ultimateanimatedanimals.html (same pack) | Quaternius | CC0 1.0 | 2026-09-25 | converted `.gltf` → `.glb`; mapped to **impala** (runtime tint). 13 clips |
| `public/assets/models/polypizza/Giraffe.glb` | https://poly.pizza/m/0VkNrGSGXOO | Poly by Google | CC-BY 3.0 | 2026-09-25 | renamed only. STATIC mesh — `gltfpool.js` synthesises a one-bone identity rig (translates/turns, no articulation) |
| `public/assets/models/polypizza/Elephant.glb` | https://poly.pizza/m/a27MA0rXyyj | Poly by Google | CC-BY 3.0 | 2026-09-25 | renamed only. STATIC mesh as above |
| `public/assets/models/polypizza/Lion.glb` | https://poly.pizza/m/3XAJojWxSWz | Poly by Google | CC-BY 3.0 | 2026-09-25 | renamed only. STATIC mesh as above |

**2026-09-25 species models.** All 9 shipped species now load authored glTFs via
`animals/gltfpool.js` ASSET_SPECIES (procedural pools remain the per-species fallback; the
Khronos Fox stays a test fixture only). Gobkit files needed a de-interleave pass for their
interleaved skin attributes (mixed bytes produced NaN skinned bounds → invisible animals).
The three **CC-BY 3.0 Poly by Google models must appear in the in-game credits panel** (§8) —
panel implementation pending (docs/requests/ui.md); recorded here so the obligation is tracked.

**2026-09-25 terrain layer upgrade.** Terrain now loads the Poly Haven 1k originals above as its
primary photo layers (1k chosen over 2k: the splat packs layers into a `DataArrayTexture` at
1024² hardware / 512² software-GL, so 2k adds download bytes for no runtime resolution gain).
The `polyhaven-via-habitta` 512 px files remain wired as the loader's second fallback tier and
procedural layers remain the last tier — both fallbacks proven by capture. Files > 1 MB are
tracked with Git LFS per §8 (`.gitattributes`, pattern-based over `public/assets/**`;
already-committed smaller binaries stay plain). Source CDN `dl.polyhaven.org`, metadata verified
via `api.polyhaven.com` on 2026-09-25.
