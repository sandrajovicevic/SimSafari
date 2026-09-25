# environment — round 8 — score 6.0 / 10 — FAIL

Round 7's two majors are fixed and verified, and the DISC_K / afterglow / night-lift claims all reproduce.
The score is claim-capped again, this time by the module's own newest known-gap note: "night sky mostly
points" does not reproduce on the shipped `night` preset — the night sky's dominant feature is a bright
grey-white cloud speckle wall. All captures mine, 1280×720, seed 1, real GPU "ANGLE (AMD, AMD Radeon RX
5700 XT D3D11)" via tools/gpu-check.mjs unless marked SwiftShader. I read every PNG.

## Screenshots reviewed (path — what I saw, one line each)
- `tools/shots/env-r8-overview-14.png` — midday at the fixed pitch 12: sky is properly in frame (top ~28%), pale blue with faint small cumulus flecks; demo pillars/spheres legible with short shadows; a slightly smudgy darker band hugs the horizon.
- `tools/shots/env-r8-overview-9.png` (my extra angle, 9 h) — scattered discrete cumulus puffs across a clean blue sky; the round-7 "no cumulus at fair-weather coverage" major is dead.
- `tools/shots/env-r8-dawn-6_3.png` — hazy orange sunrise, faint small sun disc in the glow, warm-lit cloud streaks, long cool shadows; "dawn haze" claim reproduces.
- `tools/shots/env-r8-golden-17_6.png` — warm low sun with legible disc + corona, small cumulus flecks catching warm light upper-right, long blue-shadowed ground; "lit cumulus" is now at least technically present, though weak.
- `tools/shots/env-r8-golden-12.png` (my extra angle, noon sun on the golden camera) — the clearest cumulus presentation: discrete puffs, clean blue gradient, short shadows.
- `tools/shots/env-r8-dusk-18_7.png` — civil twilight: orange afterglow band low on the horizon and first stars are both present (afterglow claim reproduces), **but the entire upper sky is a uniform high-contrast speckle wall of orange/white/dark flecks** — reads as spackle, not weather.
- `tools/shots/env-r8-night-22.png` — moonlit ground legible (olive-khaki, soft shadows, gold sphere reads), points stars + Milky Way smudge lower in the sky; **the top sky band is a dense bright grey-white speckle/static field** (issue 1).
- `tools/shots/env-r8-night-22-noclouds.png` (SwiftShader diagnostic, `setDebug({clouds:false})`) — speckle wall gone, stars are points: the static is the cumulus layer at cloud 0.08, not the star field.
- `tools/shots/env-r8-night-3.png` (my extra angle, deep night) — same speckle wall in the upper band; ground still legible.
- `tools/shots/env-r8-overcast-13.png` — flat pale-grey deck, genuinely no hard shadows (shadow gate verified in code and image), objects soft-shaded; "overcast soft shadows" claim reproduces.
- `tools/shots/env-r8-storm-15.png` — grey streaky deck with wind-driven rain streaks; reads visibly darker/moodier than overcast now (the round-6 inversion is gone; the disclosed residual of storm not being *much* darker remains).
- `tools/shots/env-r8-close-17.png` — sun disc + corona, clean falloff, **no hollow glare-recovery ring** — the DISC_K claim reproduces at its home preset.
- `tools/shots/env-r8-close-6_3.png` (my extra angle, dawn disc) — sunrise disc in haze, scattered warm-lit cumulus puffs (the best cloud look in the set), clean blue-to-cream gradient.

## Contract / errors / perf (table: preset, drawCalls, triangles, errors)
| preset | drawCalls | triangles | errors |
|---|---|---|---|
| overview 14 | 34 | 45,290 | [] |
| overview 9 (extra) | 34 | 45,290 | [] |
| dawn 6.3 | 43 | 60,218 | [] |
| golden 17.6 | 43 | 60,218 | [] |
| golden 12 (extra) | 43 | 60,218 | [] |
| dusk 18.7 | 44 | 60,218 | [] |
| night 22 | 44 | 60,218 | [] |
| night 3 (extra) | 44 | 60,218 | [] |
| overcast 13 | 13 | 15,074 | [] |
| storm 15 | 14 | 20,274 | [] |
| close 17 | 43 | 60,218 | [] |
| close 6.3 (extra) | 43 | 60,218 | [] |

Zero console errors on all 12 shots; `modules.environment.status === 'ok'` throughout. As in round 7 I
accept that the spec's "≤ 12 draw calls" line covers the sky/cloud/star/rain elements themselves; the
excess above ~12 is the showcase's demo stage (pillars, spheres, boxes × CSM cascades), which the spec
itself asks the module to stage. Project-wide budgets trivially met. `node tools/lint.mjs
src/modules/environment` clean. Contract: every README API function exists (`getSunDirection` …
`getState`, `setDebug`, `refresh`); `dependencies: []` truthful (standalone); `update()` reuses `st`/
scratch objects — allocation-free; `dispose()` releases CSM, PMREM, LUT RT, all materials/geometries,
named textures, and resets scene fog/background/exposure. Budget: **pass**. Errors: **pass**.

## Ranked issues (most damaging first)

