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
  `world.economy` (its owned slices) and emits the matching events. When the animals module owns
  `world.animals`, `reconcileFromWorld()` runs a diff-and-count each day end: the world census
  decides where animals stand, per-species deltas cross only through counted paths (surplus world
  animals are **adopted** into the ledger, booked in `totals.adopted`; ledger animals missing from
  the world are written off as a counted removal, `r.left` + `totals.unmanaged`, never silently
  zeroed — the 2026-09-08 critic sweep caught the old census-copy zeroing a whole staged showcase
  herd down to the module's first spawned newborn).
* `tables.js` — all balance numbers (species economics, staff roles/wages, arrival model constants,
  and since Wave P1 the food web: `FOOD` herbivore need/mass, `DIET` predator prey + kg need,
  `PREY_YIELD`, per-biome plant `SITE` suitability, `VEG` dynamics constants).
* `vegetation.js` — the plant layer (Wave P1, `docs/specs/p1-food-web.md`). This module is the only
  writer of `world.vegetation.cover` (64 × 64 cells of 16 m × 10 plants from `core/Plants.js`):
  * **seeding** from terrain biomes: each cell samples its biome at 4 points → a site suitability per
    plant (`SITE`; water and ROAD_DUST are 0). Grasses start at 60–100 % of their dry-season ceiling;
    shrubs/trees are individuals (present with P = site × 0.6, then 50–100 % of their ceiling). Uses
    its own `Rng('veg:<seed>')` stream so the sim's economy/population stream is untouched. Reseeded on
    `terrain:ready` and on a whole-world `terrain:modified`;
  * **daily growth**: logistic toward K = maxCover × rainfallFit(tier, rain) × site at rate
    spread × fit, plus neighbour seeding (spread × fit × 0.5 × (4-neighbour mean − c) while c < K), so a
    planted patch grows outward where the soil allows. Rain = 0.4 dry / 0.8 wet − 0.35 × drought
    strength + 0.2 × today's weather rain. Above a (dry-season) ceiling cover dies back ≤ 10 %/day;
  * **grazing**: per habitat and plant, pressure P = Σ over the species eating it of (herd need ÷ that
    species' food). P ≤ 1 scales regrowth by (1 − 0.5 P); P > 1 eats the standing cover at
    (P − 1) × 10 %/day grass, 5 % shrub, 2 % tree (≤ 50 %/day). As cover falls, food falls, P rises:
    overgrazing runs away unless the herd shrinks — that is the intended feedback;
  * **food-coupled capacity** (sim.js `_capacity`): herbivores `min(area/space, food ÷ need)` with
    food = Σ cells Σ plants attracting it (cover × food × 0.0256 ha); predators
    `min(area/space, preyKg × PREY_YIELD ÷ needKg)` where preyKg is an EMA (rate 0.15/day) of the
    live biomass of the prey in their `DIET` — hunger lags the prey. Predator quality uses the same
    lagged diet-prey count, and kills now come only from diet prey (lions no longer take elephants).
* `worldgen.js` — synthetic park builder used by its own showcase (a self-contained park so the
  module can be screenshotted and tuned alone). The staged presets use it with a right-sized crew
  and herd (see "Presets") because the staged environment loads the real buildings catalogue
  through the optional-dependency closure, and its upkeeps price in.
* `test.mjs` — deterministic tests (`node src/modules/simulation/test.mjs`), including a
  same-seed-reproduces-identical-90-day-history determinism check and a different-seed-diverges check,
  round-3 births-mechanics tests (breeding needs happiness, the room term caps herds at capacity,
  replan(), spend(), injectEvent) and staged-population reconciliation tests (a staged herd mirrored
  into world.animals holds and stays accounted; a ledger-only herd is written off as counted
  removals, never silently).
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
spend(amount, reason) → cash | null               // charge (+) / refund (−) — the public economy API
                                                  //   other modules use instead of writing
                                                  //   world.economy.cash (docs/requests/tools.md #1);
                                                  //   logs {day, amount, reason}, emits economy:updated
getSpendLog(n=50) → [{day, amount, reason}]
buyAnimals(species, habitatId, n=1) → {ok, cost}  // spawns via the animals hook in a habitat cell
setPopulation(habitatId, species, n)
habitatStat(habitat, force) → stats               // measured water/shade/cover/grass/roughness/area
                                                  //   behind scoreHabitat (cached per day)
replan() → plannedArrivals                        // re-plan today from the live state (demo/debug:
                                                  //   a park built after init() spawns animals and sets
                                                  //   its price after day 1 was already planned)
injectEvent(type, opts) → event | null            // debug/harness: force 'drought' | 'disease' |
                                                  //   'poachers' through the normal event paths
speed(n) / reset(seed) / runDays(n) / markStart()
plant(type, x, z, radius, cover=0.25)             // plant a core/Plants.js id in a disc: cells get
  → {ok, cost, cells, ha}                         //   cover ≥ min(cover, maxCover) on prepared ground
                                                  //   (site ≥ 0.8); charges cost × ha via
                                                  //   spend(…, 'plant'); refused (nothing written or
                                                  //   charged) when cash < cost; emits vegetation:changed
getVegetation(x, z) → { [plantId]: cover }         // the 16 m cell at (x, z)
getFoodReport(habitatId) → { [species]: {n, food, need, perAnimal, capacity, foodCapacity, spaceCapacity} }
                                                  //   herbivores: food units/day (core/Plants.js unit);
                                                  //   predators: kg/day prey offtake (lagged biomass × 0.05)
species(name) → row / allSpecies() → row[]        // sim-side table: price, feed, vet, space, prefs
getSim() → Simulation                             // raw instance (debugging / composers:
                                                  //   reconcileFromWorld() + markStart() after
                                                  //   spawning animals outside this API)
```

`report` shape (sim.js): `{day, cash, income, expenses, net, incomeBreakdown, expenseBreakdown,
visitors, inParkPeak, lodgeNights, satisfaction, satisfactionBreakdown, reputation, attraction,
population, happiness, habitats, born, died, left, predation, staff, staffCoverage, morale,
prosperity, efficiency, spend, season, weather, loans, bankrupt, vegetation, events, activeEvents}`.
`report.habitats[id].species[s]` now also carries `spaceCapacity`, `foodCapacity`, `food`;
`report.vegetation = {rain, changed}`; the daily step's timing is in `getState().vegetation.stepMs`
(kept out of the report so same-seed reports stay byte-identical).

Key balance numbers (tables.js): base arrivals 100/day at reputation 0.5; reference price 25 with
elasticity 1.3 (the price factor clamps at 2.0, i.e. ≈$12 and below all arrive the same); group size
4 per vehicle; tours 4 h; gate open 7–16; bankruptcy at cash < −50,000 for 5 consecutive days;
animals migrate after 3 consecutive days unhappy (< 0.30); breeding drive ramps from happiness 0.45
to full at 0.75 (round-3 retune: the old hard 0.5 gate × the old 0.0015–0.008/day breed rates
measured 0 births in the demo's first month — births per animal per day at full happiness now
0.002–0.011 by species, and the room term 1 − n/capacity still caps herds at carrying capacity).

### Events

| event | direction | payload |
|---|---|---|
| `economy:updated` | emits | `{cash, income, expenses, day}` |
| `sim:day` | emits | `{day, report}` |
| `vegetation:changed` | emits | `{x0, z0, x1, z1}` world metres — after seeding (whole world), after `plant()` (the planted rect), and after each daily step (bounding rect of the cells where any plant moved ≥ 0.02 since the last emit; none when nothing did) |
| `terrain:ready`, whole-world `terrain:modified` | consumes | reseed the vegetation from the (new) biomes |
| `visitor:sighting` | consumes | `{species, vehicleId, distance}` (feeds daily sightings) |
| `habitat:changed`, `zone:changed`, `road:added/removed/changed`, `building:placed/removed`, `terrain:modified` | consumes | habitat-quality cache invalidation |

## Modules consumed (all optional)

`animals`, `zoning`, `buildings`, `traffic`, `roads` — population reconciliation, habitat
measurement, upkeep bills, sightings. Each is null-checked; the module stays fully functional
headless with none of them present (that is how its tests run).

## Presets

| preset | tod | what it shows (measured 2026-09-25, seed 1; identical at any `tod`, see below) |
|---|---|---|
| `overview` | 15 | the synthetic park at $20 volume tickets, right-sized crew: herd 98 → 134 (42 births, 6 deaths), arrivals ~223/d (base 100), cash +$16.6k over 60 d — **but the typical day loses money (median net −$284/day over the 60 daily reports)**; the gain comes from event windfalls (travel-writer spikes, grants) |
| `boom` | 11 | a **price-driven** boom — $15 tickets, wetter/shadier habitats, gravel road: arrivals ~310/d (+39 % over overview), median day +$706, cash +$58.8k over 60 d. Births are *lower* than overview (32 vs 42): the habitat tweaks do not raise happiness, and both parks end within a few animals of the ~140 carrying-capacity ceiling (boom exactly 140, overview 134) |
| `bust` | 17 | over-priced + no water: births stall (6), 21 deaths, herd 193 → 178, arrivals collapse (~7/d average, 0 after week one), cash −$419k and the bank forecloses (BANKRUPT stamp on the panel) |
| `close` | 16.5 | 30-day run: the habitat-quality matrix (every species × every habitat) beside a growing population (99 → 108, 15 births) |
| `night` | 21.5 | same park as `overview` after dark on its own seeded stream (different weather/events: herd 98 → 109, cash +$28.7k) — the dashboard is unlit HUD geometry so it stays readable |

**Staged runs are independent of the capture hour** (fixed 2026-09-25): `stage()` starts the sim at
06:00 on day 1 whatever `tod` the preset is viewed at, then restores the viewing hour. Before, the
sim clock started at `tod`, so the same preset and seed gave 46 vs 42 births at 15 h vs 6.5 h.
Verified: `overview` at 15 h and 6.5 h, and `bust` at 17 h and 3 h, produce identical numbers.

Staged herds are spawned into `world.animals` through the same animals-module hook the sim itself
uses, so `stage()` ends with `world.animals.size == sim.count()` and the population sparkline shows
the real herd — not a ledger-only phantom (that mismatch is exactly what the old reconcile bug
punished; the regression tests in test.mjs pin it).

## Measured

### P1 follow-ups (integrator, 2026-09-26; seed 1, live park, SwiftShader)

Changes: the park demo now plants the whole woodland (aloe 0.3 + marula 0.25) and the whole wetland
(sedge 0.9 + red oat 0.6); `CONST.starveRate` 0.08 → 0.03; `VEG.rootReserve` 0.1 (grazing never takes
a cell below 10 % of its ceiling). Tests 110/110; harness baseline, determinism, poaching, price-sweep,
plant-aloe, remove-prey all OK, 0 console errors, determinism identical.

| | P1 as merged | after follow-ups |
|---|---|---|
| $15 net/day | +$505.90 | **+$433.13** |
| baseline $25 net/day | −$1,513.27 | −$2,496.83 |
| poaching 100 d: animals end · elephants · lions | 71–79 · 2–3 · 1 | **95 · 5 · 3** |
| woodland elephant capacity day 30 (demo park) | 2–3 | **5** (food cap 11) |
| plant-aloe (demo planting stripped for both runs) | 5 vs 2 | 5 vs 2 (food cap 11 vs 2) |
| remove-prey lions | 3 held to day 15, 0 by day 19 | 3 → 2 on day 8, 1 on day 16, 0 by day 18 |

The opening-park economy is back to the pre-P1 numbers **to the cent**: with the planting, every demo
habitat's food capacity is at or above its space capacity, so `min(space, food)` = space and the
starvation step never draws rng. The food web binds only once the player overstocks or stops
planting — the opening park shows no food pressure.

### Wave P1 food web (2026-09-26, seed 1, tod 10, same machine for old and new)

* Tests: **110 passed, 0 failed** — the 89 existing (unchanged; in the synthetic parks only `bust`
  moves: pop d90 93 → 77, traced to the predator hunger lag) plus 21 food-web tests: biome seeding,
  spread + drought, `plant()` cost/refusal, capacity coupling, overgrazing (3000 zebra: grass cover
  0.99 → 0.06 in 5 days, food capacity 706 → 33), prey-removal lag, diet-only predation, determinism
  (**same seed → bit-identical 64 × 64 × 10 cover array after 60 days; different seed differs**), budget.
* Daily vegetation step: **0.76 ms mean, 0.88 ms max** in Node (41k cell-plants); 0.8 ms in the live
  page (SwiftShader container). Budget 5 ms. Per-frame cost 0 (it runs only at day end).
* Fidelity harness, full run, old = P1 base commit `592b50d`, new = this module. 0 console errors in
  both; every old scenario still runs.

| scenario | old | new |
|---|---|---|
| **$15 break-even** (30-day mean net) | **+$433.13/d**, 11 born, 3 died | **+$505.90/d**, 3 born, 7 died (5 predation) |
| $10 / $12 / $20 net | −$747.70 / −$207.77 / −$1,225.90 | −$671.10 / −$130.23 / −$1,073.17 |
| $25 baseline net · births | −$2,496.83 · 11 | −$1,513.27 · 10 |
| $40 / $60 net | −$4,665.33 / −$5,922.67 | −$4,482.27 / −$5,830.57 |
| arrivals $10/12/15/20/25/40/60 | 274/274/267/186/143/80/49 | 275/275/267/189/163/83/50 |
| water −6 m: wetland hippo quality | 0.19 | 0.19 |
| sightings tours vs none | 16 vs 0 | 16 vs 0 |
| bankruptcy day | 17 | 17 |
| determinism (30 d re-run) | identical | identical |
| poaching (100 d, rangers fired) | 2 poached, animals 80 → 100, lions 2, elephants 5 | 10 poached, animals 80 → 71, lions 1, elephants 2 |
| drought 14 d: deaths during / after | 1 / 0 (over by day 28) | 0 / 4 (a second, naturally rolled drought active on day 28) |
| disease impala: vet × · deaths | ×1.31 · 4 | ×1.23 · 11 |
| prosperity rich vs starved | 0.85 vs 0.44, chain holds | 0.86 vs 0.44, chain holds |
| **plant-aloe** (new) | — | elephant capacity day 30: **5 planted vs 2 control** (food cap 11 vs 2), $4,523.52 |
| **remove-prey** (new) | — | lion capacity 4 → 1 by day 6; lions first below control on **day 16**, 0 by day 19 (control 3) |
| **spread** (new) | — | extra red-oat cover 0.025 → **0.066 ha** in 30 d, **0.033 ha under drought**; reach stays 9 cells |

**Why the numbers moved.** Carrying capacity is now food-coupled and the live demo's habitats are
tiny (Plains 2.2 ha, Acacia Woodland 3.0 ha, River Wetland 0.43 ha, Pride Kopje 3.6 ha):
* **River Wetland overgrazes to zero.** 3 hippo + 3 buffalo need 11.4 food units/day against a
  seeded yield of ~10: P > 1, the sedge/red-oat runs away to 0 by day ~20, and both species' capacity
  falls to 1 (happiness ~0.5). This is the main reason births at $15 fell 11 → 3. The change also
  shifts the rng stream, so which days get a kill or a birth differs from the old run.
* **Acacia Woodland is overbrowsed.** 5 elephants + 4 giraffes strip the trees: elephant food
  capacity goes 4 → 2 in 30 days. The `plant-aloe` scenario shows planting reversing it.
* The **$15 break-even survives** and is higher (+$505.90/d vs +$433.13/d). Fewer births means a
  smaller feed bill, and arrivals are unchanged (267/d). It is not a better park: the herds are
  shrinking toward what the food allows. Over the poaching run's 100 days that shows as 80 → 71
  animals vs 80 → 100 before. Fixing it is a park-side call (bigger wetland/woodland, or the
  integrator's "park demo planting" of sedge/trees), not a simulation retune — I did not lower
  hippo/buffalo/elephant needs to protect the old numbers.

### Before Wave P1

* Tests (pre-P1): **89 passed, 0 failed** (`node src/modules/simulation/test.mjs`; 58 pre-round-3 — all
  still passing — plus 22 round-3 tests for the births mechanics, room cap, replan(), spend() and
  injectEvent, plus 9 staged-population reconciliation tests: the ledger-only write-off, the
  mirrored showcase park (193 staged → 219 on day 30, every animal accounted: born/died/left),
  and census adoption), determinism verified: the same seed reproduces an identical 90-day
  history; a different seed diverges.
* Live-park fidelity harness (`tools/fidelity.mjs`, re-run 2026-09-25): **$15/day ticket breaks even**
  (the 2026-09-25 park re-run measured +$627/day mean over 30 days — was +$383 on 2026-09-08 before the
  plains habitat moved off the river; a 2026-09-25 re-check in the live park measured +$433/day mean over
  30 days at seed 1/tod 10, same sign — the exact mean is the *park demo's* number and drifts when the
  park side changes, this module only owns the model), **10–15 births per 30 days at every
  measured price (was 0; re-checked 2026-09-25: 11 born in 30 days at $15)**, 0 migrations (re-checked:
  0), predators alive (re-checked: 3 lions), poaching/drought/disease/prosperity
  chains all demonstrated — see the park README for the full table.
* Staged showcase parks (re-measured 2026-09-25 by reading back `getSim().getHistory()` and
  `totals` in the page): `world.animals.size == sim.count()` at every preset; numbers as in the
  Presets table. The panel descriptions were rewritten to match them (boom is price-driven, overview's
  cash gain is event-driven).
* Draw calls of the module itself: **2** (empty group + one helper); all visible geometry belongs to
  other modules.

## Known gaps (honest)

* **Food web (Wave P1):**
  * **No insectivores** among our 12 species, so the original's "insects come free with grass/shrub
    cover" rule does not apply this wave.
  * **Overgrazing floor added after merge** (`VEG.rootReserve` 0.1, see P1 follow-ups). Previously: Cover can be grazed to 0, and grass only regrows from neighbours,
    so an overstocked habitat never recovers until the herd shrinks. The demo's River Wetland does
    exactly this (see Measured). A root-reserve floor (e.g. ≥ 10 % of the site ceiling) would be more
    realistic. It was not added this wave because it would need another full harness run.
  * **Herbivores over their food capacity only get unhappy** (the existing over-capacity happiness
    penalty, then migration or unhappy mortality). There is no starvation death for them. Predators
    do starve (0.03/day per animal over capacity; 0.08 at merge), because happiness alone stalled lions at exactly
    0.30 on the live park, just short of the < 0.30 migration threshold.
  * **Habitat `grass` stat is still biome-derived**, not read from `world.vegetation`. Overgrazing
    lowers capacity, not the grass-preference term of quality.
  * **Partial terrain edits don't touch the plant layer.** A road or flattening leaves the vegetation
    under it until the next whole-world reseed. Only `terrain:ready` and a whole-world
    `terrain:modified` reseed it.
  * **Spread is capped by the soil.** Neighbour seeding only fills a cell up to that cell's own site
    ceiling. On the live map the free ground around a planted red-oat patch already sits near its
    ceiling, so `spread` shows the patch maturing but not advancing: its reach stays at the 9 planted
    cells. The unit test shows real outward spread (9 → 21 cells) on cleared grassland.
  * The **predator lag is long in big herds**. Lion Ridge (synthetic, 56 prey) takes 20 days before
    lions fall; the live Pride Kopje (14 impala) takes 16. It is driven by the prey-biomass EMA
    (0.15/day) plus the capacity/starvation step.
  * Food units and needs are ours and scaled to the demo's 2–4 ha habitats, not real-world kg/ha.
  * **Staged showcase presets were not re-captured.** The synthetic-park tests give byte-identical
    numbers for baseline/boom, so they are expected to hold, but the README preset table is
    unverified for this wave.

* **The $20 overview park is not profitable day to day** (median −$284/day); its 60-day cash gain is
  event windfalls. Not tuned yet: the fidelity harness says $15 is the break-even price.
* **Poaching targets high-*appeal* species** (in the live game `appeal` overwrites `rarity`), so zebra
  and ostrich count as targets; and a poaching event leaves no lasting reputation cost.
* **A bankrupt park keeps frozen visitor sentiment** (satisfaction/reputation from before the collapse
  stay on the panel with 0 visitors) and its staff morale does not react to foreclosure.

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
