// Low-level synthesis helpers shared by every sound in the module.
// Everything here works on any BaseAudioContext (live AudioContext or OfflineAudioContext) so the
// same code renders live and inside selfTest(). All randomness comes from a seeded Rng passed in.

export const dB = (g) => 20 * Math.log10(Math.max(1e-9, g));
export const fromDb = (d) => Math.pow(10, d / 20);
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const MIN_GAIN = 0.0001; // exponential ramps cannot reach 0; this is -80 dB

// ---------------------------------------------------------------------------------------------
// Noise sources. The sample data is generated once per (kind, sampleRate) from a deterministic
// fork of the module rng, then wrapped into an AudioBuffer per context (buffers are context-bound
// in older engines, so keep a per-context cache).
// ---------------------------------------------------------------------------------------------
const NOISE_SECONDS = 4;
const _noiseData = new Map();      // 'white:44100' → Float32Array
const _noiseBuffers = new WeakMap(); // ctx → Map(kind → AudioBuffer)

export function noiseData(kind, rng, sr) {
  const key = `${kind}:${sr}`;
  let d = _noiseData.get(key);
  if (d) return d;
  const r = rng.fork('noise:' + kind);
  const n = Math.floor(sr * NOISE_SECONDS);
  d = new Float32Array(n);
  if (kind === 'white') {
    for (let i = 0; i < n; i++) d[i] = r.float() * 2 - 1;
  } else if (kind === 'pink') {
    // Paul Kellet's economy pink filter
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < n; i++) {
      const w = r.float() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  } else { // brown: leaky integration of white
    let last = 0;
    for (let i = 0; i < n; i++) {
      const w = r.float() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    }
  }
  if (kind !== 'white') {
    let peak = 0;
    for (let i = 0; i < n; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; }
    const s = 0.9 / (peak || 1);
    for (let i = 0; i < n; i++) d[i] *= s;
    // loop seam: crossfade the last 4096 samples into the first ones so looping never clicks
    const X = 4096;
    for (let i = 0; i < X; i++) { const t = i / X; d[n - X + i] = d[n - X + i] * (1 - t) + d[i] * t; }
  }
  _noiseData.set(key, d);
  return d;
}

export function noiseBuffer(ac, kind, rng) {
  let m = _noiseBuffers.get(ac);
  if (!m) { m = new Map(); _noiseBuffers.set(ac, m); }
  let b = m.get(kind);
  if (b) return b;
  const d = noiseData(kind, rng, ac.sampleRate);
  b = ac.createBuffer(1, d.length, ac.sampleRate);
  b.copyToChannel(d, 0);
  m.set(kind, b);
  return b;
}

/** Looping noise source at a random loop offset (so two sources of the same kind decorrelate). */
export function noiseSource(ac, kind, rng, { loop = true, rate = 1 } = {}) {
  const s = ac.createBufferSource();
  s.buffer = noiseBuffer(ac, kind, rng);
  s.loop = loop;
  s.playbackRate.value = rate;
  s._offset = rng.float() * (NOISE_SECONDS - 0.1);
  return s;
}

// ---------------------------------------------------------------------------------------------
// Rain drops: a 3 s buffer of hundreds of tiny decaying sine "plinks" (2–7 kHz, 3–15 ms) with a
// power-law amplitude distribution (many faint, few loud). Two copies at different playback rates
// give a non-repeating patter.
// ---------------------------------------------------------------------------------------------
const _rainBuffers = new WeakMap();
export function rainBuffer(ac, rng) {
  let b = _rainBuffers.get(ac);
  if (b) return b;
  const r = rng.fork('rain');
  const sr = ac.sampleRate, n = Math.floor(sr * 3);
  const d = new Float32Array(n);
  const drops = 1100;
  for (let k = 0; k < drops; k++) {
    const i0 = Math.floor(r.float() * (n - sr * 0.02));
    const f = r.range(1800, 7000);
    const len = Math.floor(sr * r.range(0.003, 0.015));
    const amp = 0.06 + 0.9 * Math.pow(r.float(), 3.2);
    const w = (2 * Math.PI * f) / sr;
    d[i0] += amp * 0.5; // click transient
    for (let i = 0; i < len; i++) {
      const e = Math.exp((-6 * i) / len);
      d[i0 + i] += amp * e * Math.sin(w * i);
    }
  }
  let peak = 0;
  for (let i = 0; i < n; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; }
  const s = 0.9 / (peak || 1);
  for (let i = 0; i < n; i++) d[i] *= s;
  b = ac.createBuffer(1, n, sr);
  b.copyToChannel(d, 0);
  _rainBuffers.set(ac, b);
  return b;
}

