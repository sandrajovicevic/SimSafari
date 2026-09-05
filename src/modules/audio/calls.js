// Animal and bird calls, plus thunder. Every synth has the signature
//     synth(ac, out, t0, rng, opts) → endTime (absolute seconds in `ac` time)
// and works on live or offline contexts. Each call is designed from the animal's acoustic
// signature (fundamental, contour, roughness, formants, rhythm) — see README for the per-species notes.
import { voice, gain, filter, chain, lfo, shaper, envExp, envLin, contour, MIN_GAIN } from './dsp.js';

/** Parallel band-pass "vocal tract" resonances plus an optional low-passed direct path. */
function formantBank(ac, bank, direct = 0, directLp = 2500) {
  const input = ac.createGain(), output = ac.createGain();
  for (const [f, q, g] of bank) chain(input, filter(ac, 'bandpass', f, q), gain(ac, g), output);
  if (direct > 0) chain(input, filter(ac, 'lowpass', directLp, 0.7), gain(ac, direct), output);
  return { input, output };
}

// ------------------------------------------------------------------------------------------ lion
// Fundamental 45–68 Hz rising to ~2× then falling over 1.6–2.6 s; two detuned sawtooths + a
// sub-octave square; 26–34 Hz sawtooth AM (vocal-fold pulsing = the growl); soft clip; formants at
// 380/880/1900 Hz; pink-noise breath; then 3–6 decaying "huh" grunts with an accelerating rhythm.
export function lion(ac, out, t0, rng, o = {}) {
  const v = voice(ac, out, o.level ?? 0.6);
  const dur = rng.range(1.6, 2.6);
  const f0 = rng.range(45, 68);
  const fpk = f0 * rng.range(1.7, 2.2);
  const mix = ac.createGain();
  const roarG = gain(ac, 0); roarG.connect(mix);
  const s1 = v.osc('sawtooth', f0), s2 = v.osc('sawtooth', f0), sub = v.osc('square', f0 * 0.5);
  s2.detune.value = 9;
  chain(s1, gain(ac, 0.5), roarG); chain(s2, gain(ac, 0.4), roarG); chain(sub, gain(ac, 0.18), roarG);
  for (const os of [s1, s2, sub]) {
    const m = os === sub ? 0.5 : 1;
    contour(os.frequency, t0, f0 * m, [[dur * 0.35, fpk * m], [dur * 0.75, fpk * 0.85 * m], [dur, f0 * 0.8 * m]]);
  }
  envExp(roarG.gain, t0, 1, 0.18, dur * 0.72, dur * 0.28 + 0.25);
  const am = gain(ac, 0.6);
  v.reg(lfo(ac, 'sawtooth', rng.range(26, 34), 0.4, am.gain));
  const br = v.noise('pink', rng); const brG = gain(ac, 0);
  chain(br, filter(ac, 'bandpass', 1100, 1.2), brG, mix);
  envExp(brG.gain, t0, 0.3, 0.3, dur * 0.5, dur * 0.4);
  const fb = formantBank(ac, [[380, 5, 1.0], [880, 5, 0.6], [1900, 6, 0.28]], 0.5, 1400);
  chain(mix, am, shaper(ac, 2.6), fb.input); fb.output.connect(v.g);
  let t = t0 + dur + 0.25, gap = 0.6;
  const n = rng.int(3, 6);
  for (let i = 0; i < n; i++) {
    const gf = f0 * rng.range(0.85, 1.0);
    const go = v.osc('sawtooth', gf); const gg = gain(ac, 0); chain(go, gg, mix);
    contour(go.frequency, t, gf * 1.2, [[0.08, gf], [0.25, gf * 0.8]]);
    envExp(gg.gain, t, 0.9 * (1 - i / (n + 1)), 0.03, 0.12, 0.14);
    v.at(go, t);
    t += gap; gap *= 0.88;
  }
  const end = t + 0.4;
  v.start(t0); v.end(end);
  return end;
}

