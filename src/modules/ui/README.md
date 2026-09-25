# ui

The HUD and every DOM panel — top bar, category toolbar, minimap, notification stack, selection and
report panels, settings. Plain DOM/CSS rendered into `#ui-root` outside the canvas (index.html), so
a UI exception can never stop rendering. The only module allowed to read the DOM besides `tools`
(ARCHITECTURE §2). `drawCalls` contribution: zero — it draws nothing into the WebGL canvas.

## How it works

* `index.js` — module wiring: visibility rules, keyboard map, event subscriptions, `#ui-root` setup.
* `topbar.js` / `toolbar.js` / `minimap.js` / `notify.js` / `report.js` / `settings.js` /
  `sidepanel.js` / `tooltip.js` / `species.js` — one file per surface, all sharing `dom.js` helpers
  and styled by the injected stylesheet `ui.css.js`.
* Visibility: shown in the full game; **hidden automatically while another module's showcase is
  up** and with `?noui=1` (park's demo relies on both rules).
* **Credits panel (2026-09-25)**: a static "Credits" section in the settings modal listing the
  CC-BY assets shown in-game — currently "Animal models (giraffe, elephant, lion): Poly by Google,
  CC-BY 3.0, via poly.pizza" — per ARCHITECTURE §8, kept in sync by hand with the CC-BY rows of
  `docs/ASSETS.md` (`CREDITS` in `settings.js`; never fetched at runtime). Reachable from the
  top-bar gear button, the `O` key, or `openPanel('settings')`. No network, no dependencies, zero
  per-frame cost (built once per settings-open); rendered through `dom.js`'s `el()`/null-filtering
  append — never native `Element.append` (which stringifies null arguments into visible text, the
  09-22 toolbar bug).
* Keyboard: `Space` pause · `,`/`.` speed (steps 1/3/10) · `J` report · `O` settings · `M` minimap ·
  `H` hide UI · `1`–`9` toolbar categories.

## Public API — `ctx.modules.get('ui')`

```js
notify(level, text, opts?)            // level 'info'|'warn'|'error'|'good';
                                      // opts {title, sub, x, z, ttl} — also via the ui:notify event
openPanel(name)                       // 'report' | 'settings' | 'selection' | a toolbar category:
                                      //   'terrain' 'roads' 'zones' 'buildings' 'animals' 'view'
closePanel()
setToolbar(items)                     // replace the category toolbar contents
showReport(report?)                   // open the daily report panel (defaults to the latest sim report)
setVisible(bool) / isVisible() → bool
setParkName(name) / getParkName() → string   // also via buildings.setParkName
showFps(on)                           // perf readout in the top bar
setSpeed(mult)                        // 0 | 1 | 3 | 10 — internal: app.setSpeed(0.05 * mult)
refresh()                             // full re-render of all surfaces from world state
getState() → object                   // panels open, speed, settings, notification history
isEnabled() → bool
```

### Events

| event | direction | payload |
|---|---|---|
| `ui:notify` | consumes (and emits for its own toasts) | `{level, text, title?, sub?, x?, z?, ttl?}` |
| `tool:selected`, `tool:applied` | consumes | toolbar highlight, toast text |
| `economy:updated` | consumes | top-bar cash/income |
| `weather:changed` | consumes | top-bar weather readout |
| `time:set`, `sim:day` | consumes | clock/date; `sim:day` auto-shows the report + bankruptcy toast |
| `selection:changed` | consumes | selection panel contents |
| `module:failed` | consumes | error toast naming the module |
| `animal:spawned`, `building:placed` | consumes | toast + minimap markers |
| `core:ready` | consumes | initial population of all surfaces |

## Modules consumed (all optional, all null-checked)

`simulation` (top bar + report), `animals` (species panel), `buildings` (park name), `tools`
(toolbar wiring), `audio` (click/hover sounds — via `play('click')`, the key in audio's sound
table), `environment` (weather readout), `terrain` (minimap sampling).

## Presets

| preset | tod | what it shows |
|---|---|---|
| `overview` | 14 | full HUD over the live game |
| `report` | 14 | daily report panel open |
| `settings` | 15 | settings modal open (graphics/audio/shortcuts + CC-BY credits section) |
| `panel` | 14 | settings/selection side panel |
| `toolbar` | 14 | every category toolbar expanded |
| `close` | 16 | HUD over a near camera |
| `night` | 22 | HUD legibility on the night grade |

Use `node tools/screenshot.mjs --module ui --preset <p> --dom` — the DOM surfaces only appear in
full-page (`--dom`) captures.

## Measured

Draw calls: **0** (pure DOM). Console errors from `ui`'s own code: 0. Two errors from *other*
modules surface while capturing `ui`'s own showcase (see "Known gaps" — not `ui`'s code, not fixed
here): `tools`/`roads` throw while `building.place` is the active tool (`toolbar` preset, both
1280×720 and 1920×1080), and a NaN `BufferGeometry` position turns up in the `night` preset.

