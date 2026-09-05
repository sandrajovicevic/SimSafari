# `animals`

Owner of `world.animals`. Species catalogue, procedurally modelled / textured / animated animals,
needs, and behaviour (herds, predation, sleep). Nothing is downloaded: every mesh is built from code,
every skin is baked from GLSL, every motion is evaluated procedurally each frame.

## What it does

* **Catalogue** (`species.js`) — 12 species (elephant, giraffe, zebra, wildebeest, buffalo, lion,
  cheetah, hippo, white rhino, warthog, ostrich, impala) with real sizes in metres, diet, herd size,
  walk/run speed, habitat preferences, appeal/rarity and day/night activity.
* **Mesh** (`builder.js` + `geom.js` + `rig.js`) — a parametric body builder. Torso, neck, head, ears,
  four legs, tail and per-species features (trunk, tusks, horns, ossicones, mane, beard, wings) are
  built as Catmull-Rom-pathed `Tube` parts with per-ring radii and cross-section shaping, shelf-packed
  into one UV atlas at uniform texel density, and merged into **one indexed `BufferGeometry`** carrying
  `aBoneIndex` / `aBoneWeight` / `aInfo`. A 25-bone skeleton (29 with the elephant trunk chain) is built
  in code from the same proportions. The same code at `detail: 0.5` emits the far LOD with identical
  UVs. **Legs** (round 2): tapered thigh → cannon → pastern profile, an exponential bulge at the
  stifle/knee and hock/ankle so the joints read as anatomy, and a real foot volume per gait
  (`hoof`/`pad`/`column`/`bird`) that flares and flattens below the fetlock instead of a blunt cylinder
  end; the cross-section is oval front-to-back on the upper limb, not round.
* **Skin** (`skin.js`) — per-species GLSL evaluated in **bind-pose object space** (so patterns are
  seamless across parts), rasterised through position/info maps into the UV atlas as albedo, height →
  normal, and ORM. Zebra stripes are noise-warped, giraffe patches are 3D worley, cheetah spots worley,
  elephant/rhino hide is crack-noise wrinkled with a low-frequency domain warp (round 2 — breaks the
  "golf ball dimple" regularity a single-frequency ridged noise reads as), lion has a separate mane
  part. **Colour is authored as true linear albedo** — elephant hide ~0.29-0.40, zebra black ~0.035 /
  white ~0.55, lion tawny ~0.38 — per `core/Textures.js`'s `srgb:true` contract (see
  `CLAUDE.md` "Colour authoring"; the module carried compensation for the core double-encode bug
  mid-round and that compensation has been removed now that the core bug is fixed).
* **Animation** (`anim.js`) — procedural skeletal. Walk↔gallop blend with lateral-sequence and transverse
  phase offsets, body bounce, spine flex, head/neck targets (graze, drink, alert, sleep, look-around),
  lying/sphinx pose, tail swish, ear flicks, breathing, chewing, elephant trunk cycle. Feet track
  `world.getHeight`; the body pitches and rolls with the slope.
* **Behaviour** (`behaviour.js`) — needs (food, water, rest, safety, social) drift on `tick()`; a state
  machine picks graze/walk-to-water/drink/rest/socialise/flee/hunt; herds use boids-style
  cohesion/separation/alignment behind a wandering leader; predators stalk and chase when hungry, prey
  flee inside the alert radius; diurnal species sleep at night. Fully deterministic through `ctx.rng`.
* **Rendering** — one *pool* per `(species, variant)`. A pool owns the near geometry, the far LOD, the
  baked skin set, a `FloatType` bone texture (one row per animal, `texelFetch`ed by `aSlot`) and two
  `InstancedMesh`es, so **every animal of a species is one draw call**. Instanced skinning is injected
  into a `MeshStandardMaterial` via `onBeforeCompile`, with a matching `MeshDepthMaterial` as
  `customDepthMaterial` so the shadow pass is animated too.
