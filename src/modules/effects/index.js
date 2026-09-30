// effects — post-processing pipeline (GTAO, bloom, colour grade, vignette/grain, AA), heat haze,
// GPU dust particles and generic emitters. See README.md for the API.
import * as THREE from 'three';
import { Pipeline } from './pipeline.js';
import { Particles } from './particles.js';
import { HeatHaze } from './heatHaze.js';
import { presets, stage, updateStage, disposeStage } from './showcase.js';
import { hourToSunElevation, hourToSunAzimuth, clamp, smoothstep } from '../../core/Units.js';

let ctx = null, group = null, pipeline = null, particles = null, haze = null;

const S = {
  sunDir: new THREE.Vector3(0, 1, 0),
  sunColor: new THREE.Color(1, 1, 1),      // normalised-ish colour of the sun
  sunRadiance: new THREE.Color(1, 1, 1),   // colour × intensity for particle lighting
  ambient: new THREE.Color(0.3, 0.35, 0.45),
  sunUp: 0,
  nightFloor: 0,
  fallbackSun: null, fallbackHemi: null, fallbackLooked: false,
  ambientDust: -1,   // -1 = automatic (golden hour, dry, calm)
  ambientAlpha: 0,
  target: new THREE.Vector3(),
  lightIn: null,
};

function computeSun() {
  const hour = ctx.world.time.hour;
  const env = ctx.modules.get('environment');
  if (!env) S.nightFloor = 0; // no environment → no moon floor (fallback lighting is always day-lit)
  let haveDir = false, haveCol = false;
  if (env) {
    try {
      // environment's getters take an `out` (zero-alloc); tolerate implementations that return a fresh value instead
      const c = env.getSunColor?.(S.sunColor);
      if (c && c.isColor) { if (c !== S.sunColor) S.sunColor.copy(c); haveCol = true; }
      else if (typeof c === 'number') { S.sunColor.set(c); haveCol = true; }
      const d = env.getSunDirection?.(S.sunDir);
      if (d && d.isVector3) { if (d !== S.sunDir) S.sunDir.copy(d); S.sunDir.normalize(); haveDir = true; }
      const nf = env.getNightFloor?.();
      if (typeof nf === 'number') S.nightFloor = nf;
    } catch { /* environment API is optional */ }
  } else if (!S.fallbackLooked) {
    S.fallbackSun = ctx.scene.getObjectByName('fallback-sun') || null;
    S.fallbackHemi = S.fallbackSun ? S.fallbackSun.parent?.children.find((o) => o.isHemisphereLight) || null : null;
    S.fallbackLooked = true;
  }
  if (!haveDir) {
    if (S.fallbackSun) S.sunDir.copy(S.fallbackSun.position).normalize();
    else {
      const el = hourToSunElevation(hour), az = hourToSunAzimuth(hour);
      S.sunDir.set(Math.cos(az) * Math.cos(el), Math.sin(el), -Math.sin(az) * Math.cos(el)).normalize();
    }
  }
  S.sunUp = Math.max(0, S.sunDir.y);
  if (!haveCol) {
    if (S.fallbackSun) S.sunColor.copy(S.fallbackSun.color);
    else S.sunColor.setHSL(0.09, 0.5, 0.5 + 0.5 * Math.min(1, S.sunUp * 3));
  }
  S.sunRadiance.copy(S.sunColor).multiplyScalar(3.2 * S.sunUp);
  const amb = 0.12 + 1.1 * S.sunUp;
  S.ambient.setRGB(0.55 * amb * 0.5, 0.65 * amb * 0.5, 0.85 * amb * 0.5);
}

/** Wave P2: pin flame + smoke emitters to burning vegetation cells (world.vegetation.burn). Scans the
 * 64² uint8 burn grid every 3rd frame: counts the front, keeps up to 16 emitter positions and the
 * front centroid for the glow light. Flames scale with the front (1.2 -> 2.2 m); smoke is a tall
 * buoyant column (life 9 s, size 2.4) visible at 160 m by day. A single orange PointLight rides the
 * front centroid as the night glow. Emitters idle and the light drops to 0 when the front dies. */
