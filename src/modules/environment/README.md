# environment

Sun, sky, atmosphere, clouds, weather, time of day, night, exposure and cascaded shadows. Owns all
lights, `scene.background`/`scene.environment` (PMREM from the procedural sky), `scene.fog` and
`renderer.toneMappingExposure`. Everything is procedural — a single-scattering atmosphere baked to a
512×256 LUT whenever the sun/moon/turbidity change, an analytic sun disc, a phase-shaded moon, a
milky-way/star field, two cloud layers (1.8 km cumulus, 8 km cirrus), GPU rain streaks — no textures
are loaded from disk.

## How it works

* `atmosphere.js` — CPU single-scattering sampler (`SkySampler`) mirroring the GPU LUT: sun/moon
  transmittance, zenith/horizon radiance (horizon = average of 6 azimuths at +2° elevation). Drives
  sun colour, sky/fog colours and the exposure controller.
* `shaders.js` — LUT bake (`LUT_FRAG`), sky dome (`SKY_FRAG`: LUT + sun disc + moon + stars +
  below-horizon plain), clouds, star points, rain. All linear HDR; tone mapping via three's
  `tonemapping_fragment`, so exposure applies uniformly.
* `index.js` — per-frame `computeLighting()`: key light (sun by day, moon by night via
  `isMoonKey`), exposure from scene key luminance `0.62/L^0.62` clamped to 4 by day / 12 at night
  (separate night ceiling: see Known gaps), night key-legibility lift + minimum-ambient hemisphere
  (see History 2026-09-07), fog colour/density, all dome uniforms, LUT/PMREM refresh policy
  (twilight re-bakes more often).
* `csm.js` — one cascaded shadow map (3 cascades, 2048²) on the key light.

## Public API — `ctx.modules.get('environment')`

```js
getSunDirection(out?) → Vector3        // unit vector toward the sun (even below the horizon)
getMoonDirection(out?) → Vector3
getKeyDirection(out?) → Vector3        // current key light direction (sun or moon)
getSunColor(out?) → Color              // linear RGB sunlight after atmospheric transmittance
getSunIntensity() → number             // key light intensity (three physical units; includes the
                                       // night legibility lift when the moon is the key)
getSkyColor(out?) → Color              // zenith sky colour, linear radiance
getHorizonColor(out?) → Color          // horizon (fog) colour, linear radiance
getEnvMap() → Texture|null             // PMREM environment (also on scene.environment)
getKeyLight() → DirectionalLight|null  // shadow-casting key light (cascade 0)
getCascades() → Light[]                // all CSM cascades
getSunElevation() → number             // radians, negative below horizon
getMoonPhase() → number                // 0 new .. 0.5 full
getMoonIllumination() → number         // 0..1 illuminated fraction
isNight() → boolean                    // sun below -6°
getNightAmount() → number              // 0 day → 1 full night
getExposure() → number                 // current toneMappingExposure
setExposureBias(v)                     // multiplier on the automatic exposure, clamped 0.1..10
setWeather(partial, {immediate}?) → weather
// merge {cloud, rain, haze, wind:{x,z,speed}, season:'dry'|'wet', temperature}; emits weather:changed
setWeatherPreset(name, opts?)          // 'clear' | 'cloudy' | 'overcast' | 'storm'
getWeather() → weather
setHorizonGround(r, g, b)              // albedo of the below-horizon distant plain (terrain may match)
refresh()                              // force LUT + PMREM re-bake next frame
setDebug({sky, clouds, stars, rain, shadows})  // boolean toggles, any subset
getState() → snapshot                  // hour, sun/moon elevation+azimuth, phase, exposure,
                                       // turbidity, fogDensity, weather, cascade radii/splits
```

### Events

| event | direction | payload |
|---|---|---|
| `weather:changed` | emits | `{cloud, rain, wind, season, haze, temperature}` |
| `time:set` | consumes | `{hour, day}` |

## Modules consumed

None (fully standalone; `terrain`'s world edge meets this module's below-horizon plain, tinted via
`setHorizonGround`).

## Presets