* **Contact shadows** — a `ContactShadows` instanced disc per animal, one extra draw call for the
  whole module. Originally the primary grounding cue (see "Contact shadows" below for why); now that
  `terrain` receives real shadows, it is a small contact-AO term layered under the real shadow.

## Public API — `ctx.modules.get('animals')`

| signature | returns | notes |
|---|---|---|
| `spawn(species, x, z, count = 1, opts = {})` | `string[]` | ids. `opts`: `heading`, `state`, `hold`, `sex`, `scale`, `spread`, `target:[x,z]`, `arrive`, `duration`, `herd`, `homeRadius` |
| `remove(id)` | `boolean` | deferred if called during a behaviour step |
| `clear()` | `void` | removes every animal and any staged showcase props |
| `list(species?)` | `animal[]` | live records (the same objects as in `world.animals`) |
| `get(id)` | `animal \| null` | |
| `count(species?)` | `number` | |
| `speciesInfo(id)` | `object \| null` | catalogue entry without the `body` build data |
| `allSpecies()` | `string[]` | 12 ids |
| `getHappiness(id)` | `number` | 0–1 |
| `setHabitatQualityFn(fn)` | `void` | `fn(herdId, species) → 0..1`; auto-wired to `zoning.getHabitatQuality` when present |
| `nearest(x, z, r)` | `animal[]` | sorted by distance |
| `setState(id, state, hold = 0)` | `boolean` | one of `states()`; `hold` seconds before behaviour may override |
| `addWaterPoint(x, z, nx = 0, nz = 1)` | `void` | tells the drink behaviour where a shore is |
| `waterPoints()` | `{x,z,nx,nz}[]` | |
| `herds()` | `{id, species, count, home, target, intent}[]` | |
| `states()` | `string[]` | `idle graze walk run drink rest sleep alert flee stalk chase eat` |
| `stats()` | `{animals, pools, nearInstances, farInstances, triangles, drawCallsEstimate}` | |

`_group()` and `_stageMeshes()` are internal hooks used by `showcase.js`; do not call them from other modules.

Animal records in `world.animals` follow the shape in ARCHITECTURE §3 (`id, species, x, z, y, heading,
speed, state, herd, needs, happiness, age, sex`). Fields prefixed `_` are private runtime state.

## Events

**Emitted:** `animal:spawned {id, species}` · `animal:died {id, species, reason}` ·
`animal:state {id, species, state}`.

**Consumed:** `time:set` — re-reads the scene's sun direction for the contact-shadow decals.

## Contact shadows

Round-1's blocker: animals cast no visible contact shadow — an elephant looked pasted onto the ground.
Root cause was in `terrain`, not here (`terrain/mesh.js:31` shipped `mesh.receiveShadow = false`), so
`castShadow` on the animals' near mesh (which was always correctly configured, with an animated
`customDepthMaterial`) had nothing to land on. Filed as `docs/requests/animals.md` §1 and since **fixed
upstream** — verified by A/B: hiding the module's own shadow decal still leaves a full, correctly
silhouetted, soft-edged cast shadow (`tools/shots/dbg-noshadow.png`).

`ContactShadows` in `index.js` (one instanced draw call for the whole module: a domed radial disc per
animal, `ContactShadows.disc()`, coverage carried in a **per-vertex RGBA colour attribute** — see below
for why not a texture) is kept, but demoted from primary grounding cue to a small, low-opacity (0.30),
undirected contact-AO term sized to the belly footprint. It no longer offsets/stretches away from the
sun — that shaping is the real shadow's job now, and doing it twice read as a second, slightly
misaligned shadow next to the first. It still sits on the *highest* ground sample under its own
footprint (a footprint several metres across can get buried by ±5-10 cm of heightfield noise) so it
does not disappear into terrain micro-relief.

