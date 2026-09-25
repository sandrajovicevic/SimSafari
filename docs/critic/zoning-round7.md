# zoning — round 7 — score 8.5 / 10 — PASS

All four round-6 majors plus both cap-triggering documentation issues were claimed fixed. I
re-verified each with my own real-GPU captures (every PNG read, ANGLE D3D11 on an AMD RX 5700 XT),
a live state readback in the showcase and the full game, and a code read. Everything reproduces.

## Screenshots reviewed (path — what I saw, one line each)
All mine: 1280×720, seed 1, real GPU (`tools/gpu-check.mjs`), one capture at a time.
- `tools/shots/zoning-overview-15-critic.png` — three habitats with muted sage fills, smooth dashed contours, and the diagonal VISITOR boardwalk now reading as a tan plank path with cross-planks between its two dashed edges — visible by day, r6's invisible-fill defect gone.
- `tools/shots/zoning-night-21.5-critic.png` — the r6 blowout is gone: fills sit dim grey-lavender under moonlight, the contour reads as dashed whitish line (marching-ants gaps visible), the boardwalk is a slightly lighter band with faint plank lines; the line is brightest but reads as a tool line, not neon tubing.
- `tools/shots/zoning-close-16.5-critic.png` — fence detail: wooden posts with two wire rails conforming to terrain, readable and believable; the white boundary ribbon still runs a couple of metres off the fence around the curve (disclosed divergence).
- `tools/shots/zoning-overlay-13-critic.png` — near top-down tool view: every contour smooth, no 4 m staircase anywhere, boardwalk planks oriented across the corridor's long axis.
- `tools/shots/zoning-close-6.5-critic.png` (extra, dawn) — the r6 "neon mint over orange dawn grass" is fixed: the fill reads as a desaturated sage tint over warm-lit grass, exposure-aware.
- `tools/shots/zoning-overlay-9-critic.png` (extra, 9 h) — same staging at morning light; fills and dashes hold.

## Contract / errors / perf
| preset | drawCalls (scene) | triangles (scene) | errors | zoning updateMs (peak) |
|---|---|---|---|---|
| overview 15 | 167 | 3,872,613 | 0 | 0.007 (0.1) |
| close 16.5 | 178 | 3,844,305 | 0 | 0.005 (0.1) |
| overlay 13 | 178 | 3,879,916 | 0 | 0.003 (0.1) |
| night 21.5 | 192 | 4,119,852 | 0 | 0.003 (0.1) |
| extra: close 6.5 | 180 | 3,909,841 | 0 | 0.002 (0.1) |
| extra: overlay 9 | 178 | 3,879,916 | 0 | 0.000 (0.0) |

- GPU string on every JSON: `ANGLE (AMD, AMD Radeon RX 5700 XT … D3D11)` — real GPU, no
  SwiftShader. Zero console errors in all six captures; `modules.zoning.status === 'ok'`.
- overview/close/overlay scene totals match the README's measured table exactly (167/178/178);
  night (192) finished fine on real GPU where the README's SwiftShader run timed out — within the
  README's disclosed frustum variance. zoning's own group is 4 draw calls (overlay fill + boundary
  ribbon + 2 fence InstancedMeshes) vs the spec's ≤ 20.
- `node tools/lint.mjs src/modules/zoning` → ok. Every README API function exists in `index.js`;
  `dispose()` releases overlay, fences, group and resets Z. Steady-state `update()` is
  allocation-free (uniform writes + dirty flags); `updateMs` steady 0.002–0.007 ms — the r6 2.1 ms
  reading is gone. (In the tools showcase zoning shows 0.25–0.6 ms mean / ~13–34 ms peak: the
  documented one-time `rebuildLines()` EMA tail after that stage paints, not steady state.)

## Claim-by-claim (r6 issues)
1. **Boardwalk (VISITOR) fill — fixed as disclosed.** Day: visible tan plank tint with
   cross-corridor plank direction in overview/overlay and at the boardwalk close-up. Night: visible
   and contained. The README correctly presents this as the cheap version (floor alpha + 12-tap
   axis pick on the same 5×5 field, not an SDF clip); residual stepping at night is minor (below).
2. **Unlit fixed-colour glow — fixed.** Night fills no longer blow out (they were the brightest
   thing in frame in r6; now the contour leads and fills sit near terrain luminance); dawn no
   longer reads as neon mint over orange grass. The colour-magnitude × night/exposure mechanism in
   `overlay.js`/`boundaries.js` is visible in both extra-tod captures.
