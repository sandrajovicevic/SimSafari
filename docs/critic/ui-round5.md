# ui — round 5 — score 7.0 / 10 — FAIL

Both round-4 majors are fixed, and I checked each one in the DOM as well as by eye. At 1280×720, the minimum width the
README says it supports, this round's captures show new, reproducible layout and data-consistency defects in three of the
six showcase presets. Earlier rounds missed them. The HUD is still visually close to the Cities: Skylines II reference,
but these are not nits in a hero preset.

All shots: seed 1, `--dom`, fast-settle. The standard presets are 1280×720. The extra shot is 1920×1080.

## Screenshots reviewed (path — what I saw, one line each)
- `tools/shots/ui-overview-15-dom.png` — full HUD: top bar, three toasts (good/info/warn), minimap, numbered category bar. Clean; no defects.
- `tools/shots/ui-report-15-dom.png` — daily report modal: three sparkline tiles, income/expense tables, satisfaction/reputation rings, species table, events feed. Well composed. **The Treasury tile reads "+$30,599 today" while the header says "Profit $4,430" and income − expenses = $18,640 − $14,210 = $4,430**, so the same modal contradicts itself.
- `tools/shots/ui-panel-16_5-dom.png` — elephant selected. **Round-4 bug fixed:** the ring reads "68% HAPPY / Content", which agrees with the need bars (83/50/52/65/77) and the "Doing fine" advice. **New:** the Facts grid runs each key into its value with no separation ("AGE29 years", "SEXMale", "SHOULDER3.2 m"); "HERDHerd #80 · 7 animals" spills into the next cell; "HABITATKopje Springs" spills past the panel's right edge. The side panel also sits over the toolbar's "View" button (its "6" key badge is clipped). The selected elephant is still absent from the 3D view: an orphan white ring sits on bare grass.
- `tools/shots/ui-toolbar-15-dom.png` — buildings category open, lodge tooltip. **Round-4 bug fixed:** the pill reads "Building.Place · Cancel ESC", with no "null". **New:** at 1280 wide the minimap covers the lower-left of the item panel. The first card's price and most of the second-row "Water Pump / Feeding Station" cards are hidden under it. The tooltip covers the panel's header hint ("…cancels." is all that shows). The pill shows the raw tool id "Building.Place", not "Safari Lodge" with its price. No card is highlighted as the active tool. All 16 building cards use the same generic house glyph.
- `tools/shots/ui-close-auto-dom.png` (close, 16.5 h) — habitat panel (78% quality, resources, fit per species) plus the animals category. The panel content is correct, but **the animals item panel runs under the side panel**: the Hippopotamus card is cut in half and the rest of the row is hidden. **The minimap covers the second row** (Impala card: only "…pala / …500" shows) and the first card's price. At 1280 px, three HUD surfaces overlap.
- `tools/shots/ui-night-auto-dom.png` (night, 21.5 h) — moon glyph and "Clear night", Baobab Lodge panel, error and info toasts. Fully legible on a near-black scene; no layout defects. Nits: 28° at 21:30, the same as at 08:00 and 15:00, and the selected lodge is not in frame.
- `tools/shots/ui-critic-toolbar-1080-dom.png` (extra: toolbar, 08:00, 1920×1080, with `--eval`) — at 1080p the item panel (x 370–1550) clears the minimap (x 12–228), so the collisions depend on width. DOM readback of the pill: `<span class="ic">…</span><span>Building.Place</span><span class="muted">·</span><span class="muted">Cancel<span class="key">Esc</span></span>`, with no stray text node. That confirms the null fix at DOM level. The tooltip still covers the header hint, and the building icons are still all the same.

## Contract / errors / perf
The ui module itself makes 0 draw calls (pure DOM). The drawCalls column is the whole staged scene, driven by terrain and friends.

| preset | drawCalls | triangles | errors | ui status | ui updateMs |
|---|---|---|---|---|---|
| overview 15 | 58 | 3 406 603 | [] | ok | 2.77 |
| report 15 | 58 | 3 406 603 | [] | ok | 2.45 |
| panel 16.5 | 55 | 3 284 304 | [] | ok | 2.55 |
| toolbar 15 | 59 | 3 365 687 | [] | ok | 2.09 |
| close 16.5 | 48 | 2 612 258 | [] | ok | — |
| night 21.5 | 50 | 3 133 305 | [] | ok | — |
| toolbar 08 @1920×1080 (extra) | 58 | 3 332 919 | [] | ok | 2.69 |

- Zero console errors across all 7 shots.
- `node tools/lint.mjs src/modules/ui`: ok.
- Every function in the README's API table exists in `index.js`.
- `dependencies: []` is accurate, because every consumed module is optional and null-checked.
- `update()` makes no allocations beyond the selection key string built every 0.2 s.
- updateMs is 2.1–2.8 ms, down from 7.4–9.7 in round 4 but still above the 1.5 ms per-module guide. This is software GL, so I treat it as a watch item, not a failure.
- Mandatory presets `overview`, `close` and `night` are all present.

## Ranked issues (most damaging first)

