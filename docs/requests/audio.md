# audio → core change requests

None of these block the module; they improve how the integrator/critic can verify it.

## 1. Let the screenshot tool start audio (autoplay flag)

**What:** add `'--autoplay-policy=no-user-gesture-required'` to `gpuArgs` in `tools/screenshot.mjs`.

**Why:** without it the `AudioContext` created by `audio`'s `stage()` stays `suspended` in headless Chrome
(no trusted gesture), so the core screenshot JSON can never show live bus levels and the canvas rings /
event log stay empty. `src/modules/audio/shot.mjs` works around it with its own launch, but the critic
uses the core tool.

```diff
-  const gpuArgs = ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--disable-gpu-sandbox', '--no-sandbox'];
+  const gpuArgs = ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--disable-gpu-sandbox', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'];
```

## 2. Optional DOM capture

**What:** a `--dom` flag in `tools/screenshot.mjs` that uses `page.screenshot()` instead of
`renderer.domElement.toDataURL()`.

**Why:** `capture()` only reads the WebGL canvas; modules whose showcase lives in `#ui-root`
(`ui`, `audio`'s analyser panel) are invisible in `tools/shots/*.png`. `page.screenshot` includes both.

```diff
   if (stats?.dataUrl) {
-    fs.writeFileSync(pngPath, Buffer.from(stats.dataUrl.split(',')[1], 'base64'));
+    if (args.dom) await page.screenshot({ path: pngPath });
+    else fs.writeFileSync(pngPath, Buffer.from(stats.dataUrl.split(',')[1], 'base64'));
```

## 3. (nice to have) per-module `api` in the JSON report

**What:** after `capture()`, if `registry.get(module)?.selfTest` exists, await it and include the result
under `report.selfTest`.

**Why:** gives the critic the `{sound: rmsDb}` table without a second tool. Optional — `shot.mjs` already
writes `tools/shots/audio-<preset>-<tod>-dom.json` with it.

## Notes for the integrator (no change requested)

* `audio` reads `world.weather` every frame and does not need `weather:changed` beyond resetting timers;
  `environment` may add `weather.storm: boolean` — `audio` honours it if present (falls back to `rain > 0.5`).
* `audio` listens for `animal:state` and plays the species call when `state` matches
  `/call|roar|trumpet|bark|whoop|vocal|alarm|hunt|fight|rumble/i` — if `animals` uses other state names,
  emitting `audio:play {sound: species, x, z}` works too.
* `traffic` should call `ctx.modules.get('audio')?.engine(id, {x, z, rpm})` per vehicle each frame (throttling
  to ~10 Hz is fine) and `engine(id, null)` on despawn (`vehicle:despawned` is also handled).
