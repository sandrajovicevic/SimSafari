# park — round 4 — score 6.0 / 10 — FAIL

All 7 presets independently captured and read this round, plus one extra re-capture to rule out a
suspected rendering flake (see below).

## Screenshots reviewed (path — what I saw, one line each)
- `tools/shots/park-overview-15.png` — first capture rendered the canvas at only 320×180 instead of the requested 1280×720 (confirmed via `file`); I re-captured standalone (`park-critic-overview-retest.png`) and got a correct 1280×720 render with 0 errors both times — **this was a one-off capture flake, not a reproducible module defect**, ruled out by direct retest rather than assumed. The retest shows the whole park correctly: river with bridges, entrance/lodge complex, kopjes, pans, dirt spurs.
- `tools/shots/park-gate-9.png` — entrance gate with a safari truck queued on the paved approach, lodge complex visible beyond, escarpment backdrop — matches the description precisely.
- `tools/shots/park-lodge-17_5.png` — golden-hour lodge complex: multiple thatched roofs, tents, car park, gravel/dirt road network — matches the description.
- `tools/shots/park-habitat-16.png` — **does not show the described "plains-grazer habitat: zebra, wildebeest and impala behind the wooden-post fence, a viewing hide at the boundary."** It shows a wide river-and-gallery-forest scene instead — no fence, no hide, no zebra/wildebeest/impala anywhere in frame, a completely different biome than the one named in the description. This is not a subtle framing miss; it is a different subject entirely.
- `tools/shots/park-tour-16_5.png` — a pride kopje with a viewing tower is correctly the subject, but I could not locate a safari truck anywhere in the frame despite the description promising "a safari truck on the dirt spur beside the pride kopje, passengers turned toward the lions" — possibly present but illegibly small, not confirmed.
- `tools/shots/park-close-16_5.png` — **does not show the described "lodge veranda close: thatch, timber poles, stone plinth and the pool."** It shows a wide, elevated road-level view of tented camp units with a large rock/thatch shape in the foreground — no pool, no close veranda framing, no stone plinth detail at eye level.
- `tools/shots/park-night-21_5.png` — lodge glowing warm at night, reflective road paint receding into the distance, car park and tents visible, small lit windows — genuinely atmospheric; also shows the same pale/bright waterhole patches at night found repeatedly elsewhere this round (a sixth cross-module data point for that unresolved bug, visible here in the background).

## Contract / errors / perf (table: preset, drawCalls, errors)
| preset | drawCalls | errors |
|---|---|---|
| overview (15h, retest) | 258 | [] |
| gate (9h) | 319 | [] |
| lodge (17.5h) | 341 | [] |
| habitat (16h) | 363 | [] |
| tour (16.5h) | 346 | [] |
| close (16.5h) | 323 | [] |
| night (21.5h) | 364 | [] |

Zero console errors on all 7 presets plus the retest and the flake investigation. All comfortably inside the whole-game ≤1500 draw-call budget with wide margin.

## Ranked issues (most damaging first)

1. **[major] The `habitat` preset shows an entirely different scene than its own description** — a river/gallery view instead of the named plains-grazer habitat with its fence, hide, and three named species. This is the park module's dedicated demonstration of its "4 fenced habitats" headline feature, and it does not show one. Given the same per-seed camera-anchor recomputation idiom is shared with `savannah` (where an analogous, though less severe, mismatch was independently found this round in the `close` preset), this looks like a systemic weakness in how these wave-3 composite modules re-target their preset cameras onto "real" seed-derived feature positions — worth the integrator's attention across both modules rather than treated as two unrelated one-offs.
2. **[major] The `close` preset shows a wide establishing view, not the promised lodge-veranda close-up with a visible pool.** The lodge itself is visible in other presets with real thatch/timber/stone detail (confirmed in `lodge` and `night`), so the assets exist — this preset's camera simply isn't framing them as described.
3. **[minor]** `tour`'s safari truck was not visually confirmed — the kopje subject is correct but I could not locate a vehicle in the frame at this resolution/distance.
4. **[minor, cross-module, already flagged repeatedly this round]** Waterhole/pan surfaces read anomalously bright at night — the same bug independently found and measured in five other modules' reviews this round (terrain, animals, traffic, savannah, and now park); not this module's own code.
5. **[non-issue, investigated]** The `overview` preset's first capture came back at 320×180 instead of 1280×720; a direct retest reproduced correctly at full resolution with 0 errors, so this is recorded as a one-off capture-pipeline flake, not scored against the module.

## What is genuinely good
- `gate`, `lodge`, and `night` all deliver exactly what their descriptions promise, with real, detailed thatch/timber/stone construction, correctly placed vehicles, and atmospheric lighting.
- The whole-park `overview` (once correctly captured) shows a coherent, real composite: entrance, lodge complex, gravel loop with dirt spurs, kopjes, pans, river — built entirely through the other modules' own APIs, matching the README's build-order description.
- Zero console errors across every preset and every extra check; draw calls comfortably inside budget throughout.
- The module's own README documents an unusually rigorous, numbers-based gameplay-fidelity verification (price elasticity, births, drought/disease/poaching/prosperity scenarios via `tools/fidelity.mjs`) — I did not have time to re-run that harness this round, but its presence and specificity (real measured numbers, not projections) is a strength worth noting for the next pass to verify directly.

## Verdict
FAIL. Zero console errors and comfortably within budget, but two of the module's seven presets — including the dedicated demonstration of the headline "4 fenced habitats" feature — show a fundamentally different scene than what they claim to show, not a minor framing nit. Combined with an analogous defect independently found in `savannah` this same round, this points to a systemic weakness in per-seed camera-anchoring across the project's wave-3 composite modules that the next round should investigate together rather than module-by-module.
