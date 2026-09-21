# Game round 4 — blind visual test (2026-09-21)

Re-runs the round-3 protocol against the current build, after the round-6 environment fixes
(sun-disc legibility, storm exposure inversion) and the critic-sweep-part-2 verification pass.
Compares against the round-3 baseline (`game.blindVisual = 6.9`, savannah subset 7.0).

## Protocol

* 10 fresh captures, 2026-09-21, `quality=high seed=1`, 1920×1080, game captures with the clock
  paused (`&speed=0`). One SwiftShader page at a time.
* Game subject (the park demo the live game boots into): `overview` × tod 8 / 14 / 21.5,
  `close` × tod 14 / 21.5, plus one DOM composite (canvas + UI) at overview tod 14 — the same 6
  shots as round 3.
* Savannah subject: `overview`, `waterhole`, `kopje`, `night` — the same 4 shots as round 3
  (round 3's fifth shot, `wideaccident`, was a malformed-preset accident, not repeated).
* Each image scored on visible merit against the §12 anchors (10 indistinguishable from
  reference · 8.5 AAA with nits · 7 good indie · 5 programmer art). Same honest caveat as round
  3: the scorer is the project orchestrator and knows what was asked of each preset — blindness
  is per-image merit scoring, not provenance ignorance.

## Game subject (park demo) — per-image scores

| shot | tod | round 3 | round 4 | notes |
|---|---|---|---|---|
| blind4-game-overview-8 | 8h | 7.5 | 8.5 | The round-3 "foamy mottle" and world-edge cut are both gone — grass reads as natural terrain variation, escarpment stratification and the riparian corridor are clean at every distance. No sparkle anywhere. |
| blind4-game-overview-14 | 14h | 7.0 | 8.5 | The white speckled blotches along the upper river bank and pan rim that round 3 flagged as the defining midday defect are gone — confirms the terrain waterline-sparkle fix (verified on real GPU 2026-09-08) holds at this exact framing. |
| blind4-game-overview-21_5 | 21.5h | 6.5 | 7.5 | Genuinely improved: park lamps read as warm pools of light, waterhole rims trace as clean warm glow rather than pale sparkle, river shows plausible dark-water highlights. Still fairly dark overall for an "overview" but legible and atmospheric rather than murky. |
| blind4-game-close-14 | 14h | 7.5 | 8.0 | Correct acacia silhouettes, natural herd placement (zebra/wildebeest visible), dappled canopy shade on the ground reads as organic, not a stamp. Red dirt at the frame edge blends cleanly, no tiled crack motif. |
| blind4-game-close-21_5 | 21.5h | 5.5 | 6.0 | **Did not improve as much as expected — see discrepancy note below.** Still very dark: the fixed core camera (`target:[0,0], distance:140, pitch:28, yaw:55`) looks straight into dense, self-shadowed tree canopy that dominates the frame. Past the canopy, the midground shows real content (faint zebra highlights, terrain mottle) consistent with the night-lift fix working — but the canopy itself reads near-black, per environment's own documented "foreground self-shadowed canopies stay near-black by design" gap. |
| blind4-game-dom-14 | 14h | 7.5 | 8.5 | UI composite over a now-clean terrain: top bar, minimap, toolbar all crisp; no sparkle underneath. |

**Game subset average: 7.83 → `game.blindVisual = 7.8`** (round 3: 6.9).

### Discrepancy note: game-close-21.5 — investigated and explained (2026-09-21)

Environment's own STATUS.json history claims this exact view (`game-close-21_5-tune2.png`) was
fixed to read "~7" legible on 2026-09-08. This round's fresh capture of the same core camera
preset (`close`) at the same hour does not match that — it reads close to round 3's original 5.5.
Traced with an in-page ray march rather than guessing: read `camera.matrixWorld`'s forward axis
and sampled props' own `coverAt(x,z)` API every 10 m along it. Finding: the camera's own position
sits at 73% ground-projected tree cover, and at `close`'s own parameters (distance 140, pitch 28°)
the camera sits ~66 m up — despite being labelled "ground detail" in `CameraRig.js`, it's a
moderately elevated 3/4 angle, so nearby tree crowns seen from above/beside legitimately dominate
the near-field. At night, self-shadowed canopy tops read dark even with the night-ambient fix
active (which correctly lifts the open ground/midground visible past the canopy in this same
shot) — the same "foreground self-shadowed canopies stay near-black by design" limitation
environment's own README already documents, just unusually prominent because this fixed camera
happens to sit inside a dense tree cluster. Most likely explanation for the gap: the 09-08 shot
predates a later terrain/props density change near world origin. Not a regression in the
night-ambient fix, and not worth a shader chase (would mean rethinking canopy self-shadowing in
general for one fixed-camera corner case); a restage of this preset was considered and rejected
since it's shared with the well-regarded close-14 daytime shot. Score stays at 6.0 (not re-raised
to 7, matching what was actually seen).

