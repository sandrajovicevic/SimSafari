# roads — round 3 — score 7.5 / 10 — FAIL

## Screenshots reviewed (path — what I saw, one line each)
- `tools/shots/roads-overview-15.png` — loop network: paved spine, gravel loop, dirt tracks, two timber bridges crossing the river bends, all correctly terrain-conforming with visible colour differentiation between the three road kinds at a glance.
- `tools/shots/roads-close-16_5.png` — dirt two-track at 20 m: convincing tyre ruts, dust-blended shoulders fading into surrounding laterite/grass with no hard edge, timber bridge visible in the distance.
- `tools/shots/roads-paved-10.png` — tar road: correct crown, dashed centre line, solid edge lines, km-stone visible; the asphalt surface itself has a swirly, streaky "brushed" macro pattern that reads more like sand-blasted concrete or fabric weave than worn tarmac aggregate.
- `tools/shots/roads-junction-17.png` — 3-way paved/dirt/gravel junction with a fingerpost sign: clean blended patch, no z-fighting between the three surfaces, correct transition; same swirly asphalt texture visible here too.
- `tools/shots/roads-bridge-9.png` — timber bridge over the river: genuinely excellent — correct plank deck, railings, slight arch, water flowing underneath, cliff backdrop; the strongest single shot in the module.
- `tools/shots/roads-night-21_5.png` — night: reflective dashed paint clearly glowing, warm solar-lamp pools of light at the junction and at a signpost — reads as a legible, atmospheric night road scene, unlike the near-total-black nights seen in terrain/environment/animals (correctly attributed in the README to roads' own self-contained emissive elements).
- `tools/shots/roads-critic-paved-closer.png` (my extra angle: paved preset, camera pushed to ~10 m distance/pitch 10 instead of the preset's 42 m/pitch 15) — confirms the swirly asphalt macro-pattern at close range is a real texture characteristic, not a screenshot-distance artifact; it does not read as fine aggregate speckle at any distance tested.
- `tools/shots/roads-critic-stats.png` + eval readback (my extra check) — called the module's own `stats()` directly: 12 edges / 11 nodes / 5 junctions / 2,573 m total length, `build: {drawables: 9, triangles: 44,753, junctions: 5, bridges: 9, props: {posts:5, boards:15, stones:6}}`. Confirms the README's claim that roads' own geometry is far inside the spec's ≤ 40 draws / ≤ 200k triangle budget for a 20-edge network — the frame-wide totals (up to 1.49 M triangles) are entirely terrain/environment sharing the scene, exactly as documented.

## Contract / errors / perf (table: preset, drawCalls, triangles, errors — frame totals; roads' own geometry verified separately at 9 drawables / 44,753 triangles)
| preset | drawCalls (frame) | triangles (frame) | errors | roads updateMs |
|---|---|---|---|---|
| overview (15h) | 66 | 1,492,149 | [] | 0.046 |
| close (16.5h) | 60 | 1,197,673 | [] | 0.000 |
| paved (10h) | 60 | 1,197,673 | [] | 0.045 |
| junction (17h) | 64 | 1,264,057 | [] | 0.045 |
| bridge (9h) | 65 | 1,329,169 | [] | 0.094 |
| night (21.5h) | 67 | 1,361,937 | [] | 0.051 |

Zero console errors on all 6 presets plus both extra shots. `modules.roads.status === 'ok'` throughout. Roads' own contribution (9 drawables, 44,753 triangles for the 12-edge showcase network) is comfortably inside the spec's ≤ 40 draws / ≤ 200k triangle budget; `update()` cost is negligible (< 0.1 ms every preset, far under any reasonable per-module ceiling).

## Ranked issues (most damaging first)

1. **[minor] Asphalt macro-texture reads as a swirled/brushed pattern rather than fine aggregate.** Visible identically at `paved`, `junction`, and my extra close-in angle — the tar surface has large-scale wispy streaks that look more like sand-blasted concrete, brushed fabric, or wood grain than the fine, uniform pebble-speckle-with-cracks-and-patches the spec calls for ("asphalt with cracks/patches"). Real worn tarmac (the Kruger-tar reference) reads as much finer-grained and more uniform at this range. This is the one clear visual weak point in an otherwise strong module — fix direction: reduce the macro-noise amplitude/frequency on the asphalt layer and add finer aggregate speckle plus discrete crack/patch features rather than one continuous swirl field.
2. **[minor, disclosed] `sampleEdge`'s allocation footgun is honestly documented** but is a real API sharp edge for `traffic` to get wrong (passing a plain `{x,z}` object throws rather than degrading gracefully).
3. **[minor, disclosed] Showcase network uses fixed control-point coordinates** rather than deriving from `terrain.getFeatures()` — works today via the dynamic bridge re-targeting, but is seed-fragile in principle, as the README itself notes.

## What is genuinely good
- The timber bridge is the standout asset in the module: correct deck, railings, slight arch, and clean integration with the water below — this alone reads close to the Cities: Skylines II / Kruger reference bar.
- Dirt two-track at `close` range is convincing: tyre ruts, dust-blended shoulders with no visible mesh boundary, correct scale.
- Night lighting is the best-executed night scene of any module reviewed so far in this project — genuinely legible via its own reflective paint and lamp glow, not reliant on ambient fixes elsewhere.
- Junction blending (paved/dirt/gravel meeting at one node) shows no z-fighting or visible seams.
- Own-module budget is comfortably met — verified directly via `stats()`, not just taken on the README's word.
- `index.js` API matches the README's table; `dispose()` releases every material, every named texture (including the per-kind height/albedo/orm/normal sets), the moon-tracking object, and the group.

## Verdict
FAIL (below the 8.5 pass bar), but one of the stronger modules reviewed: zero errors, comfortably within its own draw-call/triangle budget (independently verified via `stats()`, not just the README's claim), and three of six presets (`close`, `bridge`, `night`) are genuinely good work. The asphalt macro-texture on the `paved`/`junction` presets is the only real visual weak point and is a texture-authoring fix, not a structural problem.
