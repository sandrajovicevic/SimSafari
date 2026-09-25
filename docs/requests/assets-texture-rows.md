# docs/ASSETS.md rows — Poly Haven originals for terrain (2026-09-25)

Ready-to-paste rows for `docs/ASSETS.md` (this file only proposes; the orchestrator merges).
These replace the *role* of the 2026-09-24 `polyhaven-via-habitta/*` rows (512 px processed
copies): terrain now loads the Poly Haven 1k originals below and packs normal-XY + roughness at
runtime. The habitta files stay wired as the terrain loader's fallback, so whether their register
rows stay or go is the orchestrator's call (if the rows are dropped, the files must stay on disk
or terrain silently loses its first fallback — it still has the procedural one).

Source URLs are the asset pages; files were fetched from Poly Haven's official CDN
(`dl.polyhaven.org`, URLs verified 2026-09-25 via `api.polyhaven.com/files/<id>`).
All four assets are CC0 on polyhaven.com; authors per `api.polyhaven.com/info/<id>`.

```
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
```

## Notes for the integrator

1. **Git LFS (§8)**: four files exceed the 1 MB binary threshold and need the LFS filter in
   `.gitattributes` (integrator-owned file, not touched by terrain):
   `dry_ground_rocks_nor_gl_1k.jpg` (1.26 MB), `gravel_floor_03_nor_gl_1k.jpg` (1.55 MB),
   `withered_grass_diff_1k.jpg` (1.14 MB), `withered_grass_nor_gl_1k.jpg` (1.47 MB).
   Set total: 12 files, ~11.2 MB (within the 150 MB `public/assets/` cap; the set it replaces was
   ~0.65 MB but the originals displace no other asset).
2. **Resolution choice**: 1k, not 2k — the terrain splat packs layers into a `DataArrayTexture` at
   1024² (hardware) / 512² (software GL and quality=low), so a 2k source adds ~4× download bytes
   with no runtime resolution gain.
3. **props was left untouched.** Its only clean asset hook is `photoSet()` (colour + packed
   `-surface`, used once for boulders). Tree bark/foliage are GLSL-generated alpha-cut textures in
   the tree builder's own UV layout, and `imposter.js` clones only `map` (drops normal/roughness),
   so wiring photo bark/leaf would mean species-geometry + imposter changes, i.e. invasive edits
   beyond material loading — skipped per task constraint. The `gravel_floor_03` set is downloaded
   and registered for that future use (roads).