// -------------------------------------------------------------------------------------- elephant
// Trumpet: 280–380 Hz sweeping to 650–900 Hz and rasping back down over 0.9–1.5 s; saw + square,
// vibrato that grows into the note, soft clip for brass, formants 1400/2600 Hz, noise chiff at onset.
// 40 % of the time a second, shorter blast follows.
export function elephant(ac, out, t0, rng, o = {}) {
  const v = voice(ac, out, o.level ?? 0.48);
  const fb = formantBank(ac, [[1400, 1.5, 1], [2600, 3, 0.35]], 0.35, 4000);
  fb.output.connect(v.g);
  const note = (t, dur, f0, fpk, lvl) => {
    const mix = ac.createGain();
    const s1 = v.osc('sawtooth', f0), s2 = v.osc('square', f0); s2.detune.value = -6;
    chain(s1, gain(ac, 0.6), mix); chain(s2, gain(ac, 0.25), mix);
    for (const os of [s1, s2]) contour(os.frequency, t, f0, [[dur * 0.45, fpk], [dur * 0.8, fpk * 0.85], [dur, f0 * 1.3]]);
    const vib = v.osc('sine', 6.5); const vg = gain(ac, 0); vib.connect(vg); vg.connect(s1.frequency); vg.connect(s2.frequency);
    vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(fpk * 0.03, t + dur * 0.6);
    const env = gain(ac, 0); envExp(env.gain, t, lvl, 0.08, dur - 0.08, 0.25);
    chain(mix, env, shaper(ac, 2.2), filter(ac, 'highpass', 220, 0.7), fb.input);
    const br = v.noise('white', rng); const bg = gain(ac, 0);
    chain(br, filter(ac, 'bandpass', 2600, 1), bg, v.g); envExp(bg.gain, t, 0.12 * lvl, 0.03, 0.08, 0.2);
    v.at(s1, t); v.at(s2, t); v.at(vib, t); v.at(br, t);
    return t + dur + 0.3;
  };
  const f0 = rng.range(280, 380), fpk = rng.range(650, 900);
  let end = note(t0, rng.range(0.9, 1.5), f0, fpk, 1);
  if (rng.bool(0.4)) end = note(end + 0.1, rng.range(0.5, 0.8), f0 * 1.1, fpk * 1.05, 0.8);
  v.start(t0); v.end(end);
  return end;
}

// Rumble: 22–30 Hz fundamental (infrasound edge) with 2nd/3rd harmonics so it reads on speakers,
// 8–12 Hz throaty pulsing, slow pitch wobble, 2.5–4 s.
export function elephant_rumble(ac, out, t0, rng, o = {}) {
  const v = voice(ac, out, o.level ?? 0.55);
  const dur = rng.range(2.5, 4);
  const f = rng.range(22, 30);
  const s1 = v.osc('sine', f), s2 = v.osc('sawtooth', f * 2), s3 = v.osc('sine', f * 3);
  const mix = gain(ac, 1);
  chain(s1, gain(ac, 0.7), mix); chain(s2, gain(ac, 0.35), mix); chain(s3, gain(ac, 0.2), mix);
  const wob = v.osc('sine', 0.4); const wg = gain(ac, f * 0.06); wob.connect(wg);
  wg.connect(s1.frequency); wg.connect(s2.frequency); wg.connect(s3.frequency);
  const am = gain(ac, 0.7); v.reg(lfo(ac, 'sine', rng.range(8, 12), 0.3, am.gain));
  const env = gain(ac, 0); envExp(env.gain, t0, 1, 0.5, dur - 0.5, 0.9);
  chain(mix, am, env, filter(ac, 'lowpass', 140, 1.5), v.g);
  const end = t0 + dur + 1;
  v.start(t0); v.end(end);
  return end;
}

