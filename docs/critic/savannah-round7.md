# savannah — round 7 — score 6.0 / 10 — FAIL

All captures are my own, real GPU (`tools/gpu-check.mjs`, `--use-angle=d3d11`; every JSON's gpu
string reads `ANGLE (AMD … Direct3D11)`): all 10 presets plus 3 extras the builder did not pick
(`waterhole 17.6`, `night 3`, `hero 12`), 1920×1080, seed 1. Every PNG was read. This is the
requested re-verification of the 09-24 "wrong-scene pass" plus the water/Fresnel work.

## Screenshots reviewed (path — what I saw, one line each)
- `tools/shots/crit6-savannah-hero-17_4.png` — **glare fix holds**: warm layered dusk, escarpment in haze, river glinting through the gallery, safari truck at the crossing, ostriches at the right pan; but the herd is still ~20 small pale/dark blobs at 200+ m and the bottom ~45 % of the flagship frame is empty uniform grass.
- `tools/shots/crit6-savannah-hero-12.png` (extra) — same framing at noon: composition verdict confirmed — the small-subject/empty-foreground problem is staging, not light; dark rim tufts on the escarpment still read as floating specks.
- `tools/shots/crit6-savannah-close-16.png` — re-stage holds: eye-level sward, acacia trunk left, kopje centre, escarpment right, no herd; props' dark mat polygons litter the mid-ground.
- `tools/shots/crit6-savannah-waterhole-8.png` — **biggest win of the round**: the pan now mirrors the pale morning sky with soft shores; elephants, giraffes and white-horse "zebra" at the water read as a real scene; the surface lacks shore/tree reflections and reads slightly milky up close, and the elephants are static models frozen mid-stance.
- `tools/shots/crit6-savannah-waterhole-17_6.png` (extra) — golden-hour version: warm mirror pan, sun path on water right, silhouetted elephants; the bright blown water path is borderline.
- `tools/shots/crit6-savannah-kopje-17_8.png` — the pride is now three **standing, fully-maned male** lions in open red grass at ~30–40 m: no 8 m framing, no boulder backdrop, no lionesses, no resting — the animals glTF swap broke the staging this preset was built around (see issues).
- `tools/shots/crit6-savannah-herd-16.png` — the best-composed frame: eye-level mixed herd spreading naturally across frame between acacia trunks; the "zebra" are recognisably horses (animals-module defect showing through); harsh alpha cutouts where canopy meets sky top-right.
- `tools/shots/crit6-savannah-river-9_5.png` — **r6's flat-opaque-water major is fixed**: the channel mirrors sky and clouds, near-field ripple normals read, pale lit silt banks line both shores; water still takes ~55 % of the frame but now earns it; tree reflections absent.
- `tools/shots/crit6-savannah-night-22.png` — **the glowing shoreline ring is gone**: the pan is dark moonlit water with a faint sheen; elephants at the water, pale herd at the right shore; the only legible hippo is a pink blob at the bottom-right frame edge **in the grass**, not at the water.
- `tools/shots/crit6-savannah-night-3.png` (extra) — 3 h confirms the ring fix is tod-independent; same missing hippos-at-the-water.
- `tools/shots/crit6-savannah-storm-15.png` — rain streaks are improved (visible vertical shafts) and the light is correctly dreary, but the pitch-22 aerial from 330 m **still frames no sky**: no dark front anywhere, just a pale-grey haze band. Second round in a row the description's lead claim is not in frame.
- `tools/shots/crit6-savannah-dawn-6_3.png` — golden break over the escarpment is pretty, but the lens still sits just above the canopy: >50 % of the frame is a mat of dark jagged alpha leaf cards; mist is orange haze only; the river is a distant glint.
- `tools/shots/crit6-savannah-overview-16_5.png` — heavy grey-tan haze flattens the whole aerial; the hard-edged polygonal near-field grass footprint and a straight fog-band edge are both still visible from 780 m; track, bridge, river and kopjes read.

