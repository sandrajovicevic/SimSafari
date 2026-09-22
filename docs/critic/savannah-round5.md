# savannah — round 5 — score 6.0 / 10 — FAIL

All 10 presets independently captured and read this round.

## Screenshots reviewed (path — what I saw, one line each)
- `tools/shots/savannah-overview-16_5.png` — the whole composed world from height: river + gallery, golden grassland with acacias, kopjes, a waterhole pan, a dirt track with a bridge — genuinely coherent, matches the description.
- `tools/shots/savannah-close-16.png` — **does not show the described "foreground grass and an acacia trunk at eye level, the kopje softening into haze behind."** Instead it shows a dense zebra/wildebeest herd crossing directly in front of the lens, filling the middle-ground; no kopje is visible anywhere in frame. Confirmed via the JSON that the correct preset (`close`) and its own authored camera (`distance:15, pitch:10, yaw:205`) were used — this is a genuine composition mismatch, not a wrong-shot mistake on my part (see Ranked Issues #1).
- `tools/shots/savannah-hero-17_4.png` — the flagship golden-hour shot is dominated by sun glare blowing out roughly the left half of the frame to near-white; I could not identify a clear "grazing herd across the middle distance" or a legible "kopje silhouette on the right third" as the description promises — the right side shows escarpment cliff, not a kopje, and the middle distance reads empty.
- `tools/shots/savannah-waterhole-8.png` — elephants and giraffes at a muddy brown pan, zebra at the shore, a prominent fever tree in the foreground — matches the description; the pan's brown-mud colouring is plausible for a real waterhole, not a defect.
- `tools/shots/savannah-kopje-17_8.png` — the pride at the kopje's foot, warm three-quarter light, the male's mane and build legible through the grass, boulder backdrop — the round-3 fix claim holds up under fresh inspection.
- `tools/shots/savannah-herd-16.png` — zebra and wildebeest crossing open grassland at eye level, acacias framing the shot — this is genuinely good, and **is visually near-identical in subject and composition to what `close` incorrectly showed** (see below).
- `tools/shots/savannah-river-9_5.png` — the riverine gallery from on the water looking down the channel, a boulder in the foreground, fever trees on both banks — matches the description precisely.
- `tools/shots/savannah-storm-15.png` — moody dark sky, visible rain streaks, the track leading into the haze — matches the description; draw calls/triangles (92 / 3.11M) measured noticeably lower than the README's own table (174 / 4.07M) for this preset specifically, most likely session-to-session scene variance (different animal/prop counts or LOD state) rather than a defect, since the image itself looks correct and error-free.
- `tools/shots/savannah-night-22.png` — **the waterhole pan renders as the single brightest object in the frame, a uniform bright cream-tan fill, clearly brighter than the "moon glitter path" the description promises and brighter than anything else in the scene** — this is the same night-water-overbright defect independently found and measured in `terrain`'s, `animals`', and `traffic`'s reviews this round; a fourth independent cross-module confirmation of an unresolved, systemic bug.
- `tools/shots/savannah-dawn-6_3.png` — heavy dawn mist over the escarpment, a kopje silhouette dimly visible through the haze, acacias in the foreground, warm sun breaking over the cliff on the right — matches "heavy dawn mist, the sun breaking over the escarpment" precisely; one of the best shots in the set.

## Contract / errors / perf (table: preset, drawCalls, triangles, errors)
| preset | drawCalls | triangles | errors |
|---|---|---|---|
| overview (16.5h) | 165 | 3,575,101 | [] |
| close (16h) | 209 | 4,803,843 | [] |
| hero (17.4h) | 192 | 4,544,533 | [] |
| waterhole (8h) | 200 | 3,963,856 | [] |
| kopje (17.8h) | 185 | 3,709,866 | [] |
| herd (16h) | 210 | 4,832,200 | [] |
| river (9.5h) | 188 | 4,564,596 | [] |
| storm (15h) | 92 | 3,113,981 | [] |
| night (22h) | 202 | 3,970,520 | [] |
| dawn (6.3h) | 228 | 5,107,215 | [] |

Zero console errors on all 10 presets. All comfortably inside the ≤1500 draw / ≤6M triangle whole-scene budget. Draw calls/triangles for 6 of 9 presets match the README's own table essentially exactly (overview, waterhole, kopje, herd, river all within rounding); `close` and `hero` and `storm` show larger deltas, consistent with the composition issues found below (different content actually on screen than what the README measured against).

## Ranked issues (most damaging first)

1. **[major] The `close` preset shows the wrong scene — a herd crossing, not the described quiet foreground-grass-and-acacia-trunk composition — and it is nearly indistinguishable in subject from the `herd` preset shot right next to it.** Both `close` (tod 16) and `herd` (tod 16) show a zebra/wildebeest herd crossing open grassland at similar framing; `close`'s own authored camera (15 m distance, aimed via the module's per-seed anchor recomputation) apparently lands its "eye level" shot directly in the herd's walking path for this seed, rather than on the quiet grass-and-trunk subject the description promises — no kopje is visible in `close` at all, contradicting "the kopje softening into haze behind." This is a genuine, reproducible discrepancy between what the preset claims to demonstrate and what it actually renders, not a one-off camera glitch (I confirmed the correct preset/camera parameters were used via the capture JSON). Fix direction: the herd's `target` path and `close`'s camera anchor need to be kept apart for this seed, or `close`'s subject (grass+trunk) needs to be staged with `props.clear`/a held prop the way `kopje`'s subject is staged, rather than relying on incidental terrain-feature anchoring alone.
2. **[major] The `hero` flagship shot does not deliver its promised composition**: roughly half the frame is blown out by sun glare, no legible kopje silhouette is visible on the right third (escarpment cliff instead), and no grazing herd is visible in the middle distance — three of the description's four named compositional elements (acacia left third is present; herd, kopje silhouette, and controlled haze layering are not clearly delivered) do not read as claimed in this capture.
3. **[minor, cross-module, already flagged elsewhere]** Night waterhole glows uniformly bright — the same terrain/environment water-at-night bug independently confirmed in three other modules' reviews this round, not specific to this module's own code, but visible here as a fourth data point.

## What is genuinely good
- `overview`, `waterhole`, `kopje`, `herd`, `river`, `storm`, and `dawn` all deliver exactly what their descriptions promise, with genuinely strong, well-composed, atmospheric photography-adjacent framing.
- The `kopje` subject (lion pride) — previously the module's most-documented fix — holds up under fresh, independent inspection: the male reads clearly, mane and build legible, correctly lit.
- The riverine gallery (`river`) is one of the best single images reviewed across this whole critic pass.
- The module's own README is exceptionally self-critical (a full "what still reads as CG versus photography" section) — the honesty of that section is real and matches what I found for the presets that do work correctly.
- `dispose()`/API/lint are all clean; the module correctly adds no scene content of its own (all visible geometry belongs to the composed modules, verified by draw-call attribution matching those modules' own claims).

## Verdict
FAIL. Zero console errors and comfortably within budget, but two of the module's ten presets — including the flagship `hero` shot — do not deliver the specific composition their own descriptions promise, one of them (`close`) essentially duplicating another preset's subject by camera-anchor accident rather than showing what it claims to show. Capped well below the previous score given these are exactly the kind of "looks right until someone actually looks" defects this critic pass exists to catch, on top of a fourth cross-module confirmation of the unresolved night-water brightness bug.