// ----------------------------------------------------------------------------------------- zebra
// "kwa-ha" bray: syllable A square 640→470 Hz (130 ms), syllable B sawtooth 1100→860 Hz (110 ms)
// with a breathy noise burst, through nasal formants 900/1600 Hz; 4–7 repeats, accelerating, fading.
export function zebra(ac, out, t0, rng, o = {}) {
  const v = voice(ac, out, o.level ?? 0.6);
  const n = rng.int(4, 7);
  let t = t0, gap = rng.range(0.4, 0.48);
  const fb = formantBank(ac, [[900, 2.5, 1], [1600, 4, 0.5]], 0.4, 2600); fb.output.connect(v.g);
  const nz = v.noise('white', rng); const nzF = filter(ac, 'bandpass', 2000, 1.2); nz.connect(nzF);
  for (let i = 0; i < n; i++) {
    const k = 1 - i / n;
    const a = v.osc('square', 620); const ag = gain(ac, 0); chain(a, ag, fb.input);
    contour(a.frequency, t, 640 * rng.range(0.95, 1.05), [[0.13, 470]]);
    envLin(ag.gain, t, 0.5 * (0.6 + 0.4 * k), 0.012, 0.07, 0.06); v.at(a, t);
    const tb = t + 0.17;
    const b = v.osc('sawtooth', 1050); const bg = gain(ac, 0); chain(b, bg, fb.input);
    contour(b.frequency, tb, 1100 * rng.range(0.95, 1.05), [[0.11, 860]]);
    envExp(bg.gain, tb, 0.4 * (0.6 + 0.4 * k), 0.02, 0.05, 0.07); v.at(b, tb);
    const ng = gain(ac, 0); chain(nzF, ng, v.g); envExp(ng.gain, tb, 0.2, 0.015, 0.05, 0.08);
    t += gap; gap *= 0.94;
  }
  const end = t + 0.3;
  v.start(t0); v.end(end);
  return end;
}

// ----------------------------------------------------------------------------------------- hyena
// Whoop: 3–5 rising glissandi 380–460 Hz → ×2.4–3.0 over 0.7–1 s, each starting a little higher,
// sine + triangle body, vibrato growing to the end, breathy "wh" onset, ~0.5 s pauses.
export function hyena(ac, out, t0, rng, o = {}) {
  const v = voice(ac, out, o.level ?? 0.45);
  const n = rng.int(3, 5);
  let t = t0;
  const base = rng.range(380, 460);
  const fb = formantBank(ac, [[1000, 1.2, 0.6], [2200, 3, 0.25]], 0.7, 3200); fb.output.connect(v.g);
  for (let i = 0; i < n; i++) {
    const fs = base * (1 + i * 0.08), fe = fs * rng.range(2.4, 3.0), dur = rng.range(0.7, 1.0);
    const a = v.osc('sine', fs), b = v.osc('triangle', fs); const ag = gain(ac, 0);
    chain(a, gain(ac, 0.8), ag); chain(b, gain(ac, 0.35), ag); ag.connect(fb.input);
    for (const os of [a, b]) {
      os.frequency.setValueAtTime(fs, t);
      os.frequency.exponentialRampToValueAtTime(fe * 0.9, t + dur * 0.7);
      os.frequency.exponentialRampToValueAtTime(fe, t + dur * 0.88);
      os.frequency.linearRampToValueAtTime(fe * 0.8, t + dur);
    }
    const vib = v.osc('sine', 7); const vg = gain(ac, 0); vib.connect(vg); vg.connect(a.frequency); vg.connect(b.frequency);
    vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(fe * 0.02, t + dur); v.at(vib, t);
    envExp(ag.gain, t, 1, 0.14, dur - 0.26, 0.12);
    v.at(a, t); v.at(b, t);
    const nz = v.noise('white', rng); const ng = gain(ac, 0);
    chain(nz, filter(ac, 'bandpass', 1300, 1), ng, v.g); envExp(ng.gain, t, 0.12, 0.05, 0.05, 0.2); v.at(nz, t);
    t += dur + rng.range(0.4, 0.8);
  }
  const end = t + 0.2;
  v.start(t0); v.end(end);
  return end;
}

