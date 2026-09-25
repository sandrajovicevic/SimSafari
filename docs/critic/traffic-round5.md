# traffic — round 5 — score 7.0 / 10 — FAIL

Round 4's blocker (close/night rendering an empty road) and both of its cap-triggering failures are
fixed and verified with my own real-GPU captures and a live state readback. The presets now show
the module doing its job; the remaining gap to the pass line is the vehicle itself, which still
reads as programmer art at the close range two of its four presets deliberately stage.

## Screenshots reviewed (path — what I saw, one line each)
All mine: 1280×720, seed 1, real GPU (ANGLE D3D11, AMD RX 5700 XT), every PNG read.
- `tools/shots/traffic-close-16.5-critic.png` — **the hero truck is in frame** (r4 blocker gone): parked 3/4 rear-side at ~11 m with tiered bench seats, 8 varied-colour passengers (some with hats), ribbed canopy with roof rails, spare wheel. Still toy-grade detail: striated brown body, no readable windscreen glass, flat disc hubs, slab canopy.
- `tools/shots/traffic-night-21.5-critic.png` — the same truck parked: convincing warm headlight pool on the asphalt ahead, and **two red taillights read at the rear** (r4 major fixed); the body is a near-black silhouette and the lane paint glows near-white (roads' issue).
- `tools/shots/traffic-close-19-critic.png` (extra, dusk) — taillights even clearer at 19 h: two bright red-orange lamps at the rear quarter; headlight pool forming as exposure rises. Best night-side evidence.
- `tools/shots/traffic-sighting-17.5-critic.png` — tour truck stopped on the gravel road ~40 m from a zebra herd in golden light, passengers visible; the composition works. The zebra read near-white at this range (animals' issue, not traffic's).
- `tools/shots/traffic-sighting-12-critic.png` (extra, noon) — the sighting staging holds at midday; truck stopped, herd in frame.
- `tools/shots/traffic-overview-16-critic.png` — 430 m aerial of the loop and two bridges; vehicles are specks at most (disclosed known gap since r3).

## Live state readback (`tools/shots/critic-claims-eval.json`)
- `close`: 1 vehicle, `state: 'stopped'`, at (80, −102) — the pinned hero truck the README
  describes; `stats()` = 9 draws / 5 wheels / 9 seats for it.
- `night`: 3 vehicles — the parked hero (`stopped`) plus minibus and ranger `drive`-ing elsewhere
  on the loop, exactly as the README's night row says; 15 draws total.
- `graphBackend() === 'roads'` — the real road graph, not the fallback.
- README measured claims reproduce exactly: my `close` capture = **108 draws / 3.19 M tris**, my
  `night` = **130 draws / 3.06 M tris** — the README's own 2026-09-25 GPU re-verification numbers,
  to the draw call. 0 console errors everywhere.

## Contract / errors / perf
| preset | drawCalls (scene) | triangles | errors | traffic updateMs (peak) |
|---|---|---|---|---|
| overview 16 | 157 | 3,524,416 | 0 | 0.202 (0.5) |
| close 16.5 | 108 | 3,191,251 | 0 | 0.089 (0.2) |
| sighting 17.5 | 129 | 2,756,468 | 0 | 0.039 (0.2) |
| night 21.5 | 130 | 3,059,802 | 0 | 0.145 (0.3) |
| extra: sighting 12 | 126 | 2,689,062 | 0 | 0.065 (0.4) |
| extra: close 19 | 109 | 3,191,251 | 0 | 0.093 (0.2) |

- Zero console errors in all six captures; `modules.traffic.status === 'ok'` throughout; every JSON
  reports the real AMD GPU, not SwiftShader. Within the ≤ 80-draws-for-10-vehicles spec budget
  (15 draws for 3 vehicles); still ~5 draws/vehicle vs the ≤ 3 guidance (unchanged, disclosed).
- `node tools/lint.mjs src/modules/traffic` → ok. `dependencies: []`,
  `optional: [roads, animals, effects, audio]` truthful and null-checked. Every README API function
  exists (`spawn/remove/get/list/setDensity/startTour/stats/graphBackend/KINDS`). `dispose()` frees
  the kit, both headlight spots, the fallback graph and the group. Update path is allocation-free
  (swap-pop `vehicleArr`, scratch vectors in vehicle.js) — verified in code.

## Ranked issues (most damaging first)
1. **[major] The vehicle reads as programmer art at close range** (r4 major, open): striated
   brown body instead of khaki paint, no readable windscreen/cab glass, flat white disc hubs,
   slab canopy, box-torso passengers without arms. Two of the four mandatory presets are close-up
   shots of this truck, so the module's weakest surface is its most-shown one. A UV-scaled paint
   material, a glazed cab frame and rim detail would close most of the gap.
2. **[minor] `overview` at 430 m still shows no readable vehicle** — disclosed since r3; a closer
   default camera (~150 m on the junction) or a labelled inset would fix the framing.
3. **[minor] Sighting passengers do not turn toward the animals** — `_sightYaw` is computed but
   never applied to head transforms (disclosed; spec asks for head yaw).
4. **[minor] ~5 draw calls per vehicle when kinds do not share pools** (15 for 3) — inside the
   module budget, above the spec's per-vehicle guidance.
5. **[minor, disclosed] Behaviour gaps**: ambient vehicles never sight-stop, no vehicle–animal
   avoidance beyond tours, no post-rain dust settling, one engine loop per vehicle.

## What is genuinely good
- The staging defects of r4 are properly fixed, not papered over: hero trucks are pinned in
  `showcase.js`, and the fix survives the default settle, dusk and noon extras.
- Night lighting now works as a composition: headlight pool plus red taillights read correctly at
  21.5 h and 19 h, which is what the spec's "headlights + taillights emissive at night" asks for.
- The README is now truthful to the pixel: its presets table matches the code, and its two GPU
  re-verification draw-call/triangle counts reproduce exactly in my captures.
- Engineering stays clean: zero errors, 0.04–0.2 ms updates, allocation-free movement code, lint
  ok, honest known-gaps list.

## Verdict
**FAIL, 7.0 — good indie.** All four mandatory presets now show the module, every README claim
reproduces (several exactly), and the r4 blocker and taillight major are dead. The pass line sits
at 8.5 and the difference is one thing: the truck itself, which at the module's own chosen close
range still reads as a 2010-era web toy rather than a Cities: Skylines II-grade vehicle.

```json
{
  "module": "traffic",
  "update": {
    "score": 7.0,
    "round": 5,
    "status": "fail",
    "errors": 0,
    "drawCalls": 157,
    "issues": [
      { "sev": "major", "text": "Vehicle reads as programmer art at the close range two presets stage: striated brown body, no readable windscreen/cab glass, flat disc hubs, slab canopy, box passengers; needs UV-scaled paint, glazed cab frame, rim detail" },
      { "sev": "minor", "text": "overview at 430 m shows no readable vehicle (disclosed since r3); closer default camera or labelled inset would fix the framing" },
      { "sev": "minor", "text": "Sighting head-yaw is computed but never applied to passenger heads (spec asks for the turn)" },
      { "sev": "minor", "text": "~5 draw calls per vehicle when kinds do not share pools (spec guidance <=3); module budget still fine" },
      { "sev": "minor", "text": "Behaviour gaps (disclosed): ambient vehicles never sight-stop, no animal avoidance, single engine loop, no post-rain dust settling" }
    ],
    "good": "r4 blocker dead: close/night hero trucks pinned and in frame at default settle (plus dusk/noon extras); red taillights clearly visible at night and dusk with a convincing headlight pool; README presets table now matches the code and its measured GPU numbers reproduce exactly (close 108/3.19M, night 130/3.06M, 0 errors); graphBackend 'roads'; sighting staging robust at 17.5h and 12h; 0.04-0.2 ms update, allocation-free; lint ok."
  }
}
```
