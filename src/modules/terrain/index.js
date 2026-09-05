// terrain module — owner of world.terrain (heights, biome, waterLevel). See README.md.
import * as THREE from 'three';
import { BIOME } from '../../core/World.js';
import { presets, stage } from './showcase.js';
import { buildLayerArrays, buildWaterNormal } from './textures.js';
import { generateSavannah, classifyRange, classifyAll, packControl, sampleMoisture, BIOME_NAMES, normalAt } from './generate.js';
import { buildChunks, refreshChunk, chunkAt } from './mesh.js';
import { createTerrainMaterial, createControlTextures, createHeightTexture, updateHeightTexture } from './material.js';
import { buildWaterGeometry, createWaterMaterial, updateWaterSky } from './water.js';
import { buildApronGeometry, createApronMaterial } from './apron.js';

const CHUNKS = 4;
const _n = [0, 0, 0];

const S = {
  ctx: null, group: null, layers: null, control: null, heightTex: null, waterNormal: null,
  material: null, chunks: [], water: null, waterMat: null, apron: null, apronMat: null,
  gen: null, ctlBytes: null, generated: false, textureSize: 1024,
};

function log(...a) { S.ctx?.log?.info?.(...a); }

function isSoftwareGL(renderer) {
  try {
    const gl = renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const name = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : '';
    return /swiftshader|llvmpipe|software/i.test(String(name));
  } catch { return false; }
}

// ---------- water -----------------------------------------------------------------------------------------
function waterBodies() {
  const world = S.ctx.world, gen = S.gen;
  const res = world.terrain.res, cell = world.terrain.cell, half = world.half;
  const bodies = [];
  for (const p of gen.pans) {
    const r = p.r * 1.3;
    bodies.push({ level: p.level, contains: (ix, iz) => { const x = ix * cell - half, z = iz * cell - half; return (x - p.x) * (x - p.x) + (z - p.z) * (z - p.z) < r * r; } });
  }
  bodies.push({ level: world.terrain.waterLevel, contains: () => true });
  return bodies;
}

function rebuildWater() {
  const world = S.ctx.world;
  const geo = buildWaterGeometry(world, waterBodies());
  if (S.water) { S.water.geometry.dispose(); S.water.geometry = geo; }
  else {
    S.water = new THREE.Mesh(geo, S.waterMat);
    S.water.name = 'terrain-water';
    S.water.receiveShadow = true; S.water.castShadow = false;
    S.water.renderOrder = 10;
    S.water.matrixAutoUpdate = false;
    S.group.add(S.water);
  }
}

/** Low-detail continuation ring beyond the playable 1024 m so the map does not float on a slab cut. */
function rebuildApron() {
  const ctx = S.ctx;
  try {
    if (!S.apronMat) S.apronMat = createApronMaterial(ctx);
    const geo = buildApronGeometry(ctx.world, ctx.noise);
    if (S.apron) { S.apron.geometry.dispose(); S.apron.geometry = geo; }
    else {
      S.apron = new THREE.Mesh(geo, S.apronMat);
      S.apron.name = 'terrain-apron';
      S.apron.receiveShadow = false; S.apron.castShadow = false;
      S.apron.matrixAutoUpdate = false;
      S.apron.renderOrder = -1;
      S.group.add(S.apron);
    }
  } catch (err) { ctx.log.warn('[terrain] apron build failed: ' + (err?.message || err)); }
}

function uploadControl() {
  const world = S.ctx.world;
  packControl(world, S.gen, S.ctx.noise, S.ctlBytes.ctl0, S.ctlBytes.ctl1, S.ctlBytes.aux);
  S.control.tCtl0.needsUpdate = true; S.control.tCtl1.needsUpdate = true; S.control.tAux.needsUpdate = true;
}

