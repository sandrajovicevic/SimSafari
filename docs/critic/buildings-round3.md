# buildings — round 3 — score 8.5 / 10 — PASS

## Screenshots reviewed (path — what I saw, one line each)
- `tools/shots/buildings-overview-16.png` — the whole lodge complex from the south-west: gate, thatched lodge with visible solar panels, restaurant, shop, ranger station, clinic, viewing tower, hide, tented camp and staff village, all connected by dirt tracks, sited plausibly beside a kopje. Reads as a real, coherent settlement, not a scattering of test props.
- `tools/shots/buildings-lodge-17_5.png` — the lodge close: a genuinely detailed makuti thatch roof with visible ridged/layered courses and a ragged eave (matching the README's specific "noise-displaced eave" + "course lips" claims), round timber veranda poles, a coursed-rubble stone plinth, a water tank and rooftop solar panels — this is the strongest single image in the module.
- `tools/shots/buildings-gate-10.png` — entrance gate: twin coursed-stone piers, a pole lintel under a small thatch roof, a legible carved park-name board ("MARA RIDGE SAFARI PARK"), a thatched ticket kiosk, and a red-and-white striped boom barrier — matches the README's description point for point.
- `tools/shots/buildings-close-16_5.png` — veranda-to-terrace stair detail: timber posts on stone footings, plank stair treads, cable railings, stone terrace paving — genuinely detailed construction geometry, not a flat texture standing in for it.
- `tools/shots/buildings-hide-8.png` — the stilted hide: pole legs, a ladder/stair up, woven-reed screen walls, a thatch roof with angled exposed rafter tails poking past the eave — matches the spec's "hide (viewing shelter on stilts)" requirement well.
- `tools/shots/buildings-night-21_5.png` — lodge veranda at night: warm lantern glow lighting the thatch underside and timber poles from below, a lit pool of light on the deck, stars overhead, other buildings' windows visible as small lit points in the distance — genuinely atmospheric, one of the better-executed night scenes reviewed in this project.
- `tools/shots/buildings-critic-morning.png` (my extra angle: overview preset, tod 8 instead of 16) — same complex under morning light, fully consistent with the primary overview shot, no time-of-day-specific defects.
- `tools/shots/buildings-critic-stats.png` + eval readback (my extra check) — called the module's own `stats()` directly: `{drawCalls: 34, triangles: 131730, buildings: 25, types: 16}` — confirms the module's own geometry is comfortably inside the spec's ≤60 draw calls / ≤400k triangle budget for the overview complex, independently verified rather than read off the README.

## Contract / errors / perf (table: preset, drawCalls, triangles, errors — whole-scene totals; buildings' own contribution independently verified at 34 draws / 131,730 triangles)
| preset | drawCalls (scene) | triangles (scene) | errors | buildings updateMs |
|---|---|---|---|---|
| overview (16h) | 296 | 4,260,251 | [] | 0.166 |
| lodge (17.5h) | 276 | 3,847,968 | [] | 0.147 |
| gate (10h) | 257 | 4,059,583 | [] | 0.197 |
| close (16.5h) | 276 | 3,748,479 | [] | 0.184 |
| hide (8h) | 275 | 3,677,968 | [] | 0.233 |
| night (21.5h) | 280 | 3,739,065 | [] | 0.278 |

Zero console errors on all 6 presets plus both extra shots. `modules.buildings.status === 'ok'` throughout. `updateMs` negligible in every preset. `node tools/lint.mjs src/modules/buildings` clean.

## Ranked issues (most damaging first)
1. **[minor]** Polish is uneven across the 16-type catalogue: the lodge and gate are clearly the "hero" assets (rich thatch/timber/stone detail), while the tower, hide-adjacent smaller structures and staff-village houses read comparatively plain/blocky at overview distance. Reasonable prioritization for a showcase, but worth flagging if a future pass wants to raise the catalogue's floor rather than its ceiling.
2. **[minor]** My own attempt at a closer framing of the lodge (`buildings-critic-lodge-close.png`, pushing the camera to ~20 m along the preset's own target/yaw) missed the building entirely and only shows grass/trees — this is a camera-math mistake on my part, not a module defect (the primary `lodge` preset at its own authored distance frames the building correctly), noted here only for transparency about what I actually verified.

Nothing rises to major. I looked specifically for the "claimed but not shown" pattern found in several other modules and did not find one: every specific description in the showcase presets (thatch detail, stone plinth, gate signage, stilted hide, night lantern glow) is visibly present in the corresponding screenshot.

## What is genuinely good
- The thatch roof system (course lips, noise-displaced ragged eave, rolled ridge) is genuinely convincing and matches the README's detailed technical description exactly on inspection.
- The gate's carved park-name sign is legible and correctly reflects the park name.
- Night lighting (lantern glow on the thatch underside, warm deck pool of light) is atmospheric and well-tuned — one of the better night results in the project.
- Own-module draw-call and triangle budgets independently confirmed via `stats()`, comfortably inside spec (34 vs ≤60 draws, 131,730 vs ≤400k triangles for 25 buildings across all 16 catalogue types).
- `index.js` API matches the README's table; `dispose()` present and the module cleans up its instanced meshes, array textures and group.

## Verdict
PASS. Zero console errors, comfortably within budget (independently verified via `stats()`, not just the README's word), and every specific visual claim in the showcase descriptions is genuinely present in the screenshots. The lodge and gate in particular are AAA-adjacent work; the rest of the catalogue is solid if less individually polished.
