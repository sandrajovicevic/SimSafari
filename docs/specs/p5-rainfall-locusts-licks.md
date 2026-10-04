# Wave P5 — Rainfall axis, locusts, salt licks (contract)

Shipped 2026-10-01 on `claude/p5-rainfall`. Below the fold is the original contract; measured
results here (full tables: the module READMEs' "Wave P5" sections).

* **Rainfall tiers** — exactly the proposed table (hippo/buffalo high; elephant/rhino/zebra/
  wildebeest/impala/lion medium; giraffe/cheetah/warthog low; ostrich drought), reusing the plants'
  `rainfallFit()`. Drought stress per §2 (fit < 0.6 → happiness target −(0.6−fit)×1.0, +0.006/day
  mortality), mitigation ×(1 − 0.6 × waterAccess) per §3 — the existing water proximity term, so
  **no new waterhole building was needed** (the buildings catalogue already has pump/waterhole rows;
  the harness variant strips them to prove the term works). Harness `drought-water` PASS:
  **17 vs 4 deaths** (dry vs control, 30-day injected drought), hippo happiness **0.514 → 0.390**,
  hippo/buffalo fall before warthog/ostrich.
* **Locusts** — seeded outbreak (forked `Rng('locust:<seed>')`, 1.5%/day in the first 20 days of a
  wet season after a drought) + bounded `injectEvent('locusts', …)` (budget 400 cells default,
  days 12 default, dies < 0.05 density; rule 8 satisfied by construction). Spray $180/ha cuts
  density 80 %; a firebreak through the disc costs a swarm 0.3 × the cleared fraction. Harness
  `locusts` PASS — scored on **cover volume removed** (a cell-count metric measured only 2.8×,
  volume separates cleanly): **unmanaged 65.2 vs sprayed-day-2 16.3 = 4.0× (≥ 3×)**; the firebreak
  pair passes the same bar; every swarm dies within `days` in all variants.
* **Salt licks** — habitat-gated placement ($3,500, radius 10 m), grazer/mixed happiness bonus
  0.03 per lick capped 0.06, wander bias in animals (0.6 of retargets, same-habitat, +60 m leash).
  The spec's emergent sightings route was tried three ways and measured too weak (15/15, 19/20,
  25/20 with/without), so the sanctioned fallback shipped: traffic sightline **×2** at a lick
  (raised from ×1.5 on 2026-10-02 with the owner's OK — the ×1.5 turned out to be dead code; see
  `docs/requests/p5.md` #4). Harness `salt-lick` PASS: **22 vs 17 sightings over 8 staggered
  tours** in the kopje (the only habitat where the effect is positive; the count follows the
  spec's "lick species" wording), control > 0.
* **Visuals** — swarm cloud density scales with area × density (~1300 specks at radius 56 m,
  readable at the spec's 150 m; 1 draw call — the shared instanced particle mesh), day + night
  verified (`tools/shots/p5-swarm-14.png`, `p5-swarm-21_5.png`); salt lick readable at 55 m in ≤ 2
  draw calls (`props-saltlick-auto.png`). Fixing the day shot surfaced a real particle-system bug:
  narrow ranged GPU updates of the 1-float instanced kind attribute never arrived, so staged
  swarms rendered as invisible ambient motes — `_flush()` now re-uploads that buffer full-range
  (see the effects README).
* **Budgets** — 4 swarms alive all 60 days + 3 licks: day step 3.91 ms vs 5.41 ms baseline on the
  same park (inside run-to-run noise; base measured 2.9–5.4 across runs). Effects + props add
  1 particle draw + 2 instanced draws — inside the ≤ 4 total for this wave.
* **Tests** — 245/245 (24 new: tier table, stress ordering/mitigation, locust budget/lifetime/
  spray/firebreak/second-swarm budget, lick refusal/bonus/cap, reset, determinism).
  `tools/check-harness.mjs` OK (23 default scenarios dispatched).

Agenda: `docs/ideas-roadmap.md` Wave P5. Mechanics source: `docs/ideas-simsafari-1998.md` (patterns
only). Requires P1 (plants already carry a `rainfall` tier in `core/Plants.js`); uses P2's firebreak
as a locust-clearing verb. Separable: each of the three parts may ship alone. Read
`ideas-wave-rules.md` first. Branch: `claude/p5-rainfall`.

## Shared data (integrator, core)

- `world.saltLicks: Map<id, { id, x, z, radius, strength }>` — declared in `core/World.js`;
  **single writer: simulation**. Event `saltlick:changed { id, removed? }`.
- `world.locusts: { swarms: [{ id, x, z, radius, density, age }], version }` — declared in core;
  single writer: simulation. Event `locusts:changed { version }`.
- Particle kind `locust` in `effects` (next free id after `firesmoke` = 5).

## Ownership

| owner | does | never |
|---|---|---|
| **simulation** | species rainfall tiers; drought stress; water mitigation; locust spawn/move/eat/clear; salt-lick placement API; tests; harness | draw |
| **tools** | "salt lick" placement verb and "spray" verb → simulation APIs (cost via `spend`) | write `world.*` |
| **props** | salt-lick mesh (our own procedural: trampled bare patch + mineral block), from `world.saltLicks` | write it |
| **effects** | locust swarm particles from `world.locusts` | write it |
| **animals** | wander bias toward a lick inside the animal's habitat | change the ledger |
| **traffic** | nothing new unless the sightings measurement below shows emergence is not enough | — |

## simulation — required behaviour

1. **Rainfall preference per species**: `rainfall` tier in the species table, same four tiers and
   `rainfallFit()` as plants. Proposed: hippo, buffalo `high`; elephant, rhino, zebra, wildebeest,
   impala, lion `medium`; giraffe, cheetah, warthog `low`; ostrich `drought`. Record the final table.
2. **Drought stress**: when the vegetation `rain` value puts a species' fit below 0.6, its daily
   happiness target drops by `(0.6 − fit) × s` and its mortality rises. High-rainfall species are
   stressed first by construction.
3. **Water mitigation**: stress is multiplied by `(1 − 0.6 × waterAccess)`, where `waterAccess` is
   the habitat's existing measured water proximity term. If the player has no way to add water
   today, add a `waterhole` building request (buildings) — check first; do not invent a terrain edit
   path when a placeable exists.
4. **Locusts**: seeded outbreak (forked `Rng('locust:<seed>')`; more likely in the first 20 days of
   rain after a drought), and `injectEvent('locusts', { x, z, radius, days, budget })` — **bounded**:
   `budget` caps total cells eaten, `days` its lifetime (rule 8). A swarm eats grass and shrub cover
   in its disc (not trees) at a rate × density, drifts daily with the weather wind, splits never.
   Clearing: a swarm cell that is burnt or cleared by `firebreak()` loses density; a new
   `sprayLocusts(x, z, radius)` ($/ha via `spend`) cuts density in the disc by 80 %. Swarm dies at
   density < 0.05 or on `days`.
5. **Salt licks**: `placeSaltLick(x, z)` → `{ ok, id, cost }` (must be inside a habitat),
   `removeSaltLick(id)`. Effect: happiness bonus for mixed/grazer species in that habitat
   (small, capped), and an attraction point the animals module reads.
6. All three extend `report` (`report.rainfall = { rain, stressed: [species] }`,
   `report.locusts`, nothing for licks beyond counts) and restore on `reset()`.

## Visuals

- effects: swarm as a drifting instanced particle cloud, dense enough to read at 150 m, ≤ 2 draw
  calls; check noon and night (rule 17).
- props: salt lick readable at 30–80 m; ≤ 2 draw calls; `showcase` preset `saltlick`.

## Harness (simulation, additive)

- `drought-water` — 30-day injected drought, demo park with vs without water access in the
  wetland habitat: high-rainfall species' deaths + leavers greater without water (pass); ordering
  check — hippo/buffalo happiness falls before warthog/ostrich (pass). Non-vacuity: the dry run
  loses at least one high-rainfall animal or ≥ 0.1 happiness.
- `locusts` — bounded swarm on grassland: unmanaged vs sprayed on day 2 (and a firebreak variant):
  grass cover lost unmanaged ≥ 3× sprayed; swarm dead within `days` in every variant (pass).
- `salt-lick` — one tour route past a habitat; lick 25–40 m from the road (inside the 60 m base
  sightline — changed from 60 m on 2026-10-04, owner decision: at 60 m the lick drew a roadside herd
  out of sight and the result flipped sign by seed) vs no lick, 1800
  vehicle-seconds pumped as in `sightings`: sightings of the lick species per tour-hour higher with
  the lick by >= 25 % and >= 4 sightings on each of seeds 1-3 (pass), non-vacuity: > 0 sightings in
  the control.

## Unit tests

Species `rainfallFit` table; stress ordering by tier; mitigation factor; locust budget cap and
lifetime; spray/firebreak clearing; a second swarm has its own budget (rule 10); lick placement
outside a habitat refused; reset restores all three.

## Budgets

Daily step additions < 2 ms; effects + props ≤ 4 draw calls total for this wave.

## Wave exit

Per `ideas-wave-rules.md`, plus: screenshots of a swarm (overview, night) and the salt-lick preset.
