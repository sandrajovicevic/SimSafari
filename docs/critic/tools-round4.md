# tools — round 4 — score 5.5 / 10 — FAIL

Module code is unchanged since round 3 (`git status` clean for `src/modules/tools/`, lint ok). This round I re-ran
every preset, re-checked every README claim against live state with `--eval` instead of trusting the pictures, and
read every file. Several round-3 "reproduced" verdicts do not hold up. Four README claims fail to reproduce, so the
cap-at-6 rule applies. On top of that, the in-game toolbar has no way to reach this module (issue 1).

## Screenshots reviewed (path — what I saw, one line each)
- `tools/shots/tools-overview-15.png`: top-down view with the S-curve gravel road, a real bridge over the river, the lodge and the gate. The "raised ground" isn't visible (measured +0.083 m per raise, see issue 6). I can't see the painted habitat or the zebras at this scale. The ring-shaped crater at the right is terrain, not the habitat.
- `tools/shots/tools-road-16.png`: a flat, uniform mint band runs from the end of the gravel road to the right edge of the frame. I see no node markers, no cyan snap ring and no grade colouring (everything is green).
- `tools/shots/tools-terrain-16_5.png`: a clean bright-green ring cursor sits around a smooth dark-brown mound at a lakeshore. This is the best tool visual in the set.
- `tools/shots/tools-building-17.png`: the red "invalid" ghost covers the lodge. The validity signal reads clearly, but the ghost is a mess of overlapping, unsorted translucent layers with no outline (the ghost belongs to `buildings.preview`).
- `tools/shots/tools-close-16_5.png`: the lodge fills the frame and there is **no selection marker anywhere**. `world.selection` is `b_1`, but the marker ring has a hard-coded radius of 4 m and sits under a lodge roughly 30 m across.
- `tools/shots/tools-night-21_5.png`: the lodge glows warm amber, and the road and river are readable. There's no selection marker here either, even though the lodge is "still selected".
- `tools/shots/tools-critic-r4-roadclose-12.png` (extra, road preset at 12 h, camera moved to 55 m from the snap junction): the preview is a 7 m flat slab. Grass blades poke through it and its lower edge dips under the terrain. The 0.55 m node discs are buried in grass and there's no snap ring at the junction.
- `tools/shots/tools-critic-r4-habitat-9.png` (extra, road preset at 9 h, camera on the habitat): the re-raycast live point drags the preview straight into a lake with no warning colour. Terrain punches a large hole through the ribbon. The habitat itself shows only fence posts and 2 zebras (not 3).
- `tools/shots/tools-critic-r4-eval.png` (extra, close preset after my scripted API checks): after Escape the ribbon is gone, so cleanup works. Nothing else is in frame.

## Contract / errors / perf

| preset | drawCalls | triangles | errors | tools updateMs (EMA) |
|---|---|---|---|---|
| overview 15 | 99 | 3,551,012 | [] | 0.028 |
| road 16 | 106 | 3,660,027 | [] | 0.339 |
| terrain 16.5 | 94 | 3,207,087 | [] | **131.16** |
| building 17 | 94 | 3,244,731 | [] | — |
| close 16.5 | 95 | 3,110,552 | [] | — |
| night 21.5 | 100 | 3,505,318 | [] | — |
| extra road-close 12 | 103 | 3,594,311 | [] | 0.296 |
| extra habitat 9 | 105 | 3,627,259 | [] | — |
| extra eval (close) | 95 | 3,110,552 | [] | 52.2 during a 10-frame drag (EMA α=0.05 ⇒ ≈130 ms/frame actual) |

- There are zero console errors in every capture. My first eval attempt errored with `out.set is not a function`. My own script caused it, by assigning a plain object to `app.input.ground` (a `Vector3`), so I don't count it against the module.
- Every capture logged `[core] dependency cycle at "zoning"` in `warnings`. That comes from core or zoning, not tools, but it shows up in this module's showcase.
- Draw calls are about 100 per frame for the whole scene; this module's own share is ≤ 5. That is well inside budget. `modules.tools.status === 'ok'` throughout.
- The `update()` budget is 1.5 ms (ARCHITECTURE §7). A held terrain drag costs about 130 ms per frame inside `tools.update()`. This reproduces round 3's "unexplained" 143 ms and explains it (issue 3).
- `lint` ok, and there's no `Math.random`. `dispose()` releases the ring, ribbon, marker, group and listeners.
- The "zero per-frame allocations" rule is violated (issue 5).

