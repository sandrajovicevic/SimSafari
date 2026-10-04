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

## 1. TAA — temporal anti-aliasing (effects)

**What**: at `quality=high` replace FXAA with a temporal pass after GradePass, before OutputPass:

* projection jittered by a fixed **Halton(2,3) 8-sample** sequence (seeded constant — no
  `Math.random`, lint enforces);
* **camera-only reprojection** (world → clip with `prevViewProjection`, inverse current): the park
  is static and the rig is a slow orbit, so per-object motion vectors are out of scope;
* **rejection**: depth mismatch beyond an epsilon OR normal-parity flip → accept current frame
  (blend weight → 1). Fast movers (animals, particles) live on rejection, not projection — brief
  edge softness on a galloping herd is acceptable, smeared ghosts are not;
* **neighbourhood clamp**: 3×3 min/max of the current frame around the reprojected sample clamps
  the history (kills ghost trails);
* history in a HalfFloat target at sceneRT resolution (+1 target, +1–2 draws total);
* first frame after build/camera-cut/resize accepts the current frame outright (no accumulation
  from a stale buffer).

**Verification — a temporal effect cannot be read off one still** (the heat-haze precedent,
effects README Known gaps). Three checks, all scripted:

1. **Aliasing-energy metric** (extend `measure.mjs`, `--aliasing` mode): render the game overview
   at 8 sub-pixel camera offsets (+0, +½ px in x/y combinations), compute mean edge-gradient
   energy (Sobel on luma, top-decile edges) per frame, then the **variance across offsets**.
   Aliased content varies strongly with sub-pixel shifts; TAA-smoothed content does not. Pass:
   variance ≥ **30 % below** the same metric on the FXAA path (one-line toggle to A/B).
2. **Ghosting check**: script a 45° yaw sweep, settle 6 rendered frames, capture — grass/tree
   edges must show no double edges or trails (read the PNG; the sweep pattern is reproducible).
3. **Exposure neutrality**: the existing grey-card series within ±2 % of the FXAA baseline
   (round-6 methodology, unchanged).

**Capture-path note**: `screenshot.mjs` renders only 4 real frames after settle — with
first-frame acceptance the history converges in ~3 frames, so captures are valid; verify once by
comparing `--renderFrames 4` vs `--renderFrames 12` (must be visually identical).

**Quality tiers**: high = TAA (FXAA pass skipped); medium/low = FXAA unchanged; a
`setPipelineFlag('aa', 'fxaa'|'taa')` escape hatch for A/B and regression hunting.

## 2. Terrain detail normals (terrain)

**What**: two tiled **GPU-generated** detail normals (fractured rock; grass-ground micro-bump),
generated once via `ctx.textures.gpu` alongside the existing splat sources. In `material.js`'s
fragment shader, blend each by its biome splat weight, sample with the existing world-UV tiling,
fade to zero between **80 m and 220 m** (beyond that the macro noise already carries). No new
draws, no new geometry passes; fragment cost only.

**Why this one first**: the close preset at raking light (tod 8–9) shows flat shading on rock
faces — the single biggest "programmer art" tell at close camera angles, per the round-2 critic
screens.

**Verify**: `terrain` close preset at tod 8.5 and 14 before/after, read both; overview capture
diff must show changes **confined to the near field** (the fade holds); grey-card neutral;
SwiftShader renders it (harness compatibility — the generator runs on the same GLSL path).

## 3. Octahedral impostor bake (props)

**What**: replace the per-variant two-view billboard (side card + top crown card, the README's
documented gap: "every tree of a variant has the same outline from above") with one **octahedral
atlas** — 8×2 views around the equator plus pole fill — per geometry variant, keeping the existing
normal/AO bake idea (repacked into the same atlas set). LOD2 instanced quads sample the atlas by
view direction; the signed-x mirroring trick is kept per face-pair.

**Constraints**: same instanced-quad draw structure (draw calls unchanged); bake adds **≤ 1 s** to
`quality=high` load (measure — today's per-variant bakes set the baseline); atlas memory per
variant within ~2× today's cards (9 variants).

**Verify**: overview 14 h + 17 h and a 330 m mid view before/after, read — the horizon ring of
repeated cut-out silhouettes must break up; per-variant draw calls byte-identical; night preset
(rule 17: the atlas must sample the same normal/AO data — no emissive surprises at ×12 night
exposure).

## 4. Close-range density spend (props grass + animals LOD0)

**What** (spending the measured headroom, `quality=high` only):

* **grass**: a near-camera density ring — ×1.5 nominal density within ~90 m of the target, fading
  to today's density by ~180 m; still ≤ 3 draws (grass.js's own field budget), still re-packed on
  the 14 m threshold, still zero per-frame allocations.
* **animals**: LOD0 poly up for the species tours stop closest to (measured from the
  `sightings` flow: impala, zebra, giraffe, elephant, lion) — target ~1.5× current LOD0 tris per
  species, capped so the full-game overview frame stays **≤ 5 M tris** at high (measure before
  and after with `renderer.info`).

**Verify**: `animals` close/macro presets before/after, read (the round-2 macro shots set the
comparison bar: wrinkle field, leg anatomy must hold at the new density); frame `drawCalls` and
`triangles` from the capture JSON reported in the README table; real-GPU frame-ms spot check
(SwiftShader timing is not representative — rule 19).

## Harness (additive, one scenario)

`visual-quality` — one page load at `quality=high`: runs the aliasing-energy metric A/B (TAA vs
FXAA toggle) in-page, plus a non-vacuity term (the two paths must differ pixel-wise — a metric
that reads zero means the toggle is dead). `pass = taaVariance < 0.7 × fxaaVariance && diff > 0`;
JSON in `tools/shots`. Terrain/props/animals parts are screenshot-verified only — no new scenarios
(their effect is not stateful). Top-level async function, default list + dispatcher branch,
`tools/check-harness.mjs` green (rules 4–6).

## Unit tests

Node-testable surface is thin by design; what exists: the Halton jitter table is a frozen constant
(no test needed beyond lint), the octahedral encode/decode round-trip gets a **props-side node
test** (`src/modules/props/test.mjs` — new file, follows `simulation/test.mjs` conventions,
CI line added to the workflow only if the integrator confirms the runner list is extensible
without touching `.github/` — if not, the round-trip test lives in a pure helper imported by
`measure.mjs` and runs there; do not modify `.github/` from this wave).

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
