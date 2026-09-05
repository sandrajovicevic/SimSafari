# effects — spec

Post-processing and particle effects. Installs the render function via `ctx.app.setRenderFn(fn)`; must be removable
(`dispose()` restores direct rendering). Reference: Planet Zoo / Cities: Skylines II final image — clean AA, subtle
bloom on bright sky/lights, grounded contact shadows (AO), filmic contrast, dust in the air at golden hour.

## Must deliver
* **Pipeline** (`three/examples/jsm/postprocessing/*`): RenderPass → GTAOPass (or SSAO; quality-scaled) → UnrealBloomPass
  (threshold high, strength ≤ 0.35) → colour grade ShaderPass (procedural 3D LUT or analytic curves: lift/gamma/gain,
  saturation, warm tint by time of day from `environment.getSunColor` if present) → vignette + fine grain (≤ 0.02)
  → SMAAPass or FXAAPass → OutputPass. Respect `ctx.quality` (low: FXAA only). Handle resize (`core:resize`).
* **Heat haze**: screen-space distortion on distant ground at midday when temperature > 30 °C, fades by distance band.
* **Dust**: GPU particle system (instanced or Points with a custom shader) — ambient dust motes in the air (golden hour),
  dust puffs at `api.spawnDust(x, z, amount, dir)` (traffic/animals call it), soft particles fade near geometry,
  lit by sun colour, wind advection from `world.weather.wind`.
* **Rain/particles hook**: `api.emitter(kind, opts)` generic for other modules (smoke at lodge chimney, splash at water).
* **Light shafts/god rays**: optional, only if cheap and stable.
* `api.setEnabled(pass, bool)`, `api.setQuality(q)`, `api.spawnDust`, `api.emitter`, `api.getComposer()`,
  `api.setGrade({exposure, contrast, saturation, warmth})`.
* If any pass fails to compile, disable that pass and keep rendering (log once).

## Presets
`overview` (full stack over a staged test scene: fallback ground + some spheres/boxes + emissive lights, 17.5 h),
`close` (dust puffs at 20 m, 17 h), `heat` (midday haze, 13 h), `night` (bloom on emissive lamps, 22 h), `off` (pipeline bypassed for A/B).

## Budget
Full stack ≤ 6 ms GPU at 1080p on a mid GPU (document assumptions); ≤ 12 extra draw calls; ≤ 20 k particles.