### Scripted verification (`--eval`, close preset, seed 1)

| claim | result |
|---|---|
| answers `tool:request` from ui (spec line 1) | **NO**: `tool:request {tool:'road.gravel'}` and `{tool:'road'}` both leave `current()` = `select` |
| Ctrl+Z via `input:key` undoes | yes: 4 × Ctrl+Z removed 2 zebras, the gate and the lodge |
| undo-all restores terrain/cash exactly; redo-all restores | yes: heights 4.519→4.435→4.519, cash −133,358→250,000→−133,358, 9 undo / 9 redo |
| "world.selection is cleared rather than left pointing at a stale id" | **NO**: after undoing the gate, `world.selection` is still `{building, b_2}` for a building that no longer exists |
| two-press Delete confirm + undo | yes: first press emits `tool:confirmRequest` and the second bulldozes; undo re-places the lodge as `b_5` (documented id churn) |
| selection marker tracks the selected entity | **NO for animals**: the zebra walked 4.31 m and the marker stayed 4.31 m behind at its old spot (position is cached once) |
| road preset "cyan snap-indicator ring" | **NO**: `snap.visible === false` (the snap ring only shows for the *live* point, which isn't snapped in this preset) |
| scripted session "release 3 zebras" | **NO**: 2 released (undo stack 9 ops = 3 raise + road + zone + lodge + gate + 2 animals) |
| grade warning red > 12 % | 0 red vertices in the road preset; the mechanism exists in code but no shot demonstrates it |

## Ranked issues (most damaging first)

1. **[blocker] The game UI cannot activate any tool.**
   - **What:** Spec line 1: "Listens to `tool:request` from ui". `ui/toolbar.js` and `ui/index.js:77` emit `tool:request {tool:'road.gravel' | 'terrain.raise' | 'building.place' | 'zone.habitat' | 'bulldoze' | 'animal.place', options}`. `ui/sidepanel.js` emits `bulldoze` / `animal.sell` requests the same way. Nothing in `src/` subscribes to that event, and nothing outside tools calls `tools.activate()`. I verified it live: both the dotted name ui uses and the plain name leave the current tool at `select`.
   - **Where it shows:** every toolbar button and every sidepanel Demolish/Sell button is dead in the real game. The module is only reachable from its own showcase script.
   - **Why it matters:** this module is "the player's hands". CS2's entire tool feel is moot if clicking the toolbar does nothing.
   - **Fix:** in `init()`, add `ctx.events.on('tool:request', …)` that maps ui's vocabulary to `activate()` (`terrain.raise` → `('terrain',{mode:'raise'})`, `road.gravel` → `('road',{kind:'gravel'})`, `zone.erase` → `('zone',{mode:'erase'})`, `building.place` → `('building', options)`, `animal.place` → `('animal', options)`, `bulldoze` with `options.id` → bulldoze that selection, `null` → `deactivate()`). Document it in the README events table.
2. **[major] The selection marker is invisible on the module's own `close` and `night` presets.**
   - **What:** README claim "the pulsing selection-marker ring visible" does not reproduce. `updateMarker` hard-codes radius 4 for buildings, which puts a 5 m white ring 0.15 m above the ground *under* a ~30 m lodge, fully occluded. Round 3 called this a contrast nit; it is a sizing bug.
   - **Where it shows:** `tools-close-16_5.png` and `tools-night-21_5.png`.
   - **Why it matters:** selection feedback is the most basic CS2 affordance.
   - **Fix:** size from the footprint, `hypot(rec.w, rec.d) / 2 + margin`. Draw it with `depthTest:false`, or add an outline/tint on the selected building.
3. **[major] A terrain drag costs about 130 ms per frame inside `tools.update()`, roughly 85× the 1.5 ms budget.**
   - **What:** `TerrainTool.update` calls `terrain.raise()` every frame while the button is held. Each call runs terrain's full `afterEdit()` pipeline (chunk rebuild, water check, texture upload). It reproduces in both the preset JSON (131 ms) and my eval (EMA 52 after 10 frames ⇒ about 130 ms real). This is the root cause of round 3's "unexplained" 143 ms.
   - **Why it matters:** CPU-side, so it isn't a SwiftShader artefact. Brushing terrain would hitch badly.
   - **Fix:** accumulate brush deltas and flush to terrain at most every N ms, or once per frame via a batched/deferred `afterEdit`. Request a `terrain.beginEdit()/endEdit()` batching API if needed.
4. **[major] The road preview is not CS2-grade and doesn't show what the README says.**
   - **What:**
     - The ribbon is one flat translucent mint slab at constant height across its width, so terrain and grass cut through it (`roadclose-12`, `habitat-9`).
     - The node markers are 0.55 m discs buried in grass.
     - The snap ring is never shown in the `road` preset (`snap.visible === false`), which fails the README claim.
     - A path into a lake gets no warning.
     - There is no length/cost/angle guide (spec: "cost preview", "straight/curve modes"; neither is implemented and neither is listed in Known gaps).
   - **Fix:**
     - Render with `depthTest:false` (or a polygon offset) and conform each cross-section's two edges to the terrain separately.
     - Scale markers to about the road width.
     - Show the snap ring for committed snapped points too.
     - Colour water crossings and add a floating length/cost readout (via ui or a sprite).
     - Implement or disclose straight mode.
5. **[major] Per-frame allocations, and the README/`cursors.js` claim is false.**
   - **What:** `RoadRibbon.update` does `points.map(p => new THREE.Vector3(...))` and `new THREE.CatmullRomCurve3(...)` every frame, and the new curve recomputes its arc-length table each frame. `RoadTool.update` does `S.road.points.slice()` and allocates a new snap object each frame. `TerrainTool.update` builds a `colors` object literal each frame. The README says "all pre-allocated, mutated in place per frame" and the file header says "no per-frame `new` beyond a couple of reused scratch Vector3s". Both are false, against the hard rule "zero per-frame allocations".
   - **Fix:** preallocate a Vector3 pool plus one curve whose `.points` you mutate. Rebuild only when the point set or the cursor changes. Hoist `colors` to module scope.
6. **[minor] Stale selection after undo.**
   - **What:** README claim "world.selection is cleared rather than left pointing at a stale id" fails. Undoing a placement leaves `world.selection` on the deleted id, so ui's side panel can show a ghost entity.
   - **Fix:** clear the selection in every op's undo/redo when it removes the selected id.
7. **[minor] The selection marker doesn't follow moving animals.**
   - **What:** `markerTarget.pos` is cached once per selection. A walking zebra leaves its ring behind.
   - **Fix:** recompute `entityPosition` every frame for `kind === 'animal'` (into a reused vector).
8. **[minor] Showcase honesty.**
   - "Release 3 zebras" actually releases 2.
   - "Raise at 3 points" raises 8 cm each (a single click applies `strength·1/60`), so the overview's "raised ground" is invisible.
   - The README still says there is no public spend API, but `simulation.spend(amount, reason)` has existed since 2026-09-08. `common.js` still writes `world.economy.cash` directly, which bypasses the spend log.
   - Fix: use `simulation.spend`, correct the README, and either move the third zebra spot inside the habitat or say 2.
9. **[minor, cross-module]** The building ghost (`buildings.preview`) renders as unsorted stacked translucent layers. Validity reads fine, but it looks messy next to CS2's clean tinted ghost with outline. File with `buildings`.

## What is genuinely good
- The undo/redo framework is solid. A full undo-all/redo-all round trip restores terrain heights to 3 decimals and cash to the dollar, and Ctrl+Z / Ctrl+Y work through the real `input:key` path.
- The two-press Delete confirmation works exactly as documented, including `tool:confirmRequest`.
- The terrain ring cursor is clean, conforms to the terrain and reads well.
- Red/green validity from `canPlace()` is correct and unambiguous.
- Every entry point is error-isolated, there are zero console errors, and the module's own draw-call footprint is tiny.

## Verdict
FAIL, 5.5. The internals (undo model, cost symmetry, delete confirmation) are well built. But round 3's 8.0 rested on pictures, not checks. Live verification shows:
- The UI never reaches the module (no `tool:request` handler), so none of this is playable in the game.
- Three presets' headline claims don't show (selection marker, snap ring, 3 zebras), which triggers the cap-at-6 rule.
- A terrain brush costs about 130 ms per frame.
- The hard zero-allocation rule is broken in the preview path.

Wiring `tool:request`, sizing the selection marker, and throttling terrain edits would lift the most, fastest.
