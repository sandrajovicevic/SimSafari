# buildings — spec

Owner of `world.buildings` and `world.grid.occupancy` (BUILDING). Reference: real safari lodges (thatched roofs,
timber decks, stone bases), Cities: Skylines II building quality; Planet Zoo facilities.

## Must deliver
* **Catalogue** (`catalogue.js`): entrance gate + ticket office, safari lodge (12 rooms, thatched roof, timber deck,
  pool), tented camp unit, restaurant/bar, gift shop, ranger station, veterinary clinic, workshop/garage, water hole
  pump + trough, hide (viewing shelter on stilts), viewing platform/tower, feeding station, staff village houses,
  parking, toilets, fence gate. Each: footprint (w×d m), cost, upkeep, staff, capacity, visitor appeal, placement
  rules (needs road access within 20 m, flat ≤ 8°, not water, zone requirement).
* **Meshes**: hand-built from geometry primitives with real detail: thatch as layered bevelled roof with noise-displaced
  edge, timber posts and beams, stone plinths (procedural stone PBR), windows with emissive interiors at night, decks
  with railings, water tanks, solar panels, satellite dish, signage with the park name, lamps. ≥ 6 materials via
  `ctx.textures.pbr()` (thatch, timber, stone, corrugated iron, plaster, canvas). Merge each building type into ≤ 3
  draw calls; instance repeated types. Cast/receive shadows. Night emissive windows + lamp glow (bloom will pick it up).
* **API**: `catalogue()`, `canPlace(type, x, z, rot)` → `{ok, reasons[]}`, `place(type, x, z, rot)` → id, `remove(id)`,
  `get(id)`, `list(type?)`, `preview(type, x, z, rot, valid)` (ghost mesh for the build tool), `setState(id, {staff, visitors})`,
  `findNearest(type, x, z)`. Emits `building:placed/removed`. Flattens terrain under the footprint via terrain API if present.

## Presets
`overview` (lodge complex: gate, lodge, restaurant, shop, hide, tower on terrain, 16 h), `lodge` (close on lodge, 17.5 h),
`gate` (entrance, 10 h), `close` (thatch/timber detail at 8 m), `night` (21.5 h, lit windows and lamps).

## Budget
≤ 60 draw calls for the overview complex, ≤ 400 k tris.
