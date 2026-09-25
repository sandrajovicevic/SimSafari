# park — round 5 — score 7.8 / 10 — FAIL

All 7 presets independently captured and read this round (first pass hit a system-load timeout
running concurrently with other captures — re-run solo, all 7 came back `ready=true, errors=0`).
Additional verification: direct coordinate/eval probes of the lodge building's real placed position
and the pool's world-space location, to check the `close` fix's specific claim rather than judge by
eye alone.

## Screenshots reviewed (path — what I saw, one line each)
- `tools/shots/park-overview-15.png` — whole park: river with two bridges, entrance/lodge complex,
  kopjes, pans, dirt spurs — unchanged, still coherent.
- `tools/shots/park-gate-9.png` — entrance gate with a safari truck queued, lodge complex beyond —
  unchanged, still good.
- `tools/shots/park-lodge-17_5.png` — golden-hour lodge complex, multiple thatched roofs, tents, car
  park — unchanged, still good (regression-checked, since `close`'s fix reused the lodge's real
  placement data).
- `tools/shots/park-habitat-16.png` — **fixed, the wrong-biome bug is gone**: this now shows genuine
  dry plains habitat — scattered acacias, a windmill/water pump with its own small fence, a kopje
  visible at the right edge, and a fence line receding toward it. No river, no gallery forest
  anywhere in frame — the specific defect (an entirely different biome shown) is resolved. See
  Ranked Issues #1 for what is still not confirmed at this exact framing.
- `tools/shots/park-tour-16_5.png` — kopje with a viewing tower correctly the subject, river and
  lodge complex visible beyond — unchanged; still could not locate a safari truck in frame.
- `tools/shots/park-close-16_5.png` — **fixed, now a genuine veranda close-up**: thatched roof,
  timber support poles, stone-tile deck, timber railings and a flight of steps, all clearly framed at
  eye level — a complete turnaround from the wide establishing shot found last round. Verified this
  is the real lodge building's own position (not a stale site anchor) via a direct eval read of
  `report.buildings.lodge` — confirms `x/z/rot` match what the camera is aimed from. The specific
  "pool" element is ambiguous: a grey/blue-grey checkerboard-tiled patch is visible beyond the steps
  (plausibly the pool's tiled surround under the water shader's low-roughness reflection response),
  but it does not clearly read as *water* — no legible blue tint or distinct reflective highlight —
  so this element of the description is only weakly delivered.
- `tools/shots/park-night-21_5.png` — **fixed, cross-module**: lodge glows warm, reflective road
  paint recedes correctly, the two pans/waterhole visible in the background now read as dark
  water with soft warm-highlighted rims, not the uniform pale-bright patches found in five other
  modules' reviews last round.

## Contract / errors / perf (table: preset, drawCalls, triangles, errors)
| preset | drawCalls | triangles | errors |
|---|---|---|---|
| overview (15h) | 260 | 4,338,889 | [] |
| gate (9h) | 326 | 4,478,120 | [] |
| lodge (17.5h) | 326 | 4,466,417 | [] |
| habitat (16h) | 338 | 4,958,665 | [] |
| tour (16.5h) | 344 | 4,693,905 | [] |
| close (16.5h) | 331 | 4,547,985 | [] |
| night (21.5h) | 340 | 4,902,692 | [] |

Zero console errors on all 7 presets. All comfortably inside the whole-game ≤1500 draw-call budget.

## Ranked issues (most damaging first)

1. **[minor, downgraded from major] `habitat` shows the correct biome now, but its own headline
   subject — the fenced grazers — is not confirmable at this exact framing.** The wrong-biome defect
   (a river/gallery scene instead of plains) that drove last round's finding is genuinely gone: this
   is unambiguously dry plains with a water pump, acacias, and a kopje in view. But the specific
   promised elements — "zebra, wildebeest and impala behind the wooden-post fence, a viewing hide at
   the boundary" — are not clearly legible in this capture: the fence reads only as a faint line near
   the kopje, no hide structure is identifiable, and no grazing animals are confirmed at this
   distance/angle. This is a much less severe issue than showing the wrong biome entirely, but the
   dedicated demonstration of the "4 fenced habitats" feature still does not clearly show its subject
   animals. Fix direction: aim closer to wherever the plains habitat's animals actually cluster (near
   water/shade), or confirm via `world.habitats` that animals are present in the habitat's population
   at capture time.
2. **[minor] `close`'s pool element does not clearly read as water.** The veranda/thatch/timber/stone
   elements are now excellent and eye-level as promised; the tiled patch beyond the steps that should
   be the pool reads as grey/reflective pavers rather than legibly blue/wet. Fix direction: increase
   the pool water's tint saturation or add a stronger specular/Fresnel cue distinguishing it from the
   surrounding dry stone tiles at this camera's lighting angle.
3. **[minor, unchanged]** `tour`'s safari truck still not visually confirmed — the kopje/tower subject
   is correct but no vehicle is located in frame, same as last round.
4. **[resolved this round, cross-module]** The pale/overbright waterhole-at-night pattern found in six
   modules last round (including this one) is gone here too — pans and river both read as dark water
   with warm highlighted rims, lamps correctly the brightest objects in frame.

## What is genuinely good
- Both of last round's major "wrong scene entirely" defects are genuinely fixed, independently
  confirmed via direct source/build-data reads (not just eyeballing the render): `habitat` shows the
  correct biome (root-caused to a build-time siting bug in `build.js`'s vertex selection, now fixed
  at the source with a real water-clearance check, not just papered over on the camera side), and
  `close` uses the lodge building's actual placed position/rotation (`report.buildings.lodge`,
  verified directly) rather than a stale site anchor that could point at any side of the building.
- `gate`, `lodge`, and `night` continue to deliver exactly what their descriptions promise, unregressed
  by this round's `build.js`/`showcase.js` changes.
- The whole-park `overview` remains a coherent, real composite of every module's own output.
- Zero console errors anywhere; draw calls comfortably inside budget throughout.

## Verdict
FAIL. Both of the module's dominant, confirmed defects from last round — `habitat` showing an entirely
wrong biome and `close` showing a wide establishing shot instead of the veranda — are genuinely fixed,
verified through both the rendered image and a direct read of the underlying build/placement data, not
taken on faith. The cross-module night-water bug is also resolved here. What remains are real but
distinctly smaller nits: `habitat`'s own subject animals aren't confirmed in frame, `close`'s pool
doesn't clearly read as water, and `tour`'s truck is still unconfirmed. Score raised substantially
(6.0 → 7.8) to reflect this, but held below the 8.5 pass bar until the habitat's actual grazing animals
and a convincing pool are both demonstrably in frame.
