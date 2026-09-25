# Game round 6 — blind visual test (2026-09-23) — independent critic

Fresh, independently-captured re-run of the round-5 protocol, prompted by this round's
terrain/savannah/park fixes. Every image was captured, read and scored fresh in this session — none
of round 5's numbers were reused. **Tooling correction made mid-session, disclosed here rather than
smoothed over**: my first pass at the three `overview` shots did not pin `&speed=0`. `--game` mode
does not auto-pause the clock the way showcase mode does (`world.time.speed` defaults to 0.05
game-hours/real-second, `paused: false`), and a 1080p `--game` capture under this session's loaded
SwiftShader environment took 700–900+ s wall-clock — enough for the clock to drift ~35–45 game-hours
and land on an effectively random hour by the time the shot fired. The first `tod=14` and `tod=21.5`
captures both came back near-black (frameMs also spiked to 5.1 s on one of them, an unrelated
system-load artifact from concurrent captures) — caught by checking `frameMs` and the captured `url`
against the JSON rather than assuming the image was "just how it looks now," and re-shot with
`--extra "&speed=0"` on all six game-subject captures. This matches a gotcha `docs/STATUS.json`
already documents for `park`'s own `setSpeed(1)` history.

## Protocol
* Game subject: `overview` × tod 8/14/21.5, `close` × tod 14/21.5, one DOM composite (canvas + UI) at
  `overview` tod 14 — same 6 shots as rounds 3–5, `quality=high seed=1`, 1920×1080, clock pinned via
  `&speed=0` on every shot (see correction above).
* Savannah subject: `overview`, `waterhole`, `kopje`, `night` — reused from this same session's
  independent `savannah` module review (same day, same seed, same quality tier), matching round 5's
  own stated deviation from capturing a second time at a different resolution.
* Each image scored 0–10 on the brief's §12 anchors purely on what is visible, cross-checked against
  `errors`/`drawCalls`/`triangles` in each capture's JSON.

## Game subject (park demo) — per-image scores

