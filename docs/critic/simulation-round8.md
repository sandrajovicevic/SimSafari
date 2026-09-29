# simulation — round 8 (Wave P3: biodiversity + missions) — score 8.0 / 10 — FAIL

**Backend: SwiftShader (software GL), not a real GPU.** Linux container, `tools/screenshot.mjs`, every JSON reports
`ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device …))`. No D3D11 adapter here, so no real-GPU verdicts. Simulation is a
headless module and none of its findings depend on the renderer; the DOM captures that show it (ui panel over the real
mission API) are SwiftShader-only.

**Subject:** [PR #15](https://github.com/sandrajovicevic/SimSafari/pull/15), `claude/p3-missions` at `11f54e7`
(`main` `418fcb3` already merged in). Round 7 scored 8.5 PASS on the engine; this round scores the engine **plus** the
P3 layer (`biodiversity.js`, `missions.js`, the mission API and events, 48 new tests, two harness scenarios). The
simulation module's own showcase files are unchanged by P3, so I did not re-shoot its presets; the P3 layer is judged
through the real mission API in the ui and full-game captures below. Every claim below was run by me on this head.

## Evidence (my own runs, seed 1)
- `node src/modules/simulation/test.mjs` → **178 passed, 0 failed** (PR claims 178/178).
- **Free play is unchanged.** I ran the same test on `origin/main` and on the P3 head and diffed the baseline block:
  byte-identical (baseline day 90: cash $275,917, income $10,663, expenses $8,993, visitors 206, same populations
  and events). The only difference is the pass count, 130 on `main` → 178 on P3 (= 130 pre-P3 + 48 new). Claim reproduces.
- `node tools/fidelity.mjs --scenarios biodiversity` → **pass**, 0 console errors. Day 1: richness 11, H 2.0605, evenness
  0.8593, bigFive {elephant 5, rhino 2, buffalo 3, lion 3, leopard `null`}, plants 6/10, **index 88.45**. Removing all
  zebra: richness 11 → 10, index → **84.22**; buying 2 rhino: rhino 2 → 4, index 84.58. Both directions hold.
  **The PR description says the zebra removal takes the index "88.45 → 87.6x". My run gives 84.22** (a richness drop
  alone is 0.4 × 1/12 × 100 = 3.33 points, so 87.6 is not possible). The scenario passes and the README does not state the
  number, so this is a wrong figure in the PR text, not a wrong system.
- `node tools/fidelity.mjs --scenarios mission-replay` → **pass**, 0 console errors, 11 fresh page loads (~200 s each):

  | mission | idle control | scripted replay | replay-end net / index |
  |---|---|---|---|
  | pride | failed (deadline) | **won ★1 day 2** | $213,260 / 88.98 |
  | balanced-range | failed (deadline) | **won ★2 day 61** | $284,407 / 94.39 |
  | in-the-black | failed (deadline) | **won ★1 day 348** | **$801,776** / 86.49 |
  | fire-season | failed (2 buildings, 4.6 ha) | **won ★1 day 92** | $283,993 / 88.46 |

  `?mission=pride` param active on load (`status: active, day 1, deadline 181`); replay-twice on `pride` identical
  (`won/★1/d2` both). Every row matches the PR table. Every idle control is not won, every replay is won.
- **P3 slice cost, measured by me** (`scratchpad` node script on the P3 head; the shipped test only asserts the
  *whole* day step `< 5 ms`, so its label "the P3 slice alone < 0.5 ms" is not what it measures): `getBiodiversity()`
  recomputed every call (cache defeated) mean **0.055 ms** (p95 0.054, one 3.97 ms outlier of 300); evaluator
  `mission.step()` mean **0.0008 ms**. Spec budget < 0.5 ms/day: **met**, by ~9×. The whole day step averaged 2.4 ms
  (p95 10 ms) on a machine that was also running the harness.
- `node tools/lint.mjs src/modules/simulation` → lint ok.

## Screenshots reviewed (path — what I saw, one line each)
- `tools/shots/ui-p3-objectives-15-dom.png` (ui `objectives` preset, 1280×720, real mission via the sim API) — The Pride Grows active, 4 / 6 lions, 67 %, "177 days left (day 4 of 181)", biodiversity 93, Big-Five pills 7 / 2 / 9 / 4. Consistent with the API.
- `tools/shots/ui-p3-objectives-won-15-dom.png` — mission complete, ★★★, "finished day 2", **Lions 10 / 6** after buying 6 at once; the top bar shows the park at **−$6,596/day**.
- `tools/shots/p3-game-overview-14-mission-dom.png` (full game, 1920×1080, `?mission=pride`, panel opened by eval) — "Mission started The Pride Grows — 180 days" toast; panel shows **Lions 0 / 6, 0 %** while its own Big-Five row says **3 lions** and the API's `getBiodiversity().bigFive.lion` is 3 (issue 1).
- `tools/shots/p3-game-overview-21_5-mission-dom.png` — same state at night; panel fully legible on a near-black scene, same 0 / 6 vs 3.
- `tools/shots/ui-p3-report-scrolled-dom.png` — report modal scrolled: biodiversity tile 94 % index ring + Big-Five pills; population matrix consistent.
- `tools/shots/crit-p3-bio-zoom.png` — 2.4× crop of the biodiversity tile (used in the ui report).

## Contract / errors / perf
| item | result |
|---|---|
| unit tests | 178 / 178 (main: 130 / 130) |
| lint (simulation, ui, park) | ok / ok / ok |
| game `overview` 14 h with mission | 363 draws, 4.05 M tris, 0 errors, `modules.simulation` ok, updateMs 0 |
| game `overview` 21.5 h with mission | 365 draws, 4.28 M tris, 0 errors |
| ui captures (13, sim present) | 11 with 0 errors; the 2 with errors (ui `toolbar`, `night`) are identical on `main` — see ui-round6 |
| P3 slice per day | biodiversity 0.055 ms + evaluator 0.0008 ms (budget 0.5 ms) |
| harness | `biodiversity` pass, `mission-replay` pass, 0 console errors |

- API contract: `getBiodiversity / listMissions / startMission / abandonMission / getMissionState` and events
  `mission:progress` / `mission:completed` exist and match the spec (`abandon` emits nothing; exactly two events, and
  `mission:started` is a deliberate, documented omission). Leopard is `null` everywhere, never substituted.
- `missions.js` reads clean: the mission's fire schedule draws only from `Rng('mission:<id>:<seed>')` (main stream
  untouched — consistent with the byte-identical free-play result), each scripted fire gets its own stamina, stars are
  documented per type.

