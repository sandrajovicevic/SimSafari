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
5. **The cast** — `animals.clear()`, then: a 5-lion pride clustered on the kopje's sun-facing lower
   flank (radii 1.38-1.50 r in a contact-group crescent around the male, each spot dry AND flat —
   slope < 0.14 — so no rock lip swallows legs; the whole bearing is seeded 20° off the sun so the
   preset camera parked just beyond the male looks away from the low sun with the light raking
   three-quarter across him); elephants + giraffes drinking at real `shorePoints` marched out from
   the water's edge; zebra + warthog at the shore; a walking zebra/wildebeest herd with `target`s
   across the grassland plus impala and ostrich. `night` adds a hippo pod: three stand
   half-submerged at the waterline on the LENS-side shore (found by marching the bearings toward
   the camera until each leaves the water), broadside to the lens at 1.2x scale, two more idle on
   the far shore, and the nearest drinking elephant is pulled off that shore for the preset — at
   3x hippo size it upstaged the trio into illegibility (verified `fix-sav-night-v1/-v2`). The
   night camera anchors on the hippo group itself (26 m, pitch 14°), not the pan centre.
   All staged animals use `hold: 1e6` so a still frame shows the composed state (they cannot wander
   during the screenshot settle — held animals never change state or steer). **Asset fact:** the
   authored lion model is a single maned male mesh — no mane-less model exists on the asset source
   (searched 2026-09-25, animals README) and the static pool has no rest pose, so the pride reads
   as standing males and the kopje row says exactly that.
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
| `hero` | 17.4 | the flagship golden-hour shot: the herd crossing the middle distance in raking side light, sun out of frame, acacia line and escarpment in warm haze behind |
| `waterhole` | 8 | elephants and giraffes drinking in low morning light, zebra at the shore |
| `kopje` | 17.8 | the pride at the kopje's foot in golden hour — the male three-quarter front-lit at ~8-12 m against the boulder backdrop, the rest of the pride clustered around him; every cat reads male (single maned-male asset, searched — see step 5) and the static meshes stand rather than lie |
| `herd` | 16 | zebra and wildebeest crossing open grassland at eye level |
| `river` | 9.5 | the riverine gallery from on the water, looking down the channel |
| `storm` | 15 | the storm deck in frame (pitch 6° from 330 m): grey cloud, rain shafts, the plains and track below |
| `night` | 22 | moonlit hippo pod half-submerged at the waterhole's lens-side shore (also staged at 3 h), the pan's sky reflection behind them |
| `dawn` | 6.3 | heavy dawn mist, the sun breaking over the escarpment |

## Measured

Real GPU (`tools/gpu-check.mjs`, `--use-angle=d3d11`, ANGLE AMD Radeon RX 5700 XT D3D11), 1920×1080,
`quality=high`, seed 1, 2026-09-25 asset-swap/fix pass (props grass re-tint + animals zebra/elephant
swap are in every frame). All 0 console errors. Draw calls include every loaded module's scene
content (the composer adds none of its own); the whole scene sits far inside the ≤1500 draw /
≤6 M tri budget at every preset.

| preset | draws | triangles | errors | shot |
|---|---|---|---|---|
| overview | 186 | 3,515,486 | 0 | `tools/shots/final-sav-overview-16.5.png` |
| close | 201 | 3,346,508 | 0 | `tools/shots/final-sav-close-16.png` |
| hero | 274 | 4,215,566 | 0 | `tools/shots/final-sav-hero-17.4.png` |
| waterhole | 212 | 3,717,638 | 0 | `tools/shots/final-sav-waterhole-8.png` |
| kopje | 219 | 3,432,804 | 0 | `tools/shots/fix-sav-kopje-v2.png` |
| herd | 277 | 4,161,278 | 0 | `tools/shots/final-sav-herd-16.png` |
| river | 207 | 4,532,876 | 0 | `tools/shots/final-sav-river-9.5.png` |
| storm | 115 | 2,948,838 | 0 | `tools/shots/fix-sav-storm-v1.png` |
| night (22 h) | 215 | 3,659,679 | 0 | `tools/shots/fix-sav-night-v6.png` |
| night (3 h, extra) | 214 | 3,626,911 | 0 | `tools/shots/fix-sav-night-v6-3h.png` |
| dawn | 306 | 4,453,351 | 0 | `tools/shots/final-sav-dawn-6.3.png` |

## What still reads as CG versus photography (honest)

* **Grass blades up close are individual painted cards** — at eye level (close/herd) the sward reads
  well, but the blades have no translucency or sub-blade detail. In direct low sun the field glows
  bright gold from pure diffuse response (roughness is 1.0 — there is no specular left to remove),
  which is close to how backlit grass photographs, but the uniformity of the glow across the whole
  sward is the single biggest remaining CG tell (park-lodge golden hour shows it at its strongest).
* **The `kopje` subject is staged around the actual asset** (re-done 2026-09-25 after the animals
  glTF swap): the pride sits in a contact cluster on the sun-facing flank at 1.38-1.50 r on
  slope-checked flat spots, the camera march starts at 11 m along the male's bearing, and
  `props.clear` carves the corridor/podium/fore-court described in stage step 6 — the male reads
  unmistakably with two more cats flanking him (`tools/shots/fix-sav-kopje-v2.png`). Residuals:
  every lion is the one maned-male mesh (asset source has no mane-less model — searched), and the
  static meshes stand rather than lie, so "resting/sleeping pride" is not claimable.
* **Foliage silhouettes against glare** (dawn) are dark alpha cutouts — real backlit canopy glows
  through; there is no leaf translucency term.
* **Animal faces at conversational distance** (waterhole elephants at 40 m) are convincingly
  sculpted but the trunk-tip/ear articulation is stiffer than film reference; skin wrinkles read
  slightly regular on the elephant.
* **The lions are low-poly stylised cats** — at the kopje preset's ~11 m the silhouette, painted
  mane and texture read, but the mesh has no muscle relief or fur, every cat is male, and none can
  lie down; photography at this distance would show whiskers, fly twitch and behavioural story
  (interaction, cubs) that no staged still can.
* **Water**: the tannin-dark rivers and pans with a tight sun glint read photographically at a
  distance; at close range the shore blend is a painted gradient, not wet-sand geometry.
* **Clouds** are a two-layer analytic sheet — convincing at hero/storm distances, but a storm front's
  towering cumulonimbus structure is not achievable with it.
* Everything else — light, haze, composition, colour — is calibrated against Serengeti/Mara
  reference photography and holds at showcase distances.

## Known gaps (honest)

* **`close` and `hero` were re-staged 2026-09-24** after critic round 5 found `close` duplicating
  `herd` (both aimed at the herd's spawn point) and `hero` shot into the 17.4 h sun. `close` now
  searches a lens ring 170-300 m from the kopje whose view wedge holds no other preset's subject;
  `hero` searches kopje × bearing for a view >= 75° off the sun. Verified on seed 1 (960×540):
  `close` shows grass, a planted acacia and the kopje; `hero` shows the side-lit herd with no glare.
  **Not delivered:** no kopje satisfies `hero`'s sun + framing + line-of-sight test on seed 1, so the
  shot has no kopje (the old description promised a kopje silhouette and a left-third acacia; it was
  rewritten to what the shot shows, not the other way round). `close`'s kopje reads sharp, not
  "softening into haze", at haze 0.26.
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
