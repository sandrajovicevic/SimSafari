# Game round 8 — blind visual test (2026-09-26, real GPU) — blind critic

Real-GPU recapture of the round-7 blind protocol, tasked by
`docs/requests/zcode-night-recapture.md` to decide whether round 7's night "blackout"
(`overview-21.5` 3.0 / `close-21.5` 2.5, SwiftShader) is a backend artefact or a real
regression. Every image in this round was freshly captured, read and scored in this session;
none of the previous rounds' numbers were reused. Head commit verified at session start:
`f62dda7` (`claude/gifted-pascal-l0as60` — the request doc lives on this branch; PR #6 is not
merged to main yet, but `docs/specs/p1-food-web.md` is present, satisfying the request's
merge-marker check).

## Protocol

* **Capture backend: real GPU, ANGLE D3D11** via `tools/gpu-check.mjs` (same launch flags as
  round 6: `--use-angle=d3d11 --use-gl=angle --ignore-gpu-blocklist --enable-webgl
  --disable-gpu-sandbox --no-sandbox --autoplay-policy=no-user-gesture-required`). All 10
  real-GPU captures report `gpu = "ANGLE (AMD, AMD Radeon RX 5700 XT (0x0000731F) Direct3D11
  vs_5_0 ps_5_0, D3D11)"` — the real adapter, same card as round 6. No capture said
  SwiftShader; none had to be discarded.
* **Authored assets verified real before capturing** (round 7 scored 100 % procedural
  fallbacks over this): `head -c 4 public/assets/models/polypizza/Lion.glb` → `glTF`; every
  LFS-tracked file under `public/assets/**` checked — zero `version …` pointer stubs remain.
  Confirmed at runtime: unlike round 7's 17 asset-fallback warnings, this round's captures log
  **zero asset-load warnings** (only pre-existing dependency-cycle notices and two benign
  shader-compiler infos), i.e. the authored GLBs and polyhaven textures actually loaded and
  this is the first blind round whose images exercise the authored-asset pipeline
  (ARCHITECTURE §8). Visible in the art: the close waterhole elephant has wrinkled skin, the
  zebras are striped, the kopje lions carry real manes.
* Game subject (park demo), `quality=high seed=1`, 1920×1080, 40-frame settle, one page at a
  time, live dev server at `http://127.0.0.1:5173`, clock pinned with explicit `&speed=0`
  (verified per-JSON: `{"hour":<tod>,"speed":0,"paused":true}`): `overview` × tod 8 / 14 /
  21.5, `close` × tod 14 / 21.5. **No DOM composite this round** — the round-8 tasking omits
  it, so the game subset is the 5 canvas shots; for Δ-vs-round-6 comparability the round-6
  canvas-only mean (7.3, excluding its 8.5 DOM image) is quoted alongside the official 7.5.
* Savannah subject (`--module savannah`, each preset at its own staged tod, 1920×1080):
  `hero` (17.4), `waterhole` (8), `kopje` (17.8), `night` (22) — the subset-mean four — plus
  `overview` (16.5) as the comparability anchor (scored, **not** in the mean).
* **SwiftShader control (the round-8 addition):** the same two night game shots re-captured on
  SwiftShader *on this same checkout and machine* via `node tools/screenshot.mjs --game
  --preset overview|close --tod 21.5` (tool pins `--use-angle=swiftshader
  --enable-unsafe-swiftshader`; JSON confirms `ANGLE (Google, Vulkan 1.3.0 (SwiftShader …))`).
  Machine note: the tool's 90 s default ready-timeout is too short for software GL here (two
  `ready=false` failures at 90 s); both shots succeeded with `--timeout 300000`, same flags
  otherwise.
* Zero console errors on all 12 captures (`errors: []`); every module `status: "ok"` in every
  capture. Each image scored 0–10 on visible merit against the CLAUDE.md anchors only, as if
  the project had never been seen; no README/STATUS claims read before scoring. Every PNG was
  read in this session (plus gain-staged crops of the two night frames to check what is
  merely dark vs actually absent).

## Night backend comparison (the question this round exists to answer)

Mean frame luminance (0–255, Rec.601 luma over all 1920×1080 pixels, measured from the PNGs
with a purpose-written decoder; sanity-checked against the day shots at 81–106):

