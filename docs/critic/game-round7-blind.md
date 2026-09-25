# Game round 7 — blind visual test (2026-09-25) — blind critic

Independent re-run of the round-3/5/6 protocol. Every image in this round was freshly captured,
read and scored in this session; none of the previous rounds' numbers were reused. Head commit
verified at session start: `2277f8d` (required minimum), fetched fresh from `origin/main`.

## Protocol

* **Capture backend: SwiftShader software GL**, confirmed per-shot via each capture's JSON `gpu`
  field: `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader
  driver)`. **This round is comparable with round 5 (also SwiftShader), NOT with round 6 (real
  GPU, ANGLE D3D11 on a Radeon RX 5700 XT).** Round-over-round deltas below are given against
  round 5 only, shot-for-shot, same backend.
* Game subject (the park demo the live game boots into), `quality=high seed=1`, 1920×1080,
  default settle, one page at a time, live dev server at `http://127.0.0.1:5173`: `overview` ×
  tod 8 / 14 / 21.5, `close` × tod 14 / 21.5 — the same 5 canvas shots as rounds 3/5/6 — plus one
  UI composite (`--dom`) at `overview` tod 14. `--game` pinned the clock (`&speed=0`)
  automatically. All 6 captures succeeded on the first try; no retries were needed.
* Savannah subject (staged wild savannah, `--module savannah`, each preset at its own staged
  tod, 1920×1080): `hero`, `waterhole`, `kopje`, `night` — the subset-mean four, per this round's
  tasking with `hero` taking the wide slot — plus `overview` captured as an extra comparability
  anchor to round 5 (scored below but **not** in the subset mean). All 5 succeeded on the first
  try.
* Each image scored 0–10 on visible merit against the CLAUDE.md anchors only (10 indistinguishable
  from reference · 8.5 AAA with nits · 7 good indie · 5 programmer art · 0 broken), as if the
  project had never been seen. No module READMEs or `docs/STATUS.json` claims were read before
  scoring, per the blind-test brief.
* **Environment caveat, discovered while checking each capture's JSON `warnings` array (not
  visible in the PNGs themselves, so it does not change the per-image visual scores, but it
  changes what those scores mean):** every one of the 11 captures logs the identical 17
  asset-load warnings — all 8 authored animal models (`Hippo.glb`, `Rhino.glb`, `Zebra.glb`,
  `Bull.glb`, `Deer.glb`, `Giraffe.glb`, `Elephant.glb`, `Lion.glb`) and 3 of the authored
  `polyhaven` terrain textures (`withered_grass`, `dry_ground_rocks`, `rock_boulder_dry`, one
  each diffuse/normal/roughness) fail to load and fall back to their procedural equivalents.
  Checked directly: `public/assets/models/polypizza/Lion.glb` and the three named
  `public/assets/textures/polyhaven/*` texture files are each 131–132 bytes of Git LFS pointer
  text (`version https://git-lfs.github.com/spec/v1 ...`), not real binary assets — `git lfs` is
  not installed in this container, so every LFS-tracked file under `public/assets/**` (per
  `.gitattributes`) checked out as an unresolved pointer stub. This is a checkout/environment gap,
  not a code defect — the fallback path worked exactly as CLAUDE.md requires (zero errors, every
  module still `ok`) — but it means **every animal in every one of this round's 11 screenshots is
  the procedural fallback shape, not the authored asset**, and this round cannot speak to the
  authored-asset pipeline at all. (For contrast: a second texture set at
  `public/assets/textures/polyhaven-via-habitta/*` checked out as real JPEG bytes and loaded
  fine — only the LFS-tracked assets are affected.)
* Zero console errors on all 11 shots (`errors: []`); every module reports `status: "ok"` in
  every capture's `modules` block.

## Game subject (park demo) — per-image scores

