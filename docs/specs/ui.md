# ui — spec

Owns `#ui-root`. Plain DOM + CSS (one `ui.css` injected as a `<style>` string), no framework. Reference: Cities:
Skylines II HUD — restrained dark translucent panels, crisp sans-serif, clear iconography, information density
without clutter. Icons: inline SVG you draw (no image files).

## Must deliver
* **Top bar**: park name, cash (animated count), daily income/expense delta, day + clock (hour:minute from
  `world.time`), visitor count + satisfaction, reputation stars, speed controls (pause/1/3/10 → `app.setSpeed`), weather glyph.
* **Bottom toolbar**: categories → terrain (raise/lower/flatten/smooth/paint), roads (dirt/gravel/paved/bulldoze),
  zones (habitat/visitor/service/erase), buildings (catalogue from `ctx.modules.get('buildings')?.catalogue()` or a
  placeholder list), animals (species list with cost from `animals.allSpecies()`), view (overlays: habitat quality,
  happiness heat, road usage). Selecting emits `tool:request {tool, options}`; `tools` module actually performs it and
  emits `tool:selected`. Keyboard shortcuts shown.
* **Side panel** (right): selection details from `world.selection` — animal (needs bars, happiness, species facts, age),
  building (occupancy, upkeep, staff), habitat (quality per species, area, water, shade), road (kind, traffic).
* **Notifications**: `ui:notify` → toast stack (info/warn/error), auto-dismiss, click to focus (`app.rig.lookAt`).
* **Daily report modal**: on `sim:day` (or via button) show the report with sparkline charts drawn on a `<canvas>` for
  cash/visitors/population (last 30 days).
* **Tooltip** on hover for every control. **Minimap**: 200×200 canvas showing terrain heights/biome + roads + camera frustum, click to jump.
* **Settings**: quality (low/med/high → `?quality=` reload), audio volume (`audio.setVolume`), show FPS.
* Works with any subset of modules missing (null checks everywhere). Never throws into the render loop.
* `api.notify(level, text)`, `api.openPanel(name)`, `api.closePanel()`, `api.setToolbar(items)`, `api.showReport(report)`, `api.setVisible(bool)`.
* Respect `params.noui` (do nothing). Hide itself in other modules' showcases (only `ui` and full game show UI).

## Presets
`overview` (full HUD with realistic mock data if sim absent, 15 h), `report` (daily report modal open), `panel`
(animal selected side panel), `toolbar` (buildings category open), `close`/`night` (HUD over a night scene, 21.5 h).
Stage: populate mock world data so the HUD has something to show.