// ---------------------------------------------------------------------------------------------
// Synthesised impulse response for the "distance" reverb: sparse early reflections (ground /
// tree-line slap) followed by a noise tail that decays exponentially (RT60 ≈ 1.6 s) while its
// one-pole low-pass closes from 6 kHz to 800 Hz — outdoor tails lose highs first.
// ---------------------------------------------------------------------------------------------
export function impulseResponse(ac, rng, { seconds = 2.0, rt60 = 1.6 } = {}) {
  const r = rng.fork('ir');
  const sr = ac.sampleRate, n = Math.floor(sr * seconds);
  const buf = ac.createBuffer(2, n, sr);
  const decay = Math.log(1000) / rt60;
  const taps = [0.011, 0.019, 0.027, 0.041, 0.058, 0.083, 0.121];
  const tapGain = [0.5, 0.35, 0.3, 0.22, 0.18, 0.12, 0.08];
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let k = 0; k < taps.length; k++) {
      const i = Math.floor((taps[k] + r.range(-0.002, 0.002)) * sr);
      d[i] += tapGain[k] * r.range(0.8, 1.2) * (r.bool() ? 1 : -1);
    }
    let lp = 0;
    const start = Math.floor(0.02 * sr);
    for (let i = start; i < n; i++) {
      const t = i / sr;
      const fc = lerp(6000, 800, t / seconds);
      const a = 1 - Math.exp((-2 * Math.PI * fc) / sr);
      lp += a * ((r.float() * 2 - 1) - lp);
      d[i] += lp * Math.exp(-decay * t) * 0.6;
    }
  }
  return buf;
}

// ---------------------------------------------------------------------------------------------
// Wave-shaping (soft clip) for growl / brass roughness.
// ---------------------------------------------------------------------------------------------
const _curves = new Map();
export function softClipCurve(k) {
  const key = k.toFixed(2);
  let c = _curves.get(key);
  if (c) return c;
  const N = 4096;
  c = new Float32Array(N);
  const norm = Math.tanh(k);
  for (let i = 0; i < N; i++) { const x = (i / (N - 1)) * 2 - 1; c[i] = Math.tanh(k * x) / norm; }
  _curves.set(key, c);
  return c;
}
export function shaper(ac, drive = 2) {
  const s = ac.createWaveShaper();
  s.curve = softClipCurve(drive);
  s.oversample = '2x';
  return s;
}

// ---------------------------------------------------------------------------------------------
// Node shorthands.
// ---------------------------------------------------------------------------------------------
export function gain(ac, v = 1) { const g = ac.createGain(); g.gain.value = v; return g; }
export function filter(ac, type, freq, Q = 1, gainDb = 0) {
  const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = Q; f.gain.value = gainDb; return f;
}
/** Connect a → b → c … and return the last node. */
export function chain(...nodes) { for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]); return nodes[nodes.length - 1]; }

/** LFO driving an AudioParam: returns the oscillator (caller starts/stops it). */
export function lfo(ac, type, rate, depth, param) {
  const o = ac.createOscillator(); o.type = type; o.frequency.value = rate;
  const g = ac.createGain(); g.gain.value = depth;
  o.connect(g).connect(param);
  o._depth = g;
  return o;
}

