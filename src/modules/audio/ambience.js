// Ambience: continuous layers (wind, grass, insects, frogs, rain) plus event layers (birds, frog
// peeps, thunder). Layer factories are plain functions so selfTest() can render a layer alone in an
// OfflineAudioContext; the Ambience class composes them live and drives their levels from
// time-of-day, weather and water proximity. Nothing here loops audibly: wind and grass follow a
// simplex-noise gust curve, insect and frog voices use incommensurate LFO rates and are nudged
// every few seconds, rain drops run at two detuned playback rates, birds are random events.
import { gain, filter, chain, lfo, noiseSource, rainBuffer, clamp, lerp } from './dsp.js';
import { spatialize } from './spatial.js';
import { BIRDS, OTHER, periodOf } from './calls.js';

export const LAYER_NAMES = ['wind', 'grass', 'birds', 'insects', 'frogs', 'rain', 'thunder'];

// ----------------------------------------------------------------------------------------- layers
export function makeWind(ac, out, rng) {
  const g = gain(ac, 0); g.connect(out);
  const n1 = noiseSource(ac, 'pink', rng), n2 = noiseSource(ac, 'white', rng);
  const f1 = filter(ac, 'lowpass', 300, 0.8), f2 = filter(ac, 'bandpass', 450, 0.9), f3 = filter(ac, 'bandpass', 800, 9);
  const howl = gain(ac, 0);
  chain(n1, f1, gain(ac, 0.8), g); chain(n2, f2, gain(ac, 0.35), g); chain(n2, f3, howl, g);
  n1.start(0, n1._offset); n2.start(0, n2._offset);
  return {
    gain: g,
    /** k scales every time constant (selfTest passes ~0 to snap). */
    set(gust, level, now, k = 1) {
      g.gain.setTargetAtTime(level * (0.36 + 0.56 * gust), now, 0.25 * k);
      f1.frequency.setTargetAtTime(160 + 500 * gust, now, 0.3 * k);
      f2.frequency.setTargetAtTime(300 + 900 * gust, now, 0.3 * k);
      f3.frequency.setTargetAtTime(500 + 1400 * gust, now, 0.5 * k);
      howl.gain.setTargetAtTime(Math.max(0, gust - 0.55) * 0.5 * level, now, 0.4 * k);
    },
    dispose() { try { n1.stop(); n2.stop(); g.disconnect(); } catch { /* ignore */ } },
  };
}

export function makeGrass(ac, out, rng) {
  const g = gain(ac, 0); g.connect(out);
  const n = noiseSource(ac, 'white', rng);
  const flutter = gain(ac, 0.6);
  const l1 = lfo(ac, 'triangle', 6, 0.3, flutter.gain);
  const l2 = lfo(ac, 'sine', 0.37, 0.25, flutter.gain);
  chain(n, filter(ac, 'bandpass', 3500, 0.6), filter(ac, 'highpass', 1800, 0.7), flutter, g);
  n.start(0, n._offset); l1.start(0); l2.start(0);
  return {
    gain: g,
    set(gust, level, now, k = 1) {
      g.gain.setTargetAtTime(level * (0.15 + 0.55 * Math.pow(gust, 1.4)), now, 0.2 * k);
      l1.frequency.setTargetAtTime(4 + 7 * gust, now, 0.3 * k);
    },
    dispose() { try { n.stop(); l1.stop(); l2.stop(); g.disconnect(); } catch { /* ignore */ } },
  };
}

