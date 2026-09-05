// UI blips, the cash register / notification chime, and the vehicle engine voice.
// Same synth signature as calls.js: synth(ac, out, t0, rng, opts) → endTime.
import { voice, gain, filter, chain, shaper, envExp, envLin, contour, noiseSource, MIN_GAIN } from './dsp.js';

// Short bright tick: 2.2→1.5 kHz sine (30 ms) + a 3 kHz noise transient.
export function click(ac, out, t0, rng, o = {}) {
  const v = voice(ac, out, o.level ?? 0.5);
  const a = v.osc('sine', 1800); const g0 = gain(ac, 0); chain(a, g0, v.g);
  contour(a.frequency, t0, 2200, [[0.02, 1500]]);
  envLin(g0.gain, t0, 1, 0.002, 0.008, 0.03);
  const n = v.noise('white', rng); const ng = gain(ac, 0); chain(n, filter(ac, 'highpass', 3000, 0.7), ng, v.g);
  envLin(ng.gain, t0, 0.3, 0.001, 0.004, 0.015);
  const end = t0 + 0.08;
  v.start(t0); v.end(end);
  return end;
}
// Very soft 1.2 kHz triangle, 25 ms.
export function hover(ac, out, t0, rng, o = {}) {
  const v = voice(ac, out, o.level ?? 0.2);
  const a = v.osc('triangle', 1200); const g0 = gain(ac, 0); chain(a, g0, v.g);
  envLin(g0.gain, t0, 1, 0.004, 0.01, 0.02);
  const end = t0 + 0.06;
  v.start(t0); v.end(end);
  return end;
}
// Two ascending notes (A5 → E6), sine with a touch of triangle.
export function confirm(ac, out, t0, rng, o = {}) {
  const v = voice(ac, out, o.level ?? 0.4);
  let t = t0;
  for (const f of [880, 1320]) {
    const a = v.osc('sine', f), b = v.osc('triangle', f); const g0 = gain(ac, 0);
    chain(a, gain(ac, 0.8), g0); chain(b, gain(ac, 0.2), g0); g0.connect(v.g);
    envExp(g0.gain, t, 1, 0.01, 0.05, 0.1); v.at(a, t); v.at(b, t);
    t += 0.09;
  }
  const end = t + 0.15;
  v.start(t0); v.end(end);
  return end;
}
// Two descending buzzes (330 → 220 Hz square through a 1.2 kHz low-pass).
export function error(ac, out, t0, rng, o = {}) {
  const v = voice(ac, out, o.level ?? 0.4);
  const lp = filter(ac, 'lowpass', 1200, 1); lp.connect(v.g);
  let t = t0;
  for (let i = 0; i < 2; i++) {
    const a = v.osc('square', 330); const g0 = gain(ac, 0); chain(a, g0, lp);
    contour(a.frequency, t, 330, [[0.16, 220]]);
    envExp(g0.gain, t, 1, 0.01, 0.1, 0.06); v.at(a, t);
    t += 0.2;
  }
  const end = t + 0.1;
  v.start(t0); v.end(end);
  return end;
}
// Three-note bell arpeggio (C6 E6 G6) with inharmonic partials ×2.76 and ×5.4, 0.7 s decays.
export function chime(ac, out, t0, rng, o = {}) {
  const v = voice(ac, out, o.level ?? 0.35);
  let t = t0;
  const notes = o.low ? [784, 659.3, 523.3] : [1046.5, 1318.5, 1568];
  for (const f of notes) {
    const g0 = gain(ac, 0); g0.connect(v.g);
    for (const [m, l] of [[1, 1], [2.76, 0.3], [5.4, 0.12]]) {
      const a = v.osc('sine', f * m); chain(a, gain(ac, l), g0); v.at(a, t);
    }
    envExp(g0.gain, t, 1, 0.004, 0.02, 0.7);
    t += 0.12;
  }
  const end = t + 0.8;
  v.start(t0); v.end(end);
  return end;
}
// Cash register: a metallic "ka" (4 kHz noise), the "ching" (partials 2.5/3.7/5.2/7.1 kHz) and a drawer thunk.
export function cash(ac, out, t0, rng, o = {}) {
  const v = voice(ac, out, o.level ?? 0.45);
  const n = v.noise('white', rng); const ng = gain(ac, 0);
  chain(n, filter(ac, 'bandpass', 4000, 0.8), ng, v.g); envLin(ng.gain, t0, 0.6, 0.002, 0.01, 0.04);
  const g1 = gain(ac, 0); g1.connect(v.g);
  for (const [f, l] of [[2500, 1], [3700, 0.6], [5200, 0.35], [7100, 0.2]]) {
    const a = v.osc('sine', f); chain(a, gain(ac, l), g1); v.at(a, t0 + 0.01);
  }
  envExp(g1.gain, t0 + 0.01, 0.6, 0.003, 0.03, 0.5);
  const t1 = t0 + 0.28;
  const b = v.osc('sine', 120); const bg = gain(ac, 0); chain(b, bg, v.g);
  contour(b.frequency, t1, 120, [[0.1, 55]]); envExp(bg.gain, t1, 0.8, 0.004, 0.03, 0.12); v.at(b, t1);
  const n2 = v.noise('white', rng); const n2g = gain(ac, 0);
  chain(n2, filter(ac, 'lowpass', 600, 0.7), n2g, v.g); envLin(n2g.gain, t1, 0.5, 0.003, 0.02, 0.06); v.at(n2, t1);
  const end = t1 + 0.4;
  v.start(t0); v.end(end);
  return end;
}
// Building placed: a ground thump (90→40 Hz) with a dusty low-passed noise burst, then a soft confirm blip.
export function place(ac, out, t0, rng, o = {}) {
  const v = voice(ac, out, o.level ?? 0.5);
  const a = v.osc('sine', 90); const g0 = gain(ac, 0); chain(a, g0, v.g);
  contour(a.frequency, t0, 90, [[0.15, 40]]); envExp(g0.gain, t0, 1, 0.005, 0.05, 0.15);
  const n = v.noise('white', rng); const ng = gain(ac, 0);
  chain(n, filter(ac, 'lowpass', 800, 0.7), ng, v.g); envLin(ng.gain, t0, 0.5, 0.004, 0.02, 0.08);
  const t1 = t0 + 0.1;
  const b = v.osc('sine', 1046); const bg = gain(ac, 0); chain(b, bg, v.g);
  envExp(bg.gain, t1, 0.35, 0.01, 0.04, 0.12); v.at(b, t1);
  const end = t1 + 0.25;
  v.start(t0); v.end(end);
  return end;
}