1. **[major, claim-cap] The night sky is dominated by a bright cumulus speckle wall — the README's own "night sky mostly points" verification claim does not reproduce.** *Where:* `night` 22 h and my extra `night` 3 h, upper ~15% of frame: hundreds of small grey-white flecks reading as TV static. Diagnostic: `setDebug({clouds:false})` removes it, so it is the cumulus layer at the preset's own cloud 0.08 — the 2026-09-25 scale fix (0.00009/m) made the flecks bigger without fixing their night presentation: the moonlit branch lights a fine-grained noise field whose threshold leaks a dense speckle instead of a few puffs. *Why it matters:* the night preset is mandatory, its description promises "moonlight, stars + Milky Way", and the most salient sky feature is synthetic noise; the README cites `env-after2-night.png` as evidence for a claim my own capture contradicts. *Fix:* at night, raise the density threshold (or lower `uMoonBoost`) so cloud 0.08 renders 3–10 discrete moonlit puffs, and give the coverage→density field spatial variance so flecks cluster instead of tiling uniformly to the horizon.
2. **[major] Dusk sky reads as a uniform speckle wall rather than cloud structure.** *Where:* `dusk` 18.7 — the entire sky is covered edge-to-edge in same-size high-contrast flecks (backlit gaps glowing orange). Real twilight altocumulus clusters into banks with clear sky between; the current field has no spatial structure, no gradient from crowded to clear, which is what makes it read synthetic. Same root as issue 1: the coverage mapping has no large-scale variance term. *Fix:* modulate the density threshold with a ~2–6 km noise octave so the field forms banks and clear patches; let the afterglow gradient own the horizon by thinning coverage below ~10° elevation.
3. **[minor] Fair-weather cumulus are under-scale and under-lit at midday.** *Where:* `overview` 14 — the puffs read as faint white flecks near the top of frame; `golden` 17.6's "lit cumulus" are barely distinguishable from cirrus streaks. Compared to reference cumulus over the Serengeti they are ~2–3× too small in apparent size and lack any shaded base. *Fix:* another ~2× scale step for the cumulus layer plus a subtle vertical brightness gradient inside each puff (bright top, grey base) — the round-6 self-shadow fix already computes the terms needed.
4. **[minor] A smudgy darker band hugs the horizon in the day presets.** *Where:* `overview` 14, `golden` 12, `overview` 9 — a grey-blue stripe between pale sky and pale ground. This is the below-horizon plain + aerial-perspective transition flagged in earlier rounds; from showcase pitch it reads as a dirty stripe rather than depth cue. *Fix:* blend the below-horizon plain colour toward the fog colour over the first ~2° below the horizon instead of a near-step.
5. **[minor, disclosed] Single-scatter anti-solar twilight gap and un-tuned storm residual remain as disclosed** — dusk's anti-solar side is darker than photography; storm is no longer brighter than overcast (inversion fixed) but not yet clearly darker. Both honestly documented; no cap triggered by either since the README no longer claims they are solved.

## What is genuinely good
- Round 7's both majors are really fixed: `overview`/`overcast` now put the sky in frame (pitch 12/10), and cumulus render at fair-weather coverage — discrete puffs at 9 h/12 h/dawn/dawn-close, not just the overcast deck.
- The DISC_K sun-disc claim reproduces cleanly at `close` 17 h and in my extra dawn angle: legible disc + graded corona, no hollow ring.
- Dusk afterglow + first stars, dawn haze, overcast's shadowless flat light, and the storm deck + wind-driven rain are all present and well differentiated by time of day — the day-cycle reads as one coherent atmosphere.
- Night ground legibility (NIGHT_LIFT/NIGHT_HEMI) holds: moonlit scene readable, unmistakably night, soft shadows, no wash-out.
- Contract, dispose, allocation discipline and error cleanliness are exemplary; zero console errors in 12 GPU shots.

## Verdict
FAIL, **6.0 — capped** by the brief's rule that a README claim I could not reproduce caps the score: the
module's own 2026-09-25 note claims the night sky is "mostly points" and my captures show a cloud-static
wall on the shipped `night` preset at two different hours, diagnosed to the cumulus layer by toggle.
Uncapped I would score the current state about **7.5**: the round-7 framing and cumulus-visibility
failures are genuinely fixed and the day cycle is strong, but the night/dusk cloud presentation is the
dominant synthetic element left in the module. Make the coverage field cluster (issues 1–2) and the
night claim true again, and this is an 8.5 candidate.

## Proposed STATUS.json update
```json
{
  "environment": {
    "round": 8,
    "score": 6.0,
    "status": "fail",
    "errors": 0,
    "drawCalls": 44,
    "issues": [
      { "sev": "major", "text": "CLAIM CAP: README's 'night sky mostly points' does not reproduce — the night preset's upper sky is a dense bright grey-white cumulus speckle wall (verified clouds via setDebug({clouds:false}) toggle; present at 22h and 3h, cloud=0.08). Night flecks need a higher density threshold / lower moon boost plus spatial clustering." },
      { "sev": "major", "text": "Dusk sky reads as a uniform high-contrast speckle wall edge-to-edge (18.7h) — coverage->density field has no large-scale spatial variance, so backlit gaps and flecks tile uniformly instead of forming banks with clear sky between." },
      { "sev": "minor", "text": "Fair-weather cumulus under-scale and under-lit at midday/golden (faint flecks at overview 14, 'lit cumulus' at golden barely distinguishable from cirrus); need ~2x scale and shaded bases." },
      { "sev": "minor", "text": "Smudgy darker band hugs the horizon in day presets (overview 9/14, golden 12) — below-horizon plain to fog transition reads as a dirty stripe from showcase pitches." },
      { "sev": "minor", "text": "Disclosed residuals stand: single-scatter anti-solar twilight darker than reference; storm no longer brighter than overcast but not yet clearly darker." }
    ],
    "good": "Round-7 majors verified fixed: overview/overcast now show the sky (pitch 12/10) and cumulus render as discrete puffs at fair-weather coverage. DISC_K sun disc + clean corona reproduce at close 17h and dawn; dusk afterglow + first stars, dawn haze, shadowless overcast and moody storm deck all present and well time-differentiated; night ground legible without wash-out. 0 console errors in 12 GPU captures, contract/dispose/allocation discipline clean."
  }
}
```