export function makeInsects(ac, out, rng) {
  const g = gain(ac, 0); g.connect(out);
  const voices = [];
  for (let i = 0; i < 7; i++) {
    const f = rng.range(4200, 5400);
    const o = ac.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
    const pulse = gain(ac, 0.5); const pl = lfo(ac, 'square', rng.range(18, 38), 0.5, pulse.gain);
    const bout = gain(ac, 0.5); const bl = lfo(ac, 'square', rng.range(1.2, 3.2), 0.5, bout.gain);
    const amp = gain(ac, rng.range(0.1, 0.18));
    const pan = ac.createStereoPanner(); pan.pan.value = rng.range(-0.9, 0.9);
    chain(o, filter(ac, 'bandpass', f, 8), pulse, bout, amp, pan, g);
    o.start(0); pl.start(0); bl.start(0);
    voices.push({ o, pl, bl, pan, amp });
  }
  // katydid: broadband 7 kHz rasp pulsing slowly
  const kn = noiseSource(ac, 'white', rng);
  const kp = gain(ac, 0.5); const kl = lfo(ac, 'square', 0.7, 0.5, kp.gain);
  const kpan = ac.createStereoPanner(); kpan.pan.value = rng.range(-0.6, 0.6);
  chain(kn, filter(ac, 'bandpass', 7000, 2), kp, gain(ac, 0.08), kpan, g);
  kn.start(0, kn._offset); kl.start(0);
  // faint continuous shimmer bed
  const sn = noiseSource(ac, 'white', rng);
  chain(sn, filter(ac, 'bandpass', 5500, 1), gain(ac, 0.03), g);
  sn.start(0, sn._offset);
  return {
    gain: g,
    set(level, now, k = 1) { g.gain.setTargetAtTime(level, now, 0.5 * k); },
    evolve(now, r) {
      const v = voices[r.int(0, voices.length - 1)];
      v.pl.frequency.setTargetAtTime(clamp(v.pl.frequency.value * r.range(0.85, 1.15), 14, 45), now, 1.5);
      v.bl.frequency.setTargetAtTime(clamp(v.bl.frequency.value * r.range(0.8, 1.25), 0.8, 4), now, 1.5);
      v.pan.pan.setTargetAtTime(clamp(v.pan.pan.value + r.range(-0.3, 0.3), -0.95, 0.95), now, 2);
    },
    dispose() {
      try { for (const v of voices) { v.o.stop(); v.pl.stop(); v.bl.stop(); } kn.stop(); kl.stop(); sn.stop(); g.disconnect(); } catch { /* ignore */ }
    },
  };
}

export function makeFrogs(ac, out, rng) {
  const g = gain(ac, 0); g.connect(out);
  const voices = [];
  for (let i = 0; i < 4; i++) {
    const f = rng.range(130, 380);
    const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
    const pulse = gain(ac, 0.5); const pl = lfo(ac, 'square', rng.range(2.4, 4.2), 0.5, pulse.gain);
    const bout = gain(ac, 0.5); const bl = lfo(ac, 'sine', rng.range(0.11, 0.2), 0.5, bout.gain);
    const pan = ac.createStereoPanner(); pan.pan.value = rng.range(-0.8, 0.8);
    chain(o, filter(ac, 'bandpass', f * 2.2, 3), filter(ac, 'lowpass', 1500, 0.7), pulse, bout, gain(ac, 0.25), pan, g);
    o.start(0); pl.start(0); bl.start(0);
    voices.push({ o, pl, bl, pan });
  }
  const peepIn = gain(ac, 1); peepIn.connect(g);
  return {
    gain: g, peepIn,
    set(level, now, k = 1) { g.gain.setTargetAtTime(level, now, 0.6 * k); },
    evolve(now, r) {
      const v = voices[r.int(0, voices.length - 1)];
      v.pl.frequency.setTargetAtTime(clamp(v.pl.frequency.value * r.range(0.85, 1.15), 1.8, 5), now, 1);
      v.pan.pan.setTargetAtTime(clamp(v.pan.pan.value + r.range(-0.25, 0.25), -0.9, 0.9), now, 2);
    },
    dispose() { try { for (const v of voices) { v.o.stop(); v.pl.stop(); v.bl.stop(); } g.disconnect(); } catch { /* ignore */ } },
  };
}

