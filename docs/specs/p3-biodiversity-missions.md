# Wave P3 — Biodiversity index + missions (contract)

Shipped 2026-09-29 on `claude/p3-missions`. Everything below the fold is the original contract; the
measured results of shipping are recorded here (full calibration table: `src/modules/simulation/README.md`
"Wave P3"; measurement notes and disagreement proposals: `docs/requests/p3.md`).

* **Biodiversity** — `getBiodiversity()` + `report.biodiversity` exactly per §1 (leopard `null`,
  plantRichness ≥ 0.02 mean cover, index weights unchanged from the proposal). Demo park day 1:
  **index 88.45** (richness 11/12, H 2.0605, J 0.859, 4/4 big five, 6/10 plants); idle 240-day drift
  87.7–89.6.
* **Missions** — table + evaluator + API + the two events per §2–§5. Free play is bit-identical to
  main (all 130 pre-P3 sim tests unchanged; a started-then-abandoned mission leaves a 60-day run
  byte-identical). Calibration (spec placeholders → shipped, reasons measured on seed 1):
  * `pride` — shipped as 6 lions/180 d; **changed 2026-10-01 to a 60-day hold of 6+ lions** within 180 d,
    because buying 3 lions won the population version on day 2. Measured reasons: simulation README
    "Wave P3" table. The replay now buys 3 lions + 15 zebra + 15 impala; a buy-lions-only shortcut
    control must not win.
  * `balanced-range` — floor **demo+10 → 92**: +10 (98.45) is unreachable (richness/evenness near
    ceiling; max play adds +3.33 for the 12th species + ~1 per planted plant). Idle peaks 89.58;
    the replay (cheetah into the kopje + three plantings, $59k) holds 93.4–94.6 and wins day 61 (★2).
  * `in-the-black` — **$1.5 M → $800 k**: idle 365-day net is $791,777 and every positive-action
    script tested earns *less* (attraction clamped at 1.0; cheaper tickets overcrowd). The one lever
    found: the demo runs 2 rangers against a need of 1 — trimming one banks $130/day → $838,521,
    crossing $800k on day 348 (★1). Idle fails $8,223 short.
  * `fire-season` — **≤ 15 ha → ≤ 20 ha**: the weekly-water-drop defence saves every building but
    loses 15.62 ha (three stamina-150 fires alone ≈ 11.5); idle hard-fails at 2 buildings by day 73.
    Defended replay wins day 92 (★1). Stamina 150 per fire unchanged; each fire has its OWN budget.