| shot | backend | score | mean luminance | what is legible |
|---|---|---|---|---|
| game overview 21.5 | **real GPU** | **6.5** | **13.1** | Escarpment gullies, river with both bridges, both pans, lodge roofs, the lamp string and its orange floodlight all identify; the ground between features is murk. |
| game close 21.5 | **real GPU** | **6.0** | **8.9** | The moonlit upper band reads (hut, herd shapes, acacia silhouettes, kopje, escarpment); the lower half is a black canopy mass with nothing legible in it. |
| game overview 21.5 | SwiftShader | 6.5 | 16.7 | The same park anatomy — escarpment, river/bridges, pans, lodge light-string — is equally legible, in fact measurably *brighter* than the real-GPU frame. |
| game close 21.5 | SwiftShader | 6.0 | 11.1 | Same as real GPU: moonlit midground band legible, lower half black; the two backends are visually interchangeable here. |

**Verdict on the round-7 blackout:** it is **not reproducible on this checkout on either
backend** — the SwiftShader control disproves the "SwiftShader artefact" reading just as the
real-GPU shots disprove a code regression. Three facts pin the attribution: (1) the
night-render code did not change between round 7's `2277f8d` and this `f62dda7`
(`git diff --stat 2277f8d..f62dda7 -- src/modules/environment src/modules/effects` is empty);
(2) on this checkout, real GPU and SwiftShader night frames are near-identical in content and
legibility (SwiftShader nominally 28–56 % *brighter* by mean luminance); (3) the one
environmental variable round 7 had and this round does not is its 100 % procedural-fallback
content — all 8 authored animal GLBs and 3 authored terrain textures were LFS pointer stubs
there and load for real here. The round-7 blackout is therefore an **asset/checkout artefact
(procedural fallback content under moonlight), not a backend artefact and not a build
regression**. Under the request's decision rule the operative outcome is the same: **the
real-GPU night shots are legible (6.5 / 6.0, both ≥ 6) → no night-exposure change; no
exposure pass is opened.** The residual night floor (black canopy wall at `close`, black
grass wall at `sav-night`) is the *pre-existing round-6 finding*, unchanged — dark-but-legible
on both backends, exactly as round 6 described and as the integrator's own STATUS note
predicted. One caveat kept honest: round 7 ran on a Linux container and this control runs on
the Windows machine, so "same backend" is same renderer, not same machine — but it is the
strongest attribution available, and it agrees with the integrator's independent re-shot.

## Game subject (park demo) — per-image scores

