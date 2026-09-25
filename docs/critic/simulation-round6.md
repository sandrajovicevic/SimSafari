# simulation — round 6 — score 6.0 / 10 — FAIL

The module code has not changed since round 5 (last commit touching `src/modules/simulation/` is 60abb51). The
score drops because I checked the README's preset claims against fresh runs this time and they don't match. The
brief caps a claim that doesn't reproduce at 6. Without the cap, the engineering underneath is about 8.5.

## Screenshots reviewed (path — what I saw, one line each)
- `tools/shots/simulation-overview-15-dom.png` — day 60, $20 tickets. Cash $259,358 (+$17,134 over 60 d), visitors 218/d (avg 214), herd 140 (46 born, 4 died), sat 72 % / rep 75 %. Matches the README overview row (+$18k, 215/d, 140, 46 births). **But** the cash sparkline is flat-to-falling except for a single ~$25k step around days 21–26. The step lines up with the "d21 travel writer raved" event and the visitor spike to 387. The "cash climbs" story depends on that one lucky event.
- `tools/shots/simulation-boom-11-dom.png` — $15 tickets, "wetter/shadier". Cash $304,778 (**+$58,844**), avg **308**/d, herd 140 (**32 born**, 7 died, 1 elephant poached d3). README claims **38 births, ~282/d, +$37k**, so none of the three numbers reproduce. The panel's own text says "happier herds breed fast", yet boom breeds *fewer* animals than overview (32 vs 46). Happiness is no higher (62–72 % vs 67–76 %). Habitat quality is *lower* for several species (lion 81 vs 97 %, cheetah 66 vs 82 %). Both parks end at exactly 140 animals, which looks like a carrying-capacity ceiling. Boom starts at 116 (animalScale 0.6), so it has less room to breed. Only the price lever produces the boom.
- `tools/shots/simulation-bust-17-dom.png` — BANKRUPT stamp, cash −$435,167, visitors flatline to 0 after ~day 10, herd 193→174 (6 born, 25 died), happiness bars red/orange. README says 5 born / 22 died / 176 / −$427k. The direction reproduces but the numbers don't at the preset's own tod. Satisfaction 66 % and reputation 64 % (3 stars) stay frozen for 50 days with zero visitors.
- `tools/shots/simulation-close-16_5-dom.png` — the habitat-quality matrix (12 species × 5 habitats, colour-thresholded, count badges, legend). It is still the best single view in the module. The 30-day ledger reads −$11,447 and day-30 net −$200 for the same $20 park that overview calls "cash climbs".
- `tools/shots/simulation-night-auto-dom.png` (night preset at its default 21:30; the stale `simulation-night-21_5-dom.json` is from a capture my own timeout killed, ignore it) — same park config as overview on its own stream. Cash **−$6,474 over 60 d**, a 19-day drought (red dots on all 5 habitats, "drought active — water reduced"), herd 124 (30 born). Legible, zero defects. This is the overview park *without* a viral event, and it loses money.
- `tools/shots/simulation-overview-6_5-dom.png` (extra, tod 6.5) — **same preset + same seed as overview-15, different outcome**: 42 born (not 46), herd 134 (not 140), +$16,577, events d5 drought / d21 viral / d39 drought / d57 viral. Between the two viral steps the cash curve falls steadily (~$265k → ~$240k over ~30 days). Guides show red "4 / 10 needed" during the spike, and "uncrowded" sits at 0 %.
- `tools/shots/simulation-bust-3-dom.png` (extra, tod 3) — BANKRUPT again: 5 born / 22 died / 176 / −$426,874. **This** tod matches the README's bust row exactly. So the README numbers were measured on a stream that the preset's own tod does not reproduce.

## Contract / errors / perf
| preset (tod) | drawCalls (scene) | triangles | errors | sim status / updateMs |
|---|---|---|---|---|
| overview (15) | 73 | 3,428,910 | [] | ok / 0.003 |
| boom (11) | 75 | 3,463,223 | [] | ok / 0.006 |
| bust (17) | 75 | 3,537,445 | [] | ok / 0.020 |
| close (16.5) | 74 | 3,398,294 | [] | ok / 0.013 |
| night (21.5, default) | 75 | 3,395,261 | [] | ok / 0.010 |
| overview (6.5) extra | 74 | 3,448,382 | [] | ok / 0.003 |
| bust (3) extra | 75 | 3,541,334 | [] | ok / 0.012 |

The scene draws belong to the staged backdrop. The module's own draws are ~2, as claimed. `node tools/lint.mjs src/modules/simulation` → **lint ok**. `update()` only repositions the HUD quad with cached vectors, so it allocates nothing per frame. `dispose()` clears the stage, group, sim and sightings map. `dependencies: []`, `optional: [animals, zoning, buildings, traffic, roads]` — truthful.

**Tests, run by me:** `node src/modules/simulation/test.mjs` → **89 passed, 0 failed** (0.7 s). Determinism holds headless: cash d90 $328,224 on the same seed, $328,870 on a different seed.

**Fidelity harness, re-run by me:** `node tools/fidelity.mjs --scenarios poaching` → **byte-identical** to the 2026-09-25 JSON. 11 poached (d51 3 zebra, d60 1 zebra, d70 3 ostrich, d72 3 giraffe, d86 1 rhino), morale 0.346, 80 → 73 animals, 0 console errors.

