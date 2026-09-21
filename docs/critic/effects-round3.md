# effects — round 3 — score 8.5 / 10 — PASS

## Screenshots reviewed (path — what I saw, one line each)
- `tools/shots/effects-overview-17_5.png` — golden-hour effects yard: warm filmic grade, soft haze toward the distant blocky skyline, small lit lamp posts among the test spheres, gentle vignette darkening the corners. Reads as a subtle, not dramatic, refinement — consistent with the spec's "subtle bloom"/"gentle vignette" language.
- `tools/shots/effects-close-17.png` — PBR sphere array at 26 m: genuinely convincing GTAO contact shadows grounding every sphere/crate/rock, correct material variety (metal, cloth-like, marble, glass-ish), a faint backlit dust/smoke wisp on the left rim-lit by the low sun from behind, warm lamp-post glow. The strongest single shot in the set.
- `tools/shots/effects-heat-13.png` — midday: blue sky, thin cirrus, distant skyline; haze isn't visually obvious in a static frame (expected — it's a per-frame refraction effect), but I confirmed it numerically (see below).
- `tools/shots/effects-night-22.png` — genuinely good bloom: soft glowing halos around every lamp post, warm-lit spheres near a small campfire glow, stars + a Milky Way smudge overhead, legible without being washed out.
- `tools/shots/effects-off-17_5.png` — pipeline bypassed, same camera/time: broadly similar composition to `overview` as the README's own A/B claims, with a visibly less-contained blown-white sun glow in the top-left corner (no vignette darkening) — consistent with "subtle refinement, not a repaint".
- `tools/shots/effects-critic-measure.png` + eval (my extra check) — called `effects.measure()` directly: `{direct: 192, pipeline: 204, extra: 12, msaa: 4, quality: 'high', failed: {}}`. **The pipeline costs exactly 12 extra draw calls — bit-for-bit the number the README claims and exactly the spec's "≤12 extra draw calls" ceiling** — independently confirmed, not re-typed from the README.
- `tools/shots/effects-critic-hazecheck.png` + eval (my extra check) — `getHazeStrength()` at the `heat` preset (13h, midday) returns **0.875**, and `stats()` confirms every pass (`ao, bloom, haze, grade, vignette, grain, aa, particles`) is enabled with `failed: {}` — the heat-haze requirement is genuinely active, not just claimed.
- `tools/shots/effects-critic-grade.png` + eval (my extra check) — `getGrade()` at `overview`: `{contrast: 1.06, saturation: 1.05, warmth: 0.35, vignette: 0.28, grain: 0.02, bloom: 0.18}` — every value sits inside the spec's explicit ceilings (bloom strength ≤0.35, grain ≤0.02 — grain sits exactly at the limit) and matches the "subtle" character the screenshots show.

## Contract / errors / perf (table: preset, drawCalls, triangles, errors)
| preset | drawCalls | triangles | errors |
|---|---|---|---|
| overview (17.5h) | 204 | 251,453 | [] |
| close (17h) | 201 | 252,689 | [] |
| heat (13h) | 172 | 212,863 | [] |
| night (22h) | 213 | 260,425 | [] |
| off (17.5h) | 192 | 235,058 | [] |

Zero console errors on all 5 presets plus the three extra verification shots. `modules.effects.status === 'ok'` throughout. Pipeline's own contribution independently measured at exactly 12 draw calls (spec ceiling), the rest of each frame's total is the showcase's own test-yard geometry plus CSM shadow-cascade multiplication (correctly attributed in the README as showcase-authoring cost, not a real per-frame cost the module carries in the actual game, where it adds no scene meshes at all). Triangle counts comfortably inside the project's 6 M budget. `node tools/lint.mjs src/modules/effects` clean.

## Ranked issues (most damaging first)
1. **[minor]** The `overview` establishing shot is visually a little flat against the Planet Zoo/Cities: Skylines II reference bar — the effect is deliberately subtle (by design, and the numbers confirm it), but at this specific camera distance the pipeline's contribution is hard to appreciate without the `off` A/B alongside it; the `close` preset is where the pipeline's value is actually legible.
2. **[minor]** Ambient dust/smoke particles are only faintly visible even in the `close` preset (one wisp, rim-lit) — present and confirmed active via `stats()` (`particles.spawned: 117`), but visually subtle enough that a viewer without the API readout could miss that the particle system is doing anything.

Nothing rises above minor; I specifically checked for the class of "claimed but not shown" defect found in every visually-scored module reviewed so far (terrain, environment, animals, ui) and did not find one — every specific number in the README's unusually detailed measurement tables reproduced exactly when I called the same APIs myself.

## What is genuinely good
- Every quantitative claim in the module's own (extensive) README reproduced exactly under independent verification: 12/12 pipeline draw calls, matching triangle counts per preset, haze strength active and non-zero at the `heat` preset, grade parameters within spec ceilings.
- GTAO contact shadows at the `close` preset are genuinely convincing — objects read as grounded, not pasted on.
- Night bloom is well-tuned: soft, legible halos around lamp posts without blowing out the scene.
- The module's own draw-call attribution analysis (separating pipeline cost from showcase-yard cost, including correctly diagnosing the CSM-cascade multiplier as the source of the "189 extra draws") is exactly the kind of rigorous self-accounting this project needed and mostly didn't get elsewhere.
- `dispose()` correctly restores direct rendering (`ctx.app.setRenderFn(null)`), disposes the pipeline and particle system, and clears the stage; `update()` reuses a single `lightIn` object with no per-frame `new THREE.` allocations found.

## Verdict
PASS. Zero console errors, exactly within its 12-draw-call pipeline budget (independently measured via `effects.measure()`, not just read off the README), and every specific quantitative claim I checked reproduced exactly. Visual quality is genuinely strong at close range (GTAO, night bloom) and appropriately restrained at overview distance, matching the spec's own "subtle" mandate rather than overshooting it.