// ------------------------------------------------------------------------------------ wildebeest
// Nasal "gnu" grunt: 150–200 Hz sawtooth + sub square, 45 Hz buzz AM, formants 550/1500 Hz,
// 2–4 pulses of 0.22–0.3 s.
export function wildebeest(ac, out, t0, rng, o = {}) {
  const v = voice(ac, out, o.level ?? 0.6);
  const n = rng.int(2, 4);
  let t = t0;
  const fb = formantBank(ac, [[550, 5, 1], [1500, 5, 0.6]], 0.5, 1200);
  const am = gain(ac, 0.7); v.reg(lfo(ac, 'sine', 45, 0.3, am.gain));
  chain(fb.output, am, v.g);
  for (let i = 0; i < n; i++) {
    const f = rng.range(150, 200), d = rng.range(0.22, 0.3);
    const a = v.osc('sawtooth', f), b = v.osc('square', f * 0.5); const ag = gain(ac, 0);
    chain(a, gain(ac, 0.8), ag); chain(b, gain(ac, 0.3), ag); ag.connect(fb.input);
    contour(a.frequency, t, f * 1.15, [[d * 0.3, f], [d, f * 0.88]]);
    contour(b.frequency, t, f * 0.575, [[d * 0.3, f * 0.5], [d, f * 0.44]]);
    envExp(ag.gain, t, 1, 0.03, d - 0.03, 0.09); v.at(a, t); v.at(b, t);
    t += d + rng.range(0.3, 0.5);
  }
  const end = t + 0.2;
  v.start(t0); v.end(end);
  return end;
}

// ----------------------------------------------------------------------------------------- hippo
// One long "hoooo" (0.6–0.8 s) at 70–88 Hz then 3–6 accelerating "ho" pulses rising ~4 % each;
// sawtooth + sub sine, resonances 140/480/900 Hz, 15 Hz AM, soft clip.
export function hippo(ac, out, t0, rng, o = {}) {
  const v = voice(ac, out, o.level ?? 0.7);
  const f = rng.range(70, 88);
  const fb = formantBank(ac, [[140, 4, 1], [480, 3, 0.5], [900, 3, 0.2]], 0.5, 700);
  const am = gain(ac, 0.75); v.reg(lfo(ac, 'sine', 15, 0.25, am.gain));
  chain(fb.output, am, shaper(ac, 1.6), v.g);
  const pulse = (t, d, fk, lvl) => {
    const a = v.osc('sawtooth', f * fk), b = v.osc('sine', f * fk * 0.5); const g0 = gain(ac, 0);
    chain(a, gain(ac, 0.7), g0); chain(b, gain(ac, 0.5), g0); g0.connect(fb.input);
    contour(a.frequency, t, f * fk * 0.9, [[d * 0.3, f * fk], [d, f * fk * 0.85]]);
    contour(b.frequency, t, f * fk * 0.45, [[d * 0.3, f * fk * 0.5], [d, f * fk * 0.425]]);
    envExp(g0.gain, t, lvl, 0.04, d - 0.04, 0.1); v.at(a, t); v.at(b, t);
  };
  let t = t0;
  pulse(t, rng.range(0.6, 0.8), 1, 1); t += rng.range(0.85, 1.0);
  const n = rng.int(3, 6); let gap = 0.4;
  for (let i = 0; i < n; i++) { pulse(t, 0.22, 1 + i * 0.04, 0.9); t += gap; gap = Math.max(0.22, gap * 0.88); }
  const end = t + 0.3;
  v.start(t0); v.end(end);
  return end;
}

// --------------------------------------------------------------------------------------- ostrich
// Boom: "boo-boo-booooo" — 55–70 Hz sine + a little sawtooth through a resonant 200 Hz low-pass,
// soft 80 ms attacks, two short pulses then a long one that rises ~8 %.
export function ostrich(ac, out, t0, rng, o = {}) {
  const v = voice(ac, out, o.level ?? 0.5);
  const f = rng.range(55, 70);
  const res = filter(ac, 'lowpass', 200, 4); res.connect(v.g);
  const boom = (t, d, rise) => {
    const a = v.osc('sine', f), b = v.osc('sawtooth', f); const g0 = gain(ac, 0);
    chain(a, gain(ac, 0.8), g0); chain(b, gain(ac, 0.3), g0); g0.connect(res);
    contour(a.frequency, t, f, [[d, f * rise]]); contour(b.frequency, t, f, [[d, f * rise]]);
    envExp(g0.gain, t, 1, 0.08, d - 0.08, 0.25); v.at(a, t); v.at(b, t);
  };
  let t = t0;
  boom(t, 0.35, 1.0); t += 0.5; boom(t, 0.35, 1.0); t += 0.5; boom(t, rng.range(0.8, 1.1), 1.08); t += 1.4;
  v.start(t0); v.end(t);
  return t;
}