const FIRE_EMITTERS = 16;
/** Wave P5 locust swarms: one particle emitter per swarm (≤ 4 live), rate following density. The
 * emitter's position roams the swarm's disc every frame (a Lissajous sweep) so the cloud paints the
 * whole area instead of a column. Reads world.locusts only — simulation owns the writes. */
function updateLocustSwarms(t) {
  const w = ctx.world;
  if (!w.locusts || !particles) return;
  if (S.locustEmitters === undefined) { S.locustEmitters = []; S.locustSeen = -1; }
  const swarms = w.locusts.swarms;
  if (swarms.length > S.locustEmitters.length) {
    while (S.locustEmitters.length < Math.min(swarms.length, 4)) {
      const e = particles.emitter('locust', { rate: 90, size: 0.28, life: 1.6, speed: 2.0, spread: 0.9 });
      if (!e) break;
      S.locustEmitters.push(e);
    }
  }
  for (let i = 0; i < S.locustEmitters.length; i++) {
    const e = S.locustEmitters[i];
    const s = swarms[i];
    if (!s) { e.set({ rate: 0 }); continue; }
    // roam the disc (r*0.6 Lissajous, ~1.2-3.5 m above the ground)
    const ang = t * 0.55 + i * 2.1, r2 = s.radius * 0.6;
    const x = s.x + Math.cos(ang * 1.3) * r2 * 0.7;
    const z = s.z + Math.sin(ang) * r2;
    const y = (ctx.world.getHeight ? ctx.world.getHeight(x, z) : 0) + 2.2 + Math.sin(ang * 2.7) * 1.1;
    e.setPosition(x, y, z);
    e.set({ rate: Math.round(30 + 110 * Math.min(1, s.density)) });
  }
}

function updateFireFront() {
  const veg = ctx.world.vegetation;
  if (!veg?.burn || !particles) return;
  if (S.fireFlames === undefined) {
    S.fireFlames = []; S.fireSmoke = []; S.fireScan = 0; S.fireCursor = 0; S.fireCells = [];
    S.fireGlow = new THREE.PointLight(0xff7a2a, 0, 140, 2);
    S.fireGlow.name = 'fire-glow';
    ctx.scene.add(S.fireGlow);
  }
  S.fireScan = (S.fireScan + 1) % 3;
  if (S.fireScan !== 0) return;
  const r = veg.res, c = veg.cell, half = ctx.world.half ?? ctx.world.size / 2;
  const found = S.fireCells;
  found.length = 0;
  let burning = 0, cx = 0, cz = 0;
  const start = (S.fireCursor = (S.fireCursor + 7) % (r * r));
  for (let k = 0; k < r * r; k++) {
    const i = (start + k) % (r * r);
    if (veg.burn[i] !== 1) continue;
    burning++;
    const iz = (i / r) | 0, ix = i - iz * r;
    if (found.length < FIRE_EMITTERS) found.push([(ix + 0.5) * c - half, (iz + 0.5) * c - half]);
    cx += (ix + 0.5) * c - half; cz += (iz + 0.5) * c - half;
  }
  // flames read at 160 m: a 16 m burning cell is a line of 1-3 m flames; drawn a little larger than
  // life (2.4-3.6 m sprites, fast rise) because one emitter stands in for a whole cell
  const scale = Math.min(1.0, burning / 40);
  const flameSize = 1.3 + scale * 0.6, flameRate = 70 + scale * 30;
  while (S.fireFlames.length < found.length) {
    const fl = particles.emitter('fire', { rate: flameRate, size: flameSize, life: 0.8, speed: 2.2, spread: 0.25 });
    const sm = particles.emitter('firesmoke', { rate: 9, size: 3.0, life: 12, speed: 0.4, spread: 0.2 });
    if (!fl || !sm) break;
    S.fireFlames.push(fl); S.fireSmoke.push(sm);
  }
  const gx = burning ? cx / burning : 0, gz = burning ? cz / burning : 0;
  const gy = burning && ctx.world.getHeight ? ctx.world.getHeight(gx, gz) : 0;
  // physical point light (candela, inverse-square): ~800 cd lights the ground ~30-50 m round the
  // front at night (the old min(4, burning/30) was < 0.001 lux at 20 m: invisible)
  S.fireGlow.position.set(gx, gy + 8, gz);
  S.fireGlow.intensity = burning ? 450 + 350 * Math.min(1, burning / 20) : 0;
  for (let i = 0; i < S.fireFlames.length; i++) {
    const fl = S.fireFlames[i], sm = S.fireSmoke[i];
    if (i < found.length) {
      const x = found[i][0], z = found[i][1];
      const y = (ctx.world.getHeight ? ctx.world.getHeight(x, z) : 0) + 0.4;
      fl.setPosition(x, y, z); fl.set({ rate: flameRate, size: flameSize });
      sm?.setPosition(x, y + 2.5, z); sm?.set({ rate: 9, size: 3.0, life: 12 });
    } else {
      fl.set({ rate: 0 }); sm?.set({ rate: 0 });
    }
  }
}