| shot (tools/shots/) | tod | r5 (SwiftShader) | r7 (this round) | Δ | notes |
|---|---|---|---|---|---|
| game-overview-8.png | 8h | 8.0 | **7.0** | −1.0 | Coherent whole-park read: river with two bridges, escarpment with shadow, kopjes, lodge complex, road network, no world-edge cut. But distant tree canopies render as flat, textureless, solid dark-green **circular discs** — hundreds of them, dominating the mid-ground — a cruder "lollipop" impostor than prior rounds credited as a minor tell. Plains mottle patches read slightly airbrushed. |
| game-overview-14.png | 14h | 8.0 | **7.5** | −0.5 | Same composition at midday, crisper light; escarpment, gallery corridor, buildings all read. Same flat-disc tree-canopy problem as the 8h shot, equally dominant. |
| game-overview-21_5.png | 21.5h | 3.5 | **3.0** | −0.5 | **Regression, opposite failure mode from round 5.** Round 5 was a blown-out white water fill; this shot is the other extreme — near-total blackout. Almost nothing of the park layout is legible: no readable river/pan shapes, no escarpment modelling, just one small orange light plus a short line of white dots (a vehicle and tent lights) in the lower-left corner. Worse than round 6's real-GPU 7.0 in a different way (this SwiftShader shot has no visible "warm lamp pools... anchor the park layout" at all). |
| game-close-14.png | 14h | 8.0 | **7.5** | −0.5 | Correct acacia silhouettes (real mesh geometry at this range, not disc impostors), legible zebra herd, hide structure, kopje rock partially visible. Grass shows the same worm-like dark scribble mottle across the midground previously flagged in round 6 — confirmed again here on SwiftShader. |
| game-close-21_5.png | 21.5h | 5.0 | **2.5** | −2.5 | **The single worst regression in this round.** Round 5's self-shadowed-canopy problem is gone, but so is everything else: the frame is almost pure black, with only a tight cluster of small white dots (eye-shine on an animal group) and a hut silhouette barely visible. No terrain, no kopje, no herd shapes read at all — this fails "overview/close at night should still show *something*" more completely than either round 5 (over-bright) or round 6 (murky but legible). |
| game-overview-14-dom.png (full-page UI composite) | 14h | 8.5 | **8.5** | 0 | Full HUD legible over the live canvas: "Serengeti Ridge", $250,000, +$0/day, visitor count, 2.5/5 star rating, Day 1 / Dry Season, 14:00 clock with pause control, 28° Clear weather, minimap correctly mirroring the river/road/park layout, bottom toolbar with 6 hotkeyed tools. No sparkle underneath. Best image of the round, matches round 5/6 exactly. |

**Game subset average: (7.0 + 7.5 + 3.0 + 7.5 + 2.5 + 8.5) / 6 = 6.00 → `game.blindVisual = 6.0`**
(round 3: 6.9 · round 4: 7.8 · round 5: 6.8 · round 6 [real GPU, not comparable]: 7.5).

**Budget note**: draw calls 312–350 per shot (well under the ≤1500 project budget); triangles
4.49–5.27 M, under the ≤6 M reference used in rounds 5/6 for `close` presets. Zero console errors
on all 6 game shots.

## Savannah subject — per-image scores (reported, not part of `game.blindVisual`)

| shot (tools/shots/) | r5 | r7 (this round) | Δ | notes |
|---|---|---|---|---|
| savannah-hero-auto.png | — (no r5 anchor; round 5 used `overview` not `hero`) | **7.0** | — | Genuine golden-hour-adjacent vista: streaked clouds, hazy escarpment with a few skyline trees, river with a footbridge, legible waterhole edge. The zebra/wildebeest herd mid-frame reads as an indistinct blurred mass rather than individual bodies at a distance where round 6's equivalent shot described a "legible wildebeest herd" — here the herd cluster is genuinely hard to parse into individual animals. Foreground grass is a flat uniform brown blanket with no blade detail at this distance. |
| savannah-waterhole-auto.png | 8.0 | **7.5** | −0.5 | Still the strongest pure-content image: elephants at the pan (one close, one distant), zebras and a giraffe's legs at the far shore, kopje backdrop, individually-modelled foreground grass blades (better than the hero shot). The close elephant's anatomy reads a bit rubbery/simplified (thin legs, odd ear angle) and the water surface is flat and milky with no depth cue, consistent with round 6's finding. |
| savannah-kopje-auto.png | 8.0 | **7.0** | −1.0 | Sunset frame in one monochrome red-brown wash, as round 6 also found. Two lion shapes legible (one with a visible mane/ruff), flat cream-tan shading in the low sun reads plasticky, consistent with round 6's material-fidelity finding. Grass blade geometry in the foreground is a genuine strength here. |
| savannah-night-auto.png | 4.0 | **5.5** | +1.5 | The round-5 uniform-bright-pan bug stays fixed: the water reads dark, hippos are visible as pale shapes in the pan, elephants at the shoreline. But a **new defect**: a large, unnaturally soft, cluster-shaped bloom of "stars" fills much of the upper-left sky (with a smaller matching blob upper-right) — this reads as a bokeh/particle-sprite rendering bug, not a starfield or the moon, and is quite distracting. The bottom half of the frame is still a near-black grass wall, same legibility floor round 6 flagged. |
| savannah-overview-auto.png (16.5h) — extra anchor, not in subset | 8.0 | **7.0** | −1.0 | Coherent composed geography: river, gallery trees, two waterholes, kopje, escarpment. Same flat-disc tree-canopy impostor problem as the game's overview shots. A dead-straight diagonal road cuts through the organic terrain without following any contour — reads unnatural against the winding river next to it. Hazy/low-contrast, consistent with round 6's note that this preset looks flatter than the game's own overview. |

