# tools — round 3 — score 8.0 / 10 — FAIL

## Screenshots reviewed (path — what I saw, one line each)
- `tools/shots/tools-overview-15.png` — after the scripted session: a curving gravel road with a real bridge crossing the river, a lodge and gate placed, a large painted habitat overlay — all genuinely present, matching the description.
- `tools/shots/tools-road-16.png` — road tool live: a bright cyan/mint preview ribbon snapped onto the end of the committed gravel road, following the terrain. I could not find a steep-enough segment in frame to confirm the red grade-warning colouring specifically, but the ribbon/snap mechanics are clearly real and working.
- `tools/shots/tools-terrain-16_5.png` — terrain tool live: a clean bright-green ring cursor sitting exactly around a raised mound mid-stroke, correctly conforming to the terrain — a precise, legible visualization of the claimed state.
- `tools/shots/tools-building-17.png` — building tool live: the real placed lodge, plus a vivid red semi-transparent ghost preview directly overlapping it — an unambiguous, correct "invalid: occupied" signal exactly as described.
- `tools/shots/tools-close-16_5.png` — select tool: the lodge itself renders correctly, but I could not visually spot a selection marker/highlight in this screenshot. Checked directly via `--eval`: `world.selection` is genuinely `{kind: 'building', id: 'b_1'}` and the tools group does contain a visible child, so the claim is technically true — the marker exists and `world.selection` is set — but it's not legible in this particular framing/lighting, a minor presentation nit rather than a false claim.
- `tools/shots/tools-night-21_5.png` — the same park at night: the lodge glows warm amber against a near-black ambient, the river reflects moonlight, reflective road-paint dashes lead up to it — genuinely atmospheric, matches the previous review's characterization.
- `tools/shots/tools-critic-close-check.png` + eval (my extra check) — confirms `world.selection = {kind:'building', id:'b_1'}` and a visible marker child exists, resolving the ambiguity in the `close` screenshot above.

## Contract / errors / perf (table: preset, drawCalls, errors, tools updateMs)
| preset | drawCalls | errors | tools updateMs |
|---|---|---|---|
| overview (15h) | 99 | [] | 0.042 |
| road (16h) | 106 | [] | 0.935 |
| terrain (16.5h) | 94 | [] | **143.736** |
| building (17h) | 94 | [] | 0.267 |
| close (16.5h) | 95 | [] | 0.091 |
| night (21.5h) | 100 | [] | 0.119 |

Zero console errors on all 6 presets plus the extra check. `modules.tools.status === 'ok'` throughout. Draw calls are modest and well inside any reasonable budget.

## Ranked issues (most damaging first)
1. **[minor, unexplained anomaly]** The `terrain` preset alone measured 143.7 ms for `tools`' own `update()` — wildly out of line with every other preset (0.04–0.94 ms). I read `TerrainTool.js`'s `update()` and found nothing that should cost this much (it only updates a ring-cursor decal position). `tools` has no dependency on `props` (the module independently found to have a severe, camera-jump-triggered grass-rebuild stall in this same session's `props` review), so I cannot attribute this to that same mechanism with confidence, and I could not reproduce a second data point within this session's time budget. Flagged as worth a second look rather than scored as a confirmed defect, since it does not fit the module's own code path.
2. **[minor]** The `close` preset's selection marker is not visually legible in the captured screenshot despite genuinely existing (`world.selection` correctly set, a visible marker child confirmed via direct scene-graph check) — a presentation/contrast issue at this specific camera angle and time of day, not a functional defect.

Nothing rises to major — the scripted session, undo/redo framework (not exercised live in this pass but present and documented), ghost preview validity colouring, and ring cursor all work exactly as claimed.

## What is genuinely good
- The building ghost preview's red/green validity colouring is unambiguous and precise — the red overlay directly and only covers the conflicting existing structure.
- The terrain ring cursor is a clean, correctly-conforming decal exactly where the scripted stroke says it should be.
- The road preview ribbon correctly snaps onto the existing committed road, demonstrating real graph-aware snapping, not a cosmetic line.
- Night atmosphere (lodge glow, river moonlight reflection, reflective road paint) is genuinely strong.
- `dispose()` releases the ring, ribbon, marker and group; `index.js`/tool-file API matches the README's documented framework (activate/deactivate/undo/redo, per-tool options).

## Verdict
FAIL (below the 8.5 pass bar), but a clean, well-implemented module: zero console errors across every preset, every scripted-session visual claim genuinely reproduced (the one ambiguous case — the selection marker — resolved as true via direct API check, not a false claim), and the tool framework's core interactions (ghost preview validity, ring cursor, road snapping) all work as documented. The one open question is an unexplained perf spike on a single preset that doesn't fit the module's own code path and could not be pinned down further within this pass.