// ---------- generation ------------------------------------------------------------------------------------
function generate({ preset = 'savannah', seed } = {}) {
  const ctx = S.ctx, world = ctx.world;
  const rng = seed !== undefined ? ctx.rng.fork('gen:' + seed) : ctx.rng.fork('gen');
  const t0 = performance.now();
  S.gen = generateSavannah(world, ctx.noise, rng, { preset });
  if (!S.ctlBytes) {
    const n = world.terrain.res * world.terrain.res * 4;
    S.ctlBytes = { ctl0: new Uint8Array(n), ctl1: new Uint8Array(n), aux: new Uint8Array(n) };
    S.control = createControlTextures(world, S.ctlBytes.ctl0, S.ctlBytes.ctl1, S.ctlBytes.aux);
  }
  uploadControl();
  if (!S.heightTex) S.heightTex = createHeightTexture(world); else updateHeightTexture(world, S.heightTex);
  if (!S.material) S.material = createTerrainMaterial(ctx, S.layers, S.control);
  if (!S.chunks.length) {
    S.chunks = buildChunks(world, S.material, { chunksPerSide: CHUNKS });
    for (const c of S.chunks) S.group.add(c.mesh);
  } else for (const c of S.chunks) refreshChunk(world, c);
  if (!S.waterMat) S.waterMat = createWaterMaterial(ctx, S.heightTex, S.waterNormal);
  rebuildWater();
  rebuildApron();
  S.generated = true;
  log(`[terrain] generated in ${(performance.now() - t0).toFixed(0)} ms: h ${world.terrain.minHeight.toFixed(1)}..${world.terrain.maxHeight.toFixed(1)} m, water ${world.terrain.waterLevel}`);
  ctx.events.emit('terrain:ready', {});
  return { kopjes: S.gen.kopjes, pans: S.gen.pans, river: S.gen.river, escarpment: S.gen.escarp };
}

// ---------- edits ------------------------------------------------------------------------------------------
function sampleRect(x, z, r) {
  const world = S.ctx.world, T = world.terrain, cell = T.cell, half = world.half, res = T.res;
  const ix0 = Math.max(0, Math.floor((x - r + half) / cell)), ix1 = Math.min(res - 1, Math.ceil((x + r + half) / cell));
  const iz0 = Math.max(0, Math.floor((z - r + half) / cell)), iz1 = Math.min(res - 1, Math.ceil((z + r + half) / cell));
  return { ix0, ix1, iz0, iz1 };
}

function forRadius(x, z, r, fn) {
  const world = S.ctx.world, T = world.terrain, cell = T.cell, half = world.half, res = T.res;
  const { ix0, ix1, iz0, iz1 } = sampleRect(x, z, r);
  for (let iz = iz0; iz <= iz1; iz++) for (let ix = ix0; ix <= ix1; ix++) {
    const sx = ix * cell - half, sz = iz * cell - half;
    const d = Math.hypot(sx - x, sz - z);
    if (d > r) continue;
    const t = d / r, f = (1 - t * t) * (1 - t * t);
    fn(iz * res + ix, ix, iz, f);
  }
  return { ix0, ix1, iz0, iz1 };
}

function afterEdit(rect, { heights = true } = {}) {
  const world = S.ctx.world, T = world.terrain, cell = T.cell, half = world.half;
  const pad = 2;
  const ix0 = rect.ix0 - pad, ix1 = rect.ix1 + pad, iz0 = rect.iz0 - pad, iz1 = rect.iz1 + pad;
  if (heights) {
    world.updateHeightStats();
    updateHeightTexture(world, S.heightTex);
    for (const c of S.chunks) if (!(c.ix1 < ix0 || c.ix0 > ix1 || c.iz1 < iz0 || c.iz0 > iz1)) refreshChunk(world, c);
    // wetness / slope may have changed → reclassify (painted samples are preserved)
    classifyRange(world, S.gen, ix0, iz0, ix1, iz1);
    // rebuild water if the edited region is anywhere near a water level
    let near = false;
    for (let iz = Math.max(0, iz0); iz <= Math.min(T.res - 1, iz1) && !near; iz++) for (let ix = Math.max(0, ix0); ix <= Math.min(T.res - 1, ix1); ix++) {
      const i = iz * T.res + ix; if (T.heights[i] < S.gen.localLevel[i] + 1.5) { near = true; break; }
    }
    if (near) rebuildWater();
  }
  uploadControl();
  const x0 = Math.max(0, ix0) * cell - half, z0 = Math.max(0, iz0) * cell - half, x1 = Math.min(T.res - 1, ix1) * cell - half, z1 = Math.min(T.res - 1, iz1) * cell - half;
  S.ctx.events.emit('terrain:modified', { x0, z0, x1, z1 });
}

