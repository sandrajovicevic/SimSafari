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
  (separate night ceiling: see Known gaps), fog colour/density, all dome uniforms, LUT/PMREM
  refresh policy (twilight re-bakes more often).
* `csm.js` — one cascaded shadow map (3 cascades, 2048²) on the key light.

## Public API — `ctx.modules.get('environment')`

```js
getSunDirection(out?) → Vector3        // unit vector toward the sun (even below the horizon)
getMoonDirection(out?) → Vector3
getKeyDirection(out?) → Vector3        // current key light direction (sun or moon)
getSunColor(out?) → Color              // linear RGB sunlight after atmospheric transmittance
getSunIntensity() → number             // key light intensity (three physical units)
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

* **Single-scattering only** — no multiple scattering, so the sky directly anti-sunward at twilight
  is darker than reference photography; the phase function partly fakes the wide glow.
* **Exposure night ceiling (12) is a first correction, not tuned** against real night-photo
  references; moonlit scenes are readable but brighter than a physical full moon.
* **Clouds are cheap**: two analytic layers from one tileable noise texture; no cloud shadows on the
  ground, no god rays, no wet-ground darkening during rain.
* Below-horizon plain is a flat shaded colour with aerial perspective — real terrain hides it inside
  the world, but from high angles the world edge can show a faint seam against it.
* Rain is a camera-anchored volume of billboard streaks; no splash effects, no accumulation.
* `setWeather` smoothing is exponential toward the target; a preset applied mid-frame with
  `{immediate:true}` still takes one frame for LUT/PMREM.

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
