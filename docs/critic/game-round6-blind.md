# Game round 6 — blind visual test (2026-09-25) — blind critic

Third independent re-run of the round-3 protocol (after round-4's orchestrator pass and
round-5's first independent critic pass). Every image in this round was freshly captured, read
and scored in this session; none of the previous rounds' numbers were reused.

## Protocol

* **Capture backend changed this round: real GPU, not SwiftShader.** All 11 captures were taken
  with `tools/gpu-check.mjs` forcing ANGLE D3D11 on the machine's AMD Radeon RX 5700 XT (every
  capture's JSON reports `gpu = "ANGLE (AMD, AMD Radeon RX 5700 XT (0x0000731F) Direct3D11
  vs_5_0 ps_5_0, D3D11)"`, `errors: []`, PNG present; exit status OK). Rounds 3–5 were captured
  on SwiftShader software GL. **Comparability caveat, stated explicitly: the round-over-round
  deltas below mix a renderer change with content changes.** SwiftShader may have masked
  hardware-only artifacts (or exaggerated others), so part of any score movement vs rounds 3–5
  is attributable to the backend, not the build. Within this round, all 11 images share one
  backend, so the internal comparison is clean.
* Game subject (the park demo the live game boots into), `quality=high seed=1`, 1920×1080,
  40-frame settle, one page at a time, live dev server at `http://127.0.0.1:5173`:
  `overview` × tod 8 / 14 / 21.5, `close` × tod 14 / 21.5 — the same 5 canvas shots as rounds
  3–5 — plus one UI composite at `overview` tod 14.
* Clock pinning: contrary to this round's tasking note, `gpu-check.mjs` does **not** itself
  append `&speed=0`; the clock was therefore pinned by passing explicit `--url` values carrying
  `&speed=0` (App.js:91–93 sets `world.time.paused`), matching rounds 3–5. (`--game` is a no-op
  label — the tool's parser ignores it; the game subject is the default page without a
  `module` param.) No capture failed, so no retry was needed and no orphaned
  chrome-headless-shell cleanup was required.
* UI composite: throwaway `tools/shots/round6-dom.mjs` (same ANGLE D3D11 launch flags as
  `gpu-check.mjs`) taking a Playwright `page.screenshot({ fullPage: true })` with the
  round-3-mandated 180 s timeout, so the DOM HUD is composited over the live canvas; the
  sidecar JSON carries the same gpu/errors/stats check.
* Savannah subject (staged wild savannah, `?module=savannah`, each preset at its own staged
  tod, 1920×1080): `hero` (17.4), `waterhole` (8), `kopje` (17.8), `night` (22) — per this
  round's tasking, `hero` takes the wide-slot in the subset — plus `overview` (16.5) captured
  as an extra comparability anchor to rounds 3–5 (scored below but **not** in the subset mean).
  Resolution note: rounds 3/4 used 1080p for these, round 5 used 720p; this round is back to
  1080p across the board.
* Each image scored 0–10 on visible merit against the §12 anchors only (10 indistinguishable
  from reference · 8.5 AAA with nits · 7 good indie · 5 programmer art · 0 broken/missing), as
  if the project had never been seen. No credit for effort or novelty; README/STATUS claims
  ignored. Same honest caveat as rounds 3–5: the scorer knows what each preset was supposed to
  stage — blindness is per-image merit scoring, not provenance ignorance.

## Game subject (park demo) — per-image scores

| shot (tools/shots/) | tod | r3 | r4 | r5 | r6 | notes |
|---|---|---|---|---|---|---|
| blind6-game-overview-8.png | 8h | 7.5 | 8.5 | 8.0 | **8.0** | Coherent whole-park morning: river with two bridges, escarpment with long plausible shadow, two pans, lodge complex, road network. No sparkle, no world-edge cut. Hazy-but-intentional morning light; plains mottle slightly airbrushed. |
| blind6-game-overview-14.png | 14h | 7.0 | 8.5 | 8.0 | **8.0** | Same composition at midday, crisp: gallery corridor, kopjes, buildings all read; water dark and clean. Lollipop-tree blobs at this distance and a large vague brown mottled patch lower-centre are the only tells. |
| blind6-game-overview-21_5.png | 21.5h | 6.5 | 7.5 | **3.5** | **7.0** | **The round-5 night-water blowout is gone on real GPU**: river and both pans read as dark surfaces, faintly lighter than the ground, not a glaring fill. Warm lamp pools and a lit line (lamps/vehicles) anchor the park layout; escarpment faintly moon-modelled. Still very dark for an "overview" — most of the frame is murk, and the evenly-spaced light string reads slightly mechanical. |
| blind6-game-close-14.png | 14h | 7.5 | 8.0 | 8.0 | **7.5** | Correct acacia silhouettes, legible elephant herd with contact shadows, kopjes read well, hide structures present. Held back by the worm-like squiggle mottle across the midground slope — at 1080p on real GPU this still reads semi-synthetic (see finding 2). |
| blind6-game-close-21_5.png | 21.5h | 5.5 | 6.0 | 5.0 | **6.0** | Matches rounds 4/5's diagnosis: the fixed camera (~66 m up inside a tree cluster) makes a near-black self-shadowed canopy mass dominate the lower half. The moonlit midground does read now (hide roof, elephant shapes, kopje) and the round-5 bright-water patch is absent, but half the frame is still black. |
| blind6-game-dom-14.png (full-page UI composite) | 14h | 7.5 | 8.5 | 8.5 | **8.5** | Full HUD legible over the live canvas: park name, $250,000, +$0/day, visitors, star rating, Day 1 / DRY SEASON, 14:00 clock with pause state, weather, bottom toolbar with hotkeyed tools, and a minimap that correctly mirrors river/roads/park boundary. No sparkle underneath. Best image of the round. |

