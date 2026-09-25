# animals — round 6 — score 7.5 / 10 — FAIL

All captures are my own, real GPU (`tools/gpu-check.mjs`, forced `--use-angle=d3d11`); every JSON's
gpu string reads `ANGLE (AMD, AMD Radeon RX 5700 XT … Direct3D11)`. 10 presets/angles at
1920×1080, seed 1, plus two 2–4× zoom crops and one live override probe. Every PNG was read.

## Screenshots reviewed (path — what I saw, one line each)
- `tools/shots/crit6-animals-overview-16.png` — mixed herds along the river at 230 m: giraffes now read unmistakably (orange, long necks), the elephant cluster is legible grey, the pale herd reads white-ish; legibility is clearly up from round 5's uniform specks, though small species still collapse.
- `tools/shots/crit6-animals-overview-9.png` (extra) — same scene at 9 h: giraffe/elephant/zebra groups separable; confirms the overview improvement is not tod-specific.
- `tools/shots/crit6-animals-species-15.png` — the 9 authored-species lineup at ~30 m: elephant (faceted grey, trunk/tusks), chibi hippo (blue-grey, open mouth), dark-brown chibi rhino, yellow maned lion, grey wildebeest-bull, dark buffalo-bull, **a pure WHITE HORSE where the zebra should be**, a tiny deer-like impala, and — off right — the genuinely excellent textured giraffe.
- `tools/shots/crit6-zoom-animals-species-lineup.png` (2× crop) — confirms: zebra model has zero stripes and reads 100 % horse; rhino proportions are chibi (tiny legs, round body); hippo reads better; lion mane legible.
- `tools/shots/crit6-zoom-animals-species-impala.png` (4× crop) — the impala (Quaternius Deer at height 1.0 incl. antlers) reads as a fawn: roughly half the size relative to the lion that real impala would be.
- `tools/shots/crit6-animals-species-9.png` (extra) — lineup at 9 h: same reads in morning light; hippo tint renders cold blue-grey; grass rows (props) strongly visible behind.
- `tools/shots/crit6-animals-herd-16.5.png` — zebra + wildebeest walking at eye level: a naturally spread mixed herd in mid-stride (Quaternius rigs genuinely articulate — leg poses vary per animal), but the "zebra" are unmistakably white horses at 34 m where real stripes would be obvious.
- `tools/shots/crit6-animals-waterhole-8.png` — three static grey elephants at a staged pool, two textured giraffes at right, white horses at the left shore; composition is genuinely staged-wildlife, but the pool is an opaque pale-blue slab — the brightest, most artificial thing in the frame — and the elephants are frozen mid-stance (no trunk/leg articulation).
- `tools/shots/crit6-animals-predators-17.5.png` — pride in golden-hour grass: the r5 overexposure is gone and the Poly Pizza lion reads as a lion (dark mane, tawny body); but the "cheetah walking past" is the old procedural model and reads as a pale greyhound; a second male overlaps a lioness's head.
- `tools/shots/crit6-animals-predators-8.png` (extra) — same at 8 h: pride legible in clean morning light; props' grass grid rows blatant in the foreground.
- `tools/shots/crit6-animals-close-15.png` — one elephant at 12 m: **regressed**. Round 5's best image (organic wrinkle hide, convincing pose) is replaced by the Poly Pizza static model: flat untextured grey, planar facets, stiff planted legs. Recognisable as an elephant, but the celebrated skin detail is gone and nothing about it moves.
- `tools/shots/crit6-animals-night-21_5.png` — moonlit and actually legible now (vs r5's near-black): hippos as dark masses near the shore, giraffe pair silhouetted left, pale herd mid-frame, river showing a soft moon sheen. The old "night is unlit black" gap is closed.
- `tools/shots/crit6-animals-elephant-fox-override.png` (probe) — `?animalModel=elephant:fox` renders the Khronos fox in place of the elephant, correctly scaled and grounded, 0 errors — the override path works end to end.

## Contract / errors / perf (table: preset, drawCalls, triangles, errors, animals updateMs)
| preset | drawCalls (frame) | triangles (frame) | errors | animals updateMs |
|---|---|---|---|---|
| overview (16 h) | 168 | 4,019,908 | [] | 2.3 |
| overview (9 h, extra) | 167 | 3,987,140 | [] | 2.1 |
| herd (16.5 h) | 138 | 3,593,086 | [] | 1.0 |
| waterhole (8 h) | 123 | 3,425,420 | [] | 0.8 |
| predators (17.5 h) | 117 | 3,462,099 | [] | 0.8 |
| predators (8 h, extra) | 115 | 3,396,563 | [] | 1.0 |
| close (15 h) | 55 | 3,149,174 | [] | 0.2 |
| night (21.5 h) | 93 | 3,265,380 | [] | 0.3 |
| species (15 h) | 185 | 3,282,147 | [] | 0.3 |
| species (9 h, extra) | 183 | 3,216,611 | [] | 0.3 |
| close + fox override (probe) | 55 | 3,147,014 | [] | — |

- Zero console errors on all 11 captures; `modules.animals.status === 'ok'` throughout; lint ok; lint clean on all four audited modules.
- **Round-5 blocker fixed: `update()` now measures 0.2–2.3 ms across every preset against its 3 ms budget** (r5 measured 4.18–5.0 ms). The catch-up cap fix plus core's warm-up-skipping metric hold up under independent re-measurement.
- Draw calls worst 185 (species) — inside the ≤200 module cap; frame triangles remain dominated by terrain/props' grass (established by round-5's `stats()` isolation), so the spec's "≤1.5 M at overview" still cannot be shown to fail *by this module alone*; the module's own contribution was not re-isolated this round.
- Contract: every README API function exists (`spawn/remove/clear/list/get/count/speciesInfo/allSpecies/getHappiness/setHabitatQualityFn/nearest/setState/addWaterPoint/waterPoints/herds/states/stats`); `dependencies: []` / `optional: ['terrain','zoning']` are truthful (zoning is the only module API touched); `dispose()` releases every pool, the bone textures, contact shadows and the group; `update()`'s hot loop is allocation-free (module-scope scratch vectors); asset loads go through `ctx.assets.gltf` only; every load failure path logs a warning and falls back (code-audited in `gltfpool.js`/`index.js` — `loadModel` never throws, `getPool` falls back on pool-construction failure; fallback not exercised live since all 9 files load); the interleaved-attribute de-interleave fix is confirmed working (hippo/rhino render, not NaN-invisible).