**Savannah subset average (hero, waterhole, kopje, night): (7.0 + 7.5 + 7.0 + 5.5) / 4 = 6.75 →
`savannahSubset = 6.8`** (round 5: 7.0; round 6 [real GPU]: 7.5).

## Top 5 open visual issues (ranked, most damaging first)

1. **Night-time ground-level legibility has regressed to near-total blackout, a new failure mode
   distinct from both prior rounds' night problems.** `game-overview-21.5` (3.0) and
   `game-close-21.5` (2.5) are the two lowest scores in this round: round 5's fix target was an
   over-bright blown-out water fill, and round 6 (real GPU) showed a murky-but-readable night
   with visible lamp pools and moonlit midground. This round's SwiftShader captures show neither
   — both are almost pure black frames with only a tiny fragment of light (a vehicle light, an
   eye-shine cluster) visible. Whatever exposure/ambient-floor tuning happened since round 6
   appears to have overcorrected on this backend specifically; this needs verifying against a
   real-GPU capture to see if it's backend-specific or a genuine regression.
2. **Every authored animal model and three authored terrain textures are inert in this checkout
   (LFS pointer stubs, not binaries) — this round scores 100% procedural fallback content,
   nothing from the authored-asset pipeline ARCHITECTURE §8 was actually exercised.** Not a code
   defect (the fallback worked correctly, zero errors), but it means none of this round's scores
   reflect whatever visual improvement the authored assets were meant to deliver, and the next
   round should re-run once `git lfs pull` (or equivalent) has been confirmed to populate
   `public/assets/**` with real files before scoring animals again.
3. **Distant tree canopies render as flat, solid-colour circular discs with no internal texture
   or shading variation** — visible in all three game `overview` shots and the savannah
   `overview` anchor, hundreds of instances per frame. Previously logged (round 6) as a minor
   "lollipop-tree" tell at overview distance; a fresh, uncontextualized look this round finds it
   considerably more damaging to overview-shot scores than that framing suggested.
4. **New: a large, soft, cluster-shaped bloom artifact in `savannah-night`'s sky**, upper-left
   (and a smaller matching one upper-right) — reads as an oversized dust/bokeh sprite or a
   malfunctioning moon halo, not a starfield, and is distracting enough to cap what is otherwise
   the round's most-improved shot (the water-brightness fix from round 6 holds).
5. **Close-range grass "worm/scribble" mottle re-confirmed** (`game-close-14`, 7.5): the same
   dark scribble-trail texture pattern round 6 found on real GPU is also visible on SwiftShader
   this round, at the same close-range LOD. Overview-distance grass stays clean.

