# Game round 3 — blind visual test (2026-09-07)

Sets `game.blindVisual` and `game.gameplayFidelity` in `docs/STATUS.json` — the two wave-3
scores flagged as outstanding since the park module landed its subject.

## Protocol

* 11 fresh captures, 2026-09-07, all `quality=high seed=1`, game captures with the clock paused
  (`&speed=0`, which sets `world.time.paused` since commit 4500c55). One SwiftShader page at a
  time; ~6–14 min wall each at 1080p.
* Game subject (the park demo the live game boots into): `overview` × tod 8 / 14 / 21.5,
  `close` × tod 14 / 21.5, plus one DOM composite (canvas + UI) at overview tod 14.
* Savannah subject (the staged wild savannah): `overview`, `waterhole`, `kopje`, `night`, plus
  one accidental default-camera wide shot kept as an extra view.
* Each image scored on visible merit alone against the §12 anchors (10 indistinguishable from
  reference · 8.5 AAA with nits · 7 good indie · 5 programmer art), no adjustment for known
  module history. Filenames were neutral (`blind-*`) at capture time.
* Honest caveat: the scorer is the project orchestrator and knows what was asked of each preset;
  the blindness is per-image merit scoring, not provenance ignorance. Also: renders come from
  SwiftShader (software GL) — one artifact class below (waterline sparkle) may be softer on real
  hardware and needs a GPU cross-check before anyone treats it as a shader bug.

## Game subject (park demo) — per-image scores

| shot | tod | score | notes |
|---|---|---|---|
| blind-game-overview-8 | 8h | 7.5 | Escarpment stratification, riparian corridor, bridges and lodge all read correctly. Held back by the foamy mottle pattern on the plains and the visible world-edge cut top-left. |
| blind-game-overview-14 | 14h | 7.0 | Same scene; daylight exposes white speckled blotches along the upper river bank and left pan rim — read as defects, not spray. |
| blind-game-overview-21_5 | 21.5h | 6.5 | Park lamps give a legible night layout with warm pools of light; pale sparkle traces along every waterline and fence ring; overall very dark for an overview. |
| blind-game-close-14 | 14h | 7.5 | Correct acacia silhouettes, natural herd placement, kopjes and depth layering. Grass reads as a stamped squiggle pattern up close; red dirt patch shows a tiled crack motif. |
| blind-game-close-21_5 | 21.5h | 5.5 | Away from park lights the wild close view is essentially a black frame — faint mottle and tree silhouettes only. Night legibility fails at this camera/hour. |
| blind-game-dom-14c | 14h | 7.5 | UI over the live park: top bar, toolbar, minimap all render and are legible; the round-1 empty-panel defect is gone. Terrain issues as at overview. |

**Game subset average: 6.9 → `game.blindVisual = 6.9`.**

## Savannah subject — per-image scores (reported, not the game average)

| shot | score | notes |
|---|---|---|
| blind-sav-overview | 6.5 | Coherent geography and palette; prominent white sparkle blotches overlap vegetation at the waterhole rim and upper river — defects, not mineral crust. |
| blind-sav-waterhole | 8.0 | Best image of the set: unmistakably an African waterhole — elephants at the pan, zebras, giraffes behind the umbrella acacia, muddy shore blending. Canopy reads as clumpy leaf-puffs; a hard black patch sits in the pan centre; some blue-tipped grass blades. |
| blind-sav-kopje | 6.5 | The pride is illegible — at best an ambiguous tan shape behind a shrub clump. Frame-identical to savannah-kopje-auto.png shot yesterday; see below. |
| blind-sav-night | 7.0 | Genuinely a moonlit waterhole: elephant at the pool, moon glint on water, cloud bank behind the kopje silhouette. Glint and clouds are noisy/speckled. |
| blind-sav-wideaccident | 7.0 | Default-camera 900 m wide view (kept from a malformed preset name). Here the white pan-rim crust DOES read as plausible salt mineral. Two perfectly straight parallel tracks look ruler-like. |

**Savannah subset average: 7.0** — consistent with savannah's module score (7.5 round 1, held
at 7.5 round 2 with the kopje major re-opened).

## Systemic findings (in priority order)

1. **Wild night legibility** (5.5 close night vs 7.0 moonlit waterhole): night readability is
   entirely moon-elevation/camera dependent. Recommend a moon-aware exposure floor or minimum
   ambient for wild views so 21.5h close shots stop reading as black frames.
2. **Waterline sparkle blotches**: white speckle clusters hugging river banks, pan rims and fence
   rings at overview distance. Looks like specular aliasing; MUST be cross-checked on real GPU
   before treating as a shader bug (SwiftShader caveat above).
3. **Kopje preset subject persistence** (savannah major, still open): two captures 24 h apart
   (savannah-kopje-auto.png, blind-sav-kopje.png) both show the male lion at best as an
   ambiguous tan shape behind a shrub. Camera aim is no longer the problem; the subject is
   occluded by staged shrubs or wanders during the 40-frame settle at ~1 fps. Fix needs either
   a shrub-free sightline from the preset camera or staging the pride closer to the lens.
4. **Grass mottle stamp**: the swirly squiggle pattern on grass/dirt transitions reads synthetic
   from midday overview through close range — the same tell savannah round 1 recorded as the
   "uniform golden glow"; it is now a texture-pattern problem, not an exposure problem.
5. **Tiled crack motif** on red dirt patches at close range.
6. **World-edge apron** visible as a detail-density step from high overview (known minor).

## Gameplay fidelity — `game.gameplayFidelity = 8.0`

`tools/fidelity.mjs` (added 2026-09-06) drives the live game's own APIs; 6/6 scenarios pass with
zero console errors. Measured: price elasticity 10/25/40/60 → 249/129/72/41 arrivals/day with
net −951/−1357/−3203/−4596 $/day (the dearer month earns less); bankruptcy flag fires day 18
under a forced loss run; water-table degradation drops Plains habitat quality 0.527 → 0.342;
determinism: same seed reproduces an identical 30-day history in the live game, different seed
diverges; sightings: 20 sightings over 1800 vehicle-seconds with demo tours, 0 without vehicles.
Not yet demonstrated by the harness: animal births (born = 0 in all 30-day runs), poaching and
drought/disease events, village prosperity effects. Hence 8.0, not higher.

## Balance finding the harness surfaced

The rebalanced demo park is ecologically healthy (0 migrations month one, predators alive,
deterministic) but **cash-flow negative at every measured price point** — best case −951 $/day
at $10 (visitor volume triples, revenue still under the expense base). Profitability needs
content that grows arrivals (species variety, attractions) rather than price tuning alone.
Recorded as an open minor under park in STATUS.json.

## Capture-protocol notes for future rounds

* A 1080p `--game` capture costs 580–860 s wall under SwiftShader — plan sweeps in hours, and
  never run 3+ concurrent pages (two concurrent already halve each other).
* Killing a capture loop orphans its chrome-headless-shell, which keeps burning every core for
  minutes. After any interrupted sweep: `taskkill //F //IM chrome-headless-shell.exe`.
* DOM captures (`--dom`) failed twice silently at Playwright's default 30 s screenshot timeout
  (the live rAF loop starves the compositor). `tools/screenshot.mjs` now uses a 180 s timeout
  and logs the failure instead of swallowing it.
