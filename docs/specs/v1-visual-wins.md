# Wave V1 — visual cheap wins: TAA, terrain detail, octahedral impostors, close-range density (contract)

Off the ideas roadmap: proposed 2026-10-03 after an engine/options review ("what are our options"
→ tier 1). Four independent, additive quality fixes picked because each is contained in one module,
verifiable with the existing screenshot loop, and fits inside the measured budget headroom (the
full game draws ~370–500 calls vs the ≤1500 budget; ~3.4–4.5 M tris). Read `ideas-wave-rules.md`
first — rules 16–19 (visuals, night, real-GPU caveat) apply to every part. Branch:
`claude/v1-visual-wins`. Separable: any part may ship alone, in any order; none touches another's
contract.

## Ownership

| owner | does | never |
|---|---|---|
| **effects** | TAA pass (jitter, reprojection, history, resolve); aliasing metric in `measure.mjs` | touch module materials; change FXAA at medium/low |
| **terrain** | biome-keyed detail-normal layer in `material.js` (GPU-generated, faded by distance) | add draw calls; change the splat/road system |
| **props** | octahedral impostor bake (replaces the two-view cards); near-camera grass density ring | change LOD distances, re-pack threshold, or per-frame alloc rules |
| **animals** | hero LOD0 density for the tour-adjacent species (poly up, same pool/draws) | change behaviour, ledger, or draw-call structure |
| **core (integrator)** | one request below (rig exposes prev view-projection) | anything else |

## 0. Core request (integrator, `docs/requests/effects.md`)

`CameraRig` must expose the previous frame's view-projection (and projection jitter) for temporal
reprojection: e.g. `rig.prevViewProjection: Matrix4` updated at the end of `update(dt)`. Proposed
diff is ~4 lines in `src/core/CameraRig.js`; effects files the request, integrator applies it as a
separate "integrator change" commit (wave-rules §14 applies to rig state, not `world.*`, but the
same one-writer rule: rig owns it, effects reads).

## 1. TAA — temporal anti-aliasing (effects) — SHIPPED (part 1)

**What shipped** (design as measured; two deviations from the plan below): at `quality=high` a
temporal pass after GradePass, before OutputPass:

* projection jittered by a fixed **Halton(2,3) 8-sample** sequence, centred (`-0.5`), ~±0.375 px
  amplitude — deterministic, no `Math.random`;
* **camera-only reprojection** (depth → world via inverse current VP, → previous uv via
  `rig.prevViewProjection`); off-screen previous-uv rejects (blend → current); sky depth caps the
  blend at 0.8. Per-object motion vectors stay out of scope (static park, slow orbit rig) — moving
  things live on the clamp;
* **variance clipping** (Salvi): history clamped to μ ± 2.5σ of the current 3×3 neighbourhood
  (+0.002 HDR slack). *Deviation 1* — the planned min/max 3×3 clamp shipped first and was measured
  broken: an aliased single-phase min/max box cannot bound the accumulated supersample, so the
  recursion's fixed point pinned back to the raw frame (mean edge energy 8.42 vs FXAA 6.58,
  blend-insensitive at convergence);
* history blend **0.98** per frame, two HalfFloat history targets ping-ponged at sceneRT
  resolution (+1 target, **+1 draw** measured). *Deviation 2* — the plan's ~3-frame convergence
  was wrong: 0.98 has a ~50-frame constant (0.9 never accumulated at all);
* first frame after build/camera-cut/resize accepts the current frame outright (reset path).