// ---------------------------------------------------------------------------------------------
// Envelopes. All start from MIN_GAIN so nothing ever begins with a step (no clicks).
//   envExp: exponential attack (natural for voices) / exponential release. Returns the end time.
//   envLin: linear attack for percussive onsets.
// ---------------------------------------------------------------------------------------------
export function envExp(p, t0, peak, a, hold, r) {
  p.setValueAtTime(MIN_GAIN, t0);
  p.exponentialRampToValueAtTime(Math.max(MIN_GAIN, peak), t0 + a);
  p.setValueAtTime(Math.max(MIN_GAIN, peak), t0 + a + hold);
  p.exponentialRampToValueAtTime(MIN_GAIN, t0 + a + hold + r);
  return t0 + a + hold + r;
}
export function envLin(p, t0, peak, a, hold, r) {
  p.setValueAtTime(0, t0);
  p.linearRampToValueAtTime(peak, t0 + a);
  p.setValueAtTime(peak, t0 + a + hold);
  p.linearRampToValueAtTime(0, t0 + a + hold + r);
  return t0 + a + hold + r;
}
/** Piecewise frequency contour: points = [[dt, hz], ...] relative to t0, exponential between points. */
export function contour(p, t0, hz0, points) {
  p.setValueAtTime(Math.max(1, hz0), t0);
  for (const [dt, hz] of points) p.exponentialRampToValueAtTime(Math.max(1, hz), t0 + dt);
}

// ---------------------------------------------------------------------------------------------
// Voice: bookkeeping for a one-shot sound. Registers every source node so `end(t)` stops them all
// and disconnects the output once the last one has actually finished (no leaks, no dangling nodes).
// ---------------------------------------------------------------------------------------------
export function voice(ac, out, level = 1) {
  const g = ac.createGain(); g.gain.value = level; g.connect(out);
  const srcs = [];
  const v = {
    ac, g,
    osc(type, f) { const o = ac.createOscillator(); o.type = type; o.frequency.value = f; srcs.push({ n: o, on: false }); return o; },
    noise(kind, rng, opts) { const s = noiseSource(ac, kind, rng, opts); srcs.push({ n: s, on: false }); return s; },
    buffer(buf, opts = {}) { const s = ac.createBufferSource(); s.buffer = buf; if (opts.loop) s.loop = true; if (opts.rate) s.playbackRate.value = opts.rate; srcs.push({ n: s, on: false }); return s; },
    reg(node) { srcs.push({ n: node, on: false }); return node; },
    /** start a specific source at t (others may start later) */
    at(node, t) { for (const s of srcs) if (s.n === node && !s.on) { s.on = true; node.start(t, node._offset || 0); } return node; },
    /** start every not-yet-started source at t */
    start(t) { for (const s of srcs) if (!s.on) { s.on = true; s.n.start(t, s.n._offset || 0); } },
    /** stop everything shortly after t and release the graph when done. Returns t. */
    end(t) {
      const tStop = t + 0.05;
      let last = null;
      for (const s of srcs) { if (!s.on) { s.on = true; s.n.start(t); } s.n.stop(tStop); last = s.n; }
      if (last) last.onended = () => { try { g.disconnect(); } catch { /* already gone */ } };
      return t;
    },
  };
  return v;
}

/** RMS / peak / zero-crossing statistics of a rendered AudioBuffer (used by selfTest). */
export function analyseBuffer(buf) {
  let sum = 0, peak = 0, zc = 0, n = 0;
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch);
    let prev = 0;
    for (let i = 0; i < d.length; i++) {
      const v = d[i];
      sum += v * v; n++;
      const a = v < 0 ? -v : v; if (a > peak) peak = a;
      if ((v >= 0) !== (prev >= 0) && a > 0.002) zc++;
      prev = v;
    }
  }
  const rms = Math.sqrt(sum / Math.max(1, n));
  const seconds = buf.length / buf.sampleRate;
  return { rmsDb: +dB(rms).toFixed(1), peakDb: +dB(peak).toFixed(1), zcrHz: Math.round(zc / buf.numberOfChannels / seconds / 2), seconds: +seconds.toFixed(2) };
}
