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
                                                  //   'fire' | 'locusts' | 'poachers' through the
                                                  //   normal event paths (locusts: see P5 below)
placeSaltLick(x, z) → {ok, id, cost}              // Wave P5: inside a habitat only; $3,500 via
                                                  //   spend(…, 'saltlick'); emits saltlick:changed
removeSaltLick(id) → boolean / listSaltLicks() → [{id, x, z, radius, strength}]
sprayLocusts(x, z, radius=48) → {ok, swarms, ha, cost}
                                                  // Wave P5: cuts swarm density in the disc by
                                                  //   80 %, $180/ha via spend(…, 'spray')
speed(n) / reset(seed) / runDays(n) / markStart()
plant(type, x, z, radius, cover=0.25)             // plant a core/Plants.js id in a disc: cells get
  → {ok, cost, cells, ha}                         //   cover ≥ min(cover, maxCover) on prepared ground
                                                  //   (site ≥ 0.8); charges cost × ha via
                                                  //   spend(…, 'plant'); refused (nothing written or
                                                  //   charged) when cash < cost; emits vegetation:changed
getVegetation(x, z) → { [plantId]: cover }         // the 16 m cell at (x, z)
getBiodiversity() → { richness, shannon, evenness, bigFive, plantRichness, index }
                                                  // Wave P3. Pure read of the ledger + vegetation
                                                  //   (leopard: null — not in this park); cached per
                                                  //   day + vegetation version; also on every daily
                                                  //   report as report.biodiversity
setRoomRate(tier, rate) → rate                     // Wave P4: tier 'tent'|'cottage'|'lodge',
                                                  //   clamped 10..500; demand answers from the
                                                  //   next 17:00 check-in
getLodging() → { [tier]: {beds, occupied, want, rate, occupancy, revenue} }
                                                  // Wave P4: last check-in (on-demand if none
                                                  //   yet); want is uncapped demand — 50% of a
                                                  //   tier's unmet demand spills up one tier
getVillageTrust() → 0..1                          // Wave P4: village trust (report.villageTrust)
getAdvice() → [{advisor, level, key, text, since}]
                                                  // Wave P4: today's advisor messages (pure data
                                                  //   from advise(); see advisors.js)
listMissions() → row[]                             // Wave P3: { id, name, brief, goal, deadlineDays,
                                                  //   stars } (frozen table rows, missions.js)
startMission(id) → { ok, error? }                  // start on the current day (resets mission state,
                                                  //   not the park); park auto-starts one from
                                                  //   ?mission=<id> after the demo builds
