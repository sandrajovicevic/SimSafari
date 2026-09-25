# audio — round 4 — score 8.5 / 10 — PASS

Headless module: judged from its own verification tool (`src/modules/audio/shot.mjs`), a direct
`--eval` probe through the core `tools/screenshot.mjs --dom --gesture`, and the DOM analyser panel
screenshots. I read all five PNGs. The one blocker from round 3 is fixed. Everything that is left is a nit.

## Screenshots reviewed (path — what I saw, one line each)
- `tools/shots/audio-overview-15-dom.png` (shot.mjs, 1920×1080): panel RUNNING. master −27.7 / ambience −30.6 / **animals −43.6 dB live**. Full 40 Hz–16 kHz spectrum with a gentle HF roll-off. Layers wind 0.41, grass 0.33, birds 0.47, insects/frogs 0. The log shows ostrich, elephant, wildebeest and zebra at 141–329 m, plus dove on the ambience bus. The orange/blue trigger rings on the terrain match the log.
- `tools/shots/audio-close-16_5-dom.png`: the burst preset. **animals −20.7 dB** and master −17.3 dB. A visible bump around 400–600 Hz in the spectrum from the calls. All eight species are cycling at 22–66 m. Three large orange rings sit near the camera target. Birds 0.60 at 16.5 h.
- `tools/shots/audio-night-22-dom.png`: insects 1.00, frogs 1.00, birds 0.15, wind 0.41. This **matches the README's night numbers exactly**. The spectrum shows cricket spikes around 3–5 kHz. master −19.6 dB. The animals bus reads −inf in the gap between calls, and the log shows lion, hyena, hippo and wildebeest queued 0.2–18.9 s ahead.
- `tools/shots/audio-storm-17-dom.png`: STORM flag, wind 14 m/s. Layers wind 1.00, rain 0.90, thunder 0.35, grass 0.55, birds suppressed to 0.14. master −13.7 dB, the loudest preset, as it should be. Thunder is logged at 741, 925 and 1722 m, and the spectrum is flat and broadband (rain wash).
- `tools/shots/audio-overview-12-dom.png` (mine, core tool, 1280×720, with the eval probe below): panel RUNNING. At 1280 px the environment line is **clipped at the right edge** ("…ctx 981.1 s g"), and the bus labels collide with the gain text ("ambience×0.80", "vehicles×0.70"). Otherwise it is correct: birds, goaway, warbler, tinkerbird and dove are scheduled on the ambience bus at 69–137 m.

## Contract / errors / perf
| preset (tod) | tool | errors | drawCalls* | triangles* | audio status | running |
|---|---|---|---|---|---|---|
| overview (15) | shot.mjs | [] | 67 | 3.12 M | ok | true |
| close (16.5) | shot.mjs | [] | 65 | 3.18 M | ok | true |
| night (22) | shot.mjs | [] | 70 | 3.34 M | ok | true |
| storm (17) | shot.mjs | [] | 66 | 3.37 M | ok | true |
| overview (12→eval sweep) | tools/screenshot.mjs --dom --gesture --eval | [] | 81 | 3.12 M | ok | true |

\* These counts are for the whole showcase scene (terrain, grass, props). The module itself contributes at most 12 ring meshes, only in the showcase, and none in the game. That is within budget.

- **`node src/modules/audio/shot.mjs` now runs to completion.** All 4 presets finished, `EXIT 0`, each with a PNG and a JSON (about 5 min per preset, most of it the 100–122 s offline `selfTest`). Round 3's blocker is resolved.
- `node tools/lint.mjs src/modules/audio`: lint ok. No `Math.random`.
- `update()` allocates nothing in JS: it uses module-scope `_v/_f/_u` and preallocated `Float32Array`s. It does create WebAudio nodes per *scheduled sound*, which is unavoidable, and they are retired by the `active` sweeps.
- `dispose()` removes the listeners, stops every engine loop and one-shot, disposes the ambience and the buses, and **closes the AudioContext**. It also untracks and disposes the marker materials.
- Warnings, not errors, all from other modules or from my own probe: `[core] dependency cycle at "audio"`. The cycle is audio→animals→zoning→simulation→traffic→audio, through optional lists. `props` has a "photo rock unavailable; ReferenceError: M is not defined" bug that belongs to props, not audio. The `BiquadFilter.frequency … outside nominal range [0, 11025]` warnings came from my own 22.05 kHz offline test context.

