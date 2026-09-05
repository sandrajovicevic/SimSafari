# simulation

The headless economy + population + happiness + visitor simulation — the module that carries gameplay
fidelity to SimSafari (1998). No rendering of its own (its group stays empty; draws come only from
whatever else is on screen). Habitat quality per species, animal happiness driving births/deaths/
migration, visitor arrivals driven by reputation and price, the full income/expense ledger, staff
morale, village prosperity, seeded events and poaching risk. Runs at a fixed 10 ticks per game-hour;
time speed 0/1/3/10 comes from `world.time`.

## How it works

* `sim.js` — the `Simulation` class: daily loop, ledger, population dynamics, visitor flow, events.
  Reads `world.habitats/animals/roads/buildings/vehicles` freely; writes `world.visitors` and
  `world.economy` (its owned slices) and emits the matching events.
* `tables.js` — all balance numbers (species economics, staff roles/wages, arrival model constants).
* `worldgen.js` — synthetic park builder used by its own showcase (a self-contained park so the
  module can be screenshotted and tuned alone).
* `test.mjs` — 58 deterministic tests (`node src/modules/simulation/test.mjs`), including a
  same-seed-reproduces-identical-90-day-history determinism check and a different-seed-diverges check.
* Habitat quality per species = weighted match of the species' preferences (grass/tree density,
  water proximity, roughness, herd space, predator distance) against each habitat's measured
  properties; `zoning.getHabitatQuality` delegates here.

## Public API — `ctx.modules.get('simulation')`

```js
scoreHabitat(habitat, species, opts?) → number    // 0..1 quality for one species
explainHabitat(habitat, species) → terms[]        // per-preference breakdown of the score
getReport() → report                              // most recent daily report (shape below)
getReports(days=30) → report[]
getState() → object                               // full live state
getHistory(days=60) → {day, cash, income, expenses, visitors}[]
getVisitorSatisfaction() → number                 // 0..1
setTicketPrice(p)                                 // clamped 0..500
takeLoan(amount) / repayLoan(amount)              // ~0.0004/day interest accrual
hire(role, n=1) / fire(role, n=1)                 // 'ranger' 'keeper' 'guide' 'maintenance' 'lodge'
setWage(role, wage) / staffRoles() → string[]
buyAnimals(species, habitatId, n=1) → {ok, cost}  // spawns via the animals hook in a habitat cell
setPopulation(habitatId, species, n)
speed(n) / reset(seed) / runDays(n) / markStart()
species(name) → row / allSpecies() → row[]        // sim-side table: price, feed, vet, space, prefs
getSim() → Simulation                             // raw instance (debugging / composers:
                                                  //   reconcileFromWorld() + markStart() after
                                                  //   spawning animals outside this API)
```

`report` shape (sim.js): `{day, cash, income, expenses, net, incomeBreakdown, expenseBreakdown,
visitors, inParkPeak, lodgeNights, satisfaction, satisfactionBreakdown, reputation, attraction,
population, happiness, habitats, born, died, left, predation, staff, staffCoverage, morale,
prosperity, efficiency, season, weather, loans, bankrupt, events, activeEvents}`.

Key balance numbers (tables.js): base arrivals 100/day at reputation 0.5; reference price 25 with
elasticity 1.3; group size 4 per vehicle; tours 4 h; gate open 7–16; bankruptcy at cash < −50,000
for 5 consecutive days; animals migrate after 3 consecutive days unhappy (< 0.30).

### Events

| event | direction | payload |
|---|---|---|
| `economy:updated` | emits | `{cash, income, expenses, day}` |
| `sim:day` | emits | `{day, report}` |
| `visitor:sighting` | consumes | `{species, vehicleId, distance}` (feeds daily sightings) |
| `habitat:changed`, `zone:changed`, `road:added/removed/changed`, `building:placed/removed`, `terrain:modified` | consumes | habitat-quality cache invalidation |

## Modules consumed (all optional)

`animals`, `zoning`, `buildings`, `traffic`, `roads` — population reconciliation, habitat
measurement, upkeep bills, sightings. Each is null-checked; the module stays fully functional
headless with none of them present (that is how its tests run).

## Presets

| preset | tod | what it shows |
|---|---|---|
| `overview` | 12 | synthetic park mid-game: healthy cash, visitors in park, report panel numbers |
| `boom` | 12 | under-priced tickets + high reputation: arrivals surge |
| `bust` | 12 | over-priced + unhappy animals: arrivals collapse, migration |
| `close` | 16 | gate-area view of the synthetic park |
| `night` | 22 | same park after dark |

## Measured

* Tests: **58 passed, 0 failed** (`node src/modules/simulation/test.mjs`), determinism verified:
  the same seed reproduces an identical 90-day history (cash d90 $326,597); a different seed diverges.
* Draw calls of the module itself: **2** (empty group + one helper); all visible geometry belongs to
  other modules.

## Known gaps (honest)

* The village is modelled as staff morale → upkeep efficiency and a prosperity scalar; there is no
  physical village, no village-building layer, and no per-household simulation (SimSafari 1998 had
  one). Documented simplification.
* Visitors are aggregates (counts, satisfaction, seen-species histograms), not individual agents;
  only `traffic`'s vehicles are individually simulated.
* Poaching risk is a ranger-staffing probability that removes animals and emits events — no poacher
  agents to spot or intercept.
* `speed(n)` forwards raw game-hours/second to `app.setSpeed`, while `ui`'s speed multipliers apply
  on top of a 0.05 base — mixing the two APIs multiplies (ui 1× + `sim.speed(1)` = 0.05 gh/s, but
  calling `sim.speed(3)` directly is 60× ui's 3×). Composer-facing quirk; see park README.
* `runDays(n)` fast-forwards the daily loop but not animations/particles (they are other modules'
  concern); screenshots mid-`runDays` show the correct state, not the correct motion.
* README (this file) written 2026-09-05 by the integrator after the original builder was killed by
  an API spend limit before documentation; the code itself is the builder's, unmodified except the
  `optional` list restored from its `TEMP` screenshot-isolation state (see index.js).
