# traffic — round 4 — score 5.0 / 10 — FAIL

The module code is unchanged since round 3 (`git log` for `src/modules/traffic`: only the baseline and the README commit).
What changed is the screenshot tool: fast-settle now runs 36 simulation steps of 0.1 s (3.6 s) before rendering. The `close`
and `night` presets spawn a truck that is **driving**, not parked, so in 3.6 s it leaves an 11–14 m camera frame. Two of the
four mandatory presets now render an empty road. Round 3's 8.0 was given to frames that the canonical capture no longer
produces.

All captures: 1280×720, seed 1, fast-settle unless noted. I read every PNG.

## Screenshots reviewed (path — what I saw, one line each)
- `tools/shots/traffic-overview-16.png`: a 430 m aerial view of the river valley with the paved/gravel loop and two bridges. No vehicle is readable anywhere. At most there are one or two grey specks on the far road. Same as round 3, and disclosed.
- `tools/shots/traffic-close-16_5.png` (default settle): **no vehicle in frame.** Only an empty paved road, the grass verge and the river behind. The eval readback puts the one safari truck at (104, −99), 24 m from the camera target (80, −100), in state `drive`.
- `tools/shots/traffic-critic-close-settle4-16_5.png` (my extra, `--settle 4`, so almost no simulated driving): the truck the preset is meant to show. Tiered benches, 8 passengers, canopy with roof rails, spare wheel, 4 wheels. Seen close up, it reads as programmer art:
  - The whole body, benches and cab share one brown **wood-grain-looking** striated finish, not khaki paint.
  - The passengers are box torsos with sphere heads in flat primary colours.
  - The wheels are black cylinders with flat white disc hubs.
  - There is no readable windscreen or cab glass, and the headlights are white boxes.
  - The canopy is a grey slab.
- `tools/shots/traffic-sighting-17_5.png`: a tour truck parked on the dirt road with 5 zebra about 40 m away in golden light, passengers visible. The composition works, and this is the only preset that shows the module doing its job. The truck at this distance is a boxy toy, and the passengers do not visibly turn toward the herd.
- `tools/shots/traffic-sighting-12.png` (my extra, midday): the same staging holds up at noon, because the truck is forced into `sighting` with `_stopTimer = 999`, so it does not drive off. Scale against the zebra is plausible. There are no dust puffs because the truck is stopped.
- `tools/shots/traffic-night-21_5.png` (default settle): **no vehicle, no headlight beam, no taillights in frame.** Only the dark road, with roads' emissive lane paint glowing near-white. The frame shows nothing of "headlights + parked trucks".
- `tools/shots/traffic-critic-night-settle4-21_5.png` (my extra, `--settle 4`): the truck is present. The headlight throws a convincing warm pool on the asphalt ahead. **No red taillight is visible** at the rear of a side-on truck. The passengers and body are almost black silhouettes. The "2 more vehicles passing behind" are at (291, 158) and (−216, 32), hundreds of metres away and not in frame.

## Contract / errors / perf

| preset (capture) | drawCalls (scene) | triangles | errors | traffic updateMs |
|---|---|---|---|---|
| overview 16 | 155 | 3.46 M | [] | 0.280 |
| close 16.5 | 106 | 3.18 M | [] | 0.142 |
| close 16.5 settle 4 (extra) | 106 | 3.18 M | [] | — |
| sighting 17.5 | 103 | 2.79 M | [] | 0.109 |
| sighting 12 (extra) | 100 | 2.72 M | [] | — |
| night 21.5 | 128 | 3.03 M | [] | 0.282 |
| night 21.5 settle 4 (extra) | 128 | 3.03 M | [] | — |

- **Errors:** zero console errors on every capture, and `modules.traffic.status === 'ok'` throughout.
- **Warnings (checked for errors in disguise):** every capture logs `[core] dependency cycle at "animals" / "zoning" / "traffic"`. This is a real cycle through optional deps: traffic → audio → animals → zoning → simulation → traffic. Traffic null-checks every optional, so it is harmless here, but init order among these modules is undefined. It is core/integrator territory and noted as cross-module. There are no caught exceptions.
- **Own budget:** `stats()` in night reads `{vehicles: 3, drawCalls: 15, bodyPools: 3, wheels: 14, seats: 14}`, about 5 draws per vehicle. That is within the ≤80-for-10 spec, but above the spec's "≤3 draw calls per vehicle otherwise" guidance when pools are not shared. `updateMs` 0.11–0.28 ms is well inside the 3 ms module budget.
- **Lint:** `node tools/lint.mjs src/modules/traffic` reports `lint ok`.
- **Allocations:** the update path in `vehicle.js` uses module-level scratch vectors and quaternions. `tours.js` reuses `_toDespawn`. `startTour` allocates via `stops.filter`, but it is not per-frame. I found no per-frame allocations.
- **API:** every README function exists, and `dispose()` is unchanged and thorough (as in round 3).

## Ranked issues (most damaging first)