3. **Habitat fragmentation — fixed, reproduces exactly.** Live readback in the full game
   (`?preset=overview`): `listHabitats()` returns **exactly 7** — the 4 named (Pride Kopje 36,272;
   Acacia Woodland 29,632; Plains 22,064; River Wetland 4,256) plus river/road splits of 6,608,
   1,280 and 432 m² — precisely the README's measured claim, no 1–3-cell slivers. The zoning
   showcase lists exactly its 3 painted habitats (14,704 / 21,072 / 10,976 m²), all fenced.
4. **README clamp claim — fixed.** README states 3.2 m (`MAX_PULL`) consistently; matches
   `boundaries.js`.
5. **updateMs — fixed** (0.002–0.007 ms steady; frame-count throttle + species-only refresh in
   code; the residual tools-showcase reading is the documented one-time ribbon-rebuild EMA tail).
6. **Night marching ants — fixed**: dash gaps are visible at night in my capture; the ants animate
   (uTime), which stills can't show, but the gap floor change is visibly in effect.

## Ranked issues (most damaging first)
1. **[minor] Boardwalk fill still follows the cell field, not the ribbon.** On thin corridors at
   night the fill's edge can step a cell against the smooth line (faintly visible in my night
   capture at the lower boardwalk edge). Disclosed as the cheap version with an SDF-clip follow-up;
   acceptable, but it is the remaining gap between this and a true CS2-grade overlay.
2. **[minor] Fence and overlay line diverge by up to ~3 m at tight corners** (visible in
   `close-16.5`): fences sit on exact cell edges, the smoothed line may pull 3.2 m. Disclosed; only
   noticeable at 15 m camera distance.
3. **[minor] The fill is exposure-aware but still a flat unlit tint by day** — at overview distance
   it reads slightly sticker-like against lit grass. A gentle luminance modulation would finish it.
4. **[minor] No stone-wall fence variant and no gate demonstration** — the showcase never builds a
   road, so the gate code path (rail skipped, posts raised) is verified by synthetic check only.
5. **[minor] No undo for paints** — every paint mutates `world.grid` immediately (tools' undo stack
   covers it in-game; disclosed).

## What is genuinely good
- The overlay now genuinely reads as a Cities: Skylines II-style zoning tool at every hour I
  threw at it (13 h, 15 h, 9 h, 6.5 h dawn, 21.5 h night): smooth clamped contour, marching-ants
  dashes, exposure-aware fill, oriented boardwalk planks.
- The min-area flood-fill fix is exactly right — the full game lists 7 habitats, all real, matching
  the README to the square metre.
- Discipline: 4 own draw calls at every preset, 0.003 ms steady update, zero errors, lint clean,
  and a README whose measured numbers I reproduced exactly (including the honest note about which
  captures timed out under SwiftShader).

## Verdict
**PASS, 8.5.** Every round-6 major is fixed and reproduced with my own evidence; every README claim
I tested reproduces. The remaining items are nits (cell-field fill on thin corridors at night,
corner divergence, flat day tint) — the class of flaws "AAA with nits" describes.

```json
{
  "module": "zoning",
  "update": {
    "score": 8.5,
    "round": 7,
    "status": "pass",
    "errors": 0,
    "drawCalls": 192,
    "issues": [
      { "sev": "minor", "text": "Boardwalk fill still driven by the 5x5 cell field, not the smoothed ribbon: faint cell stepping at corridor edges at night; SDF-clip follow-up disclosed" },
      { "sev": "minor", "text": "Fence sits on exact cell edges while the contour may pull up to 3.2 m, so line and fence diverge at tight corners (visible at 15 m)" },
      { "sev": "minor", "text": "Day fill is exposure-aware but still a flat unlit tint; reads slightly sticker-like at overview distance" },
      { "sev": "minor", "text": "No stone-wall fence variant; showcase never builds a road so the gate opening is only synthetically verified" },
      { "sev": "minor", "text": "No undo for paint/erase/fill (delegated to tools in-game)" }
    ],
    "good": "All four r6 majors verified fixed with own real-GPU captures: night blowout and dawn neon gone (exposure-aware fill/line), boardwalk fill visible by day and contained by night with corridor-oriented planks, habitat fragmentation fixed (full game lists exactly 7 habitats matching the README to the m^2), updateMs steady 0.002-0.007 ms. 4 own draw calls, 0 console errors in 6 captures, lint ok, API/dispose match README, measured table reproduces exactly."
  }
}
```