### Measured (my own eval probe, not the builder's numbers)
- **selfTest (30 renders)**: every entry has a sane RMS (−11.5 to −30.7 dB) with peaks at or below −3.1 dB, so nothing is clipped or silent. Estimated fundamentals are plausible and well differentiated: lion 80 Hz, hippo 32 Hz, ostrich boom 20 Hz, elephant trumpet 296 Hz, hyena 319 Hz, warbler 914 Hz, nightjar 956 Hz, grass 5.9 kHz, rain 8.7 kHz. It is identical across all four runs, so the output is deterministic under a seeded rng.
- **Distance law** (the module's own `spatialize()` plus `lion()`, listener facing −z): 10 m and 25 m both −24.2 dB (flat inside `refDistance`), 50 m −29.5, 100 m −35.2, 200 m −41.0, 400 m −47.0, 800 m −52.8. That is about −5.8 dB per doubling (inverse model with rolloff 0.85) plus the air-absorption low-pass. This is physically plausible and monotonic.
- **Panning**: a source 30 m to the right gives L −240 / R −22.6 dB, and the mirror case holds on the left. Front and behind both give −25.6/−25.6. Left/right orientation is correct. The equal-power model gives **no front/back cue** and **100 % isolation of the dry signal at 90°** (see issue 2).
- **Hour sweep** (`setTimeOfDay`, with the layers snapped): birds 0.15 at 02 h, 0.11 at 05 h, 0.67 at 06 h, **0.92 at 07 h (dawn chorus)**, 0.60 at 09 h, 0.38 at 12 h (midday lull), 0.47 at 15 h, 0.51 at 17 h, 0.34 at 18 h, 0.14 at 19 h. Insects go 1.0 at 02 h → 0.75 at 05 h → 0.25 at 06 h → 0 over the day → 0.2 at 18 h → 0.6 at 19 h → 1.0 at 20 h. The shape is right for the savannah: dawn chorus peak, midday lull, crickets fading in through dusk.
- **Crossfade without a snap** (world hour 12 → 22 changed directly, no `time:set`): `getLayers()` already read insects 1.0 and birds 0.15 at the first 0.5 s sample (see issue 4 for why the displayed value runs ahead of the audible gain).

## Ranked issues (most damaging first)
1. **[major] README public-API section has drifted from the code.** It says `selfTest()` "schedules one of everything; returns per-bus peak levels". In fact it offline-renders each sound and returns `{sound: rmsDb}`, and its details go to `lastSelfTest()`, which is undocumented. It says `getLevels()`/`getLayers()` return an "object". They actually return `Float32Array`s in `buses`/`layers` order, and there are **7** layers (wind, grass, birds, insects, frogs, rain, thunder), not the 4 listed. The preset table gives tod 12/17/22/15, but the code uses 15/16.5/22/17. `shot.mjs`, the module's own verification tool, is not mentioned anywhere. Why it matters: `ui`/`traffic` integrators code against this contract, and a caller doing `getLevels().master` gets `undefined`. The substantive claims all reproduced: night mix, 0 errors, calls spatialised at real distances, AudioContext closed on dispose. So I treat this as documentation drift and **did not** apply the unreproducible-claim cap of 6. Fix: rewrite the API block from `index.js` (10 minutes) and add a "Verification: `node src/modules/audio/shot.mjs`" line.
2. **[minor] Equal-power panner: hard 90° isolation, no front/back.** A dry source at 90° azimuth is fully absent from the far ear (−240 dB), at any distance. The reverb send softens this for far sources but not near ones. Front and behind are identical. Field recordings, and any AAA mix, keep some crossfeed. Fix: use `panningModel = 'HRTF'` for sources under about 80 m, or mix 15–20 % of a mono copy into the dry path, and add a gentle high-shelf cut for rear sources.
3. **[minor] `shot.mjs` hardening is only half done.** (a) It has a longer timeout but **no retry**. A failed `page.screenshot` is only logged, and the preset still prints `OK` and counts toward exit 0, so a run with a missing PNG passes silently. (b) The JSON `levels` are sampled right after the 100–122 s blocking `selfTest()`, so the animals bus reads −180 dB in **every** JSON, including `close`. The PNG taken 400 ms later shows −20.7 dB for the same preset, so the JSON undersells the module. (c) The viewport is fixed at 1920×1080. Fix: include the screenshot result in `ok`, retry once, and sample the levels *before* `selfTest()`.
4. **[minor] `getLayers()` shows the end-of-lookahead level, not the audible one.** Automation is pre-scheduled up to `now + lookahead`, where lookahead is clamped to 1.5–20 s and sits at 20 s on software GL. `levels[]` therefore holds the value at the horizon, and an hour change appears to cross-fade instantly (0 → 1.0 inside 0.5 s) even though the audible ramp follows the 1.6 s time constant later. At 60 fps (lookahead 1.5 s) this is harmless, but the debug panel mis-states the present. Fix: store the ramp value at `now` for display.
5. **[minor] Debug-panel cosmetics.** The environment line overflows the 616 px canvas (the gust/lookahead readout is cut off at both 1280 and 1920 widths), and the bus names overlap their gain labels.
6. **[minor] The wind bed has no diurnal cycle.** Wind stays at 0.41 from 02 h to 22 h at the same weather. Real savannah nights are usually calm and afternoons gusty. Fix: scale the wind/grass targets by an hour curve when weather gives no explicit wind change.
7. **[minor, disclosed]** Synthesised calls are impressionistic rather than species-accurate. There is one generic diesel engine loop and no music. `[core] dependency cycle at "audio"` is a warning coming from the optional-dependency graph (audio→animals→zoning→simulation→traffic→audio). Audio only reads `world.animals` at runtime, so it could drop `animals` from `optional` to break the cycle.

## What is genuinely good
- The round-3 blocker is fixed and verified: the module's own tool runs end to end on all four presets with zero errors.
- The measured behaviour is right in every dimension I probed: an inverse-distance law with air absorption, correct L/R orientation, a textbook dawn-chorus/midday-lull/dusk-cricket hour curve, storm ducking of birds and insects, and water-gated frogs.
- selfTest covers all 30 sounds with deterministic, differentiated, unclipped output.
- The analyser panel is a genuinely useful verification surface: bus meters, spectrum, layer mix, a scheduled-event log with metres, and matching world-space rings.
- Hygiene is clean: seeded rng, no JS allocations per frame, AudioContext closed on dispose, zero console errors.

## Verdict
PASS at 8.5. The engine does what the spec asks and the numbers hold up under independent probing. The tooling blocker from round 3 is gone. What remains is README drift (the most important item to fix next), the equal-power panning nit, and tooling and panel polish. Not higher: I cannot verify the synthesised calls against field recordings, the panning is not binaural, and the documentation of the public contract is wrong in several places.
