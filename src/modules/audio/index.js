// audio — fully synthesised WebAudio savannah ambience, animal calls, vehicle and UI sounds.
// See README.md for the API and the synthesis notes.
import * as THREE from 'three';
import { AudioEngine } from './engine.js';
import { presets, Markers, burstFor, hintsFor } from './showcase.js';
import { Panel } from './panel.js';
import { ANIMALS, BIRDS } from './calls.js';
import { UI } from './ui.js';
import { LAYER_NAMES } from './ambience.js';
import { BUS_NAMES } from './buses.js';

let ctx = null, engine = null, group = null;
const EMPTY5 = new Float32Array(5).fill(-90), EMPTY7 = new Float32Array(7);
const show = { panel: null, markers: null, burst: null, burstBase: -1, burstIdx: 0 };
const eco = { lastCash: -Infinity, cashAt: -Infinity };

function onGesture() { if (engine && !engine.running) engine.start(); }

const api = {
  /** true once the AudioContext exists and is running (after the first pointerdown/keydown). */
  isRunning: () => !!engine && engine.running,
  /** 'idle' | 'suspended' | 'running' | 'closed' | 'unavailable' */
  state: () => (engine ? engine.state : 'idle'),
  /** Try to create/resume the context now (call from a user gesture). Resolves to isRunning(). */
  start: () => (engine ? engine.start() : Promise.resolve(false)),
  /** play(sound, {x, z, y?, gain?, dist?}) → boolean. Positions in metres; omitted → camera target. */
  play: (sound, o) => !!engine && engine.play(sound, o || {}),
  /** Names accepted by play(). */
  list: () => [...Object.keys(ANIMALS), ...Object.keys(BIRDS), 'thunder', ...Object.keys(UI)],
  /** Override the automatic listener for 0.5 s: pos/forward/up are {x,y,z}. */
  setListener: (pos, forward, up) => {
    if (!engine || !engine.listener) return false;
    engine.manualListenerUntil = engine.ac.currentTime + 0.5;
    engine.listener.set(pos.x, pos.y, pos.z, forward.x, forward.y, forward.z, up ? up.x : 0, up ? up.y : 1, up ? up.z : 0);
    return true;
  },
  /** setVolume('master'|'ambience'|'animals'|'vehicles'|'ui', 0..2). Remembered if the context does not exist yet. */
  setVolume: (bus, v) => { if (!engine) return false; if (engine.buses) return engine.buses.setVolume(bus, v); if (BUS_NAMES.includes(bus)) { engine.pendingVolumes[bus] = v; return true; } return false; },
  getVolume: (bus) => (engine && engine.buses ? engine.buses.getVolume(bus) : engine ? engine.pendingVolumes[bus] ?? null : null),
  mute: (on) => { engine && engine.buses && engine.buses.mute(on); },
  /** engine(id, {x, z, rpm, load?}) creates/updates a looping vehicle engine; engine(id, null) stops it. */
  engine: (id, p) => !!engine && engine.engine(id, p),
  engineStop: (id) => !!engine && engine.engine(id, null),
  /** Offline-render every sound → { sound: rmsDb }. Details in lastSelfTest(). Works without a live context. */
  selfTest: () => (engine ? engine.selfTest() : Promise.resolve({})),
  lastSelfTest: () => (engine ? engine.lastSelfTest : null),
  /** Float32Array of rms dBFS per bus in BUS_NAMES order (live object, do not mutate). */
  getLevels: () => (engine && engine.buses ? engine.buses.levels : EMPTY5),
  /** Float32Array of smoothed 0..1 levels per ambience layer in LAYER_NAMES order. */
  getLayers: () => (engine && engine.ambience ? engine.ambience.levels : EMPTY7),
  /** Last 12 triggered sounds, newest first: [{sound, x, z, dist, t, bus}]. */
  getLog: () => (engine ? engine.recentEvents() : []),
  /** setHint({water: 0..1|null, storm: bool, weather: {…}|null}) — overrides used by the showcase. */
  setHint: (h) => { if (engine && h) Object.assign(engine.hint, h); },
  buses: BUS_NAMES,
  layers: LAYER_NAMES,
};

