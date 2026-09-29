# ui — round 6 (Wave P3 objectives panel + biodiversity readout) — score 6.0 / 10 (capped) — FAIL

**Backend: SwiftShader (software GL), not a real GPU.** Linux container, `tools/screenshot.mjs --dom`, every JSON reports
`ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device …))`. ui is DOM-only, so the renderer is not what is judged here; there
is no D3D11 adapter, so no real-GPU verdicts.

**Subject:** [PR #15](https://github.com/sandrajovicevic/SimSafari/pull/15), `claude/p3-missions` at `11f54e7` (`main`
`418fcb3` merged in). Standard presets at 1280×720 (the minimum width the README supports, as in round 5), plus
1920×1080 extras for the two new presets. Every PNG below was read.

**The cap, up front.** Two captures log console errors: ui `toolbar` (3×) and ui `night` (1×). Per the critic brief
one console error caps the score at 6. **Neither is caused by P3**: I re-ran both presets on `origin/main` (`418fcb3`)
and got the identical errors, so they arrived after round 5 (which logged 0 on the same presets) via some other merge.
I apply the cap as the brief requires. **My uncapped assessment of the module is ≈ 7.5** (up from 7.0): round 5's three
majors are fixed and the P3 panel is well made, with the defects listed below.

## Screenshots reviewed (path — what I saw, one line each)
- `tools/shots/ui-p3-objectives-15-dom.png` (`objectives`, 1280×720) — centred modal: The Pride Grows, Active chip, stars ☆☆☆, brief, amber progress bar 67 %, "177 days left (day 4 of 181)", Lions 4 / 6, biodiversity tile. Clean hierarchy and spacing; **"Species12 / 12" has no gap between label and value**; the "Abandon mission" ghost button has no visible affordance; the Big-Five pills are four near-identical glyphs with numbers.
- `tools/shots/ui-p3-objectives-won-15-dom.png` (`objectives-won`) — Complete chip, ★★★, green 100 % bar, "finished day 2", Lions 10 / 6 in green, primary amber "Pick another mission" CTA. **Two identical "Objective The Pride Grows complete — ★★★" toasts**, and both are partly covered by the modal (toasts run to x ≈ 352, the modal starts at x = 231).
- `tools/shots/ui-p3-objectives-1080-dom.png`, `…-won-1080-dom.png` (1920×1080) — same layout in a narrow centred modal; the biodiversity tile is mostly empty to the right of its three rows and the Big-Five pills sit at the far right, detached from their "The Big Five —" caption. The label collision persists, so it is not a width issue.
- `tools/shots/p3-game-overview-14-mission-dom.png` (full game, 1920×1080, `?mission=pride`, panel opened by eval) — "Mission started The Pride Grows — 180 days" toast, panel over the real park. **Lions 0 / 6, 0 %** while the same panel's Big-Five row shows 3 lions (a simulation-owned defect, simulation-round8 issue 1).
- `tools/shots/p3-game-overview-21_5-mission-dom.png` — the same at night: panel fully legible on a near-black scene.
- `tools/shots/ui-p3-report-15-dom.png` — daily report: Treasury "+$4,430 today" matches "Profit $4,430" and $18,640 − $14,210 = $4,430 (**round-5 contradiction fixed**). Biodiversity tile shows a ring reading **"94 %" INDEX** and is clipped at the modal footer at this height.
- `tools/shots/ui-p3-report-scrolled-dom.png` — report scrolled to the bottom: the tile is an index ring plus a vertical stack of five Big-Five pills (four numbers and a leopard "—"); richness / plants / evenness appear only as a hover tooltip on the ring.
- `tools/shots/crit-p3-bio-zoom.png` — 2.4× crop of the objectives biodiversity tile: "Species12 / 12" collision; elephant / rhino / buffalo / lion glyphs are near-identical quadrupeds at ~14 px.
- `tools/shots/ui-p3-overview-15-dom.png` — full HUD with three toasts, minimap, numbered category bar: clean.
- `tools/shots/ui-p3-panel-16_5-dom.png` — elephant selected: **round-5 Facts grid fixed** (AGE / SEX / SHOULDER / MASS labels sit above their values, "Herd #80 · 7 ani…" is properly ellipsised, "Kopje Springs" fits); 68 % Content agrees with the bars; the toolbar now shifts left and clears the side panel. The elephant is still absent from the 3D view (orphan white ring on bare grass).
- `tools/shots/ui-p3-toolbar-15-dom.png` — **3 console errors** (see below). Buildings open: the item panel (x 237–1153) clears the minimap; pill reads "Safari Lodge $320,000 · Cancel ESC" and the lodge card is highlighted (**round-5 raw-id pill fixed**); the header hint is readable; the hover tooltip still covers the labels and prices of three neighbouring cards; five buildings have distinct glyphs (gate, lodge, ranger flag, hide tent) and the rest share the house glyph.
- `tools/shots/ui-p3-close-16_5-dom.png` — habitat panel plus animals category: all 12 species cards fully visible, nothing runs under the side panel (**round-5 overlap fixed**).
- `tools/shots/ui-p3-night-21_5-dom.png` — **1 console error**. Moon glyph, "Clear night 24°", Baobab Lodge panel and toasts all legible; the top bar's "Day 34 DRY SEASON" now wraps to three lines at 1280 px (new nit).
- `tools/shots/ui-p3-settings-15-dom.png`, `ui-p3-abandon-test-dom.png` — settings modal unchanged; the abandon test capture is the eval below.

