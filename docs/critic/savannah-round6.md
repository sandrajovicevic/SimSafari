# savannah — round 6 — score 6.0 / 10 — FAIL

All 10 presets captured independently this round (`--all-presets`, seed 1, 960×540, SwiftShader), plus 3 extra
captures the builder did not pick: `night` at 3 h, `close` at 6.5 h, `hero` at 12 h. Every PNG was read; three
were also cropped and zoomed 2-3× (night pan rim, night foreground "hippo", kopje male lion).

## Screenshots reviewed (path — what I saw, one line each)
- `tools/shots/savannah-overview-16_5.png`: river + gallery, escarpment, kopjes, pans, track and bridge all present. The **hard-edged polygonal patch of darker, denser grass** in the lower half is a large CG tell (the near-field grass/LOD footprint reads as a painted field boundary from altitude). Acacias read as dark dashes.
- `tools/shots/savannah-close-16.png`: **fixed vs round 5.** Eye-level stubble grass, an umbrella acacia trunk left, the kopje centre, escarpment right, no herd. It matches the description apart from the disclosed "sharp, not softening into haze". The grass is a sparse field of individual dark blades over bare sand, not a sward, and the kopje top is a flat block-textured wall.
- `tools/shots/savannah-close-6_5.png` (extra): same composition in warm dawn light. The re-staging holds at another tod, with the same grass and kopje tells.
- `tools/shots/savannah-hero-17_4.png`: **glare fixed.** Warm haze and a layered escarpment. The herd is present but tiny: about 15 grey-white blobs in the middle distance, zebra stripes illegible. The bottom ~55% of the flagship frame is an empty, uniform brown stipple. The "acacia line" is a wall of near-identical trees. The sky is a repeated popcorn-cloud pattern.
- `tools/shots/savannah-hero-12.png` (extra): same framing at noon. It confirms the composition problem (small herd, empty foreground) is staging, not light. Dark specks float above the escarpment rim (plateau trees reading as floating dots). A white wedge sits left of mid-frame.
- `tools/shots/savannah-waterhole-8.png`: elephants, zebra and a partly hidden giraffe at the pan, with a fever tree in the foreground. The pan is an opaque brown disc with no sky or tree reflection at 8 h, and the tree's shadow lies on it as on solid ground. The zebra read as white blobs.
- `tools/shots/savannah-kopje-17_8.png`: the pride is visible. At 2× zoom the male is a box body on cylinder legs with a crumpled-paper polygon mane, and the right lioness reads as a pale dog. Grass and ground are over-saturated orange-red, and the boulders behind are bubbly lumps. This is the module's "lions at 17.8 h" money shot and it reads as programmer art.
- `tools/shots/savannah-herd-16.png`: the best frame in the set. Zebra/wildebeest crossing at eye level, framed by a trunk and canopy, with acacias on the horizon. The herd walks in a single conga line, and the stripes are faint.
- `tools/shots/savannah-river-9_5.png`: looks down the channel. Half the frame is a flat, featureless dark-olive water plane with no reflections, and tree shadows lie on it as on ground. The shore is an orange gradient band, and the foreground boulder is visibly faceted low-poly. Weaker than round 5 credited.
- `tools/shots/savannah-storm-15.png`: rain streaks render as sparse white vertical "pins". **The sky is not in frame except as a thin pale-grey strip**, so there is no "dark sky". The track and bridge are visible. The description's lead claim is not delivered.
- `tools/shots/savannah-night-22.png`: **the night-water fix is partial.** The pan interior is now a muted brown (mean luma 37), but the whole shoreline is a thick band of blotchy cream glints (mean 64, max 168, about 9× the grass at mean 7). It is still the brightest element below the horizon and reads as a lit ring of sequins, not a moon glitter path. The only animal in the water is an elephant. The single hippo is a dark-pink blob cut by the bottom-right frame edge, in grass and not at the waterhole. Stars render as short horizontal dashes.
- `tools/shots/savannah-night-3.png` (extra): identical glowing shoreline ring at 3 h, so the defect is not tod-specific.
- `tools/shots/savannah-dawn-6_3.png`: the escarpment and kopje sit in warm haze with the sun low right. The lens sits just above the canopy, so the bottom 60% is a mat of large jagged alpha leaf cards. The mist is only an orange haze, and the description's river is not visible.

## Contract / errors / perf (table: preset, drawCalls, triangles, errors)
| preset | drawCalls | triangles | errors |
|---|---|---|---|
| overview (16.5h) | 165 | 3,575,099 | [] |
| close (16h) | 183 | 3,520,762 | [] |
| close (6.5h, extra) | 183 | 3,520,762 | [] |
| hero (17.4h) | 202 | 4,852,149 | [] |
| hero (12h, extra) | 201 | 4,819,381 | [] |
| waterhole (8h) | 200 | 3,963,854 | [] |
| kopje (17.8h) | 185 | 3,709,864 | [] |
| herd (16h) | 202 | 4,811,900 | [] |
| river (9.5h) | 188 | 4,565,058 | [] |
| storm (15h) | 92 | 3,112,965 | [] |
| night (22h) | 202 | 3,970,518 | [] |
| night (3h, extra) | 201 | 3,937,750 | [] |
| dawn (6.3h) | 228 | 5,106,101 | [] |

