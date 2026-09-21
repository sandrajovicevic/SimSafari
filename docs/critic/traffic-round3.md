# traffic — round 3 — score 8.0 / 10 — FAIL

## Screenshots reviewed (path — what I saw, one line each)
- `tools/shots/traffic-overview-16.png` — 6 vehicles on a loop with a bridge junction at 430 m: vehicles are reduced to barely-visible specks on the road, confirming the README's own honestly-disclosed "overview's default camera makes vehicles nearly invisible" gap — reproduced exactly as described, not overstated or understated.
- `tools/shots/traffic-close-16_5.png` — one safari truck at ~8 m: genuinely detailed — tiered bench seats, clearly visible seated passengers in varied clothing colours, ribbed canopy roof, roof rack, spare wheel, khaki body paint, visible tyre tread and suspension geometry. Matches the description point for point.
- `tools/shots/traffic-sighting-17_5.png` — a tour truck stopped on the dirt road near a zebra herd at golden hour, passengers visible aboard — confirms the sighting-stop behaviour is real, not just claimed.
- `tools/shots/traffic-night-21_5.png` — headlight cone genuinely illuminating the road ahead, reflective dashed road paint glowing, passengers dimly visible; the river in the same frame reads anomalously bright/pale — the same night-water-brightness symptom independently found in `terrain`'s and `animals`' reviews, a third cross-module confirmation of that bug (not traffic's fault, correctly out of scope here).
- `tools/shots/traffic-critic-stats.png` + eval readback (my extra check) — called the module's own `stats()` directly: `{vehicles: 6, drawCalls: 18, bodyPools: 4, wheels: 28, seats: 25}`. Confirms the README's "6 vehicles" world-state claim exactly, and shows traffic's own geometry (18 draws for 6 vehicles, ~3/vehicle) is comfortably inside the spec's ≤80-draw-calls-for-10-vehicles budget.

## Contract / errors / perf (table: preset, drawCalls, errors, traffic updateMs)
| preset | drawCalls (scene) | errors | traffic updateMs |
|---|---|---|---|
| overview (16h) | 155 | [] | 0.701 |
| close (16.5h) | 106 | [] | — |
| sighting (17.5h) | — | [] | — |
| night (21.5h) | 128 | [] | 0.655 |

Zero console errors on all 4 presets plus the extra stats shot. `modules.traffic.status === 'ok'` throughout. `close`'s 106 draw calls matches the README's own independently-stated measurement exactly. `updateMs` (0.66–0.70 ms) is comfortably inside the spec's ≤2 ms budget — genuinely verified, not just claimed.

## Ranked issues (most damaging first)
1. **[minor, disclosed and accurately so]** The `overview` preset's 430 m camera makes vehicles nearly invisible — the README already flags this honestly as "a legitimate presentation flaw, not a rendering bug," and my own screenshot confirms exactly that: the vehicles genuinely are there (per `stats()`, 6 of them) but unreadable at this distance. Since the disclosure matches what I observed precisely, this does not trigger the "unreproduced claim" cap — it's the one case in this project so far where a self-reported limitation is exactly as significant as stated, no more, no less.
2. **[minor, disclosed]** Ambient vehicles never sight-stop, only tour vehicles do; passengers are static figures with no boarding animation — both honestly listed as known gaps and consistent with what the screenshots show.

Nothing rises to major. I found no visual or behavioural claim in this module that didn't hold up under inspection.

## What is genuinely good
- The safari truck at close range is one of the better individual assets in the project: correct tiered bench seating, individually coloured passengers, canopy, roof rack, spare wheel.
- The sighting behaviour is real and demonstrated, not just described: a tour truck genuinely stops near a zebra herd with passengers aboard.
- Night headlights and reflective road paint both work and are visually convincing.
- Own-module draw-call budget independently confirmed via `stats()`: 18 draws for 6 vehicles, comfortably inside the ≤80-for-10 spec ceiling; `updateMs` independently confirmed well inside the ≤2 ms budget.
- `index.js` API matches the README's table; `dispose()` releases the vehicle kit, spotlights, fallback graph and group.

## Verdict
FAIL (below the 8.5 pass bar), but a clean, honestly-documented, well-verified module: zero console errors, budgets independently confirmed rather than assumed, and the module's one disclosed limitation (the `overview` camera) turned out to be exactly as significant as claimed — no worse, which is itself notable given this project's track record of "fixed" claims that didn't hold up. Close-range vehicle detail and sighting behaviour are genuinely good work.
