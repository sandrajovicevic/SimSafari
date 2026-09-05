# environment — spec

Owner of the sun, sky, atmosphere, clouds, weather, exposure and `world.weather`. Reference: African savannah
sky photography — dawn haze, hard noon light, golden hour, blue hour, moonlit night with the Milky Way.

## Must deliver
* **Sun**: `DirectionalLight` driven by `world.time.hour` (use `Units.hourToSunElevation/Azimuth` or better), colour
  temperature by elevation (warm at horizon), intensity through physically plausible curve, **cascaded shadow maps**
  (`three/examples/jsm/csm/CSM.js`, 3 cascades, 2048², follows camera) or an equivalent that keeps shadows sharp at
  50 m and present at 800 m. Shadow bias tuned: no acne, no peter-panning.
* **Sky**: procedural atmospheric scattering skydome (Preetham via `three/examples/jsm/objects/Sky.js` is acceptable as
  a base, but tune turbidity/rayleigh/mie per time of day; a custom Hosek-Wilkie-like shader is better). Sun disc with glow,
  horizon haze band. **PMREM environment map** generated from the sky (`PMREMGenerator`), refreshed when the hour
  changes by > 0.25 h; call `ctx.materials.setEnvMap(envMap)` and set `scene.environment`.
* **Night**: sky darkens to deep blue, star field (instanced points with brightness variation), Milky Way band, moon with
  phase, blue-grey moonlight directional (0.02–0.05 of sun) so the savannah is *readable* at night, not black.
* **Clouds**: layered procedural clouds (a raymarched or multi-layer noise dome), coverage from `world.weather.cloud`,
  wind drift, lit by sun colour, casting soft darkening on the ground is a bonus.
* **Fog/haze**: height-fog + distance haze tinted by sky colour (`scene.fog` or custom); dust haze stronger at golden hour.
* **Exposure**: `renderer.toneMappingExposure` by time of day so noon is not blown out and night is not black.
* **Weather**: `api.setWeather({cloud, rain, wind, season})` → updates `world.weather`, emits `weather:changed`.
  Rain: falling streaks + darker sky + reduced sun. Wind: sets `world.weather.wind` (Materials picks it up).
* **API**: `getSunDirection(out)`, `getSunColor(out)`, `getSkyColor(out)`, `getEnvMap()`, `setWeather()`, `getMoonPhase()`,
  `isNight()`.
* React to `time:set`; advance per frame when `!world.time.paused`.

## Presets
`overview` (14 h clear), `dawn` (6.3 h), `golden` (17.6 h), `dusk` (18.7 h), `night` (22 h), `overcast` (13 h, cloud 0.9),
`storm` (15 h, rain 0.8), `close` (16 h, low angle 30 m above ground looking at the horizon).
Stage a simple, unshaded-by-you test scene (a few spheres/boxes on the fallback ground) so lighting is judged on its own.

## Budget
≤ 12 draw calls (sky, sun, moon, stars, clouds, rain). PMREM refresh ≤ 4 ms and not every frame.