export const UI = {
  click: { synth: click, dur: 0.1 }, hover: { synth: hover, dur: 0.08 }, confirm: { synth: confirm, dur: 0.4 },
  error: { synth: error, dur: 0.6 }, chime: { synth: chime, dur: 1.2 }, cash: { synth: cash, dur: 0.8 }, place: { synth: place, dur: 0.4 },
};

// ------------------------------------------------------------------------------------------ engine
// Four-cylinder four-stroke: firing frequency = rpm / 30 (26.7 Hz at idle, 100 Hz at 3000 rpm).
// Sawtooth at the firing rate + a half-rate square (uneven-fire "chug") + a detuned 2× sawtooth,
// soft-clipped, through a resonant low-pass that opens with rpm; white-noise intake/exhaust hiss
// band-passed at 900 Hz whose level rises with rpm. Everything is parameter-smoothed (no zipper).
export class EngineVoice {
  constructor(ac, out, rng, rpm = 900) {
    this.ac = ac;
    this.rpm = rpm;
    this.out = gain(ac, 0); this.out.connect(out);
    const mix = gain(ac, 1);
    const fire = rpm / 30;
    this.o1 = ac.createOscillator(); this.o1.type = 'sawtooth'; this.o1.frequency.value = fire;
    this.o2 = ac.createOscillator(); this.o2.type = 'square'; this.o2.frequency.value = fire * 0.5;
    this.o3 = ac.createOscillator(); this.o3.type = 'sawtooth'; this.o3.frequency.value = fire * 2; this.o3.detune.value = 12;
    chain(this.o1, gain(ac, 0.5), mix); chain(this.o2, gain(ac, 0.25), mix); chain(this.o3, gain(ac, 0.2), mix);
    this.lp = filter(ac, 'lowpass', 350 + rpm * 0.25, 2.5);
    this.body = gain(ac, 0.35);
    chain(mix, shaper(ac, 1.8), this.lp, this.body, this.out);
    this.nz = noiseSource(ac, 'white', rng);
    this.ng = gain(ac, 0.04 + (rpm / 6000) * 0.3);
    chain(this.nz, filter(ac, 'bandpass', 900, 0.7), this.ng, this.out);
    const now = ac.currentTime;
    this.nz.start(now, this.nz._offset || 0);
    this.o1.start(now); this.o2.start(now); this.o3.start(now);
    this.out.gain.setTargetAtTime(1, now, 0.12);
    this.stopped = false;
  }

  set({ rpm = this.rpm, load = 0.5 } = {}) {
    rpm = Math.max(300, Math.min(6000, rpm));
    this.rpm = rpm;
    const now = this.ac.currentTime, fire = rpm / 30, T = 0.08;
    this.o1.frequency.setTargetAtTime(fire, now, T);
    this.o2.frequency.setTargetAtTime(fire * 0.5, now, T);
    this.o3.frequency.setTargetAtTime(fire * 2, now, T);
    this.lp.frequency.setTargetAtTime(350 + rpm * 0.25, now, T);
    this.ng.gain.setTargetAtTime(0.04 + (rpm / 6000) * 0.3, now, T);
    this.body.gain.setTargetAtTime(0.25 + load * 0.2, now, T);
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true;
    const now = this.ac.currentTime;
    this.out.gain.setTargetAtTime(MIN_GAIN, now, 0.15);
    const tStop = now + 0.7;
    this.o1.stop(tStop); this.o2.stop(tStop); this.o3.stop(tStop); this.nz.stop(tStop);
    const out = this.out;
    this.o1.onended = () => { try { out.disconnect(); } catch { /* ignore */ } };
  }
}
