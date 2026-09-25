# effects — round 4 — score 6.0 / 10 — FAIL

Capped at 6 by the brief's rule "a claim in the README you could not reproduce caps at 6". The README's
`off` vs `overview` A/B section does not reproduce: at the README's own 960×540 the pipeline brightens the
frame by about a third instead of being a "subtle refinement, exposure unaffected". Without the cap I would
score the visuals about **8.0**: one clear flaw (the image shift below) plus boxy bloom halos. Every
draw-call, tier, haze and grade number still reproduces exactly. The module's code has not changed since
round 3 (`git log src/modules/effects` shows only the baseline and wave-3 commits). Round 3 accepted the A/B
by eye ("broadly similar") and did not re-measure it. This round I measured it.

All captures: seed 1, quality high, fast-settle unless marked `--slow`. I read every PNG.

## Screenshots reviewed (path — what I saw, one line each)
- `tools/shots/effects-overview-17_5.png` (1280×720): the golden-hour yard reads as a saturated **orange** plain with long tree/box shadows and small lit lamp posts. The test yard is tiny at the centre. The world-plane edge and a grey-brown void above it are visible along the top edge (showcase framing).
- `tools/shots/effects-off-17_5.png` (1280×720): same camera with the pipeline bypassed. It is a noticeably **darker, browner** image (mean 70 vs 94). The two are not "broadly similar"; the grade and chain change the whole frame, not only the corners.
- `tools/shots/effects-critic4-overview-960.png` / `effects-critic4-off-960.png` (960×540, my A/B at the README's resolution): same result as above. Numbers are in the table below.
- `tools/shots/effects-critic4-nograde.png`, `-nobloom.png`, `-noao.png`, `-bare.png` (960×540, eval toggles): isolation runs. Turning off grade, bloom or AO individually changes almost nothing. With **every optional pass off** (`-bare`: scene → resolve → output only) the image is still milky and lifted (mean 98.0) against direct rendering (70.3). The base chain itself is not neutral at this sun angle.
- `tools/shots/effects-critic4-pipeoff.png` (960×540): `overview` with `setEnabled('pipeline', false)` via eval. Pixel-identical means to the `off` preset (70.3), so the difference is the pipeline, not a difference between presets.
- `tools/shots/effects-close-17.png` (1280×720, fast-settle): PBR sphere array rim-lit by the low sun. GTAO/contact shadows under plinths are convincing, specular variation reads well, and lamp heads glow softly. There is **one** isolated dust puff (a soft beige blob mid-frame, no trail). The front rock has stretched, streaky texturing and every sphere carries the same wrinkly bump pattern (showcase authoring).
- `tools/shots/effects-critic4-close-slow.png` (1280×720, `--slow`): with every settle frame rendered, the dust puff becomes a proper **trail streaming behind the yellow sphere**, soft-edged, lit warm, and it fades into the ground. The sparse fast-settle result is a capture artefact, not a module defect. `stats().particles` = `{spawned: 534, alive: 0}` while particles are plainly on screen, so `alive` is never updated.
- `tools/shots/effects-heat-13.png` (1280×720): midday, blue sky with flake-like clouds (environment), the box skyline, and a flat brown plain. The skyline bases and horizon edge have a faint wavy, wobbling outline, which is the haze warp. The effect is weak as a still.
- `tools/shots/effects-critic4-heat-eval.png`: `getHazeStrength()` = **0.875** and `measure().extra` = **12** at `heat`, as claimed. Frame-to-frame difference against the preset shot is 1.33/255 in the horizon band vs 0.8 in the sky: the haze moves, but only just.
- `tools/shots/effects-night-22.png` (1280×720): legible night yard with warm light pools under lamps and a campfire glow. **The bloom halos around every lamp head are visibly square/boxy** (zoomed crop: rectangular glow with hard-ish corners). The stars in the thin sky strip are smeared into horizontal dashes; this is environment's sky, not a post-chain artefact.
- `tools/shots/effects-critic4-measure.png` / `effects-critic4-tiers.png` (eval): `measure()` gives direct 192 / pipeline 204 / **extra 12** at high. It is **5** at low and 12 at medium. SMAA gives 14, and `setBloomMode('unreal')` gives 20. `getGrade()` = `{contrast 1.06, saturation 1.05, warmth 0.35, vignette 0.28, grain 0.02, bloom 0.18}`. All match the README.
- `tools/shots/game-overview-{8,14,21_5}.png`: full game from above. The post chain shows no banding, halo rings, AA crawl or grain noise. At 8 h and 14 h the grade is clean. At 21.5 h the scene is a warm sepia-brown night rather than a cool moonlit one, and lodge/road lights have small squarish orange glows.
- `tools/shots/game-close-{8,14,21_5}.png`: savannah close-up. No post artefacts at 8 h or 14 h. At 21.5 h the frame is near-black with a warm cast.
- `tools/shots/game-low-{8,14,21_5}.png`: ground-level view with acacias, grass and elephants. The chain is clean at 8 h and 14 h. At 21.5 h there is a vertical stack of 3 soft glows in the sky left of centre.
- `tools/shots/game-critic4-low-21_5-noparticles.png` and `game-critic4-low-21_5-pipeoff.png`: the sky glows are unchanged with particles off (0 alive, 0 spawned) and with the whole pipeline off, so they come from **environment**, not effects. The same pair shows the pipeline **darkens** the game night by about 30% (mean 15.1 on vs 21.7 off).
- `tools/shots/game-critic4-low-14-pipeoff.png`: game midday with the pipeline off. Mean 114.2 vs 114.1 on, mean abs diff 10.0. **At midday in the real game the chain is the neutral, subtle refinement the README describes.**

## Contract / errors / perf

| preset / shot | drawCalls | triangles | errors | warnings |
|---|---|---|---|---|
| overview 17.5 | 204 | 251,453 | [] | [] |
| close 17 | 201 | 252,689 | [] | [] |
| close 17 `--slow` | 201 | 252,689 | [] | [] |
| heat 13 | 172 | 212,863 | [] | [] |
| night 22 | 213 | 260,425 | [] | [] |
| off 17.5 | 192 | 235,058 | [] | [] |
| game overview 8 / 14 / 21.5 | 313 / 312 / 314 | 4.66 M / 4.59 M / 4.63 M | [] | core dependency-cycle ×2* |
| game close 8 / 14 / 21.5 | 351 ×3 | 5.68 M / 5.68 M / 5.64 M | [] | same* |
| game low 8 / 14 / 21.5 | 367 / 366 / 367 | 5.82 M / 5.79 M / 5.79 M | [] | same* |

\* Every game JSON has `warnings: ['[core] dependency cycle at "animals"', '[core] dependency cycle at "zoning"']`.
These come from core, not effects, and I am reporting them as instructed. No caught exceptions from effects appear in any warning list.

`modules.effects.status === 'ok'` in every shot, and effects `updateMs` is 0.08–0.18. Pipeline cost is exactly 12 extra draws at
high and medium and 5 at low, within the spec's ≤ 12. SMAA (14) and `unreal` bloom (20) exceed 12 but are opt-in and disclosed.
Game triangles reach 5.82 M at `low`, close to the 6 M cap, but that is scene content and not attributable to effects.
`node tools/lint.mjs src/modules/effects` passes. `dispose()` restores direct rendering and frees the pipeline, particles and stage.

### README A/B claim vs my measurement (960×540, same camera/seed/time)

| metric | README claim | measured this round |
|---|---|---|
| mean abs diff, on vs off | 12.7 / 255 | **25.8 / 255** |
| frame mean, on / off | not stated, "exposure unaffected" | **93.9 / 70.3 (+34 %)** |
| centre luminance, on / off | 93.0 / 95.7 (≈ 3 % darker) | **85.7 / 59.3 (≈ 44 % brighter)** |
| corners, on / off | 100.8 / 113.3 (≈ 11 % darker) | **98.3 / 100.8 (≈ 2.5 % darker)** |
| all optional passes off (bare chain) vs direct | — | **98.0 vs 70.3** |

## Ranked issues (most damaging first)

1. **[blocker] The README's A/B claim does not reproduce, and the base chain is not exposure-neutral away from midday.**
   *Where:* `overview` vs `off` (both resolutions), `effects-critic4-bare.png`, and the game night A/B.
   *Why it matters:* the shared chain re-exposes every module's look, and the size and direction of the shift depend on time of day:
   - golden-hour showcase: +34 % frame mean, and +39 % even with grade, bloom, AO, AA, haze and particles all off;
   - game midday: about 0 %;
   - game night: −30 %.

   Every other module's critic judges albedo and exposure through this chain. A chain that lifts dusk and crushes night
   by different amounts hides or causes calibration errors elsewhere, and the headline documented claim is false.
   *Fix:* render a linear 0.18 grey card and a 1.0 white card through both paths (direct `renderer.render` vs
   ScenePass → Resolve → OutputPass with all options off) at 8, 17.5 and 21.5 h, and diff the bytes. The bare chain
   must match direct within about 1–2 %. Check what differs between the HalfFloat MSAA scene target and the canvas
   path (tone-mapping and colour-space handling in materials or the sky when the target is not the screen, and exposure
   read at a different time). Then re-measure and rewrite the README A/B from real numbers.
2. **[major] Mip-chain bloom produces square halos.**
   *Where:* `night` lamp heads (zoomed crop) and small orange glows on game-night lights.
   *Why it matters:* real lens and eye glare is radially symmetric. Square halos read immediately as a cheap
   ¼-resolution box-filter chain and fall short of the Planet Zoo / C:S II reference.
   *Fix:* use a 13-tap (CoD/Jimenez) downsample with Karis average on the first mip, a proper 3×3 tent upsample, and
   4–5 levels instead of 3, or at least a separable Gaussian on the last two mips. The draw budget has room for this
   at 12 → ≤ 14.
3. **[major] The night grade reads sepia and brown, not moonlit.**
   *Where:* `game-overview-21_5`, `game-close-21_5`, `game-low-21_5`.
   *Why it matters:* reference night savannah is cool, desaturated blue-grey with warm artificial lights as accents.
   The warm cast combines with the −30 % darkening from issue 1. Part of this may be environment's moon and ambient
   colour; the grade's `night` tint (+12 % × warmth on blue) is too weak to counter it.
   *Fix:* once issue 1 is fixed, make the grade apply a Purkinje-style shift at night (desaturate and push toward
   blue at low luminance) rather than scale the day tint. Coordinate with environment.
4. **[minor] Heat haze is barely perceptible.**
   *Where:* `heat` (a faintly wobbling horizon only).
   *Why it matters:* the strength of 0.875 is confirmed, but a 3 px warp at 120–650 m is close to invisible. The
   reference is a clear shimmering band over hot ground.
   *Fix:* scale the amplitude with screen-space distance to the horizon and add a slight luminance lift or
   desaturation in the band.
5. **[minor] `stats().particles.alive` is always 0.**
   *Where:* `particles.js`: `this.stats.alive` is never written. `close --slow` shows a dense trail while stats reports 0.
   *Why it matters:* the API reports a false number.
   *Fix:* count live slots in `update()`, or drop the field.
6. **[minor] Per-frame allocation in `update()`.**
   *Where:* `index.js:150` calls `pipeline.setFrame({ sunColor, sunUp, haze, groundY })` and builds a new object
   literal every frame. This violates the ARCHITECTURE §7 zero-allocation rule and was missed in round 3.
   *Fix:* pass positional arguments or reuse a scratch object.
7. **[minor] Showcase framing and authoring.**
   *Where:* the `overview` world-plane edge and grey void at the top, identical wrinkle bump on every sphere, and the
   stretched rock texture in `close`. Fast-settle shows a single dust blob in `close`; `--slow` shows the proper trail.
   *Fix:* tilt `overview` down or add a horizon skirt; vary the bump per material; give `close` pre-rolled dust so the
   default capture shows the trail.

## What is genuinely good
- Every quantitative claim except the A/B reproduced exactly:
  - extra draws 12 (high and medium), 5 (low), 14 (SMAA), 20 (unreal);
  - haze strength 0.875 at `heat`;
  - grade values within the spec ceilings;
  - per-preset draw and triangle counts identical to the README.
- Zero console errors in 26 captures, and effects `update()` stays at ≤ 0.18 ms.
- GTAO and contact grounding at `close` are convincing. Specular variation across the PBR spheres is good.
- Soft particles work: with `--slow`, the dust trail is warm-lit, soft-edged and fades into the ground without hard intersections.
- In the real game at midday the chain is a clean, neutral refinement with no banding, AA crawl, grain noise or halo rings.
- `dispose()` is correct. Pass-failure isolation (`failed` map plus a logged error) is implemented as specified.

## Verdict
**FAIL, 6.0 (capped; visual merit about 8.0).** The pipeline is cheap, stable and error-free, and its draw-call
accounting is exact. However, the README's own A/B, the claim that the chain is a subtle, exposure-neutral
refinement, does not reproduce. At golden hour the bare chain alone lifts the frame by about 39 %; at game night it
darkens it by about 30 %. Because every module is judged through this chain, this is a project-wide calibration
problem, not a cosmetic one. The square mip-bloom halos and the brown night grade are the next two things that keep
it below the AAA bar. To pass: make the bare chain match direct rendering on a grey-card test at 3 times of day, fix
the bloom kernel, and re-measure and rewrite the A/B section.
