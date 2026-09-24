# Asset register

Every file under `public/assets/` must have a row here (ARCHITECTURE §8). No row → not allowed in the repo.
CC-BY entries must also appear in the in-game credits panel.

| path | source URL | author | licence | added | modifications |
|---|---|---|---|---|---|
| `public/assets/models/khronos/Fox.glb` | https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/Fox | PixelMannen (model); tomkranis (rigging & animation); @AsoboStudio, @scurest (glTF conversion) | model CC0 1.0; rig/animation and conversion CC-BY 4.0 | 2026-09-24 | none. **Test fixture only** (`animals/gltfpool.js` FIXTURES, `?animalModel=species:fox`), never mapped to a shipped species. CC-BY credit required if it is ever shown in-game. |