| shot (tools/shots/) | tod | r6 (real GPU) | r8 (this round) | Δ | notes |
|---|---|---|---|---|---|
| blind8-game-overview-8.png | 8h | 8.0 | **8.0** | 0 | Coherent whole-park morning: river with two bridges, escarpment with long plausible shadow, both pans, lodge complex, road network, no world-edge cut. The gallery corridor reads brushier than round 6 (the P1 plant layer's finer mottle helps). Morning haze slightly stronger; distant canopies still soft olive blobs; plains mottle a touch airbrushed. |
| blind8-game-overview-14.png | 14h | 8.0 | **8.0** | 0 | Crisp midday: gallery corridor, kopjes, buildings, bridge crossings and vehicles near the lodge all read; water dark and clean. Same two tells as round 6: lollipop-blob distant canopies and a large vague mottled patch lower-centre (denser now — the plant layer's dry-brush stamp). |
| blind8-game-overview-21_5.png | 21.5h | 7.0 | **6.5** | −0.5 | Dark but legible — the round-7 blackout is gone: escarpment, river, both pans, lodge roofs, lamp string + orange floodlight all identify (verified again on a 5× gain crop). Held 0.5 below round 6 because at native exposure the lamp pools are fainter and more of the ground plane is pure murk; the evenly-spaced light string still reads mechanical. |
| blind8-game-close-14.png | 14h | 7.5 | **7.5** | 0 | Correct mesh acacias, hide structure with a small herd near it, kopjes, soft consistent tree shadows. The worm-like scribble mottle across the midground slope persists unchanged — the same close-LOD texture tell rounds 6/7 found. |
| blind8-game-close-21_5.png | 21.5h | 6.0 | **6.0** | 0 | Same failure mode as round 6, now confirmed asset-independent: the fixed camera (~66 m up inside a tree cluster) makes a near-black self-shadowed canopy mass own the lower half; the moonlit band above it genuinely reads (hut, herd, kopje, escarpment — verified on a 6× gain crop). |

**Game subset average (5 canvas shots): (8.0 + 8.0 + 6.5 + 7.5 + 6.0) / 5 = 7.20 →
`game.blindVisual = 7.2`** (round 6 official 6-image mean incl. DOM: 7.5; round-6 canvas-only
comparable mean: 7.3 · round 3: 6.9 · round 4: 7.8 · round 5: 6.8 · round 7 [SwiftShader,
not comparable]: 6.0).

**Budget note:** draw calls 336–408 per game shot (≤1500 budget); triangles 4.55–4.63 M on
`overview`, **5.83–5.86 M on `close`** — under the ≤6 M reference but the tightest margin yet
(round 6 close: 4.99–5.03 M); the P1 plant layer's growth should be watched before the next
close-preset content addition. Zero console errors on all shots.

## Savannah subject — per-image scores (reported, not part of `game.blindVisual`)

| shot (tools/shots/) | r6 | r8 (this round) | Δ | notes |
|---|---|---|---|---|
| blind8-sav-hero.png (17.4h) | 8.0 | **8.0** | 0 | Golden-hour vista with streaked sky, glinting river behind the gallery, hazy escarpment, ostrich at the right-hand pool. The mid-frame herd now reads as individual dark bodies (round 7's blurred-mass problem does not recur), and giraffe shapes stand at the right treeline. Nits: escarpment nearly erased by haze, repetitive gallery umbrella row, uniform foreground grass wall. |
| blind8-sav-waterhole.png (8h) | 8.0 | **8.0** | 0 | Strongest pure-content image, and the authored assets visibly lift it: the close elephant has genuinely wrinkled skin (no longer the round-6/7 rubbery procedural), a second tusked elephant at the left shore, striped zebras at the right shore, giraffe through the acacia. Still 8.0 not 8.5: the pan surface is flat grey-blue with no depth cue and the framing canopy is a flat leaf-card cluster. |
| blind8-sav-kopje.png (17.8h) | 7.5 | **7.0** | −0.5 | The pride is unmissable — three males, centre one full-body, real manes on the authored lions. Held down by the same two finds as round 6/7 plus one: flat bright-cream body shading in direct low sun reads plasticky; the whole frame sits in one monochrome red-brown wash; the foreground grass reads as sparse dark twigs on bare ground (worse than the hero's sward). |
| blind8-sav-night.png (22h) | 6.5 | **6.5** | 0 | Correct and now partly legible night: starfield even and clean — **round 7's sky-bloom artifact does not reproduce on either backend** (it was a SwiftShader-content artefact like the blackout); kopje moonlit on its left faces; an elephant clearly silhouetted at the left shore; the preset's two anchor hippos identify by pale snouts + eye-shine (round 6: "barely identifiable"); giraffes in the right grass. Bottom 40 % is still a black grass wall. |
| blind8-sav-overview.png (16.5h) — extra anchor, not in subset | 7.5 | **7.0** | −0.5 | Coherent staged geography (river, pan, gallery, kopjes, escarpment) but hazier and lower-contrast than the game overview; the dead-straight diagonal track still ignores every contour; the P1 dry-brush patch centre-bottom reads as a uniform yellow stipple — a new, mild artificiality at this distance. |

**Savannah subset average (hero, waterhole, kopje, night): (8.0 + 8.0 + 7.0 + 6.5) / 4 = 7.375 →
7.4** (round 3: 7.0 · round 4: 7.9 · round 5: 7.0 · round 6: 7.5 · round 7 [SwiftShader]: 6.8).

## Top 5 open visual issues (ranked, most damaging first)

1. **Night legibility floor at ground-level cameras — unchanged since round 6 and now proven
   asset- and backend-independent.** `close-21.5` (6.0) loses its lower half to a near-black
   self-shadowed canopy mass (fixed camera inside a tree cluster); `sav-night` (6.5) loses its
   bottom 40 % to a black grass wall. Content behind the darkness exists (gain-crops show hut,
   herd, hippos all modelled correctly) — this is an exposure-floor problem for near-field
   geometry under moonlight, and it is now the *only* thing holding both night shots at 6.x.
   A moon/ambient-aware exposure floor remains the highest-value visual fix.
2. **Distant tree canopies are still flat olive blob/disc impostors** across
   `overview-8/14` (8.0 each), the savannah `overview` anchor (7.0) and `sav-hero`'s gallery
   row — hundreds per frame, unchanged through three rounds; the ceiling on every
   wide daytime shot.
3. **Close-range grass worm/scribble mottle persists** (`close-14`, 7.5): identical to rounds
   6/7 at the same LOD; overview distances stay clean. Four consecutive blind rounds have now
   recorded it at close range on both backends.
4. **Golden-hour hero shading still plasticky in the monochrome red-brown wash** (`sav-kopje`,
   7.0, −0.5 this round): authored lions with real manes still shade as flat bright cream in
   direct low sun; the waterhole surface (8.0) remains milky-flat. One material/BRDF step from
   8.5, as first flagged in round 6.
5. **`close`-preset triangle count is at 5.83–5.86 M vs the ≤6 M reference** — under budget,
   but up ~0.8 M over round 6 with the P1 plant layer, the tightest margin recorded. New minor:
   the plant layer's dry-brush stamp reads as a uniform stipple patch in wide shots
   (`sav-overview` 7.0). *(Carried, unverified, outside this protocol: the round-5
   camera-anchor mis-targeting majors.)*

## Best / worst

* **Best: `tools/shots/blind8-sav-waterhole.png` (8.0)** — authored elephant skin, zebras,
  giraffe and kopje in one coherent waterhole; the first blind round where the authored-asset
  pipeline visibly pays off. `blind8-sav-hero.png` (8.0) matches it on landscape.
* **Worst: `tools/shots/blind8-game-close-21_5.png` (6.0)** — half a black canopy wall, shared
  with `blind8-sav-night.png` (6.5); both legible in their moonlit bands, both capped by the
  exposure floor.

## Verdict vs history

`game.blindVisual`: 6.9 → 7.8 → 6.8 → 7.5 → 6.0 [SwiftShader, round 7] → **7.2** (real GPU;
canvas-only; round 6 canvas-only comparable: 7.3). `savannahSubset`: … → 7.5 → 6.8 → **7.4**.
Against its correct baseline (round 6, same machine, same backend, near-same protocol) this
round is flat: four of five game shots Δ 0.0, `overview-21.5` −0.5 on honest exposure
darkness, savannah −0.1 net. The round-7 collapse is fully explained and closed: its blackout
reproduces on neither backend once the authored assets load (its own night-render code is
byte-identical), its sky-bloom artifact is absent on both backends here, and its −1.0/−1.5
daytime deltas were the fallback-content penalty this round no longer pays — the authored
assets are now visibly in-frame. The build's honest ceiling remains where round 6 put it:
**7.2 / 10**, set by the night exposure floor (issue 1), blob-tree impostors (issue 2), the
close-range grass mottle (issue 3) and flat golden-hour hero shading (issue 4). No
night-exposure pass is warranted; the next visual win is the near-field moonlight floor.

```json
{
  "blindVisual": 7.2,
  "savannahSubset": 7.4,
  "round": 8,
  "backend": "real GPU (ANGLE D3D11, AMD Radeon RX 5700 XT) + same-checkout SwiftShader control on the two night game shots",
  "head": "f62dda7",
  "nightDecision": "round-7 blackout NOT a SwiftShader artefact and NOT a code regression: night-render code identical 2277f8d..f62dda7, both backends legible on this checkout (real GPU 6.5/6.0, SwiftShader 6.5/6.0), luminance real GPU 13.1/8.9 vs SwiftShader 16.7/11.1 -- cause was round 7's 100% procedural fallback content (LFS stubs). No night-exposure change; no exposure pass opened.",
  "issues": [
    { "sev": "major", "text": "Night legibility floor at ground-level cameras is unchanged since round 6 and now proven asset- and backend-independent: close-21.5 = 6.0 (lower half a near-black self-shadowed canopy mass from the fixed camera inside a tree cluster), sav-night = 6.5 (bottom 40% a black grass wall). Gain-crops prove the content exists (hut, herd, hippos); it is purely an exposure-floor problem for near-field geometry under moonlight and is now the only thing holding both night shots at 6.x. Highest-value fix remains a moon/ambient-aware near-field exposure floor." },
    { "sev": "medium", "text": "Distant tree canopies are flat olive blob/disc impostors with no internal texture or shading variation, unchanged through three rounds, in overview-8/14 (8.0 each), sav-overview anchor (7.0) and sav-hero's gallery row -- the ceiling on every wide daytime shot." },
    { "sev": "medium", "text": "Close-range grass worm/scribble mottle persists identically (close-14 = 7.5), fourth consecutive blind round recording it at the same close LOD on both backends; overview distances clean." },
    { "sev": "medium", "text": "Golden-hour hero shading still plasticky in the monochrome red-brown wash (sav-kopje = 7.0, down 0.5): authored lions with real manes shade as flat bright cream in direct low sun; waterhole surface milky-flat (sav-waterhole held at 8.0 despite authored-asset gains). One material/BRDF step from 8.5." },
    { "sev": "minor", "text": "close-preset triangles 5.83-5.86M vs <=6M reference -- under budget but up ~0.8M over round 6 with the P1 plant layer, tightest margin recorded. New minor: the plant layer's dry-brush stamp reads as a uniform yellow stipple patch in wide shots (sav-overview = 7.0). SwiftShader captures needed --timeout 300000 on this machine (90s default too slow for software GL); no impact on output. Round-5 camera-anchor mis-targeting majors remain carried/unverified (outside this protocol)." }
  ]
}
```
