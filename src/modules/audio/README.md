# audio

Every sound in the game, fully synthesised with WebAudio — zero audio files. Day/night savannah
ambience (insects, frogs, birds, wind), spatialised animal calls, vehicle engines, thunder and UI
sounds, mixed through five buses. The AudioContext starts only after the browser grants a user
gesture (first pointerdown/keydown anywhere, or an explicit `start()`); before that the module is
loaded, subscribed and silent.

## How it works

* `buses.js` — master → `ambience | animals | vehicles | ui` routing + analysers (`getLevels`).
* `ambience.js` — layered synth beds (insect/frog/bird/wind) crossfaded continuously from
  `world.time` and `world.weather` (`setHint` lets other modules bias the mix near water/storms).
* `calls.js` / `dsp.js` — one-shot synthesis per species/UI sound (FM, noise bursts, formant-ish
  filters), scheduled through `spatial.js` PannerNodes from real world positions.
* `engine.js` — looping vehicle engines with rpm/load modulation (traffic drives these).
* `ui.js` — click/hover/confirm/error/chime/cash/place blips.
* `panel.js` — the in-page audio debug panel (buses, layers, levels).

## Public API — `ctx.modules.get('audio')`

```js
start() → Promise                      // resume/unlock the AudioContext (idempotent)
isRunning() → boolean
state() → object                       // context state, current bus levels, layer mix
play(sound, {x, z, y?, gain?, dist?}?) // one shot; omit position → at the camera target.
                                       // Also driven by the audio:play event. Keys in list().
list() → string[]                      // animals: lion elephant elephant_rumble zebra hyena
                                       //   wildebeest hippo ostrich
                                       // birds: dove tinkerbird warbler goaway hornbill nightjar
                                       // weather: thunder      ui: click hover confirm error chime cash place
setListener(pos, forward, up)          // camera pose (wired internally per frame)
setVolume(bus, v) / getVolume(bus)     // v 0..2, buses 'master'|'ambience'|'animals'|'vehicles'|'ui'
mute(on)
engine(id, {x, z, rpm, load?})         // start/update a looping vehicle engine
engineStop(id)
selfTest() → object                    // schedules one of everything; returns per-bus peak levels
getLevels() → object                   // per-bus RMS/peak from the analysers
getLayers() → object                   // current ambience layer gains (insects/frogs/birds/wind)
getLog() → entry[]                     // what played, when, at what gain (debug)
setHint({water, storm, weather})       // bias the ambience mix (traffic/roads call this near water)
buses / layers                         // live handles (debug/panels)
```

### Events

| event | direction | payload |
|---|---|---|
| `audio:play` | consumes | `{sound, x?, z?, gain?}` — the recommended way for other modules to trigger sounds |
| `ui:notify` | consumes | chime (good/info) or error blip |
| `economy:updated` | consumes | cash sound on positive income events |
| `time:set` | consumes | re-blends the ambience bed |
| `weather:changed` | consumes | rain/wind layer + thunder scheduling |
| `tool:selected` | consumes | click |
| `building:placed` | consumes | place sound |
| `animal:state` | consumes | plays the species call when the state matches call/roar/trumpet/etc. |
| `vehicle:despawned` | consumes | stops that vehicle's engine loop |

## Modules consumed (all optional)

`animals` (positions for spatialised calls), `environment` (weather hints). Both null-checked; the
module is fully functional without them.

## Presets

| preset | tod | what it shows |
|---|---|---|
| `overview` | 12 | day ambience mix (insects low, birds high, wind mid) |
| `close` | 17 | dusk transition + spatialised calls near the camera |
| `night` | 22 | night mix: insects/frogs dominant, birds ~0, wind low |
| `storm` | 15 | storm bed: rain noise, wind up, thunder |

Screenshots need `--gesture` (unlocks the AudioContext) and are judged from the JSON
(`getLevels`/`getLayers`/`getLog` via `--eval`), not the pixels.

## Measured

(from the wave-1 integration review, JSON captured via `--gesture --eval`): master −20.2 dBFS with a
populated 40 Hz–16 kHz spectrum; night layer mix insects 1.00, frogs 1.00, birds 0.15, wind 0.41;
spatialised lion/hyena/nightjar/elephant-rumble scheduled at real distances 35–265 m. Draw calls: 0
(no WebGL work). Console errors: 0.

## Known gaps (honest)

* `vehicles` and part of the `animals` bus read −inf dB in still captures because their sounds are
  scheduled on sim events that had not fired at capture time; a capture timed to a triggered call
  proves the spatial chain end to end (done once in wave 1, not automated).
* Synth calls are impressionistic, not species-accurate transcriptions — a hyena is "readably hyena",
  not a recording. No audio recording exists anywhere in the project to compare against.
* Engines are one generic diesel loop modulated per vehicle kind; no idle-vs-move transmission
  whine, no horn.
* No music. SimSafari's menu theme is out of scope (and would need a composition, not a synth bed).
* iOS Safari requires the unlock gesture inside a touchend — the pointerdown path here covers
  desktop and Android but is untested on iOS.
* README (this file) written 2026-09-05 by the integrator after the original builder's docs were
  lost to the API spend limit; code is the builder's, unmodified.