| shot | tod | round 5 | round 6 (this pass) | notes |
|---|---|---|---|---|
| game-overview-8 | 8h | 8.0 | 8.0 | Coherent whole-park view: river with two bridges, escarpment (now showing genuinely irregular groove spacing even at this distance), two pans, lodge complex, kopjes. No sparkle. Matches round 5. |
| game-overview-14 | 14h | 8.0 | 8.0 | Same composition at midday; clean waterline banks and pan rims, no speckle. Matches round 5. |
| game-overview-21_5 | 21.5h | **3.5** | **8.0** | **Major, confirmed fix.** Round 5's single most damaging finding — the entire river and both pans rendering as a glaring near-white blown-out fill — is gone. This capture (reproduced twice, independently, once via a direct pixel readback cross-check in this session's own `terrain` module review: water ≈ RGB(11,8,5) vs sky ≈ RGB(33,26,20), water now *darker* than sky) shows dark water with soft warm-toned edge highlights; the lodge's and road's own lamps are correctly the brightest objects in frame. This is the game's own default night view, no longer broken. |
| game-close-14 | 14h | 8.0 | 8.0 | Correct acacia silhouettes, natural zebra/wildebeest placement, dappled canopy shade reads as organic. A hide structure visible at frame left. Matches round 5. |
| game-close-21_5 | 21.5h | 5.0 | 6.0 | Still very dark, dominated by self-shadowed tree canopy — the same fixed-camera-sits-inside-a-tree-cluster limitation `environment`'s own README documents, unchanged and by design. Restored to round 4's original 6.0 (not round 5's extra-penalized 5.0), since the additional bright-water patch round 5 flagged in this shot's corner is now much softer/resolved, consistent with the terrain night-water fix. |
| game-dom-14 | 14h | 8.5 | 8.5 | UI composite over clean terrain: top bar, minimap (correctly showing habitat outlines), numbered toolbar all crisp; no sparkle underneath. Matches round 5 exactly. |

**Game subset average: (8.0+8.0+8.0+8.0+6.0+8.5)/6 = 7.75 → `game.blindVisual = 7.8`** (round 5: 6.8).
The recovery is driven almost entirely by the same one shot whose regression drove round 5's drop —
`overview-21.5` — now independently re-verified fixed rather than re-scored on faith.

**Budget note**: `close-14` and `close-21.5` both now measure **under** the project's ≤6 M triangle
budget (5,697,029 and 5,664,369 respectively) — round 5 had flagged a minor overage here
(6.08–6.11 M); not present this round. Not attributable to any change in this round's scope, most
likely ordinary scene-content variance run to run; noted rather than claimed as a fix. Zero console
errors on all 6 shots (two benign, unchanged `[core] dependency cycle` warnings present on every
capture, not new this round, not counted against `errors`).

## Savannah subject — per-image scores (reported, not part of `game.blindVisual`)

| shot | round 5 | round 6 (this pass) | notes |
|---|---|---|---|
| sav-overview | 8.0 | 8.0 | Coherent composed world: river, gallery, grassland, kopjes, waterhole, dirt track — matches this session's own fresh `savannah` module review. |
| sav-waterhole | 8.0 | 8.0 | Elephants and giraffes at a muddy pan, zebra at the shore, detailed acacia — still the strongest single image in the set. |
| sav-kopje | 8.0 | 8.0 | Pride legible at the kopje's foot, male's mane and build readable — holds up under fresh inspection. |
| sav-night | **4.0** | **7.0** | **Major, confirmed improvement.** The waterhole pan no longer reads as a uniform bright cream-tan fill — it now shows a genuinely dappled, textured ring (brighter, foam-like) around a visibly darker, smoother centre (deep water), real depth-based variation rather than a flat blowout. Pixel readback: shore ring ≈ RGB(90,72,50) vs sky ≈ RGB(18,24,28) — still markedly the brightest feature in frame, which is defensible as the described "moon glitter path" now that it clearly varies with apparent depth, rather than a bug. Not fully resolved to the level of `terrain`'s own river fix, hence 7.0 not 8.0+, but a genuine, independently-verified improvement, not a re-score on faith. |

**Savannah subset average: (8.0+8.0+8.0+7.0)/4 = 7.75** (round 5: 7.0) — broadly consistent with this
session's independent `savannah` module score of 7.0, which reflects two other module-specific defects
(`close`'s missing kopje, `hero` unchanged) that this 4-shot blind subset does not sample.

## Systemic findings, this round

1. **The night-water-overbright bug — the single most damaging, most-corroborated defect from round
   5 — is genuinely fixed, independently re-verified through three separate lines of evidence in this
   session**: a direct pixel-level readback in `terrain`'s own module review (water now measurably
   darker than sky, a complete reversal of the prior relationship), the game's own default
   `overview-21.5` shot (reproduced twice, including once caught and corrected for a clock-drift
   tooling error before trusting the result), and the savannah subject's `night` shot (improved from a
   flat blowout to genuine depth-based shore/deep-water variation). This is not a re-scoring of round
   5's claim on faith — every one of these was captured and read fresh in this session.
2. **Camera-anchor mis-targeting in the wave-3 composite modules, flagged by round 5, is also
   substantially addressed** (see this session's own `savannah` and `park` module reviews for full
   detail): `savannah close`'s herd-crossing bug is completely gone (though the preset still doesn't
   show its promised kopje); `park habitat`'s wrong-biome bug and `park close`'s wrong-framing bug are
   both genuinely fixed, verified against the underlying build/placement data, not just the render.
3. **Daytime overview/close shots (8h, 14h) remain stable and strong** — consistent across rounds 4, 5
   and 6, with the underlying terrain/props/environment fixes from earlier rounds continuing to hold.
4. **A capture-tooling gotcha independently rediscovered this round**: `--game` mode does not
   auto-pause `world.time`, so any capture whose wall-clock time is long relative to
   `1 / world.time.speed` (0.05 game-hr/s by default) will drift to an effectively random hour unless
   `&speed=0` is explicitly passed. This cost real time in this session (two game-subject shots had to
   be re-taken) and is worth the next round pinning by default rather than rediscovering again.

## Gameplay fidelity — not re-verified this round

`tools/fidelity.mjs` was not re-run in this session (out of scope for this round's assignment, which
covered savannah/park/terrain/props/game-blind-visual specifically). `game.gameplayFidelity` is left at
its existing value (8.0); flagged again for a future round to re-run directly.
