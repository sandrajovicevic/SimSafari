# Core change requests — simulation

Builder: simulation. None of these block the module; they are seams found while verifying it.

## 1. Screenshot tool: capture the DOM for headless / UI modules (medium)

**What.** `tools/screenshot.mjs` writes the PNG from `renderer.domElement.toDataURL()` (`__SIM__.capture(true)`), so
anything a module puts in `#ui-root` is invisible in the shot. The spec for `simulation` asks for a DOM panel in
`#ui-root`; the module therefore also renders the same dashboard canvas as a `CanvasTexture` on a camera-facing quad so
the WebGL capture contains it. That is a workaround; `ui` will hit the same wall.

**Proposed diff.** In `shoot()`, after `stats = await page.evaluate(() => window.__SIM__.capture(true))`, when the page
reports `window.__SIM__.captureDom === true` (a module sets it in `stage()`), replace the PNG with a full-page Playwright
screenshot, which composites canvas + DOM:

```js
const wantDom = await page.evaluate(() => !!window.__SIM__.captureDom);
if (wantDom) { await page.screenshot({ path: pngPath }); delete stats.dataUrl; wrotePng = true; }
```

and in `App._exposeSim()` add `captureDom: false` to the `sim` object so modules can set it. Once this exists the
simulation showcase can drop the WebGL quad (`showcase.js`, section 4b) and keep only the DOM panel.

## 2. Showcase: a way to load a module *without* its optional dependencies (medium)

**What.** `ModuleRegistry.load()` always queues every `optional` module that exists. While other builders work in
parallel, their import/shader errors (e.g. `roads` syntax error at import, a `ShaderMaterial` using the reserved word
`patch`) land in *my* showcase's `errors[]`, and their init time (2 minutes under SwiftShader) dominates my shot.
Verifying a module in isolation is currently only possible by temporarily editing its `optional` list.

**Proposed diff.** A URL param `nooptional=1` (parsed in `Showcase.js` → `params.nooptional`) and, in
`ModuleRegistry.load()`:

```js
for (const d of rec.def.optional || []) if (!this.app.params.nooptional && this.available.includes(d)) queue.push(d);
```

plus `--no-optional` in `tools/screenshot.mjs` that appends `&nooptional=1`. The critic can then shoot both variants.

## 3. Vite full reloads during screenshots (low)

Every save by any builder triggers a full page reload (modules are lazily imported through `import.meta.glob`, no HMR
boundary), which kills `page.evaluate` mid-capture ("Execution context was destroyed"). During the parallel wave roughly
half of my shots died this way and had to be retried. A `--retries N` flag in `tools/screenshot.mjs` (re-run `shoot()` when
`fatal` matches /Execution context was destroyed/) would make `--all` runs reliable.

## 4. `world.time` for headless runs (info only, no change needed)

The simulation keeps its own clock when core does not drive it (`sim.tick(simDt)` without hour/day) so the showcase can
fast-forward 60 days while `world.time` stays paused. In the game `index.js` passes `world.time.hour/day` into
`sim.tick()` every core tick, so the sim's day always equals `world.time.day`. Documented here so the integrator knows
`report.day` in showcase mode is the sim's day, not `world.time.day`.
