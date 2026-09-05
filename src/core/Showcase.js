// URL parameter parsing for showcase / probe / game modes.
//   ?module=terrain&preset=overview&tod=16.5&seed=1&quality=high&play=0
//   ?modules=terrain,environment       load an explicit set (integrator use)
//   ?probe=1                           import every module, expose presets, no init
//   (none)                             full game: every module

export function parseParams(search = window.location.search) {
  const q = new URLSearchParams(search);
  const num = (k, d) => { const v = q.get(k); if (v === null || v === '') return d; const n = Number(v); return Number.isFinite(n) ? n : d; };
  const str = (k, d) => (q.get(k) ?? d);
  const list = (k) => (q.get(k) ? q.get(k).split(',').map((s) => s.trim()).filter(Boolean) : null);
  const quality = ['low', 'medium', 'high'].includes(str('quality', 'high')) ? str('quality', 'high') : 'high';
  return {
    module: str('module', null),
    modules: list('modules'),
    preset: str('preset', 'overview'),
    tod: num('tod', NaN),
    seed: num('seed', 1),
    quality,
    play: num('play', 0) === 1,
    probe: num('probe', 0) === 1,
    speed: num('speed', NaN),
    weather: str('weather', null),          // e.g. clear|cloudy|storm — environment may honour
    size: num('size', 1024),
    debug: num('debug', 0) === 1,
    noui: num('noui', 0) === 1,
  };
}