## Round 5 fixes (2026-09-25)

* **Facts grid** (`panel`): `.sf .fact .col` is now `display:flex; flex-direction:column` and
  `.sf .fact .v` is `display:block`, so long values wrap onto their own line under the key instead of
  running into it.
* **HUD overlap at 1280×720** (`toolbar`, `close`, `panel`): `.toolbar` is now positioned with
  `left`/`right` insets (236px for the minimap, growing to 368px via `.sf:has(.side:not([hidden]))`
  when the side panel is open) instead of `left:50%` centred on the full viewport, so the item panel
  and category bar never run under the minimap or an open side panel. Verified clear at both 1280×720
  and 1920×1080 (asymmetric insets mean the toolbar sits slightly right of true centre at 1920 — a
  minor cosmetic trade-off for guaranteed clearance, not an overlap).
* **Daily report contradiction** (`report`): `mock.js` no longer overwrites the last history point's
  cash after the fact (that was the $30k jump). It now fixes today's income/expenses to `e.income`/
  `e.expenses` and picks a starting cash so the running total lands exactly on `e.cash`, so the
  Treasury tile's "+today" delta always agrees with the header's "Profit".
* **Active-tool pill/highlight showed the raw tool id, no card highlighted** (`toolbar`): two bugs,
  both fixed. (1) `defaultCategories()` read `b.type`/`b.id` off the buildings catalogue, but real
  catalogue rows (`buildings/catalogue.js`) key each type as `b.key` — every building card's tool
  options was silently `{type: undefined}`. (2) the `tools` module re-broadcasts its own `{tool,
  options}` shape via `tool:selected` (`'building.place'` comes back as `'building'`, with extra
  `rot`/`bulldoze` fields), which the toolbar's strict tool-id + exact-options match never resolved.
  `findItem()` now falls back to matching the catalogue by the identifying option key
  (`type`/`species`/`overlay`/`biome`); pill, card and category highlighting all resolve through one
  `resolveActiveItem()`.
* **Tooltip covered the item panel's header hint** (`toolbar`): toolbar cards now pass
  `data-tip-pos="side"`; `tooltip.js` places that tooltip beside the card instead of above it.
* **Top-bar temperature fixed at 28°**: `mock.js` now always sets `world.weather.temperature` from
  the same diurnal formula `environment`'s own `tick()` uses, instead of only when `environment` is
  absent — `environment`'s real model converges too slowly (a per-tick lerp) to move visibly across a
  showcase capture's few settle frames, so the readout sat near its startup default regardless of tod.

## Known gaps (honest)

* **An empty dark notification panel can appear top-right** in the game view (empty stack container
  is not hidden when it has no children) — known minor from the wave-1 review, not yet fixed.
* Only 5 of the 16 real building catalogue types (`gate`, `lodge`, `hide`, `ranger`, `shop`) have a
  dedicated icon; the rest fall back to the generic house glyph (round-5 critic minor #6, left as is —
  the icon-resolution bug that made this worse than intended is fixed, but drawing 11 more icons is
  out of scope for this round).
* Selected mock subjects are still not spawned into the 3D view (`panel`'s elephant, `night`'s lodge)
  — mock data is written straight into `world` rather than through each owning module's spawn/place
  API (disclosed since round 4, unchanged).
* No tooltips on every toolbar entry; the graph panel (population/cash history curves) is a stub
  compared to the spec's vision.
* Keyboard map is fixed; no rebinding UI.
* Speed steps (1/3/10) multiply a 0.05 game-hours/second base — the raw `world.time.speed` values
  (0.05/0.15/0.5) are not surfaced anywhere.
* Minimap repaints on a 1 s cadence, not per frame — fast vehicle movement judders on it.
* No responsive/mobile layout; assumes ≥ 1280 px wide (verified this round at 1280×720 and 1920×1080).
* Two console errors seen while capturing `ui`'s own showcase come from other modules, not from `ui`:
  `tools`' `BuildingTool.update()` throws (`roads.graph.js: nearestOnPolyline` reads `[0]` of an
  undefined polyline) whenever `building.place` is the active tool over the mock world (`toolbar`
  preset); and the `night` preset logs a NaN `BufferGeometry` bounding-sphere warning (a ring mesh
  with `null`/NaN Y values — likely the buildings selection-ring code, going by recent `git log`).
  Neither is in `src/modules/ui/`; not fixed here, flagged for the integrator.
* README (this file) written 2026-09-05 by the integrator; the original builder's docs were lost to
  the API spend limit. Code is the builder's except the two `play('ui_click')` calls corrected to
  audio's actual `'click'` key (they silently played nothing before).
