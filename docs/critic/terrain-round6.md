# terrain — round 6 — score 8.2 / 10 — FAIL

**Backend: SwiftShader (software GL), not a real GPU.** All captures were taken in a Linux container with
`tools/screenshot.mjs` (JSON `gpu` = `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device …))` on every shot),
1920×1080, seed 1, `--timeout 400000`, LFS assets resolved (`Lion.glb` starts `glTF`; `lfs-fetch` hook reported
21 resolved / 0 failed). Round 5 used a D3D11 RX 5700 XT for most shots, so **round-5 and round-6 pixels are not
like-for-like**: SwiftShader has no anisotropic-filtering parity with a GPU, different specular aliasing and
different mip selection, and I attribute differences only where a second sun angle or a code read backs them.
There is no D3D11 adapter in this container, so the four verdicts the tasking reserves for a real GPU are **not
issued** here; the one that touches terrain (streaking on river banks) is answered below from SwiftShader
evidence and marked as such.

Head `418fcb3` (PR #12 merge, in `git log`). Every `.json` was checked for timestamp and `errors` before its
PNG was read; all are from this session. Every PNG listed was read.

## Screenshots reviewed (path — what I saw, one line each)
- `tools/shots/terrain-overview-15.png` — whole park at 15 h: golden plain, river with a wetland margin, two pans, escarpment with a jagged crest, two kopjes. **No straight hairline seams across the apron** (round-5 major). The river's west end still stops in a straight vertical cut, now inside a flat green wetland patch with a hard rectangular shadow edge (left, ~x 240,y 620).
- `tools/shots/terrain-r6-overview-12.png` (extra, noon) + `tools/shots/crit-terrain-ov12-full-c.png` (3× contrast, whole frame) — same view at noon; even at 3× contrast the apron shows no lines, and the world square is not visible as a boundary. Round-5 issue 1 is genuinely resolved.
- `tools/shots/terrain-plains-16_5.png` — 40 m plain at haze: organic dry-grass mottle, laterite patch left, pans on the horizon. Fine; a slight brush-stroke sweep from the streak layer near the bottom.
- `tools/shots/terrain-kopje-17.png` — granite kopje with long correct shadow against the escarpment; crest spires irregular. Strong.
- `tools/shots/terrain-river-9.png` — river at 9 h: olive-green water with a warm sand rim and dark wetland bands; at several steep bank spots (right-centre ~(1300,650), lower-right ~(1100,950), left ~(680,600)) there are **dark grey, glossy, wormy terraces with bright ridge highlights** that read as folded mud, not as ground. Water is a smooth sheet at this distance.
- `tools/shots/terrain-escarpment-7.png` — ridge at dawn haze: variable fluting, ledges, talus; holds up. Cliff face reads slightly uniform olive-grey at this haze.
- `tools/shots/terrain-close-16.png` — bank at 16 h: warm sandy shallows, fine-grain dark mud band; the **large crack polygons of round 5 are gone** on the wet band, except a patch of hexagonal ~1–2 m plates at the bottom-left edge that reads as paving.
- `tools/shots/terrain-night-21_5.png` — night over the river: river dark with a faint warm rim, escarpment silhouette legible at top-right, wetland/grass patches faintly structured; the frame is very dark (mean luma 18.6/255) and the ground between features is murk.
- `tools/shots/terrain-r6-bank-35-15.png` (**extra: river-bank close-up, 35 m, 24° pitch, 15 h**, bank picked as the steepest bank slope along the river, ~15°) — clean waterline with fine ripple; on the dark bank at centre (x 830–1300, y 360–480) a **radial fan of ridges like a handprint/palm frond**, dark grey with paler ridge lines, plus a smaller one at left (~(400,295)).
- `tools/shots/terrain-r6-bank-35-8.png` (extra, 8 h) — same view; the ridge fan is the brightest feature on the bank, silver-grey highlights on every rib.
- `tools/shots/terrain-r6-bank-35-17.5.png` (extra, 17.5 h) — warm evening light; the fan is still there, pale-grey ridge lines against warm brown mud.
- `tools/shots/r6-game-overview-14.png` (**game `overview` 14 h, 363 draws**) — whole park; no visible seam on the right at native contrast. Escarpment ends in a diagonal straight cut at the right border (visible in the frame).
- `tools/shots/crit-r6-overview-14-right3x.png` (3× contrast crop of the right third) — no tone step across the world border; the only straight edge is the escarpment's geometry cut where it meets the border, plus a small darker rectangle at bottom-left of the crop.
- `tools/shots/crit-r6-overview-14-border.png` (3× crop, 3× contrast, border area) — tone continuous across the border; the cliff's straight cut is the one hard line.
- `tools/shots/r6-game-overview-17.png` (**game `overview` 17 h, 365 draws**) — low sun: escarpment reads well; along the right the world border shows as a **straight diagonal tone step** (bottom right, ~x 1590,y 640 → 1760,880).
- `tools/shots/crit-r6-overview-17-right3x.png` (3× contrast crop) — the step is unmistakable: a ruler-straight edge from the cliff foot down through the plains; left of it ground carries tree-shadow streaks and darker mottling, right of it smooth uniform ground.
- `tools/shots/crit-r6-ov17-seam-1x.png` / `r6-ov14-seam-1x.png` (3× magnification, **native contrast**, same border area) — at 17 h the line is visible with no contrast enhancement and long tree shadows end abruptly at it; at 14 h the same area is clean.

## Contract / errors / perf (table)
| capture | drawCalls | triangles | errors | terrain updateMs |
|---|---|---|---|---|
| overview 15 | 35 | 1,090,924 | [] | 0.005 |
| plains 16.5 | 24 | 730,476 | [] | 0.008 |
| kopje 17 | 36 | 1,123,692 | [] | 0.012 |
| river 9 | 38 | 1,189,228 | [] | 0.009 |
| escarpment 7 | 40 | 1,254,764 | [] | 0.012 |
| close 16 | 32 | 992,620 | [] | 0.019 |
| night 21.5 | 44 | 1,353,068 | [] | 0.004 |
| extra overview 12 | 35 | 1,090,924 | [] | — |
| extra bank 15 / 8 / 17.5 | 38 / 38 / 38 | 1,189,228 | [] | 0.002–0.009 |
| game overview 14 | 363 | 4,049,189 | [] | 1.0 (mean, incl. warm-up) |
| game overview 17 | 365 | 4,255,559 | [] | 2.3 (mean, incl. warm-up) |

- 13 terrain captures + 2 game captures: zero console errors; `modules.terrain.status === 'ok'` on all. `node tools/lint.mjs src/modules/terrain` → **lint ok**.
- **Game overview draw calls 363 / 365 against the 1500 budget** → pass. Terrain-only draws 24–44 vs ≤ 64 cap → pass. Overview triangles 1.09 M vs the spec's ≤ 1.2 M at overview → pass (night and escarpment presets 1.25–1.35 M exceed that line but it is defined for `overview` only).
- Terrain `update()` → 0.002–0.02 ms in its own presets; a direct timed loop in the game measured 0.003 ms mean, 0.1 ms max. In the game captures the harness's `updateMs` (1.0–2.3 ms mean, 44–151 ms peak) is dominated by the road/edit conform work in the first frames, not steady state. Allocation-free by reading (`update` only calls `updateWaterSky`).
- The apron ignores shadows by design: `src/modules/terrain/index.js:73` sets `S.apron.receiveShadow = false`. That is the likely mechanism of issue 1 below.

## Round 5 issues — status and evidence
| # | round-5 issue | status | evidence |
|---|---|---|---|
| 1 | [major] Two straight hairline seams across the apron | **resolved** (also verified at the game overview) | `terrain-overview-15.png`, `terrain-r6-overview-12.png`, `tools/shots/crit-terrain-ov12-full-c.png` (3× contrast, no lines) |
| 2 | [minor] Wetland/mud crack motif reads as metre-scale webbing | **resolved on the wet band, improved on steep banks** | `terrain-close-16.png` (fine grain, no big polygons; ~1 m plates only at bottom-left) vs r5; `terrain-r6-bank-35-*` show no big cells. |
| 3 | [minor] Water has no flow structure or silhouette | **unchanged** | `terrain-river-9.png`, `terrain-r6-bank-35-15.png`: smooth reflective sheet, capillary ripple normals only at close range |
| 4 | [minor] River's west end: straight cut + rectangular patch at the border | **unchanged** | `terrain-overview-15.png` and `terrain-r6-overview-12.png`, far left |
| 5 | [minor] Night ground near the black point | **unchanged** | `terrain-night-21_5.png`: frame mean luma 18.6; darkest crops 7.5–9 |

## Ranked issues (most damaging first)

1. **[major, subtle] The world-border blend fix holds at 14 h, but at 17 h a straight tone/shadow step remains across the game's default overview.**
   - **What:** a ruler-straight diagonal edge separates the world square from the apron. To its left the ground carries long tree-shadow streaks and darker mottling; to its right it is uniform. The streaks end exactly on the line.
   - **Where:** game `overview` 17 h, right side (`r6-game-overview-17.png`, `tools/shots/crit-r6-ov17-seam-1x.png` at native contrast, `tools/shots/crit-r6-overview-17-right3x.png`). At 14 h and native contrast the same area is clean (`tools/shots/crit-r6-ov14-seam-1x.png`), so the builder's verification at 14 h is real but incomplete. The escarpment's straight cut at the border is visible at both times and is disclosed.
   - **Why it matters:** the round-5 major was exactly a straight line across the flagship overview; this is the same class of defect, subtler, and it only appears at the sun angles a player uses every evening. Reference: nature documentaries never show a land-edge cutoff.
   - **Why (mechanism) [Likely]:** the apron is created with `receiveShadow = false` (`index.js:73`), so any shadow falling across the border is cut off, and the apron's analytic weights are lit flat. Not confirmed by toggling it, because critics write no code.
   - **Fix:** let the apron receive shadows (it is a single draw call), or fade cast shadows out over the last ~40 m; also extend the escarpment ridge decay so its cliff ends in a taper rather than a cut.
2. **[minor→moderate] Radial ridge fans on steep river banks (the "grey streaking" the tasking asks about).**
   - **What:** at the steepest bank spots the wet-band shading and the triplanar relief combine into a fan of parallel ridges radiating from one point, 15–25 m across. It reads like a handprint or fossil frond, not erosion. The ridge lines are pale grey at every sun angle tested; the mud between them changes colour with the light.
   - **Where:** `terrain-r6-bank-35-15.png`, `-8.png`, `-17.5.png` (same spot, identical shape, so it is geometry, not lighting); at overview distance it shows as dark wormy terraces along the banks in `terrain-river-9.png`.
   - **Verdict on "is it wet-bank specular? is it acceptable?" (SwiftShader only):** [Likely] the *brightness* is wet-band specular (`rough = mix(rough, 0.50, wet)`, `material.js:113`) sitting on ridge crests: it is brightest at 8 h (low sun) and dimmest at 15 h, and stays on the crests at 17.5 h. The *shape* is height-field terracing and is not specular. On this backend it is **not acceptable** at 30–40 m: it is the most artificial-looking feature in the bank frames and it repeats along the river. Whether a real GPU shows more or less of the specular is **not judged** here.
   - **Fix:** smooth the bank profile where slope exceeds ~0.2 (the README already calls the terrace pattern "unrelated" and leaves it); clamp the wet-band roughness on slopes > 20° and fade the bank's triplanar normal strength beyond ~20 m.
3. **[minor] The river's west end is still a straight vertical cut inside a rectangular green patch (the slab has changed from pale sand to green, the cut is unchanged).** (carried, unchanged) `terrain-overview-15.png`, far left. Fix: taper the river into a silted end 30 m inside the border.
4. **[minor] Water is a featureless sheet at river and overview distance** (carried, unchanged, disclosed). Fix: scroll the two ripple scales along the river tangent (`getFeatures().river` already provides it).
5. **[minor] Night ground near black** (carried, environment-shared). Terrain silhouettes stay readable, river and wetlands legible; ground between features is murk. Night ground-level legibility on a real GPU: **not judged**.
6. **[minor, remaining] ~1 m cracked-mud plates on steep banks still read as cobblestone paving.** Seen at the bottom-left of `terrain-close-16.png` and beside the road in `roads-r5-jtop-n7-12.png`. ~1 m polygons with bright rims read as cobblestone paving rather than mud; the README says this is a known remainder of the triplanar path. Fix: lower plate contrast on triplanar banks beyond ~10 m.

## What is genuinely good
- **Round 5's major is really fixed**: I looked for the two apron hairlines at 15 h and 12 h with a 3× contrast pass over the whole frame and found none; the game overview at 14 h is clean at native contrast and in a 3× crop of the right third.
- **The mud crack webbing is gone**: the mip-bias change turns the 3.2 m polygons into fine mud grain; the wet band now reads as mud, not a Voronoi diagram. Verified at 16 h close and in three bank shots.
- Kopjes, escarpment and photo-layer ground still read as real Serengeti-type terrain at every distance and sun angle tested; no tiling visible.
- Contract clean: zero errors on 15 captures, lint ok, within every budget, allocation-free `update()`.

## Verdict
**FAIL at 8.2** (was 8.0). The round-5 blocker and the crack-webbing nit are resolved and verified with my own captures. What holds it below 8.5 is a subtler variant of the same class: a straight border step at 17 h (shadows end on a line because the apron doesn't receive them), plus two carried, unchanged nits on the flagship overview (river end cut, flat water). No real-GPU checks were possible: the bank specular verdict and night legibility remain unjudged on hardware.

```json
{
  "terrain": {
    "score": 8.2,
    "round": 6,
    "status": "fail",
    "errors": 0,
    "drawCalls": 44
  }
}
```
