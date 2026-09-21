# zoning — round 5 — score 6.0 / 10 — FAIL

## Screenshots reviewed (path — what I saw, one line each)
- `tools/shots/zoning-overview-15.png` — three habitats + fences + overlay: habitat-region fills tint correctly (green/tan/grey) with soft, organically-rounded blob edges — but the tan visitor boardwalk path connecting two habitats renders as an unmistakable hard right-angle zigzag staircase following the raw 4 m grid, in stark visual contrast to the smooth habitat-region edges right next to it.
- `tools/shots/zoning-close-16_5.png` — fence detail at 15 m: correct wooden posts + two wire rails, visibly terrain-conforming along the slope, a believable minimal safari-fence read.
- `tools/shots/zoning-overlay-13.png` — top-down zoning-tool view: same staircase defect visible again on a diagonal habitat-boundary segment in the upper-middle of the frame, alongside genuinely smooth, rounded boundary curves elsewhere in the same image (e.g. the green habitat's bottom-right corner) — so the smoothing pipeline is *not uniformly broken*, it fails specifically on certain boundary segments.
- `tools/shots/zoning-night-21_5.png` — same defect a third time, now unmistakable: a bright gold marching-ants line running diagonally down the lower half of the frame is a textbook unsmoothed 4 m cell staircase (each step is a clean right angle, repeating at the exact grid pitch) connecting to a smoother habitat-region edge above it.
- `tools/shots/zoning-critic-morning.png` (my extra angle: overview preset, tod 10 instead of 15) — the same visitor-boardwalk staircase reproduces a fourth time, now in white/pale marching-ants coloring, confirming this is not a time-of-day or animation-phase artifact.

## Contract / errors / perf (table: preset, drawCalls, triangles, errors — whole-scene totals per the module's own README convention; zoning's own group is 4 draw calls regardless of preset)
| preset | drawCalls (scene) | triangles (scene) | errors | zoning updateMs |
|---|---|---|---|---|
| overview (15h) | 150 | 4,045,072 | [] | 2.018 |
| close (16.5h) | 140 | 3,971,880 | [] | 2.889 |
| overlay (13h) | 158 | 4,032,271 | [] | 0.867 |
| night (21.5h) | 154 | 4,299,376 | [] | 4.054 |
| extra: overview @10h | — | — | [] | — |

Zero console errors on all 5 shots; `modules.zoning.status === 'ok'` throughout. Zoning's own contribution (4 draw calls: overlay fill, boundary ribbon, 2 fence instanced meshes) is comfortably inside the spec's ≤20 draw-call budget, and the whole-scene numbers match the README's own table exactly. `updateMs` runs 0.9–4.1 ms against the general ≤1.5 ms/module budget — plausibly inflated by the same SwiftShader wall-clock-accumulator effect noted in `ui`'s review (`pendingSpeciesRefresh`'s 1.2 s throttle can fire on nearly every real frame when each frame takes seconds under software GL), not necessarily a confirmed real-hardware violation, but worth a second look given `rebuildHabitats()` (flood fill + boundary tracing + fence rebuild) is genuinely non-trivial work, unlike ui's cheap DOM refresh.

## Ranked issues (most damaging first)

1. **[major] The boundary-smoothing pipeline's own headline claim — "never as the 4 m cell staircase" — is directly and repeatedly contradicted by the visitor-zone boardwalk path.** The README (`boundaries.js` section) is explicit: region interfaces are traced, 1-cell teeth are melted with a Taubin filter, corners are rounded with Chaikin cutting, specifically so boundaries "read as smoothed zoning-tool lines at any camera angle, never as the 4 m cell staircase." I observed the exact opposite for the visitor boardwalk connecting two habitats in **four separate screenshots** at three different times of day (10h, 13h, 15h, 21.5h): a clean, repeating, right-angle staircase at the grid's exact pitch, with zero visible smoothing. Habitat-region boundaries elsewhere in the same frames *do* show genuine rounding, so this isn't a total pipeline failure — it specifically affects the narrow 1–2-cell-wide boardwalk corridor, plausibly because a path that thin has no "teeth" left for the Taubin filter to melt without erasing the path itself, an edge case the smoothing algorithm doesn't appear to handle. Fix direction: either widen the minimum boardwalk corridor before tracing, or give thin corridors a dedicated centreline-smoothing pass instead of boundary-interface smoothing.
2. **[minor] `updateMs` (0.9–4.1 ms) exceeds the general ≤1.5 ms/module budget** in 3 of 4 presets — very likely a SwiftShader wall-clock-cadence artifact (see perf note above) rather than a confirmed real-hardware cost, but `rebuildHabitats()` is expensive enough (flood fill + boundary trace + fence rebuild) that it deserves a frame-count-based throttle rather than a wall-clock one, so a real hitch can't compound it.

## What is genuinely good
- Habitat-region fill and boundary rendering (away from the boardwalk case) is genuinely good: correct zone tinting, soft feathered fill edges, believable organic region shapes that read as painted rather than gridded.
- Fence detail at `close` range is convincing: terrain-conforming posts and rails, a plausible minimal safari-boundary read.
- Own-module draw-call budget (4, vs a ≤20 spec ceiling) is exact and independently confirmed against the README's own claim.
- Zero console errors across every preset and extra angle tested.
- `index.js`/`grid.js`/`habitats.js` API matches the README's documented table; `dispose()` releases the overlay, fences, and group cleanly.

## Verdict
FAIL. Zero console errors and comfortably within budget, but a specific, detailed, and prominently-stated README claim about the boundary-smoothing pipeline is directly contradicted by the module's own showcase — reproduced four times across different times of day, not a one-off render glitch. Capped at 6 per the brief's "claim in the README you could not reproduce caps at 6" rule.