**Game subset average: (8.0 + 8.0 + 7.0 + 7.5 + 6.0 + 8.5) / 6 = 7.50 → `game.blindVisual = 7.5`**
(round 3: 6.9 · round 4: 7.8 · round 5: 6.8).

## Savannah subject — per-image scores (reported, not part of `game.blindVisual`)

| shot (tools/shots/) | r3 | r4 | r5 | r6 | notes |
|---|---|---|---|---|---|
| blind6-sav-hero.png (17.4h) | — | — | — | **8.0** | Genuine golden-hour vista: streaked sky, hazy escarpment, glinting river behind the gallery, legible wildebeest herd, a lion walking the left grass, ostrich at a pool. Nits: the foreground grass is a uniform blade-wall, one hard canopy card-clipping edge in the left gallery cluster, escarpment nearly erased by haze. |
| blind6-sav-waterhole.png (8h) | 8.0 | 8.0 | 8.0 | **8.0** | Again the strongest pure-content image: unmistakably an African waterhole — elephant at the pan (second across), zebras at the shore, giraffe behind the umbrella acacia, kopje backdrop, muddy shore blending. The round-4 pan-centre black patch stays fixed. Nits: water surface milky-flat, foreground elephant smooth/low-poly, uniform grass wall in the bottom third. |
| blind6-sav-kopje.png (17.8h) | 6.5 | 8.0 | 8.0 | **7.5** | The pride is unmissable — three males legible in the grass (centre one full-body with mane), the round-3 fix holding under a fresh look; sunset-lit kopje backdrop is strong. Held at 7.5 not 8.0: the lions' flat bright-cream shading reads plasticky in direct low sun, and the whole frame sits in one monochrome red-brown wash. |
| blind6-sav-night.png (22h) | 7.0 | 7.5 | **4.0** | **6.5** | The round-5 "uniform bright cream-tan pan" is gone on real GPU: the water reads dark, the starfield is legible, kopje and trees silhouette correctly, hippo shapes sit in the pan. But this is a *correct* night, not a legible one — the bottom half is a black grass wall and the preset's own anchor hippos are barely identifiable. |
| blind6-sav-overview.png (16.5h) — extra anchor, not in subset | 6.5 | 8.0 | 8.0 | **7.5** | Coherent staged geography (river, pans, gallery, kopjes, track crossing) with clean waterlines; noticeably hazier and lower-contrast than the game's overview, with airbrushed mottle smudges on the open plains. |

**Savannah subset average (hero, waterhole, kopje, night): (8.0 + 8.0 + 7.5 + 6.5) / 4 = 7.5**
(round 3: 7.0 · round 4: 7.9 · round 5: 7.0).

## Systemic findings (ranked)

1. **Wild-night legibility at ground-level cameras is now the top remaining defect.** With the
   night-water blowout fixed (see below), what keeps night shots at 6.0–7.0 is no longer
   over-brightness but under-legibility: `close-21.5` loses its lower half to a near-black
   self-shadowed canopy mass, and `sav-night` loses its to a black grass wall that nearly hides
   the preset's own anchor hippos. A moon/ambient-aware exposure floor for near-field geometry
   (not the water) remains the highest-value visual fix.
2. **The close-range grass squiggle mottle is not fully resolved — now confirmed on real GPU.**
   Round 4 declared the round-3 "grass mottle stamp" fixed; round 5's SwiftShader captures
   agreed at overview distance. This round's 1080p D3D11 `close-14` plainly shows worm-like
   dark scribble trails across the midground slope. This resolves round 3's SwiftShader caveat
   in the opposite direction: the artifact is a real texture-pattern tell on hardware, at close
   range specifically. Overview distances remain clean.
3. **Golden-hour flat shading on heroes.** In direct low sun the flagship subjects read
   plasticky: the kopje males are uniform bright cream with little form shading, and the
   waterhole surface is milky-flat with almost no depth cue. Both are one material/BRDF step
   from 8.0+.