Coverage is carried in a per-vertex RGBA colour attribute, not a texture, because a texture baked with
`Textures.gpu()` read back correctly via `readRenderTargetPixels` but sampled as ~0 through both `map`
and `alphaMap` in a live `MeshBasicMaterial` in this environment (WebGL2 + SwiftShader). Noted as
`docs/requests/animals.md` §2 for whoever hits it next; not filed as a fix request since it wasn't
reproduced on a real GPU.

## Custom shaders (per ARCHITECTURE §9)

* `skin.js / injectSkinning()` — `onBeforeCompile` on `MeshStandardMaterial` and on a
  `MeshDepthMaterial`, replacing `<skinbase_vertex>` / `<skinnormal_vertex>` / `<skinning_vertex>` with a
  two-influence skin read from a shared float bone texture indexed by the per-instance `aSlot` attribute.
  `customProgramCacheKey` is `'animals-instanced-skin-v1'`.

## Presets (`showcase.js`)

| preset | tod | what it stages |
|---|---|---|
| `overview` | 16 | mixed herds across the plains — all 12 species, ~140 animals |
| `herd` | 16.5 | zebra + wildebeest walking across frame at eye level, impala grazing behind |
| `waterhole` | 8 | three elephants and a giraffe drinking at a pool, zebra at the shore, impala/warthog behind |
| `predators` | 17.5 | lion pride resting/sleeping, a cheetah walking past, prey herds at distance |
| `close` | 15 | one elephant at 12 m |
| `night` | 21.5 | hippos leaving the water, zebra and giraffe asleep, lions moving |

`stage()` works with or without `terrain`: `waterhole`/`night` look for real water within 45 m of the
requested spot (was up to 260 m, which could adopt water far outside the preset camera's frame whenever
the terrain regenerated) and otherwise build a staged pool: an irregular (non-circular) water shape with
a muddy, alpha-faded trampled bank rather than a flat coloured disc with a hard rim. The preset's camera
target is re-aimed at whichever water point was actually used, since which one that is can change every
time terrain regenerates. The staged pool's own ground height is the **average of samples inside its
footprint**, not the highest point at its outer rim — sampling the rim once picked up an unrelated rise
elsewhere in the terrain and floated the whole pool over a metre above the animals drinking at it.

## Measured performance

SwiftShader software GL, 1280×720, `quality=high`, `seed=1`. `drawCalls` and `triangles` are
`renderer.info.render` totals for the **whole frame** (terrain, water, any other loaded module's
showcase furniture, and the CSM/fallback shadow passes), not the animals module in isolation.
`stats().drawCallsEstimate` gives the module's own contribution. `fps` under SwiftShader is meaningless
and is not reported.

| preset | draw calls | triangles | console errors | shot |
|---|---|---|---|---|
| `close` | 38 | 1 015 004 | 0 | `tools/shots/animals-close-r6.png` |
| `overview` | 88 | 2 598 084 | 0 | `tools/shots/animals-overview-r3.png` |
| `herd` | 53 | 1 781 164 | 0 | `tools/shots/animals-herd-r4.png` |
| `waterhole` | 62 | 1 485 540 | 0 | `tools/shots/animals-waterhole-r6.png` |
| `predators` | 56 | 1 563 900 | 0 | `tools/shots/animals-predators-r4.png` |
| `night` | 52 | 1 310 332 | 0 | `tools/shots/animals-night-r4.png` |

Draw calls and triangles are geometry-driven and unaffected by the lighting fixes below; re-measured
after them anyway to confirm nothing regressed. All six still zero console errors.

Round-1 baseline for `close`/`overview` (the only two the round-1 critic screenshotted): 21 / 652 054 / 0
errors and 47 / 1 274 878 / **2 errors**. The round-2 rise is expected and accounted for: the giraffe
skin shader used to fail to compile (`docs/requests` — a GLSL ES 3.00 reserved word, `patch`, used as an
identifier; renamed), so six giraffes in `overview` drew as untextured black and their programs were
never linked; leg ring counts went from 11–13 to 12–18 for taper and joint bulges; and the contact-shadow
pass adds one instanced draw call for the whole module.

