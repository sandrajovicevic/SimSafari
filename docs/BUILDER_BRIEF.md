# Builder brief (all modules)

You are the builder for exactly one module. You own `src/modules/<id>/` and nothing else.

## Before you write code
1. Read `ARCHITECTURE.md` (contract), `CLAUDE.md` (rules), `src/modules/README.md` (skeleton), `docs/specs/<id>.md` (your target).
2. Read `src/core/World.js`, `src/core/Textures.js`, `src/core/Materials.js`, `src/core/ModuleRegistry.js` — this is the API you build on.
3. Check `ls src/modules/` — other builders are working in parallel. Their modules may or may not exist yet.
   Declare `dependencies` truthfully but make your `stage()` work when a dependency is missing
   (`ctx.modules.get(id)` returns null; `world.getHeight` returns 0 on a flat world).

## Environment facts
* Dev server is already running at http://127.0.0.1:5173 (Vite, HMR). **Never start another, never kill it.**
* `node tools/screenshot.mjs --module <id> --preset <p> --tod <h>` writes `tools/shots/<id>-<p>-<h>.png` + `.json`.
  It renders with SwiftShader (software). fps in the JSON is meaningless; `drawCalls`, `triangles`, `errors` are real.
  A screenshot takes 10–60 s. If Vite reloads mid-shot (another builder saved a file) just re-run once.
* No network. No CDN. No downloaded assets. Everything procedural: `ctx.textures.gpu()` / `.pbr()` for textures,
  code-built geometry, WebAudio synthesis. `Math.random()` is banned (`ctx.rng`). `node tools/lint.mjs src/modules/<id>` must pass.
* three r185 (`import * as THREE from 'three'`; addons via `three/examples/jsm/...`). Vite 8. ES modules only.

## Quality bar
"Never programmer art." A flat-colour box, an untextured cylinder, a stock `MeshBasicMaterial`, visible texture tiling,
z-fighting, unlit black night, hard shadow acne — all instant fails.
Every surface needs albedo variation + normal detail + roughness variation. Every silhouette needs enough
polygons to read as the real object at the showcase camera distances. Everything at scale in metres
(a zebra is 1.3 m at the shoulder; an acacia 6–12 m; a safari road 4–6 m wide; a lodge 10–30 m).

## Deliverables (all mandatory)
1. `src/modules/<id>/index.js` — module definition per contract.
2. `src/modules/<id>/showcase.js` — presets (≥ `overview`, `close`, `night`, plus the ones in your spec) + `stage(ctx, preset)`.
3. `src/modules/<id>/README.md` — purpose, public API (every function with signature), events emitted/consumed, presets, perf numbers you measured, **Known gaps** (honest list).
4. Screenshots of every preset, **looked at** (Read the PNG). Fix what looks wrong. Repeat.
5. `docs/requests/<id>.md` only if you need a change in `src/core/` (what/why/proposed diff). Do not edit core yourself.
6. Final report in your last message: what exists, preset → screenshot path → what it shows, draw calls / triangles per preset, console errors (must be 0), known gaps. Real numbers only.

## Don'ts
* Don't commit or run git. The orchestrator commits.
* Don't edit anything outside your folder (except creating `docs/requests/<id>.md`).
* Don't `import` from another module's folder.
* Don't claim it works without a screenshot you looked at.
* Don't spend more than ~15% of your effort on things not visible in the showcase; ship, screenshot, iterate.