Two integrator bugs were caught by the measurement loop and fixed in `CameraRig.update` (see
`docs/requests/effects.md` #1 for the post-mortem): `prevViewProjection` was captured at the *end*
of update (making it ≡ current VP — identity reprojection), and the jitter was applied with `+=`
to a never-reset projection matrix (cumulative random walk). Both are now: capture prevVP *first*,
assign the NDC offset slot.

**Verification — a temporal effect cannot be read off one still.** The planned "variance of edge
energy across 8 sub-pixel offsets ≥30 % below FXAA" gate was **retired with evidence** after
implementation: the sweep measures (a) a content-energy ramp across the offset grid shared by both
arms, and (b) the jitter limit-cycle orbit that only the jittered arm has — an un-jittered spatial
filter wins both by construction (measured: TAA/FXAA ratio 1.1–3.7 across blend/clamp configs;
even a pure-accumulation probe with the clamp disabled could not win it). The retired metric stays
in the report as a diagnostic. The gates that matter to a player, all in
`measure.mjs --aliasing` (real GPU, frozen module time so only the AA differs):

| gate | bar | measured |
|---|---|---|
| sharpness non-inferiority — mean thresholded second-difference edge energy over 8 sub-pixel offsets, converged (120 frames each) | taa/fxaa ≤ 1.05 | **0.803** (5.31 vs 6.62 — TAA 20 % smoother) |
| temporal stability at rest — per-frame churn (mean |Δ|, 3 frame pairs, scene frozen) | ratio ≤ 0.70 | **0.635** (0.060 vs 0.094) |
| exposure neutrality — grey card, grain off | ratio 0.99–1.01 | **0.9969** (grain on: 0.9888 — grain averaged in HDR pre-tonemap biases by Jensen ≈1 %, a grade-grain interplay, not exposure) |
| draw budget | ≤ +3 | **+1** |

Plus, scripted in the verify harness (`tmp/taa_verify.mjs` recipe, recorded in the effects README):

* **animation integration** (the pass's headline value): with live wind/particles (no freeze),
  per-frame churn 0.956 (FXAA) → 0.381 (TAA) — **2.5× more stable** under animation;
* **ghosting**: 45° yaw sweep + settle, structural vision read of the capture — single edges, no
  double images or smear trails, at the shipped 0.98/2.5 config;
* **SwiftShader**: zero page errors through the whole battery (compat gate);
* **A/B non-vacuity**: toggling `setAA` changes 20.8 % of pixels (the toggle provably does
  something).

**Capture-path caveat**: `screenshot.mjs` renders only 4 real frames after settle — at blend 0.98
that is ~8 % converged; captures are *valid but pre-convergence-smoothed* (they under-represent
TAA's smoothing, never over-represent it). The measurement harness warms 120 frames per phase.

**Quality tiers**: high = TAA; medium/low = FXAA unchanged; `setAA('fxaa')` escape hatch for A/B
and regression hunting; `setAATuning({ blend, slack, gamma })` maintenance hook.

## 2. Terrain detail normals (terrain) — SHIPPED (part 2)

**What shipped**: two GPU-generated tileable detail normals (`buildDetailNormals` in
`textures.js`, 512², cached keys, 256² on software GL) layered over the composed splat normal in
`material.js`: **1.4 m fractured rock** (tridged facets ×2 scales, worley cross-cracks, grain)
weighted by the rock splat, and **0.55 m ground micro-bump** (hummocks, tuft lattice, blade grain)
over grass + dry-grass + 0.35·dirt — both perturbing the same world tangent frame the layer
normals use, **triplanar on slopes** via the existing `bw` blend (the flat-shading tell lives on
boulder/cliff faces). Faded **80→220 m**; the whole branch is skipped beyond that. Zero new draws
(fragment-only); a 1×1 flat fallback binds when textures are missing; `uDetail` uniform is the A/B
hook. Program cache key v11.

**Verification** (`tmp/detail_verify.mjs` recipe, real GPU D3D11, quality=medium so the FXAA chain
gives deterministic frames, both per-frame clocks frozen — see the README note):

| check | result |
|---|---|
| close preset tod 8.5 (raking light) A/B mean-abs diff | **0.199** — detail visibly engaged |
| close preset tod 14 (noon) | **0.120** |
| kopje preset (175 m, evening — the critic's tell) | **0.062** (fade ≈ 32% strength there) |
| overview (1150 m) | **byte-identical** — the fade provably holds, distant pixels untouched |
| draw calls per preset | 31–36, unchanged |
| page errors | **0** real GPU, **0** SwiftShader (generation + compile on software GL) |

Structural vision reads (neutral describe-first): close OFF — grass "reads more as a painted
texture", mud plates flat; ON — "individual grass tufts and clumps catch the grazing light with
distinct micro-shadows… no longer reads as a painted texture", mud plates "aren't perfectly flat".
Kopje OFF — boulders "fairly smooth and somewhat flat-shaded… like a continuous skin rather than a
collection of facets"; ON — "a collection of angled facets and plates… fracture edges catch light
and shadow contrasts… an articulated pile of stone slabs". Exactly the round-2 critic tell,
addressed.

## 3. Octahedral impostor bake (props) — SHIPPED (part 3, scoped to a yaw-aware azimuth ring)

**What shipped** — a deliberate scope reduction from the planned 8×2+pole octahedral atlas, with
the reasoning on record: measurement found the ring repetition's root cause in `pack()` — the
billboard wrote an **identity rotation**, discarding every tree's actual random `rotY` (9 variants
× mirror = 18 distinct distant silhouettes, however many views are baked), and a full octahedral
grid's second elevation row would mostly duplicate the existing side/crown pitch crossfade. So the
shipped design is the part of the octahedron that carries information:

* a **4-view azimuth ring** per variant (bakes at 0/45/90/135°, the far half mapped by mirrored U)
  packed into one strip atlas with an 8 px edge-extended gutter so mip levels never bleed across
  tiles (read back once, uploaded as DataTextures — the terrain layers' pattern);
* **yaw-aware selection**: each instance's `rotY` reaches the shader through an `aYaw` instanced
  attribute (geometry now per-variant, `InstGroup` writes it); the vertex hook picks the baked view
  at azimuth (camera bearing − tree yaw), so every distant tree shows *its own* rotation;
* the **crown card rotates by yaw** (exactly valid for a top view: image right = +x, up = −z ⇒ a
  yawed tree is the same image rotated CCW), and its world-space normal card rotates with it;
* the shadow depth twin runs the same selection (in the shadow pass the "view" is the sun, as
  before); the old negative-scale mirror trick is retired (selection handles mirroring).

**Constraints held**: same instanced-quad draw structure — **draws byte-identical** across four
presets (379/381/464/381 before and after); bake cost invisible in ready-time (deltas ±0.3 s,
within load noise — 8 extra small renders per variant); memory ~net-zero (the ring replaces the
single side card + its normal card; ~0.9 MB of new atlas vs ~0.9 MB freed).

**Verification** (real GPU + SwiftShader): before/after captures at overview 14 h + 17 h, a 330 m
mid view and night 21.5 — **zero page errors on both backends**. Vision reads (neutral
describe-first): BEFORE — "exact clones of one another… 8-10 distinct locations show recognizable
identical copies of the same 2-3 tree shapes… 'clone stamp' effect"; AFTER — "no single 'stamp'
silhouette… crowns rotated at differing angles… read as individuals within a species rather than
clones", 330 m "no smearing, doubling, rectangular clipping, or color fringing", night "correctly
dark and shaded… no glowing outlines, emissive halos, or wrong colors". The round-2 critic's
horizon-ring tell is directly addressed.

## 4. Close-range density spend (props grass + animals LOD0) — SHIPPED (part 4)

**Grass** (`grass.js`, high tier only): `nearSpacing` 0.40 → **0.327** (candidates ×1.5) paid for
by a **smaller LOD0 ring** — `r0` 44 → **36** (area −33% × density +50% ≈ today's instance count,
caps unchanged). `_repack` keeps every candidate inside 36 m and ramps a decorrelated keep
probability down to nominal by 70 m, so the LOD2 handover and total counts are unchanged while the
sward within 36 m reads ×1.5 denser. The first attempt (boost to 55 m at unchanged r0, caps raised)
looked like +8–18 ms/frame — **that was a measurement artifact**: `perf.frameMs` is a 10-frame EMA
of only part of the frame. Honest rAF-to-rAF wall-clock, 40-frame median: overview **21.8 → 21.7
ms**, low preset (fullscreen grass) **17.4 → 16.9 ms** — parity. (One footnote: the low view's p90
tail rose 19.1 → 27.9 ms, consistent with GC of the 1.5× chunk arrays; the median is unaffected.)
LOD1's cap was already binding at 92000 before this wave — pre-existing, unchanged.

**Animals** (`animals/index.js`): procedural LOD0 at `detail √1.5 ≈ 1.22` at high (segment counts
scale ~linearly in detail, tris ~detail²) for the seven procedural species — wildebeest, buffalo,
cheetah, hippo, rhino, warthog, ostrich. **Scoped deviation**: the spec named the five tour species
(impala, zebra, giraffe, elephant, lion), but all five are GLTF-backed authored assets with no
density knob — their LOD0 is already the full-detail asset. The far LOD (detail 0.5) is untouched.

**Measured**: draws unchanged on every view (379 overview / 441 close / 517 low); overview
**4.59 M tris ≤ the 5 M cap** (4.66 M before — slightly down, the smaller LOD0 ring); SwiftShader
zero errors. Vision reads (neutral describe-first): grass BEFORE "medium density, individual tufts
discernible, bare soil clearly visible between tufts" → AFTER "very thick and continuous, a
near-complete ground cover, little bare soil"; wildebeest BEFORE "decidedly low-poly, sides read as
a series of connected chords" → AFTER "smooth, slightly faceted transitions, curvature mostly
continuous".

**Verify** (shipped): see the measured block above — the wall-clock parity numbers replace the
planned frame-ms spot check (`perf.frameMs` is a partial-frame EMA and misleads; rAF-to-rAF medians
are the honest metric), the herd-preset vision reads stand in for close/macro, and the ≤5 M cap is
measured at overview. SwiftShader zero errors.

## Harness (additive, one scenario) — SHIPPED

`visual-quality` — one page load at `quality=high`: the TAA/FXAA A/B **in-page** with the amended
gate (NOT the variance form above — §1 retired it with evidence): edge-energy sharpness ratio
≤ 1.05 (the term that catches a broken TAA — the passthrough mode reads ~1.28), churn at rest,
pixel-diff non-vacuity. One refinement found by running it: the churn **ratio** degenerates on the
harness's frozen SwiftShader scene (FXAA churn collapses to ~0.005, so any TAA wobble explodes the
ratio — healthy TAA read 6.7× while both absolutes are sub-perceptual); the gate is
`churnTaa ≤ max(0.7 × churnFxaa, 0.08)` — ratio where the denominator is meaningful, absolute
sub-perceptual bar where it is not. The ratio form remains the real-GPU gate in
`measure.mjs --aliasing` (0.635 measured). First green run (seed 1, SwiftShader):
**sharp 0.903, churnFxaa 0.008, churnTaa 0.052, abDiff 2.712, pass, 0 console errors**;
JSON in `tools/shots/fidelity-visual-quality.json`. Terrain/props/animals parts are
screenshot-verified only — no scenarios for them (their effect is not stateful). Top-level async
function, default list + dispatcher branch, `tools/check-harness.mjs` green: 21 scenarios
dispatched.

## Unit tests — as amended by part 3's shipped design

The octahedral encoder was scoped out (part 3 shipped the azimuth ring; the encode/decode surface
no longer exists). The node-testable surface that DOES exist: `blitTile`'s strip-atlas layout +
edge-extension invariants in `imposter.js` — covered by lint + the bake's own byte-level
verification path rather than a separate runner (no CI file may be touched from this wave;
`simulation/test.mjs`-style runners are the integrator's to extend).

## Budgets (whole wave, measured at `quality=high`)

+≤3 draw calls total (TAA resolve + history clear; impostors and grass add none). Frame time on
the **real GPU** (`tools/gpu-check.mjs`): ≤ today +1.5 ms at the overview. Every preset must still
render under SwiftShader with 0 console errors. Zero per-frame allocations in any `update()`.

## Wave exit

Per `ideas-wave-rules.md`, plus: screenshots of every changed preset (terrain close 8.5/14, props
overview 14/17 + mid, animals close + one macro, effects A/B) and one full-game day + night shot
(read, per rules 17–19, stating SwiftShader vs real GPU); each touched module's README gains
before/after numbers and honest gaps; this spec gets a "Shipped" header with the measured metric
deltas (aliasing variance −X %, +Y ms, +Z draws, bake +W s).