Budget position: draw calls are far inside the ≤1500 total / 200 per-module budget everywhere.
**Triangles at `overview` (2.60 M frame total) are over the module spec's 1.5 M** — see Known gaps.

## Known gaps (honest)

1. **Real cast shadows are still disabled by the terrain module, not by this one.** `terrain/mesh.js:31`
   sets `mesh.receiveShadow = false`, so nothing in the world can receive a shadow; the depth pass this
   module produces (`castShadow` + animated `customDepthMaterial`) is simply discarded by the receiver.
   Filed as `docs/requests/animals.md` §1. The contact-shadow decal (previous section) grounds the
   animal convincingly but cannot show a silhouette (the trunk, the legs individually) and cannot fall
   onto another animal, a rock or a building.
2. **Contact shadows float slightly on rough ground / their outer penumbra can clip.** The decal sits on
   the *highest* terrain sample under its footprint plus a size-proportional lift, with the disc's rim
   curled down. On terrain rougher than roughly ±10 cm under one animal the near edge can lift off or
   the penumbra can be swallowed by relief.
3. **Triangle count at `overview` is over spec** (2.60 M frame total vs the spec's 1.5 M). The leg
   rework added roughly 15–20% per animal. `LOD_FAR` (currently 250 m) and the far-LOD `detail` (0.5)
   are the obvious levers if this needs to come down; not changed this round because I ran out of budget
   to re-verify every preset after moving them.
4. **`night` (21.5 h) is now essentially unlit black**, and **`predators` (17.5 h) is still slightly
   overexposed** — both are core lighting, not this module. Core lowered the tone-mapping exposure
   ceiling from 60 to 4 (fixing the earlier several-fold daytime/dusk overexposure this README used to
   report), but that removed the only thing making `night` visible: at `tod 21.5` in a module-only
   showcase the fallback sun's intensity is ~0.006 and no `HemisphereLight` was found in the scene at
   all, so there is no ambient left once exposure is capped correctly. `predators` at exposure 4 is
   better than the 5.46 it measured before but still ~2.5-3× the 1.2-1.6 daytime baseline. Neither is an
   animals albedo bug — confirmed earlier by reading back the *baked* lion texture directly, which
   decodes to the intended ~0.38 linear tawny regardless of how the lit scene renders. Documented in
   `docs/requests/animals.md` §1b and §3; not something this module can fix.
5. **The far LOD is a half-detail skinned mesh, not an imposter.** The spec asks for a rigid low-poly or
   billboard imposter beyond 250 m; what exists is the same rig at `detail: 0.5` with pose evaluation
   skipped. Cheaper than the near mesh, but not as cheap as the spec intends.
6. **Pale species (zebra white, ostrich, giraffe cream) still read light at distance.** Mip-averaging
   collapses zebra stripes and giraffe patches into their mean at range, so a herd reads a shade lighter
   in `overview` than in the `herd` close-up. Not corrected further this round to avoid re-introducing
   the darkening-as-compensation mistake — see item 4's lesson.
7. **Two bone influences per vertex**, so shoulders and hips crease under extreme leg swing (visible in
   a gallop, not in walk or graze).
8. **Feet do not conform to slope.** The body pitches and rolls with the ground plane, but individual
   hooves/pads are not IK-planted, so on ground steeper than ~20° a foot can hover or sink.
9. **`world.getHeight` is sampled per animal per frame** for the contact shadow (up to 9 taps) on top of
   the behaviour sampling. Fine at the ~200-animal budget; would want caching well beyond that.
10. **No juveniles, no death animation, no carcasses.** Predation removes the prey record immediately and
    emits `animal:died`; nothing is staged for it visually.
11. **The staged waterhole's water colour is a flat physical material** (dark, low-saturation, a little
    clearcoat), not a shader with ripples/refraction — good enough at showcase distance, would not hold
    up in a dedicated water closeup (that is `terrain`'s water surface's job for real park water; this
    is only the showcase fallback used when no real water is nearby).