export default {
  id: 'audio',
  version: 1,
  dependencies: [],
  optional: ['animals', 'environment'],
  api,

  async init(c) {
    ctx = c;
    group = new THREE.Group(); group.name = 'audio';
    ctx.scene.add(group);
    engine = new AudioEngine(ctx);

    window.addEventListener('pointerdown', onGesture, { passive: true });
    window.addEventListener('keydown', onGesture, { passive: true });

    const ev = ctx.events;
    ev.on('audio:play', (p) => { if (p && p.sound) engine.play(p.sound, p); });
    ev.on('ui:notify', (p) => {
      const lvl = p && p.level;
      engine.play(lvl === 'error' ? 'error' : 'chime', { low: lvl === 'warn' });
    });
    ev.on('economy:updated', (p) => {
      if (!p || !engine.ac) return;
      const now = engine.ac.currentTime;
      if ((p.income || 0) > 0 && p.cash > eco.lastCash && now - eco.cashAt > 2) { engine.play('cash'); eco.cashAt = now; }
      eco.lastCash = p.cash ?? eco.lastCash;
    });
    ev.on('time:set', () => engine.onTimeSet());
    ev.on('weather:changed', () => { /* read live from world.weather each frame; nothing to cache */ });
    ev.on('tool:selected', () => engine.play('click'));
    ev.on('building:placed', (p) => {
      const b = p && ctx.world.buildings.get(p.id);
      engine.play('place', b ? { x: b.x, z: b.z } : {});
    });
    ev.on('animal:state', (p) => {
      if (!p) return;
      const st = String(p.state || '');
      if (!/call|roar|trumpet|bark|whoop|vocal|alarm|hunt|fight|rumble/i.test(st)) return;
      const a = ctx.world.animals.get(p.id);
      const sp = p.species || (a && a.species);
      if (sp && ANIMALS[sp]) engine.play(sp, a ? { x: a.x, z: a.z } : {});
    });
    ev.on('vehicle:despawned', (p) => { if (p && p.id !== undefined) engine.engine(p.id, null); });
  },

  update(dt) {
    if (!engine) return;
    engine.update(dt);
    if (!ctx.isShowcase) return;
    // showcase burst script, scheduled on the audio clock within the engine's lookahead window
    const b = show.burst;
    if (b && engine.running) {
      const now = engine.ac.currentTime, horizon = now + engine.lookahead, e = engine.env;
      if (show.burstBase < 0) show.burstBase = now + 0.5;
      for (let guard = 0; guard < 64; guard++) {
        const it = b.items[show.burstIdx], tAbs = show.burstBase + it.at;
        if (tAbs >= horizon) break;
        if (tAbs >= now - 1) {
          const at = Math.max(tAbs, now + 0.02);
          if (it.sound === 'thunder') engine.play('thunder', { dist: it.dist, at });
          else engine.play(it.sound, { x: e.tx + Math.sin(it.bearing) * it.d, z: e.tz + Math.cos(it.bearing) * it.d, gain: 1, at });
        }
        if (++show.burstIdx >= b.items.length) {
          if (!b.loop) { show.burst = null; break; }
          show.burstIdx = 0; show.burstBase += b.period;
        }
      }
    }
    show.markers?.update(dt, engine);
  },

  tick() {},

  dispose() {
    window.removeEventListener('pointerdown', onGesture);
    window.removeEventListener('keydown', onGesture);
    show.panel?.dispose(); show.panel = null;
    show.markers?.dispose(); show.markers = null;
    show.burst = null;
    engine?.dispose(); engine = null;
    group?.removeFromParent(); group = null;
  },

  showcase: {
    presets,
    async stage(c, preset) {
      if (!show.markers) show.markers = new Markers(c, group);
      if (!show.panel) show.panel = new Panel(engine, c);
      const { hint, boost } = hintsFor(preset);
      Object.assign(engine.hint, hint);
      engine.wildBoost = boost;
      engine.onTimeSet();
      show.burst = burstFor(preset);
      show.burstBase = -1; show.burstIdx = 0;
      // Auto-start if the autoplay policy allows it (headless --autoplay-policy=no-user-gesture-required);
      // otherwise the panel shows "click to start" and the first pointerdown/keydown resumes it.
      await engine.start();
      c.log.info(`audio showcase "${preset}" staged; context ${engine.state}`);
    },
  },
};