abandonMission()                                   // back to no mission (no completed event)
getMissionState() → { id, status 'none'|'active'|'won'|'failed', day, deadline, progress 0..1, stars, detail }
getFoodReport(habitatId) → { [species]: {n, food, need, perAnimal, capacity, foodCapacity, spaceCapacity} }
plantQuote(type, x, z, radius) → { cells, ha, cost, affordable }   // prices a plant() without writing (2026-09-26)
unplant(token) → boolean   // undo: plant() now also returns `undo`; restores exact prior cover/site, refunds
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
prosperity, efficiency, spend, season, weather, loans, bankrupt, vegetation, biodiversity, events,
activeEvents}` (`biodiversity` = Wave P3; `lodging`/`villageTrust`/`poachRisk` = Wave P4 — per-tier occupancy, village trust, and the day's poaching probability;
`rainfall = {rain, stressed}` and `locusts` = Wave P5 — the day's rain value with the species it
stresses, and the locust stats slice from `LocustSwarms.stats()`).
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
| `mission:progress` | emits | Wave P3: `{id, progress, day}` once per day end while a mission is active |
| `mission:completed` | emits | Wave P3: `{id, won, stars, day}` exactly once when a mission is won or fails (abandon emits nothing) |
| `fire:building` | consumes/emits | unchanged (Wave P2); Wave P4 counts each emission against a survive-fire mission |
| `saltlick:changed` | emits | Wave P5: `{id, removed?}` after place/remove (props rebuilds its instanced meshes) |
| `locusts:changed` | emits | Wave P5: `{version}` after any swarm spawn/death/density change (effects follows) |

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
### Wave P2 — fire (2026-09-26, branch `claude/p2-fire`)

The vegetation grid doubles as the fire model: per-cell state (unburnt / burning / burnt-regrowing),
scorch 0..1 and wetness 0..1, all exposed on `world.vegetation` for renderers. Fire spreads per sim
day from an established front with chance `spreadBase(0.32) x fuel x dryness x wind`, burns 2 days,
then drops each plant's cover to its per-form residue (grass 8 %, shrub 12 %, tree 55 %) and sets
scorch 1. Scorch decays ~2.5 %/day (with rain), dampening regrowth by up to 70 % — burnt ground is
visibly slower to recover. Natural strikes: dry season + rainless day + >= 20 d since the last one,
with a 150-cell containment budget (~3.8 ha) so wild fires self-limit; scripted fires
(`injectEvent('fire', {x, z, radius})`) are unlimited. New APIs: `firebreak(x0,z0,x1,z1,width)`
($200/ha — bulldozes to 0.005/plant so total fuel lands under the 0.06 carry-fire line; regrows at
15 % rate, so breaks need re-cutting), `waterDrop(x,z,r)` ($120/ha, ~7 days of wetness),
`fireStats()`. Buildings: a burning cell over a footprint emits `fire:building {id, rebuildCost}`
once; the park marks it burnt (stops contributing), rebuilds after 8 days at 40 % of base cost.
Harness: `fire-response` (defended 7.1 ha / 0 buildings vs unprotected 13.4 ha / **7 buildings**)
and `fire-regrowth` (median scorch 0, fuel 0.219 -> 1.393 over 90 d). 129/129 unit tests.
| **spread** (new) | — | extra red-oat cover 0.025 → **0.066 ha** in 30 d, **0.033 ha under drought**; reach stays 9 cells. Re-verified 2026-09-26 after the P2-prep merge: 0.025 → **0.051 ha**, drought **0.033 ha** (slight shift from the root-reserve tuning; scenario criterion corrected the same day — see tools/fidelity.mjs — it had also required window-wide mature cover to grow, which the dry-season equilibrium contradicts) |

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

### Wave P3 — biodiversity + missions (2026-09-28, branch `claude/p3-missions`)

**Biodiversity** (`biodiversity.js`, pure; `getBiodiversity()` + `report.biodiversity`): richness
(species with n > 0 of the 12), Shannon H over counts, evenness J = H/ln(richness) (0 at ≤ 1),
`bigFive` = elephant/rhino/buffalo/lion counts **+ leopard: null — we have no leopard and no species
is substituted under that name**, plantRichness (plants with park-wide mean cover ≥ 0.02, one flat
pass over the 64² × 10 cover array), and
`index = 100 × (0.40·richness/12 + 0.30·evenness + 0.20·bigPresent/4 + 0.10·plantRichness/10)`.
No rng, no timing; cached per (day, vegetation version). **Demo park, seed 1, day 1: index 88.45**
(richness 11, H 2.0605, J 0.859, 4/4 big five, 6/10 plants — above the 0.02 mean line: red-oat,
couch, lovegrass, sedge 0.0225, aloe, umbrella thorn; below: sour-plum 0.0157, knobthorn 0.0092,
marula 0.0107, baobab 0.0122). Idle 240-day drift: 88.45 → 89.58 → 89.30 → 87.69 (wet-season plant
growth lifts it mid-window).

**Missions** (`missions.js`): table + `MissionRunner`. The evaluator runs once per day end after the
report is built; a survive-fire mission's scheduled ignitions run at the top of the day end (so they
land in that day's report and spread the same evening). Scheduled fire days/places draw only from
`Rng('mission:<id>:<seed>')` — the main economy stream is untouched, and **free play (no mission) is
bit-identical to the pre-P3 game** (all 130 pre-P3 tests pass unchanged; a started-then-abandoned
mission leaves a 60-day run byte-identical). Each scripted fire carries its OWN stamina budget
(`ignite()` resets the budget when nothing is burning; the schedule spaces fires ≥ ~20 days apart).
Building losses count `fire:building` emissions during the window; hectares count the vegetation
layer's monotone `burntOutTotal` delta — any fire in the window counts (it is a fire season).

Star brackets (documented per type): population = count at the win `[n, n+2, n+4]`; hold = streak
days then the run's mean above the floor `[days, +2, +4]`; cash = amount then the share of the
deadline left `[amount, 0.25, 0.5]`; survive-fire = loss limits `[{1 b/20 ha}, {0 b/10 ha}, {0 b/4 ha}]`.

**Calibration (measured on the demo park, seed 1, fresh page loads; every placeholder the spec gave
was changed with the reason recorded — see docs/requests/p3.md for the full measurement table):**

| mission | spec placeholder | shipped | measured reason |
|---|---|---|---|
| pride | 6 lions / 180 d | **hold 6+ lions for 60 days / 180 d** (2026-10-01) | the population version was won by buying 3 lions (\$27k) on day 2. Full game, seed 1, 180 d: idle 3 → 1 lions; buy 3 → 6 for 7 days, then they starve; buy 7 → ≥ 6 for 15 days; prey only (15 zebra + 15 impala) → 3 lions, 0 cubs; buy 3 lions + that prey (\$57k) → 6 held 164 days. 0 cubs in every run, so a births goal would be unwinnable. Stars = mean pride over the run (6/8/10). The node fixture's richer prey keeps 6 bought lions alive (won day 63 in test.mjs): the hold resists buying only where the range cannot feed them |
| balanced-range | index ≥ demo+10 for 60 d | **≥ 92** | demo+10 = 98.45 is unreachable: richness 11/12 and evenness 0.86 are near ceiling; max achievable is +3.33 (12th species) + ~1/plant. Idle peaks 89.58 (never ≥ 92); the replay (cheetah + sour-plum/knobthorn/marula plantings, \$32.8k) holds ~93–95 and wins day 61 (mean 93.25 → ★1) |
| in-the-black | ≥ \$1.5 M by day 365 | **≥ \$800,000** | idle 365-day net is \$791,777 — every "positive" script earns LESS than idle (attraction is clamped at 1.0; cheaper tickets overcrowd past ~225 visitors/day). The only lever found: the demo runs 2 rangers against a need of 1 — trimming one is coverage-neutral and banks \$130/day → \$838,521, crossing \$800k on ~day 343 (★1) |
| fire-season | 3 fires, stamina 150, ≤ 1 building, ≤ 15 ha | **≤ 20 ha** | idle loses 2 buildings by day 73 (hard fail) but only 4.58 ha; the weekly-water-drop defence saves every building yet loses **15.62 ha** — three stamina-150 fires alone burn ~11.5 ha, so a 15 ha cap punished the defender for saving buildings. **Re-measured 2026-10-01 (P4 economy, full game):** buildings-only drops win ★1 at 10.65 ha; ringing each fire daily alone keeps 0.49 ha but loses 2 buildings; both together win **★3 at 1.08 ha, 0 buildings**, so the ★2/★3 lines (≤ 10 / ≤ 4 ha, no building) are reachable. The harness replay now uses that defence and must earn ★3 |

Harness: `biodiversity` (remove-zebra / add-rhino, both directions, pass) and `mission-replay`
(4 missions × idle+replay from fresh loads, URL-param check, replay-twice determinism). Unit tests:
48 new (Shannon/evenness edges, each goal type met/missed/deadline-edge against synthetic reports,
star brackets, reset clears the mission, second scripted fire's own stamina, idle-fails/defended-wins
fire season, run → reset → re-run byte-identical with a mission running). 178/178 total.

### Wave P4 — tiered lodging + village trust + advisors (2026-09-29, branch `claude/p4-camp`)

**Tiers** (`tables.js LODGING_TIERS`, `sim.js _lodgingNow()`): every guest building declares a tier
(buildings catalogue; fallback rows in tables.js — tent/cottage sit ABOVE lodge there because
'Tented Camp Unit' contains 'camp'). Demand per tier at the 17:00 check-in:
`want_t = arrivals × lodgeShare × share_t × quality_t × (0.5 + 0.5·sat) × (refRate_t/rate_t)^ε_t`,
occupied capped at the tier's beds, **half of a tier's unmet demand spills up one tier** (a sold-out
camp upsells instead of stranding demand — measured, the no-spillover version failed the economy
tests; docs/requests/p4.md #2). Shares renormalise over the tiers that have beds. Room revenue
replaces the old single-rate `lodgeNights × rate`: `Σ occupied_t × rate_t × (0.8 + 0.4·quality_t)`;
`lodgeNights` is still Σ occupied and the satisfaction lodge term still uses the aggregate quality,
so there is **no second arrivals model** (spec §2).

Calibrated numbers (demo park, seed 1): refRate/ε as proposed (60/1.4, 110/1.0, 180/0.6; measured
instantaneous ε from the harness: **tent 1.44 > cottage 1.22 > lodge 0.41**, wants 40/24/13 at
0.7×/1×/1.5×). Occupancy monotone in rate per tier over 30-day runs (tent 0.547/0.965/1.0 at
1.5×/1×/0.7×). **Old vs new demo-park 30-day means: lodge income $2,970 → $3,219 @ $25 and
$4,594 → $5,793 @ $15 (tiers monetize better than the old flat $90-120 rate); net/day −$2,496.83 →
−$2,883 @ $25 (the cottage's $520/day upkeep, partly offset) and the $15 break-even +$433.13 →
+$941.23.** Determinism unchanged (byte-identical same-seed runs with rates in play — tested).

**Village trust** (`TRUST`): starts 0.6; `fire(role, n)` costs `0.03` per person actually let go
(capped 0.3 per day across all calls; firing from an empty role costs nothing; re-hiring restores nothing); drifts 2%/day toward `0.5·prosperity + 0.5·employment` — so a layoff is
remembered for weeks. `poachP` gains `0.06 × max(0, 0.5 − trust)` inside the existing clamp and the
SAME single rng roll (no new draws). Harness `layoff-chain`: trust 0.488 vs 0.607 at day 5, still
0.624 vs 0.696 at day 45 after everyone was re-hired on day 25; expected poach rate Σ 0.235 vs 0.194;
event counts 0 vs 0 (the demo's ~0.26%/day exposure makes strict count separation unmeasurable —
docs/requests/p4.md #3). The report carries `villageTrust`, `poachRisk` (the day's rate) and `lodging`.

**Cross-wave recalibration (P3's `in-the-black` mission):** tiered lodging lifted the demo's idle
365-day net from $791,777 to **$1,192,829**, which made P3's $800k target idle-winnable (crossing on
day 234 — caught by the P4 full-harness run). Recalibrated to **$1,300,000**: idle falls $107k short;
the replay now uses the treasurer's levers (trim the redundant ranger + lodge rate $240, tent $80 →
**$1,524,060**, crossing day 306, ★1). Mission table + harness script updated together; measured
endpoints: idle $1,192,829 / ranger-trim $1,239,579 / trim+rates $1,524,060.

**Advisors** (`advisors.js`): pure `advise(report, state) → {messages, state}` — 13 rules across the
ecologist / treasurer / community-liaison personas, each with a hysteresis band (fires at `start`,
clears only past `clear`; metrics return their raw value inside the band and null only when the
report has no such data, which clears immediately), a 3-day cooldown after clearing, and
critical-first ordering. `losing-money`, `rooms-idle` and `rooms-turning-away` judge a 7-day mean
(`smooth: 7`, kept in the advise state): net income and occupancy swing day to day. Runs at day end after the report; `getAdvice()` returns the messages.
Signature note in docs/requests/p4.md #1. Tests: 205/205 (27 new — demand monotone per tier,
measured ε ordering, zero-beds tier, ledger round-trip, trust drop/cap/no-restore/10-day memory/
poach term, advise hysteresis+cooldown+ranking+determinism, byte-identical tiered runs).

**Verifier fixes (2026-09-30, on this branch):** (1) the layoff cap was per *call*, not per day,
and counted the requested n — 12 one-person layoffs (the ui fires one per click) cost 0.36, two
10-person calls 0.6, "firing" 5 from an empty role 0.15; now per day across calls and on people
actually removed. (2) 7 of the 13 advisor metrics returned null inside their hysteresis band, so
the band was dead code: on the idle demo over 120 days `losing-money` fired 12 separate times in
16 days shown, `understaffed` 12 times in 77, `rooms-idle` 9 in 11, `rooms-turning-away` 12 in 32.
With raw metrics + the 7-day mean on the three money/occupancy rules: 2 / 1 / 1 / 1 separate
firings. (3) `overgrazed` read `perAnimal`, a field `report.habitats` never had, so it could never
fire; the report's habitat species rows now carry `need` (n × per-animal need, as `habitatFood()`)
and the rule reads it. 9 tests added (7 fail on the old code). `herd-unhappy` still oscillates
under stress (9 firings in 75 days shown when every ranger and keeper is fired) — genuine
happiness swings around its 0.45 line, left as is.

### Wave P5 — rainfall axis + locusts + salt licks (2026-10-01, branch `claude/p5-rainfall`)

**Rainfall preference** (`tables.js` species rows, same four tiers and `rainfallFit()` as plants):
hippo, buffalo `high`; elephant, rhino, zebra, wildebeest, impala, lion `medium`; giraffe, cheetah,
warthog `low`; ostrich `drought` (as proposed). **Drought stress** (`_rainStress`, `STRESS`): when
the vegetation `rain` value puts a species' fit below 0.6, its happiness target loses
`(0.6 − fit) × 1.0` and its mortality gains 0.006/day — high-rainfall species are stressed first by
construction (fit falls off with the tier). **Water mitigation**: the stress term is multiplied by
`(1 − 0.6 × waterAccess)` using the habitat's existing measured water proximity, so a waterhole in
the habitat more than halves the hit. Harness `drought-water` (30-day injected drought; the dry
variant strips the wetland habitat's pump + waterhole buildings): **deaths 17 (dry) vs 4 (control)**,
hippo happiness **0.514 → 0.390**, and the ordering check (hippo/buffalo fall before warthog/ostrich) passes.

**Locusts** (`locusts.js`, `LOCUSTS`): seeded outbreaks roll `Rng('locust:<seed>')` at 1.5%/day in
the first 20 days of a wet season that follows a drought; `injectEvent('locusts', {x, z, radius,
days, budget, density})` is bounded by construction — `budget` (default 400 cells) caps total cells
eaten ever, `days` (default 12) its lifetime, a swarm dies at density < 0.05 (natural decay
0.04/day). Each day it eats grass + shrub cover at `0.25 × density` per cell (never trees), drifts
8 m with the weather wind, and loses 0.3 × clearedFraction where cells were burnt or firebroken;
`sprayLocusts(x, z, radius)` cuts density 80 % at $180/ha via `spend(…, 'spray')`. Metric note: the
harness scores **cover volume removed** (`eatenCoverTotal`), not cells touched — a nibbled cell
counted the same as a stripped one and measured only 2.8×; by volume the unmanaged swarm removes
**65.2 cover units vs 16.3 sprayed-on-day-2 (4.0×, ≥ 3× required)**, the firebreak pair passes the
same bar, and every swarm dies within its `days` in all variants.

**Salt licks** (`LICKS`): `placeSaltLick(x, z)` is habitat-gated (refused elsewhere) at $3,500,
radius 10 m; grazers and mixed feeders in that habitat gain a happiness bonus of 0.03 per lick,
capped at 0.06 (predators nothing); `reset()` clears them. Animals get a wander bias toward a lick
in their habitat (60 % of retargets, ±2 m scatter, animals module — it never touches the ledger).
**No sightings effect** (owner decision 2026-10-04): the emergent route, the ×1.5 traffic fallback
(dead code) and a ×2 rework were measured and the effect flipped sign by seed — gathering a roadside
herd onto one spot removes sighting stops along the route. The traffic boost was removed; the
`salt-lick` scenario now gates on herd gathering at the lick and grazer/mixed happiness, with vs
without (`docs/requests/p5.md` #5). Measurement gotcha
(the harness now encodes it): `animals.update` is pause-gated, so at `?speed=0` the settling phase
must pump the clock or herds never move toward anything.

**Daily-step budget** (spec: additions < 2 ms): with 4 swarms alive all 60 days and 3 licks placed,
the day step measured **3.91 ms/day vs 5.41 ms/day baseline** on the same synthetic park — the
difference is inside run-to-run noise (the base itself measured 2.9–5.4 across runs), so the
additions are below measurement resolution. Tests: 245/245 (24 new — tier table fit values, stress
ordering + mitigation factor, locust budget cap/lifetime/spray/firebreak/second-swarm-own-budget,
lick refusal/bonus/cap/happiness move, reset, determinism).

### Predator–prey stability — type-III predation (2026-10-02, branch `claude/predation-response`)

**The bug (verifier-measured, demo park seed 1, idle):** the flat kill rate —
`kills = poisson(rng, min(prey, predators × 0.03))` — never slowed as prey got scarce, so every
predator habitat hunted its base to zero and then starved: Pride Kopje's 3 lions ate 14 impala down
to 0 by day 270 and were extinct themselves by day 270–365 (lions 3/3/1/0/0 and impala 14/6/2/0/0 at
d1/90/180/270/365). Adding prey only delayed the crash (+6 warthog: 4→1 lions by d730; +6 warthog
+6 impala: extinct by d545; +6 zebra: collapsed by ~d180), and captures showed constant
"lion starved / lions leaving" toasts.

**The fix** (`sim.js _populationStep`, `CONST.preyPerPredatorHalf`): a type-III saturating
functional response — `ratio = prey/(predators × 10)`, per-predator kill rate
`0.03 × ratio²/(1 + ratio²)`, still **one poisson draw per habitat per day** (no new rng draws, no
stream-shape change). At prey = 10 per predator the rate is half of 0.03; below that it collapses as
ratio², i.e. a scarce herd becomes hard to find — a prey refuge. **Hunger is unchanged**: the
lagged-biomass path (`hungerRate` EMA → `foodCap` → `starveRate`) still starves predators whose prey
is gone (prey removed from a habitat: lions 5 → 0 within 60 days, before and after).

**Calibration, old (flat) → new (type-III, half-saturation 10 prey/predator):**

| measurement | old | new |
|---|---|---|
| kills at 3 lions × 14 impala | 0.09/day (flat 0.03) | 0.016/day (ratio 0.47 → 0.03 × 0.18) |
| demo kopje, idle 730 d | lions 0 / impala 0 by ~d270 | **lions 4 / impala 25 at d730** (3/14 → 3/14 → 3/21 → 3/26 → 4/25 → 4/25 at d1/90/180/365/545/730; min lions 3, min prey 13) |
| 4 impala under 3 lions, 60 d (node) | hunted to 0 | all 4 survive; lions 3 → 1 via hunger (refuge + hunger both real) |
| prey removed → predators | 5 → 0 in 60 d | 5 → 0 in 60 d (unchanged) |
| `remove-prey` harness | PASS (lag ≥ 3 d) | PASS, lag 11 d |
| baseline netPerDay @ $25 | −$2,883 | **−$2,778.10** |
| $15 break-even netPerDay | +$941.23 | **+$1,100.97** ($12: +$487.73 → +$678.40) |
| determinism.identical | true | true |

The economy move is intended and mechanical: suppressed kills keep ~10 more impala alive in the
kopje (feed +$70/day) but their sightings raise attraction — arrivals 141.57 → 143.97/day @ $25,
income +$133/day, net +$105/day @ $25 and +$160/day @ $15. Half-saturation 10 was the first value
tried and met every acceptance bar (730-day kopje, refuge, starvation lag, remove-prey); it was
left un-tuned rather than shopping for a prettier number.

**Missions, old → new (no recalibration needed — every idle still fails, every replay still wins):**
pride idle fails at 3 lions both; replay ★1 d61 both; the buy-only shortcut still fails (5 lions,
never holds 6). balanced-range idle fails both (bio index 79.2 now); replay ★2 d61 → **★1** d61
(bio 94.62 → 93.18 at the win — the fixed cheetah predation shifts evenness; still a win).
in-the-black idle fails both ($1,192,829 → $1,194,644 at the deadline); replay ★1, crossing d333 →
**d308** ($1,307,321 vs the $1.3 M target — margin ~$7 k, did not flip). fire-season idle fails,
replay ★3 d92, unchanged. New harness `predator-stability` (idle 730 d, lions ≥ 2 and prey ≥ 1 on
every day, start lions ≥ 3 as non-vacuity): PASS — `tools/shots/fidelity-predator-stability.json`.
Tests 254/254 (6 new: refuge, hunger-bites, 730-day coexistence min lions ≥ 2 / min impala ≥ 1,
same-seed determinism, prey-removal starvation).

**Cross-wave interaction (resolved 2026-10-04):** the healthier herds this fix produces exposed that
P5's `salt-lick` sightings bar had been riding single-tour noise, and that the P5 sightline boost was
dead code. A ×2 rework then flipped sign by seed, so the owner dropped the sightings claim: the boost
is removed and `salt-lick` gates on herd gathering at the lick (`docs/requests/p5.md` #4–#5).

## Known gaps (honest)

* **Salt-lick happiness bonus is not measurable in a single full-game run**: the +0.03 target bonus is
  unit-tested, but over 20 days it sits below the run-to-run noise a lick introduces (seeds 1/2/3: mean
  gain days 5–12 +0.022/+0.015/−0.002). Gathering at the lick is robust. Licks make no sightings claim.

* **Wave P3:**
  * **`reset()` is a ledger reset, not a whole-game restart.** In the headless Node game it is a
    byte-identical round trip (tested), but in the live game `world.animals` belongs to the animals
    module — the ledger restore cannot un-spawn a previous run's births — and park rebuilds flatten
    terrain, so same-page A/B variants drift (measured $791,777 → $722,696 across variants). The
    mission-replay harness therefore loads a fresh page per variant; the spec's one-page fallback is
    only safe headless.
  * **The fire-season hectares limit counts every fire in the window**, including natural strikes —
    a natural fire during the season adds to the mission's tally (intended: it is a fire season; the
    20 ha calibration leaves ~4 ha of headroom for one natural strike on seed 1).
  * **Mission fires pick their site near a stream-chosen building** (70 m out, random bearing) — a
    fire season should threaten something. A building standing on bare/impervious ground can yield a
    0-cell ignition; the mission then falls back to the deterministic fuel-richest site.
  * **`in-the-black` is a thin mission** on the current demo park (idle $791,777 vs replay $838,521 —
    the trim-one-reanger lever); see docs/requests/p3.md for the measurement table and proposals.
  * No `mission:started` event (spec lists exactly progress + completed; the park's start toast
    covers the feedback).
  * Biodiversity plantRichness costs one flat pass over the cover array per day (~41 k float adds,
    ≪ 0.5 ms) rather than the spec's literal O(species + plants); the mean cannot be maintained
    incrementally because planting/unplanting/burns edit cover outside the daily step.


* **Food web (Wave P1):**
  * **Predation is type-III since 2026-10-02** (see the Predator–prey stability section) — the old
    "predators eat at full rate until prey hits zero" behaviour is gone; the half-saturation
    constant (10 prey/predator) is calibrated to the demo kopje, not fitted across habitats.
  * **A pride reduced to one lion never recovers on its own** (found while testing the stability
    fix): births need `n ≥ 2`, so an organic poaching event that kills 2 of 3 lions leaves a
    healthy, happy, permanently solitary lion (measured: seed 72, poachers on day 33, lion held at
    1 with happiness 0.73 for 700 days). The player's answer is buying a second lion; the game
    could instead let a lone animal migrate or be relocated — not done this change.
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
