// AudioEngine: owns the AudioContext (created lazily, resumed on the first user gesture), the
// buses, the listener ("virtual ear"), the ambience, one-shot voices, vehicle engines, the
// spontaneous-call scheduler, the event log and selfTest().
import * as THREE from 'three';
import { Buses } from './buses.js';
import { Listener, spatialize } from './spatial.js';
import { Ambience, LAYER_FACTORIES } from './ambience.js';
import { ANIMALS, BIRDS, OTHER, periodOf } from './calls.js';
import { UI, EngineVoice } from './ui.js';
import { analyseBuffer, gain, clamp } from './dsp.js';

const LOG_SIZE = 12;
const _v = new THREE.Vector3(), _f = new THREE.Vector3(), _u = new THREE.Vector3();

export class AudioEngine {
  constructor(ctx) {
    this.ctx = ctx; this.world = ctx.world; this.log = ctx.log;
    this.rng = ctx.rng.fork('engine');
    this.ac = null; this.buses = null; this.listener = null; this.ambience = null;
    this.state = 'idle';           // idle | suspended | running | closed
    this.startError = null;
    this.pendingVolumes = {};
    this.active = [];              // one-shot chains awaiting disposal: {s, end}
    this.engines = new Map();      // id → { voice, s, x, y, z }
    this.hint = { water: null, storm: false, weather: null };
    this.wildBoost = {};           // species → rate multiplier (showcase)
    this.nextWild = {}; for (const k in ANIMALS) this.nextWild[k] = -1;
    this.events = []; for (let i = 0; i < LOG_SIZE; i++) this.events.push({ sound: '', x: 0, y: 0, z: 0, dist: 0, t: 0, bus: '', seq: 0, marked: true });
    this.eventHead = 0; this.eventCount = 0; this.eventSeq = 0;
    this.env = { hour: 12, windSpeed: 3, rain: 0, cloud: 0, storm: false, water: 0, temperature: 28, tx: 0, ty: 0, tz: 0 };
    this.water = 0; this._lastWater = -1; this._lastEngineRefresh = 0;
    this.stats = { voices: 0, played: 0 };
    this.manualListenerUntil = -1;
    this.lastSelfTest = null;
    this.lastNow = -1;
    this.lookahead = 1;            // seconds of audio-clock scheduling ahead of now (adaptive)
    this.frameGap = 0;
  }

  get running() { return !!this.ac && this.ac.state === 'running'; }

  /** Create the context if needed and try to resume it. Never throws. */
  async start() {
    if (this.state === 'closed') return false;
    if (!this.ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { this.startError = 'WebAudio unavailable'; this.state = 'unavailable'; return false; }
      try {
        this.ac = new AC({ latencyHint: 'interactive' });
      } catch (e) {
        this.startError = String(e?.message || e); this.state = 'unavailable';
        this.log.warn('AudioContext could not be created:', this.startError);
        return false;
      }
      this.ac.onstatechange = () => { if (this.state !== 'closed') this.state = this.ac.state; };
      try { this._build(); } catch (e) { this.log.error('audio graph build failed', e); }
    }
    if (this.ac.state !== 'running') { try { await this.ac.resume(); } catch { /* needs a user gesture */ } }
    this.state = this.ac.state;
    return this.ac.state === 'running';
  }

  _build() {
    const ac = this.ac;
    this.buses = new Buses(ac, this.rng);
    for (const k in this.pendingVolumes) this.buses.setVolume(k, this.pendingVolumes[k]);
    this.listener = new Listener(ac);
    this.ambience = new Ambience(ac, this.buses, this.rng, this.ctx.noise, this.listener);
    this.ambience.onEvent = (name, x, y, z, bus, end, dist, at) => this._logEvent(name, x, y, z, bus, dist, at);
  }

