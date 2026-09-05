# zoning — spec

Owner of `world.grid.zone`, `world.grid.habitatId`, `world.habitats`. Reference: Cities: Skylines II zoning overlay
and Planet Zoo habitat barriers.

## Must deliver
* **Painting API**: `paint(x, z, radius, zone)`, `paintCells(indices, zone)`, `erase(...)`, `fill(x,z,zone)` (flood on
  same zone/terrain), `getZone(x,z)`. Zones: HABITAT, VISITOR, SERVICE, NO_BUILD (auto for water/roads). Emits `zone:changed`.
* **Habitats**: contiguous HABITAT regions become `world.habitats` entries (flood fill on change, stable ids across edits).
  Per habitat compute: `area` (m²), `water` (fraction of cells with water within 30 m), `shade` (tree cover from
  `ctx.modules.get('props')?.coverAt(x,z)` else 0), `cover` (shrubs/rocks), `roughness` (terrain slope), `grass`
  (biome grass fraction), `species` set (from `world.animals` inside), `fenced` (boundary cells with fences).
  `getHabitat(id)`, `habitatAt(x,z)`, `listHabitats()`, `getHabitatQuality(id, species)` (delegate to
  `ctx.modules.get('simulation')?.scoreHabitat` else local formula from species prefs), `boundary(id)` → polyline.
  Emits `habitat:changed`.
* **Rendering**: (a) a ground overlay decal (custom shader over the terrain: tinted cells with soft edges, animated
  dashed boundary, only visible when `api.setOverlay(true)` or a zoning tool is active); (b) **fences** along habitat
  boundaries: instanced wooden posts + wire/rail, or stone walls near lodges, conforming to terrain, gates where roads
  cross; (c) a visitor-zone path/boardwalk texture tint. Overlay off by default in the game; showcase shows it on.
* **Queries for others**: `cellsInRadius`, `isBuildable(x,z,w,d)`, `nearestHabitat(x,z)`.

## Presets
`overview` (three painted habitats with fences + overlay on, 15 h), `close` (fence detail at 15 m, 16.5 h), `overlay`
(top-down with overlay), `night` (21.5 h).
Stage: generate terrain if the terrain module exists, paint habitats, spawn a few animals inside if animals exists.

## Budget
≤ 20 draw calls (overlay 1–2, fences instanced ≤ 6).