export function makeRain(ac, out, rng) {
  const g = gain(ac, 0); g.connect(out);
  const wash = noiseSource(ac, 'pink', rng), hiss = noiseSource(ac, 'white', rng), low = noiseSource(ac, 'brown', rng);
  const washF = filter(ac, 'bandpass', 2500, 0.5);
  chain(wash, washF, gain(ac, 0.5), g);
  chain(hiss, filter(ac, 'highpass', 4000, 0.7), gain(ac, 0.15), g);
  chain(low, filter(ac, 'lowpass', 400, 0.7), gain(ac, 0.2), g);
  const buf = rainBuffer(ac, rng);
  const dropG = gain(ac, 0.5); dropG.connect(g);
  const drops = [];
  for (const rate of [0.96, 1.05]) {
    const s = ac.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = rate;
    const pan = ac.createStereoPanner(); pan.pan.value = rate < 1 ? -0.4 : 0.4;
    chain(s, pan, dropG);
    s.start(0, rng.float() * 2.5);
    drops.push(s);
  }
  wash.start(0, wash._offset); hiss.start(0, hiss._offset); low.start(0, low._offset);
  return {
    gain: g,
    set(rain, now, k = 1) {
      g.gain.setTargetAtTime(0.7 * Math.pow(rain, 0.8), now, 0.8 * k);
      washF.frequency.setTargetAtTime(1500 + 4000 * rain, now, 1 * k);
      dropG.gain.setTargetAtTime(0.3 + 0.5 * rain, now, 1 * k);
    },
    dispose() { try { wash.stop(); hiss.stop(); low.stop(); for (const d of drops) d.stop(); g.disconnect(); } catch { /* ignore */ } },
  };
}

export const LAYER_FACTORIES = { wind: makeWind, grass: makeGrass, insects: makeInsects, frogs: makeFrogs, rain: makeRain };

// ----------------------------------------------------------------------------------------- curves
export function birdActivity(h) {
  if (h < 5) return 0.02;
  if (h < 6.5) return lerp(0.02, 1, (h - 5) / 1.5);
  if (h < 9) return lerp(1, 0.6, (h - 6.5) / 2.5);
  if (h < 13) return lerp(0.6, 0.3, (h - 9) / 4);
  if (h < 16.5) return lerp(0.3, 0.6, (h - 13) / 3.5);
  if (h < 18.5) return lerp(0.6, 0.25, (h - 16.5) / 2);
  if (h < 19.5) return lerp(0.25, 0.02, h - 18.5);
  return 0.02;
}
export function nightActivity(h) {
  if (h >= 20 || h < 4.5) return 1;
  if (h < 6.5) return 1 - (h - 4.5) / 2;
  if (h >= 17.5) return (h - 17.5) / 2.5;
  return 0;
}

const _birdNames = Object.keys(BIRDS);
const _birdWeights = new Float32Array(_birdNames.length);

// --------------------------------------------------------------------------------------- Ambience
export class Ambience {
  constructor(ac, buses, rng, noise, listener) {
    this.ac = ac; this.buses = buses; this.noise = noise; this.listener = listener;
    this.rng = rng.fork('ambience');
    const out = buses.bus.ambience;
    this.wind = makeWind(ac, out, this.rng);
    this.grass = makeGrass(ac, out, this.rng);
    this.insects = makeInsects(ac, out, this.rng);
    this.frogs = makeFrogs(ac, out, this.rng);
    this.rain = makeRain(ac, out, this.rng);
    this.birdsOut = gain(ac, 1); this.birdsOut.connect(out);
    this.thunderOut = gain(ac, 1); this.thunderOut.connect(out);
    this.levels = new Float32Array(LAYER_NAMES.length);   // smoothed 0..1 per layer (panel / api)
    this.targets = new Float32Array(LAYER_NAMES.length);
    this.gust = 0.5; this.grassGust = 0.5;
    this.nextBird = -1; this.nextPeep = -1; this.nextThunder = -1; this.nextEvolve = -1;
    this.autoUntil = -1;      // audio time up to which layer automation has been scheduled
    this.lastThunderAt = -1e9;
    this.active = [];        // spatial chains awaiting disposal: {s, end}
    this.onEvent = null;     // (name, x, y, z, bus, end, dist, at) → void, set by the engine for the log
    this.snapNext = true;    // jump straight to the targets on the first update / after time:set
  }

