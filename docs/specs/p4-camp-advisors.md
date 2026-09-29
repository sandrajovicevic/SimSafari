# Wave P4 — Camp-side management lite + advisors (contract)

Shipped 2026-09-29 on `claude/p4-camp`. Below the fold is the original contract; measured results
here (full tables: the module READMEs' "Wave P4" sections; deviations with reasons:
`docs/requests/p4.md`).

* **Tiers** — `setRoomRate` / `getLodging` / `report.lodging` per §1 (refRate 60/110/180, ε
  1.4/1.0/0.6, quality 0.55/0.70/0.85, base share 0.5/0.3/0.2 — all as proposed and confirmed by
  measurement). One extension: **half of a tier's unmet demand spills up one tier** — without it a
  park with full budget beds strands the demand (the no-spillover version failed the economy
  tests; docs/requests/p4.md #2). Harness `lodging-elasticity` PASS: measured instantaneous
  elasticity **tent 1.44 > cottage 1.22 > lodge 0.41** (wants 40/24/13 at 0.7×/1×/1.5×), occupancy
  non-increasing in rate per tier over 30-day runs, every tier occupied at 1×.
* **Demo-park numbers, old → new (30-day means, seed 1; the intended move of §5):** lodge income
  **$2,970 → $3,219/day** at the $25 baseline and **$4,594 → $5,793/day** at $15; baseline net/day
  **−$2,496.83 → −$2,883** (the cottage's $520/day upkeep, partly offset); **$15 break-even
  +$433.13 → +$941.23**. `determinism.identical` unchanged (true).
* **Village trust** — per §3 (start 0.6, 0.03/layoff capped 0.3/day, 2%/day drift,
  `+0.06×max(0, 0.5−trust)` inside the existing poachP clamp, no new rng draws). Harness
  `layoff-chain` PASS: trust 0.488 vs 0.607 at day 5 and still 0.624 vs 0.696 at day 45 with
  everyone re-hired on day 25; expected poach rate Σ 0.235 vs 0.194; **event counts 0 vs 0** —
  strict count separation is unmeasurable at the demo's ~0.26%/day exposure (pass = rate strictly
  higher + count not lower; docs/requests/p4.md #3). The 60% layoff is taken over the combined
  keepers+maintenance crew (per-role rounding left trust above the 0.5 line).
* **Advisors** — `advisors.js` pure and node-tested; shipped signature `advise(report, state) →
  {messages, state}` (a bare prev-list cannot carry the 3-day cooldown clock; docs/requests/p4.md
  #1). 13 rules across ecologist/treasurer/liaison with hysteresis bands, cooldown-after-clear and
  critical-first ordering; `getAdvice()` exposes the rows.
* **buildings/park/ui** — `cottage` catalogue row + procedural builder (verified in
  `p4-cottage-close-16` / `p4-cottage-night-21_5`: stone plinth, plaster walls, corrugated gable,
  screened veranda, rain tank, door lantern glowing at night); `tier` on all guest rows (and on the
  sim's fallback rows — tent/cottage sit ABOVE lodge there, the 'camp' keyword trap); the demo
  pitches one of each tier and sets the reference rates; ui "Camp & Advisors" panel (`C`): tier
  rate sliders + occupancy cards, the three personas with expandable messages, village-trust
  readout (`ui-camp-auto-dom`). All captures read, 0 console errors.
* **Tests** — 205/205 (178 pre-P4 + 27 P4: tier demand monotone per tier, measured ε ordering,
  zero-beds tier, ledger round-trip, trust drop/cap/no-restore-on-rehire/10-day memory/poach term,
  advise hysteresis + cooldown + ranking + determinism, byte-identical tiered runs). The shared
  worldgen fixture is unchanged — a building-list change rippled into the fire/economy tests, so
  tiers are tested on a dedicated in-test park.

Agenda: `docs/ideas-roadmap.md` Wave P4. Mechanics source: `docs/ideas-simsafari-1998.md` (patterns
only; advisor names, texts and numbers are ours). After P3, whose missions may reference occupancy
and cash. Read `ideas-wave-rules.md` first. Branch: `claude/p4-camp`.

## What already exists (do not rebuild it)

Measured on `main` at 83312d2, `simulation/sim.js`:
- **Lodging** is one aggregate: `_lodge()` sums beds over every building with `beds` (the `lodge`
  has 24, a `tent` unit has 2) at a single `lodge.rate` (default 120). At 17:00,
  `want = arrivals × lodgeShare × quality × (0.5 + 0.5 × satisfaction)`, capped by beds.
  **There is no price response in lodging**: the room rate changes revenue, not demand.
- **Staff balance** already exists: `_staffNeeds()` per role (ranger/area, keeper/animals,
  guide/arrivals, maintenance/buildings+roads, lodge/beds) → `staffCoverage`, which feeds morale and
  efficiency. Village `prosperity` follows arrivals + morale + employment.
- **Poaching** already rolls daily with `poachP = f(morale, ranger coverage, prosperity, ranger
  stations)` — the `poaching` harness scenario covers "fire the rangers".

P4 adds the missing pieces: **tiered lodging with a price response**, and **village trust as a
lagged memory of layoffs** that feeds poaching even after staff are re-hired.

## Shared data (integrator, core)

- New building type **`cottage`** in `buildings/catalogue.js` (buildings module: catalogue row +
  procedural builder; our own design), beds ~6, between tent and lodge in cost and appeal. Request
  it via `docs/requests/buildings.md` if the builder is not the buildings owner.
- Each guest building declares `tier: 'tent' | 'cottage' | 'lodge'` in its catalogue row.

## Ownership

| owner | does | never |
|---|---|---|
| **simulation** | per-tier occupancy + rates + revenue in the ledger; village trust; the trust → poaching term; tests; harness | draw, DOM |
| **buildings** | `cottage` catalogue row + mesh; `tier` on guest rows | economics |
| **park** | demo park: one of each tier placed; default rates | occupancy math |
| **ui** | rate sliders per tier; occupancy readout; the three advisors | compute state other than the pure `advise()` below |

The roadmap lists `park` for occupancy. The ledger lives in `simulation`, so occupancy is computed
there; `park` only places buildings and sets the demo's starting rates.

## simulation — required behaviour

1. **Tiers**: `setRoomRate(tier, rate)` / `getLodging()` →
   `{ [tier]: { beds, occupied, rate, occupancy, revenue } }`, also `report.lodging`.
   Demand per tier: `want_t = arrivals × lodgeShare × share_t × quality_t × (0.5 + 0.5 × sat) ×
   (refRate_t / rate_t)^ε_t`, capped by that tier's beds. Proposed `ε`: tent 1.4, cottage 1.0,
   lodge 0.6 (budget travellers are price-sensitive; lodge guests less so). Proposed `refRate`:
   tent 60, cottage 110, lodge 180. Calibrate and record the final numbers.
2. **Occupancy → arrivals**: overnight guests count as visitors that day (as `lodgeNights` does
   today), and a tier's occupancy feeds satisfaction/reputation only through the existing
   satisfaction terms. Do not add a second arrivals model.
3. **Village trust** `trust` 0..1 (starts 0.6), in `report.villageTrust`:
   - a layoff (`fire(role, n)`) drops trust immediately by `0.03 × n` (capped at 0.3 per day);
   - trust drifts toward `0.5 × prosperity + 0.5 × employmentRatio` at a slow rate (~2 %/day), so a
     layoff is **remembered for weeks** after re-hiring;
   - poaching gains a term `+ k × max(0, 0.5 − trust)` inside the existing `poachP` clamp. Keep the
     existing rng roll: **no new draws on the main stream** (rule 11).
4. **Advisors are data, not sim**: a pure `advise(report, prevAdvice)` in
   `simulation/advisors.js` (node-testable, no DOM) → `[{ advisor, level, key, text }]`.
   Three personas of our own: **ecologist** (animals, vegetation, fire), **treasurer** (cash, rates,
   occupancy), **community liaison** (staff balance, trust, poaching). Levels
   `info | warn | critical` from state thresholds, with **hysteresis** (a message that fired stays
   until its metric recovers past a second threshold) and a ≥ 3-day cooldown per key, so the panel
   does not flicker. Exposed as `getAdvice()`.
5. Free play with the demo park must keep `baseline`/`determinism` identical **or** the change is
   stated with old vs new numbers (tiered rates will move lodge income — say by how much).

## ui

Rate slider per tier (only tiers with beds), occupancy % per tier, and an advisors panel: three
portraits-as-icons with the current highest-level message each, click for the list. DOM only,
updated on `sim:day`.

## Harness (simulation, additive)

- `lodging-elasticity` — for each tier, three rates (0.7×, 1×, 1.5× ref), 30 days each: occupancy
  is non-increasing in rate per tier (pass), and the measured elasticity orders tent > cottage >
  lodge (pass). Non-vacuity: at 1× each tier's occupancy is > 0.
- `layoff-chain` — control vs "lay off 60 % of keepers + maintenance at day 5, re-hire them at
  day 25", 90 days, **rangers untouched** (so ranger coverage cannot explain the result): trust
  in the layoff run is below control from day 5 and still below at day 45 (the lag), and poaching
  events over days 5–90 are higher than control. Non-vacuity: the control has trust ≥ 0.5.
  Poaching is stochastic: assert on the expected rate (sum of daily `poachP`, add it to the
  report) as well as on the count, and state both.

## Unit tests

Tier demand monotone in rate; zero beds → zero occupancy; trust drop on `fire()`, recovery rate,
re-hire does not restore instantly; `advise()` hysteresis and cooldown against a scripted report
sequence; determinism with tiers present.

## Budgets

Daily step + advisors < 1 ms. `cottage` mesh within the buildings soft cap (instanced if > 20).

## Wave exit

Per `ideas-wave-rules.md`, plus: screenshots of a cottage (close + night) and the advisors panel;
old vs new lodge income in the demo park.