## Contract / errors / perf
| capture | drawCalls | triangles | errors | ui status / updateMs |
|---|---|---|---|---|
| objectives 15 (1280) | 68 | 3,389,797 | [] | ok / 0.27 |
| objectives-won 15 (1280) | 65 | 3,379,947 | [] | ok / 0.79 |
| objectives 1080 | 68 | 3,389,797 | [] | ok / 0.23 |
| objectives-won 1080 | 65 | 3,379,947 | [] | ok / 0.24 |
| report 15 (+ scrolled) | 60 | 3,406,051 | [] | ok / 0.46 (0.28) |
| overview 15 | 60 | 3,406,051 | [] | ok / 0.17 |
| panel 16.5 | 57 | 3,284,214 | [] | ok / 0.19 |
| **toolbar 15** | 61 | 3,366,567 | **3** | ok / 0.28 |
| close 16.5 | 50 | 2,613,017 | [] | ok / 0.17 |
| **night 21.5** | 52 | 3,133,092 | **1** | ok / 0.18 |
| settings 15 | 60 | 3,406,051 | [] | ok / 0.34 |
| game overview 14 + mission (1080) | 363 | 4,049,189 | [] | ok / 0.40 |
| game overview 21.5 + mission (1080) | 365 | 4,276,347 | [] | ok / 0.35 |
| `main` baseline: toolbar 15 | 61 | 3,366,567 | **3** (identical) | ok / 0.23 |
| `main` baseline: night 21.5 | 52 | 3,133,092 | **1** (identical) | ok / 0.17 |

- **The errors, verbatim:** toolbar — `[tools] building.update threw TypeError: Cannot read properties of undefined (reading '0')` ×3
  (raised in `tools/index.js:275` from the building tool's per-frame `update`, which calls `buildings.preview` while the
  toolbar preset has a placement tool active); night — `THREE.BufferGeometry.computeBoundingSphere(): Computed radius is NaN`
  (a geometry with NaN positions). I did not diagnose either further: both are identical on `main`, so the regression predates P3.
- 0 draw calls of the module's own; `node tools/lint.mjs src/modules/ui` → ok; the P3 code adds no API to ui (it reads
  the simulation's mission API) and does not touch `update()`: the panel refreshes on `mission:*` / `sim:day` events only.
- **updateMs is 0.17–0.79 ms, down from 2.1–2.8 ms in round 5**, comfortably under the 1.5 ms guide.

## Live test: the two-step "Abandon" confirmation
Eval on the `objectives` preset: find the button, click once, then emit one `mission:progress` (what the simulation does
every game day), read the button text.

| step | button text |
|---|---|
| before | `Abandon mission` |
| after the first click | `Abandon — sure?` |
| after one `mission:progress` event | **`Abandon mission`** (the confirmation is gone) |

Cause (read in code): `ui/index.js:181` calls `objectives.refresh()` on every `mission:progress`; `refresh()` → `show()` →
`hide()` zeroes `confirmAbandon` and rebuilds the whole modal. So any daily tick inside the 2.5 s confirmation window cancels it.