## Contract / errors / perf (table: preset, drawCalls, triangles, errors)
| preset | drawCalls | triangles | errors |
|---|---|---|---|
| overview (16.5 h) | 184 | 3,539,668 | [] |
| close (16 h) | 199 | 3,365,022 | [] |
| hero (17.4 h) | 275 | 4,293,380 | [] |
| hero (12 h, extra) | 274 | 4,260,612 | [] |
| waterhole (8 h) | 234 | 3,760,145 | [] |
| waterhole (17.6 h, extra) | 240 | 3,928,665 | [] |
| kopje (17.8 h) | 216 | 3,508,236 | [] |
| herd (16 h) | 279 | 4,239,670 | [] |
| river (9.5 h) | 205 | 4,556,925 | [] |
| storm (15 h) | 111 | 2,996,188 | [] |
| night (22 h) | 236 | 3,682,029 | [] |
| night (3 h, extra) | 235 | 3,649,261 | [] |
| dawn (6.3 h) | 307 | 4,530,338 | [] |

- Zero console errors on all 13 captures; every module `ok`; worst preset 307 draws / 4.56 M tris — inside ≤1500 / ≤6 M with headroom.
- Contract: `presetNames()` exists and returns the 10 required names; deps `[]` with the 7 optional composers all null-checked in `showcase.js`; `update()` empty (allocates nothing); `dispose()` clean; lint ok.
- The README "Measured" table remains stale (r6 minor, still open): my `close` 199/3.37 M vs table 211/4.85 M, `hero` 275/4.29 M vs 206/4.80 M — pre-re-stage **and** now pre-asset-pass numbers; every preset differs from the table this round.

## Ranked issues (most damaging first)
1. **[major — cap trigger, second round] `storm` still does not deliver "dark sky, rain approaching".** What: the preset's pitch-22 camera from 330 m keeps the sky out of frame except a thin pale-grey strip; the dark storm front exists nowhere in the image. Why it matters: it is the module's weather-showcase and its description's lead claim; a description that does not reproduce caps the module at 6 per the critic brief. Fix: drop pitch to 4–8° and frame the advancing front over the track (a third of frame dark cloud), or rewrite the description to "rain shafts over the plains from the air" and accept the cap's removal fight another day.
2. **[major — cap trigger, second round] `night` still shows no hippos at the waterhole.** What: at 22 h and 3 h the only identifiable hippo is a pink blob at the bottom-right frame edge in grass; whatever is in the pan is illegible; the "moon glitter path" is a faint sheen and "the herd asleep beyond" is three pale blobs. Why: same cap rule as above; this is the second consecutive round with the claim unreproduced. Fix: spawn the hippos half-submerged on the lens side of the pan with `hold`, keep the near shore clear of grass occlusion, and aim the moon-glitter lobe toward camera; or rewrite the description.
3. **[major] `kopje`'s staging claims no longer survive the animals asset swap.** What: README promises "the male three-quarter front-lit at ~8 m against the boulder backdrop, lionesses resting around him"; the capture shows three standing, fully-maned males in open grass at ~30–40 m with no boulder backdrop — the animals glTF pool has a single maned male mesh (no female, no rest pose), and the camera march landed far beyond 8 m on the current seed. Why: the pride's composition was this module's hand-tuned centrepiece; the description now describes a shot that does not exist. Fix: either compose the pride shot around what the mesh can do (closer lens, rock backdrop, one male) or request a female/non-maned variant from the animals builder; rewrite the row either way.
4. **[major] `hero`, the flagship, still buries its subject.** What: the herd reads as ~20 small pale/dark blobs at 200+ m and the bottom ~45 % of frame is empty grass (verified tod-independent at 12 h). Why: the shot list promises "the herd crossing the middle distance in raking side light" — technically true, but the reference domain (Serengeti golden-hour herd photographs) puts the animals in the lower-middle third, large. Fix: march the lens to 60–100 m from the herd with pitch 3–5° and plant a foreground tussock/trunk in the lower third.
5. **[minor] `overview` from 780 m**: heavy uniform haze plus the hard-edged polygonal near-field grass footprint and a straight fog-band boundary — props/terrain levers (feather the grass ring, vary haze by direction) or re-aim so the edges leave frame.
6. **[minor] `dawn` still places the lens just above the canopy**: >50 % jagged dark alpha leaf cards, no river to speak of, mist reads as orange haze — the description's "heavy dawn mist" is not delivered.
7. **[minor] README "Measured" table stale** for close/hero/kopje (pre-re-stage, pre-asset-pass); r6 noted it, nothing changed.

