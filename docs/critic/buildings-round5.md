# buildings — round 5 — score 7.5 / 10 — FAIL

Round 4's blocker (the lodge preset framing the building's back) and its stray-geometry major were
claimed fixed. I re-shot all six presets plus two extra angles with my own real-GPU captures and
live-read the module's stats, catalogue and warnings. The framing fix and the geometry fixes hold
in every shot; the remaining distance to the pass line is close-range surface quality, which r4
already identified and which is unchanged.

## Screenshots reviewed (path — what I saw, one line each)
All mine: 1280×720, seed 1, real GPU (ANGLE D3D11, AMD RX 5700 XT), every PNG read.
- `tools/shots/buildings-lodge-17.5-critic.png` — **the r4 blocker is dead**: yaw 12 frames the terrace side — veranda poles, deck, railings and the plunge pool reading as blue water set in the stone paving. No stray rails anywhere.
- `tools/shots/buildings-overview-16-critic.png` — the whole complex from the south with the lodge's terrace facing camera; gate, restaurant, shop, ranger, workshop, clinic, tower, hide, tents, staff village, parking and tracks all present and coherent; no stray geometry between buildings.
- `tools/shots/buildings-gate-10-critic.png` — stone piers, pole lintel under thatch, legible "MARA RIDGE" board, red/white boom, plastered kiosk. Still the best preset; kiosk walls still flat.
- `tools/shots/buildings-close-16.5-critic.png` — the veranda-to-terrace stair: planking and railings fine, but the terrace paving still reads as a regular blue-grey tile grid on near-black grout and the posts as smooth grey cylinders (r4's surface major, open).
- `tools/shots/buildings-hide-8-critic.png` — the stilted hide: pole legs, ladder, reed screens, thatch — **and a clean roofline; the ten rafter "antennas" of r4 are gone** (same kit.beam root cause as the stray rails).
- `tools/shots/buildings-night-21.5-critic.png` — lantern glow on the thatch underside and poles, a lit window, the pool faintly lamp-lit, stars overhead; atmospheric, no stray geometry.
- `tools/shots/buildings-lodge-12-critic.png` (extra, noon) — terrace side at midday: pool and veranda read, terrain contact clean at this angle.
- `tools/shots/buildings-overview-17.5-critic.png` (extra, golden hour) — the complex holds in warm light; roofs still read as banded ziggurats at distance.

## Live readback (`tools/shots/critic-claims-eval.json`)
- `buildings.stats()` at the overview site: **34 draw calls / 131,760 triangles / 25 buildings /
  16 types** — README claims 34 / 131,730 (the 30-triangle drift is trivial); spec budget
  ≤ 60 draws / ≤ 400 k tris comfortably met.
- `catalogue().length === 16`, all type keys present.
- Exactly the README's known gap reproduced live: two showcase placements (`parking`, `tent`)
  forced past `too-steep` after nudging/spiralling — the dev warning text matches verbatim.
- **Zero beam-length warnings** — the new dev assert on `beam()` stayed silent across all 16 types.

## Contract / errors / perf
| preset | drawCalls (frame) | triangles (frame) | errors | buildings updateMs (peak) |
|---|---|---|---|---|
| overview 16 | 291 | 4,529,942 | 0 | 0.023 (0.1) |
| lodge 17.5 | 264 | 3,894,663 | 0 | 0.016 (0.1) |
| gate 10 | 253 | 3,882,905 | 0 | 0.016 (0.1) |
| close 16.5 | 270 | 3,591,067 | 0 | 0.021 (0.1) |
| hide 8 | 270 | 3,508,194 | 0 | 0.013 (0.1) |
| night 21.5 | 279 | 3,574,273 | 0 | 0.049 (0.1) |
| extra: lodge 12 | 261 | 3,796,359 | 0 | 0.030 (0.2) |
| extra: overview 17.5 | 290 | 4,497,174 | 0 | 0.024 (0.1) |

- Zero console errors in all eight captures; `modules.buildings.status === 'ok'` throughout; every
  JSON reports the real AMD GPU. My lodge/overview counts match the README's GPU re-verification
  note exactly (264 / 291 draws).
- `node tools/lint.mjs src/modules/buildings` → ok. `dependencies: []`,
  `optional: [terrain, roads, props, environment]` truthful. Every README API function exists;
  `dispose()` releases sets, protos, ghost, materials, texture arrays and the sign texture.
- Contract defects still open in code (r4 minors): `placeLamps()` runs inside `update()` on every
  night frame and allocates its `best` array, one object per lamp and a sort closure each time; the
  `time:set` listener registered in `init()` is never removed in `dispose()`.

## Ranked issues (most damaging first)
1. **[major] Close-range surfaces are still programmer-art** (r4 major, open, confirmed in my
   `close` and `gate` captures): terrace paving is a high-contrast regular grid with black grout,
   veranda "timber" posts are smooth grey cylinders on dark steel-looking footings, plaster is flat
   white with no weathering or AO. Against real safari-lodge reference (and C:S II/Planet Zoo
   facility quality) this is the single biggest gap to 8.5.
2. **[minor] Thatch reads as uniform stacked slats** on every roof — even course spacing, identical
   step rhythm; the makuti raggedness survives only at the night underside. Break the course
   spacing and vary per-course colour.
3. **[minor] The terrace sits low in the terrain** — slab top 0.12 m; my `close` capture shows a
   bare soil strip under the stair and the README still reports grass poking through near the pool.
   Extend the flatten footprint or give the slab an upstand.
4. **[minor] Per-frame allocations at night + listener leak**: `placeLamps()` allocates every frame
   while lamps are lit; the `time:set` handler outlives `dispose()`. Both cheap to fix, both
   violations of the letter of §2.
5. **[minor, disclosed] No LOD** — every instance renders full detail (fine at the showcase's
   250 m clustering, will matter in a full park); two showcase placements still force past
   `too-steep`; fence gate/feeder/toilets/parking have no dedicated detail shot.

## What is genuinely good
- The stray-geometry root cause (shared scratch vector in `kit.beam()`'s corner closure) is
  genuinely fixed and the fix generalises: the lodge ring beam, the lawn rails and the hide's
  rafter spears are all gone across eight captures, and the new dev assert is silent.
- The lodge preset finally sells the building: terrace, veranda and pool read as a safari lodge
  from the preset camera, day and night.
- Engineering breadth is real: 16 modelled types at one opaque draw call each via the
  DataArrayTexture array material, world-metre UV tiling, 34 draws / 132 k tris for a 25-building
  complex — far inside the spec budget — with night glow for free.
- Honesty: the measured table, the forced-placement warnings and the not-re-captured note all match
  what I measured independently.

## Verdict
**FAIL, 7.5.** The blocker and both geometric majors from r4 are verified dead, the catalogue and
budget story is strong, and every README claim I tested reproduces. What holds the module below the
line is one coherent flaw class — close-range material quality (grid paving, grey posts, flat
plaster, slatted thatch) — plus two small contract leaks (lamp allocations, listener leak). Fix the
surfaces and this is an 8.5 module.

```json
{
  "module": "buildings",
  "update": {
    "score": 7.5,
    "round": 5,
    "status": "fail",
    "errors": 0,
    "drawCalls": 291,
    "issues": [
      { "sev": "major", "text": "Close-range surfaces read as programmer-art: terrace paving is a regular blue-grey grid on black grout, veranda posts are smooth grey cylinders, plaster is flat unweathered white (r4 major, confirmed in close/gate captures)" },
      { "sev": "minor", "text": "Thatch reads as uniform stacked slats on every roof; course spacing/colour variation needed (makuti raggedness survives only on the night underside)" },
      { "sev": "minor", "text": "Terrace sits low in the terrain (slab top 0.12 m): soil strip under the stair, grass near the pool per README; extend flatten footprint or add a slab upstand" },
      { "sev": "minor", "text": "placeLamps() allocates (array, per-lamp objects, sort closure) on every night frame inside update(); time:set listener not removed in dispose()" },
      { "sev": "minor", "text": "No LOD beyond 300 m (disclosed); 2 showcase placements forced past too-steep (disclosed, reproduced); fence gate/feeder/toilets/parking have no detail shot" }
    ],
    "good": "r4 blocker dead: lodge preset (yaw 12) frames the terrace side with veranda, deck railings and blue plunge pool, day and night. Stray rail geometry gone in all 8 real-GPU captures and the hide's rafter spears are gone too (same kit.beam root cause); dev beam assert silent across all 16 types. Own budget 34 draws / 131.8k tris for 25 buildings across 16 types (spec <=60/<=400k). README measured numbers reproduce exactly (291/4.53M overview, 264/3.89M lodge, gate/close/hide all render clean). 0 console errors, lint ok, night lantern glow atmospheric."
  }
}
```
