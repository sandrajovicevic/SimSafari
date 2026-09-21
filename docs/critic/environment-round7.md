# environment — round 7 — score 6.0 / 10 — FAIL

## Screenshots reviewed (path — what I saw, one line each)
- `tools/shots/environment-overview-14.png` — the module's flagship midday preset (pitch 32°, distance 260) shows almost **no sky at all**: the frame is filled edge-to-edge with a flat khaki ground plane and a thin horizon-haze sliver only in the top corners. No blue sky gradient, no cumulus, nothing that matches the preset's own description ("clear sky with fair-weather cumulus; hard overhead light, short shadows").
- `tools/shots/environment-dawn-6_3.png` — good: hazy orange sunrise gradient, long cool shadows on the demo pillars, plausible dust haze; no cumulus visible despite cloud=0.3.
- `tools/shots/environment-golden-17_6.png` — good warm low-sun gradient and legible sun disc+corona, long correct shadows; description promises "lit cumulus" — none visible anywhere in frame.
- `tools/shots/environment-dusk-18_7.png` — convincing: orange afterglow band low on the horizon fading to blue-black, first stars visible, good gradient.
- `tools/shots/environment-night-22.png` — moonlit ground legible without being washed out, star field with soft Milky Way smudge in the corner, plausible.
- `tools/shots/environment-overcast-13.png` — same near-zero-sky framing problem as `overview` (pitch 24°): only a thin grey strip visible at the very top edge.
- `tools/shots/environment-storm-15.png` — this one works: full-frame streaky grey cloud deck with visible motion-blurred rain streaks over the demo scene, moody and readable as a storm.
- `tools/shots/environment-close-17.png` — sun disc with a soft halo ring, correctly legible (confirms the round-3→round-4 `DISC_K` fix claim in the README is real).
- `tools/shots/environment-critic-overview-lowpitch.png` (my extra angle: same overview preset/weather, camera re-aimed to pitch 10°) — with the sky actually in frame, it is a clean blue gradient with **zero visible cumulus puffs** despite cloud=0.18 weather.
- `tools/shots/environment-critic-golden-lowpitch.png` (my extra angle: golden preset, pitch 6°) — same result: clean sunset gradient, no cumulus shapes anywhere, contradicting "lit cumulus" in the preset's own description.
- `tools/shots/environment-critic-overcast-lowpitch.png` (my extra angle: overcast preset, pitch 10°) — by contrast, at high cloud coverage the cloud layer renders clearly (streaky grey texture, correct look) — so the cloud shader itself works, it just doesn't produce visible individual cumulus shapes at low/moderate coverage values.

## Contract / errors / perf (table: preset, drawCalls, triangles, errors)
| preset | drawCalls | triangles | errors |
|---|---|---|---|
| overview (14h) | 34 | 45,290 | [] |
| dawn (6.3h) | 43 | 60,218 | [] |
| golden (17.6h) | 43 | 60,218 | [] |
| dusk (18.7h) | 44 | 60,218 | [] |
| night (22h) | 44 | 60,218 | [] |
| overcast (13h) | 13 | 15,074 | [] |
| storm (15h) | 14 | 20,274 | [] |
| close (17h) | 43 | 60,218 | [] |
| extra: overview lowpitch | 34 | 45,290 | [] |
| extra: golden lowpitch | 43 | 60,218 | [] |
| extra: overcast lowpitch | 13 | 15,074 | [] |

Zero console errors on all 11 shots; `modules.environment.status === 'ok'` throughout. The spec's own "≤ 12 draw calls" line is exceeded (13–44 measured), but the excess is entirely the showcase's own demo stage (5 spheres, 3 boxes, a wall, an instanced pillar mesh, each drawn once per CSM cascade — 10 objects × ~4 passes ≈ the difference), not the sky/cloud/star/rain elements themselves, which is a reasonable reading of that spec line given the showcase explicitly stages "a simple test scene... so lighting is judged on its own." I do not treat this as a budget fail. Total draw calls are trivially inside the project-wide ≤ 1500 cap either way.

## Ranked issues (most damaging first)

1. **[major] The `overview` and `overcast` presets — the module's two highest-pitch camera angles — show effectively no sky.** At pitch 32° (overview) and 24° (overcast), with a 45° vertical FOV (±22.5°), the *entire* view frustum points below horizontal, so almost the whole frame is flat ground haze and the sky is reduced to a thin gradient sliver in the top corners. `overview` is the module's primary "whole sky/cloud/shadow stack at midday" shot per its own README preset table — and it does not show the sky it claims to. Re-aiming the exact same camera to pitch 10° (`environment-critic-overview-lowpitch.png`) reveals the sky is actually fine underneath; this is a showcase camera-authoring bug, not a shader bug, but it means two of eight mandatory-feeling presets fail to demonstrate the thing the module exists to show. Fix: lower the pitch on `overview`/`overcast` (or raise camera height without steepening the down-angle) so the horizon sits roughly a third of the way down the frame.
2. **[major] Cumulus clouds are not visible at any of the "fair weather" coverage values used by the daytime presets.** `overview` (cloud 0.18), `dawn` (0.3), `golden` (0.25) all promise or imply visible clouds in their own descriptions ("fair-weather cumulus", "lit cumulus") — none show a single cloud shape, only a clean gradient. Re-aiming the camera to guarantee sky is in frame (`environment-critic-golden-lowpitch.png`) confirms this is not a framing artifact: the sky is genuinely cloudless at these settings. The cloud shader itself is not broken — `overcast`'s much higher coverage renders a full, correctly textured streaky deck (`environment-overcast-13.png`, confirmed again from a low-pitch angle) — but there appears to be no coverage response between "invisible" and "solid overcast deck"; scattered fair-weather cumulus puffs, the thing three of the eight presets' descriptions promise, do not exist at any coverage tested. Fix: check the cumulus layer's coverage→density mapping — it likely has a high threshold before any density is visible, when it should ramp from a few puffs at 0.15–0.3 up to solid cover near 1.0.
3. **[minor] Single-scattering sky and night-tuning limitations are honestly disclosed in the README** (no multiple scattering, art-directed night lift, un-tuned storm exposure damping) — these read as intended trade-offs rather than bugs, and the disclosed effects match what I saw (storm sky ~visibly brighter than "dark cloud deck" implies, but not broken).

## What is genuinely good
- Sunrise/sunset/dusk gradients (`dawn`, `golden`, `dusk`) are convincing and well-differentiated by time of day, with correctly warm low-sun colour and long shadow lengths.
- The `close` preset's sun disc + corona is genuinely legible — the round-4 `DISC_K` fix claim in the README checks out on inspection, not just by the builder's own account.
- Night preset balances moonlit legibility against staying unmistakably night; stars and a Milky Way smudge are present without over-brightening the scene.
- Storm preset is the best-executed weather state: full cloud deck, correctly wind-driven rain streaks, moody without breaking readability.
- `index.js` API surface matches the README's documented functions exactly; `update()` reuses scratch vectors (no per-frame `new THREE.` found); `dispose()` releases CSM, render targets, PMREM, all materials/geometries, named textures, and resets scene fog/background/exposure — thorough.

## Verdict
FAIL. Zero console errors and no meaningful draw-call/triangle budget problem, but two of the module's eight presets (including the primary `overview` shot) fail to actually display sky, and cumulus clouds — an explicitly promised feature in three preset descriptions and the module's own spec — do not render at any "fair weather" coverage value tested. Capped at 6 per the brief's "claim in the README/preset you could not reproduce caps at 6" rule.
