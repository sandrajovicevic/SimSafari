# tools — spec

In-game build tools: the player's hands. Owner of `world.selection`. Listens to `tool:request` from ui, drives
terrain/roads/zoning/buildings/animals APIs, renders cursors/ghosts, emits `tool:selected`, `tool:applied`.
Reference: Cities: Skylines II tool feel — snapping, guides, previews, undo.

## Must deliver
* **Tool framework**: `activate(name, options)`, `deactivate()`, `current()`, undo/redo stack (`undo()`, `redo()`, ≥ 50 steps,
  each tool records inverse ops), `ctx.input.toolActive = true` while a tool is active so the camera rig frees the left button.
  Cursor rendering under the pointer via `ctx.app.input.ground` (core raycasts the heightfield each frame).
* **Terrain tools**: raise/lower/flatten/smooth/paint-biome with radius + strength (mouse wheel + shift adjusts radius),
  a ring cursor decal conforming to terrain, continuous application while dragging, cost per m³ charged to `world.economy`.
* **Road tool**: click-to-place points with Catmull-Rom preview ribbon, snapping to nodes/edges (`roads.nearestEdge`),
  grade warning (> 12 % slope shown red), kind selector, cost preview, bulldoze mode. Straight/curve modes.
* **Zone tool**: brush painting of zones with live overlay via `zoning.setOverlay(true)`, fill mode, erase.
* **Building tool**: ghost preview (`buildings.preview`), rotation (R), validity colouring from `canPlace`, place on click, bulldoze.
* **Animal tool**: pick species → click inside a habitat to release (cost), or select an animal to inspect (sets `world.selection`).
* **Select/inspect tool** (default): click picks animal/building/road/habitat (raycast against module groups by name or
  `world` queries), sets `world.selection`, emits `selection:changed`; Esc clears; Delete bulldozes with confirmation event.
* All actions go through module APIs with null checks (missing modules → tool disabled with a `ui:notify`).

## Presets
Tools are interactive, so `stage()` must **replay a scripted session** deterministically: generate terrain (if present),
activate raise tool and apply at 3 points, draw a road with 5 points, paint a habitat, place a lodge and a gate, release
zebras — then leave the road tool active with a live preview ribbon and the cursor visible at a fixed pointer position
(set `ctx.app.input` ndc coordinates manually) so the screenshot shows the tool UI.
Presets: `overview` (after the scripted session, 15 h), `road` (road preview + snapping, 16 h), `terrain` (ring cursor
mid-raise, 16.5 h), `building` (ghost preview red/green, 17 h), `close`, `night`.