## Ranked issues (most damaging first)
1. **[major] A freshly started mission reports the wrong progress until the first day end.** *(Resolved after this round by PR #17, `7eece62`: `start()` now seeds progress and count from the live park; live game at day 1 reads Lions 3 / 6, 50 %. Score above is as of the round.)*
   - **What:** `start()` sets `detail` with the goal but no `count`, and only `step()` (once per day end) fills it, so the
     panel shows **Lions 0 / 6, progress 0** while the park already has 3 lions.
   - **Where:** `p3-game-overview-14-mission-dom.png` / `-21_5-…`; API readback in the JSON:
     `getMissionState() → progress 0, detail {goal, species, target}` (no `count`) while `getBiodiversity().bigFive.lion = 3`.
     The showcase hides it because it runs 3 days before opening the panel.
   - **Why it matters:** the first thing a player sees after `?mission=` or Start contradicts the Big-Five row in the same
     panel. It self-heals in ≤ 1 game day, but a mission screen that is wrong on frame one reads as a bug.
   - **Fix:** evaluate the goal once inside `start()` (call the same per-type progress code without emitting or ending),
     or have `state()` compute `count`/`progress` live for `population` and `cash`.
2. **[major, design] `pride` stars reward spending, not play, and the win condition ends the mission the moment it is met.**
   - **What:** the mission is won the first day the count reaches 6, so the 2★ / 3★ brackets (8 / 10 lions *at that
     moment*) can only be hit by overshooting in one purchase. The staged win buys 6 lions for $54,000, reaches 10, and
     awards ★★★ while the top bar reads −$6,596/day (a staged frame whose top bar mixes mock and real values, so
     indicative only). The builder's own note: idle loses a lion (3 → 2), and
     buying 3 lions ($27k) wins on day 2.
   - **Where:** `ui-p3-objectives-won-15-dom.png`; `docs/requests/p3.md`; `missions.js` star table `[6, 8, 10]`.
   - **Why it matters:** the mission tests "did you click buy", and 3★ is available on day 2 for money. Nothing about the
     pride's health (the toast in the mid-mission shot: "1 lion starved in Lion Ridge: not enough prey") counts.
   - **Fix:** award stars on outcome quality at the deadline or after a hold period (pride stable at ≥ 6 for N days, cash
     positive, no starvation events), not on the instantaneous count at the first success.
3. **[major, design] `in-the-black` barely tests anything, and is one economy tweak from flipping.**
   - **What:** the target was cut from the spec's $1.5 M to **$800,000** to fit the demo park. The builder measured idle at
     $791,777 (99 % of the goal) and every "positive" script earning *less* than idle. The only lever found is firing a
     redundant ranger ($130/day). My harness run: the replay wins on day 348 with net **$801,776, i.e. $1,776 over the
     line**; idle fails the deadline.
   - **Where:** `mission-replay` JSON (my run), `docs/requests/p3.md` §1.
   - **Why it matters:** a mission whose idle control lands within 1 % of the goal and whose winning move is cutting staff
     is non-vacuous only by a hair; any retune of ticket elasticity or wages turns "idle wins" or "replay loses" with no
     code change in the mission. The builder's own note recommends option (a): open the park mis-managed so play matters.
   - **Fix:** do (a) from `requests/p3.md` (start the park deliberately mis-priced/over-staffed when this mission is
     active), then re-raise the target so idle is well short and skilled play is well over.
4. **[minor] The unit test's label overstates what it measures.** `test.mjs:825` asserts whole-day `< 5 ms` and prints
   "budget: the P3 slice alone < 0.5 ms". I measured the slice (0.056 ms) and it is fine; the test just does not prove it.
5. **[minor] The PR description's "88.45 → 87.6x" is wrong** (measured 84.22 by the scenario itself). The README is not affected.
6. **[minor] `survive-fire` progress is elapsed calendar time** (`(day − start) / deadline`), so the bar fills to 100 % at
   the deadline regardless of how the season went, and a failed mission can sit at 90 %.
7. **[minor, disclosed] Known limits:** `reset()` is a ledger reset, not a whole-game restart (harness therefore loads a
   fresh page per variant — the reasoning in `requests/p3.md` §3 is sound); fire-season hectares count natural fires;
   `balanced-range` floor is 92 (spec's demo + 10 = 98.45 is unreachable; measured and explained).
8. **[minor, carried from round 7]** poaching targets `appeal`; bankruptcy/poaching have no lasting consequences; the $20
   ticket park is net-negative day to day. Not re-verified this round.

## What is genuinely good
- **Every number the PR claims reproduces** except one figure in the PR text: 178/178, both harness scenarios, the mission
  table (idle fails all four, replay wins all four), the URL-param start, replay-twice determinism, the 88.45 baseline.
- **"Free play is bit-identical to main" is real**, and I checked it the hard way: same test on both heads, identical
  baseline block. The mission's private `Rng` fork is exactly why.
- **The P3 layer is cheap**: 0.056 ms/day against a 0.5 ms budget.
- **The builder is honest about the calibration**: every spec placeholder that failed the winnable-and-not-idle rule was
  changed with the measurement written down (`requests/p3.md`), including the parts that make the missions thin (issues 2–3).
  Leopard stays `null` and the UI says "not in this park".
- The harness design is right: fresh page per variant (reset in the live game is not a restart), an idle control per
  mission (non-vacuity), and a determinism replay.

## Verdict
**FAIL at 8.0** (round 7: 8.5 PASS). The engine is unchanged and still the best-tested module in the project, and the P3
plumbing is correct, deterministic, cheap and honestly documented. What holds it below 8.5 is the design layer that P3
adds: a mission that shows the wrong count on frame one, `pride` stars that pay for overbuying, and an `in-the-black`
mission that idle misses by 1 % and skilled play wins by $1,776. Fix issue 1 (small) and the star/target design in 2–3 and
this is an 8.5 again. Real-GPU checks are not relevant to this module.

```json
{
  "module": "simulation",
  "update": {
    "score": 8.0,
    "round": 8,
    "status": "fail",
    "errors": 0,
    "drawCalls": 365,
    "issues": [
      { "sev": "major", "text": "A freshly started mission reports wrong progress until the first day end: start() sets detail without count, so the panel shows Lions 0/6, 0% while the park has 3 lions (getBiodiversity().bigFive.lion = 3); seen in game ?mission=pride at 14 h and 21.5 h." },
      { "sev": "major", "text": "pride stars reward overbuying: the mission ends the first day the count reaches 6, so 2/3 stars (8/10 lions at that moment) need an overshoot in one purchase; the staged win buys 6 lions ($54k), reaches 10, awards 3 stars while the (staged) top bar reads -$6,596/day." },
      { "sev": "major", "text": "in-the-black is barely non-vacuous: target cut from $1.5M to $800k, idle ~$791,777 (99%), only lever is firing a ranger, replay wins on day 348 by $1,776 (netEnd $801,776); brittle to any economy retune." },
      { "sev": "minor", "text": "test.mjs asserts whole-day <5 ms but labels it as the P3 slice <0.5 ms; measured slice is 0.055 ms biodiversity + 0.0008 ms evaluator (budget met)." },
      { "sev": "minor", "text": "PR description says zebra removal takes the index 88.45 -> 87.6x; the scenario measures 84.22 (README not affected)." },
      { "sev": "minor", "text": "survive-fire progress is elapsed calendar time, not survival, so the bar reads 100% at the deadline regardless of losses." },
      { "sev": "minor", "text": "Disclosed: reset() is a ledger reset; fire-season ha counts natural fires; balanced-range floor 92 (demo+10 unreachable). Carried: poaching targets appeal, no lasting bankruptcy/poaching consequences." }
    ],
    "good": "Every PR claim reproduced except one PR-text figure: 178/178 tests, biodiversity and mission-replay scenarios pass with 0 console errors, idle fails and replay wins all four missions, replay-twice identical. Free play verified bit-identical to main (same test on both heads, identical baseline block; 130 -> 178 passes). P3 slice 0.056 ms/day vs 0.5 ms budget. Calibration changes honestly documented; leopard stays null."
  }
}
```
