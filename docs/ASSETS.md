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