// ----------------------------------------------------------------------------------------- birds
// Ring-necked dove "work-HARD-er": three sine syllables (×1.0/1.2/1.04 of 480–560 Hz) with 22 Hz vibrato, 2–3 repeats.
export function dove(ac, out, t0, rng, o = {}) {
  const v = voice(ac, out, o.level ?? 0.3);
  const fb = formantBank(ac, [[600, 2, 0.7]], 0.6, 1500); fb.output.connect(v.g);
  const reps = rng.int(2, 3); let t = t0; const base = rng.range(480, 560);
  const syl = [[1.0, 0.18], [1.2, 0.22], [1.04, 0.32]];
  for (let r = 0; r < reps; r++) {
    for (const [fm, d] of syl) {
      const a = v.osc('sine', base * fm); const g0 = gain(ac, 0); chain(a, g0, fb.input);
      const vib = v.osc('sine', 22); const vg = gain(ac, base * fm * 0.03); vib.connect(vg); vg.connect(a.frequency); v.at(vib, t);
      contour(a.frequency, t, base * fm * 0.96, [[0.05, base * fm], [d, base * fm * 0.97]]);
      envExp(g0.gain, t, 1, 0.04, d - 0.04, 0.06); v.at(a, t);
      t += d + 0.06;
    }
    t += 0.4;
  }
  v.start(t0); v.end(t);
  return t;
}
// Yellow-fronted tinkerbird: 6–12 pure 1.35–1.55 kHz "tink"s at ~2.5 Hz, each with a tiny down-chirp.
export function tinkerbird(ac, out, t0, rng, o = {}) {
  const v = voice(ac, out, o.level ?? 0.3);
  const n = rng.int(6, 12); const f = rng.range(1350, 1550); let t = t0; const gap = rng.range(0.36, 0.44);
  for (let i = 0; i < n; i++) {
    const a = v.osc('sine', f); const g0 = gain(ac, 0); chain(a, g0, v.g);
    contour(a.frequency, t, f * 1.03, [[0.06, f * 0.98]]);
    envExp(g0.gain, t, 1, 0.008, 0.04, 0.05); v.at(a, t);
    t += gap;
  }
  v.start(t0); v.end(t);
  return t;
}
// Cisticola-style warble: 5–9 fast 60–90 ms notes, 2.8–4.5 kHz, each sweeping ×0.7–1.4.
export function warbler(ac, out, t0, rng, o = {}) {
  const v = voice(ac, out, o.level ?? 0.3);
  const n = rng.int(5, 9); let t = t0;
  for (let i = 0; i < n; i++) {
    const f = rng.range(2800, 4500), d = rng.range(0.06, 0.09);
    const a = v.osc('sine', f), b = v.osc('triangle', f); const g0 = gain(ac, 0);
    chain(a, gain(ac, 0.85), g0); chain(b, gain(ac, 0.15), g0); g0.connect(v.g);
    const fe = f * rng.range(0.7, 1.4);
    contour(a.frequency, t, f, [[d, fe]]); contour(b.frequency, t, f, [[d, fe]]);
    envExp(g0.gain, t, 1, 0.01, d - 0.01, 0.03); v.at(a, t); v.at(b, t);
    t += d + rng.range(0.04, 0.09);
  }
  const end = t + 0.1;
  v.start(t0); v.end(end);
  return end;
}
// Grey go-away bird "gwaaay": nasal sawtooth 850–950 Hz falling to ×0.62 over 0.45–0.6 s, 12 Hz vibrato, formants 900/1800.
export function goaway(ac, out, t0, rng, o = {}) {
  const v = voice(ac, out, o.level ?? 0.35);
  const fb = formantBank(ac, [[900, 3, 0.7], [1800, 3, 0.6]], 0.3, 2500); fb.output.connect(v.g);
  const f = rng.range(850, 950), d = rng.range(0.45, 0.6);
  const a = v.osc('sawtooth', f); const g0 = gain(ac, 0); chain(a, g0, fb.input);
  contour(a.frequency, t0, f * 0.9, [[0.08, f], [d * 0.5, f * 0.9], [d, f * 0.62]]);
  v.reg(lfo(ac, 'sine', 12, f * 0.015, a.frequency));
  envExp(g0.gain, t0, 1, 0.05, d - 0.05, 0.15);
  const end = t0 + d + 0.2;
  v.start(t0); v.end(end);
  return end;
}
// Fiery-necked nightjar "good-lord-deliver-us": four falling whistles (2.1→1.5 kHz) then a 24 Hz trill.
export function nightjar(ac, out, t0, rng, o = {}) {
  const v = voice(ac, out, o.level ?? 0.3);
  let t = t0;
  for (const f of [2100, 1900, 1700, 1500]) {
    const a = v.osc('sine', f); const g0 = gain(ac, 0); chain(a, g0, v.g);
    contour(a.frequency, t, f * 1.02, [[0.16, f * 0.96]]);
    envExp(g0.gain, t, 1, 0.02, 0.12, 0.05); v.at(a, t);
    t += 0.2;
  }
  const a = v.osc('sine', 1600); const trill = gain(ac, 0.5); const g0 = gain(ac, 0);
  chain(a, trill, g0, v.g);
  v.reg(lfo(ac, 'square', 24, 0.45, trill.gain));
  const d = rng.range(0.5, 0.8);
  envExp(g0.gain, t, 0.9, 0.03, d - 0.03, 0.1); v.at(a, t);
  const end = t + d + 0.2;
  v.start(t0); v.end(end);
  return end;
}
// Hornbill "wok wok wok": 5–8 nasal 280–320 Hz pulses, rising ~4 % and accelerating.
export function hornbill(ac, out, t0, rng, o = {}) {
  const v = voice(ac, out, o.level ?? 0.4);
  const fb = formantBank(ac, [[700, 3, 0.8], [1400, 4, 0.4]], 0.4, 1800); fb.output.connect(v.g);
  const n = rng.int(5, 8); let t = t0, gap = 0.28, f = rng.range(280, 320);
  for (let i = 0; i < n; i++) {
    const a = v.osc('sawtooth', f); const g0 = gain(ac, 0); chain(a, g0, fb.input);
    contour(a.frequency, t, f * 0.85, [[0.03, f * 1.05], [0.12, f * 0.9]]);
    envExp(g0.gain, t, 1, 0.015, 0.07, 0.06); v.at(a, t);
    t += gap; gap = Math.max(0.14, gap * 0.9); f *= 1.04;
  }
  const end = t + 0.1;
  v.start(t0); v.end(end);
  return end;
}
// Reed-frog peep: a single 60 ms 2.6–3.4 kHz whistle (used as an event by the frog layer).
export function peep(ac, out, t0, rng, o = {}) {
  const v = voice(ac, out, o.level ?? 0.25);
  const f = rng.range(2600, 3400);
  const a = v.osc('sine', f); const g0 = gain(ac, 0); chain(a, g0, v.g);
  contour(a.frequency, t0, f * 0.97, [[0.06, f * 1.02]]);
  envExp(g0.gain, t0, 1, 0.008, 0.04, 0.03);
  const end = t0 + 0.12;
  v.start(t0); v.end(end);
  return end;
}

