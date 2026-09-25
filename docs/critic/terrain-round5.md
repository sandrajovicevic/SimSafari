# terrain — round 5 — score 8.0 / 10 — FAIL

Round-4's two majors were re-verified from scratch with my own captures; both fixes are real. The score is
no longer claim-capped: every README claim I tested reproduced. What keeps this below the 8.5 pass bar is
one new, clearly visible geometry defect (two straight hairline seams across the distant apron) plus
carried nits. All captures are mine, 1280×720, seed 1, real GPU "ANGLE (AMD, AMD Radeon RX 5700 XT
D3D11)" via tools/gpu-check.mjs unless marked SwiftShader. I read every PNG.

## Screenshots reviewed (path — what I saw, one line each)
- `tools/shots/terrain-r5-overview-15.png` — whole park from SE at 15 h: golden dry-season plain, meandering river with green/laterite margin, two pans, angular kopjes; escarpment skyline now jagged and irregular, **no more corduroy comb**.
- `tools/shots/terrain-r5-overview-12.png` (my extra angle, noon) — same view under overhead sun: escarpment fix holds at a second sun angle; **two thin straight dark lines visible crossing the plain/apron** (issue 1 below).
- `tools/shots/terrain-r5-plains-16_5.png` — 40 m grass plain: organic dry-grass mottle (photo-layer structure visible, no repeating stamp), laterite patch left, pans glinting on the horizon; convincing.
- `tools/shots/terrain-r5-kopje-17.png` — kopje against the escarpment at 17 h: stacked angular fracture blocks with long correct shadows; the background ridge shows irregular spires and ledges instead of uniform flutes.
- `tools/shots/terrain-r5-river-9.png` — river at 9 h: grey-blue sky reflection with wet margins and sand bars — reads as water now, not flat olive paint; no waterline sparkle anywhere.
- `tools/shots/terrain-r5-river-17_5.png` (my extra angle, evening) — river reflecting warm evening sky with a soft glint; floodplain margins read well.
- `tools/shots/terrain-r5-escarpment-7.png` — ridge at sunrise in haze: groove width/depth now varies, skyline is jagged, talus lobes irregular; big improvement over round 4.
- `tools/shots/terrain-r5-escarpment-12.png` (my extra angle, noon) — ridge without dawn haze: the fluting variation and strata ledges hold at noon; cliff face reads slightly dark olive-grey but plausible.
- `tools/shots/terrain-r5-close-16.png` — bank detail: cracked-mud/laterite structure (photo rock scan reads real); water shows faint ripple normals and a warm shallow band; the wetland margin's crack motif reads as large angular webbing (issue 2).
- `tools/shots/terrain-r5-close-6_5.png` (my extra angle, dawn) — same bank in warm low light; detail holds; crack-motif webbing visible again on the wetland band.
- `tools/shots/terrain-r5-night-21_5.png` — night over the river bend: **water is dark** — a smooth faint sky reflection, plainly not the glowing cream ribbon of round 4; ground mottle and escarpment silhouette legible.
- `tools/shots/terrain-r5-night-3.png` (my extra angle, deep night) — same view at 3 h: water still dark, ground near-black but structured; no self-lit water at any night hour tested.
- `tools/shots/terrain-r5-night-pixels.png` + eval readback (SwiftShader, same method as round 4's critic) — water RGB 12,13,11 / 25,25,21 vs ground 22,24,12 / 12,8,5: **water is at ground brightness, was 2.5–3× brighter in round 4. Claim of the night-water fix REPRODUCED.**
- `tools/shots/terrain-r5-swift-overview-12.png` + `-noshadow.png` (SwiftShader diagnostics) — the two straight lines persist with shadows off and on the software renderer: a real geometry/shading seam, not a GPU or shadow-cascade artifact.

## Contract / errors / perf (table: preset, drawCalls, triangles, errors)
| preset | drawCalls | triangles | errors |
|---|---|---|---|
| overview 15 | 35 | 1,090,924 | [] |
| overview 12 (extra) | 35 | 1,090,924 | [] |
| plains 16.5 | 24 | 730,476 | [] |
| kopje 17 | 36 | 1,123,692 | [] |
| river 9 | 38 | 1,189,228 | [] |
| river 17.5 (extra) | 38 | 1,189,228 | [] |
| escarpment 7 | 40 | 1,254,764 | [] |
| escarpment 12 (extra) | 40 | 1,254,764 | [] |
| close 16 | 32 | 992,620 | [] |
| close 6.5 (extra) | 32 | 992,620 | [] |
| night 21.5 | 44 | 1,353,068 | [] |
| night 3 (extra) | 44 | 1,353,068 | [] |

All 12 shots: `modules.terrain.status === 'ok'`, zero console errors. Draw calls worst 44 vs the ≤ 64
terrain+water cap; triangles 1.09 M at overview vs the spec's own 1.2 M line; everything inside the
project 6 M budget. `node tools/lint.mjs src/modules/terrain` clean. Contract: every README-listed API
function exists in `index.js`; `dependencies: []` (+optional environment) truthful; `dispose()` releases
chunks/water/apron/materials/textures/height texture; `update()` calls only `updateWaterSky` — allocation-free
(verified by reading `water.js`). Budget: **pass**. Errors: **pass**.

## Ranked issues (most damaging first)

1. **[major] Two straight hairline seams run across the distant apron from the points where the escarpment meets the west/east world borders.** *Where:* `overview` (15 h and 12 h), both SwiftShader and D3D11, unchanged with shadows off — so geometry/material, not renderer. Unprojected the lines to world coordinates: they run from ≈(−504,−355) out to ≈(−945,−625) and from ≈(511,−342) out to ≈(761,−487) — i.e. both start exactly where the ridge crest crosses the ±512 border and extend diagonally across the apron, symmetric about x=0. *Why it matters vs reference:* a straight ruler line across open plains reads instantly as a broken seam; it sits in the module's flagship overview framing. *Fix:* in `apron.js` inspect the edge-height-sharing ring and the analytic control fade where large escarpment heights (≈78 m) enter the border columns — the seam follows the crest direction beyond the feature ends, so a height or cliff-mask discontinuity along the ring parameterisation is the likely source; blend the border heights over ≥1 ring spacing instead of hard-sharing them.
2. **[minor] Wetland/mud crack motif reads as metre-scale angular webbing at close range.** *Where:* `close` (16 h and 6.5 h), the dark wetland band across the bank. Large voronoi-cell outlines with bright rims several metres across; real cracked clay polygons are centimetre-scale, so the pattern reads as a texture motif rather than geology at 26 m. *Fix:* scale the crack cell size down ~4× in the wet band, or lower its albedo contrast past ~15 m camera distance (the round-3 distance-roughness machinery could be reused).
3. **[minor] Water still has no flow structure or silhouette.** *Where:* `river`, `overview`, both night angles: surface is a smooth reflective sheet; ripple detail is visible only close-up and there are no flow direction cues or edge waves. Disclosed honestly in the README ("ripples are entirely a normal-map effect"). *Fix:* scroll the two normal scales along the river tangent (t from `getFeatures().river` is already available) and perturb the shoreline vertex Y by a low-amplitude wave to break the straight waterline.
4. **[minor] The river's west end terminates in a straight vertical cut against the world border with a pale rectangular sand slab around it.** *Where:* `overview` 15/12, far left. The generator lets the river run into the border and the water mesh stops dead at x = −512. *Fix:* fade the river channel into a wetland/pan or terminate it with a rounded, silted end ~30 m before the border.
5. **[minor, disclosed] Night ground sits near the black point** (readback 12,8,5 in the darkest fields). Correctly attributed in the README to environment-owned ambient, and the NIGHT_LIFT work there has improved it — terrain is not at fault, but the frame still reads darker than moonlit reference photography.

## What is genuinely good
- Both round-4 majors verified fixed by my own eyes and pixel readback: night water is dark at 21.5 h and 3 h; the escarpment is jagged, variably fluted and ledged at every distance and sun angle tested.
- The photo-layer upgrade is real and the palette held: Poly Haven 1k originals are on disk (`public/assets/textures/polyhaven/`, 4 assets × colour/normal/rough, registered in `docs/ASSETS.md`), and the plains/close shots show scanned micro-structure inside the established golden/olive/laterite art direction — no tiling, no washed palette.
- Plains and bank detail survive dawn, noon, afternoon and dusk; kopjes read as granite block piles with correct long shadows.
- Zero console errors in 15 captures across two backends, comfortably inside every budget, clean lint, contract and dispose in order.

## Verdict
FAIL at **8.0** — "very good, one clear flaw". The round-4 blockers are genuinely fixed (I reproduced the
fixes, not just the claims), and the module now reads as natural dry-season savannah at every distance I
shot. The two apron seam lines are the one clearly visible defect keeping it under the 8.5 bar; the crack
webbing and the flat river are the remaining nits. Fix issue 1 and this module passes on the next look.

## Proposed STATUS.json update
```json
{
  "terrain": {
    "round": 5,
    "score": 8.0,
    "status": "fail",
    "errors": 0,
    "drawCalls": 44,
    "issues": [
      { "sev": "major", "text": "Two straight hairline seams cross the apron from where the escarpment meets the west/east world borders (unprojected to ~(-504,-355)->(-945,-625) and (511,-342)->(761,-487)); present on SwiftShader and D3D11, unchanged with shadows off — apron height/control seam, visible at the flagship overview framing." },
      { "sev": "minor", "text": "Wetland/mud crack motif reads as metre-scale angular voronoi webbing at close range (close 16/6.5h) — cell scale ~100x too large vs real cracked clay." },
      { "sev": "minor", "text": "Water still has no flow structure or silhouette at river/overview distance; ripples are close-range normal detail only (disclosed)." },
      { "sev": "minor", "text": "River's west end cuts off in a straight vertical water edge + pale sand rectangle at the x=-512 border." },
      { "sev": "minor", "text": "Night ground near-black in the darkest fields (readback 12,8,5) — shared environment-owned ambient issue, improved by NIGHT_LIFT but still darker than moonlit reference." }
    ],
    "good": "Round-4 blockers verified fixed with own captures + pixel readback: night water dark (water ~ground brightness at 21.5/3h), escarpment jagged and variably fluted at all distances/sun angles. Poly Haven 1k photo layers on disk and visible with palette intact. Convincing dry-season savannah at every distance; 0 errors in 15 shots; well inside all budgets."
  }
}
```