## What is genuinely good
- The 09-24 re-verification items all hold under independent capture: `close` has its own subject (holds at 16 h), `hero` is genuinely sun-aware with zero glare at 17.4 h and 12 h and aims at the live herd (truck and ostriches visible as bonuses).
- The terrain water work transforms this module: `river` and `waterhole` finally show reflective, silt-lined water, and the night shoreline glow ring — r6's measured 9×-grass-luminance defect — is gone at both 22 h and 3 h.
- `herd` is a genuinely well-composed wildlife frame; `night` is legible moonlight; the world layout (river, gallery, kopjes, pans, track with bridge) reads coherent at every distance.
- Zero errors, clean contract, generous budget headroom on all 13 captures.

## Verdict
**FAIL, 6.0 — capped, again, by two preset descriptions that do not reproduce (`storm`, `night`), now for the second consecutive round.** The water fixes are real and verified, and both 09-24 re-staged presets hold. But the composer's copy has drifted from its own shots in three more places since (kopje's 8 m/backdrop/lionesses, hero's empty foreground, dawn's mist), and the module's money shots are only as good as the animals-module assets now standing in them. Uncapped I would call this 7.0; the route to 8.5 is: put the storm sky and night hippos in frame or rewrite the descriptions, re-stage hero/kopje around the actual assets, and refresh the Measured table.

```json
{
  "savannah": {
    "score": 6.0,
    "round": 7,
    "status": "fail",
    "errors": 0,
    "drawCalls": 307,
    "issues": [
      { "sev": "major", "text": "Cap trigger (second round): storm's 'dark sky, rain approaching' is still not in frame — the pitch-22 aerial from 330 m shows only a pale-grey haze strip; rain streaks improved but no dark front anywhere. Lower pitch to 4-8 degrees and frame the front, or rewrite the description." },
      { "sev": "major", "text": "Cap trigger (second round): night still has no legible hippos at the waterhole at 22 h or 3 h — the only identifiable hippo is a pink frame-edge blob in the grass; 'moon glitter path' is a faint sheen; 'herd asleep beyond' is three pale blobs. Stage half-submerged hippos on the lens side with hold, or rewrite." },
      { "sev": "major", "text": "kopje claims no longer survive the animals asset swap: README promises 'the male three-quarter front-lit at ~8 m against the boulder backdrop, lionesses resting around him' — the shot shows three standing fully-maned MALES in open grass at ~30-40 m, no boulder backdrop (glTF pool has one maned male mesh, no female/rest variant; camera march landed far beyond 8 m). Re-stage around the actual mesh or request a female variant; rewrite the row." },
      { "sev": "major", "text": "hero still buries its subject: herd reads as ~20 small pale/dark blobs at 200+ m with the bottom ~45% of the flagship frame empty grass (tod-independent, verified at 12 h). March the lens to 60-100 m from the herd, pitch 3-5 degrees, foreground element in the lower third." },
      { "sev": "minor", "text": "overview from 780 m: heavy uniform haze plus a hard-edged polygonal near-field grass footprint and a straight fog-band boundary (props/terrain levers or re-aim)." },
      { "sev": "minor", "text": "dawn still places the lens just above the canopy: >50% jagged dark alpha leaf cards, mist reads as orange haze only, river barely visible — 'heavy dawn mist' not delivered." },
      { "sev": "minor", "text": "README Measured table stale for close/hero/kopje (pre-re-stage and pre-asset-pass numbers; measured close 199/3.37M vs table 211/4.85M, hero 275/4.29M vs 206/4.80M)." }
    ],
    "good": "09-24 re-verification passed: close holds its own subject and hero is genuinely sun-aware with zero glare at 17.4 h and 12 h, both re-verified at extra tods. Terrain's water work transforms the module: river and waterhole now mirror sky and clouds with lit silt banks, and the r6 night shoreline glow ring is GONE at 22 h and 3 h. herd is a well-composed wildlife frame; night is legible moonlight; the world layout reads coherent at every distance. Zero console errors on all 13 captures; worst 307 draws / 4.56 M tris, inside budget; contract clean, lint ok."
  }
}
```
