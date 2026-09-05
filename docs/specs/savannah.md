# savannah — spec (DEMO, wave 3)

The showcase of the whole nature stack: a hand-tuned, art-directed African savannah scene that uses terrain,
environment, props, animals, effects, audio (and roads if present) together. No gameplay. This is the module the
blind visual test uses. Reference: the best Serengeti/Masai Mara/Kruger photographs you can recall — composition,
light, haze, scale cues.

## Must deliver
* `stage(ctx, preset)` composes (through the other modules' APIs only) one coherent 1024 m world: river with riverine
  forest, open golden grassland with scattered umbrella acacias, a kopje with euphorbia and lions, a waterhole with
  elephants and giraffes, a zebra/wildebeest herd on the move, vultures/birds if props/animals offer them, a dirt track
  with one safari vehicle if roads/traffic exist. Art-direct the camera for each preset (composition: rule of thirds,
  foreground element, layered depth with haze), the time of day (golden hour default), weather (light haze, a few clouds).
* Fix what does not work at the seams by writing `docs/requests/<module>.md` for the responsible module — you never edit
  other modules.
* Presets: `hero` (golden hour wide, 17.4 h), `waterhole` (8 h, elephants close), `kopje` (lions at 17.8 h), `herd`
  (zebra/wildebeest, 16 h), `river` (riverine forest, 9.5 h), `storm` (dark sky, rain approaching, 15 h), `night`
  (moonlit hippos at 22 h), `dawn` (6.3 h mist), plus `overview`, `close`.
* README: a per-preset shot list, what each demonstrates, measured draw calls/tris, and a frank list of what still
  reads as CG versus photography.

## Budget
Whole scene ≤ 1500 draw calls, ≤ 6 M tris at `hero`.
