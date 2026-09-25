# simulation — round 7 — score 8.5 / 10 — PASS

Round 6 scored 6.0 solely because the README's preset claims did not reproduce (engine assessed ~8.5
uncapped). This round I re-verified every one of those claims myself, headless and live, and every
single one now reproduces — most to the exact integer. The cap lifts; this report scores the engine
on its merits against ARCHITECTURE §10 (SimSafari 1998 fidelity).

## Evidence (my own runs, seed 1)

- `node src/modules/simulation/test.mjs` — **89 passed, 0 failed**; determinism block passes
  (same seed → cash d90 $328,224 identical; different seed diverges).
- Staged showcase readback (throwaway playwright page eval on each preset URL, reading
  `registry → def.api.getSim()` + `world.economy`/`world.animals`; JSON in
  `tools/shots/simcritic-readback*.json`):
  - **overview @15h**: cash $265,392.86, totals born 42 / died 6 / left 0, herd 134,
    arrivals mean 223.4/d, **median daily net −$284** — README: 42 births, 6 deaths, 134,
    ~223/d, −$284. **Exact.**
  - **overview @6.5h**: cash $265,392.8604958695 and herd 134 — **bit-identical to @15h**.
    The r6 "outcome depends on capture hour" defect is dead: `stage()` pins the sim start to 06:00.
  - **boom @11h**: +$58,809 over 60 d, arrivals mean 309.9/d (+38.7 % ≈ +39 %), herd exactly 140
    (capacity), born 32 < overview's 42, median day **+$706**, 1 elephant poached d3 — every
    number in the README row reproduces, including the honest "breeds less than overview".
  - **bust @17h**: cash −$418,852 (≈ −$419k), born 6, died 21, herd 178, arrivals mean 7.4/d with
    0 after week one, `bankrupt: true`, BANKRUPT stamp on the panel; **@3h byte-identical**
    (−$418,852.15680442145 / 178).
  - **close @16.5h**: 30 days, born 15, herd 108 (99 → 108) — exact. **night @21.5h**: herd 109,
    +$28,745 — exact.
  - `world.animals.size == sim.count()` at every preset (134/140/178/108/109) — the staged herds
    are real, not ledger phantoms.
