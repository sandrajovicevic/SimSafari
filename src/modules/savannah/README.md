# savannah

DEMO (wave 3). The showcase of the whole nature stack: one hand-tuned, art-directed 1024 m African
savannah composed entirely through the other modules' public APIs — `terrain`, `environment`,
`props`, `animals`, `roads`, `traffic`, `effects` (all `optional`, all null-checked). No gameplay, no
world state of its own (its group stays empty by design: everything visible belongs to the modules
that own it). This is the module the blind visual test uses.

## What `stage()` builds

Every `stage(ctx, preset)` call rebuilds the whole world on the active seed (a fresh page per
showcase preset, so there is no cross-preset state), in this order:

1. **Terrain** — `terrain.generate({preset:'savannah'})` if not already generated, then real feature
   anchors from `terrain.getFeatures()`: the tallest kopje, a water spot (farthest pan, else a river
   bend), an open grassland candidate scored away from water/kopje/slope, river points.
2. **Weather art direction** — `environment.setWeather(W, {immediate:true})` per preset: golden-hour
   haze and a few clouds by default; `storm` (cloud 0.95, rain 0.35, wind 9.5), `night` (clear,
   still), `dawn` (haze 0.6), `river` (wet season). `effects.setAmbientDust(-1)` lets dust go
   automatic (golden hour, dry, calm).
3. **Vegetation** — a base `props.scatter` with `acacia.density 1.25`, then two `clear:false`
   reinforcement passes: boulder/shrub/dead around the kopje, fever/shrub over the riverine gallery.
4. **A dirt track** — `roads.addRoad` from the grassland past the kopje across the river (roads
   builds the auto-bridge at the crossing); the leg on to the waterhole is added only when the
   straight line samples dry ground — when it clips the pan the leg is dropped so the waterhole stays
   wild (a road bridge through the drinking scene was a verified defect on seed 1). One
   `traffic.spawn('safari', …)` parks a vehicle on the track.
5. **The cast** — `animals.clear()`, then: a 5-lion pride (one male, rest-state mix, held) on the
   kopje's sun-facing lower flank — the male's spot must be dry AND flat (slope < 0.14) so no rock
   lip swallows his legs, and the whole bearing is seeded 20° off the sun so the preset camera
   (parked just beyond him on the same line) looks away from the low sun with the light raking
   three-quarter across him; elephants + giraffes drinking at real `shorePoints` marched out from the
   water's edge; zebra + warthog at the shore; a walking zebra/wildebeest herd with `target`s across
   the grassland plus impala and ostrich; hippos join the waterhole for the `night` preset only.
   All staged animals use `hold: 1e6` so a still frame shows the composed state (they cannot wander
   during the screenshot settle — held animals never change state or steer).
6. **Camera anchors** — every preset's `camera.target` is re-aimed onto the real feature positions
   for the active seed (mutating the exported `presets` object in place, which core applies after
   `stage()` resolves), and all views are registered as `savannah-<name>` rig presets so the full
   game can jump to them. The kopje preset additionally carves a props-free staging ground with
   `props.clear`: a ±3.5 m sightline corridor from just behind the lens to 1.2 m short of the male,
   a 9 m patch on the male (tall dead shrubs root outside a small patch and still lean their
   branches across the subject), a 5 m patch per lioness, and a 20 m fore-court at the camera
   (boulders rooted within ~10 m of the lens loom into the frame edge even off-axis). The boulders
   behind the male stay — they are the backdrop.

## Public API — `ctx.modules.get('savannah')`

```js
presetNames() → string[]        // the 10 showcase preset names
```

The module has no other API: it is a composer, not a service. Composers wanting a staged savannah
should call this module's showcase the way the screenshot tool does (`?module=savannah&preset=…`).

### Events

None emitted, none consumed — composition happens once inside `stage()`.

## Modules consumed (all optional, all null-checked)

`terrain` (generate + features), `environment` (weather), `props` (scatter/refresh), `animals`
(spawn/clear/addWaterPoint), `roads` (addRoad/nearestEdge/getEdge), `traffic` (spawn), `effects`
(setAmbientDust). Every call is guarded or try/caught with `ctx.log.error`; a missing module
degrades the scene, never fails the stage.

## Presets

| preset | tod | what it demonstrates |
|---|---|---|
| `overview` | 16.5 | the whole composed world from height: river + gallery, grassland + acacias, kopje, waterhole, herd on the move, dirt track |
| `close` | 16 | foreground grass and an acacia trunk at eye level, kopje softening into haze |
| `hero` | 17.4 | the flagship golden-hour shot: acacia left third, grazing herd middle distance, kopje silhouette right third, warm haze layering |
| `waterhole` | 8 | elephants and giraffes drinking in low morning light, zebra at the shore |
| `kopje` | 17.8 | the pride at the kopje's foot in golden hour — the male three-quarter front-lit at ~8 m against the boulder backdrop, lionesses resting around him (see CG list for the residual model tell) |
| `herd` | 16 | zebra and wildebeest crossing open grassland at eye level |
| `river` | 9.5 | the riverine gallery from on the water, looking down the channel |
| `storm` | 15 | dark sky, rain approaching, the track leading into it |
| `night` | 22 | moonlit hippos at the waterhole, moon glitter path, the herd asleep beyond |
| `dawn` | 6.3 | heavy dawn mist, the sun breaking over the escarpment |

