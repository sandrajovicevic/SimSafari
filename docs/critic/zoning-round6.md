# zoning — round 6 — score 6.0 / 10 — FAIL

## Screenshots reviewed (path — what I saw, one line each)
All captures by me: 1280×720, seed 1, fast-settle, run one at a time.
- `tools/shots/zoning-overview-15.png` — three habitats, fences, overlay on. The round-5 boardwalk line staircase is gone: the diagonal VISITOR path now reads as two smooth, parallel dashed contours. The habitat fills are a flat, unlit lime green that looks like a sticker laid over the savannah rather than a translucent tool tint. Fences are not legible at d=260.
- `tools/shots/zoning-close-16_5.png` — fence detail: wooden posts and two wires follow the terrain and read as a believable minimal safari fence. The white boundary ribbon runs visibly outside the fence line, by an estimated 2–3 m on the left. The mint habitat tint looks unlit on the grass behind the fence.
- `tools/shots/zoning-overlay-13.png` — near top-down zoning-tool view: every contour is smooth and no line segment shows the 4 m staircase. Inside the boardwalk, the only sign of the VISITOR fill is a faint cross-hatched smudge. I cannot see a plank or boardwalk read.
- `tools/shots/zoning-night-21_5.png` — both habitat fills blow out to a near-white mint glow, the brightest thing in the frame by far. The boardwalk shows as bright tan blocks between two solid white glowing lines, and the blocks step visibly.
- `tools/shots/zoning-critic-r6-boardwalk.png` (my extra: camera moved by `--eval` to 45 m, pitch 55°, over the boardwalk's own VISITOR cells, 10 h) — **pixel-level check of the MAX_PULL 3.2 m fix: PASS for the line.** Both contours are smooth curves with clean dashes and no right-angle steps at the 4 m pitch. However, the ground between the lines looks the same as the ground outside them, so by day the boardwalk tint is effectively invisible.
- `tools/shots/zoning-critic-r6-boardwalk-night.png` (same camera, 21.5 h) — **the staircase has moved into the fill.** The VISITOR fill is drawn as hard-edged 4 m cell squares arranged in stepped diagonal bands, and several of them stick out past the smooth boundary line on both sides (lower-left, mid-right). Smooth line plus blocky fill that ignores it is a worse mismatch than round 5's consistent staircase.
- `tools/shots/zoning-close-6_5.png` (my extra: close preset at dawn) — the fence reads well in warm, low light. The habitat tint ignores the lighting: bright mint-green over orange dawn grass, like a UI layer rather than paint on the ground.
- `tools/shots/zoning-critic-r6-game.png` (my extra: `--game --preset overview --tod 14`, used for the habitat-count `--eval`) — the frame renders almost black at 14 h. That is not a zoning defect and I did not use it to judge zoning's visuals; I flag it for the orchestrator. The eval result is below (issue 3).

## Contract / errors / perf
Whole-scene totals as the tool reports them. zoning's own group is still 4 draw calls (overlay fill, boundary ribbon, 2 fence InstancedMeshes), well under the spec's ≤ 20.

| preset | drawCalls (scene) | triangles (scene) | errors | zoning status | updateMs |
|---|---|---|---|---|---|
| overview 15 | 163 | 3,906,597 | [] | ok | 2.16 |
| close 16.5 | 152 | 3,874,771 | [] | ok | 2.21 |
| overlay 13 | 171 | 3,882,108 | [] | ok | 2.08 |
| night 21.5 | 167 | 4,156,587 | [] | ok | 2.30 |
| extra: close 6.5 | 154 | 3,940,307 | [] | ok | — |
| extra: boardwalk 10 (eval camera) | 161 | 3,841,061 | [] | ok | — |
| extra: boardwalk 21.5 (eval camera) | 167 | 4,156,587 | [] | ok | — |
| extra: game overview 14 | 349 | 4,691,227 | [] | ok | — |

- Zero console errors in every shot. All mandatory presets are present.
- `node tools/lint.mjs src/modules/zoning`: lint ok.
- Every function in the README's API table exists in `index.js`, and `dispose()` releases the overlay, fences and group.
- `update()` itself allocates nothing per frame. However, `updateMs` was 2.1–2.3 ms in all four presets against the ≤ 1.5 ms per-module guide (see issue 5).
- The README's "Measured" table is stale: it lists 150/140/158/154 draw calls, and I measured 163/152/171/167. The whole scene has grown and zoning has not; this is documentation only.

## Ranked issues (most damaging first)

1. **[major] The boardwalk (VISITOR) fill is still grid-quantised, now contradicts the smoothed line drawn over it, and is invisible by day.**
   - **Where it shows:** `zoning-critic-r6-boardwalk-night.png`, `zoning-night-21_5.png`, and by its absence in `zoning-critic-r6-boardwalk.png` and `zoning-overlay-13.png`.
   - **Cause:** in `overlay.js` the fill alpha is `0.30 * smoothstep(0.42, 0.9, field)`, and `field` comes from a 5×5 same-region kernel. On a 2-cell (8 m) corridor, `field` barely reaches the smoothstep range, so the fill is nearly transparent. Where it does show, it follows the Nearest-sampled cell squares, not the ribbon's contour. The plank term (`x*0.7 + z*0.3`) runs in a fixed world direction, not across the path, so it cannot read as planks on a diagonal path.
   - **Why it matters:** in Cities: Skylines II the fill and the contour are one shape. Here, in the night preset, the fill visibly spills past the line.
   - **Fix:** clip the fill with a signed distance to the smoothed contour instead of a per-cell test. The simplest way is to bake the ribbon's polyline into a distance texture, or rasterise the smoothed polygon into a higher-resolution mask. Give thin corridors a floor alpha, and orient the planks along the local path direction (for example, from the gradient of the distance field).

2. **[major] The overlay fill is unlit with a fixed colour, so it glows at night and ignores dawn light.**
   - **Where it shows:** `zoning-night-21_5.png` (both habitats near-white mint, the brightest thing in the frame), `zoning-close-6_5.png` (neon mint over orange grass), and `zoning-overview-15.png` (lime slabs).
   - **Cause:** the `ShaderMaterial` writes `zoneColor` directly and takes nothing from the sun, moon or exposure.
   - **Why it matters:** Cities: Skylines II overlays are unlit, but they are desaturated, low-alpha and exposure-aware, and they never become the brightest light source in a night scene.
   - **Fix:** multiply the fill by a scene-luminance uniform (from `environment`), or blend it in a lit pass. Lower saturation and alpha at night (keep the contour bright, dim the fill).

3. **[major] Habitat fragmentation: there is no minimum-area or orphan merge, so the demo park produces 12 habitats, not 4.** This is a zoning behaviour, and it is what the park fidelity harness picked up as "11 habitat regions".
   - **What I measured:** from `--eval` in the full game, `listHabitats()` returns 12 entries: the 4 named ones (Plains 22,064 m², Acacia Woodland 29,632 m², River Wetland 4,256 m², Pride Kopje 36,272 m²) plus 8 unnamed fragments.
   - **The fragments:** Habitat 1 at 6,608 m², Habitat 9 at 1,264 m², Habitat 11 at 400 m², and five slivers of 1–3 cells (16–48 m²: Habitats 4, 5, 6, 8, 10).
   - **Cause:** `habitats.js::floodComponents` is a pure 4-connected flood fill with no size threshold. Wherever NO_BUILD (river or road) cuts a painted habitat, or two cells touch only diagonally, a new habitat appears.
   - **Consequences:** each fragment is scored, listed, fenced (a 1-cell habitat gets a 4 m fenced pen) and counted by the sim. That pollutes the UI, the fenced/quality stats and the fidelity numbers.
   - **Fix:** fold components below a threshold (for example 10 cells) back to NONE, or attach them to the adjacent named habitat as part of the same logical habitat. Also consider 8-connectivity for diagonal touches, and optionally treat a river-split habitat as one habitat with two parts.

4. **[minor, but triggers the claim cap] The README's smoothing-clamp claims are false against the current code.**
   - The README says "Every smoothed point is clamped to ≤2 m of the exact cell partition" (Rendering), and "clamped to 2 m … fence and overlay line can diverge by up to ~2 m" (Known gaps).
   - `boundaries.js` now has `MAX_PULL = 3.2`, and its own comment still says "never wander more than half a cell off the true partition".
   - Visibly, in `zoning-close-16_5.png` and `zoning-close-6_5.png`, the line sits roughly 2–3 m off the fence.
   - The raise itself is justified. The documentation now misstates the guarantee, and by the brief's rule a README claim that does not reproduce caps the score at 6.
   - **Fix:** update the README (both places), the Taubin comment, and the Measured table.

5. **[minor] `updateMs` is 2.1–2.3 ms in all four presets** (round 5: 0.9–4.1 ms), over the 1.5 ms per-module guide.
   - The likely cause is the same one as before: a wall-clock 1.2 s throttle that fires almost every frame under SwiftShader, running a full `rebuildHabitats()` (flood fill + stats + fence rebuild) for a species-only change.
   - **Fix:** a species-only refresh path that does not re-flood or re-fence, plus a frame-count throttle.

6. **[minor] At night the contour is a solid glowing white line instead of marching ants**, visible in both night shots. It reads as neon tubing rather than a dashed tool line.

## What is genuinely good
- **The round-5 blocker is fixed for the line.** At pixel level the boardwalk contour is smooth at 45 m by day and by night, and no staircase segment is visible in any of the 8 shots.
- The fences are clean and follow the terrain, and they hold up in dawn light at close range.
- The module stays at 4 draw calls, has zero console errors, passes lint, and its API and `dispose()` match the README.
- The habitat contours (away from thin corridors) are smooth, organic, zoning-tool curves.

## Verdict
FAIL at 6.0. The requested pixel-level verification passes: the MAX_PULL 3.2 m change removed the boardwalk line staircase. The staircase has now moved into the VISITOR fill, which is invisible by day and blocky by night and spills past the smooth line. The unlit fill glows at night and at dawn. The flood fill also turns the 4-habitat demo park into 12 habitats, including five 1–3-cell slivers; that explains the park harness's "11 regions" and is a real zoning bug, not a harness artefact. The README still states the old 2 m clamp, so the claim cap applies. Without the cap I would still score this about 6.5, because of issues 1–3.