## Round-5 issues — status and evidence
| # | round-5 issue | status | evidence |
|---|---|---|---|
| 1 | [major] Facts grid keys run into values | **resolved** | `ui-p3-panel-16_5-dom.png` |
| 2 | [major] HUD surfaces overlap at 1280×720 | **resolved** (toolbar, close, panel) | `ui-p3-toolbar-15-dom.png`, `ui-p3-close-16_5-dom.png`, `ui-p3-panel-16_5-dom.png` |
| 3 | [major] Report contradicts itself | **resolved** | `ui-p3-report-15-dom.png` (+$4,430 = profit = income − expenses) |
| 4 | [minor] Pill shows raw id, nothing highlighted | **resolved** | toolbar shot: "Safari Lodge $320,000", lodge card highlighted |
| 5 | [minor] Tooltip covers the panel header hint | **improved**: the header hint is now readable; the tooltip still covers three neighbouring cards | toolbar shot |
| 6 | [minor] All 16 building cards one glyph | **improved**: gate, lodge, ranger flag, tent are distinct; ~10 still share the house glyph | toolbar shot |
| 7 | [minor] Selected subjects not visible in 3D | **unchanged** (orphan ring, elephant absent; lodge out of frame at night) | panel and night shots |
| 8 | [minor] Temperature fixed at 28° | **resolved** (33° / 32° / 24° across the shots) | panel, toolbar, night |
| 9 | [minor, disclosed] empty notification container; no graph panel | not re-checked | — |

