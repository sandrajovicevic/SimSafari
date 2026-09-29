# props — round 5 — score 7.5 / 10 — FAIL

**Backend: SwiftShader (software GL), not a real GPU.** All captures come from a Linux container using
`tools/screenshot.mjs`; every JSON reports `gpu` = `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device …))`.
1920×1080, seed 1, `--timeout 400000`, LFS assets resolved (`Lion.glb` starts `glTF`; the elephants in the game
frames are the authored GLBs). There is no D3D11 adapter here, so I issue **no** verdict on the four real-GPU
questions as such. What I could see on SwiftShader is reported where it bears on them:
1. *close-range grass shading and depth* — judged on SwiftShader only (see the grass shots); real-GPU shading, MSAA and alpha-to-coverage behaviour not judged.
2. *far-tree shadows at 14 h and 17 h* — judged on SwiftShader; the CSM and depth-material path is backend-independent in principle, but I cannot exclude a SwiftShader-only shadow-map difference.
3. *grey streaking on steep river banks* — terrain's, answered in `terrain-round6.md`.
4. *night legibility at ground level* — SwiftShader `low`/`close` shots at 21.5 h below; real-GPU verdict **not issued**.

Head `418fcb3` (PR #12 merge). Every `.json` was checked for timestamp and `errors` before its PNG was read
(all from this session, none stale); every PNG named below was read. The last props round was 4 (7.0). STATUS.json
has since marked its two majors "FIXED post-round … orchestrator-verified"; I re-verified them from scratch.

## Screenshots reviewed (path — what I saw, one line each)
- `tools/shots/props-overview-16_5.png` — river gallery, kopjes, pans and escarpment at 16.5 h: dense layered gallery canopy, natural thinning onto the open plain, believable haze. Still the project's best establishing view. Far umbrella crowns read as small flat-topped shapes; scattered near-black shrubs on the plain read as dark specks.
- `tools/shots/props-grass-17.png` — sward at ~8 m: **the dark ground "mat" polygons of round 4 are gone** and blades are tall, tan, with no visible rows. A shrub at centre is a near-black stem cluster with a brown-black flat canopy (round-4 "burnt shrub" unchanged). Foreground has several **pale flat triangles lying on the ground**, and blades are flat single-tone shapes with almost no depth cue at this range.
- `tools/shots/props-acacia-15.png` — umbrella thorn at ~20 m with a believable cast shadow, termite mound, mid-distance shrubs. The crown is confetti-edged with a few horizontal smear streaks across the upper canopy (aliasing of the leaf cards under SwiftShader). Grass is dense and reads as grass in both sunlit and shaded parts.
- `tools/shots/props-kopje-17_5.png` — photo-scanned granite boulders with scattered rubble, correct on the tower; escarpment fills the left half of the frame (unchanged composition nit).
- `tools/shots/props-riverine-8.png` — fever-tree canopy at 8 h: layered, believable; the near canopies show horizontal banding/smear on the leaves (looks like leaf cards aliasing). Water reflects the sky. Strong.
- `tools/shots/props-close-16.png` — ground detail: termite mound, log, boulder, shrubs. **Grass here is the best it has been**: blades are two-tone with darker undersides and no dark wedge mottle (the close-range fix landed). The log bark is a dense noise pattern, shrubs are near-black brown.
- `tools/shots/props-night-21_5.png` — moonlit silhouettes are legible; the sky's cloud deck is a cluster of **large white hexagonal bokeh blobs** (environment's), and a bright white pan at right is the brightest surface in frame (terrain/environment's). Props themselves are correct: black trees against a lighter plain.
- `tools/shots/props-plants-13.png` — P1 plant layout: crowns as domed lollipops, baobab with a swollen trunk, wetland ring; readable. Grass has visible large flat streak triangles (brush-stroke look) over the whole plain.
- `tools/shots/props-unburnt-14.png` / `props-burnt-14.png` — burn control pair: the disc is clearly removed from grass/trees, rocks stay. The bank-side grass shows scattered pale flat triangles and tan splinters (fringe).
- `tools/shots/r6-game-overview-14.png` and `r6-game-overview-17.png` — whole park at 14 h and 17 h; used for the far-tree shadow check and the border check. `tools/shots/crit-crop-ov14-trees.png`, `tools/shots/crit-crop-ov17-trees.png`, `tools/shots/crit-crop-ov17-trees-c.png` (3× native, 3× native, 2.5× contrast) — **at 14 h every far tree casts a crisp dark oval shadow; at 17 h I find none** (see issue 2).
- `tools/shots/r5-game-mid330-14.png` — 330 m view that turned out to frame the escarpment, with a few far acacias on the plateau top. `tools/shots/r5-game-mid330b-14.png` + `tools/shots/crit-mid-imp2.png` (3× crop) — **the requested 330 m view over open acacia plain at 14 h**: impostor umbrellas have flat crowns, visible trunks, crisp shadows offset from the trunk base in the correct direction; they read as real trees. The near-field trees at right are mesh LODs and look fine. A stray pale bare-stem "dead tree" at centre is a legitimate dead-tree prop.
- `tools/shots/r5-game-close-7.png` (game `close` 7 h) — warm low sun, good long shadows, herd of elephants, hut, kopjes; the mid-ground grass shows a **scribbled worm-like mottle** (round-8's tell) and the near canopy is dark olive. 434 draws, 4.98 M tris.
- `tools/shots/r5-game-close-14.png` (game `close` 14 h) — same scene at 14 h: clean; canopy shadows dark, elephants read, scribble mottle again visible across the plain; 435 draws, 5.11 M tris.
- `tools/shots/r5-game-close-21.5.png` — game `close` at night: the moonlit upper band is legible (acacias, hut, herd shapes, escarpment) and the lower half is a near-black canopy mass (frame mean luma 17/255). Unchanged from round 8.
- `tools/shots/r5-game-low-14.png` (game `low` preset, eye-level, 14 h) — the scene is nice (elephants, acacias, shrubs, fence), **but a rectilinear grid of grass rows covers a ~16 m square patch left of the elephants** (crop `tools/shots/crit-lowgrid.png`). Issue 1.
- `tools/shots/r5-game-low-14-nograss.png` (same with `props.setGrassEnabled(false)`, crop `tools/shots/crit-lowgrid-ng.png`) — the grid is gone, so it is props' grass, not terrain.
- `tools/shots/r5-game-low-21.5.png` — the same eye-level view at night: elephants, acacia silhouettes and horizon legible; the grid patch is still faintly visible at left.
- `tools/shots/r6-game-overview-14.png` context: game overview 14 h = 363 draws, 4.05 M tris.

## Contract / errors / perf (table)
Draw calls/triangles are frame totals (props' own share is the bulk of the difference between showcase and terrain-only frames).

| capture | drawCalls | triangles | errors | props updateMs (mean/peak, harness) |
|---|---|---|---|---|
| overview 16.5 | 161 | 3,887,378 | [] | 0.009 / 0.1 |
| grass 17 | 148 | 3,544,574 | [] | 0.014 / 0.2 |
| acacia 15 | 162 | 3,499,941 | [] | 0.007 / 0.1 |
| kopje 17.5 | 160 | 3,133,281 | [] | 0.002 / 0.1 |
| riverine 8 | 175 | 3,847,373 | [] | 0.004 / 0.1 |
| close 16 | 163 | 3,490,174 | [] | 0.009 / 0.1 |
| night 21.5 | 181 | 4,105,727 | [] | 0.010 / 0.1 |
| plants 13 | 209 | 3,829,339 | [] | 0 / 0 |
| unburnt 14 | 169 | 3,637,852 | [] | 0.006 / 0.1 |
| burnt 14 | 169 | 2,929,738 | [] | — |
| game overview 14 | 363 | 4,049,189 | [] | 11.4 / 29.2 |
| game overview 17 | 365 | 4,255,559 | [] | 12.4 / 47.8 |
| game close 7 | 434 | 4,975,104 | [] | 12.4 / 111.4 |
| game close 14 | 435 | 5,106,516 | [] | 11.7 / 72.3 |
| game close 21.5 | 435 | 5,050,634 | [] | — |
| game low 14 | 532 | 5,384,045 | [] | — |
| game low 21.5 | 533 | 5,301,411 | [] | — |
| game mid330 14 / 330b 14 | 363 / 363 | 4,180,663 / 4,215,873 | [] | — |

- 20 captures, zero console errors, `modules.props.status === 'ok'` on all. `node tools/lint.mjs src/modules/props` → **lint ok**.
- **Game overview draw calls 363 (14 h) and 365 (17 h) vs the 1500 budget** → pass (consistent with the +27 the builder reported for impostor depth twins; I did not measure the before-state). Props' own cap is 400: 148–209 in showcases → pass. Worst game frame 533 (`low`).
- **Triangles: showcase `overview` 3.89 M vs the spec's ≤ 3 M → over spec (unchanged, disclosed).** Game frames 4.0–5.4 M vs the 6 M project budget → inside, tightest 5.38 M (`low`).
- **`update()` vs the ≤ 1.5 ms row of ARCHITECTURE §7: the showcase presets are fine, the game is not.** The harness's own steady-state `updateMs` for props is **11.4–12.4 ms in every game capture** (peak 29–111 ms). I timed `update()` directly on the game overview after the standard settle: 400 calls, mean 0.84 ms, **but the first 12 consecutive calls after settle each cost 10.6–18.5 ms** (25 spikes > 1.5 ms in total) with a static camera, then 0. So the queue is still draining after the tool's 36 settle frames + 4 renders. That is the amortised queue, working, but it costs 10–19 ms per frame for ≥ 12 frames: a visible stutter on any camera jump in-game (SwiftShader, CPU only, another capture idle). [Certain] on the numbers; whether it is 10× smaller on a real CPU/GPU is not something I can say.
- `dispose()`, README API list and `optional: ['terrain','environment']` unchanged from round 4 and consistent; `imposter.js` disposes each `userData.depthMaterial` (`index.js:1255`). `update()` no per-frame allocations by reading.
- **README contradicts itself.** `README.md:363` (first "Known gaps" bullet) still says "Imposters still have no cast shadow", while a later bullet documents the shipped shadow twin. One of them is stale.

## Round 4 issues — status and evidence
| # | round-4 issue | status | evidence |
|---|---|---|---|
| 1 | [major] Dark tuft ground-mat polygons | **resolved** (no dark polygons in any of `grass-17`, `close-16`, `unburnt/burnt-14`, game `low/close`) | `props-grass-17.png`, `props-close-16.png`, `r5-game-low-14.png` |
| 2 | [major] Tufts in regular rows/grid | **improved, not resolved** | jitter works everywhere I looked **except chunk (0,0)**, a perfect lattice (issue 1); `r5-game-low-14.png`, `crit-lowgrid.png` |
| 3 | [minor] Triangle budget over spec (3.88 M) | **unchanged** | 3.89 M at `overview` |
| 4 | [minor] Shrubs near-black | **unchanged** | `props-grass-17.png` centre, `props-close-16.png`, `props-overview-16_5.png` |
| 5 | [minor] props.updateMs 3–8 ms in other modules' frames | **worse in the game**: 11–12 ms mean / up to 111 ms peak in the harness | table above |
| 6 | [minor, carried] log bark noise, kopje composition | **unchanged** | `props-close-16.png` (log), `props-kopje-17_5.png` |
| 7 | [minor, cross-module] night cloud deck blotchy, bright pan | **unchanged** | `props-night-21_5.png` (cloud deck is worse: large white hexagons) |

## Ranked issues (most damaging first)

1. **[major] Chunk (0,0) renders as a perfectly regular lattice of grass rows.**
   - **What:** one 16 m square of the sward, at the world origin, is a rectilinear grid of tufts: uniform spacing, uniform height, aligned rows and cross-rows, no gaps. It sits in the middle of the frame.
   - **Where:** `r5-game-low-14.png` (patch left of the elephants; faintly visible at night in `r5-game-low-21.5.png`), crop `tools/shots/crit-lowgrid.png` vs `tools/shots/crit-lowgrid-ng.png` with grass disabled (the grid is gone). The game's `low` preset targets (0,0), and (0,0) is where the park's default stage and camera land, so this is the first place a player looks.
   - **Why it matters:** this is exactly the "sampling grid is visible" defect round 4 ranked major and STATUS.json marked resolved. It is not resolved at the one place that matters.
   - **Cause [Certain, arithmetic checked without changing code]:** `grass.js:229-240` seeds a xorshift with `(ix*73856093) ^ (iz*19349663)`. For `(ix,iz) = (0,0)` the seed is **0**, and xorshift32 from 0 returns 0 forever (I ran it: `[0,0,0]`), and no other chunk in ±40 has a zero seed. With every `rnd()` = 0 the jitter is a constant offset and `rnd() > d` never rejects, so every candidate becomes a tuft with the same size and colour. It applies to both the near (16 m) and far (64 m) chunk grids. [Likely] this is the cause of the patch; I did not toggle it because critics write no code.
   - **Fix:** OR a non-zero constant into the seed (e.g. `h = ((ix*73856093) ^ (iz*19349663) ^ 0x9E3779B9) >>> 0`) or run a few warm-up `rnd()` calls; add a check that no chunk has zero seed.
2. **[major] Far-tree impostor shadows are present at 14 h but not visible at 17 h.**
   - **What:** at 14 h every far tree casts a crisp, dark oval shadow (`crop-ov14-trees.png`, `mid-imp2.png`). At 17 h, the same trees in the same frame cast **no** shadow at native contrast or at a 2.5× contrast boost (`crop-ov17-trees.png`, `crop-ov17-trees-c.png`): the olive crowns float over a smooth ground. The builder says it verified 17 h; the tasking asks for exactly this.
   - **Why it matters:** the fix exists to stop far trees floating, and the low-sun case is the case where shadows are longest and most visible. Reference: real evening plains footage is all long tree shadows.
   - **Possible causes [Guessing]:** the depth-twin card is edge-on to a low sun so it casts an almost zero-width shadow; or the far shadow cascade's range/texel size drops the thin shadow; or it is a SwiftShader-only shadow-map difference. I cannot tell from here.
   - **Fix:** verify on a real GPU; if it holds, cast the far-tree shadow from a card facing the sun (billboard around the sun direction rather than the camera in the shadow pass), or a fixed-size elliptical blob decal.
3. **[minor] At 900 m the far trees are floating balls.** At 14 h, and more so at 17 h, `crop-ov14-trees.png` / `crop-ov17-trees.png` show olive/green spheres with no trunk, hovering above their shadow (at 14 h) — reads as lollipops/balloons, the "blob canopies" the round-8 blind critic named. At 330 m (`mid-imp2.png`) they are convincing umbrellas, so this is a bake-view problem from above, not a general failure.
4. **[minor] Foreground grass: flat pale triangles and single-tone blades at 5–8 m.** `props-grass-17.png` (foreground, several pale flat triangles on the ground), `props-unburnt-14.png` (bank), `props-plants-13.png` (large flat streak triangles over the plain). README calls it "pre-existing"; it is the most artificial-looking thing in the close-range frames. Fix: alpha-fade or cull blades with |normal·up| < ~0.25 within LOD0/LOD1; add a per-blade AO ramp.
5. **[minor] Shrub albedo still near-black / brown-black** (round-4 issue 4, unchanged): `props-grass-17.png` centre, `props-close-16.png`, scattered dots in `props-overview-16_5.png`. Fix: raise the shrub leaf albedo to dry-savannah olive.
6. **[minor] Game-frame `update()` cost:** 10–19 ms per frame for ≥ 12 frames after settle (measurements above) and harness means of 11–12 ms vs the 1.5 ms budget. The queue works, but its per-frame slice is 6–12× the budget; lower the slice to ~1.5 ms and accept a longer fade-in.
7. **[minor] Triangles 3.89 M at showcase `overview` vs ≤ 3 M spec** (carried, disclosed); the tuft LOD1/LOD2 segment levers are still unpulled.
8. **[minor] Canopy leaf-card smear/banding** (horizontal streaks across near canopies in `props-riverine-8.png` and the upper crown of `props-acacia-15.png`). [Guessing] SwiftShader aliasing of alpha-tested cards; real-GPU check needed before calling it a defect.
9. **[minor, documentation] Stale README bullet** (`README.md:363`, "imposters still have no cast shadow").
10. **[minor, cross-module] Night cloud deck / bright pan** (`props-night-21_5.png`); **night close** loses the lower half to a black canopy mass (`r5-game-close-21.5.png`, unchanged from r8); the moonlit `low` view is legible (`r5-game-low-21.5.png`).
11. **[minor, carried]** log bark noise, kopje frame half escarpment, thorn scrub "in the cracks" only at boulder bases.

## What is genuinely good
- **The round-4 dark ground-mat polygons are really gone** and no row pattern shows anywhere except chunk (0,0): `grass-17`, `close-16`, `low`, `close` all clean of dark polygons.
- **Close-range grass shading is a real improvement**: `props-close-16.png` blades are two-tone with dark undersides and no dark wedge mottle — the up-bent normal fix landed.
- **Far trees cast shadows at 14 h and read as real umbrella acacias at 330 m** (`mid-imp2.png`), which was the round-8 blind complaint; draw calls are 363 at the game overview (the builder's 336 → 363), inside the 1500 budget.
- `overview` and `riverine` remain the two best images in the project; photo-scan boulders with talus hold up; the burn control pair works; zero errors on 20 captures; lint ok.

## Verdict
**FAIL at 7.5** (was 7.0). Both round-4 majors were declared fixed; one genuinely is (the mats), the other is fixed everywhere except at
the world origin, where one 16 m chunk is a hard-edged lattice, in the park's default framing. The far-tree shadow fix works at 14 h but I cannot see it at 17 h.
Every claim I tested was reproduced except that one. The grass is at its best so far, and the pieces that keep this out of the 8s are one deterministic
seed bug, a low-sun shadow gap, near-black shrubs, the 3.9 M triangle overrun and a game `update()` that spends 10–19 ms per frame while streaming.
Not verified on a real GPU: close-range shading quality, far-tree shadows on hardware, ground-level night.

```json
{
  "props": {
    "score": 7.5,
    "round": 5,
    "status": "fail",
    "errors": 0,
    "drawCalls": 533
  }
}
```
