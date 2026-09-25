# buildings — round 4 — score 6.0 / 10 — FAIL

Scope this round: re-verify after commit 1860e5c (lodge terrace slab cut around the plunge pool, water plate raised
to TY−0.05), check the terrace for regressions, re-shoot all presets. All captures 1280×720, seed 1, fast-settle,
run one at a time. Lodge sits at (−72, −112), terrace/pool on its +z side (facing the gate).

## Screenshots reviewed (path — what I saw, one line each)
- `tools/shots/buildings-overview-16.png` — the complex from the south: lodge, restaurant, shop, tower, hide, tents, staff village, tracks, kopje at left. Coherent layout, but every roof reads as the same stepped "ziggurat" of flat horizontal bands and walls are flat white boxes; at this distance it is Cities-Skylines-I-grade, not II. Camera looks at the lodge's **back**; the terrace and pool face away.
- `tools/shots/buildings-lodge-17_5.png` — yaw 182 puts the camera at −z, i.e. **behind** the lodge: rear wall, tank, dish, solar panels, chimney. No deck, no terrace, **no pool** — the preset description/README ("thatch, poles, plinth, deck, pool") does not reproduce. The thatch reads as stacked flat slats with evenly spaced lips, not a ragged makuti.
- `tools/shots/buildings-gate-10.png` — gate piers, pole lintel under thatch, legible "MARA RIDGE SAFARI PARK" board, red/white boom, plastered kiosk with two brown slit windows. Solid; the best preset. Kiosk walls are flat untextured-looking white.
- `tools/shots/buildings-close-16_5.png` — stair from deck to terrace. Terrace paving is a hard, regular grid of blue-grey slabs on near-black grout (reads as a tiling texture, not laid stone); the "round timber posts" read as smooth **grey** cylinders on black steel-looking rings, not timber; a band of blurry terrain shows between deck fascia and slab under the open-riser stair.
- `tools/shots/buildings-hide-8.png` — stilted hide, ladder stair, reed walls, thatch. **Ten thin rafter sticks pierce up through the roof like antennas, 1–2 m above the ridge** (the "exposed rafter tails" claim shows as a defect). The hide stands ~60 m from the lodge on open grass, reads as part of the lodge compound rather than a bush hide.
- `tools/shots/buildings-night-21_5.png` — lodge veranda at night: lantern glow on thatch underside and poles is still attractive; the **pool now renders** (teal, lamp-lit) at the terrace edge. Two thin straight rails run from the deck railing ~15 m out across the lawn to a lamp post — stray geometry.
- `tools/shots/buildings-critic-pool-16.png` (extra: `lookAt(-64.5,-97.9, 16 m, pitch 38, yaw 30)`, 16 h) — top-down-ish on the pool: **the water plate reads**, blue, inside an intact stone coping ring; no seams or gaps where the slab was cut. But: grass terrain covers the slab to the right of and behind the basin (only the left strip and the stair landing show stone), so the pool sits in lawn rather than in a terrace; a timber plank plus two parallel rails (~12 m) run from the east end of the deck diagonally down over the coping and across the lawn.
- `tools/shots/buildings-critic-pool-nobuildings.png` (extra, diagnostic: same camera, buildings group hidden via `--eval`) — plain terrain, the stray rails vanish ⇒ the stray lines are **buildings geometry**, not roads/props. (Its `drawCalls` in the JSON is the pre-eval frame's; the PNG is authoritative.)
- `tools/shots/buildings-critic-front-12.png` (extra: lodge front from the north, 58 m, pitch 18, 12 h) — first view of the lodge's actual façade in any capture: the pool is visible as a blue strip in a dark stone terrace. Several long thin dark lines cross the field from the lodge terrace to the restaurant on the left and ~50 m out to the right — same stray-rail class, much larger than the veranda.

## Contract / errors / perf
Whole-frame numbers (terrain + props + environment + roads + buildings). Buildings' own share was independently
measured at 34 draws / 131,730 tris in round 3; geometry unchanged except 3 extra slab boxes.

| preset | drawCalls | triangles | errors | warnings |
|---|---|---|---|---|
| overview 16 | 296 | 4,093,727 | [] | 2 (showcase forcing parking + tent: `too-steep`, the README's known gap; no caught exceptions) |
| lodge 17.5 | 276 | 3,696,758 | [] | same 2 |
| gate 10 | 257 | 3,887,335 | [] | same 2 |
| close 16.5 | 276 | 3,605,613 | [] | same 2 |
| hide 8 | 275 | 3,520,272 | [] | same 2 |
| night 21.5 | 280 | 3,587,245 | [] | same 2 |
| critic pool 16 | 278 | 3,729,566 | [] | same 2 |
| critic front 12 | 276 | 3,631,310 | [] | same 2 |

`modules.buildings.status === 'ok'` everywhere, updateMs ≈ 0.07. `node tools/lint.mjs src/modules/buildings` → ok.
Every README API function exists in `index.js`; `dependencies: []` with `optional: [terrain, roads, props, environment]` is truthful.

Contract defects found in code:
- **Per-frame allocations at night**: `placeLamps()` (index.js ~368) is called from `update()` every frame once lamps are on; it allocates `best = []`, one object literal per lamp, a sort comparator closure and destructuring iterators every frame. Violates "zero per-frame allocations in update()".
- `dispose()` does not remove its `ctx.events.on('time:set', …)` listener (init line ~510), so a disposed module keeps a handler that calls `updateNight()` on a nulled `S.mats`/`S.group`.

## Ranked issues (most damaging first)
1. **[blocker] `lodge` preset shows the back of the lodge — its described deck/terrace/pool are not in frame (README claim not reproduced → cap 6).** Yaw 182 places the camera on −z; the terrace is on +z. This is the module's hero preset and the pool fix of 1860e5c is invisible in it. Fix: yaw ≈ 0–20 (camera on the gate side) or move the terrace to face the preset; re-check `overview` too (also sees the back).
2. **[major] Stray rail geometry across the lawn.** Two parallel thin rails + a plank run ~12 m from the east end of the lodge deck diagonally down over the pool coping (critic-pool-16, night-21_5), and long thin lines span tens of metres between lodge terrace, restaurant and the field (critic-front-12). Proven to be buildings geometry by hiding the group. Reads as a broken mesh in any view facing the terrace. Fix: audit `railing()`/`kit.beam()` callers on the lodge/restaurant with non-axis-aligned or mis-ordered endpoints; assert beam length ≤ footprint diagonal in dev.
3. **[major] Hide rafters pierce the roof.** Ten rafter sticks project 1–2 m above the thatch (hide-8). The two `po.beam(... WY+1.05 ...)` rafter runs in `buildHide()` end above the 1.55 m roof pitch line or are mis-oriented; in reference, rafter tails show only under the eave. Fix: end rafters at the ridge under the thatch surface, add short tails below the eave instead.
4. **[major] Terrain swallows the lodge terrace.** Slab top is only 0.12 m; grass pokes through to the right of and behind the pool and under the stair (critic-pool-16, close-16_5). The cut itself is clean, but the pool reads as sitting in a lawn. Fix: extend the `flatten()` footprint to cover the terrace depth (to z 15.9 + margin) or raise TY / give the slab a visible upstand.
5. **[major] Surface quality is programmer-art at close range.** Terrace paving = regular high-contrast grid with black grout; veranda "timber" posts render smooth grey on black rings; plastered walls are flat white with no weathering, plinth staining or AO. Versus C:S II/real lodges this is the biggest gap to 8.5.
6. **[minor] Thatch reads as stacked horizontal slats** (uniform bands, identical step spacing) on every roof — the "ragged makuti" only survives at the night underside. Break up course spacing and add colour variation per course.
7. **[minor] Per-frame allocations in `placeLamps()` at night; `time:set` listener not removed in `dispose()`.**
8. **[minor] Hide siting**: showcase puts the hide on open lawn beside the lodge compound; a hide belongs at a waterhole/bush edge.

## What is genuinely good
- **The 1860e5c fix works**: the plunge-pool water now renders from above (day and night), inside an intact coping ring, with no gaps or seams introduced by the four-box slab cut.
- Gate: legible carved park-name board, stone piers, boom — convincing.
- Night lantern glow on the thatch underside remains atmospheric.
- Budget is fine: whole frame ≤ 296 draws, buildings' own share tiny; zero console errors; lint clean; API complete.

## Verdict
FAIL, 6.0. The specific fix under review (pool visibility) is verified and clean. But fresh angles expose defects
round 3 did not report — stray rail geometry spanning the lawn, rafters spearing through the hide roof, terrain
through the terrace — and the `lodge` preset still frames the back of the building, so its README claim of
"deck, pool" does not reproduce (cap 6). Round 3's 8.5 was generous; independent of the cap, close-range
surface quality (grid paving, grey "timber" posts, flat plaster) sits around 6.5.