4. **Previously-recorded defects stay fixed under a fresh real-GPU look.** In 11 images this
   round: zero waterline sparkle, zero pan-centre black patch, pride clearly legible at the
   kopje, no world-edge apron step, and — the round-5 killer — **no night-water over-brightness
   in either night shot** (`overview-21.5` 3.5 → 7.0, `sav-night` 4.0 → 6.5). The round-5
   close-preset triangle overage is also gone (close now 4.99–5.03 M vs the ≤6 M budget;
   overview 4.5–4.6 M).
5. **Minor:** one hard canopy card-clipping edge in `sav-hero`'s left gallery cluster; the
   savannah `overview` reads hazier/lower-contrast than the game's overview at similar
   distance. The round-5 camera-anchor mis-targeting majors (savannah `close`, park
   `habitat`/`close`) were **not re-tested** — those presets are outside this protocol's shot
   list — and are carried, unverified, by the module rounds.

## Best / worst

* **Best: `tools/shots/blind6-game-dom-14.png` (8.5)** — a fully legible, coherent HUD over a
  clean live park; the only image touching the "AAA with nits" band this round.
  Runner-up: `blind6-sav-waterhole.png` (8.0), the strongest pure-render image.
* **Worst: `tools/shots/blind6-game-close-21_5.png` (6.0)** — half a black canopy wall;
  legible only in its moonlit midground. `blind6-sav-night.png` (6.5) is the same failure mode
  with grass.

## Verdict vs history

`game.blindVisual` 6.9 → 7.8 → 6.8 → **7.5**; savannah subset 7.0 → 7.9 → 7.0 → **7.5**.
Round 5's crash was almost entirely the one night-water blowout; this round confirms on real
GPU that the fix is genuine and general (both night shots, two different cameras, two subjects).
The set is now remarkably flat: every image sits in 6.0–8.5 with no catastrophic failure and no
image above 8.5 — the ceiling is set by the recurring night-legibility floor (finding 1), the
close-range grass tell (finding 2), and flat golden-hour hero shading (finding 3). Given the
renderer change (SwiftShader → ANGLE D3D11), the honest reading is "the round-5 regression is
repaired and the build is at least as good as round 4's 7.8 looked, with the remaining gap to
8+ owned by three specific, ranked, fixable tells" — not a like-for-like +0.7 content
improvement.

```json
{
  "blindVisual": 7.5,
  "savannahSubset": 7.5,
  "round": 6,
  "issues": [
    { "sev": "major", "text": "Wild-night legibility at ground-level cameras is the top remaining defect (close-21.5 = 6.0, sav-night = 6.5): with the night-water blowout fixed, night frames now fail the other way -- close-21.5's lower half is a near-black self-shadowed canopy mass (fixed camera ~66 m up inside a tree cluster, as round 4 diagnosed) and sav-night's bottom half is a black grass wall that nearly hides the night preset's own anchor hippos. Needs a moon/ambient-aware exposure floor for near-field geometry." },
    { "sev": "medium", "text": "Close-range grass squiggle mottle re-confirmed on real GPU (close-14 = 7.5): worm-like dark scribble trails across the midground slope at 1080p D3D11, contradicting round 4's 'resolved' for close range. Overview distances stay clean; this is a close-LOD texture-pattern tell, now proven not to be a SwiftShader artifact." },
    { "sev": "medium", "text": "Golden-hour hero shading reads plasticky (sav-kopje = 7.5, sav-waterhole = 8.0): kopje males are uniform bright cream with minimal form shading in direct low sun, and the waterhole surface is milky-flat with no depth cue. One material/BRDF step from 8.0+." },
    { "sev": "minor", "text": "Hard canopy card-clipping edge in sav-hero's left gallery cluster; savannah overview (7.5, extra anchor) reads hazier and lower-contrast than the game overview at similar distance." },
    { "sev": "minor", "text": "Previously-recorded defects stay fixed under a fresh real-GPU (ANGLE D3D11) look: night-water over-brightness gone in both night shots (overview-21.5 3.5 -> 7.0, sav-night 4.0 -> 6.5), zero waterline sparkle, pan-centre black patch still fixed, kopje pride clearly legible (three males), no world-edge apron, and the round-5 close-preset triangle overage is gone (4.99-5.03M vs <=6M). Round-5's camera-anchor mis-targeting majors were NOT re-tested this round (outside the blind shot list)." },
    { "sev": "minor", "text": "Comparability caveat: this round was captured on the real GPU (ANGLE D3D11, Radeon RX 5700 XT) while rounds 3-5 were SwiftShader software GL; round-over-round deltas mix renderer change with content change. game.gameplayFidelity (8.0) again not re-verified this round (visual critic pass only)." }
  ]
}
```