## Poaching (the "11 from day 51, was 2 on day 97" change) — plausible, with caveats
The risk is `p = clamp(0.004 + 0.03(1−morale) + 0.02(1−rangerCov) − 0.008·prosperity − 0.004·min(2,stations), .001, .08)` per day, with 1–3 animals per event.
- With rangers fired and $10 wages, morale decays from ~0.85 toward ~0.35. That puts p at ≈0.02/day early and ≈0.04/day late. Over 100 days you'd expect ~3.2 events and ~6.4 animals.
- The new run's 5 events / 11 animals has P(≥5 events) ≈ 20 %. The old run's 1 event has P(≤1) ≈ 15–17 %. Both are ordinary draws from the same distribution.
- The clustering after day 50 is what morale decay predicts.

So the new number is *more* representative than the old one, not a regression. The mechanism is sound. The caveats:
1. One seed, one 100-day run can't characterise a 3-to-5× variance. The harness (and the park README's "changed materially" wording) should report a multi-seed mean.
2. **Target selection is wrong in the live game.** Poachers target `rarity ≥ 0.7`. In `sim.js species()` the animals module's `appeal` *overwrites* `rarity` (`if (Number.isFinite(ext.appeal)) s.rarity = clamp01(ext.appeal)`). So zebra (appeal 0.85) and ostrich (0.70) count as "high-value" and are picked as often as rhino or elephant. That explains 3 zebra, 1 zebra and 3 ostrich among 5 "high-value" events. The animals module's actual `rarity` field (zebra 0.1) is thrown away. The headless tests can't see this because they have no animals module.
3. Reputation *rose* 0.50 → 0.665 across 5 poaching massacres. The −0.05 hit per event is fully erased by the satisfaction EMA, so poaching has no lasting reputational cost.

## Ranked issues (most damaging first)
1. **[major — cap trigger] The boom preset's claims don't reproduce, and its narrative is false.**
   - README: 38 births, ~282 arrivals/d, +$37k. Measured at the preset's own tod 11: 32 births, 308/d, +$58.8k.
   - The panel says "happier herds breed fast", but boom breeds *less* than overview (32 vs 46). Happiness is not higher and several habitat qualities are lower ("wetter/shadier" hurts lion, cheetah and zebra fit).
   - Both parks hit the same 140 ceiling.
   - The README's "Measured" section also says "boom … the preset claims on the panel are what the run actually does". That is untrue now.

   Fix: re-measure every preset at its default tod and rewrite the table. Then either make boom actually happier (better-fit habitat tweaks, start below capacity) or change the description to "price-driven boom".
2. **[major] Showcase outcomes depend on the capture hour; the footer says "same seed → identical numbers".** The same preset and seed give 46 vs 42 births and 140 vs 134 herd (overview at 15 h vs 6.5 h), and 6/25/−$435k vs 5/22/−$427k (bust at 17 h vs 3 h). The README bust row matches tod 3, not the preset's 17. The headless sim is deterministic; the staged run is not invariant to the starting clock (day-boundary phase or the animals module's time-dependent behaviour feeding reconcile). Fix: have `stage()` start the sim at a fixed hour, independent of `tod`, or document that the stream is keyed by preset + tod.
3. **[major] The overview "cash climbs, healthy" story rests on one seeded viral event.** The $20 park is net-negative between events:
   - night stream: −$6.5k over 60 d
   - close: −$11.4k over 30 d, day-30 net −$200
   - overview 6.5 h: steady decline between two viral steps

   In both overview captures, the +$17k comes from the travel-writer spikes. The showcase oversells the economy's baseline health. Fix: describe it honestly, or tune the crew/price so the baseline slope is positive without events.
4. **[minor] Poaching targets high-appeal species, not high-value ones.** In the live game `appeal` overwrites `rarity`, so zebra and ostrich count as poaching targets. Keep a separate poaching-value field, or use the animals module's `rarity` for targeting.
5. **[minor] Poaching carries no lasting reputation cost.** Reputation rose 0.50 → 0.665 across 5 events. Make the hit decay slowly, or feed poaching into satisfaction ("species variety" and "rare sightings" already could).
6. **[minor] The bust dashboard shows frozen visitor sentiment.** Satisfaction 66–69 % and reputation 64 % / 3 stars persist for 50 days with 0 visitors, and staff morale stays 86 % in a foreclosed park that is still overstaffed (keepers 10/9, rangers 3/2, guides 3/1). Grey the satisfaction widget out with no visitors, or show "no data". Show a "staff not paid / morale" consequence of bankruptcy.
7. **[minor] The README's "Measured" section is stale beyond boom.** It still says "$15 breaks even at +$383/day". The park README's 2026-09-25 re-run says +$627/day. Update it.
8. **[minor, disclosed]** The village is a scalar, not a per-household layer; visitors are aggregates; poachers aren't agents.

## What is genuinely good
- 89/89 deterministic tests, re-run: births/room cap, reconciliation (no silent zeroing), events, API, same-seed determinism. It is still the best-tested module in the project.
- The fidelity harness reproduces byte-for-byte (poaching re-run identical). The poaching risk model is a sensible morale × ranger-coverage × prosperity function whose outputs match its own maths.
- The bankruptcy failure state, the habitat-quality matrix and the drought flagging on the habitat bars are all legible, correct and clearly communicated. The panel is consistently readable at every hour. Zero console errors in all 7 captures. Module cost is ~2 draws and ~0.01 ms/frame.

## Verdict
**FAIL, 6.0 (capped).** The engine is solid and deterministic under test. What fails is the showcase evidence: the boom preset's numbers and its "happier herds breed fast" story don't reproduce (it breeds less than overview), and the README's preset numbers only match at a tod the preset doesn't use. The fix is mostly measurement and honesty: re-measure at default tods, pin the staged start hour, and make boom a real ecological boom or describe it as price-only. With that done, this returns to the 8.5–9 range.
