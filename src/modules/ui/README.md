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
| `panel` | 14 | settings/selection side panel |
| `toolbar` | 14 | every category toolbar expanded |
| `close` | 16 | HUD over a near camera |
| `night` | 22 | HUD legibility on the night grade |

Use `node tools/screenshot.mjs --module ui --preset <p> --dom` — the DOM surfaces only appear in
full-page (`--dom`) captures.

## Measured

Draw calls: **0** (pure DOM). Console errors across its presets: 0 (verified in the wave-1
integration pass; re-verified after the `ui_click`→`click` sound-key fix, 2026-09-05).

## Known gaps (honest)

* **An empty dark notification panel can appear top-right** in the game view (empty stack container
  is not hidden when it has no children) — known minor from the wave-1 review, not yet fixed.
* No tooltips on every toolbar entry; the graph panel (population/cash history curves) is a stub
  compared to the spec's vision.
* Keyboard map is fixed; no rebinding UI.
* Speed steps (1/3/10) multiply a 0.05 game-hours/second base — the raw `world.time.speed` values
  (0.05/0.15/0.5) are not surfaced anywhere.
* Minimap repaints on a 1 s cadence, not per frame — fast vehicle movement judders on it.
* No responsive/mobile layout; assumes ≥ 1280 px wide.
* README (this file) written 2026-09-05 by the integrator; the original builder's docs were lost to
  the API spend limit. Code is the builder's except the two `play('ui_click')` calls corrected to
  audio's actual `'click'` key (they silently played nothing before).