*(Runner-up, not in the top 5 by scoring impact but repeatedly observed: golden-hour hero/kopje
lighting still reads flat/plasticky on the lion and waterhole-surface materials, matching round
6's finding 3 — one material/BRDF step from 8.0+.)*

## Best / worst

* **Best: `tools/shots/game-overview-14-dom.png` (8.5)** — the only image in this round reaching
  the "AAA with nits" band; a fully legible, coherent HUD over a clean daytime park.
* **Worst: `tools/shots/game-close-21_5.png` (2.5)** — almost the entire frame is unreadable
  black; only a tight cluster of white eye-shine dots and a hut silhouette are visible.

## Verdict vs history

`game.blindVisual`: 6.9 → 7.8 → 6.8 → 7.5 [real GPU] → **6.0** (SwiftShader, comparable to round
5's 6.8, not round 6's 7.5). `savannahSubset`: 7.0 → 7.9 → 7.0 → 7.5 [real GPU] → **6.8**. Against
its correct SwiftShader baseline (round 5), this round is down on both axes: −0.8 on the game
subset, −0.2 on the savannah subset. The regression is not evenly spread — the daytime shots
(`overview-8/14`, `close-14`, `dom-14`, `waterhole`) each dropped only 0.5 point on a genuinely new
independent look at the disc-tree and grass-mottle tells, while the two night game shots collapsed
by 0.5–2.5 points into near-total blackout, the opposite failure mode from round 5's over-bright
water and worse than round 6's murky-but-legible real-GPU night. Combined with the newly-found
savannah-night bloom artifact and the (environment-caused, but scoring-relevant) fact that every
animal this round is a procedural fallback rather than the authored asset, the honest reading is:
**daytime content is stable with the same two known tells (disc-tree impostors, grass mottle); the
night-exposure story is not converged — it swung from "too bright" (round 5) through "murky but
readable" (round 6, real GPU) to "unreadably dark" (round 7, SwiftShader) — and needs a real-GPU
recapture of this exact protocol to tell whether that swing is backend-dependent or a genuine
regression before the next tuning pass.**

```json
{
  "blindVisual": 6.0,
  "savannahSubset": 6.8,
  "round": 7,
  "backend": "SwiftShader (comparable to round 5, not round 6 which was real GPU ANGLE D3D11)",
  "issues": [
    { "sev": "blocker", "text": "Night-time ground-level legibility regressed to near-total blackout on SwiftShader: game-overview-21.5 = 3.0, game-close-21.5 = 2.5 (the round's two lowest scores). This is a new failure mode distinct from round 5's over-bright blown-out water and round 6's real-GPU 'murky but readable' night -- both shots this round are almost pure black with only a tiny fragment of light visible. Needs a real-GPU recapture of this exact protocol to determine whether this is backend-specific or a genuine regression before further night-exposure tuning." },
    { "sev": "major", "text": "Every authored animal model (8 .glb files) and 3 authored polyhaven terrain textures fail to load in this checkout -- confirmed to be 131-132 byte Git LFS pointer stubs, not binary assets, because git-lfs is not installed in this container. All 11 captures fall back to procedural rendering correctly (zero errors), but this means the entire round scored 100% procedural content and cannot speak to the authored-asset pipeline (ARCHITECTURE section 8) at all. Re-verify after confirming git lfs pull has populated public/assets/** with real files." },
    { "sev": "medium", "text": "Distant tree canopies render as flat, solid-colour circular discs with no texture or shading variation, dominating all three game overview shots and the savannah overview anchor. Previously logged (round 6) as a minor 'lollipop-tree' tell; an uncontextualized fresh look this round finds it materially more damaging to overview-shot scores (game-overview-8 = 7.0, game-overview-14 = 7.5, savannah-overview = 7.0)." },
    { "sev": "medium", "text": "New: savannah-night has a large, unnaturally soft cluster-shaped bloom artifact in the upper-left sky (plus a smaller matching one upper-right) that reads as an oversized bokeh/particle-sprite bug or malfunctioning moon halo, not a starfield -- caps an otherwise-improved shot (savannah-night = 5.5, up from round 5's 4.0) whose water-brightness fix from round 6 otherwise holds." },
    { "sev": "minor", "text": "Close-range grass worm/scribble mottle re-confirmed on SwiftShader (game-close-14 = 7.5), matching round 6's real-GPU finding at the same close LOD; overview-distance grass stays clean. Golden-hour lion/waterhole material shading still reads flat/plasticky (savannah-kopje = 7.0, savannah-waterhole = 7.5), matching round 6 finding 3. The savannah-hero animal herd reads as an indistinct blurred mass rather than individual bodies at a distance where it should still be legible; the savannah-overview anchor's diagonal road cuts dead-straight through organic terrain with no contour-following, reading unnatural next to the winding river beside it." }
  ]
}
```