// --------------------------------------------------------------------------------------- thunder
// dist 0 (overhead) … 1 (far): a high-passed white-noise crack (near only), a brown-noise rumble
// through a resonant 90–210 Hz low-pass with a slow attack that lengthens with distance, random
// rolling level steps under an exponential decay, and a 33–43 Hz sub sine. 4–7 s (longer when far).
export function thunder(ac, out, t0, rng, o = {}) {
  const v = voice(ac, out, o.level ?? 0.9);
  const dist = o.dist ?? rng.range(0.15, 1);
  const dur = rng.range(4, 7) * (0.7 + 0.5 * dist);
  if (dist < 0.5) {
    const c = v.noise('white', rng); const cg = gain(ac, 0);
    chain(c, filter(ac, 'highpass', 1500, 0.7), cg, v.g);
    envExp(cg.gain, t0, (0.5 - dist) * 1.4, 0.008, 0.03, 0.25);
  }
  const r = v.noise('brown', rng); const rg = gain(ac, 0);
  const lp = filter(ac, 'lowpass', 90 + 120 * (1 - dist), 2.5);
  chain(r, lp, rg, v.g);
  const attack = 0.05 + 0.5 * dist; const p = rg.gain;
  p.setValueAtTime(MIN_GAIN, t0); p.exponentialRampToValueAtTime(1, t0 + attack);
  let t = t0 + attack; const tau = 1.2 + 1.5 * dist;
  while (t < t0 + dur) {
    const seg = rng.range(0.25, 0.6);
    const lvl = Math.exp(-(t - t0 - attack) / tau) * rng.range(0.3, 1);
    p.setTargetAtTime(Math.max(MIN_GAIN, lvl), t, seg * 0.4);
    t += seg;
  }
  p.setTargetAtTime(MIN_GAIN, t, 0.4);
  const s = v.osc('sine', 38 + rng.range(-5, 5)); const sg = gain(ac, 0); chain(s, sg, v.g);
  envExp(sg.gain, t0, 0.5 * (1 - dist * 0.5), attack + 0.2, dur * 0.5, dur * 0.4);
  const end = t + 2;
  v.start(t0); v.end(end);
  return end;
}