- Panel PNGs (my captures `tools/shots/simcritic-*.png`) read back consistent: overview panel
  "$265,393 / +$16,577 / 390 today, avg 223/d / 134 (42 born · 6 died · 0 left)"; the overview and
  boom descriptions now tell the true story ("cash ends up, but only through event windfalls — the
  typical day runs slightly negative"; "Price-driven boom … habitat tweaks do not make the herds
  happier: they breed less than in overview").
- Fidelity harness re-run by me: `node tools/fidelity.mjs --scenarios price-sweep` → **$15 →
  netPerDay +$433.13 over 30 days, 11 born, 0 left; $20 → −$1,225.9; $12 → −$207.8; 0 console
  errors**. The README's "+$433/day break-even at $15" and "11 born in 30 days at $15" reproduce
  exactly.

## Screenshots reviewed (path — what I saw, one line each)
- `tools/shots/simcritic-overview-15.png` — dashboard at day 60: cash +$16,577 with the cash curve visibly flat-to-falling except two travel-writer steps; events list shows the two virals and two droughts; species/habitat matrix and staff panel all legible.
- `tools/shots/simcritic-overview-6_5.png` — same preset at dawn: identical final numbers to @15h, different lighting only.
- `tools/shots/simcritic-boom-11.png` — price-driven boom panel: +$58,809, avg 310/d, herd pinned at 140; description no longer claims a happiness boom.
- `tools/shots/simcritic-bust-17.png` — BANKRUPT stamp over a −$418,852 ledger; visitor sparkline flatlines to 0 after week one; satisfaction 67 % / rep 64 % frozen with 0 visitors (known gap, still visible).
- `tools/shots/simcritic-bust-3.png` — identical ledger at 3 h.
- `tools/shots/simcritic-close-16_5.png` — the 12-species × 5-habitat quality matrix with count badges and legend; day-30 net −$561 shown honestly beside the growing herd.
- `tools/shots/simcritic-night-21_5.png` — unlit HUD panel readable at night; its own stream shows 2 droughts + a $50,000 conservation grant (the honest source of its +$28.7k).

## Contract / errors / perf
| run | drawCalls (scene) | triangles | errors | sim status / updateMs |
|---|---|---|---|---|
| overview 15 | 98 | 3,517,934 | 0 | ok / 0.015 |
| overview 6.5 | 99 | 3,550,702 | 0 | ok / 0.012 |
| boom 11 | 99 | 3,570,638 | 0 | ok / 0.002 |
| bust 17 | 99 | 3,675,682 | 0 | ok / 0.006 |
| bust 3 | 100 | 3,675,682 | 0 | ok / 0.004 |
| close 16.5 | 99 | 3,475,734 | 0 | ok / 0.006 |
| night 21.5 | 99 | 3,447,032 | 0 | ok / 0.005 |
| fidelity price-sweep (3 × 30 d live) | — | — | 0 | — |

- Scene draws belong to the staged backdrop (terrain/props/roads load through the optional
  closure); the module's own group stays empty (~2 draws). Whole-scene totals grew since r6
  (73–75 → ~99); not this module's budget.
- `node tools/lint.mjs src/modules/simulation` → ok. `dependencies: []`,
  `optional: [animals, zoning, buildings, traffic, roads]` — truthful, all null-checked (tests run
  with none of them). `dispose()` clears stage/group/sim/sightings. `update()` only repositions the
  dashboard quad with two cached vectors — allocation-free. Every README API function exists in
  `index.js`, including `spend`/`getSpendLog`/`replan`/`injectEvent`/`getSim`.

## Ranked issues (most damaging first)
1. **[minor] Poaching targets the wrong statistic in the live game.** `sim.js` lets the animals
   module's `appeal` overwrite `rarity`, so zebra (appeal 0.85) and ostrich (0.70) count as
   high-value poaching targets. A poaching wave should threaten rhino/elephant, not the common
   grazers a park is full of. Keep a separate poaching-value field.
2. **[minor] Poaching and bankruptcy carry no lasting state consequences.** Reputation recovers
   through the satisfaction EMA within days of a massacre; a foreclosed park keeps its pre-collapse
   satisfaction/reputation (67 % / 3 stars in my bust capture) and 85 % staff morale with $0 income.
   Visible on the bust panel in every round since 6; disclosed, still worth fixing.
3. **[minor] The $20 overview park is still not profitable day-to-day** (median −$284/d; the 60-day
   gain is event windfalls). Now described honestly everywhere — but the tuning hole the fidelity
   harness identifies ($15 break-even, $20 loses ~$1,226/d in the live park) remains open.
4. **[minor, disclosed] Fidelity simplifications vs SimSafari 1998:** visitors are aggregates, the
   village is a morale/prosperity scalar, poachers are an event not agents, `speed(n)` doubles up
   with ui's multipliers. §10 explicitly allows the village simplification; all documented in
   Known gaps.

## What is genuinely good
- Every number in the README's Presets and Measured tables now reproduces — most to the exact
  integer or cent — and the staging is hour-invariant (bit-identical cash doubles across tods).
- The best-tested module in the project: 89/89 deterministic tests including a byte-identical
  same-seed history check, staged-population reconciliation, and a live-park harness whose
  price-sweep I reproduced to the dollar.
- The full §10 loop is real: habitat quality → happiness → births/deaths/migration; satisfaction
  breakdown → reputation EMA → arrivals; ledger with breakdowns; morale → upkeep efficiency
  (91–92 % on the panels); events (drought/disease/poachers/viral) all demonstrated.
- The showcase now tells the truth: overview credits event windfalls, boom admits it is
  price-driven and breeds less, close shows the day-30 loss beside the matrix, bust stamps
  BANKRUPT. Zero console errors in 7 captures + 3 harness runs; ~0.01 ms update.

## Verdict
**PASS, 8.5.** The round-6 cap was purely evidentiary and the evidence is now correct: I could not
break a single README claim. Scored on fidelity to SimSafari 1998 per §10, the systems loop is
complete, deterministic and well-harnessed; what holds it at 8.5 rather than 9 is aggregate
visitors, the scalar village, the poaching-targeting flaw and the missing lasting consequences —
all real depth gaps, all disclosed.

```json
{
  "module": "simulation",
  "update": {
    "score": 8.5,
    "round": 7,
    "status": "pass",
    "errors": 0,
    "drawCalls": 100,
    "issues": [
      { "sev": "minor", "text": "Poaching targets animals-module 'appeal' (overwriting rarity), so zebra/ostrich are high-value targets; keep a separate poaching-value field" },
      { "sev": "minor", "text": "No lasting consequences: reputation recovers through the satisfaction EMA after poaching massacres; a bankrupt park keeps frozen pre-collapse sentiment and 85% staff morale with $0 income" },
      { "sev": "minor", "text": "The $20 overview park is net-negative day-to-day (median -$284/d; gain is event windfalls); fidelity harness says $15 is break-even (+$433/day, reproduced exactly)" },
      { "sev": "minor", "text": "Disclosed fidelity simplifications: aggregate visitors, scalar village, event-based poaching, speed(n)/ui multiplier doubling" }
    ],
    "good": "Every README preset number reproduces exactly (42/6/134, +$16,577, -284 median, 310/d +39%, +$58,809, 140 cap, bust 6/21/178 -$418,852 bankrupt, close 108/15, night 109/+$28,745); staged runs bit-identical across capture tods; 89/89 tests re-run; fidelity price-sweep re-run reproduces +$433/day at $15 with 11 births and 0 migrations; world.animals.size == sim.count() at every preset; honest panel narratives; 0 console errors; ~2 own draws, ~0.01 ms update."
  }
}
```