  // ---------------------------------------------------------------------------------- per frame
  update(dt) {
    if (!this.ac) return;
    const now = this.ac.currentTime;
    this.buses.meter(dt);
    if (this.ac.state !== 'running') return;
    // Adaptive lookahead: schedule 2.5× the last frame gap ahead (1–20 s) so slow frames never starve the mix.
    this.frameGap = this.lastNow < 0 ? 0 : now - this.lastNow;
    this.lastNow = now;
    this.lookahead = clamp(this.frameGap * 2.5, 1.5, 20);
    this._updateEnv(now);
    if (now > this.manualListenerUntil) this._autoListener();
    this.ambience.update(dt, now, this.env, this.lookahead);
    this._wild(now);
    if (this.engines.size && now - this._lastEngineRefresh > 0.25) {
      this._lastEngineRefresh = now;
      for (const rec of this.engines.values()) rec.s.setPosition(rec.x, rec.y, rec.z);
    }
    const A = this.active;
    for (let i = A.length - 1; i >= 0; i--) {
      if (now > A[i].end + 0.3) { A[i].s.dispose ? A[i].s.dispose() : A[i].s.disconnect(); A[i] = A[A.length - 1]; A.pop(); }
    }
    this.stats.voices = A.length + this.ambience.active.length + this.engines.size;
  }

  _updateEnv(now) {
    const w = this.world, e = this.env, wo = this.hint.weather || w.weather;
    e.hour = w.time.hour;
    e.windSpeed = wo.wind ? (wo.wind.speed ?? 3) : 3;
    e.rain = wo.rain || 0; e.cloud = wo.cloud || 0;
    e.storm = !!(this.hint.storm || wo.storm);
    e.temperature = wo.temperature ?? 26;
    const t = this.ctx.rig.target;
    e.tx = t.x; e.tz = t.z; e.ty = w.getHeight(t.x, t.z);
    if (now - this._lastWater > 0.5) {
      this._lastWater = now;
      this.water = this.hint.water !== null && this.hint.water !== undefined ? this.hint.water : this._sampleWater(e.tx, e.tz);
    }
    e.water = this.water;
  }

