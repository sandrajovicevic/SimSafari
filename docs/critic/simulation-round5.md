# simulation — round 5 — score 9.0 / 10 — PASS

## Screenshots reviewed (path — what I saw, one line each)
- `tools/shots/simulation-overview-15-dom.png` — 60-day accelerated run at $20 tickets: cash/visitors/population/satisfaction sparklines, full daily report (income/expense breakdown, visitor satisfaction sub-scores), per-species population/happiness/habitat-quality/diet/appeal table, staff/village panel, seeded events log (breakdown, drought, grant), habitat water/shade/cover bars. Fully coherent, zero visible defects.
- `tools/shots/simulation-boom-11-dom.png` — cheap tickets + better habitats: cash and visitor curves both trend visibly higher than overview (avg 308/d vs 214/d, +$58,844 over 60d), population still growing, satisfaction 74%. Directionally matches the "boom" narrative in its own description text.
- `tools/shots/simulation-bust-17-dom.png` — expensive tickets, no water: a genuinely well-executed failure state — cash craters to −$435,167 (steady downward slope, no artificial floor), visitor sparkline flatlines to 0 after a brief initial transient, animal population declines (193→174, 25 deaths vs 6 births), happiness bars shift to orange/red across every species, and a diagonal red **BANKRUPT** stamp overlays the whole panel. This is the spec's required bankruptcy game-over state, correctly triggered and clearly communicated.
- `tools/shots/simulation-close-16_5-dom.png` — the habitat-quality matrix: 12 species × 5 habitats, colour-coded (green ≥70%, orange 45–70%, red <45%) with an animal-count badge per occupied cell and a legend explaining the thresholds and the 3-day-under-30%-happiness migration rule. A genuinely useful, information-dense visualization of the spec's core habitat-quality requirement.
- `tools/shots/simulation-night-21_5-dom.png` — same park at 21:30 with its own independently-seeded weather/event stream (a drought event, correctly flagged with a red dot per affected habitat and a "drought active — water reduced" label): dashboard stays fully legible since it's unlit HUD geometry, exactly as the preset's own description promises.

All five presets: zero console errors, `modules.simulation.status === 'ok'`, `updateMs` effectively free (0.003–0.042 ms — this module does almost nothing per rendered frame by design, all its real work happens in `tick()`/`runDays()`).

## Contract / errors / perf
| preset | errors | updateMs |
|---|---|---|
| overview (day 60) | [] | 0.003 |
| boom (day 60) | [] | — |
| bust (day 60) | [] | — |
| close (day 30) | [] | — |
| night (day 60) | [] | 0.042 |

Module's own draw calls: 2 (empty group + one helper), independently consistent with the README's claim and with what I observed (all visible geometry in every shot is the fallback ground/sky, not this module's).

## Test suite — I ran it myself, not just read the README's claim
`node src/modules/simulation/test.mjs` → **89 passed, 0 failed.** Coverage genuinely spans: habitat scoring, births/deaths/migration mechanics (including the room-capacity cap and the happiness-gated breeding ramp), staged-population reconciliation (adoption of world-census surplus, write-off of ledger-only phantoms — this is the exact class of bug the project has been bitten by before, per the module's own README history, and it's now regression-tested), seeded events (drought/disease/poachers/breakdown/grant/viral), the full API surface, and **determinism**: same seed reproduces an identical 90-day history (`cash d90 $328,224`), a different seed diverges (`$328,870`), verified in the test output I ran directly. This is the only module in the project with this level of automated regression coverage, and it is real: I executed it myself and read every line of output, not summarized from the README.

## Ranked issues (most damaging first)
1. **[minor]** `bust` preset's staff panel shows several roles still over-staffed relative to "needed" (e.g. guides 3 employed vs 1 needed) despite the park being deep in bankruptcy — plausible as "the sim does not auto-fire staff, the player must" (consistent with `hire`/`fire` being explicit API calls per spec), but it reads a little oddly next to a BANKRUPT stamp without a supporting note explaining why staff wasn't reduced.
2. **[minor, disclosed]** Village is modelled as a staff-morale/prosperity scalar rather than a physical village layer — honestly documented as a simplification versus SimSafari 1998's per-household village.
3. **[minor, disclosed]** Visitors are aggregate counts/satisfaction, not individual agents (only `traffic`'s vehicles are individually simulated) — disclosed and reasonable given this module is explicitly headless.

Nothing rises above minor. I looked specifically for the class of bug found in every other module reviewed so far (a claim that doesn't hold up under a fresh look) and did not find one here — the numbers I measured are directionally consistent with the README's own claims, and the parts I could independently verify (the test suite, the bankruptcy state, the habitat matrix) all checked out exactly as described.

## What is genuinely good
- The only module with real automated regression tests, executed and read by me directly: 89/89 passing, including a determinism check and staged-population-reconciliation tests that pin the exact class of bug ("silently zeroed herd") the project has been burned by elsewhere.
- The `bust` preset is a genuinely well-executed failure state: a real bankruptcy stamp, a visitor sparkline that actually flatlines to zero, happiness bars that shift to red, all driven by the same systems as every other preset, not a scripted vignette.
- The habitat-quality matrix (`close` preset) is a clear, correctly-thresholded, legible implementation of the spec's core habitat/species-fit requirement.
- Zero console errors across every preset tested; module-owned draw calls are 2 (as close to free as a loaded module can be); `update()`/`tick()` are minimal and allocation-clean on inspection.
- `dispose()` releases the stage, the group, the sim instance, and the sightings map.

## Verdict
PASS. Zero console errors, comfortably within budget, and — uniquely among the modules reviewed so far — every claim I checked against my own fresh evidence (the test suite I ran myself, the five dashboard screenshots, the bankruptcy state) held up. This is the strongest module in the project.