function autoAmbientDust() {
  // dust hangs in the air at golden hour when it is dry and calm
  const w = ctx.world.weather;
  const golden = smoothstep(0.0, 0.1, S.sunUp) * (1 - smoothstep(0.22, 0.5, S.sunUp));
  const dry = w.season === 'wet' ? 0.5 : 1;
  const rain = 1 - clamp(w.rain ?? 0, 0, 1);
  return golden * dry * rain;
}

const api = {
  /** Toggle a stage: 'pipeline'|'ao'|'bloom'|'haze'|'grade'|'vignette'|'grain'|'aa'|'particles'. Returns false for unknown names. */
  setEnabled(name, on) { return pipeline ? pipeline.setEnabled(name, on) : false; },
  isEnabled(name) { return pipeline ? pipeline.isEnabled(name) : false; },
  /** 'low'|'medium'|'high' — rebuilds the chain. */
  setQuality(q) { return pipeline ? pipeline.setQuality(q) : false; },
  /** AA mode override: 'fxaa'|'smaa'|'none' (default from tier). Rebuilds. */
  setAA(mode) { pipeline?.setAA(mode); },
  /** Bloom implementation: 'mip' (default, 5 draws) or 'unreal' (three's UnrealBloomPass, 13 draws). Rebuilds. */
  setBloomMode(mode) { pipeline?.setBloomMode(mode); },
  /** {exposure, contrast, saturation, warmth, lift, vignette, grain, bloom} — any subset. exposure multiplies in the grade, renderer.toneMappingExposure is untouched. */
  setGrade(g) { pipeline?.setGrade(g); },
  getGrade() { return pipeline ? { ...pipeline.grade } : null; },
  /** {radius (m), intensity 0..1, scale (AO exponent), thickness (m)} */
  setAO(o) { pipeline?.setAO(o); },
  /** {override: -1|0..1, near, far (m), amplitude (px), height (m), tempThreshold, tempRange} */
  setHaze(o = {}) {
    if (!haze) return;
    if (o.override !== undefined) haze.override = o.override;
    for (const k of ['near', 'far', 'amplitude', 'height', 'tempThreshold', 'tempRange']) if (o[k] !== undefined) haze[k] = o[k];
    pipeline?.setHazeParams({ near: haze.near, far: haze.far, amplitude: haze.amplitude, height: haze.height });
  },
  getHazeStrength() { return haze ? haze.strength : 0; },
  /** {threshold, knee} in linear HDR units. */
  setBloom(o) { pipeline?.setBloom(o); },
  /** Ambient dust motes density 0..1, or -1 for automatic (golden hour). */
  setAmbientDust(d) { S.ambientDust = d; },
  /** Dust puff at ground level. amount ≈ 1 per wheel/hoof; dir optional {x,z}. */
  spawnDust(x, z, amount = 1, dir = null) { particles?.spawnDust(x, z, amount, dir); },
  /** Generic emitter: kind 'dust'|'smoke'|'splash'; opts {x,y,z,dir,rate,speed,spread,size,sizeJitter,life,lifeJitter}. Returns a handle {set, setPosition, burst, stop, dispose} or null. */
  emitter(kind, opts) { return particles ? particles.emitter(kind, opts) : null; },
  getComposer() { return pipeline ? pipeline.composer : null; },
  getParticles() { return particles; },
  /** Sun state the module is using ({dir, color, up}) — handy for other modules without environment. */
  getSun() { return { dir: S.sunDir, color: S.sunColor, up: S.sunUp }; },
  /** Render once direct and once through the chain; returns {direct, pipeline, extra, msaa, quality, failed}. */
  measure() { return pipeline ? pipeline.measure(ctx.scene, ctx.camera) : null; },
  stats() {
    return {
      quality: pipeline?.quality, enabled: pipeline ? { ...pipeline.enabled } : null, failed: pipeline ? { ...pipeline.failed } : null,
      msaa: pipeline?.msaaSamples, haze: haze?.strength ?? 0, ambientDust: S.ambientAlpha, particles: particles ? (particles.countAlive(), { ...particles.stats, capacity: particles.capacity }) : null,
      fire: { emitters: S.fireFlames?.length ?? 0, scan: S.fireScan ?? -1, burningCells: ctx?.world?.vegetation?.burn ? [...ctx.world.vegetation.burn].reduce((a, b) => a + (b === 1), 0) : -1 },
    };
  },
};