const api = {
  /** Fill world.terrain from the seeded savannah generator; returns feature positions. */
  generate,
  /** World extents + height range. */
  getBounds() { const w = S.ctx.world; return { x0: -w.half, z0: -w.half, x1: w.half, z1: w.half, minHeight: w.terrain.minHeight, maxHeight: w.terrain.maxHeight, waterLevel: w.terrain.waterLevel }; },
  /** Chunk record { cx, cz, x0, z0, x1, z1, minH, maxH, mesh } covering (x,z). */
  getChunkAt(x, z) { return S.chunks.length ? chunkAt(S.chunks, CHUNKS, S.ctx.world, x, z) : null; },
  /** 0..1 moisture (river proximity, low ground, pans). */
  sampleMoisture(x, z) { return S.gen ? sampleMoisture(S.ctx.world, S.gen, x, z) : 0; },
  getBiomeName(id) { return BIOME_NAMES[id] ?? 'unknown'; },
  /** Feature layout: river polyline (+ pointOnRiver(t)), kopjes, pans (with own water levels), escarpment. */
  getFeatures() { return S.gen ? { river: S.gen.river, pointOnRiver: S.gen.pointOnRiver, kopjes: S.gen.kopjes, pans: S.gen.pans, escarpment: S.gen.escarp } : null; },
  /** Water level of the body covering (x,z): pans have their own; else world.terrain.waterLevel. */
  getWaterLevelAt(x, z) {
    if (!S.gen) return S.ctx.world.terrain.waterLevel;
    for (const p of S.gen.pans) if (Math.hypot(x - p.x, z - p.z) < p.r * 1.3) return p.level;
    return S.ctx.world.terrain.waterLevel;
  },
  /** True when the ground at (x,z) is under the local water body (includes pans, unlike world.isWater). */
  isWaterAt(x, z) { return S.ctx.world.getHeight(x, z) < api.getWaterLevelAt(x, z); },
  /** Half-float R16F DataTexture of world.terrain.heights (513²), updated on every edit. */
  getHeightTexture() { return S.heightTex; },
  getMaterial() { return S.material; },

  raise(x, z, r, amount) {
    const H = S.ctx.world.terrain.heights;
    const rect = forRadius(x, z, r, (i, ix, iz, f) => { H[i] += amount * f; });
    afterEdit(rect);
  },
  lower(x, z, r, amount) { api.raise(x, z, r, -amount); },
  flatten(x, z, r, targetH) {
    const H = S.ctx.world.terrain.heights;
    const h = targetH ?? S.ctx.world.getHeight(x, z);
    const rect = forRadius(x, z, r, (i, ix, iz, f) => { H[i] += (h - H[i]) * Math.min(1, f * 1.5); });
    afterEdit(rect);
  },
  smooth(x, z, r, strength = 1) {
    const T = S.ctx.world.terrain, H = T.heights, res = T.res;
    const src = Float32Array.from(H);
    const rect = forRadius(x, z, r, (i, ix, iz, f) => {
      const xl = ix > 0 ? ix - 1 : ix, xr = ix < res - 1 ? ix + 1 : ix, zd = iz > 0 ? iz - 1 : iz, zu = iz < res - 1 ? iz + 1 : iz;
      const avg = (src[i] * 4 + src[iz * res + xl] + src[iz * res + xr] + src[zd * res + ix] + src[zu * res + ix]
        + (src[zd * res + xl] + src[zd * res + xr] + src[zu * res + xl] + src[zu * res + xr]) * 0.5) / 10;
      H[i] += (avg - src[i]) * Math.min(1, f * strength * 1.5);
    });
    afterEdit(rect);
  },
  paintBiome(x, z, r, biome) {
    const T = S.ctx.world.terrain;
    if (!(biome >= 0 && biome <= 7)) return;
    const rect = forRadius(x, z, r, (i) => { T.biome[i] = biome; S.gen.painted[i] = 1; });
    afterEdit(rect, { heights: false });
  },
  clearPaint(x, z, r) {
    const rect = forRadius(x, z, r, (i) => { S.gen.painted[i] = 0; });
    classifyRange(S.ctx.world, S.gen, rect.ix0, rect.iz0, rect.ix1, rect.iz1);
    afterEdit(rect, { heights: false });
  },
  setWaterLevel(h) {
    const world = S.ctx.world, T = world.terrain;
    T.waterLevel = h; S.gen.waterLevel = h;
    const L = S.gen.localLevel;
    for (let i = 0; i < L.length; i++) if (!S.gen.pans.some((p) => L[i] === p.level)) L[i] = h;
    classifyAll(world, S.gen);
    uploadControl();
    rebuildWater();
    world.updateHeightStats();
    S.ctx.events.emit('terrain:modified', { x0: -world.half, z0: -world.half, x1: world.half, z1: world.half });
  },
  /** Surface normal at (x,z) into out[3] (array), from the heightfield. */
  normalAt(x, z, out = [0, 1, 0]) {
    const world = S.ctx.world, T = world.terrain;
    const ix = Math.round((x + world.half) / T.cell), iz = Math.round((z + world.half) / T.cell);
    return normalAt(T.heights, T.res, T.cell, Math.max(0, Math.min(T.res - 1, ix)), Math.max(0, Math.min(T.res - 1, iz)), out);
  },
  BIOME, BIOME_NAMES,
};

