# animals — round 5 — score 7.0 / 10 — FAIL

## Screenshots reviewed (path — what I saw, one line each)
- `tools/shots/animals-overview-16.png` — mixed herds along the river at 230 m: animals are reduced to indistinguishable pale/white specks; I cannot actually verify from this shot that 11+ distinct species are present as the preset's own description claims ("elephant, giraffe, zebra, wildebeest, buffalo, impala, ostrich, warthog, rhino, lion, cheetah") — everything reads as generic pale blobs regardless of species.
- `tools/shots/animals-herd-16_5.png` — zebra + wildebeest cluster at eye level: correct silhouettes (wildebeest horns/beard, zebra build), but the herd reads as one tight static clump rather than a naturally spread walking group; stripe/patch patterns mostly collapse to a pale grey-white at this range.
- `tools/shots/animals-waterhole-8.png` — three elephants drinking at a pool plus a giraffe approaching: genuinely good composition, correct trunk-down drinking poses, plausible trampled-mud shore, believable morning light.
- `tools/shots/animals-predators-17_5.png` — lion pride in golden-hour grass: animals read as pale tan/white shapes with little mane or tawny-coat definition — hard to identify as lions specifically rather than any mid-sized pale animal at this distance/exposure; matches the README's own disclosed "predators still slightly overexposed" gap, confirmed here.
- `tools/shots/animals-close-15.png` — one elephant at 12 m: the best shot in the set — correctly proportioned trunk, tusks, large ears, organic wrinkle texture on the hide and legs, convincing pose in tall dry grass, good lighting.
- `tools/shots/animals-night-21_5.png` — hippos/animals barely visible dark shapes on near-black ground; matches the module's own honestly-disclosed "night is essentially unlit black" gap (a core/environment lighting issue, not this module's). The river in the same frame glows an odd pale cream-white — the same night-water-too-bright symptom independently found and measured in `terrain`'s round-4 review; further cross-module confirmation of that bug.
- `tools/shots/animals-critic-overview-stats2.png` + eval readback (my extra check) — called the module's own `stats()` API directly: `{animals: 128, pools: 14, nearInstances: 56, farInstances: 72, triangles: 358930, drawCallsEstimate: 37}`. This confirms the README's caveat that the whole-frame triangle/draw-call totals (up to 4.7 M / 103 draws) are dominated by terrain+props sharing the frame, not by animals itself — animals' own contribution is comfortably inside the spec's ≤200 draws / ≤1.5 M triangle budget.
- `tools/shots/animals-critic-overview-morning.png` (my extra angle: overview preset, tod 9 instead of 16) — same legibility problem as the tod-16 overview: animals still unidentifiable specks; confirms this isn't a lighting-hour-specific issue.

## Contract / errors / perf (table: preset, drawCalls, triangles, errors, animals' own updateMs)
| preset | drawCalls (frame) | triangles (frame) | errors | animals updateMs |
|---|---|---|---|---|
| overview (16h) | 103 | 4,728,430 | [] | 4.179 |
| herd (16.5h) | 68 | 4,066,696 | [] | 2.287 |
| waterhole (8h) | 77 | 3,761,750 | [] | 3.201 |
| predators (17.5h) | 71 | 3,846,077 | [] | 1.639 |
| close (15h) | 53 | 3,286,900 | [] | 1.012 |
| night (21.5h) | 67 | 3,624,998 | [] | 1.562 |
| extra: overview @9h | 102 | 4,695,662 | [] | **4.997** |

Zero console errors on all 7 shots; `modules.animals.status === 'ok'` throughout. Frame-wide triangle totals look alarming against the spec's "1.5 M at overview" line, but the module's own `stats()` readback shows animals' actual geometry is 358,930 triangles / 37 draw calls at 128 animals — well within budget; the rest is terrain+props sharing the showcase frame, exactly as the README discloses. **The real, previously-unflagged budget problem is `update()` time**: ARCHITECTURE §7 sets a ≤ 3 ms per-frame budget for animals specifically (the one module besides traffic given a raised ceiling), and I measured 4.18 ms and 4.997 ms at two different times of day with the same 128-animal overview scene — a consistent 40–65% overrun, not a one-off. This is a genuine budget fail the README's own "Measured performance" table never reports (it only tracks draw calls/triangles, never `update()` cost).