export default {
  id: 'effects',
  version: 1,
  dependencies: [],
  optional: ['environment'],
  api,

  async init(c) {
    ctx = c;
    group = new THREE.Group(); group.name = 'effects';
    ctx.scene.add(group);
    haze = new HeatHaze();
    try {
      particles = new Particles(ctx, { capacity: ctx.quality === 'low' ? 4096 : 8192, ambientCount: ctx.quality === 'low' ? 800 : 2500 });
    } catch (err) {
      ctx.log.error('particles failed to build:', err);
      particles = null;
    }
    try {
      pipeline = new Pipeline(ctx, particles);
      ctx.app.setRenderFn((scene, camera, dt) => pipeline.render(scene, camera, dt));
      ctx.log.info(`pipeline built: quality=${pipeline.quality} msaa=${pipeline.msaaSamples} passes=${pipeline.composer.passes.length}`);
    } catch (err) {
      ctx.log.error('pipeline failed to build; direct rendering kept:', err);
      pipeline = null;
    }
    ctx.events.on('core:resize', ({ width, height }) => pipeline?.resize(width, height));
  },

  update(dt, t) {
    if (!ctx) return;
    computeSun();
    updateFireFront();
    updateLocustSwarms(t);
    const w = ctx.world.weather;
    haze.update({ temperature: w.temperature ?? 28, sunUp: S.sunUp });
    S.ambientAlpha = (S.ambientDust >= 0 ? S.ambientDust : autoAmbientDust()) * 0.55;
    S.target.copy(ctx.rig.target);
    if (pipeline) pipeline.setFrame(S.sunColor, S.sunUp, haze.strength, S.target.y, S.nightFloor);
    if (particles) {
      if (!S.lightIn) S.lightIn = { sunDir: S.sunDir, sunColor: S.sunRadiance, ambient: S.ambient, wind: null, camera: ctx.camera, target: S.target, ambientAlpha: 0 };
      S.lightIn.wind = w.wind; S.lightIn.ambientAlpha = S.ambientAlpha;
      particles.update(dt, t, S.lightIn);
    }
    updateStage(dt, t, S, ctx);
  },

  tick() {},

  dispose() {
    try { ctx?.app.setRenderFn(null); } catch { /* ignore */ }
    disposeStage(ctx);
    pipeline?.dispose(); pipeline = null;
    if (S.fireFlames) { for (const e of S.fireFlames) e?.dispose?.(); for (const e of S.fireSmoke) e?.dispose?.(); }
    S.fireFlames = null; S.fireSmoke = null;
    S.fireGlow?.removeFromParent(); S.fireGlow = null;
    particles?.dispose(); particles = null;
    group?.removeFromParent(); group = null;
    S.fallbackLooked = false; S.fallbackSun = null; S.lightIn = null;
    ctx = null;
  },

  showcase: { presets, stage: (c, preset) => stage(c, preset, api, group) },
};
