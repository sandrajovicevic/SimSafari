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
 * 64² grid every 6th frame (uint8 reads) and round-robin-positions up to 8 flame + 8 smoke emitters
 * from the shared pool; extras idle. Flames are self-lit HDR so bloom carries them at night. */
const FIRE_EMITTERS = 8;
function updateFireFront() {
  const veg = ctx.world.vegetation;
  if (!veg?.burn || !particles) return;
  if (S.fireFlames === undefined) { S.fireFlames = []; S.fireSmoke = []; S.fireScan = 0; S.fireCursor = 0; S.fireCells = []; }
  S.fireScan = (S.fireScan + 1) % 6;
  if (S.fireScan !== 0) return;
  const r = veg.res, c = veg.cell, half = ctx.world.half ?? ctx.world.size / 2;
  const found = S.fireCells;
  found.length = 0;
  const start = (S.fireCursor = (S.fireCursor + 7) % (r * r));
  for (let k = 0; k < r * r && found.length < FIRE_EMITTERS; k++) {
    const i = (start + k * 13) % (r * r);
    if (veg.burn[i] !== 1) continue;
    const iz = (i / r) | 0, ix = i - iz * r;
    found.push([(ix + 0.5) * c - half, (iz + 0.5) * c - half]);
  }
  while (S.fireFlames.length < found.length) {
    const fl = particles.emitter('fire', { rate: 26, size: 1.1, life: 0.5 });
    const sm = particles.emitter('smoke', { rate: 5, size: 1.3, life: 4.5, speed: 0.8 });
    if (!fl || !sm) break;
    S.fireFlames.push(fl); S.fireSmoke.push(sm);
  }
  for (let i = 0; i < S.fireFlames.length; i++) {
    const fl = S.fireFlames[i], sm = S.fireSmoke[i];
    if (i < found.length) {
      const x = found[i][0], z = found[i][1];
      const y = (ctx.world.getHeight ? ctx.world.getHeight(x, z) : 0) + 0.4;
      fl.setPosition(x, y, z); fl.set({ rate: 26 });
      sm?.setPosition(x, y + 1.2, z); sm?.set({ rate: 5 });
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
    particles?.dispose(); particles = null;
    group?.removeFromParent(); group = null;
    S.fallbackLooked = false; S.fallbackSun = null; S.lightIn = null;
    ctx = null;
  },

  showcase: { presets, stage: (c, preset) => stage(c, preset, api, group) },
};