1. **[major] Facts grid in the animal panel is broken: keys run into values, and values overflow the cell and the panel.**
   - **Where:** `panel` preset, at any resolution (the panel has a fixed width).
   - **Why it matters:** a text-layout failure in the module's headline inspect panel. Cities: Skylines II info panels never collide text.
   - **Cause:** `ui.css.js` gives `.sf .fact .col` only `min-width: 0` and no display rule. `.k` and `.v` are inline `<span>`s, so they sit on one line with no gap. `white-space: nowrap; overflow: hidden; text-overflow: ellipsis` on the inline `.v` does nothing, so long values escape.
   - **Fix:** `.sf .fact .col { display: flex; flex-direction: column; min-width: 0; }` and `.sf .fact .v { display: block; }`.
2. **[major] HUD surfaces overlap at 1280×720, the minimum width the README says it supports.**
   - **Where:** `toolbar` and `close` presets.
   - **What overlaps:**
     - the minimap covers the category item panel's left column and second row;
     - the item panel runs under the right side panel (`close`: Hippopotamus card cut off, later species hidden);
     - the side panel overlaps the toolbar's View button (`panel`).
   - **Cause:** `.tb-items` has `max-width: 1180px`, is centred, and ignores the minimap (left 12 px + 216 px) and the side panel (~344 px). At 1920 px there is no overlap.
   - **Why it matters:** CS2's toolbar panel never draws over its minimap or info panel. Hidden prices and cards are a usability failure, not only a cosmetic one.
   - **Fix:** limit the item panel's width to `calc(100vw - 2*(minimap width + gutter))`, and further by the side panel's width when a selection is open; or wrap cards into more rows; or collapse the minimap while a category is open.
   - **Note:** the README's known-gaps line "assumes ≥ 1280 px wide" implies 1280 works, and that does not reproduce.
3. **[major] The daily report contradicts itself.**
   - **Where:** `report` preset.
   - **What:** Treasury says "+$30,599 today" but the day's profit is $4,430.
   - **Cause:** `mock.js` builds a 30-day cash history, then overwrites the last entry with `e.history[last].cash = e.cash` (312 450) without adjusting it. The report computes the delta from the last two history points, so the overwrite becomes a $30k one-day jump. The sparkline also shows it as a kink at the right edge.
   - **Why it matters:** this is the same class of defect as round 4's "0% happy next to healthy bars": the showcase data disagrees with itself in the preset built to show it off.
   - **Fix:** scale or offset the whole generated series so the last point lands on `e.cash`, or pick the start value so the running sum ends there.
4. **[minor] The active-tool pill shows a raw tool id, and nothing is highlighted.**
   - **What:** the pill reads "Building.Place" (`titleCase(t.tool)`) instead of "Safari Lodge · $320,000", and no card is marked active.
   - **Where:** `toolbar` preset.
   - **Cause:** the preset passes `null` for the item, and `findItem('building.place', {type:'lodge'})` does not resolve it.
   - **Fix:** resolve the catalogue item from `options.type`.
5. **[minor] The hover tooltip covers the item panel's header hint.**
   - **Where:** `toolbar` preset, both resolutions.
   - **Fix:** place the tooltip above the panel's top edge, or to the side of the card.
6. **[minor] All 16 building cards use the same house glyph.** CS2 gives each service its own icon. The species cards already have per-species glyphs, so the buildings category looks unfinished next to them.
7. **[minor] Selected subjects are not visible in the 3D view.**
   - **What:** in `panel`, the elephant is missing and only an orphan selection ring shows. In `night`, the selected lodge is out of frame.
   - **Cause:** mock data is written straight into `world` and never spawned or placed.
   - **Note:** this was disclosed in round 4 and is still open.
8. **[minor] Top-bar temperature is fixed at 28°** at 08:00, 15:00 and 21:30. The mock or the weather readout should follow the time of day.
9. **[minor, disclosed] Known gaps still open from the README:**
   - an empty notification container can appear;
   - there is no graph panel (only the report sparklines).

## What is genuinely good
- **Both round-4 majors are fixed properly, at the root cause.** Toolbar: the native `Element.append` call was replaced with the null-skipping `append` helper, and the DOM readback is clean. Animals: `getHappiness` now returns `null` for an unknown id, and the panel shows a consistent 68% Content.
- **Visual language is close to the Cities: Skylines II reference:**
  - dark translucent panels, restrained accent colour, clear hierarchy;
  - keycap badges on the category bar;
  - toast styling that differs by level.
- **The report modal is a complete, rich implementation of a spec item**, apart from the delta bug.
- **Night legibility is excellent.** The moon glyph swaps in correctly.
- **Contract:** zero console errors on 7 captures, lint clean, API matches the README, and `dispose()` is thorough.

## Verdict
FAIL at 7.0, up from 6.5. The two functional bugs from round 4 are fixed and verified. The module is not AAA-with-nits yet:
- the animal panel's Facts grid has broken text layout in every capture;
- three HUD surfaces overlap one another at 1280×720;
- the report still shows self-contradicting mock numbers.

All three are cheap CSS or mock-data fixes. Once they are done and verified at both 1280 and 1920, this module is a
realistic 8.5 candidate.