  /** After a time jump: snap levels to their new targets and reschedule the bird chorus. */
  snap() { this.snapNext = true; this.nextBird = -1; }

  /**
   * The audio clock is the master clock: everything is scheduled ahead up to now + lookahead
   * (the engine sizes the lookahead from the last frame gap), so a throttled tab or a slow
   * software renderer never starves the mix. env: { hour, windSpeed, rain, cloud, storm, water,
   * temperature, tx, ty, tz }.
   */
  update(dt, now, env, lookahead = 1) {
    const h = env.hour, T = this.targets, L = this.levels, rng = this.rng;
    const horizon = now + lookahead;
    const rain = clamp(env.rain, 0, 1);
    // ---- targets (from the current hour / weather / water)
    const night = nightActivity(h);
    const nightjar = night * 0.15;
    T[0] = clamp(0.2 + env.windSpeed / 14, 0.15, 1.1);
    T[1] = clamp(env.windSpeed / 9, 0.08, 1) * (1 - rain * 0.5);
    T[2] = Math.max(birdActivity(h) * (1 - rain * 0.8), nightjar * (1 - rain));
    T[3] = night * (1 - rain * 0.7) * clamp((env.temperature - 10) / 15, 0.3, 1);
    T[4] = clamp(env.water * (0.35 + 0.65 * night) + env.water * rain * 0.3, 0, 1);
    T[5] = rain;
    T[6] = now >= this.lastThunderAt ? Math.exp(-(now - this.lastThunderAt) / 3) : 0.35;
    L[6] = T[6];
    if (this.snapNext) { this.snapNext = false; for (let i = 0; i < 6; i++) L[i] = T[i]; }
    // ---- layer automation, scheduled in 0.1 s steps from where the last update stopped
    const STEP = 0.1;
    let t = this.autoUntil < now ? now : this.autoUntil;
    const noise = this.noise, windK = 0.45 + env.windSpeed / 10;
    while (t < horizon) {
      const slow = 0.5 + 0.5 * noise.fbm2D(t * 0.06, 17.3, 3);
      const fast = 0.15 * noise.noise2D(t * 0.5, 3.1);
      const gust = clamp((slow + fast) * windK, 0, 1.3);
      this.gust = gust;
      this.grassGust += (gust - this.grassGust) * (1 - Math.exp(-STEP / 0.35));
      for (let i = 0; i < 6; i++) L[i] += (T[i] - L[i]) * (1 - Math.exp(-STEP / (i === 5 ? 3 : 1.6)));
      this.wind.set(gust, L[0], t);
      this.grass.set(this.grassGust, L[1], t);
      this.insects.set(L[3], t);
      this.frogs.set(L[4], t);
      this.rain.set(L[5], t);
      t += STEP;
    }
    this.autoUntil = t;
    // ---- evolution nudges (insect / frog voices drift so nothing repeats)
    if (this.nextEvolve < now - 1) this.nextEvolve = now + rng.range(0.5, 2);
    while (this.nextEvolve < horizon) {
      const at = this.nextEvolve < now ? now : this.nextEvolve;
      this.insects.evolve(at, rng); this.frogs.evolve(at, rng);
      this.nextEvolve += rng.range(2.5, 6);
    }
    // ---- bird events
    const act = T[2];
    if (this.nextBird < now - 1) this.nextBird = now + rng.float() * 0.5;
    while (this.nextBird < horizon) {
      const at = Math.max(this.nextBird, now + 0.02);
      if (act > 0.015) this._bird(at, h, env);
      const mean = clamp(1.5 / Math.max(0.02, act), 0.6, 60);
      this.nextBird += clamp(-Math.log(1 - rng.float()) * mean, 0.3, 60);
    }
    // ---- reed-frog peeps (only while the frog layer is audible)
    if (L[4] > 0.05) {
      if (this.nextPeep < now - 1) this.nextPeep = now + rng.float() * 0.5;
      while (this.nextPeep < horizon) {
        const at = Math.max(this.nextPeep, now + 0.02);
        const pan = this.ac.createStereoPanner(); pan.pan.value = rng.range(-0.8, 0.8); pan.connect(this.frogs.peepIn);
        const end = OTHER.peep.synth(this.ac, pan, at, rng, {});
        this.active.push({ s: pan, end });
        this.nextPeep += rng.range(0.4, 1.8) / L[4];
      }
    }
    // ---- thunder
    const stormy = env.storm || rain > 0.5;
    if (stormy) {
      if (this.nextThunder < 0) this.nextThunder = now + rng.range(1, 3);
      if (this.nextThunder < now - 1) this.nextThunder = now + 0.5;
      while (this.nextThunder < horizon) {
        this.thunder(Math.max(this.nextThunder, now + 0.05), env);
        this.nextThunder += rng.range(6, 18);
      }
    } else this.nextThunder = -1;
    // ---- retire finished spatial chains
    const A = this.active;
    for (let i = A.length - 1; i >= 0; i--) {
      if (now > A[i].end + 0.3) { A[i].s.dispose ? A[i].s.dispose() : A[i].s.disconnect(); A[i] = A[A.length - 1]; A.pop(); }
    }
  }

