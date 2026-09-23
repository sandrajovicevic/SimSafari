# savannah — round 6 — score 7.0 / 10 — FAIL

All 10 presets independently captured and read this round (first pass hit a system-load timeout
running concurrently with other captures — re-run solo, all 10 came back `ready=true, errors=0`).

## Screenshots reviewed (path — what I saw, one line each)
- `tools/shots/savannah-overview-16_5.png` — whole composed world: river + gallery, golden grassland
  with acacias, kopjes, waterhole pan, dirt track — unchanged, still coherent and strong.
- `tools/shots/savannah-close-16.png` — **the herd-crossing bug is fixed**: this now shows quiet dry
  grassland foreground with a large dark tree-canopy mass at bottom-left and open plain/gallery
  forest behind, no zebra/wildebeest herd anywhere in frame. However the promised composition is
  only partially delivered — see Ranked Issues #1.
- `tools/shots/savannah-hero-17_4.png` — **unchanged, as expected (not touched this round)**: still
  dominated by sun glare across roughly the upper-left third, the right side still shows the
  escarpment cliff rather than a kopje silhouette, and only a faint, barely-legible pale cluster in
  the middle distance might be the promised herd.
- `tools/shots/savannah-waterhole-8.png` — elephants and giraffes at a muddy pan, zebra at the shore,
  fever tree foreground — unchanged, still one of the strongest images in the set.
- `tools/shots/savannah-kopje-17_8.png` — the pride at the kopje's foot, male's mane and build
  legible through the grass — unchanged, still holds up.
- `tools/shots/savannah-herd-16.png` — zebra/wildebeest crossing open grassland — unchanged, still
  good, and now genuinely distinct from `close` (see #1).
- `tools/shots/savannah-river-9_5.png` — riverine gallery from the water — unchanged, still one of
  the best single images in the project.
- `tools/shots/savannah-storm-15.png` — moody dark sky, rain streaks — unchanged, still good.
- `tools/shots/savannah-night-22.png` — **improved, not fully resolved**: the waterhole pan now shows
  a dappled, textured cream-tan ring around a visibly darker, smoother centre — real depth-based
  variation (shallow-water/foam brighter at the shore, deep water calmer) rather than the uniform
  flat-bright fill round 5 flagged. It is still the single brightest feature in frame — pixel
  readback on the bright shore ring gave RGB(90,72,50) against sky RGB(18,24,28) and ground RGB(6,4,1)
  — but that is defensible as the described "moon glitter path" rather than a uniform blowout, since
  the pattern now clearly varies with apparent water depth instead of reading as one flat sheet.
- `tools/shots/savannah-dawn-6_3.png` — heavy dawn mist over the escarpment — unchanged, still one of
  the best shots in the set.

## Contract / errors / perf (table: preset, drawCalls, triangles, errors)
| preset | drawCalls | triangles | errors |
|---|---|---|---|
| overview (16.5h) | 165 | 3,568,263 | [] |
| close (16h) | 186 | 4,435,121 | [] |
| hero (17.4h) | 195 | 4,735,792 | [] |
| waterhole (8h) | 192 | 3,952,254 | [] |
| kopje (17.8h) | 193 | 3,758,302 | [] |
| herd (16h) | 211 | 4,871,592 | [] |
| river (9.5h) | 204 | 4,596,120 | [] |
| storm (15h) | 93 | 3,109,227 | [] |
| night (22h) | 194 | 3,947,894 | [] |
| dawn (6.3h) | 227 | 5,108,379 | [] |

Zero console errors on all 10 presets. All comfortably inside the ≤1500 draw / ≤6M triangle
whole-scene budget.

## Ranked issues (most damaging first)

1. **[major] `close` no longer shows the herd (confirmed fixed), but still does not fully deliver its
   promised composition — no kopje is visible.** The described "acacia trunk at eye level, the kopje
   softening into haze behind" only half-lands: the right/background of frame shows a long, uniform
   cliff wall matching the escarpment's own signature look (a lone tree silhouette atop a flat
   plateau), not a compact rounded kopje boulder pile — `showcase.js`'s fix aims `close`'s yaw via
   `degOf(cx - kopje.x, cz - kopje.z) + 15`, which points *toward* the kopje, but for this seed's
   anchor position what actually falls in that direction reads as escarpment, not kopje. Separately,
   the "acacia trunk" foreground element is a very large, close, near-black canopy mass filling the
   bottom-left corner — plausibly the camera sitting too close to/inside a tree's canopy — which
   reads as an ambiguous dark blob rather than a clean, recognisable trunk silhouette. Net effect: the
   specific "herd crossing the wrong preset" defect that drove last round's finding is genuinely and
   completely gone (verified — no herd, no zebra/wildebeest anywhere in this frame), which is real,
   confirmed progress; but the preset still does not show what its own description promises, just a
   different way of not showing it. Fix direction: validate that the resolved anchor's kopje-ward
   sightline is not itself blocked by escarpment or an over-close tree canopy, not just that it clears
   the herd's corridor.
2. **[major, unchanged, not touched this round] `hero` still does not deliver its promised
   composition.** Confirmed unchanged from round 5, as expected since this preset's camera anchor was
   not part of this round's fix: sun glare still blows out roughly the upper-left of the frame, the
   right third still shows escarpment rather than a kopje silhouette, and the "grazing herd across the
   middle distance" is at best a faint, barely legible pale smudge. This is the flagship shot and it
   still does not work.
3. **[minor, cross-module, genuinely improved this round]** Night waterhole is no longer a uniform
   flat-bright fill — it now shows real shore/deep-water brightness variation matching a "moon glitter
   path" — but the shore ring remains markedly brighter than everything else in frame (confirmed via
   pixel readback, ~4–5× the sky's brightness at that point). A partial, genuine improvement, not a
   full resolution; downgraded from the prior round's cross-module major to a module-level minor.

## What is genuinely good
- The `close` fix is real: the specific defect flagged last round — a walking zebra/wildebeest herd
  crossing what was meant to be a quiet grass-and-trunk shot, making it visually indistinguishable
  from `herd` — is completely and verifiably gone. That was a serious, confirmed regression and it no
  longer reproduces.
- `overview`, `waterhole`, `kopje`, `herd`, `river`, `storm`, and `dawn` all continue to deliver
  exactly what their descriptions promise, unregressed by this round's changes.
- Night water shows a real, physically-motivated improvement (depth-varying brightness) rather than a
  flat blown-out fill.
- Module still adds no scene content of its own; `dispose()`/API/lint clean; zero console errors
  across every preset.

## Verdict
FAIL. The specific bug this round targeted in `close` — a herd crossing the frame — is genuinely and
completely fixed, which is real progress and independently confirmed here, not taken on faith. But the
preset still does not deliver its own promised composition (no kopje, an over-close tree canopy), and
`hero`, the module's flagship shot, is unchanged and still broken exactly as before, since its camera
anchor was outside this round's scope. Score raised from 6.0 to 7.0 to reflect the genuine, confirmed
fix and the improved night water, while withholding further credit until `close` actually shows a
kopje and `hero` gets its own fix.