## Ranked issues (most damaging first)
1. **[major] The zebra is a stripe-less white horse and fails the §8 target in the module's flagship shots.** §8: "clearly recognisable species with correct silhouettes **and markings**". The Quaternius horse mesh has no UVs, so no stripes are possible — disclosed in the README — but the result is that `herd` (the preset that exists to show zebra) and `waterhole` read as *horses and cattle*. It costs points in exactly the criterion it fails: species recognisability via markings. Fix: pick a striped/UV-carrying equine-class CC0 model (or project a procedural stripe texture via a generated UV atlas / triplanar stripe shader), or ship the zebra on the procedural striped pool until one exists.
2. **[major] Giraffe, elephant and lion do not articulate, and the staging that depends on motion now lies.** Static one-bone rigs translate and turn only (disclosed). Consequences visible this round: elephants stand frozen at the waterhole with planted trunks; the predators "pride resting" stands; savannah's kopje pride (composed through this module's API) renders as three *maned males standing in a row* because the glTF pool has no female or rest variant while `variantFor()` still picks male/female for lions. The spec's animation deliverable (gaits, graze, drink, rest, blends) now only exists on the 3 procedural species. Fix: prioritise a rigged CC0 elephant/giraffe/lion (Quaternius-quality is enough), and until then make `variantFor()`/stage docs honest about the single maned male mesh.
3. **[major] The `close` hero shot regressed.** Round 5's strongest image — the 12 m procedural elephant with the organic `wrinkles()` hide — is replaced by a flat, untextured, faceted static mesh. The Poly Pizza giraffe kept its painted texture, so the elephant rendering bare grey is not inherent to static meshes; either its GLB material/texture is dropped on import (mergeGeometries keeps only material[0] per mesh — multi-material models lose everything after the first) or the model ships untextured. Not disclosed in the README's honest-gaps. Fix: investigate why the elephant materials come through untextured (the multi-material merge path is the prime suspect) before considering a different model.
4. **[minor] Procedural-species leftovers look bad next to the authored ones.** The predators cheetah reads as a pale hairless greyhound (procedural pool) standing beside a decent authored lion; the impala reads as a fawn (height 1.0 includes the deer's antlers, shrinking the body ~40 % vs a lion). Fix: set the impala's target height from body-top (~1.2–1.3 m) not antler-top, and either author a cheetah or keep it far from cameras.
5. **[minor] Gobkit hippo/rhino read as toys up close.** Chibi proportions (huge heads, stubby legs) plus a cold blue-grey hippo tint and near-black rhino tint. At overview/herd distances they pass; in the species lineup they are the weakest two of nine. Fix: raise tint warmth toward 0.45–0.55 grey-brown, or replace with realistic-proportioned models when available.
6. **[minor] The overview still cannot visually demonstrate "all 12 species"** (giraffe/elephant/pale-herd legible; small species collapse to specks) — much improved from r5's indistinguishable blobs, but the claim remains only partially verifiable. Fix: a slightly lower/far-closer overview pitch, or accept and reword.
7. **[minor, disclosed] README preset-table wording now over-promises for static species** ("lion pride resting/sleeping", savannah-composer rows in the same vein). The authored-models section of the same README discloses the limitation, so I am not applying the unreproduced-claim cap here — but the preset table should be reworded to what a still frame can show.

## What is genuinely good
- The asset pipeline itself is excellent engineering: 9 of 12 species on authored rigged/static glTFs through `ctx.assets`, baked-clip instanced skinning at one draw call per species, graceful per-species fallback, and the README's real-GPU performance table reproduces **to the last digit** on all six rows I re-measured (55/138/123/117/185/168 draws; triangles identical too).
- The round-5 performance blocker is genuinely gone (0.2–2.3 ms vs 4.2–5.0 ms), and night went from unlit-black to a legible moonlit scene.
- The giraffe is a genuinely good animal at every distance — correct proportions, real reticulated texture, instantly readable at 230 m in overview; the single best creature in the project.
- `predators` went from pale blobs to an actual pride with legible manes; the mixed-herd `herd` staging spreads naturally now; the fox override probe proves the whole load/bake/fallback chain live.

## Verdict
FAIL at 7.5 — up from 7.0. The engineering pass (assets, perf, night legibility) is real and verified, and several species now genuinely read. But a wildlife module whose flagship herd species has no stripes, whose three largest species cannot move, and whose best close-up regressed to an untextured statue does not meet "clearly recognisable species with correct silhouettes and markings" well enough for the 8.5 bar. Pass is reachable: fix the zebra markings, get one rigged large herbivore/carnivore swap-in parity, and restore the elephant's skin or its texture.

```json
{
  "animals": {
    "score": 7.5,
    "round": 6,
    "status": "fail",
    "errors": 0,
    "drawCalls": 185,
    "issues": [
      { "sev": "major", "text": "Authored zebra is a stripe-less white horse (mesh has no UVs) — fails the §8 'correct silhouettes and markings' target in the herd/waterhole flagship shots; reads as horse at any distance. Needs a UV-carrying equine-class model or a projected stripe treatment, else revert zebra to the procedural striped pool." },
      { "sev": "major", "text": "Giraffe/elephant/lion are static one-bone rigs: no walk/graze/rest articulation; the predators 'resting pride' stands, waterhole elephants freeze mid-drink, and the glTF pool's single maned male mesh renders the whole lion pride as males (variantFor ignored for glTF pools)." },
      { "sev": "major", "text": "close preset (12 m hero) regressed: the organic-wrinkle procedural elephant was replaced by a flat untextured faceted static model; the giraffe keeps its texture so the elephant's bare grey points at the multi-material merge path (material[0] only) — undisclosed in Known gaps." },
      { "sev": "minor", "text": "Procedural cheetah reads as a pale greyhound next to the authored lion (predators); impala scaled from antler-top height 1.0 reads ~40% too small (fawn) vs the lion." },
      { "sev": "minor", "text": "Gobkit hippo/rhino read as chibi toys up close; hippo tint renders cold blue-grey, rhino near-black chocolate." },
      { "sev": "minor", "text": "Overview at 230 m still cannot visually demonstrate the 'all 12 species' claim (giraffe/elephant/pale herd legible; small species collapse) — improved from round 5's uniform specks." },
      { "sev": "minor", "text": "README preset-table wording over-promises for static species ('lion pride resting/sleeping'); disclosed in the same README's authored-models section, so no claim cap applied — reword the rows." }
    ],
    "good": "Round-5 update-budget blocker fixed and re-measured (0.2-2.3 ms vs 3 ms budget; was 4.2-5.0). Asset pipeline verified end to end: 9 authored species load, README's real-GPU draws/tris table reproduces to the digit on all six rows, ?animalModel=elephant:fox override works live, gobkit de-interleave fix confirmed (hippo/rhino visible), per-species procedural fallback intact in code. Night is legible moonlight (was unlit black); predators now reads as lions; the giraffe is genuinely excellent at every distance; herd staging spreads naturally with real leg articulation on rigged species."
  }
}
```