export default {
  id: 'terrain',
  version: 1,
  dependencies: [],
  // environment is optional: without it the core fallback sun leaves vertical faces unlit and the
  // sky is a flat pastel plate. With it the showcase gets the real sky, PMREM ambient, fog and exposure.
  optional: ['environment'],
  api,

  async init(ctx) {
    S.ctx = ctx;
    S.group = new THREE.Group(); S.group.name = 'terrain';
    ctx.scene.add(S.group);
    // Software GL (SwiftShader/llvmpipe, used by the screenshot tool) pays per texel fetch: drop anisotropy and
    // tile size there so a frame stays affordable; hardware gets 1024² tiles with 8× anisotropy.
    S.soft = isSoftwareGL(ctx.renderer);
    S.textureSize = (ctx.quality === 'low' || S.soft) ? 512 : 1024;
    S.anisotropy = S.soft ? 1 : 8;
    try {
      const t0 = performance.now();
      S.layers = buildLayerArrays(ctx, { size: S.textureSize, anisotropy: S.anisotropy });
      S.waterNormal = buildWaterNormal(ctx, { anisotropy: S.soft ? 1 : 4 });
      log(`[terrain] ${S.layers.layers} layer sets @ ${S.textureSize}² aniso ${S.anisotropy} (${S.soft ? 'software' : 'hardware'} GL) in ${(performance.now() - t0).toFixed(0)} ms`);
    } catch (err) {
      ctx.log.error('[terrain] texture generation failed', err);
    }
    try { generate(); } catch (err) { ctx.log.error('[terrain] generation failed', err); }
  },

  update(dt, t) {
    if (S.waterMat) updateWaterSky(S.waterMat, S.ctx.world);
  },

  tick() {},

  dispose() {
    for (const c of S.chunks) { c.geo.dispose(); c.mesh.removeFromParent(); }
    S.chunks = [];
    if (S.water) { S.water.geometry.dispose(); S.water.removeFromParent(); S.water = null; }
    if (S.apron) { S.apron.geometry.dispose(); S.apron.removeFromParent(); S.apron = null; }
    if (S.apronMat) { S.ctx.materials.untrack(S.apronMat); S.apronMat.dispose(); S.apronMat = null; }
    for (const suf of [':height', ':albedo', ':orm', ':normal']) S.ctx?.textures.dispose('terrain:apron4' + suf);
    if (S.material) { S.ctx.materials.untrack(S.material); S.material.dispose(); S.material = null; }
    if (S.waterMat) { S.ctx.materials.untrack(S.waterMat); S.waterMat.dispose(); S.waterMat = null; }
    S.layers?.dispose(); S.layers = null;
    if (S.control) { for (const t of Object.values(S.control)) t.dispose(); S.control = null; }
    S.heightTex?.dispose(); S.heightTex = null;
    S.ctx?.textures.dispose('terrain:waterNormal'); S.waterNormal = null;
    S.group?.removeFromParent(); S.group = null;
    S.gen = null; S.ctlBytes = null; S.generated = false;
  },

  showcase: { presets, stage },
};
