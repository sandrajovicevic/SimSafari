# park — spec (DEMO, wave 3)

The playable demo park: a complete, running game state — habitats, roads, buildings, animals, visitors, economy —
built through the modules' APIs, ready to be played with the tools/ui. This is what the gameplay-fidelity checklist
and the whole-game critic evaluate.

## Must deliver
* `stage(ctx, preset)` builds (via APIs only): generated terrain; an entrance gate on the south edge connected by a
  paved road to a lodge complex (lodge, restaurant, shop, ranger station, parking); a gravel loop road with two dirt
  spurs; 4 fenced habitats (plains grazers: zebra + wildebeest + impala; browsers: giraffe + elephant with acacias;
  predators: lion pride on a kopje; wetland: hippo + buffalo at the river); hides and a viewing tower at the best
  sightlines; props scattered by biome; 4 safari vehicles on tour; simulation running at speed 1 with a sane starting
  economy; ui visible (full game only), audio ambience running.
* Also expose `api.newGame(seed)` and `api.loadDemo()` so the full game (no `?module`) starts in this state when
  `core:ready` fires and no save exists. Register the demo as the default game start.
* Verify the gameplay loop end-to-end and document it: raise ticket price → arrivals drop; remove water from a habitat →
  happiness drops → animals migrate; add a road past the predators → sightings up → satisfaction up. Include the
  numbers from a scripted run in README (use `simulation.getReport()` over 30 accelerated days).
* Presets: `overview` (whole park, 15 h), `gate` (entrance with vehicles, 9 h), `lodge` (17.5 h), `habitat`
  (grazers with fence + hide, 16 h), `tour` (vehicle stopped at a sighting, 16.5 h), `close`, `night` (lit lodge, 21.5 h).

## Budget
Whole game ≤ 1500 draw calls, ≥ 50 fps at 1080p on a discrete GPU (document expected numbers; SwiftShader cannot measure it).
