# P2 — Fire as an interactive disaster (Wave P2, ideas roadmap)

Shipped 2026-09-26 on `claude/p2-fire`. Source of the mechanic pattern: `docs/ideas-simsafari-1998.md`
(mechanics only — all content here is our own). Depends on P1's vegetation stock.

## Model (simulation/vegetation.js + sim.js)

* **Grid state** (per 16 m vegetation cell, on `world.vegetation`): `burn` 0/1/2 (unburnt / burning /
  burnt-regrowing), `scorch` 0..1, `wet` 0..1, `fireVersion` (renderers re-upload on change).
  Cleared firebreak soil is tracked as `cleared` inside the vegetation class.
* **Spread**: once per sim day, every burning cell that has burned < 2 days rolls each 8-neighbour:
  P = 0.32 × min(1, fuel/0.5) × dry × wind, where fuel = Σ plant cover (≥ 0.06 to carry fire),
  dry = clamp(1.15 − rain×1.5 − 0.6×drought) and wind = 1 + 0.6×max(0, alignment). Rolls come from a
  deterministic per-cell/per-day integer hash (`hash01`) — same seed, same fire, no `Math.random`.
* **Burn-out**: after 2 burning days each plant drops to its residue share (grass 0.08, shrub 0.12,
  tree 0.55) and scorch = 1. Scorch decays 2.5 %/day × (1 + rain); burnt cells regrow at rate
  × (1 − 0.7 × scorch) — visible recovery ≈ 40 d, full ecological recovery over the season.
* **Ignition**: natural strikes (dry season, rain ≤ 0.1, ≥ 20 d apart, seeded roll) carry a
  **150-cell containment budget** so wild fires self-limit at ~4 ha; scripted fires
  (`simulation.injectEvent('fire', {x, z, radius})`) are unlimited — that is the disaster the player
  fights. Emits `sim:event` + `fire:changed`.
* **Losses**: a burning cell overlapping a building footprint emits `fire:building {id, rebuildCost}`
  once (40 % of base cost is the rebuild price).

## Response verbs (tools) and the counter-play

* **Firebreak** ($200/ha): `simulation.firebreak(x0,z0,x1,z1,width)` bulldozes the strip to 0.005
  cover per plant — total fuel below the 0.06 carry-fire line, so the front cannot cross; cleared
  soil regrows at 15 % rate (breaks need re-cutting after ~2-3 weeks). Emits `vegetation:changed`.
* **Water drop** ($120/ha): `simulation.waterDrop(x,z,radius)` wets a disc — wet cells cannot ignite
  or carry fire; wetness decays ~15 %/day (~7 days of protection). Re-apply to hold.
* The `fire-response` harness scenario is the demonstration: defended 7.1 ha / 0 buildings vs
  unprotected 13.4 ha / 7 buildings (`tools/shots/fidelity-fire-response.json`).

## Presentation

* terrain: scorch mask by world XZ (R8 64² texture off `fireVersion`), noise-edged, chars albedo/
  roughness/AO (`terrain/material.js`, `terrain/index.js`).
* props: tree/shrub/imposter materials sample the same scorch grid — crowns char and restore as it
  decays; cover loss thins the scatter through the existing ratio-slot mechanism.
* effects: self-lit HDR flame sprites + smoke columns pinned to burning cells (16 emitter pairs,
  front-scaled 1.2-2.2 m flames), one orange PointLight riding the front centroid as the night glow.
* audio: `fire` ambience layer — roar + jittered crackle band, level = fire proximity to the camera
  target (1 at the front, 0 at ~250 m), rain douses.

## Harness

`node tools/fidelity.mjs --scenarios fire-response,fire-regrowth`:
* **fire-response** — defended (park-wide firebreak + every building wetted, re-applied every 6 d)
  vs unprotected, 21 days: pass = 0 buildings lost defended, > 0 unprotected, nothing burns north of
  the break, and the defended fire still burns (> 0 ha — the test is not vacuous).
* **fire-regrowth** — 90 days after a 40 m ignition: pass = median scorch of burnt cells < 0.25 and
  median fuel > 2× the post-burn level.

## Known gaps (honest)

* 16 emitter pairs sample a large front: big fires read as clusters, not a continuous flame wall.
* The fire glow is a single PointLight at the front centroid, not per-cell lighting.
* Burnt-tree crowns char via a shared scorch tint; individual dead snags are not modelled.
* `sim.reset()` restores the vegetation snapshot and clears fire state — mid-fire resets are safe,
  but there is no save/load anywhere in the project to persist a burnt park.