  /** Fraction of a 30 m / 90 m ring around the camera target that is water. */
  _sampleWater(x, z) {
    const w = this.world; let near = 0, far = 0;
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4, s = Math.sin(a), c = Math.cos(a);
      if (w.isWater(x + s * 30, z + c * 30)) near++;
      if (w.isWater(x + s * 90, z + c * 90)) far++;
    }
    if (w.isWater(x, z)) near += 2;
    return clamp(near / 4 + far / 10, 0, 1);
  }

  /**
   * Virtual ear: the camera in this game sits 40–900 m above the ground target, so a literal
   * listener would hear nothing. The ear sits on the camera→target line, 40 m + 15 % of the
   * remaining distance from the target, facing the way the camera faces.
   */
  _autoListener() {
    const cam = this.ctx.camera, tgt = this.ctx.rig.target;
    _v.copy(cam.position).sub(tgt);
    const dist = _v.length() || 1;
    _v.multiplyScalar(1 / dist);
    const ear = Math.min(dist, 40) + Math.max(0, dist - 40) * 0.15;
    cam.getWorldDirection(_f);
    _u.set(0, 1, 0).applyQuaternion(cam.quaternion);
    this.listener.set(tgt.x + _v.x * ear, tgt.y + _v.y * ear, tgt.z + _v.z * ear, _f.x, _f.y, _f.z, _u.x, _u.y, _u.z);
  }

  // --------------------------------------------------------------------------- spontaneous calls
  _wild(now) {
    const p = periodOf(this.env.hour), horizon = now + this.lookahead;
    for (const name in ANIMALS) {
      let nt = this.nextWild[name];
      if (nt < 0) nt = now + this._wildInterval(name, p);
      if (nt < now - 1) nt = now + this.rng.float() * 2; // missed while throttled: do not bunch
      while (nt < horizon) { this._playWild(name, Math.max(nt, now + 0.02)); nt += this._wildInterval(name, p); }
      this.nextWild[name] = nt;
    }
  }
  _wildInterval(name, p) {
    const mean = ANIMALS[name].rate[p] / (this.wildBoost[name] || 1);
    return clamp(-Math.log(1 - this.rng.float()) * mean, mean * 0.15, mean * 4);
  }
  _playWild(name, at) {
    const e = this.env; let x = 0, z = 0, found = false;
    if (this.world.animals.size) {
      // reservoir-sample one real animal of the species when the animals module is populated
      const species = name === 'elephant_rumble' ? 'elephant' : name; let n = 0;
      for (const a of this.world.animals.values()) {
        if (a.species === species) { n++; if (this.rng.float() < 1 / n) { x = a.x; z = a.z; found = true; } }
      }
    }
    if (!found) { const b = this.rng.range(0, Math.PI * 2), d = this.rng.range(60, 320); x = e.tx + Math.sin(b) * d; z = e.tz + Math.cos(b) * d; }
    this.play(name, { x, z, gain: 1, at });
  }

  /** Reset the schedulers after a time jump (time:set) so the mix reflects the new hour at once. */
  onTimeSet() {
    for (const k in this.nextWild) this.nextWild[k] = -1;
    this.ambience?.snap();
  }

  // ------------------------------------------------------------------------------------ one-shots
  /** play(sound, {x, z, y?, gain?, at?, dist?, low?}) — `at` is an absolute audio-clock time (default: now). */
  play(sound, o = {}) {
    if (!this.running) return false;
    const ac = this.ac, now = ac.currentTime;
    const t0 = o.at !== undefined ? Math.max(o.at, now + 0.01) : now + 0.02;
    const g = clamp(o.gain ?? 1, 0, 4);
    let def, bus;
    if (ANIMALS[sound]) { def = ANIMALS[sound]; bus = 'animals'; }
    else if (BIRDS[sound]) { def = BIRDS[sound]; bus = 'ambience'; }
    else if (UI[sound]) { def = UI[sound]; bus = 'ui'; }
    else if (sound === 'thunder') { this.ambience.thunder(t0, this.env, o.dist); this.stats.played++; return true; }
    else { this.log.warn(`unknown sound "${sound}"`); return false; }
    this.stats.played++;
    if (bus === 'ui') {
      const gg = gain(ac, g); gg.connect(this.buses.bus.ui);
      const end = def.synth(ac, gg, t0, this.rng, o);
      this.active.push({ s: gg, end });
      this._logEvent(sound, 0, 0, 0, 'ui', 0, t0);
      return true;
    }
    const e = this.env;
    const x = o.x ?? e.tx, z = o.z ?? e.tz;
    const y = o.y ?? (this.world.getHeight(x, z) + (bus === 'ambience' ? 4 : 1.2));
    const dest = bus === 'animals' ? this.buses.bus.animals : this.ambience.birdsOut;
    const s = spatialize(ac, dest, this.buses.reverb, this.listener, x, y, z, bus === 'animals' ? { ref: 25, rolloff: 0.85 } : { ref: 15, rolloff: 1 });
    s.input.gain.value = g;
    const end = def.synth(ac, s.input, t0, this.rng, o);
    this.active.push({ s, end });
    this._logEvent(sound, x, y, z, bus, s.distance, t0);
    return true;
  }

  // -------------------------------------------------------------------------------------- engines
  engine(id, p) {
    if (!this.running) return false;
    const ac = this.ac;
    let rec = this.engines.get(id);
    if (p === null || p === undefined || p === false) {
      if (rec) { rec.voice.stop(); this.active.push({ s: rec.s, end: ac.currentTime + 0.8 }); this.engines.delete(id); }
      return true;
    }
    const x = p.x ?? 0, z = p.z ?? 0, y = p.y ?? this.world.getHeight(x, z) + 1;
    if (!rec) {
      const s = spatialize(ac, this.buses.bus.vehicles, this.buses.reverb, this.listener, x, y, z, { ref: 12, rolloff: 1 });
      const voice = new EngineVoice(ac, s.input, this.rng, p.rpm ?? 900);
      rec = { voice, s, x, y, z };
      this.engines.set(id, rec);
      this._logEvent('engine:' + id, x, y, z, 'vehicles', s.distance, ac.currentTime);
    } else if (x !== rec.x || z !== rec.z || y !== rec.y) { rec.x = x; rec.y = y; rec.z = z; rec.s.setPosition(x, y, z); }
    rec.voice.set({ rpm: p.rpm ?? rec.voice.rpm, load: p.load ?? 0.5 });
    return true;
  }

  // ------------------------------------------------------------------------------------ event log
  _logEvent(sound, x, y, z, bus, dist, at) {
    const e = this.events[this.eventHead];
    e.sound = sound; e.x = x; e.y = y; e.z = z; e.bus = bus; e.dist = dist; e.t = at; e.seq = ++this.eventSeq; e.marked = false;
    this.eventHead = (this.eventHead + 1) % LOG_SIZE;
    if (this.eventCount < LOG_SIZE) this.eventCount++;
  }
  /** Newest first (allocates; for UI / debugging, not per-frame). */
  recentEvents() {
    const out = [];
    for (let i = 0; i < this.eventCount; i++) {
      const e = this.events[(this.eventHead - 1 - i + LOG_SIZE) % LOG_SIZE];
      out.push({ sound: e.sound, x: +e.x.toFixed(1), z: +e.z.toFixed(1), dist: +e.dist.toFixed(1), t: +e.t.toFixed(2), bus: e.bus });
    }
    return out;
  }

  // ------------------------------------------------------------------------------------- selfTest
  /**
   * Render every sound into an OfflineAudioContext (no buses, no compressor, no spatialisation
   * except the two labelled distance probes) and return { sound: rmsDb }. Details (peak, zero-
   * crossing estimate, seconds) are kept in `lastSelfTest`. Runs without a live context.
   */
  async selfTest() {
    const sr = 44100;
    const OC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OC) return {};
    const base = this.ctx.rng.fork('selftest');
    const items = [];
    for (const n in ANIMALS) items.push({ name: n, dur: ANIMALS[n].dur, run: (oc, dest, r) => ANIMALS[n].synth(oc, dest, 0.05, r, {}) });
    for (const n in BIRDS) items.push({ name: n, dur: BIRDS[n].dur, run: (oc, dest, r) => BIRDS[n].synth(oc, dest, 0.05, r, {}) });
    items.push({ name: 'thunder', dur: 9, run: (oc, dest, r) => OTHER.thunder.synth(oc, dest, 0.05, r, { dist: 0.3 }) });
    for (const n in UI) items.push({ name: 'ui_' + n, dur: UI[n].dur, run: (oc, dest, r) => UI[n].synth(oc, dest, 0.05, r, {}) });
    items.push({ name: 'engine_idle', dur: 1.5, run: (oc, dest, r) => { const v = new EngineVoice(oc, dest, r, 900); v.out.gain.value = 1; return 1.5; } });
    items.push({ name: 'engine_rev', dur: 1.5, run: (oc, dest, r) => { const v = new EngineVoice(oc, dest, r, 3200); v.out.gain.value = 1; return 1.5; } });
    for (const n in LAYER_FACTORIES) {
      items.push({ name: 'amb_' + n, dur: 2.5, run: (oc, dest, r) => {
        const l = LAYER_FACTORIES[n](oc, dest, r);
        if (n === 'wind' || n === 'grass') l.set(0.7, 1, 0, 0.002); else l.set(1, 0, 0.002);
        return 2.5;
      } });
    }
    for (const d of [10, 400]) {
      items.push({ name: `lion@${d}m`, dur: 5, run: (oc, dest, r) => {
        const L = new Listener(oc); L.set(0, 2, 0, 0, 0, -1, 0, 1, 0);
        const s = spatialize(oc, dest, null, L, d, 1, 0, { ref: 25, rolloff: 0.85 });
        return ANIMALS.lion.synth(oc, s.input, 0.05, r, {});
      } });
    }
    const out = {}, detail = {};
    const t0 = performance.now();
    for (const it of items) {
      try {
        const oc = new OC(2, Math.ceil(sr * (it.dur + 0.2)), sr);
        const dest = gain(oc, 1); dest.connect(oc.destination);
        it.run(oc, dest, base.fork(it.name));
        const buf = await oc.startRendering();
        const a = analyseBuffer(buf);
        out[it.name] = a.rmsDb; detail[it.name] = a;
      } catch (e) {
        out[it.name] = null; detail[it.name] = { error: String(e?.message || e) };
        this.log.warn(`selfTest ${it.name} failed: ${e?.message || e}`);
      }
    }
    this.lastSelfTest = { at: Date.now(), ms: Math.round(performance.now() - t0), sampleRate: sr, detail };
    return out;
  }

  dispose() {
    this.state = 'closed';
    for (const rec of this.engines.values()) { try { rec.voice.stop(); rec.s.dispose(); } catch { /* ignore */ } }
    this.engines.clear();
    for (const a of this.active) { try { a.s.dispose ? a.s.dispose() : a.s.disconnect(); } catch { /* ignore */ } }
    this.active.length = 0;
    try { this.ambience?.dispose(); this.buses?.dispose(); } catch { /* ignore */ }
    if (this.ac) { try { this.ac.close(); } catch { /* ignore */ } }
    this.ac = null; this.ambience = null; this.buses = null; this.listener = null;
  }
}