  _bird(at, h, env) {
    const p = periodOf(h);
    let total = 0;
    for (let i = 0; i < _birdNames.length; i++) { _birdWeights[i] = BIRDS[_birdNames[i]].w[p]; total += _birdWeights[i]; }
    if (total <= 0) return;
    let r = this.rng.float() * total, name = _birdNames[_birdNames.length - 1];
    for (let i = 0; i < _birdNames.length; i++) { if (r < _birdWeights[i]) { name = _birdNames[i]; break; } r -= _birdWeights[i]; }
    const b = this.rng.range(0, Math.PI * 2), d = this.rng.range(25, 140);
    const x = env.tx + Math.sin(b) * d, z = env.tz + Math.cos(b) * d, y = env.ty + this.rng.range(2, 9);
    const s = spatialize(this.ac, this.birdsOut, this.buses.reverb, this.listener, x, y, z, { ref: 15, rolloff: 1 });
    const end = BIRDS[name].synth(this.ac, s.input, at, this.rng, {});
    this.active.push({ s, end });
    this.onEvent?.(name, x, y, z, 'ambience', end, s.distance, at);
  }

  /** Schedule a thunder clap at audio time t (also used by api.play('thunder')). */
  thunder(t, env, dist) {
    const d = dist ?? this.rng.range(0.15, 1);
    const pan = this.ac.createStereoPanner(); pan.pan.value = this.rng.range(-0.7, 0.7); pan.connect(this.thunderOut);
    pan.connect(this.buses.reverb);
    const end = OTHER.thunder.synth(this.ac, pan, t, this.rng, { dist: d });
    this.active.push({ s: pan, end });
    if (t > this.lastThunderAt) this.lastThunderAt = t;
    const b = this.rng.range(0, Math.PI * 2), r = 300 + d * 2500;
    this.onEvent?.('thunder', (env?.tx || 0) + Math.sin(b) * r, 400, (env?.tz || 0) + Math.cos(b) * r, 'ambience', end, r, t);
    return end;
  }

  dispose() {
    for (const a of this.active) { try { a.s.dispose ? a.s.dispose() : a.s.disconnect(); } catch { /* ignore */ } }
    this.active.length = 0;
    this.wind.dispose(); this.grass.dispose(); this.insects.dispose(); this.frogs.dispose(); this.rain.dispose();
    try { this.birdsOut.disconnect(); this.thunderOut.disconnect(); } catch { /* ignore */ }
  }
}