## Ranked issues (most damaging first)
1. **[blocker under the brief's cap] Console errors on the `toolbar` (3×) and `night` (1×) presets — pre-existing on `main`.**
   Round 5 logged 0 on both presets, so something merged since broke them. Not caused by P3 (identical on `main`); which
   module owns the fix is undetermined: the toolbar error is thrown from the `tools` building tool (`building.update` →
   `buildings.preview`) while the preset has a placement tool active, and the night error is a NaN geometry. **Fix:**
   find the owning module for each (start with `git bisect` on the two presets between round 5 and `418fcb3`) and guard or fix.
2. **[major] The Big-Five row is unreadable without hover.** Elephant, rhino, buffalo and lion render as four near-identical
   quadruped glyphs at ~14 px with only a count next to them (crop `crit-p3-bio-zoom.png`); the caption "The Big Five —"
   sits far to the left of the pills. It is the headline P3 readout in both the objectives panel and the report.
   **Fix:** use distinct species silhouettes at a larger size, or add the species name under each pill.
3. **[minor] Label/value collision "Species12 / 12"** in the objectives biodiversity tile (both resolutions). It is the
   same defect class round 5 rated major in the Facts grid, on a smaller surface. The `.kv` rows shrink to their content
   so the longest label touches its value while the shorter rows keep a gap. **Fix:** give `.bio-h .kv` a fixed label
   width or `justify-content: space-between` over a fixed column width.
4. **[minor] The two-step Abandon is cancelled by any daily `mission:progress`** (live test above). At fast game speed it
   becomes practically impossible. **Fix:** patch the button text in place on refresh, or keep `confirmAbandon` across `show()`.
5. **[minor] No persistent mission readout in the HUD.** Progress, days left and the goal exist only inside a modal that
   dims and covers the park; the top bar has only the target icon. A player must open the panel to know a fire season is
   on. **Fix:** add a compact tracker (name, progress bar, days left) to the top bar or a corner chip.
6. **[minor] Report biodiversity tile:** the index is drawn as "94 %" although it is a 0–100 score (the objectives panel
   shows "93" bare); richness / plants / evenness are hover-only although the spec asks for "index + richness"; and at
   1280×720 the tile sits below the fold and needs a scroll. **Fix:** drop the % sign, print `11 / 12 species` under the ring.
7. **[minor, showcase] `objectives-won` shows a duplicate completion toast**: the real `mission:completed` handler pushes
   one and `showcase.js:77` pushes a second manual copy. Live play would show one. The top bar in these presets reads
   "Day 34" while the panel says "day 4 of 181" (mock values vs the real simulation). The modal covers the toasts at 1280.
8. **[minor] The picker's Start button ignores the `ok` of `startMission()`** (`objectives.js:98`), so a refused start looks like nothing happened.
9. **[minor, new] Top bar at night at 1280 px:** "Day 34 DRY SEASON" wraps to three lines.
10. **[minor, carried]** hover tooltip covers neighbouring cards; ~10 building cards share the house glyph; selected
    subjects are absent from the 3D view.

## What is genuinely good
- **Round 5's three majors are fixed at the root**, each verified in this round's captures: the Facts grid, the 1280×720
  overlaps (toolbar, animals category, side panel all clear each other now) and the self-contradicting report.
- **The objectives panel is a clean, restrained implementation** in the same visual language as the rest of the HUD:
  clear progress bar, days left, stars, won/failed states, a primary CTA on completion, and a two-step destructive action
  (whose confirmation is the one thing that does not survive a refresh). It never computes progress or holds mission state —
  it reads the simulation's API, and it stays legible on a near-black night scene.
- **ui `update()` cost fell 4–10×** (0.17–0.79 ms vs 2.1–2.8 ms in round 5) and P3 adds nothing per frame.
- The showcase drives a real mission through the simulation API rather than faking one, which is why the panel matches
  the API in the staged frames (and why the fresh-start 0 / 6 bug showed up in the live capture).

## Verdict
**6.0, capped, FAIL** (round 5: 7.0). The console-error cap is triggered by two presets whose errors also occur on `main`,
so they are not P3's; I cannot say which module owns them, only that round 5 saw none. Without the cap the module is ≈ 7.5:
the round-5 layout majors are genuinely fixed and the P3 panel is well built, but the Big-Five glyphs are unreadable, one
label collides, the abandon confirmation cannot survive a game tick, and the mission has no HUD presence. Fix the two
console errors and the Big-Five row and this is an 8.

```json
{
  "module": "ui",
  "update": {
    "score": 6.0,
    "round": 6,
    "status": "fail",
    "errors": 4,
    "drawCalls": 68,
    "issues": [
      { "sev": "blocker", "text": "Console errors on ui presets toolbar (3x '[tools] building.update threw TypeError: Cannot read properties of undefined (reading 0)') and night (1x THREE computeBoundingSphere NaN). Identical on origin/main 418fcb3 (not caused by P3); round 5 logged 0 on both. Caps the score at 6 per the brief; owning module undetermined." },
      { "sev": "major", "text": "Big-Five row (objectives panel and report) is unreadable without hover: elephant/rhino/buffalo/lion are near-identical ~14 px quadruped glyphs with only a count." },
      { "sev": "minor", "text": "Label/value collision 'Species12 / 12' in the objectives biodiversity tile at 1280 and 1920 (same defect class as round-5 Facts grid)." },
      { "sev": "minor", "text": "Two-step Abandon confirmation is cancelled by any daily mission:progress (refresh rebuilds the modal and zeroes confirmAbandon); verified live: 'Abandon - sure?' reverts to 'Abandon mission'." },
      { "sev": "minor", "text": "No persistent mission tracker in the HUD; progress lives only in a modal that covers the park." },
      { "sev": "minor", "text": "Report biodiversity tile: index drawn as '94 %', richness only in a tooltip, tile below the fold at 1280x720." },
      { "sev": "minor", "text": "Showcase: objectives-won shows a duplicate completion toast (showcase.js:77 adds a copy of the real one); mock top bar 'Day 34' vs panel 'day 4 of 181'; modal covers the toasts at 1280." },
      { "sev": "minor", "text": "Picker Start ignores startMission().ok; top bar 'Day 34 DRY SEASON' wraps to three lines at night at 1280; carried: tooltip covers neighbouring cards, ~10 building cards share one glyph, selected subjects absent in 3D." }
    ],
    "good": "Round-5 majors verified fixed: Facts grid, 1280x720 HUD overlaps, self-contradicting report (+$4,430 = profit), raw-id pill, temperature. Objectives panel is clean and reads the simulation API only (drives a real mission in the showcase). ui updateMs 0.17-0.79 ms (was 2.1-2.8). 13 ui captures (11 presets/sizes + 2 eval runs) of which 2 have errors (both identical on main), plus 2 full-game captures with 0 errors; lint ok."
  }
}
```
