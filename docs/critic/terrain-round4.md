# terrain — round 4 — score 6.0 / 10 — FAIL

## Screenshots reviewed (path — what I saw, one line each)
- `tools/shots/terrain-overview-15.png` — whole park from SE: golden dry-season plain, river valley with green/laterite margin, escarpment across the north with a very regular vertical-fluted cliff face, two pans, kopjes; reads well at this distance.
- `tools/shots/terrain-plains-16_5.png` — 40 m grass plain, mid-afternoon: plausible dry golden grass micro-pattern, faint river/pan visible on the horizon, one clean red laterite patch; good, no obvious tiling at this range.
- `tools/shots/terrain-kopje-17.png` — granite kopje, evening light: angular stacked-block boulders (confirms the round-3 "angular, not cauliflower" rebuild claim), long correct shadow direction.
- `tools/shots/terrain-river-9.png` — river channel, morning: green/laterite floodplain margins read well; water itself is a flat, near-opaque dark olive slab with no visible flow structure or bank ripple.
- `tools/shots/terrain-escarpment-7.png` — cliff band at sunrise: same vertical-fluted "corduroy" cliff pattern seen at overview, confirmed here at showcase distance (not just extreme close-range as the README's known-gaps section implies) — every groove is near-identical width/spacing, reading as a repeating procedural column motif rather than natural stratified rock.
- `tools/shots/terrain-close-16.png` (river bank, close) — cracked-mud/laterite ground detail is convincing; water remains a flat murky brown-green with no glint or ripple silhouette even at close range and mid-afternoon light.
- `tools/shots/terrain-night-21_5.png` — **the river reads as a glowing pale cream-white ribbon, visibly the brightest thing in the frame, brighter than the sky above the escarpment**; ground is correctly near-black per the disclosed known gap, but the water is not — it stands out as an obviously wrong self-lit-looking surface.
- `tools/shots/terrain-critic-close-dawn.png` (close preset, tod 6.5, my extra angle) — dawn light on the same bank; rock/laterite detail holds up, water still flat and muddy but not overbright at this hour.
- `tools/shots/terrain-critic-overview-noon.png` (overview, tod 12, my extra angle) — same corduroy escarpment artifact fully visible under overhead sun, confirming it isn't a low-sun-angle shading artifact.
- `tools/shots/terrain-critic-night-pixels2.png` + raw pixel readback (see below) — quantitatively confirms the night water overbright issue.

## Contract / errors / perf (table: preset, drawCalls, triangles, errors)
| preset | drawCalls | triangles | errors |
|---|---|---|---|
| overview (15h) | 35 | 1,090,924 | [] |
| plains (16.5h) | 24 | 730,476 | [] |
| kopje (17h) | 36 | 1,123,692 | [] |
| river (9h) | 38 | 1,189,228 | [] |
| escarpment (7h) | 40 | 1,254,764 | [] |
| close (16h) | 32 | 992,620 | [] |
| night (21.5h) | 44 | 1,353,068 | [] |
| extra: close @6.5h | 32 | 992,620 | [] |
| extra: overview @12h | 35 | 1,090,924 | [] |

All 9 shots: `modules.terrain.status === 'ok'`, zero console errors, draw calls well inside the ≤ 64 terrain+water soft cap, triangles inside the ≤ 6 M scene-wide budget (overview itself is under the spec's own 1.2 M line). `node tools/lint.mjs` is clean project-wide (no `Math.random` violations). Budget: **pass**. Errors: **pass**.

## Ranked issues (most damaging first)

1. **[major] Night water renders brighter than the sky — a claim in the README that does not hold up.** Pixel readback on `terrain-critic-night-pixels2.png` (rendered synchronously via `--eval`, sampled after a real render call so the buffer wasn't stale):
   - water centre ≈ RGB(83, 85, 67)
   - ground (far field) ≈ RGB(33, 25, 11)
   - sky (above escarpment) ≈ RGB(22, 18, 14)
   The water is ~2.5–3× brighter than both the ground and the sky it should be reflecting. `water.js`'s own comment says forcing `envMapIntensity = 0.10` every frame in `updateWaterSky()` "is what fixed the water blowing out to white" — that fix was evidently verified only at the daytime/overview conditions it was tested under, not at night, where the same failure mode is still visible to the eye and confirmed by direct pixel measurement. This is exactly the kind of "fixed" claim the project has a documented history of getting wrong without an actual look — reproduced here, not resolved.
2. **[major] Escarpment cliff face reads as a repeating procedural "fluted column" motif, not natural rock.** Visible identically at `overview` (15h), `escarpment` (7h, the module's own dedicated showcase for this feature) and my extra `overview@12h` angle — this is not a close-range-only artifact as the README's known-gaps section frames it ("at extreme close range... on a cliff face the two-scale blend can still be spotted as a repeat"); it is the dominant visual signature of the whole ridge at every distance tested. Real Kruger/Serengeti escarpments (the stated reference) show irregular ledges, vegetated benches, colour-banded strata and talus fans, not uniform equal-width vertical grooves running the full 1000 m length. Fix direction: break the fracture-plane spacing/width with stronger domain warp per-groove, vary groove depth along the ridge, add ledge/talus vegetation breakup.
3. **[minor] Water has no visible surface structure.** Confirmed at both `river` and `close` presets: no ripple silhouette, no flow direction cues, near-flat colour gradient. Disclosed honestly in the README ("flat-shaded per-cell mesh... ripples are entirely a normal-map effect") — the normal-map ripple isn't even legible in any of these renders; it reads as a flat murky slab rather than moving water.
4. **[minor, disclosed] Night ground is close to unlit black.** Confirmed by the pixel readback above (ground ≈ RGB(33,25,11), close to the black point). README already discloses this as a shared, cross-module ambient-lighting issue rather than terrain-specific, and that framing checks out — but it still reads poorly against the nature reference (real savannah night has visible blue-grey moonlit ambient).

## What is genuinely good
- Kopjes are now genuinely angular stacked-block forms with correct long shadows — the round-3 claim to have fixed the old "cauliflower" rounded-dome look is real and verified.
- Plains grass micro-pattern and the laterite/dirt patchwork read convincingly as dry-season savannah at the `plains` and `close` distances, with no obvious tiling.
- Draw-call and triangle budgets are comfortably met across every preset and every extra angle I shot; zero console errors anywhere.

## Verdict
FAIL. Zero errors and comfortably within budget, but the pass bar (≥ 8.5) is far out of reach: a directly-measured, reproducible night-water lighting bug that contradicts the module's own "fixed" narrative, plus a showcase-distance-visible repeating cliff artifact on the escarpment (the module's second named signature feature). Capped at 6 per the brief's "claim in the README you could not reproduce caps at 6" rule.