## Measured

SwiftShader software GL (fps not representative; draws/tris/errors real). Seed 1, 1920×1080. All
0 console errors. Draw calls include every loaded module's scene content (the composer adds none of
its own); the whole scene sits far inside the ≤1500 draw / ≤6 M tri budget at every preset.

| preset | draws | triangles |
|---|---|---|
| overview | 165 | 3,575,101 |
| close | 211 | 4,850,921 |
| hero | 206 | 4,803,954 |
| waterhole | 200 | 3,963,856 |
| kopje | 185 | 3,709,866 |
| herd | 212 | 4,879,278 |
| river | 188 | 4,564,596 |
| storm | 174 | 4,069,273 |
| night | 204 | 4,002,272 |
| dawn | 228 | 5,148,585 |

## What still reads as CG versus photography (honest)

* **Grass blades up close are individual painted cards** — at eye level (close/herd) the sward reads
  well, but the blades have no translucency or sub-blade detail. In direct low sun the field glows
  bright gold from pure diffuse response (roughness is 1.0 — there is no specular left to remove),
  which is close to how backlit grass photographs, but the uniformity of the glow across the whole
  sward is the single biggest remaining CG tell (park-lodge golden hour shows it at its strongest).
* **The `kopje` subject is now staged, not hoped for** (round-3 fix, verified sav-kopje-fix-d/-e):
  the pride sits on the sun-facing flank at 1.18 r on a slope-checked flat spot, the preset camera
  is marched from 8 m outward along the male's bearing until the terrain LOS is clear, and
  `props.clear` carves the corridor/podium/fore-court described in stage step 6 — the male reads
  unmistakably (dark mane, legs on the ground) in both verification captures. Residuals below.
* **Foliage silhouettes against glare** (dawn) are dark alpha cutouts — real backlit canopy glows
  through; there is no leaf translucency term.
* **Animal faces at conversational distance** (waterhole elephants at 40 m) are convincingly
  sculpted but the trunk-tip/ear articulation is stiffer than film reference; skin wrinkles read
  slightly regular on the elephant.
* **The male lion up close is a low-poly box-and-cylinder cat** — at the kopje preset's 8 m the
  silhouette, mane, legs and tail tuft all read, but the body has no muscle relief or fur, and the
  front-lit flank values run pale against the darker rock; photography at this distance would show
  whiskers, fly twitch and behavioural story (interaction, cubs) that no staged still can.
* **Water**: the tannin-dark rivers and pans with a tight sun glint read photographically at a
  distance; at close range the shore blend is a painted gradient, not wet-sand geometry.
* **Clouds** are a two-layer analytic sheet — convincing at hero/storm distances, but a storm front's
  towering cumulonimbus structure is not achievable with it.
* Everything else — light, haze, composition, colour — is calibrated against Serengeti/Mara
  reference photography and holds at showcase distances.

## Known gaps (honest)

* **The composition is seed-general, not seed-perfect**: anchors and cameras are recomputed from
  real features every stage, but framing quality varies with the seed (validated on seed 1 only).
* The `night` preset adds hippos to the waterhole but the shot list otherwise shares one cast across
  all presets — a night-only dawn chorus or predator event is out of scope for a still showcase.
* `roads`' auto-bridge at the river crossing is roads' own design; if its placement heuristics
  change, the crossing may move (the track is re-derived each stage, so it follows).
* No vultures/birds: `animals` has ostrich but no flying species, so the spec's "vultures if
  props/animals offer them" resolves to "not offered".
* Audio is not staged by this module (ambience starts on the first user gesture; a headless
  screenshot never produces one). `?module=savannah` pages are silent by design.
* README written 2026-09-05 by the integrator during wave-3 verification; the code is the original
  builder's except: the waterhole road-leg guard, the kopje/river camera aims, and the lion-spot
  constant hoisted to stage scope (all documented above with their evidence shots), plus the
  round-3 kopje subject fix (2026-09-07): sun-facing-flank staging with slope-guarded spots,
  the 8 m lion-scale camera march with a camera-slope guard, and the props.clear corridor /
  podium / fore-court carving (evidence: sav-kopje-baseline.png shows the three failure modes it
  removes — ledge-occluded legs, a branch across the subject, a boulder rooted at the lens).
