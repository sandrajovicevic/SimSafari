# tools — round 5 — score 7.0 / 10 — FAIL

Round 4's blocker (ui never reaching the module) and all the cap-triggering claim failures were
claimed fixed. I verified each with my own real-GPU captures and live page evals — every claim now
reproduces. What remains is genuine spec/perf distance: a terrain stroke still costs ~157 ms/frame,
and the road tool still lacks its spec'd cost preview, straight mode and water warning.

## Screenshots reviewed (path — what I saw, one line each)
All mine: 1280×720, seed 1, real GPU (ANGLE D3D11, AMD RX 5700 XT), every PNG read.
- `tools/shots/tools-overview-15-critic.png` — the scripted session's S-curve gravel road with its bridge over the river, gate and lodge visible; at 640 m the 8 cm raises and the habitat/zebras are not readable (now disclosed by the README rather than claimed).
- `tools/shots/tools-road-16-critic.png` — the live paved preview ribbon snaking along the ridge from the committed road's end; both ribbon edges follow the terrain (r4's flat slab is gone); no red grade stretch on this flat route; the snap ring is not resolvable at this camera distance (live state verified, below).
- `tools/shots/tools-road-16-critic-crop-start.png` / `-crop-roadend.png` (my crops) — ribbon start region at 3×; ring not distinguishable (~2 px at this range).
- `tools/shots/tools-terrain-16.5-critic.png` — the green ring cursor around a modest, smooth raised mound by the lake — bounded (MAX_STROKE_RISE works; no camera-inside-the-mound failure).
- `tools/shots/tools-building-17-critic.png` — the red "invalid" ghost over the real lodge: validity reads unambiguously; ghost still unsorted translucent layers (buildings-side, disclosed).
- `tools/shots/tools-close-16.5-critic.png` — **the selection marker is now visible**: a thin white ring sized to the lodge's footprint and draped over the terrain, exactly what r4 said was missing.
- `tools/shots/tools-night-21.5-critic.png` — the glowing lodge at night with the footprint selection ring clearly visible around it.
- `tools/shots/tools-road-12-critic.png`, `tools/shots/tools-overview-6.5-critic.png` (extras) — road preview and the full session hold at noon and dawn.