// ------------------------------------------------------------------------------------- catalogue
export function periodOf(hour) {
  if (hour >= 5 && hour < 8) return 'dawn';
  if (hour >= 8 && hour < 17) return 'day';
  if (hour >= 17 && hour < 19.5) return 'dusk';
  return 'night';
}

/** Mean seconds between spontaneous calls per species, by period. */
export const ANIMALS = {
  lion:            { synth: lion,            rate: { dawn: 60, day: 240, dusk: 60, night: 45 },  dur: 5.0 },
  elephant:        { synth: elephant,        rate: { dawn: 90, day: 70, dusk: 90, night: 120 },  dur: 3.2 },
  elephant_rumble: { synth: elephant_rumble, rate: { dawn: 120, day: 120, dusk: 90, night: 90 }, dur: 5.0 },
  zebra:           { synth: zebra,           rate: { dawn: 60, day: 40, dusk: 60, night: 200 },  dur: 3.5 },
  hyena:           { synth: hyena,           rate: { dawn: 90, day: 400, dusk: 90, night: 50 },  dur: 6.0 },
  wildebeest:      { synth: wildebeest,      rate: { dawn: 60, day: 35, dusk: 60, night: 150 },  dur: 2.5 },
  hippo:           { synth: hippo,           rate: { dawn: 60, day: 200, dusk: 45, night: 60 },  dur: 3.5 },
  ostrich:         { synth: ostrich,         rate: { dawn: 80, day: 200, dusk: 80, night: 300 }, dur: 3.0 },
};

/** Bird species with a relative weight per period (0 = never). */
export const BIRDS = {
  dove:       { synth: dove,       w: { dawn: 3, day: 3, dusk: 2, night: 0 },     dur: 3.0 },
  tinkerbird: { synth: tinkerbird, w: { dawn: 2, day: 2.5, dusk: 1, night: 0 },   dur: 4.5 },
  warbler:    { synth: warbler,    w: { dawn: 3, day: 2, dusk: 1, night: 0 },     dur: 1.5 },
  goaway:     { synth: goaway,     w: { dawn: 1.5, day: 2, dusk: 1.5, night: 0 }, dur: 1.0 },
  hornbill:   { synth: hornbill,   w: { dawn: 1.5, day: 1, dusk: 1, night: 0 },   dur: 2.0 },
  nightjar:   { synth: nightjar,   w: { dawn: 0.5, day: 0, dusk: 2, night: 1 },   dur: 1.8 },
};

export const OTHER = { thunder: { synth: thunder, dur: 9 }, peep: { synth: peep, dur: 0.3 } };