* **Harness** — `biodiversity` PASS (remove-zebra richness −1 exactly + index falls; buy-2-rhino
  raises bigFive.rhino); `mission-replay` PASS (URL param active on load; 4× idle-not-won +
  replay-won; replay-twice byte-identical; 0 console errors). Variants run from fresh page loads —
  `simulation.reset()` is a ledger reset, not a whole-game restart (world.animals is the animals
  module's; park rebuilds flatten terrain), so the spec's one-page fallback is only safe headless
  (the headless round-trip test exists and passes).
* **ui/park** — objectives panel (top-bar target button / `G`): picker, progress bar, days left,
  stars, won/failed, abandon; completion toast; biodiversity readout (index ring + richness + Big
  Five, leopard "not in this park") in the report panel; `?mission=<id>` starts after the demo
  builds (needed a one-line `parseParams` addition — integrator change commit). Screenshots read:
  `ui/objectives`, `ui/objectives-won`, `ui/report`, full game day 14 h + night 21.5 h with the
  panel open and the start toast, and a real-GPU night check (AMD RX 5700 XT, D3D11, 53.9 fps,
  0 errors). 0 console errors on every capture.
* **Tests** — 178/178 (130 pre-P3 unchanged + 48 P3: Shannon/evenness edges, every goal type
  met/missed/deadline-edge against synthetic reports, star brackets, reset clears the mission,
  second scripted fire's own stamina, idle-fails/defended-wins fire season, run→reset→rerun
  byte-identical with a mission running).
* **Baseline numbers** — unchanged in free play (this run, main-merged branch): baseline net/day at
  $25 **−$2,496.83**, $15 break-even **+$433.13**, `determinism.identical` **true**.

Agenda: `docs/ideas-roadmap.md` Wave P3. Mechanics source: `docs/ideas-simsafari-1998.md` (mission
*patterns* only; every mission, name, number and word here is ours). Depends on P1 (vegetation) and
P2 (fire, for the fire-season mission). Read `ideas-wave-rules.md` first. Branch: `claude/p3-missions`.

## Shared data (integrator, core)

- No new `world.*` field is needed: biodiversity and mission state live inside the simulation and
  are exposed through its API and daily report. If the ui needs push updates, it uses the events below.

## Ownership

| owner | does | never |
|---|---|---|
| **simulation** | biodiversity stat; mission table; objective evaluator at day end; mission API + events; unit tests; harness scenarios | draw anything, touch the DOM |
| **ui** | objectives panel (mission picker, goal, progress bar, days left, stars); completion toast; biodiversity readout in the report panel | compute progress, hold mission state |
| **park** | `&mission=<id>` URL param: start that mission after the demo park builds (harness + screenshots); free play by default | define or evaluate missions |

## simulation — required behaviour

1. **Biodiversity** — `getBiodiversity()` and `report.biodiversity`:
   `{ richness, shannon, evenness, bigFive, plantRichness, index }`
   - `richness` = species with n > 0 (of the 12); `shannon` H = −Σ pᵢ ln pᵢ over animal counts;
     `evenness` J = H / ln(richness), 0 when richness ≤ 1.
   - `bigFive = { elephant, rhino, buffalo, lion, leopard: null }`. **We have no leopard.** Report it
     as `null` and say so in the README and the ui; do not substitute another species under that name.
   - `plantRichness` = plants whose park-wide mean cover ≥ 0.02 (of the 10 in `core/Plants.js`).
   - `index` 0..100, proposed: `100 × (0.40 × richness/12 + 0.30 × evenness + 0.20 × bigPresent/4
     + 0.10 × plantRichness/10)`, where `bigPresent` counts the 4 we have with n > 0. The builder may
     re-weight, but documents the final formula with the measured demo-park value.
   - Pure function of the ledger + vegetation; no rng; O(species + plants) per day.
2. **Missions** — a data table `missions.js`, one row per mission:
   `{ id, name, brief, goal: { type, ... }, deadlineDays, stars: [t1, t2, t3] }`. Goal types:
   - `population` — `{ species, n }`: ledger count ≥ n on or before the deadline.
   - `hold` — `{ metric, min?, max?, days }`: a report metric (e.g. `biodiversity.index`,
     `satisfaction`) stays in range for `days` consecutive days.
   - `cash` — `{ amount }`: cash ≥ amount on or before the deadline (loans count against it:
     use cash − loans).
   - `survive-fire` — `{ fires, stamina, maxBuildingsLost, maxHa }`: the mission schedules `fires`
     scripted ignitions (deterministic days and places from a forked `Rng('mission:<id>:<seed>')`,
     each with the given **`stamina`** — never unlimited), and is won if the season ends inside both
     loss limits.
   Stars: 1 = goal met; 2 and 3 = met with the margin in `stars` (e.g. earlier than the deadline,
   or fewer losses). Keep it simple and documented.
3. **Evaluator** — runs once per day end, after the report is built: updates progress 0..1, detects
   won / failed (deadline passed, or a hard-loss condition), awards stars once. Free play (no
   mission active) changes nothing: the `baseline` and `determinism` numbers must stay identical.
4. **API**: `listMissions()` → rows; `startMission(id)` → `{ ok, error? }` (resets mission state,
   not the park); `abandonMission()`; `getMissionState()` →
   `{ id, status: 'none'|'active'|'won'|'failed', day, deadline, progress, stars, detail }`.
   `reset()` clears mission state.
5. **Events**: `mission:progress` `{ id, progress, day }` (daily while active);
   `mission:completed` `{ id, won, stars, day }` (once).

## Starter missions (ours; numbers are placeholders to calibrate by measurement)

| id | pattern | goal |
|---|---|---|
| `pride` | population-N-within-T | 6 lions within 180 days |
| `balanced-range` | hold-range-for-T | biodiversity index ≥ (demo value + 10) for 60 consecutive days, within 240 days |
| `in-the-black` | cash-by-year | cash − loans ≥ $1.5 M by day 365 |
| `fire-season` | survive-fire-season | 3 scripted fires (stamina 150) over a 90-day dry season; ≤ 1 building and ≤ 15 ha lost |

Calibration rule: each mission must be **winnable** in the demo park by a short scripted play (the
harness replay below) and **not won by doing nothing** (the idle control). If a placeholder number
breaks either, change the number and record the measured reason in the README.

## Harness (simulation, additive)

- `biodiversity` — remove all zebra from the demo park → `richness` drops by exactly 1 and `index`
  falls; add 2 rhino → `bigFive.rhino` rises. `pass` requires both directions.
- `mission-replay` — for each starter mission: a fixed action script (days + public API calls:
  `buyAnimals`, `plant`, `setTicketPrice`, `hire`, `firebreak`, `waterDrop` …) replayed from a fresh
  load → assert `won` with the expected stars; the same mission with **no actions** → assert not won
  (the non-vacuity term). Replay the first mission twice → identical `getMissionState()` (determinism).
  Write `tools/shots/fidelity-mission-replay.json` with per-mission day-won, stars, idle outcome.
  If four missions × two runs is too slow on SwiftShader, run the variants in one page via
  `reset()` **only after** a test proves reset → re-run is byte-identical.

## Unit tests (node, `test.mjs`)

Shannon/evenness edge cases (0, 1, equal counts); each goal type against synthetic reports
(met, missed, deadline edge day); stars thresholds; `reset()` clears the mission; the second
scripted fire of `fire-season` gets its own stamina.

## ui

Objectives panel reachable from the top bar; shows name, brief, progress bar, days left, stars,
won/failed state; picker lists `listMissions()`. Biodiversity: index + richness + the Big-Five row
(leopard shown as "not in this park"). DOM only: 0 draw calls; no per-frame allocation — update on
`sim:day` / `mission:*` events, not in `update()`. Screenshots: panel active mid-mission, won state.

## Budgets

Evaluator + biodiversity < 0.5 ms per sim day. ui: 0 draw calls.

## Wave exit

Per `ideas-wave-rules.md`, plus: all four missions replay-won and idle-not-won; baseline and
determinism unchanged in free play; `game.gameplayFidelity` re-measured by the orchestrator.