## Live claim verification (throwaway page evals, `tools/shots/critic-claims-eval.json`, `critic-tools-eval.mjs`)
| claim | result |
|---|---|
| `tool:request` bridge translates ui vocabulary | **YES** — live: `road.gravel`→road/gravel, `zone.habitat`→zone/HABITAT/paint, `terrain.raise`→terrain/raise, `select`→deactivate; also verified in the **full game** page |
| road preset snap ring marks the committed snapped point (today's fix) | **YES** — `tools-road-snap.visible === true` at (230, 4.4, −10), the exact node the README names |
| selection marker visible + footprint-sized | **YES** — `tools-selection-marker.visible === true`, scale 27.6 on the lodge, draped; visible in close and night PNGs |
| "release 3 zebras" | **YES** — 3 zebras in `world.animals` after the scripted session (r4 measured 2) |
| undo leaves selection on a deleted id | **NO LONGER** — with the lodge selected, full undo (10 ops) clears `world.selection` the moment the lodge is removed and keeps it cleared; redo-all restores 2 buildings + 3 zebras |
| allocations | **Fixed in code** — ribbon reuses a Vector3 pool + one curve keyed on a Float64Array change-detector; RoadTool previews use scratch; RING_COLORS hoisted |

## Contract / errors / perf
| preset | drawCalls (scene) | triangles | errors | tools updateMs (peak) |
|---|---|---|---|---|
| overview 15 | 107 | 3,556,096 | 0 | 0.005 (0.1) |
| road 16 | 140 | 3,654,537 | 0 | 0.014 (0.2) |
| terrain 16.5 | 120 | 3,197,305 | 0 | **156.8 (382.2)** |
| building 17 | 96 | 3,244,605 | 0 | 0.081 (0.2) |
| close 16.5 | 121 | 3,100,958 | 0 | 0.002 (0.1) |
| night 21.5 | 108 | 3,510,374 | 0 | 0.002 (0.1) |
| extra: road 12 | 137 | 3,588,821 | 0 | 0.011 (0.1) |
| extra: overview 6.5 | 106 | 3,523,328 | 0 | 0.005 (0.1) |

- Zero console errors in all eight captures; `modules.tools.status === 'ok'` throughout; every JSON
  reports the real GPU (`ANGLE (AMD … D3D11)`), not SwiftShader.
- tools' own share stays ~5 draw calls (ring, ribbon+markers+snap, selection marker) inside a
  96–140-draw frame — trivially inside budget.
- `node tools/lint.mjs src/modules/tools` → ok; no `Math.random`. `dependencies: []` with optional
  `[terrain, roads, zoning, buildings, animals, simulation]` is truthful; `dispose()` removes all
  four listeners and disposes ring/ribbon/marker/group. Steady-state `update()` allocates nothing
  (stroke objects are event-time, preview paths use scratch/pool — verified in code and by reading
  cursors.js/RoadTool.js).

## Ranked issues (most damaging first)
1. **[major] A held terrain stroke costs ~157 ms/frame (peak 382) inside `tools.update()`** —
   ~100× the 1.5 ms per-module budget (r4 major, still open; my own capture reproduces it). Each
   held frame calls `terrain.raise()`, which runs terrain's full `afterEdit()`. The new
   MAX_STROKE_RISE cap bounds the total height (my mound is modest where r4's could swallow the
   camera) but not the per-frame cost. Fix: accumulate deltas and flush once per stroke-end or on a
   timer via a requested `terrain.beginEdit()/endEdit()` batching API.
2. **[major] The road tool still misses three spec bullets: no length/cost readout, no
   straight mode, no water-crossing warning.** The spec asks for cost preview and straight/curve
   modes; a path dragged into the lake in r4 got no warning and nothing changed. All three are now
   at least disclosed in Known gaps, but they are must-deliver lines, not nits.
3. **[minor] The snap ring and 0.55 m node markers are unresolvable at the road preset's camera
   distance** — live state says `visible: true` at the right node (the fix is real), but the
   capture cannot show it: a 2.6 m ring at ~300 m is ~2 px. A closer preset camera or a
   screen-space constant-size ring would make the affordance actually readable, CS2-style.
4. **[minor] Grade warning (>12 % red) is never demonstrated** — the mechanism is in the code and
   the flat ridge route shows all-green; no preset or capture exercises the red path.
5. **[minor] Shift+wheel radius adjustment still conflicts with CameraRig zoom** (core owns the
   wheel listener; the one-line core request is still pending). `[`/`]`/`,`/`.` work.
6. **[minor, disclosed] Undo/redo of road/building/animal mints new ids** — documented; my redo
   round trip restored positions/kinds correctly under new ids.

## What is genuinely good
- The tool framework is now fully wired end-to-end: the ui vocabulary lands on `activate()` in
  both the showcase and the live game, every entry point is error-isolated, and the whole scripted
  session runs through public APIs with symmetric, log-backed costs.
- Undo/redo is exact: full undo/redo round trip restored 2 buildings and 3 zebras; selection
  hygiene around undo is correct; the Delete two-press confirm and Escape paths were verified in
  r4 and unchanged.
- The three cursor artefacts (ring, ribbon, marker) are pre-allocated, mutate typed arrays in
  place, and the ribbon now drapes both edges over the terrain — the preview reads as a road bed,
  not a slab.
- Honesty: the README's preset table now says exactly what each shot shows (including that the
  raises are invisible at 640 m), and the measured table matches my captures.

## Verdict
**FAIL, 7.0 — good indie.** Nothing is broken and nothing is false any more: the r4 blocker and all
claim caps are cleared with live evidence. It stays below the pass line on real substance — a
brush that hitches at ~100× the frame budget and a road tool without cost preview, straight mode or
water warning are the difference between "works" and CS2-grade tool feel.

```json
{
  "module": "tools",
  "update": {
    "score": 7.0,
    "round": 5,
    "status": "fail",
    "errors": 0,
    "drawCalls": 140,
    "issues": [
      { "sev": "major", "text": "Held terrain stroke costs ~157 ms/frame (peak 382) in tools.update() - ~100x the 1.5 ms budget; each frame runs terrain's full afterEdit. MAX_STROKE_RISE bounds total height but not per-frame cost; needs a batched/deferred terrain edit API" },
      { "sev": "major", "text": "Road tool missing spec bullets: no length/cost readout, no straight/curve mode, no water-crossing warning (now disclosed in Known gaps, still unimplemented)" },
      { "sev": "minor", "text": "Snap ring and 0.55 m node markers unresolvable at the road preset's camera distance (ring live-verified visible at the committed node, but ~2 px in frame); needs a closer camera or screen-space sizing" },
      { "sev": "minor", "text": "Grade-warning red path (>12%) never demonstrated in any preset or capture" },
      { "sev": "minor", "text": "Shift+wheel radius adjust conflicts with CameraRig zoom (core request pending); keyboard brackets/comma/period are the reliable path" },
      { "sev": "minor", "text": "Undo/redo of road/building/animal actions mints new entity ids (documented; positions/kinds restore correctly)" }
    ],
    "good": "r4 blocker cleared: tool:request bridge verified live in showcase AND full game with the full ui vocabulary; selection marker footprint-sized, draped, visible day and night; snap ring live-verified marking the committed snapped node; 3 zebras released (r4: 2); full undo/redo round trip exact with selection cleared the moment a selected entity is removed; preview paths allocation-free; ribbon conforms to terrain; bounded strokes; 0 console errors in 8 real-GPU captures; ~5 own draw calls."
  }
}
```
