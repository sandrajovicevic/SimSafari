# audio — round 3 — score 8.0 / 10 — FAIL

Audio cannot be judged by looking at pixels; this round verifies it by reading the debug panel
screenshots (which show live bus meters, a real spectrum analyser and an event log) and by calling
the module's own `selfTest()`/`getLevels()`/`getLayers()` API directly via `--eval`, cross-checked
against the README's specific numeric claims rather than taken on faith.

## Screenshots reviewed (path — what I saw, one line each)
- `tools/shots/audio-overview-15-dom.png` — day mix debug panel: master/ambience meters populated (−28.3 / −32.7 dBFS), a genuinely full 40 Hz–16 kHz spectrum (not flat or empty), ambience layers wind 0.41 / grass 0.33 / birds 0.47 / insects 0 / frogs 0 (correct for midday), and a real "last triggered sounds" log (wildebeest, zebra, tinkerbird, dove, goaway, ostrich, elephant, each with real x/z and metre distances) — this is live, working spatial audio, not a static mock.
- `tools/shots/audio-night-22-dom.png` — layer mix read via `--eval`: `insects 1.00, frogs 1.00, birds 0.15, wind 0.41` — **matches the README's specific claimed numbers for this exact preset almost exactly**, independently reproduced, not just plausible-looking.
- `tools/shots/audio-storm-15-dom.png` — panel shows `STORM` flag active, rain 0.90, wind 1.00 (up from day's 0.41), thunder 0.35 with several real thunder events in the trigger log at real distances (925 m, 1255 m, 1831 m, 2050 m) — the storm bed is genuinely active, not just a flag.
- `selfTest()` result (my extra check, called directly via `--eval` since the module's own `shot.mjs` tool could not complete — see issue #1): all 30 catalogued sounds render to plausible, well-differentiated, non-degenerate RMS levels (−11.5 to −27.7 dBFS for the named calls/ambience/UI/engine set), and critically the distance-falloff pair `lion@10m: -23.3 dB` vs `lion@400m: -46.9 dB` confirms the `PannerNode` spatial chain actually attenuates with distance, end to end — not just a flat gain per sound.

## Contract / errors / perf
| preset | errors | running | notes |
|---|---|---|---|
| overview (15h) | [] | true | selfTest ok, 30/30 sounds render |
| night (22h) | [] | true | layer mix matches README's specific claim |
| storm (15h) | [] | true | STORM flag + thunder events firing |

Zero console errors across every capture. Draw calls: 0 (confirmed — the module's own group stays empty). `node tools/lint.mjs src/modules/audio` clean. `dispose()` (in `engine.js`) stops every active voice and vehicle-engine loop, disposes ambience and buses, and **closes the actual `AudioContext`** (`this.ac.close()`) — thorough, not just a node-removal stub.

## Ranked issues (most damaging first)

1. **[major] The module's own verification tool, `src/modules/audio/shot.mjs`, is broken — reproducible, not a fluke.** Running it (`node src/modules/audio/shot.mjs`) fails on the very first preset with `page.screenshot: Timeout 30000ms exceeded`, twice in a row. Root cause: it calls Playwright's `page.screenshot()` with the default 30 s timeout while the game's `requestAnimationFrame` loop keeps the compositor busy — **the exact failure mode the project's own core `tools/screenshot.mjs` has a documented comment about and was specifically hardened against** ("Playwright's default 30 s screenshot timeout intermittently gives up... Give it [an extended timeout / retry]"). `shot.mjs` never received that fix. This means the module's own documented verification path ("Screenshots need `--gesture`... judged from the JSON... via `--eval`") does not currently work as shipped. I verified the underlying audio engine is fine by reproducing the same `selfTest()`/`getLevels()`/`getLayers()` calls through the core `screenshot.mjs --dom --gesture --eval` path instead, which is why this module still scores well — but a critic (or builder) following the README's own instructions verbatim, exactly as written, hits a dead end. Fix: give `shot.mjs`'s `page.screenshot()` call the same extended-timeout/retry treatment `tools/screenshot.mjs` already has.
2. **[minor, disclosed]** `vehicles` and part of the `animals` bus read −inf dB in a still capture when no sound happens to be scheduled at that exact instant — honestly disclosed in the README as a capture-timing artifact, and consistent with what I observed (the `animals` bus is genuinely playing in the "last triggered sounds" log even while its instantaneous RMS bus meter reads −inf between calls).
3. **[minor, disclosed]** Synth calls are impressionistic, not species-accurate transcriptions; no reference recordings exist in the project to compare against — an honest, unavoidable limitation for a fully-synthesised, no-network-assets project.

## What is genuinely good
- The debug panel is a well-built, genuinely informative verification surface: live bus meters, a real populated spectrum analyser, per-layer ambience gains, and an event log with real world positions and distances — exactly what the spec asked for ("so a critic can verify content without ears").
- `selfTest()` covers the full advertised catalogue (8+ animal calls, 6 bird calls, thunder, 7 UI sounds, 2 engine states, 5 ambience layers) and every one renders a plausible, differentiated level — no silent/broken entries found.
- Distance-based spatial falloff is real and measured, not just wired up: a 23 dB drop between a call at 10 m and the same call at 400 m.
- Night and storm ambience mixes match the README's own specific historical numbers closely enough to call independently reproduced, not just re-asserted.
- `dispose()` genuinely closes the `AudioContext` and tears down every voice, engine loop, and bus — better cleanup hygiene than several other modules reviewed.

## Verdict
FAIL (below the 8.5 pass bar on the mechanical rule alone, since the module's own shipped verification tool does not run to completion), but this is a well-built, honestly-documented module whose actual synthesis and mixing I verified directly and found no fault with. The only real defect found is in the module's own tooling, not in the audio engine itself.