- Zero console errors on all 13 captures. Every module's status is `ok`. The only warnings are core `dependency cycle at "animals"/"zoning"`, which are not errors.
- The worst preset is 228 draw calls and 5.11 M triangles (dawn). Everything is inside ≤1500 draws and ≤6 M tris.
- `hero`'s drawCalls/triangles (202 / 4.85 M) are within budget but differ from the README table (206 / 4.80 M), and `close` differs too (183 / 3.52 M vs 211 / 4.85 M). The README table predates the re-stage and needs re-measuring.
- Contract: `index.js` exports id, deps `[]`, optional list, `presetNames()` (the only API listed, and it exists) and presets for all 10 required names. `update()` is empty, so it allocates nothing. `dispose()` removes the (empty) group. `node tools/lint.mjs src/modules/savannah` reports `lint ok`.

## Ranked issues (most damaging first)
1. **[major] Two preset descriptions are not reproduced, which caps the score at 6.**
   - `storm` promises "dark sky, rain approaching", but the pitch-22° camera from 330 m frames almost no sky and what shows is pale haze. The storm reads as a grey, drizzly aerial.
   - `night` promises "moonlit hippos at the waterhole, the herd asleep beyond". No hippo is at the water: the one hippo is a frame-edge blob in the foreground grass, the herd is not identifiable, and there is no moon glitter *path*.
   - Fix: lower `storm`'s pitch to 4-8° and aim at the storm front so a third of the frame is dark cloud. Stage the hippos in the pan on the lens side of the water (half-submerged, held) and keep the foreground clear. Otherwise rewrite both descriptions to what the shots show.
2. **[major] The night waterhole still glows.** The terrain 2026-09-22 fix removed the uniform cream fill, but a thick blotchy shoreline glint band remains at 22 h and 3 h. It measures about 9× the grass luminance and is the brightest thing below the horizon. Real moonlit water is near-black with one narrow glitter streak toward the moon. This is terrain's water shader, so it needs a `docs/requests/terrain.md` entry: clamp or attenuate the shore-foam/glint term by sun elevation, and restrict specular to the moon-aligned lobe.
3. **[major] The subjects the presets exist to show read as CG or programmer art up close.**
   - `kopje`: the male lion at about 8 m is a box-and-cylinder body with a polygon-paper mane, and a lioness reads as a dog.
   - `hero`: the flagship shows the herd as about 15 grey blobs, and the lower half of the frame is empty uniform grass.
   - Composer-side fixes: put hero's lens at 60-100 m from the *herd* rather than the aim point, with pitch 3-5° and a foreground element (a tussock or acacia trunk) in the lower third, so the herd fills the middle third. Pull the kopje camera back to 20-25 m so the lion model's limits are not the subject.
   - The model quality itself belongs to `animals` and should go through a request.
4. **[major] Water reads as a flat opaque plane in daylight too.** `river` spends half its frame on a featureless dark-olive surface with shadows cast onto it, and `waterhole` is a brown mud disc with no sky reflection at 8 h. Reference water at these grazing angles is mostly sky and bank reflection. This needs a terrain request (Fresnel or screen-space/planar reflection of sky and bank). Composer-side, reframe `river` so water is at most a third of the frame.
5. **[minor] `overview` shows a hard-edged polygonal grass/LOD footprint.** From 780 m it reads as a fenced field. The fix is to feather the near-field grass boundary (props/terrain request) or move the overview target so the edge falls off-frame.
6. **[minor] `dawn` misses its own brief.** The lens sits just above the canopy, so 60% of the frame is jagged alpha leaf cards, there is no river, and the "mist" is only warm haze. Lower the lens under the canopy or pull it back and aim across the river gallery.
7. **[minor] The README "Measured" table is stale for `close` and `hero`** (183 vs 211 draws for close) after the 09-24 re-stage.

## What is genuinely good
- Both round-5 wrong-scene defects are genuinely fixed.
  - `close` now has its own subject (grass, trunk, kopje) and no herd. The re-staging holds at 16 h and 6.5 h.
  - `hero` no longer faces the sun and has no glare at 17.4 h or 12 h.
- The builder rewrote the hero description to match the shot and disclosed it, which is honest.
- `herd` is a well-composed frame. Golden-hour colour, haze layering on the escarpment, and the overall world layout (river, gallery, kopjes, pans, track with bridge) are coherent.
- There are zero errors, it is well inside budget, the contract is clean, and lint passes.

## Verdict
**FAIL, 6.0.** The specific round-5 blockers (close duplicating herd, hero into the sun) are fixed and verified. However:
- `storm` ("dark sky") and `night` ("hippos at the waterhole") do not deliver what their descriptions promise, which triggers the 6.0 cap.
- The terrain night-water fix is only partial: a glowing shoreline ring remains.
- Seen with fresh eyes, several "working" presets (kopje, river, dawn, hero) fall short of the reference domain on subject fidelity and water rendering.

Even without the cap, this set reads as good-indie at best (about 6.5), well short of the 8.5 pass bar.
