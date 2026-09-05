// Showcase presets + stage(). The canvas part of the showcase is a set of expanding rings at the
// position of every triggered sound (colour = bus) so the headless canvas capture shows activity;
// the DOM analyser panel (panel.js) shows the meters, spectrum, layer mix and event log.
import * as THREE from 'three';

export const presets = {
  overview: { camera: { target: [0, 0], distance: 400, pitch: 40, yaw: 35 }, tod: 15, description: 'Afternoon savannah mix: gusting wind, grass rustle, doves/tinkerbirds/warblers, spontaneous zebra, wildebeest and elephant calls 60–320 m away' },
  close:    { camera: { target: [0, 0], distance: 60, pitch: 20, yaw: 60 }, tod: 16.5, description: 'Animal-call burst: all eight species cycling every 2.5 s at 15–40 m around the camera target' },
  night:    { camera: { target: [0, 0], distance: 120, pitch: 25, yaw: 120 }, tod: 22, description: 'Night at a waterhole: cricket chorus, frogs and reed-frog peeps, lion roars, hyena whoops, hippo grunts' },
  storm:    { camera: { target: [0, 0], distance: 200, pitch: 30, yaw: 200 }, tod: 17, description: 'Storm: heavy rain (wash + drop patter), 14 m/s gusting wind, thunder every 6–18 s' },
};

const RING_COLORS = { animals: 0xffa040, ambience: 0x7fd0ff, vehicles: 0xc0c8d0, ui: 0xffffff };

/** Pool of expanding rings that mark where sounds were triggered. */
export class Markers {
  constructor(ctx, group) {
    this.ctx = ctx; this.group = group;
    this.pool = [];
    const geo = new THREE.RingGeometry(0.82, 1, 48);
    geo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 12; i++) {
      const mat = ctx.materials.standard({ color: 0xffa040, emissive: 0xffa040, emissiveIntensity: 1.2, transparent: true, opacity: 0, roughness: 1, depthWrite: false, side: THREE.DoubleSide });
      const m = new THREE.Mesh(geo, mat);
      m.visible = false; m.frustumCulled = false;
      group.add(m);
      this.pool.push({ m, age: 99, max: 2, r: 20 });
    }
    this.geo = geo;
    this.next = 0;
  }

  spawn(x, y, z, bus, radius) {
    const p = this.pool[this.next]; this.next = (this.next + 1) % this.pool.length;
    p.age = 0; p.max = 2.2; p.r = radius;
    p.m.position.set(x, y + 0.15, z);
    p.m.material.color.setHex(RING_COLORS[bus] || 0xffffff);
    p.m.material.emissive.setHex(RING_COLORS[bus] || 0xffffff);
    p.m.visible = true;
  }

  update(dt, engine) {
    // events whose scheduled audio time has arrived → rings
    if (engine && engine.ac) {
      const now = engine.ac.currentTime, E = engine.events;
      for (let i = 0; i < E.length; i++) {
        const ev = E[i];
        if (ev.marked || ev.t > now + 0.3) continue;
        ev.marked = true;
        if (ev.bus === 'ui') continue;
        const radius = ev.bus === 'animals' ? 18 + Math.min(40, ev.dist * 0.08) : ev.sound === 'thunder' ? 120 : 8;
        this.spawn(ev.x, ev.sound === 'thunder' ? this.ctx.world.getHeight(ev.x, ev.z) : ev.y, ev.z, ev.bus, radius);
      }
    }
    for (const p of this.pool) {
      if (!p.m.visible) continue;
      p.age += dt;
      const t = p.age / p.max;
      if (t >= 1) { p.m.visible = false; continue; }
      const s = 1 + p.r * t;
      p.m.scale.set(s, 1, s);
      p.m.material.opacity = (1 - t) * (1 - t);
    }
  }

  dispose() {
    for (const p of this.pool) { p.m.removeFromParent(); this.ctx.materials.untrack(p.m.material); p.m.material.dispose(); }
    this.geo.dispose();
  }
}

/** Burst scripts: sounds fired at fixed offsets (seconds after staging) at a bearing/distance from the target. */
const SPECIES = ['lion', 'elephant', 'zebra', 'hyena', 'wildebeest', 'hippo', 'ostrich', 'elephant_rumble'];
export function burstFor(preset) {
  switch (preset) {
    case 'close': {
      const items = SPECIES.map((s, i) => ({ at: 1 + i * 2.5, sound: s, d: 15 + (i % 4) * 8, bearing: (i * 45 + 20) * Math.PI / 180 }));
      return { items, loop: true, period: 1 + SPECIES.length * 2.5 };
    }
    case 'night':
      return { items: [
        { at: 1.5, sound: 'lion', d: 150, bearing: 0.6 }, { at: 7, sound: 'hyena', d: 200, bearing: 2.4 },
        { at: 14, sound: 'hippo', d: 80, bearing: 4.0 }, { at: 21, sound: 'lion', d: 260, bearing: 3.4 },
        { at: 28, sound: 'elephant_rumble', d: 120, bearing: 1.5 }, { at: 34, sound: 'hyena', d: 170, bearing: 5.2 },
      ], loop: true, period: 42 };
    case 'storm':
      return { items: [{ at: 1, sound: 'thunder', dist: 0.25 }, { at: 5, sound: 'elephant', d: 180, bearing: 1.1 }, { at: 12, sound: 'thunder', dist: 0.7 }, { at: 20, sound: 'wildebeest', d: 120, bearing: 4.4 }], loop: true, period: 30 };
    default:
      return { items: [{ at: 1.5, sound: 'zebra', d: 120, bearing: 0.9 }, { at: 7, sound: 'wildebeest', d: 90, bearing: 2.8 }, { at: 14, sound: 'elephant', d: 220, bearing: 4.6 }, { at: 22, sound: 'ostrich', d: 160, bearing: 1.9 }], loop: true, period: 30 };
  }
}

/** Per-preset engine hints (weather override / water / spontaneous-call boosts). */
export function hintsFor(preset) {
  switch (preset) {
    case 'night': return { hint: { water: 1, storm: false, weather: null }, boost: { lion: 6, hyena: 5, hippo: 3, elephant_rumble: 2 } };
    case 'storm': return { hint: { water: 0.2, storm: true, weather: { cloud: 1, rain: 0.9, wind: { x: 1, z: 0.3, speed: 14 }, temperature: 20, season: 'wet', haze: 0.8 } }, boost: {} };
    case 'close': return { hint: { water: null, storm: false, weather: null }, boost: {} };
    default: return { hint: { water: null, storm: false, weather: null }, boost: { zebra: 2, wildebeest: 2, elephant: 2 } };
  }
}