## Ranked issues (most damaging first)

1. **[major] `update()` exceeds its 3 ms budget by 40–65%, consistently.** Measured 4.179 ms (overview, 16h) and 4.997 ms (overview, 9h) with 128 animals, both well over the ARCHITECTURE §7 ceiling for this module. The spec explicitly sizes this budget "for 200 animals" — at 128 animals already over budget, the cost at the full 200-animal target would very likely be worse. Not mentioned anywhere in the README's own performance table, which tracks only draw calls/triangles. Fix direction: the behaviour step (`beh.step`) runs for every animal every fixed tick regardless of camera visibility/distance — spatial partitioning or a coarser tick rate for animals far from the camera would be the obvious lever.
2. **[major] The `overview` preset cannot be used to verify its own species-diversity claim.** At 230 m every animal collapses to an indistinguishable pale speck — I could not confirm from either the module's own `overview` shot or my extra `overview@9h` angle that the claimed roster ("elephant, giraffe, zebra, wildebeest, buffalo, impala, ostrich, warthog, rhino, lion, cheetah") is actually present and distinguishable, as opposed to a handful of species repeated. This is the establishing shot for the module's headline feature (12 procedurally distinct species) and it does not demonstrate that feature.
3. **[minor, mostly disclosed] `predators` reads poorly** — lions/cheetah at golden hour appear as pale tan-white shapes rather than tawny cats with legible manes, confirming the README's own "still slightly overexposed" note. Combined with distance, individual animals in the pride are hard to tell apart from prey silhouettes.
4. **[minor, disclosed] Night is close to unlit black** and the river in the same frame is anomalously bright (cross-confirms the `terrain` night-water bug found independently in that module's round-4 review) — both are core/environment/terrain issues, correctly attributed as out-of-scope in this module's own README.
5. **[minor, disclosed] Herd reads as a tight static clump** rather than a spread, naturally-moving group at the `herd` preset's own distance; pale species (zebra white, giraffe cream) mip-collapse toward a uniform light grey at range. Both already honestly listed in Known gaps.

## What is genuinely good
- The `close` elephant shot is the strongest single image in the module: correct proportions, legible trunk/tusks/ear silhouette, organic wrinkle skin detail, convincing pose and lighting. This alone would score well against the BBC-documentary-still reference.
- `waterhole` composition (elephants drinking, giraffe approaching, plausible trampled mud shore) reads as a genuinely staged wildlife scene, not a tech demo.
- Twelve species confirmed present in `species.js`, matching both the README and the spec's minimum-10 requirement.
- Module-isolated performance (via `stats()`) is comfortably within its geometry budget — the alarming frame-wide triangle counts are correctly attributable to terrain/props sharing the scene, not to this module, and the README's own disclosure of that fact holds up under independent verification.
- `index.js` API surface matches the README's table exactly; `update()`'s hot loop reuses scratch vectors (`_fwd`, `_p`, `_e`, `_q`, `_s`, `_m`) with no `new THREE.` found; `dispose()` releases every pool, the contact-shadow system, and the group.

## Verdict
FAIL. Zero console errors, and the module's own geometry is inside its draw-call/triangle budget once correctly isolated from the shared showcase frame — but `update()` consistently runs 40–65% over its 3 ms budget (a real, previously unmeasured perf problem), and the flagship `overview` preset cannot actually demonstrate the 12-species roster it claims at its own showcase distance. Close-range work (the `close` and `waterhole` shots) is genuinely strong and is why this doesn't fall to the same 6.0 floor as terrain/environment.