## Savannah subject — per-image scores (reported, not the game average)

| shot | round 3 | round 4 | notes |
|---|---|---|---|
| blind4-sav-overview | 6.5 | 8.0 | The white sparkle blotches at the waterhole rim and upper river are gone — clean banks, clean pan rims. Mild diagonal light-ray artifact near the top-left corner, minor. |
| blind4-sav-waterhole | 8.0 | 8.0 (patch fixed same day) | Still the strongest single image — elephants and zebras at the pan, detailed acacia crown, kopje backdrop. The "clumpy leaf-puffs" and "blue-tipped grass" nits from round 3 are not visible this round. **Pan-centre black patch: FIXED same day** — root cause was the water shader's analytic-reflection term collapsing at near-top-down angles combined with a fully-shadowed, deliberately-low-envMapIntensity surface having no light left. A small unconditional in-column-scatter floor fixes it (sav-waterhole-blackfix2.png) without brightening lit water (verified against roads-bridge-waterfix-check.png). Full writeup in savannah's STATUS entry. |
| blind4-sav-kopje | 6.5 | 8.0 | Matches the module's own 09-07 kopje-fix claim: the male lion is clearly legible in the grass, mane and build readable, two more lions visible left and right. Real improvement over round 3's "ambiguous tan shape". Tall foreground grass partially obscures lower legs — a minor nit, not an occlusion failure. |
| blind4-sav-night | 7.0 | 7.5 | Moonlit waterhole reads well — bright moon-glint on water, kopje and tree silhouettes, animals visible at the pan, stars and cloud texture in the sky. The glint pattern still has a slightly dithered/speckled look up close, the same "noisy" tell round 3 flagged, just less prominent. |

**Savannah subset average: 7.9** (round 3: 7.0) — consistent with savannah's module score moving
7.5 → 8.0 this round.

## Systemic findings, updated

1. **Waterline sparkle (round-3 finding #2): RESOLVED**, confirmed at 1080p across both game and
   savannah overview shots. This was the most-cited defect in the round-3 blind set.
2. **Kopje pride legibility (round-3 finding #3): RESOLVED**, confirmed with a fresh capture —
   the fix holds up outside the original verification shots.
3. **Grass mottle stamp (round-3 finding #4) and tiled crack motif (round-3 finding #5):
   RESOLVED** — both terrain and savannah close/overview shots now show organic-looking ground
   texture with no repeating tell.
4. **Wild night legibility (round-3 finding #1): PARTIALLY RESOLVED, with a new discrepancy** —
   see the game-close-21.5 note above. The fix works where tested at the environment-module
   level; the live game's specific `close` camera preset does not currently show the improvement
   the 09-08 history note claims.
5. **NEW: waterhole pan-centre black patch** (savannah) — see savannah's STATUS entry.
6. **World-edge apron** (round-3 finding #6): not specifically re-tested this round; no apron
   step was visible in any of the wide overview shots, consistent with the 09-08 apron fix.

## Gameplay fidelity — re-verified, unchanged

`tools/fidelity.mjs` re-run 2026-09-14: all scenarios pass, 0 console errors, numbers match the
recorded baseline (e.g. $15 price point: net +382.6/day this run vs the recorded +383/day —
consistent with determinism, not a regression). `game.gameplayFidelity` stays at 8.0; no new
scenario evidence was added this round to justify moving it.
