# Ideas roadmap — SimSafari-1998-inspired mechanics (post-current-wave plan)

Source of the ideas: `docs/ideas-simsafari-1998.md` (mechanics study of the owner's installed
original; no original content in this repo). This document is the implementation schedule.
Status: **PLANNED — starts only after the current iteration wave finishes.**

## Entry gate (all must hold before Wave P1 starts)

1. The in-flight iteration wave is closed: every open critic FAIL either fixed or explicitly
   deferred in `docs/STATUS.json`; `main` green (lint, tests, build).
2. A fresh baseline is recorded in `docs/STATUS.json`: a round-N blind visual pass + full fidelity
   harness run, so every ideas-wave delta is measured against a known state.
3. This roadmap is linked from a dated note in `docs/STATUS.json` (add the note as the activation
   step — deliberately NOT added while parallel sessions are pushing to avoid conflicts).

## Standing rules for every wave

- Agent waves of ≤2 concurrent workers (capture-protocol limit); builders own one module folder.
- Every wave ships harness scenarios (`tools/fidelity.mjs`, additive) and unit tests; determinism
  (`ctx.rng` only) must hold; screenshots actually read; one commit per verified item; STATUS
  updated by the orchestrator.
- Nothing derived from the original's expression — mechanics only, our own content and words.
- Wave exit: `game.gameplayFidelity` re-measured; the target of the whole roadmap is pushing it
  well past the current 8.0 by measuring fidelity to the original's *mechanics*, not just our
  current 6 scenarios.

## Wave P1 — Food-web ecology + plant layer  (foundation; largest sim change)

- Modules: `simulation` (extend the diet/predator tables that now live in `species.js`), `props`
  (8–10 procedural plants: rainfall tier, self-spreading coverage stock), `park` (demo planting).
- Content: plants feed specific species ("attracts"); insectivores fed implicitly by
  grass/shrub coverage; carrying capacity couples to food supply; crowding stress already exists.
- Harness: plant-N-aloe → elephant capacity delta; remove prey → predator decline follows after
  k days; plant-few → coverage spreads over 30 days.
- Gate: new tests green, old 89 untouched-in-behaviour (or consciously updated), determinism.

## Wave P2 — Fire as an interactive disaster  (depends on P1's vegetation stock)

- Modules: `terrain` (burn state + regrowth on the plant layer), `tools` (firebreak bulldoze +
  water-ring verbs), `effects` (fire/smoke), `simulation` (seeded fire events; burnt-building
  rebuild state via `park`), `audio` (crackle layer).
- Harness: fire with response vs without → hectares lost + buildings destroyed; regrowth curve.
- Note: capture cost is high for fire spread — verify with short-horizon scenarios first.

## Wave P3 — Biodiversity index + missions  (depends on P1, uses P2)

- Modules: `simulation` (biodiversity stat: richness/evenness/Big-5 populations; objective
  evaluator), `ui` (objectives panel + star rating), `park` (mission wiring).
- Content: 3–4 starter missions of our own design mirroring the original's *patterns*:
  population-N-within-T, hold-range-for-T, cash-by-year, survive-fire-season.
- Harness: deterministic mission replay with pass conditions asserted.

## Wave P4 — Camp-side management lite + advisors  (after P3, whose missions reference it)

- Modules: `park` (occupancy, facility tier pricing tent→cottage→lodge), `simulation`
  (staff-type balance, layoffs → village trust → poaching chain), `ui` (3 advisor personas with
  tiered state-driven messages).
- Harness: occupancy→arrivals elasticity per tier; layoff→trust→poaching causal chain.

## Wave P5 — Rainfall axis, locusts, salt licks  (enrichment; P1 required, P2 for clearing tool)

- Modules: `simulation` (rainfall preference per species/plant; drought stresses high-rainfall
  species first), `terrain` (water placement mitigation), `effects` (locust swarm), `props`
  (salt licks), `traffic` (sighting probability boosted near licks).
- Harness: drought ± water → mortality delta; locust outbreak + clearing; sighting rate near vs
  far from a lick.

## Wave P6 — Field Guide + trivia  (pure polish, no sim risk)

- Modules: `ui` + `animals` data; our own natural-history text only.
- Deliverable: in-game species/plant guide panels and an optional quiz mode.

## Sequencing rationale

P1 first because P2 burns its vegetation and P3 measures its biodiversity. P4 follows P3 so
mission goals can reference occupancy and cash. P5/P6 are separable enrichment — droppable or
reorderable without harming the core. Expected cadence: one wave per heavy session (P1/P2 are the
longest; P6 is an evening's work).

## Activation checklist (run when the current wave closes)

- [ ] Confirm entry-gate items 1–2 above.
- [ ] Add dated STATUS.json note: "ideas phase starting, see docs/ideas-roadmap.md".
- [ ] Dispatch Wave P1 (two agents: simulation + props builders; orchestrator verifies/commits).
