# audio — spec

WebAudio, fully synthesised (no files). Reference: savannah field recordings — layered wind, grass rustle,
day birdsong, night crickets/frogs, distant lion, elephant rumble, hyena, zebra bark; vehicle engines; UI clicks.

## Must deliver
* Audio context created lazily on first user gesture (`pointerdown`/`keydown` on window) — never throw before that.
  `api.isRunning()`.
* **Ambience layers** crossfaded by `world.time.hour` and `world.weather`: wind (filtered noise, gust envelope from
  wind speed), grass rustle, day birds (several synthesised calls with random spacing via `ctx.rng`), night insects
  (dense chirp texture), frogs near water (if camera target near `world.isWater`), rain layer when `weather.rain > 0`,
  thunder rumble for storms.
* **Animal calls**: synthesised signature calls for ≥ 6 species (lion roar, elephant trumpet/rumble, zebra bark, hyena
  whoop, wildebeest grunt, hippo grunt, ostrich boom) triggered by `audio:play {sound, x, z, gain}` and randomly at
  plausible rates by time of day. **Spatialised** with `PannerNode` relative to camera position/orientation (distance falloff).
* **Vehicle/UI**: engine loop with rpm param (`api.engine(id, {x,z,rpm})`), UI click/hover/confirm/error blips,
  cash register on income, notification chime.
* **Mix**: master/ambience/animals/vehicles/ui gain buses; `api.setVolume(bus, v)`; simple compressor on master.
* `api.play(sound, {x,z,gain})`, `api.list()`, `api.setListener(pos, forward)` (called per frame from camera),
  `api.selfTest()` → renders each sound with an `OfflineAudioContext` and returns `{sound: rmsDb}` so a critic can
  verify content without ears.
* Showcase: `stage()` draws a live analyser (`// lint-allow` canvas in `#ui-root`) with layer meters and the last
  triggered sounds so a screenshot shows activity; also auto-starts the context via a synthetic gesture if allowed
  (headless Chrome allows autoplay with `--autoplay-policy=no-user-gesture-required`; if blocked, show "click to start").
  Presets: `overview` (day mix, 15 h), `night` (22 h insects + lion), `storm` (rain + thunder), `close` (animal calls burst).
