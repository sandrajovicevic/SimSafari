# park — round 5 — score 8.0 / 10 — FAIL

All captures are my own, real GPU (`tools/gpu-check.mjs`, `--use-angle=d3d11`; every JSON's gpu
string reads `ANGLE (AMD, AMD Radeon RX 5700 XT … Direct3D11)`): all 7 presets plus 2 extra angles
the builder did not pick (`habitat 8`, `close 9`), 1920×1080, seed 1, plus a 3×/4× zoom crop each
for the habitat herd and the tour truck. Every PNG was read. This is the requested re-verification
of the 09-24 wrong-scene fixes. Gameplay economy numbers and the 2026-09-25 fidelity re-run are
explicitly **out of scope** here (separate fidelity-harness step); noted only as claims I did not
audit.

## Screenshots reviewed (path — what I saw, one line each)
- `tools/shots/crit6-park-overview-15.png` — coherent whole-park aerial: river with two bridges, entrance/lodge complex with paved approach, gravel loop and dirt spurs, kopjes, pans, habitat clearings; heavy grey-tan haze flattens contrast at this height.
- `tools/shots/crit6-park-gate-9.png` — entrance gate with thatched roofs and sign, a safari truck queued on the paved approach, lodge complex and river/escarpment beyond — matches the description precisely.
- `tools/shots/crit6-park-lodge-17_5.png` — golden-hour complex: big lodge roof, restaurant, tents, stone-paved terraces, car park, the pool now visible at bottom-right, antler sculpture on the lawn, sun glitter on the river behind; haze heavy but atmospheric.
- `tools/shots/crit6-park-habitat-16.png` — **round-4 blocker fixed**: the frame is now the re-sited plains habitat — open grassland with acacias and a mixed herd in the middle distance; no river in sight; fence/hide out of frame as the rewritten description states.
- `tools/shots/crit6-zoom-park-habitat-herd.png` (3× crop) — the herd resolves: a zebra/wildebeest cluster with pale patches, 3–4 tan impala grazing right of centre, more dark bodies at the tree line — the named species are present, but at the preset's own 130 m they read as specks without zoom.
- `tools/shots/crit6-park-habitat-8.png` (extra) — morning version: same composition, cleaner light, herd legible as dark/tan specks; confirms the re-siting is tod-independent.
- `tools/shots/crit6-park-tour-16_5.png` — pride kopje with the viewing tower on top, photo-textured boulders, river at right, lodge distant.
- `tools/shots/crit6-zoom-park-tour-truck.png` (4× crop) — **the tour truck is confirmed**: white-canopy safari truck with visible passengers on the track at the right frame edge, beside the kopje — present, though compositionally marginal.
- `tools/shots/crit6-park-close-16_5.png` — **round-4 blocker fixed**: the lodge veranda fills the frame — thatch, timber posts, stone plinth and paving, deck chairs, stairs, and the pool in its stone coping; two tents intrude at the corners exactly as the README discloses; thin stray fence/rail lines cross the lower grass.
- `tools/shots/crit6-park-close-9.png` (extra) — morning version: cleaner and better; pool, terrace and building read clearly; confirms the fix is tod-independent.
- `tools/shots/crit6-park-night-21_5.png` — the lodge glows warm under its thatch, tents and lamp posts lit, a vehicle's headlights on the road top-left, reflective centre-line dashes receding — genuinely atmospheric, the best-lit frame in the project.

## Contract / errors / perf (table: preset, drawCalls, triangles, errors, park updateMs)
| preset | drawCalls | triangles | errors | park updateMs |
|---|---|---|---|---|
| overview (15 h) | 284 | 4,385,276 | [] | ~0 |
| gate (9 h) | 343 | 4,490,641 | [] | — |
| lodge (17.5 h) | 373 | 4,374,260 | [] | — |
| habitat (16 h) | 421 | 4,987,495 | [] | — |
| habitat (8 h, extra) | 422 | 5,020,263 | [] | — |
| tour (16.5 h) | 390 | 4,478,025 | [] | — |
| close (16.5 h) | 377 | 4,577,522 | [] | — |
| close (9 h, extra) | 376 | 4,544,754 | [] | — |
| night (21.5 h) | 406 | 4,706,939 | [] | — |

- Zero console errors on all 9 captures; all modules `ok`; worst preset 422 draws / 5.02 M tris — inside the whole-game ≤1500 / ≤6 M budget (`habitat` remains the heaviest preset, as the README predicts).
- Contract: `loadDemo()/newGame(seed)/isBuilt()` all exist and match the README; `dependencies: []` with a 12-entry optional list exactly matching the modules `build.js` composes; `core:ready` one-shot registration gated on `!ctx.isShowcase` as documented; `dispose()` calls `clearPark` and removes the group; lint ok.
- README perf table is SwiftShader-based; my real-GPU numbers are the same magnitude (draws +15–25 %, tris −5–15 %) and inside budget everywhere — no conflict, no stale-claim finding.

