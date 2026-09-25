# effects — round 5 — score 8.0 / 10 — FAIL

Round 4's blocker and both majors are fixed, and this time I re-measured everything myself rather than
trusting either side's numbers: an in-page full-chain vs bypass A/B (same renderer, same frame, my own
luminance probe), a lamp-free-patch neutrality probe at night, and the module's own `measure()`/`stats()`
read back through `--eval`. The score is **not** claim-capped — every quantitative README claim I tested
reproduced. It stays below the bar on one weak must-deliver effect (heat haze) and the module's own
≤ 12-extra-draw spec line, now 14. All preset captures 1280×720 on the real GPU ("ANGLE (AMD, AMD Radeon
RX 5700 XT D3D11)", tools/gpu-check.mjs); A/B probes 960×540 via tools/screenshot.mjs. I read every PNG.

## Screenshots reviewed (path — what I saw, one line each)
- `tools/shots/fx-r5-overview-17_5.png` — golden-hour yard: warm filmic grade, ambient dust motes visible, GTAO grounding under crates/trees, subtle vignette; clean — no banding, no halo rings. World-edge + skyline visible at the top (carried framing nit).
- `tools/shots/fx-r5-off-17_5.png` — same camera, pipeline bypassed: flatter and cooler, no motes/vignette; **by eye the two frames are now the "subtle refinement" the README describes** — the round-4 "+34 % orange lift" is gone.
- `tools/shots/fx-r5-close-17.png` — dust puff drifting left of frame (soft, warm-lit), PBR spheres with genuinely distinct metal/paint/rock responses, contact shadows under plinths, campfire glow; the shared wrinkly bump motif on all spheres is unchanged (carried authoring nit).
- `tools/shots/fx-r5-close-6_5.png` (my extra angle, dawn) — grade holds character pre-dawn: warm rim light, dust readable, no post artefacts at a tod the builder never shot.
- `tools/shots/fx-r5-heat-13.png` — midday skyline with a faint wobble along the box bases/horizon band (the haze warp, just visible in a still); otherwise clean blue-sky image.
- `tools/shots/fx-r5-night-22.png` — **bloom halos on all lamp heads are round** (zoomed: soft circular falloff, no box corners); ground reads cool purple-grey and desaturated under warm lamp pools — the Purkinje night shift is working, no sepia; blacks not crushed; the streaky sky band at the top is environment's night clouds, reproduced here but not ours.
- `tools/shots/fx-r5-night-22_5.png` (my extra angle, 22.5 h) — identical character half an hour later; halos round, no artefacts.
- `tools/shots/fx-r5-calibrate-12.png` — grey card fills the frame for the A/B probes (a few ambient dust motes sparkle bottom-right — harmless).
- `tools/shots/fx-r5-overview-12.png` (my extra angle, noon) — chain stays invisible-as-chain at overhead sun: clean grade, correct contrast, no AA crawl.
- Eval JSONs (no PNG judgement intended): `fx-r5-ab-17_5/-22/-13`, `fx-r5-bare-17_5/-22/-13`, `fx-r5-measure`, `fx-r5-haze`, `fx-r5-close-slow-stats` — numbers below.

## Contract / errors / perf (table: preset, drawCalls, triangles, errors)
| shot | drawCalls | triangles | errors |
|---|---|---|---|
| overview 17.5 | 206 | 251,455 | [] |
| close 17 | 203 | 252,691 | [] |
| close 6.5 (extra) | 201 | 252,051 | [] |
| heat 13 | 174 | 212,865 | [] |
| night 22 | 215 | 260,427 | [] |
| night 22.5 (extra) | 215 | 260,427 | [] |
| off 17.5 | 192 | 235,058 | [] |
| overview 12 (extra) | 174 | 212,547 | [] |
| calibrate 12 | 18 | 16,425 | [] |

Zero console errors in all 18 captures; `modules.effects.status === 'ok'` everywhere; `update()` ≤ 0.2 ms.
`measure()` at overview 17.5 h: direct 192 → chain 206, **extra 14**, `failed: {}` — matches the README's
round-5 bloom-kernel number exactly. The spec's own "≤ 12 extra draw calls" line is therefore exceeded by
2 — disclosed in the README, and it is the exact spend round 4's critic recommended (13-tap Karis bloom),
but it is still a spec-line miss and I score it as such. `node tools/lint.mjs src/modules/effects` clean.
Contract: all README API functions exist; `dependencies: []` + optional environment truthful; round-4's
per-frame `setFrame({...})` object literal is now positional args (fixed, verified in `index.js`);
`stats().particles.alive` is now live (67 alive at heat, 203 at close `--slow` — round-4 bug fixed);
`dispose()` restores `setRenderFn(null)` and frees pipeline/particles/stage. Budget: **2 draws over the
module's own spec line (disclosed)**; inside all §7 soft caps. Errors: **pass**.

### My own neutrality measurements (the round-4 blocker, re-measured independently)
Method: within one live page, render+capture the frame mean (rec709-weighted bytes) with the full chain,
toggle, and capture again — same renderer by construction, no cross-page variables. 960×540.

| probe | 17.5 h | 13 h | 22 h |
|---|---|---|---|
| full chain / bypass, frame mean | 105.1 / 106.7 = **0.985** | 136.7 / 135.6 = **1.008** | 48.6 / 42.0 = **1.157** |
| bare chain (ao/bloom/haze/grade/vignette/grain/aa/particles off) / bypass, frame mean | **0.985** | **1.003** | 1.152 |
| bare chain / bypass, lamp-free ground patch only | **0.983** | **0.981** | **1.023** |