| preset | tod | what it shows |
|---|---|---|
| `overview` | 13 | full sky/cloud/shadow stack at midday |
| `dawn` | 6.3 | civil twilight, mist |
| `golden` | 17.6 | warm low sun, long shadows, lit cumulus |
| `dusk` | 18.7 | afterglow gradient, first stars |
| `night` | 22 | moonlight (phase-correct), stars + Milky Way |
| `overcast` | 13 | flat grey diffuse, no hard shadows |
| `storm` | 15 | dark deck, wind-driven rain, heavy haze |
| `close` | 17 | sun disc + corona close-up |

## Measured

SwiftShader software GL (fps is not representative; draws/tris/errors are real). All shots 0 errors.

| shot | draws | triangles |
|---|---|---|
| golden (tod 17.2) | 43 | 60,218 |
| night (tod 22) | 44 | 60,218 |
| overview (tod 12) | 34 | 45,290 |

## Known gaps (honest)

* **Night sky speckle wall + moonlit-cloud response, fixed 2026-09-25 (round-8 builder).** The round-8
  critic correctly failed the module for its own claim: on the shipped `night` preset the upper sky was
  a dense bright grey-white speckle/static wall instead of "mostly points" (`tools/shots/seb-before-env-night-22.png`
  reproduces it). **Root cause was NOT the cumulus layer** (as the round-8 toggle diagnostic concluded —
  that check ran on SwiftShader, which filters this texture differently): on the real GPU the wall is the
  baked night-sky texture itself. `NIGHT_TEX_GLSL`'s `starLayer` used star Gaussians with sigma
  0.0035/0.0026 rad ≈ 1 texel of the 2048×1024 bake, so every star baked as a ~4-texel soft blob, and the
  dome's linear magnification blew each one up into a 10-20 px grey blob — ~9000 layer-1 stars merged
  into a wall. Proven by a live toggle on the real GPU: zeroing the sky material's `uNightAmount`
  removes the wall with clouds ON (`tools/shots/seb-diag2-skystars0.png`) and `setDebug({clouds:false})`
  alone keeps it (`tools/shots/seb-diag1-clouds0.png`) — the exact opposite of the SwiftShader result.
  Fixed by sub-texel star sigmas (0.0008/0.0006 rad: each star bakes to a single texel that magnifies
  back to a ~2-4 px point) plus density/brightness cuts (0.75→0.35, 0.55→0.22). After:
  `tools/shots/seb-after3-env-night-22.png` / `seb-after3-env-night-3.png` — star field of discrete
  points + Milky Way band, star field dominates. Two cloud-side changes shipped in the same pass:
  (a) the moonlit-branch boost ×25 → ×4 (at exposure 12 the old value put cloud bodies at ~150 sRGB
  against a ~25 sRGB sky — near-day brightness; ×4 keeps them faint moonlit silhouettes scaling with
  the moon's illuminated fraction), and (b) the cumulus coverage field now has a ~4 km banking octave
  plus a night thinning gate and a sub-overcast horizon thinning, so low-coverage fields cluster into
  banks with clear sky between instead of tiling uniformly (the round-8 dusk issue: after
  `tools/shots/seb-before-env-dusk-187.png` — an edge-to-edge high-contrast speckle wall — dusk now
  reads as afterglow over the horizon + first stars + sparse dark cloud silhouettes,
  `tools/shots/seb-after3-env-dusk-187.png`). Residuals, honest: at `night`'s cloud 0.08 the moonlit
  puffs are so faint they are hard to pick out from the star field (structure reads only at higher
  in-game coverages); the dusk cloud wisps are still smaller/more scattered than real twilight
  altocumulus banks. Day presets re-verified unchanged: overview 14 / dawn 6.3 / golden 17.6 /
  overcast 13 / storm 15 / close 17 (`tools/shots/seb-after3-env-*.png`); draw calls and triangle
  counts identical to round 8 (44/60,218 worst case — no new passes; the banking octave reuses one
  extra texture fetch inside the existing cloud pass).

* **Cumulus scale (2026-09-25).** The "stars smeared into horizontal dashes" several critics reported
  at night were the cumulus layer, not the stars: with clouds toggled off (`setDebug({clouds:false})`)
  the dashes vanish and the stars are points. At fair-weather coverage only noise peaks pass the
  threshold, and at the old sample scale (0.00021/m) those were ~150 m flecks that foreshorten into
  rows of dashes, by day too. Scale is now 0.00009/m: fewer, larger puffs (`env-after-overview.png`,
  `env-after-golden.png`). The "night sky mostly points" claim attached to `env-after2-night.png` was
  incomplete — that capture was SwiftShader; on a real GPU the dense grey-white wall still present at
  night was the star bake, not this layer (see the round-8 entry above for the real root cause and fix;
  `seb-after3-env-night-22.png` is the verified real-GPU night now).

* **Cumulus flat-mid-grey and hollow sun-disc ring, fixed 2026-09-25** (iter-3 builder). Both were
  measured before touching anything (`tools/shots/environment-overview-14.png`, pre-fix, cloud
  pixels ~40 sRGB points *darker* than the surrounding sky).
  - **Cumulus**: the self-shadow/brightness math keyed brightness on `thick` (= `dens`, the sample's
    own local density) via `(1 - thick)` factors, but alpha a few lines below is *also* driven by the
    same `dens` (`1 - exp(-dens*4.5)`). Those pulled against each other — the only samples with
    enough density to be opaque (`thick -> 1`) were exactly the ones `(1 - thick)` forced darkest, so
    the "bright top" code path never had enough alpha to be seen; every visible pixel came from the
    dark branch. Separately, the self-shadow sample (`dSun`, offset a short distance toward the sun
    in the same noise field) tracks a puff's own density almost as much as its neighbours' at a
    puff's ~0.5-1 km scale, so the old shadow exponent (2.6) collapsed brightness to near-zero across
    nearly the whole opaque body, leaving only a thin sunward sliver lit. Fixed by keying brightness
    on the self-shadow term alone (decoupled from local density/alpha) and softening its falloff
    (2.6 → 1.1) so most of a puff's sunward bulk stays bright. Verified: cloud pixels now average
    *brighter* than the surrounding sky at `overview`/14h (was the reverse), and `golden`/17.6h
    cumulus show a visible warm-lit top instead of a uniform grey streak
    (`tools/shots/environment-overview-14.png`, `tools/shots/environment-golden-17_6.png`,
    post-fix). `overcast`/`storm` decks re-verified unchanged (`tools/shots/environment-overcast-13.png`,
    `tools/shots/environment-storm-15.png`); `night`/22h clouds re-verified still dim
    (`tools/shots/environment-night-22.png`) — the moonlit branch replaces `uSunLight` entirely and
    ambient is near-zero at night, so neither touched constant affects it.
  - **Sun disc**: the "glare-recovery ring" (a post-tonemap darkening band just outside the disc,
    added 2026-09-14 for the `close` preset) was a flat-plateaued trapezoid — full-strength constant
    darkening between two radii, not a graded falloff. At golden hour, where the corona isn't fully
    saturated white to begin with (unlike the close-range case it was tuned against), that flat grey
    annulus reads as distinctly as the disc itself: a bright core, a grey ring, a bright corona —
    "hollow ring", not a disc with a glow. Fixed by removing the separate darkening trick entirely
    and instead widening the disc's own outer falloff (0.0050 → 0.0090 · `DISC_K`) so it fades
    directly into the corona; the contrast the ring used to manufacture now comes from the disc
    itself covering the region that used to blow out flat. Verified at `golden`/17.6h (ring gone,
    smooth glow — `tools/shots/environment-golden-17_6.png`) and re-checked `dawn`/6.3h and
    `close`/17h for regressions (both still show a clean legible disc+halo,
    `tools/shots/environment-dawn-6_3.png`, `tools/shots/environment-close-17.png`).

* **Single-scattering only** — no multiple scattering, so the sky directly anti-sunward at twilight
  is darker than reference photography; the phase function partly fakes the wide glow.
* **Exposure night ceiling (12) is a first correction, not tuned** against real night-photo
  references; moonlit scenes are readable but brighter than a physical full moon. The night gate
  now covers moonless nights too (any sun < -6°-ish, `st.night > 0.5`), not just `isMoonKey`.
* **Night legibility lift (NIGHT_LIFT 9, +up to x1.8 low-moon) and the night hemisphere floor
  (NIGHT_HEMI 0.035) are art-directed**, not physical: they make wild moonlit views readable
  (round-3 blind test's near-black 21.5h close shot) without touching exposure, the sky dome,
  stars or the PMREM (so terrain's water reflections stay as tuned). Tune history: first guess
  16 / 0.06 was tuned down to 6 / 0.02 after reading the module night shots at 21.5/22h — but the
  real wild close view at 21.5h (game-close-21_5-paused.png) then still read ~6/10, so the shipped
  values are 9 / 0.035 (game-close-21_5-tune2.png reads ~7 while staying clearly night; the moonlit
  savannah waterhole got BETTER, not whiter — sav-night-tune2.png). New-moon nights stay physically
  dark (the lift scales with the moon's illuminated fraction); they get only the hemisphere floor.
  Night clouds, water glints and park lamps are intentionally NOT boosted.
* **Clouds are cheap**: two analytic layers from one tileable noise texture; no cloud shadows on the
  ground, no god rays, no wet-ground darkening during rain.
* Below-horizon plain is a flat shaded colour with aerial perspective — real terrain hides it inside
  the world, but from high angles the world edge can show a faint seam against it.
* Rain is a camera-anchored volume of billboard streaks; no splash effects, no accumulation.
* `setWeather` smoothing is exponential toward the target; a preset applied mid-frame with
  `{immediate:true}` still takes one frame for LUT/PMREM.
* **Storm exposure damping (`stormDamp`, 2026-09-14) fixes the auto-exposure inverting the storm's
  deliberate darkening (it no longer reads brighter than overcast) but isn't fully tuned — storm's
  measured sky brightness (~147 avg RGB) is still a little above overcast's (~129), not clearly
  darker as the "dark cloud deck" preset description implies. `stormDamp`'s 0.35 coefficient is a
  first correction, same status as the night ceiling: not tuned against reference photography.
* **`DISC_K = 4.5` sun-disc scale (2026-09-14) is a legibility cheat, not physically derived** — it
  was sized by eye against the close/golden/dawn presets on this one seed/camera set; a different
  FOV or a much closer/farther framing could make it read too large or too small again.

## History / root causes fixed here

* **2026-09-05 — CPU sampler aliasing bug (root cause of the two long-standing "washed out" majors):
  `lightDepth()` reused the module scratch array `_d` that `scatter()`'s loop was still reading as
  the view-ray density, so every zenith/horizon radiance came out ~10⁴× too dim. The exposure
  controller (reading a nearly-black sky) climbed to its ceiling and the visible "sky" was actually
  the cloud deck blown out white, with fog/aerial-perspective colours near black producing a hard
  dark band at the horizon. Fixed by giving `lightDepth` its own scratch (`_ds`); noon zenith is now
  (0.53, 0.60, 0.79), golden hour keeps blue overhead with a warm horizon. GPU LUT was unaffected
  (GLSL locals).** Before/after: `tools/shots/env-before-golden.png` → `env-after-golden.png`.
* Same day: sky dome's below-horizon branch now converges to the pure LUT sky colour at d.y = 0
  (was a 50% `uHorizon` blend → visible step). Part of the horizon-band fix above.
* **2026-09-07 — wild night legibility (round-3 blind top issue #1): a wild close view at 21.5 h
  read as an almost black frame (blind-game-close-21_5.png, 5.5) while park-lit and waterhole
  nights were readable. Diagnosis: the exposure controller was doing exactly what it was told —
  at 21.5 h the moon (20.5° up, illum 0.92) is the key, exposure already saturates at the night
  ceiling 12 (`getState()` in the live game: `keyIsMoon: true, exposure: 12`), and moonlit ground
  radiance ~2.5e-4 × 12 lands at ~1% sRGB through ACES. No exposure setting could fix that without
  blowing the sky/water glints, so the fix art-directs the moon KEY light instead: `NIGHT_LIFT` ×
  moon-elevation compensation (×1.8 at the horizon → ×1 above 37°), gated on `st.night` and moon-up;
  plus a tiny night-only hemisphere (`NIGHT_HEMI`, §9's "sky via hemisphere") as a starlight/airglow
  floor for shadowed sides; plus the night-ceiling gate now covers moonless nights (`st.night > 0.5`)
  where both key luminances are 0 and `isMoonKey` is false (previously the DAY ceiling of 4 applied
  to true night). This is exactly the "moon-elevation-aware exposure floor or a minimum ambient for
  wild views" the round-3 status recommended — implemented as the art-directed moon KEY lift +
  hemisphere floor above, not an exposure floor, because exposure already sat at its night ceiling.
  Verified against the live game with the clock explicitly paused (`&speed=0`; an unpaused capture
  drifts hours at ~1 fps): tune #1 (6 / 0.02) took the same view from near-black to ~6/10;
  tune #2 (9 / 0.035, shipped) reads ~7 — terrain mottle, tree/animal silhouettes, lodge roof and
  kopje all legible, still unmistakably night. Exposure, sky, stars, clouds and PMREM untouched →
  day/golden-hour unchanged (game-close-14-afterfix.png matches the blind reference); the moonlit
  waterhole's water reflection path is untouched by construction and the scene got more readable,
  not whiter.**
Before/after: `tools/shots/blind-game-close-21_5.png` → `game-close-21_5-paused.png` (tune 1) →
  `game-close-21_5-tune2.png` (shipped); day control `game-close-14-afterfix.png`;
  waterhole regression `blind-sav-night.png` → `sav-night-afterfix.png` → `sav-night-tune2.png`;
  module night: `env-after-night.png` → `env-night-215-tune2.png` / `env-night-22-final.png`.
* **2026-09-14 — `close` preset sun disc: the round-3 critic finding ("no sun disc, just blown
  glow") was diagnosed by an earlier session as an exposure/compositing bug and partly re-coded
  (dusk yaw, a post-tonemap glare-recovery ring) — that WIP landed without a verification
  screenshot ever being read. It was re-verified from scratch this round by projecting `uSunDir`
  through the live camera matrix to find the sun's exact screen pixel, then reading raw pixel
  values there: the disc WAS compositing correctly (a literal white core inside a darkened ring,
  as designed) — it just projected to a ~3 px core / ~7 px outer ring at the close preset's 45°
  vertical FOV / 500 px frame, i.e. genuinely too small to read as "sun disc + corona", not
  miscomposited. Fixed by a `DISC_K = 4.5` legibility scale on every angular constant in the disc/
  ring/corona math (a common non-physical cheat — real engines routinely draw the sun larger than
  its true 0.27° radius for exactly this reason); `moonR` and the physical atmosphere model are
  untouched. Verified at close (900×500) and cross-checked golden/dawn (700×400) for regressions:
  all three now show a clearly legible disc+halo, golden/dawn look natural rather than exaggerated.
* **2026-09-14 — storm exposure fought its own darkening**: the critic's "storm deck stays bright
  instead of darkening with rain" finding was real and had a root cause of the same family as the
  2026-09-04/05 exposure bugs. `CLOUD_FRAG` already dims the deck via `mix(1.0, 0.42, uStorm)`, but
  a darker scene lowers `L`, and `0.62/L^0.62` rises to compensate — auto-exposing the deliberate
  darkening back out. Measured before the fix: storm's own `toneMappingExposure` (1.41) was
  *higher* than plain overcast's (1.32), and the storm sky read brighter on screen (avg RGB ~168 vs
  overcast's ~129) despite being the preset that's supposed to look darker and moodier. Fixed with
  `stormDamp = 1 - 0.35 * W.rain` multiplied into `exposureTarget`, gated on rain only (0 outside
  weather with rain, so clear/overcast/cloudy exposure is bit-for-bit unchanged; verified overcast's
  own exposure/screenshot before and after — no change). After: storm exposure dropped to 1.03
  (below overcast's 1.32, as intended) and storm's sky avg RGB dropped from ~168 to ~147 — the
  brighter-than-overcast inversion is fixed. Not yet fully tuned: storm's ~147 is still a little
  *above* overcast's ~129, so storm doesn't yet read as unambiguously darker than plain overcast,
  only no longer inverted. See Known gaps.