## Ranked issues (most damaging first)
1. **[major] The `habitat` preset — the dedicated demonstration of the "4 fenced habitats" headline — shows its herd at a distance where the species are specks.** What: at the preset's 130 m the zebra/wildebeest/impala the description names resolve only in a 3× crop (`crit6-zoom-park-habitat-herd.png`); at 1× the frame is a beautiful but anonymous grassland with dark dots. Why: this preset exists to show animals in their habitat; a viewer should not need to zoom to see them. Fix: halve the camera distance (70–90 m) or aim across the herd's grazing disc so animals fill the lower-middle third; keep the hide/fence out of frame as staged.
2. **[minor, cross-module] props' grass artifacts dominate the habitat foreground** — regular tuft rows and hard-edged dark ground-mat polygons (props round 4, issues 1–2) sit in the lower third of `habitat`; park framing amplifies them.
3. **[minor] `tour`'s truck is at the extreme right frame edge, ~100 m from the kopje subject** — technically delivered (confirmed at 4×), but the composition reads "kopje with tower", not "truck at the sighting". Fix: spawn the showcase vehicle on the near side of the kopje within the framing triangle.
4. **[minor] Lodge materials read toy-like at close range**: the pool is an opaque flat-blue rectangle (buildings' own material, not terrain water), thatch is a too-regular rib pattern, and the stray rail/fence lines crossing `close`'s foreground grass persist (buildings round-4 finding, still visible here).
5. **[minor] Overview/gate sit under a heavy grey-tan haze** that flattens the composite at 15 h/9 h; a lighter haze scalar at high-sun hours would restore the colour separation the park's layout deserves.
6. **[disclosed, verified] Two tents intrude on `close`'s foreground corners** — README says so; confirmed at both tods; acceptable.

## What is genuinely good
- Both round-4 wrong-scene majors are genuinely fixed and re-verified at two times of day each: `habitat` shows the re-sited plains habitat (no river), `close` frames the lodge terrace with the pool visible — the 09-24 siting/terrace work holds.
- `gate`, `lodge` and `night` deliver exactly what they promise with real construction detail; `night` is arguably the single best image in the project right now.
- The park reads as one coherent, plausible place built entirely through the other modules' APIs: gate → paved approach → lodge complex → loop + spurs → four sited habitats → kopje tower; the README's build-order description matches what is on screen.
- Zero errors everywhere, update cost ~0 ms, generous budget headroom, honest README (its disclosed gaps — tour's extra vehicle, close's tents, seed-generality — all verified accurate).

## Verdict
FAIL at 8.0 — up from 6.0. "Very good, one clear flaw": every preset now delivers its described subject at two times of day, performance and contract are clean, and the composites read as a real park. The one clear flaw is that the headline-feature preset (`habitat`) demonstrates the habitats with animals too small to identify — an easy camera fix. 8.5 remains out of reach while props' ground artifacts sit in park's foregrounds and the lodge close-range materials read toy-like. Economy/fidelity numbers were not audited this round by design.

```json
{
  "park": {
    "score": 8.0,
    "round": 5,
    "status": "fail",
    "errors": 0,
    "drawCalls": 422,
    "issues": [
      { "sev": "major", "text": "The habitat preset — the dedicated demo of the headline '4 fenced habitats' feature — shows its herd at 130 m where the named zebra/wildebeest/impala read as specks (species identifiable only in a 3x zoom crop). Halve the camera distance or frame across the grazing disc so animals fill the lower-middle third." },
      { "sev": "minor", "text": "props' grass artifacts (regular tuft rows + hard-edged dark ground-mat polygons, props round 4) dominate the habitat foreground — cross-module, but park's framing amplifies them." },
      { "sev": "minor", "text": "tour's showcase truck confirmed present (4x zoom) but at the extreme right frame edge ~100 m from the kopje subject; spawn it on the near side within the framing triangle." },
      { "sev": "minor", "text": "Lodge close-range materials read toy-like: pool is an opaque flat-blue rectangle (buildings material, not terrain water), thatch a too-regular rib pattern, stray rail/fence lines still cross close's foreground grass (buildings round-4 finding, still visible)." },
      { "sev": "minor", "text": "Overview/gate sit under heavy grey-tan haze that flattens the composite at high sun; a lighter haze scalar at midday would restore colour separation." },
      { "sev": "minor", "text": "Disclosed and verified: two tents intrude on close's foreground corners at both tested tods." }
    ],
    "good": "Both round-4 wrong-scene majors verified fixed at two tods each: habitat now shows the re-sited plains habitat with its mixed herd (no river), close frames the lodge terrace with the pool visible. gate/lodge/night deliver exactly as described; night is the best-lit frame in the project; the whole-park overview is a coherent composite built entirely through the other modules' APIs. Zero console errors on all 9 captures, worst 422 draws / 5.02 M tris, update ~0 ms; README's disclosed gaps (extra tour vehicle, tents in close, seed-generality) all verified accurate. Gameplay economy numbers and the 2026-09-25 fidelity re-run were not audited this round (out of scope for the visual pass)."
  }
}
```