1. **[blocker] The `close` and `night` presets render an empty road, because their subject drives out of frame.**
   - **Where it shows:** `traffic-close-16_5.png` and `traffic-night-21_5.png`. The eval shows the truck in state `drive`, 24 m from the camera target, after the standard settle.
   - **Why it matters:** a preset whose frame contains none of the module is functionally a missing preset, and these two are the ones that carry all of the module's close-range and night claims. The spec's `close` is "truck at 8 m with passengers". The spec's `night` is "headlights".
   - **Fix:** in `showcase.js`, do for `spawnClose` and for the hero truck in `spawnNight` what `spawnSighting` already does: `v._state = 'stopped'; v._stopTimer = 999;`. Better still, have `stage()` expose a "parked" option so the camera anchor and the vehicle cannot drift apart. Then re-verify with the default settle, not with `--settle 4`.
2. **[major] The README's presets table does not match the code, so this README claim does not reproduce.**
   - **What:** the README gives `overview` tod 11, `close` 16, `sighting` 16.5 "beside elephants" and `night` "parked trucks at the lodge". The code gives 16 / 16.5 / 17.5, **zebra**, and trucks on the open road (not parked, and no lodge).
   - **Cap:** under the brief, a README claim that does not reproduce caps the score at 6.
   - **Fix:** rewrite the table from `showcase.js` after fixing issue 1.
3. **[major] Seen close, the safari truck is programmer art, not the "PBR paint with dust, glass, chrome" the spec asks for.**
   - **Where it shows:** `traffic-critic-close-settle4-16_5.png`.
   - **Body:** it reads as brown wood-grain planks, not painted steel. The `traffic:paint` tfbm fleck is stretched along the box UVs.
   - **Cab and lights:** no windscreen or cab glass is readable, and the headlights are plain white boxes.
   - **Wheels:** flat white discs for hubs, with no rim detail.
   - **Canopy:** a flat grey slab.
   - **Passengers:** box torsos with sphere heads, with no arms and no hats.
   - **Compared with the reference:** a C:S2 vehicle or a real Land Cruiser game-viewer at this range has a readable cab, bull bar, glazing, and rims with lug detail. This one reads as a 2010 web-GL toy.
   - **Fix:**
     - Use a proper UV-scaled paint texture, or plain paint with an edge-wear/dust gradient in vertex colour.
     - Add a glazed windscreen frame, a bull bar, and rim geometry: a dish with 5–6 lug bosses.
     - Give the passengers shoulders and arms and some hats.
4. **[major] At night, no taillights are visible, and the vehicle body is an unlit silhouette.**
   - **Where it shows:** `traffic-critic-night-settle4-21_5.png`. The headlight pool is good, but a side-on truck should show red taillight emissive at the rear, and none reads.
   - **Fix:** raise the taillight emissive and size, and add a small red point or bloom contribution.
5. **[minor] `overview` still makes vehicles invisible at 430 m.** Disclosed, and unchanged since round 3. At that range, a label or a closer camera (about 150 m on the junction) is needed.
6. **[minor] Sighting passengers do not visibly turn toward the animals.** The spec asks for head yaw. `_sightYaw` is set, but no rotation of the heads is readable in either sighting capture.
7. **[minor] About 5 draw calls per vehicle when the kinds do not share pools** (15 draws for 3 vehicles of 3 kinds). It is within the module budget, but above the spec's ≤3-per-vehicle guidance.

### Cross-module (not scored against traffic)
- **Water at night is now dark with no bright shoreline ring.** In `traffic-night-21_5.png`, the round-3 night-water complaint looks fixed.
- **roads:** the asphalt still shows the swirl/scratch pattern at 11 m (`traffic-close-16_5.png`). At night, the lane paint glows near-pure white while unlit, far brighter than retroreflective paint without a light source.
- **environment:** the night sky star layer reads as horizontal white dashes, not points (in both night shots).
- **grass:** the near-camera grass cards show dark opaque triangular bases (in the close and night foregrounds).
- **core:** there is an optional-dependency cycle warning on every load (see the contract section).

## What is genuinely good
- The `sighting` preset is staged robustly: the truck is forced into a stop, and the zebra sit at a plausible viewing distance. It holds at 12 h and 17.5 h.
- The headlight ground pool at night is convincing when the truck is actually in frame.
- The engineering is clean: zero errors, sub-0.3 ms update, no per-frame allocations, lint clean, and an honest known-gaps list for behaviour.

## Verdict
**FAIL, 5.0.**
- Zero console errors, and within budget.
- Two of four mandatory presets show nothing of the module under the standard capture, which I treat as missing presets (cap 5).
- The README's presets table does not match the code (cap 6).
- When the truck is forced into frame, it reads as programmer art rather than a Cities: Skylines II–grade vehicle.

Round 3's 8.0 rested on captures where the truck happened to still be in frame. The fix for the blocker is a few lines: park the preset vehicles. The visual gap to 8.5 is real modelling and material work on the vehicle.
