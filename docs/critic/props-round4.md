# props — round 4 — score 7.0 / 10 — FAIL

All captures are my own, real GPU (`tools/gpu-check.mjs`, `--use-angle=d3d11`, ANGLE AMD RX 5700 XT
D3D11 verified in every JSON): 7 presets plus 2 extra angles (`overview 9`, `kopje 10`), 1920×1080,
seed 1, plus a 2× ground crop of the grass preset. Module code is unchanged since round 3; terrain's
photo layers and the global exposure-neutral grade landed since, so this round judges the module's
current look in frame.

## Screenshots reviewed (path — what I saw, one line each)
- `tools/shots/crit6-props-overview-16_5.png` — the project's best establishing view still holds: umbrella crowns now read as proper flat-topped silhouettes from this pitch (two-view imposters work), density gradient toward the riverine gallery is natural, kopjes and escarpment sit in haze.
- `tools/shots/crit6-props-overview-9.png` (extra) — morning version: river reflects sky, gallery forest dense, far-field grass fade acceptable; terrain's scrub-mottle reads repetitive from altitude (terrain's, not props').
- `tools/shots/crit6-props-grass-17.png` — dry sward at ~8 m: individual blades legible, golden; **but hard-edged dark-olive triangles/quads are scattered across the ground** and the tufts sit in visible regular rows; a mid-frame shrub reads as a burnt near-black lump.
- `tools/shots/crit6-zoom-props-grass-mats.png` (2× crop) — decisive: the dark shapes are flat ground-hugging polygons with straight edges and uniform dark fill (the tufts' baked ground "mat" quads), and the blades themselves are flat single-colour triangles at this zoom.
- `tools/shots/crit6-props-acacia-15.png` — the umbrella thorn at 20 m is still textbook: bare bole forking high, level-topped crown, believable cast shadow, termite mound and background herd; crown edges slightly confetti-ish.
- `tools/shots/crit6-props-kopje-17_5.png` — photo-scanned granite boulders with real lichen mottling and rubble at the base (angle-of-repose cap works — no popcorn boulders); the escarpment wall still dominates the upper-left half of the frame.
- `tools/shots/crit6-props-kopje-10.png` (extra) — backlit morning version: boulder forms and debris slopes read convincingly; shrubs root at boulder bases rather than visibly "in the cracks".
- `tools/shots/crit6-props-riverine-8.png` — the gallery at 8 h is beautiful: dense layered canopies, pale fever-tree trunks, water now mirroring the sky (terrain's Fresnel landing helps this preset a lot).
- `tools/shots/crit6-props-close-16.png` — ground detail: termite mound form is good, granite boulder pale and plausible, log bark reads as dense noise, shrubs near-black, and the dark mat polygons are visible around several tufts.
- `tools/shots/crit6-props-night-21_5.png` — moonlit silhouettes are legible on real GPU (r3's SwiftShader near-black no longer applies); the sky's cloud deck reads as blotchy white clumps (environment's), and the pan at right is the brightest surface in frame (terrain's night-water term).

## Contract / errors / perf (table: preset, drawCalls, triangles, errors, props updateMs)
| preset | drawCalls | triangles | errors | props updateMs |
|---|---|---|---|---|
| overview (16.5 h) | 134 | 3,878,442 | [] | 0.0 |
| overview (9 h, extra) | 136 | 3,943,978 | [] | 0.0 |
| grass (17 h) | 121 | 3,540,029 | [] | 0.0 |
| acacia (15 h) | 135 | 3,494,913 | [] | 0.0 |
| kopje (17.5 h) | 136 | 3,125,821 | [] | 0.0 |
| kopje (10 h, extra) | 135 | 3,093,053 | [] | 0.0 |
| riverine (8 h) | 148 | 3,842,532 | [] | 0.0 |
| close (16 h) | 136 | 3,486,003 | [] | 0.0 |
| night (21.5 h) | 154 | 4,099,937 | [] | 0.0 |

- Zero console errors on all 9 captures; `modules.props.status === 'ok'` throughout; lint ok.
- **Round-3 blocker verified fixed: settled `update()` measures 0.0 ms on every preset** (r3: 132–263 ms on every preset). The amortised chunk queue in `grass.js` (`_queueMissing`/`_drainQueue`, 3 ms / 24-chunk budget) matches the code as described; showcase full-drain behaviour is intentional per README.
- Draw calls 121–154, far inside the ≤400 spec cap. **Triangles at overview 3.88 M remain over the spec's 3 M** (disclosed known gap; grass tuft geometry is the driver).
- Cross-frame note: in *other* modules' showcase frames (animals, park) `props.updateMs` reads 3.4–8.5 ms steady-state while its own presets read 0.0 — there is residual per-frame work when grass streams under another module's staging; still 20–60× better than r3 and inside no hard budget, but worth a look.
- Contract: all 12 README API functions exist (`scatter/place/remove/clear/coverAt/grassDensityAt/graze/kinds/kindInfo/getStats/setGrassEnabled/refresh`); `optional: ['terrain','environment']` truthful and matches actual `modules.get` use; photo-rock loads via `ctx.assets` with a logged procedural fallback; `dispose()` releases grass field, variant geometries, imposters + render targets, materials and textures; `update()` allocation-free (scratch `_cam`); `tick()`'s small `done[]` array is 10 Hz sim-rate, not per-frame.

## Ranked issues (most damaging first)
1. **[major] Hard-edged dark ground "mat" polygons are scattered across the sward and are now the module's most visible defect.** What: flat dark-olive triangles/quads lying on the ground between tufts, with straight edges and uniform fill (`crit6-zoom-props-grass-mats.png`). Where: worst at `grass` and `close` range, but visible in every other module's close frames this round (animals species/close/fox-probe, park habitat/close, savannah close) — props owns the ground read of the whole project. Why: terrain switched to photo ground layers on 09-25; each tuft variant's built-in ground-colour quad ("mat", colour solved against the old procedural ground mean) no longer matches the ground it sits on, so instead of hiding LOD-density steps the mats announce themselves as dark polygons. Fix: re-solve the mat constant/colour against the current terrain layer means (or sample the terrain albedo at rebuild), and consider alpha-fading mats to 0 in LOD0 where real tufts already cover the ground.
2. **[major] Tuft placement reads as regular rows at close-to-mid range.** What: the grass field shows straight diagonal rows/grid lines of tufts. Where: `grass`, animals' `species`/`predators` frames, park `habitat` foreground, the fox-override probe — any shot with mid-distance open sward. Why: the sampling grid is visible once individual tufts are distinguishable; real swards are noise-distributed. Fix: jitter each candidate sample (the seeded RNG is already there) or rotate the grid per chunk so no global alignment survives.
3. **[minor] Triangle budget still over spec** (3.88 M at overview vs ≤3 M; disclosed). The visual density it buys is real, but the spec line is the spec line; the LOD1/LOD2 tuft segment-count levers named in the README remain unpulled.
4. **[minor] Dead-plant albedo reads burnt, not dry.** The centre shrub in `grass` and the shrubs in `close` render near-black brown; canopies were de-darkened but shrub foliage still sits at the bottom of the value range. Fix: raise shrub leaf albedo toward dry-savannah olive (0.25–0.4 linear), not charcoal.
5. **[minor] Carried from r3: log bark reads as dense noise at 15 m; "thorn scrub rooted in the cracks" only reads at the boulder bases; the kopje frame still cedes half its composition to the escarpment.**
6. **[minor, cross-module] `night` shows two terrain/environment defects through this module's frame** (blotchy night cloud deck, bright pan surface) — correctly attributed, listed for the record.

## What is genuinely good
- The round-3 catastrophic `update()` cost is verifiably gone (0.0 ms settled on all nine captures) with the amortised queue implemented exactly as the README describes — the fix survives independent measurement.
- Photo-scanned boulders with the angle-of-repose cap are a genuine upgrade: granite kopjes now read as real rock with talus, no popcorn.
- Two-view imposters fixed the worst overview tell: crowns read as umbrellas from above instead of dashes.
- `overview` and `riverine` remain the two best images in the project — naturalistic distribution, believable haze, and (with terrain's new water) the gallery at dawn is close to reference photography.
- Instancing continues to deliver: 121–154 draw calls for ~5.5 k placed props and ~180 k grass instances.

## Verdict
FAIL at 7.0 — same score as round 3, different reasons. The r3 blocker (90–175× update overrun) is fixed and verified, which alone would have lifted the score; but two new close-range artifact classes — the mismatched dark ground mats and the visible placement grid — now damage every module's foreground, and the overview triangle budget is still over spec. The path back up is narrow and concrete: re-solve the mat colour against the photo layers, jitter the placement grid, then re-verify `grass`/`close` at 2×.

```json
{
  "props": {
    "score": 7.0,
    "round": 4,
    "status": "fail",
    "errors": 0,
    "drawCalls": 154,
    "issues": [
      { "sev": "major", "text": "Hard-edged dark-olive tuft ground-mat polygons are scattered across the sward (worst at grass/close range; visible in animals', park's and savannah's close frames too) — the tuft 'mat' quads' baked colour no longer matches terrain's new photo ground layers. Re-solve the mat albedo against the current layer means or alpha-fade mats in LOD0." },
      { "sev": "major", "text": "Tuft placement reads as regular rows/diagonal grid lines at close-to-mid range in every open-sward shot (grass, animals species/predators, park habitat). Jitter samples with the seeded RNG or rotate the grid per chunk." },
      { "sev": "minor", "text": "Overview triangles 3.88 M remain over the spec's 3 M (disclosed); LOD1/LOD2 tuft segment-count levers unpulled." },
      { "sev": "minor", "text": "Dead-plant albedo reads burnt: shrubs render near-black while canopies were de-darkened; raise shrub leaf albedo to dry-savannah olive." },
      { "sev": "minor", "text": "props.updateMs reads 3.4-8.5 ms steady-state inside animals/park showcase frames vs 0.0 in its own presets — residual per-frame work when grass streams under other modules' staging (still 20-60x better than round 3's 132-263 ms)." },
      { "sev": "minor", "text": "Carried: log bark reads as noise up close; 'thorn scrub rooted in the cracks' reads only at boulder bases; kopje frame still cedes half its composition to the escarpment." }
    ],
    "good": "Round-3 blocker verified fixed: settled update() 0.0 ms on all nine captures (was 132-263 ms on every preset), amortised chunk queue implemented as described. Photo-scanned granite boulders with the angle-of-repose cap genuinely upgrade kopjes (real talus, no popcorn). Two-view imposters kill the dash-from-above tell — crowns read as umbrellas from altitude. Canopies no longer near-black. overview and riverine remain the project's best images. 121-154 draw calls for ~5.5k props + ~180k grass instances; zero console errors; lint ok; API/dispose match the README."
  }
}
```
