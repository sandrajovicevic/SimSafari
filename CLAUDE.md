# SimSafari — rules for agents

Read `ARCHITECTURE.md` first. It is the contract; this file is the short version.

## Roles
- **Builder**: owns exactly one folder `src/modules/<id>/`. Never edits anything outside it.
  Needs from core go in `docs/requests/<id>.md` (what, why, proposed diff) — the integrator applies them.
- **Integrator**: the only writer to `src/core/`, `index.html`, `vite.config.js`, `tools/`, `ARCHITECTURE.md`, `docs/STATUS.json` schema.
- **Critic**: writes no code. Screenshots, scores, writes `docs/critic/<id>-round<n>.md`, updates `docs/STATUS.json` for its module.

## Colour authoring — READ THIS BEFORE TOUCHING ANY ALBEDO

`core/Textures.js` had an sRGB **double-encode** bug: `gpu()` encoded to sRGB in the shader *and*
allocated the render target with `SRGBColorSpace` (an sRGB internal format, so the GPU encodes again
on write). Measured: linear `0.216` was stored as byte **188** instead of **128** — every albedo in
the project was ~37% too bright. That, not ACES tone mapping, was the real cause of the
washed-out-toward-white look.

**Fixed** (2026-09-02). In the `srgb: true` path your snippet's output is written as **linear** and
the GPU does the single conversion. Do not encode to sRGB yourself.

Consequences you must respect:

* **Author true colours.** Do not darken or over-saturate "to compensate". That workaround is now wrong.
* **If your module already contains such compensation, REMOVE it.** Known affected: `props`
  (bark/foliage now read near-black), and any darkening applied in `animals`, `terrain` or `roads`
  during round 2. Check `git log` for your folder before adding more.
* Verify with a screenshot you actually look at, not by reasoning about the numbers.

## Hard rules
- Metres, +Y up, world centred at origin, `world.size` = 1024 m.
- No `Math.random()`; use `ctx.rng` (seeded) / `ctx.noise`. `node tools/lint.mjs` enforces this.
- No network: no `fetch`, no CDN imports. Everything procedural (`ctx.textures`, code-built meshes, WebAudio synthesis).
- No cross-module imports. Talk through `ctx.modules.get(id)` and `ctx.events`.
- `init()` must not throw. Wrap risky work, log via `ctx.log.error`.
- Zero per-frame allocations in `update()`. Instancing for > 20 copies. LOD beyond 300 m.
- Every module ships `showcase.presets` with at least `overview`, `close`, `night` and a `stage(ctx, preset)` that builds a representative scene of that module alone (it may use dependencies' APIs).
- Every module has a `README.md` with: purpose, public API, events, presets, **known gaps** (honest).
- Never claim something works without a screenshot you have looked at:
  `node tools/screenshot.mjs --module <id> --preset <p> --tod <h>` → `tools/shots/<id>-<p>-<h>.png` + `.json`. Then **Read the PNG**.
- The dev server must stay up: `npm run dev` (port 5173). Never kill it. Never run a second one.
- Do not commit. The orchestrator commits.

## Scoring (critics)
10 indistinguishable from reference · 8.5 AAA with nits · 7 good indie · 5 programmer art · 0 broken.
Pass = ≥ 8.5 AND zero console errors AND within budget (≤1500 draw calls total, module soft caps in ARCHITECTURE §7).
Scores are never inflated. Report real numbers.

## Verification cheatsheet
```
npm run dev                                   # once, keep running
node tools/screenshot.mjs --module terrain --preset overview --tod 16
node tools/screenshot.mjs --module terrain --all-presets
node tools/screenshot.mjs --all
node tools/screenshot.mjs --game --all-presets
node tools/screenshot.mjs --probe             # modules + presets JSON
node tools/lint.mjs src/modules/terrain
```
`tools/shots/*.json` has `errors`, `drawCalls`, `triangles`, `fps` (software GL — not representative), `modules` status.