Reading: at golden hour and midday the full chain is within ±1.7 % of bypass — round 4 measured +34 % at
17.5 h; fixed and reproduced. The night frame-mean ratio of 1.16 is **bloom's lamp halos adding real
light on a lamp-filled frame**, not re-exposure: the lamp-free ground patch through the bare chain is
within +2.3 % of bypass. The builder's grey-card series (0.975–0.999 full/off across 9–21.5 h) is
consistent with my numbers; my content-patch probe widens the worst case to about ±2.3 % once MSAA
resolve and edge blending on real geometry are included — still neutral in the sense the claim intends,
and I could not break the night scotopic shift's luminance neutrality anywhere I probed.

## Ranked issues (most damaging first)

1. **[minor→major-in-effect] Heat haze is still effectively invisible as an image effect.** *Where:* `heat` 13 — strength confirmed 0.875 via eval, but the only visual trace in a still is a faint wobble along the skyline bases; a viewer cannot see the module's named midday effect without being told. *Why it matters:* the spec lists it as a must-deliver; reference (Planet Zoo, real footage) shows an obvious shimmering band over hot ground. *Fix:* scale warp amplitude with screen-space distance to the horizon and add a small luminance lift/desaturation inside the band so the effect survives a still; verify with a two-frame pixel diff image in the README.
2. **[minor] Pipeline is 14 extra draws vs the spec's ≤ 12.** *Where:* `measure()` output; disclosed in README. The 2 draws bought the round-bloom kernel round 4 demanded. *Fix:* either merge the FXAA pass into the grade pass's output (FXAA after grade is legal) or re-spec the line to ≤ 14; do not silently leave a spec contradiction in a module whose README is otherwise numerically exact.
3. **[minor] Carried showcase-authoring nits:** `overview` shows the world-plane edge and grey void along the top of frame; every sphere shares one wrinkly bump; the test yard costs ~190 of the ~206 frame draws (46–50 objects × CSM cascades). *Fix:* tilt/extend the ground skirt, vary bump scale per material, instance spheres/plinths — cosmetic to the metric the module is scored on, but it is the face the module shows critics.
4. **[minor] Grain (0.02) and SMAA remain visually unverified** — grain is sub-pixel at capture size and no shipped preset exercises SMAA; disclosed, unchanged from round 4. *Fix:* one SMAA-vs-FXAA A/B crop and one 400 % grain-strength debug shot would close both.
5. **[info, not scored down] `toneMapped:false` materials still tone-mapped by OutputPass** (animals' shadow decals, tools' overlays render slightly differently with the chain on/off). Disclosed; not visible in any shot I took. Re-mention only so it stays tracked.

## What is genuinely good
- The round-4 blocker is dead and stays dead under independent re-measurement: the bare chain is within ~±2 % of bypass on every probe I ran, and the full chain's only large deviation is bloom doing its job on lamp-filled frames. This was the project-wide calibration problem; it is fixed.
- Round bloom kernel verified visually: round halos everywhere, Karis-average firefly control, no box corners.
- The Purkinje night grade verified: cool desaturated ground, warm lamp accents, no sepia, blacks intact — matches the round-4 fix prescription exactly.
- Every quantitative claim I tested reproduced to the digit: extra 14, haze 0.875, per-preset draw/triangle tables, `getGrade()` values, particles alive counts.
- Character holds at tods the builder never shot (dawn close, deep-night 22.5, noon overview): the chain changes the image without stamping a "look" on it — the definition of a good post stack.

## Verdict
FAIL at **8.0** — pass-adjacent. Nothing is broken and nothing is claim-capped: the pipeline is neutral
(measured independently), cheap, stable, and visually invisible-as-chain, with round bloom and a correct
night grade. What holds it under 8.5 is that its one signature *visible* effect (heat haze) still cannot
be seen in any shipped still, and the module sits 2 draws over its own spec line with a README that is
otherwise numerically immaculate. Make the haze readable in a still (or honestly re-scope it) and settle
the 12-vs-14 line, and this passes on the next round.

## Proposed STATUS.json update
```json
{
  "effects": {
    "round": 5,
    "score": 8.0,
    "status": "fail",
    "errors": 0,
    "drawCalls": 215,
    "issues": [
      { "sev": "minor", "text": "Heat haze effectively invisible as an image effect: strength 0.875 confirmed but only a faint skyline wobble in any still (spec must-deliver). Needs distance-scaled amplitude + luminance lift in the band, verified with a frame-diff." },
      { "sev": "minor", "text": "Pipeline costs 14 extra draws vs the spec's own <=12 line (disclosed; the round-4-recommended bloom kernel spent them). Merge FXAA into the grade output or re-spec to <=14." },
      { "sev": "minor", "text": "Showcase authoring: world-edge/void at top of overview, identical wrinkly bump on every sphere, test yard costs ~190 of ~206 frame draws (instancing opportunity)." },
      { "sev": "minor", "text": "Grain and SMAA still not visually isolated (sub-pixel at capture size; no preset exercises SMAA) — disclosed, carried from round 4." },
      { "sev": "minor", "text": "toneMapped:false materials still tone-mapped by OutputPass (animals decals, tools overlays differ slightly chain-on/off) — disclosed, not visible in shots." }
    ],
    "good": "Round-4 blocker dead under independent re-measurement: in-page A/B gives full/bypass 0.985 (17.5h) and 1.008 (13h); bare-chain lamp-free night patch +2.3% — the night frame-mean 1.16 is bloom's lamp halos, not re-exposure. Round bloom halos verified round; Purkinje night grade verified cool. All quantitative claims reproduce to the digit (measure extra=14, haze 0.875, draw/tri tables, particles.alive now live). Chain holds character at untested tods (dawn, deep night, noon). 0 errors in 18 captures."
  }
}
```
