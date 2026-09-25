# animals — asset register rows for docs/ASSETS.md

Ready-to-paste rows for the files added 2026-09-25 (species-assets builder; see
`src/modules/animals/gltfpool.js` ASSET_SPECIES). Merge into `docs/ASSETS.md` — not edited in place
to avoid colliding with the parallel agent working there.

- Gobkit models: CC0 1.0 (stated per model in https://gobkit.com/api/free manifest, `license` field).
- Quaternius models: CC0 1.0 (pack `License.txt` in the Ultimate Animated Animals download).
- Poly Pizza / Poly by Google models: CC-BY 3.0 → **must also appear in the in-game credits panel**.
- All 9 species wired in `ASSET_SPECIES` (animals/gltfpool.js); none of these files is a test fixture.

| path | source URL | author | licence | added | modifications |
|---|---|---|---|---|---|
| `public/assets/models/gobkit/Hippo.glb` | https://gobkit.com/freebies/animal/Hippo.glb (catalogue: https://gobkit.com/freebies) | Gobkit (Alsomind Tech Co., Ltd.) | CC0 1.0 | 2026-09-25 | none (downloaded as-is; runtime material tint in ASSET_SPECIES) |
| `public/assets/models/gobkit/Rhino.glb` | https://gobkit.com/freebies/animal/Rhino.glb (catalogue: https://gobkit.com/freebies) | Gobkit (Alsomind Tech Co., Ltd.) | CC0 1.0 | 2026-09-25 | none (downloaded as-is; runtime material tint in ASSET_SPECIES) |
| `public/assets/models/quaternius/Horse_White.glb` | https://quaternius.com/packs/ultimateanimatedanimals.html (file `glTF/Horse_White.gltf` from the pack's Google Drive folder: https://drive.google.com/drive/folders/1uJ3N5HfB7jKTseJUNQr3N4YaN0UuEtHk) | Quaternius | CC0 1.0 | 2026-09-25 | converted `.gltf` (base64-embedded buffer) → `.glb`; mapped to zebra in ASSET_SPECIES (runtime material tint, file untouched) |
| `public/assets/models/quaternius/Bull.glb` | https://quaternius.com/packs/ultimateanimatedanimals.html (file `glTF/Bull.gltf`, same Drive folder as above) | Quaternius | CC0 1.0 | 2026-09-25 | converted `.gltf` → `.glb`; mapped to buffalo AND wildebeest in ASSET_SPECIES (two tint variants, file untouched) |
| `public/assets/models/quaternius/Deer.glb` | https://quaternius.com/packs/ultimateanimatedanimals.html (file `glTF/Deer.gltf`, same Drive folder as above) | Quaternius | CC0 1.0 | 2026-09-25 | converted `.gltf` → `.glb`; mapped to impala in ASSET_SPECIES (runtime material tint, file untouched) |
| `public/assets/models/polypizza/Giraffe.glb` | https://poly.pizza/m/0VkNrGSGXOO (file: https://static.poly.pizza/716750a1-6d51-48fc-a5d4-4e8ab87b1e8d.glb) | Poly by Google | CC-BY 3.0 | 2026-09-25 | renamed to Giraffe.glb (mesh/texture untouched) |
| `public/assets/models/polypizza/Elephant.glb` | https://poly.pizza/m/a27MA0rXyyj (file: https://static.poly.pizza/b8ca84f2-02b2-4c84-92c0-b5f8b0eee90e.glb) | Poly by Google | CC-BY 3.0 | 2026-09-25 | renamed to Elephant.glb (mesh/texture untouched) |
| `public/assets/models/polypizza/Lion.glb` | https://poly.pizza/m/3XAJojWxSWz (file: https://static.poly.pizza/34e4de3e-50ac-400e-adab-a13a0825ee1a.glb) | Poly by Google | CC-BY 3.0 | 2026-09-25 | renamed to Lion.glb (mesh/texture untouched) |

Honest notes for the merge:
- hippo/rhino are rigged (idle/walk; no graze/run clip — those blend slots fall back to idle/procedural).
- zebra/buffalo/wildebeest/impala are rigged with 13 clips (Idle, Idle_Headlow, Walk, Gallop, Eating, …);
  the meshes are honest stand-ins of the target species (horse/bull/deer) recoloured at runtime — the
  zebra in particular has no stripes (the mesh has no UVs, so a stripe map is not possible).
- giraffe/elephant/lion are static meshes (no rig exists for these species on poly.pizza — the site's
  Google Poly archive is static-only). `animals/gltfpool.js` loadModel() now synthesises a one-bone
  identity rig for them; they translate/turn but do not articulate. Recorded in the module README.
