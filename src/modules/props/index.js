// props — vegetation and natural props: grass, acacias, fever trees, baobabs, dead trees, thorn scrub,
// granite boulders, termite mounds and fallen logs. See README.md for the public API.
//
// Everything is instanced. Grass lives in its own camera-centred chunked field (grass.js, 3 draw calls);
// every other prop is an item in `S.items` and is packed into per-(kind, variant, LOD) InstancedMeshes
// whenever the camera moves far enough to change an LOD bucket.
import * as THREE from 'three';
import { BIOME, OCC } from '../../core/World.js';
import { presets, stage } from './showcase.js';
import * as TEX from './textures.js';
import { buildTreeVariant } from './trees.js';
import { buildBoulder, buildTermiteMound, buildLog, buildShrub } from './rocks.js';
import { GrassField } from './grass.js';
import { bakeImposter, imposterMaterial, imposterGeometry } from './imposter.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

const TREE_KINDS = ['acacia', 'fever', 'baobab', 'dead'];
const ALL_KINDS = ['acacia', 'fever', 'baobab', 'dead', 'shrub', 'boulder', 'termite', 'log'];

// LOD switch distances in metres: [full → reduced, reduced → billboard]
const TREE_LOD = [95, 330];
const PROP_CULL = { shrub: 230, boulder: 900, termite: 420, log: 260 };

// grass density and nominal blade height per biome id (World.BIOME)
const GRASS_BIOME = [
  //  density, height(m), greenness
  [1.00, 0.42, 1.00],  // 0 grass
  [0.92, 0.50, 0.10],  // 1 dry grass
  [0.20, 0.26, 0.20],  // 2 dirt
  [0.05, 0.22, 0.15],  // 3 rock
  [0.07, 0.24, 0.10],  // 4 sand
  [0.98, 0.70, 1.00],  // 5 wetland
  [0.03, 0.30, 0.60],  // 6 riverbed
  [0.00, 0.20, 0.00],  // 7 road dust
];

// linear-RGB. Authored dark: ACES tone mapping lifts and desaturates on the way to the screen.
const DRY = [0.2250, 0.1620, 0.0480];   // golden dry-season grass
const GREEN = [0.0680, 0.0880, 0.0300]; // damp riverine sward — olive, not blue-green

const S = {
  ctx: null, world: null, group: null, terrain: null, env: null,
  mats: {}, species: new Map(), grass: null,
  items: new Map(), byKind: new Map(), nextId: 1,
  cover: null, graze: null, grazed: new Set(), macro: null, macroRes: 0, macroCell: 8,
  camX: 1e9, camZ: 1e9, dirty: true, ready: false, scattered: false,
  stats: { trees: 0, props: 0, grass: 0, drawGroups: 0 },
  _t: 0, _grassMs: 0, _packMs: 0,
};

// ---------------------------------------------------------------------------------------------------------
// fields
// ---------------------------------------------------------------------------------------------------------

/** Macro patchiness at 8 m resolution: two octave bands (≈ 30 m and ≈ 190 m) baked once per world. */
function buildMacro() {
  const w = S.world, n = S.ctx.noise;
  const cell = S.macroCell;
  const res = Math.round(w.size / cell) + 1;
  const a = new Float32Array(res * res * 2);
  for (let j = 0; j < res; j++) {
    const z = j * cell - w.half;
    for (let i = 0; i < res; i++) {
      const x = i * cell - w.half;
      a[(j * res + i) * 2] = n.fbm2D(x / 190 + 5.3, z / 190 + 2.7, 3) * 0.5 + 0.5;
      a[(j * res + i) * 2 + 1] = n.fbm2D(x / 31 + 41.1, z / 31 + 17.9, 2) * 0.5 + 0.5;
    }
  }
  S.macro = a; S.macroRes = res;
}

function macroAt(x, z, band) {
  const res = S.macroRes, cell = S.macroCell, half = S.world.half, a = S.macro;
  if (!a) return 0.5;
  let fx = (x + half) / cell, fz = (z + half) / cell;
  fx = clamp(fx, 0, res - 1); fz = clamp(fz, 0, res - 1);
  const ix = Math.floor(fx), iz = Math.floor(fz);
  const ix1 = Math.min(res - 1, ix + 1), iz1 = Math.min(res - 1, iz + 1);
  const tx = fx - ix, tz = fz - iz;
  const i00 = (iz * res + ix) * 2 + band, i10 = (iz * res + ix1) * 2 + band;
  const i01 = (iz1 * res + ix) * 2 + band, i11 = (iz1 * res + ix1) * 2 + band;
  return (a[i00] * (1 - tx) + a[i10] * tx) * (1 - tz) + (a[i01] * (1 - tx) + a[i11] * tx) * tz;
}

/** world.cellAt() and world.biomeAt() both allocate; these run ~250 000 times per grass rebuild. */
function cellIndexAt(x, z) {
  const g = S.world.grid, half = S.world.half;
  let ix = Math.floor((x + half) / g.cell), iz = Math.floor((z + half) / g.cell);
  ix = ix < 0 ? 0 : ix >= g.res ? g.res - 1 : ix;
  iz = iz < 0 ? 0 : iz >= g.res ? g.res - 1 : iz;
  return iz * g.res + ix;
}

/**
 * Bilinear blend of the per-biome grass row, sampled through a noise-warped position.
 * Nearest-neighbour biome lookups produce dead-straight edges along the 2 m sample grid — that is
 * what put a hard rectangular seam between the green and yellow grass. Bilinear removes the step,
 * the domain warp breaks the remaining axis alignment into an organic boundary.
 */
function biomeRowAt(x, z, out) {
  const T = S.world.terrain, half = S.world.half, r = T.res, c = T.cell, B = T.biome;
  const wx = x + (macroAt(x, z, 1) - 0.5) * 11.0 + (macroAt(x, z, 0) - 0.5) * 5.0;
  const wz = z + (macroAt(z * 0.97 + 131, x * 1.03 - 77, 1) - 0.5) * 11.0 + (macroAt(z + 311, x - 47, 0) - 0.5) * 5.0;
  let fx = (wx + half) / c, fz = (wz + half) / c;
  fx = clamp(fx, 0, r - 1); fz = clamp(fz, 0, r - 1);
  const ix = Math.floor(fx), iz = Math.floor(fz);
  const ix1 = ix < r - 1 ? ix + 1 : ix, iz1 = iz < r - 1 ? iz + 1 : iz;
  const tx = fx - ix, tz = fz - iz;
  const w00 = (1 - tx) * (1 - tz), w10 = tx * (1 - tz), w01 = (1 - tx) * tz, w11 = tx * tz;
  const a = GRASS_BIOME[B[iz * r + ix]], b = GRASS_BIOME[B[iz * r + ix1]];
  const d = GRASS_BIOME[B[iz1 * r + ix]], e = GRASS_BIOME[B[iz1 * r + ix1]];
  out[0] = a[0] * w00 + b[0] * w10 + d[0] * w01 + e[0] * w11;
  out[1] = a[1] * w00 + b[1] * w10 + d[1] * w01 + e[1] * w11;
  out[2] = a[2] * w00 + b[2] * w10 + d[2] * w01 + e[2] * w11;
  return out;
}

function biomeAtFast(x, z) {
  const T = S.world.terrain, half = S.world.half, r = T.res;
  let ix = Math.round((x + half) / T.cell), iz = Math.round((z + half) / T.cell);
  ix = ix < 0 ? 0 : ix >= r ? r - 1 : ix;
  iz = iz < 0 ? 0 : iz >= r ? r - 1 : iz;
  return T.biome[iz * r + ix];
}

function moistureAt(x, z) { return S.terrain?.sampleMoisture ? S.terrain.sampleMoisture(x, z) : 0.28; }
function waterLevelAt(x, z) { return S.terrain?.getWaterLevelAt ? S.terrain.getWaterLevelAt(x, z) : S.world.terrain.waterLevel; }

/** Shared scratch — grassSample must not allocate, it runs ~250 000 times per field rebuild. */
const gout = { y: 0, height: 0.4, r: 0, g: 0, b: 0 };
const _row = [0, 0, 0];

function grassSample(x, z) {
  const w = S.world;
  if (x < -w.half || x > w.half || z < -w.half || z > w.half) return 0;
  const h = w.getHeight(x, z);
  if (h < waterLevelAt(x, z) + 0.10) return 0;
  const row = biomeRowAt(x, z, _row);
  let d = row[0];
  if (d <= 0.004) return 0;
  const ci = cellIndexAt(x, z);
  const occ = w.grid.occupancy[ci];
  if (occ === OCC.BUILDING || occ === OCC.ROAD) return 0;
  d *= 1 - smoothstep(0.30, 0.72, w.getSlope(x, z));
  if (d <= 0.001) return 0;
  const m1 = macroAt(x, z, 0), m2 = macroAt(x, z, 1);
  d *= clamp(0.74 + 0.46 * m1 * (0.78 + 0.30 * m2), 0, 1.18);
  const moist = moistureAt(x, z);
  d *= 0.80 + 0.45 * moist;
  d *= S.graze ? S.graze[ci] : 1;
  if (d <= 0.02) return 0;
  // colour: dry ochre → riverine green, plus a macro tone band so the plain is never one flat colour
  const green = clamp((moist - 0.48) * 2.4 * row[2] + (m2 - 0.64) * 0.40 * row[2], 0, 1);
  const tone = 0.80 + 0.38 * m1;
  gout.y = h - 0.04;
  gout.height = row[1] * (0.78 + 0.50 * moist + 0.26 * m2);
  gout.r = lerp(DRY[0], GREEN[0], green) * tone;
  gout.g = lerp(DRY[1], GREEN[1], green) * tone;
  gout.b = lerp(DRY[2], GREEN[2], green) * tone;
  return Math.min(1, d);
}
grassSample.out = gout;

// ---------------------------------------------------------------------------------------------------------
// materials + species geometry
// ---------------------------------------------------------------------------------------------------------

function barkMaterial(name, set, extra = {}) {
  const m = S.ctx.materials.standard({
    map: set.map, normalMap: set.normalMap, roughnessMap: set.roughnessMap,
    aoMap: set.aoMap, metalnessMap: set.metalnessMap, metalness: 0, roughness: 1,
    envMapIntensity: 0.7, normalScale: new THREE.Vector2(1.4, 1.4), ...extra,
  });
  m.userData.cacheKeyExtra = 'bark:' + name;
  S.ctx.materials.withWind(m, { strength: 0.0035, pivotY: 2.2, frequency: 0.55 });
  return m;
}

function leafMaterial(name, tex, extra = {}) {
  const m = S.ctx.materials.standard({
    map: tex, alphaTest: 0.36, side: THREE.DoubleSide, roughness: 0.94, metalness: 0,
    transparent: false, envMapIntensity: 0.35, ...extra,
  });
  m.userData.cacheKeyExtra = 'leaf:' + name;
  S.ctx.materials.withWind(m, { strength: 0.0035, pivotY: 2.2, frequency: 0.55 });
  return m;
}

function buildMaterials() {
  const T = S.ctx.textures;
  const size = S.ctx.quality === 'low' ? 256 : 512;
  const leafSize = S.ctx.quality === 'low' ? 128 : 256;
  const M = S.mats;
  M.barkAcacia = barkMaterial('acacia', TEX.barkAcacia(T, { size }));
  M.barkFever = barkMaterial('fever', TEX.barkFever(T, { size }));
  M.barkBaobab = barkMaterial('baobab', TEX.barkBaobab(T, { size }));
  M.barkDead = barkMaterial('dead', TEX.barkDead(T, { size }));
  // Linear albedo. Savannah canopy is a dark olive — well under 0.10 — and reads much lighter
  // once the sun, sky IBL and ACES have had their way with it.
  M.leafAcacia = leafMaterial('acacia', TEX.foliageAcacia(T, { size: leafSize, seed: 5, key: 'props:leaf:acacia', tint: [0.0620, 0.0655, 0.0225] }));
  M.leafFever = leafMaterial('fever', TEX.foliageAcacia(T, { size: leafSize, seed: 27, key: 'props:leaf:fever', tint: [0.0500, 0.0760, 0.0235] }));
  M.leafBroad = leafMaterial('broad', TEX.foliageBroad(T, { size: leafSize, seed: 8, key: 'props:leaf:broad', tint: [0.0450, 0.0640, 0.0205] }));
  M.leafScrub = leafMaterial('scrub', TEX.foliageScrub(T, { size: leafSize, seed: 12, key: 'props:leaf:scrub', tint: [0.0580, 0.0580, 0.0265] }));
  M.leafScrubDry = leafMaterial('scrubdry', TEX.foliageScrub(T, { size: leafSize, seed: 63, key: 'props:leaf:scrubdry', tint: [0.0750, 0.0620, 0.0260] }));

  const gran = TEX.granite(T, { size });
  M.rock = S.ctx.materials.standard({
    map: gran.map, normalMap: gran.normalMap, roughnessMap: gran.roughnessMap, aoMap: gran.aoMap,
    metalnessMap: gran.metalnessMap, metalness: 0, normalScale: new THREE.Vector2(1.1, 1.1),
  });
  const cl = TEX.clay(T, { size });
  M.clay = S.ctx.materials.standard({
    map: cl.map, normalMap: cl.normalMap, roughnessMap: cl.roughnessMap, aoMap: cl.aoMap,
    metalnessMap: cl.metalnessMap, metalness: 0, normalScale: new THREE.Vector2(1, 1),
  });
  M.shrubStem = barkMaterial('shrubstem', TEX.barkAcacia(T, { size }), { color: 0x8c7b62 });
  M.shrubStem.userData.wind.uSway.value = 0.045;   // bushes bend much more than a tree trunk
  M.shrubStem.userData.wind.uPivot.value = 0.1;
}

/** An instanced draw group: several parts (bark + leaf, stem + foliage …) sharing one instance matrix set. */
class InstGroup {
  constructor(parts, cap, { castShadow = true, receiveShadow = true, name = 'props' } = {}) {
    this.cap = Math.max(1, cap);
    this.count = 0;
    this.meshes = parts.filter((p) => p && p.geo).map((p) => {
      const m = new THREE.InstancedMesh(p.geo, p.mat, this.cap);
      m.name = name;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.castShadow = castShadow; m.receiveShadow = receiveShadow;
      m.frustumCulled = false;
      m.count = 0;
      return m;
    });
  }
  addTo(group) { for (const m of this.meshes) group.add(m); return this; }
  reset() { this.count = 0; }
  write(mtx) {
    if (this.count >= this.cap) return false;
    const o = this.count * 16;
    for (const m of this.meshes) m.instanceMatrix.array.set(mtx.elements, o);
    this.count++;
    return true;
  }
  finish() {
    for (const m of this.meshes) { m.count = this.count; m.instanceMatrix.needsUpdate = true; }
  }
  dispose() { for (const m of this.meshes) { m.removeFromParent(); m.dispose?.(); } this.meshes.length = 0; }
}

function makeTreeSpecies(kind, nVariants, barkMat, leafMat) {
  const rngRoot = S.ctx.rng.fork('species:' + kind);
  const variants = [];
  for (let v = 0; v < nVariants; v++) {
    const built = buildTreeVariant(kind, rngRoot.fork('v' + v));
    variants.push({
      height: built.height, crownR: built.crownR, trunkR: built.trunkR,
      lodParts: built.lods.map((l) => [{ geo: l.bark, mat: barkMat }, l.leaf ? { geo: l.leaf, mat: leafMat } : null].filter(Boolean)),
      groups: [null, null],
      imposter: null, imposterGroup: null,
    });
  }
  return { kind, type: 'tree', variants, imposter: null, imposterGroup: null };
}

function makePropSpecies(kind, variants) {
  return { kind, type: 'prop', variants, imposter: null, imposterGroup: null };
}

function buildSpecies() {
  const M = S.mats;
  const nV = S.ctx.quality === 'low' ? 2 : 3;
  S.species.set('acacia', makeTreeSpecies('acacia', nV, M.barkAcacia, M.leafAcacia));
  S.species.set('fever', makeTreeSpecies('fever', 2, M.barkFever, M.leafFever));
  S.species.set('baobab', makeTreeSpecies('baobab', 2, M.barkBaobab, M.leafBroad));
  S.species.set('dead', makeTreeSpecies('dead', 2, M.barkDead, null));

  const rng = S.ctx.rng.fork('props-geo');
  const noise = S.ctx.noise;

  // boulders — four silhouettes, scaled per instance
  const boulders = [];
  for (let i = 0; i < 4; i++) {
    boulders.push({
      height: 1, crownR: 1,
      lodParts: [[{ geo: buildBoulder(rng, noise, { detail: 2 }), mat: M.rock }],
        [{ geo: buildBoulder(rng, noise, { detail: 1 }), mat: M.rock }]],
      groups: [null, null],
    });
  }
  S.species.set('boulder', makePropSpecies('boulder', boulders));

  // thorn scrub / bushes
  const shrubs = [];
  const shrubMats = [M.leafScrub, M.leafScrubDry, M.leafBroad];
  for (let i = 0; i < 3; i++) {
    const hi = buildShrub(rng, { height: rng.range(0.9, 2.1), cards: 20, cardSize: 0.85, stems: 5 });
    const lo = buildShrub(rng.fork('lo' + i), { height: hi.height, cards: 7, cardSize: 1.35, stems: 2 });
    shrubs.push({
      height: hi.height, crownR: hi.radius,
      lodParts: [[{ geo: hi.stem, mat: M.shrubStem }, { geo: hi.leaf, mat: shrubMats[i] }],
        [{ geo: lo.leaf, mat: shrubMats[i] }]],
      groups: [null, null],
    });
    lo.stem.dispose();
  }
  S.species.set('shrub', makePropSpecies('shrub', shrubs));

  // termite mounds
  const mounds = [];
  for (let i = 0; i < 2; i++) {
    mounds.push({
      height: 2, crownR: 1,
      lodParts: [[{ geo: buildTermiteMound(rng, { rings: 12, sides: 16 }), mat: M.clay }],
        [{ geo: buildTermiteMound(rng.fork('m' + i), { rings: 5, sides: 8 }), mat: M.clay }]],
      groups: [null, null],
    });
  }
  S.species.set('termite', makePropSpecies('termite', mounds));

  // fallen logs
  const logs = [];
  for (let i = 0; i < 2; i++) {
    logs.push({ height: 0.5, crownR: 2, lodParts: [[{ geo: buildLog(rng), mat: M.barkDead }]], groups: [null] });
  }
  S.species.set('log', makePropSpecies('log', logs));
}

/**
 * One imposter per VARIANT. Baking only the first variant made every tree past the LOD1 range an
 * identical cut-out, which read as a hedge along the horizon.
 */
function buildImposters() {
  S.imposterGeo = imposterGeometry();
  for (const kind of TREE_KINDS) {
    const sp = S.species.get(kind);
    if (!sp) continue;
    for (let vi = 0; vi < sp.variants.length; vi++) {
      const v = sp.variants[vi];
      const meshes = v.lodParts[0].map((p) => new THREE.Mesh(p.geo, p.mat));
      let baked = null;
      try { baked = bakeImposter(S.ctx, meshes, { size: S.ctx.quality === 'low' ? 128 : 256 }); }
      catch (err) { S.ctx.log.warn(`[props] imposter bake failed for ${kind} v${vi}: ${err?.message || err}`); }
      if (!baked) continue;
      v.imposter = { ...baked, mat: imposterMaterial(S.ctx, baked.texture, kind + vi), geo: S.imposterGeo, refHeight: v.height };
    }
    sp.hasImposter = sp.variants.some((v) => !!v.imposter);
  }
}

// ---------------------------------------------------------------------------------------------------------
// items
// ---------------------------------------------------------------------------------------------------------

function kindList(kind) {
  let a = S.byKind.get(kind);
  if (!a) { a = []; S.byKind.set(kind, a); }
  return a;
}

const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scl = new THREE.Vector3();
const _mtx = new THREE.Matrix4();
const _euler = new THREE.Euler();

function addCover(item) {
  if (!S.cover) return;
  const sp = S.species.get(item.kind);
  if (!sp || sp.type !== 'tree') return;
  const R = (sp.variants[item.vi].crownR || 3) * item.scale;
  const g = S.world.grid, cell = g.cell, res = g.res, half = S.world.half;
  const i0 = Math.max(0, Math.floor((item.x - R + half) / cell)), i1 = Math.min(res - 1, Math.ceil((item.x + R + half) / cell));
  const j0 = Math.max(0, Math.floor((item.z - R + half) / cell)), j1 = Math.min(res - 1, Math.ceil((item.z + R + half) / cell));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const cx = (i + 0.5) * cell - half, cz = (j + 0.5) * cell - half;
    const d = Math.hypot(cx - item.x, cz - item.z);
    if (d > R) continue;
    const w = 1 - (d / R) * (d / R) * 0.55;
    const idx = j * res + i;
    S.cover[idx] = Math.min(1, S.cover[idx] + w * 0.8);
  }
}

function rebuildCover() {
  if (!S.cover) return;
  S.cover.fill(0);
  for (const it of S.items.values()) addCover(it);
}

function placeItem(kind, x, z, opts = {}) {
  const sp = S.species.get(kind);
  if (!sp) return null;
  const rng = opts.rng || S.rng;
  const vi = opts.variant !== undefined ? clamp(opts.variant | 0, 0, sp.variants.length - 1) : rng.int(0, sp.variants.length - 1);
  const y = opts.y !== undefined ? opts.y : S.world.getHeight(x, z);
  const item = {
    id: opts.id || ('prop_' + (S.nextId++)),
    kind, vi, x, z, y,
    scale: opts.scale ?? (sp.type === 'tree' ? rng.range(0.62, 1.30) : 1),
    rotY: opts.rotY ?? rng.range(0, Math.PI * 2),
    tiltX: 0, tiltZ: 0,
    mirror: rng.bool(0.5),
  };
  if (kind === 'boulder') {
    item.scale = opts.scale ?? rng.range(0.55, 3.1);
    item.tiltX = rng.range(-0.5, 0.5); item.tiltZ = rng.range(-0.5, 0.5);
    item.y = y - item.scale * rng.range(0.18, 0.42);
  } else if (kind === 'log') {
    item.tiltX = rng.range(-0.12, 0.12); item.tiltZ = rng.range(-0.10, 0.10);
    item.scale = opts.scale ?? rng.range(0.8, 1.2);
  } else if (kind === 'shrub' || kind === 'termite') {
    item.scale = opts.scale ?? rng.range(0.75, 1.35);
    item.y = y - 0.05;
  } else {
    // trees settle a little into the ground so the trunk never floats on a slope
    item.y = y - 0.12;
  }
  S.items.set(item.id, item);
  kindList(kind).push(item);
  addCover(item);
  return item;
}

function removeItem(id) {
  const it = S.items.get(id);
  if (!it) return false;
  S.items.delete(id);
  const a = S.byKind.get(it.kind);
  if (a) { const i = a.indexOf(it); if (i >= 0) a.splice(i, 1); }
  return true;
}

// ---------------------------------------------------------------------------------------------------------
// packing
// ---------------------------------------------------------------------------------------------------------

function ensureGroups() {
  for (const sp of S.species.values()) {
    const items = kindList(sp.kind);
    const perVariant = new Array(sp.variants.length).fill(0);
    for (const it of items) perVariant[it.vi]++;
    for (let v = 0; v < sp.variants.length; v++) {
      const variant = sp.variants[v];
      const need = Math.max(8, Math.ceil(perVariant[v] * 1.3));
      for (let lod = 0; lod < variant.lodParts.length; lod++) {
        const g = variant.groups[lod];
        if (g && g.cap >= perVariant[v]) continue;
        g?.dispose();
        variant.groups[lod] = new InstGroup(variant.lodParts[lod], need, {
          castShadow: lod === 0,
          receiveShadow: true,
          name: `props-${sp.kind}-v${v}-lod${lod}`,
        }).addTo(S.group);
      }
    }
    for (let v = 0; v < sp.variants.length; v++) {
      const variant = sp.variants[v];
      if (!variant.imposter) continue;
      const need = Math.max(8, Math.ceil(perVariant[v] * 1.3));
      if (variant.imposterGroup && variant.imposterGroup.cap >= perVariant[v]) continue;
      variant.imposterGroup?.dispose();
      variant.imposterGroup = new InstGroup([{ geo: variant.imposter.geo, mat: variant.imposter.mat }], need, {
        castShadow: false, receiveShadow: true, name: `props-${sp.kind}-v${v}-imposter`,
      }).addTo(S.group);
    }
  }
}

function pack(cx, cz) {
  const t0 = performance.now();
  let groups = 0;
  for (const sp of S.species.values()) {
    for (const v of sp.variants) { for (const g of v.groups) g?.reset(); v.imposterGroup?.reset(); }
    const items = kindList(sp.kind);
    const cull = PROP_CULL[sp.kind] ?? Infinity;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const dx = it.x - cx, dz = it.z - cz;
      const d = Math.sqrt(dx * dx + dz * dz);
      const variant = sp.variants[it.vi];
      let group = null;
      if (sp.type === 'tree') {
        if (d < TREE_LOD[0]) group = variant.groups[0];
        else if (d < TREE_LOD[1] || !variant.imposterGroup) group = variant.groups[1];
        else group = variant.imposterGroup;
      } else {
        if (d > cull) continue;
        group = (d < 90 || variant.lodParts.length === 1) ? variant.groups[0] : variant.groups[1];
      }
      if (!group) continue;
      if (group === variant.imposterGroup) {
        const s = it.scale;
        _pos.set(it.x, it.y, it.z);
        _quat.identity();
        // negative x scale mirrors the billboard (the vertex patch reads the signed column), so a
        // row of distant trees is not the same cut-out repeated
        _scl.set(variant.imposter.width * s * (it.mirror ? -1 : 1), variant.imposter.height * s, 1);
        _mtx.compose(_pos, _quat, _scl);
      } else {
        _pos.set(it.x, it.y, it.z);
        _euler.set(it.tiltX, it.rotY, it.tiltZ, 'YXZ');
        _quat.setFromEuler(_euler);
        _scl.set(it.scale, it.scale, it.scale);
        _mtx.compose(_pos, _quat, _scl);
      }
      group.write(_mtx);
    }
    for (const v of sp.variants) {
      for (const g of v.groups) { if (g) { g.finish(); if (g.count) groups += g.meshes.length; } }
      if (v.imposterGroup) { v.imposterGroup.finish(); if (v.imposterGroup.count) groups += 1; }
    }
  }
  S.stats.drawGroups = groups;
  S._packMs = performance.now() - t0;
}

// ---------------------------------------------------------------------------------------------------------
// scatter rules
// ---------------------------------------------------------------------------------------------------------

function blocked(x, z) {
  const occ = S.world.grid.occupancy[cellIndexAt(x, z)];
  return occ === OCC.BUILDING || occ === OCC.ROAD;
}

function siteInfo(x, z, out) {
  const w = S.world;
  out.h = w.getHeight(x, z);
  out.wl = waterLevelAt(x, z);
  out.above = out.h - out.wl;
  out.biome = biomeAtFast(x + (macroAt(x, z, 1) - 0.5) * 11.0, z + (macroAt(z * 0.97 + 131, x * 1.03 - 77, 1) - 0.5) * 11.0);
  out.slope = w.getSlope(x, z);
  out.moist = moistureAt(x, z);
  out.macro = macroAt(x, z, 0);
  out.macro2 = macroAt(x, z, 1);
  return out;
}

const _si = { h: 0, wl: 0, above: 0, biome: 0, slope: 0, moist: 0, macro: 0, macro2: 0 };

const RULES = {
  acacia: {
    spacing: 20, minDist: 6.5,
    weight(s) {
      if (s.above < 1.2 || s.slope > 0.34) return 0;
      if (s.biome === BIOME.ROCK || s.biome === BIOME.SAND || s.biome === BIOME.RIVERBED || s.biome === BIOME.ROAD_DUST) return 0;
      // Two noise bands: a broad one carves open plain from woodland, a finer one clumps the trees
      // inside a grove. Without this the park reads as an orchard.
      const grove = smoothstep(0.46, 0.74, s.macro);
      const clump = 0.25 + 0.95 * smoothstep(0.35, 0.80, s.macro2);
      const wet = 1 - smoothstep(0.55, 0.85, s.moist);
      const dry = smoothstep(-0.05, 0.16, s.moist);
      return 0.92 * (0.06 + 0.94 * grove) * clump * wet * dry * (1 - smoothstep(0.16, 0.34, s.slope) * 0.7);
    },
  },
  fever: {
    spacing: 12, minDist: 5.5,
    weight(s) {
      if (s.above < 0.6 || s.above > 9 || s.slope > 0.40) return 0;
      if (s.biome === BIOME.ROAD_DUST) return 0;
      // riverine gallery: only where the ground is genuinely damp
      const m = smoothstep(0.50, 0.80, s.moist);
      return 0.85 * m * (0.55 + 0.45 * s.macro2);
    },
  },
  baobab: {
    spacing: 105, minDist: 60,
    weight(s) {
      if (s.above < 2.5 || s.slope > 0.26) return 0;
      if (s.biome === BIOME.WETLAND || s.biome === BIOME.RIVERBED || s.biome === BIOME.ROAD_DUST) return 0;
      return 0.55 * (1 - smoothstep(0.32, 0.62, s.moist));
    },
  },
  dead: {
    spacing: 78, minDist: 40,
    weight(s) {
      if (s.above < 0.8 || s.slope > 0.42) return 0;
      if (s.biome === BIOME.ROAD_DUST) return 0;
      return 0.45;
    },
  },
  shrub: {
    spacing: 9.5, minDist: 3.0,
    weight(s) {
      if (s.above < 0.35 || s.slope > 0.55) return 0;
      if (s.biome === BIOME.ROAD_DUST || s.biome === BIOME.RIVERBED) return 0;
      const rocky = s.biome === BIOME.ROCK ? 1.25 : 1;   // scrub clings to kopje skirts
      return 0.34 * rocky * (0.35 + 0.95 * s.macro2) * (0.5 + 0.7 * smoothstep(0.05, 0.6, s.moist));
    },
  },
  boulder: {
    spacing: 5.5, minDist: 1.6,
    weight(s) {
      const rock = s.biome === BIOME.ROCK ? 1 : 0;
      const steep = smoothstep(0.16, 0.42, s.slope);
      if (!rock && steep < 0.25) return 0;
      return 0.55 * Math.max(rock * 0.9, steep) * (0.35 + 0.9 * s.macro2);
    },
  },
  termite: {
    spacing: 46, minDist: 22,
    weight(s) {
      if (s.above < 1.5 || s.slope > 0.20) return 0;
      if (s.biome !== BIOME.DRY_GRASS && s.biome !== BIOME.GRASS && s.biome !== BIOME.DIRT) return 0;
      return 0.62 * (0.4 + 0.8 * s.macro);
    },
  },
  log: {
    spacing: 70, minDist: 30,
    weight(s) {
      if (s.above < 1.0 || s.slope > 0.30) return 0;
      if (s.biome === BIOME.ROAD_DUST || s.biome === BIOME.RIVERBED) return 0;
      return 0.5 * smoothstep(0.30, 0.65, s.macro);
    },
  },
};

/** Cheap spatial hash used to enforce a minimum spacing between props. */
class SpacingGrid {
  constructor(cell, half) { this.cell = cell; this.half = half; this.map = new Map(); }
  key(x, z) { return (Math.floor((x + this.half) / this.cell)) + ',' + (Math.floor((z + this.half) / this.cell)); }
  ok(x, z, minDist) {
    const c = this.cell, half = this.half;
    const ix = Math.floor((x + half) / c), iz = Math.floor((z + half) / c);
    const r = Math.ceil(minDist / c);
    const d2 = minDist * minDist;
    for (let j = iz - r; j <= iz + r; j++) for (let i = ix - r; i <= ix + r; i++) {
      const list = this.map.get(i + ',' + j);
      if (!list) continue;
      for (let k = 0; k < list.length; k += 2) {
        const dx = list[k] - x, dz = list[k + 1] - z;
        if (dx * dx + dz * dz < d2) return false;
      }
    }
    return true;
  }
  add(x, z) {
    const k = this.key(x, z);
    let l = this.map.get(k);
    if (!l) { l = []; this.map.set(k, l); }
    l.push(x, z);
  }
}

function scatter({ region, seed, rules = {}, kinds = ALL_KINDS, clear: doClear = true } = {}) {
  const w = S.world;
  const r = region || { x0: -w.half, z0: -w.half, x1: w.half, z1: w.half };
  if (doClear) clearRegion(r);
  const rng = seed !== undefined ? S.ctx.rng.fork('scatter:' + seed) : S.ctx.rng.fork('scatter');
  const t0 = performance.now();

  // seed the spacing grid with everything that already exists so re-scatters do not overlap
  const grid = new SpacingGrid(8, w.half);
  for (const it of S.items.values()) grid.add(it.x, it.z);

  for (const kind of kinds) {
    const base = RULES[kind];
    if (!base || !S.species.has(kind)) continue;
    const R = { ...base, ...(rules[kind] || {}) };
    const density = R.density ?? 1;
    const step = R.spacing / Math.sqrt(Math.max(0.05, density));
    const krng = rng.fork(kind);
    const nx = Math.max(1, Math.ceil((r.x1 - r.x0) / step));
    const nz = Math.max(1, Math.ceil((r.z1 - r.z0) / step));
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const x = r.x0 + (i + 0.12 + 0.76 * krng.float()) * step;
        const z = r.z0 + (j + 0.12 + 0.76 * krng.float()) * step;
        if (x < -w.half || x > w.half || z < -w.half || z > w.half) continue;
        if (blocked(x, z)) continue;
        siteInfo(x, z, _si);
        const p = R.weight(_si);
        if (p <= 0 || krng.float() > p) continue;
        if (!grid.ok(x, z, R.minDist)) continue;
        grid.add(x, z);
        placeItem(kind, x, z, { rng: krng });
      }
    }
  }
  ensureGroups();
  S.dirty = true;
  S.scattered = true;
  const n = S.items.size;
  S.stats.trees = 0; S.stats.props = 0;
  for (const it of S.items.values()) (TREE_KINDS.includes(it.kind) ? S.stats.trees++ : S.stats.props++);
  S.ctx.log.info(`[props] scatter: ${n} props (${S.stats.trees} trees) in ${(performance.now() - t0).toFixed(0)} ms`);
  S.ctx.events.emit('props:changed', { x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z1 });
  return n;
}

function clearRegion(region) {
  const w = S.world;
  const r = region || { x0: -w.half, z0: -w.half, x1: w.half, z1: w.half };
  const doomed = [];
  for (const it of S.items.values()) {
    if (it.x < r.x0 || it.x > r.x1 || it.z < r.z0 || it.z > r.z1) continue;
    doomed.push(it.id);
  }
  for (const id of doomed) removeItem(id);
  if (doomed.length) { rebuildCover(); S.dirty = true; }
  return doomed.length;
}

// ---------------------------------------------------------------------------------------------------------
// events
// ---------------------------------------------------------------------------------------------------------

function onTerrainModified(p) {
  if (!S.scattered) return;
  const pad = 8;
  const r = { x0: p.x0 - pad, z0: p.z0 - pad, x1: p.x1 + pad, z1: p.z1 + pad };
  // re-seat everything in the rect on the new height, drop what is now under water or too steep
  const doomed = [];
  for (const it of S.items.values()) {
    if (it.x < r.x0 || it.x > r.x1 || it.z < r.z0 || it.z > r.z1) continue;
    const h = S.world.getHeight(it.x, it.z);
    if (h < waterLevelAt(it.x, it.z) + 0.2) { doomed.push(it.id); continue; }
    it.y = h - (it.kind === 'boulder' ? it.scale * 0.28 : it.kind === 'shrub' || it.kind === 'termite' ? 0.05 : 0.12);
  }
  for (const id of doomed) removeItem(id);
  S.grass?.invalidate(r.x0, r.z0, r.x1, r.z1);
  S.dirty = true;
  if (doomed.length) rebuildCover();
}

function clearFootprint(x0, z0, x1, z1) {
  clearRegion({ x0, z0, x1, z1 });
  S.grass?.invalidate(x0, z0, x1, z1);
  S.ctx.events.emit('props:changed', { x0, z0, x1, z1 });
}

function onRoadAdded(p) {
  const edge = S.world.roads.edges.get(p?.edgeId);
  if (!edge) return;
  const pts = edge.points || [];
  const w = (edge.width || 5) * 0.5 + 1.5;
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (let i = 0; i < pts.length; i += 2) {
    x0 = Math.min(x0, pts[i] - w); x1 = Math.max(x1, pts[i] + w);
    z0 = Math.min(z0, pts[i + 1] - w); z1 = Math.max(z1, pts[i + 1] + w);
  }
  if (!Number.isFinite(x0)) return;
  // remove only props actually on the carriageway
  const doomed = [];
  for (const it of S.items.values()) {
    if (it.x < x0 || it.x > x1 || it.z < z0 || it.z > z1) continue;
    let near = false;
    for (let i = 0; i < pts.length - 2 && !near; i += 2) {
      const ax = pts[i], az = pts[i + 1], bx = pts[i + 2], bz = pts[i + 3];
      const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
      let t = l2 > 0 ? ((it.x - ax) * dx + (it.z - az) * dz) / l2 : 0;
      t = clamp(t, 0, 1);
      const ex = ax + dx * t - it.x, ez = az + dz * t - it.z;
      if (ex * ex + ez * ez < w * w) near = true;
    }
    if (near) doomed.push(it.id);
  }
  for (const id of doomed) removeItem(id);
  if (doomed.length) rebuildCover();
  S.grass?.invalidate(x0, z0, x1, z1);
  S.dirty = true;
}

function onBuildingPlaced(p) {
  const b = S.world.buildings.get(p?.id);
  if (!b) return;
  const r = Math.max(b.w || 8, b.d || 8) * 0.75 + 2;
  clearFootprint(b.x - r, b.z - r, b.x + r, b.z + r);
}

// ---------------------------------------------------------------------------------------------------------
// public API
// ---------------------------------------------------------------------------------------------------------

const api = {
  /** Populate a region using the seeded rules. region {x0,z0,x1,z1} defaults to the world. */
  scatter(opts) { return scatter(opts || {}); },

  /** Place one prop. opts: { variant, scale, rotY, y, id }. Returns its id (or null for an unknown kind). */
  place(kind, x, z, opts = {}) {
    const it = placeItem(kind, x, z, opts);
    if (it) { ensureGroups(); S.dirty = true; S.ctx.events.emit('props:changed', { x0: x - 8, z0: z - 8, x1: x + 8, z1: z + 8 }); }
    return it ? it.id : null;
  },

  /** Remove one prop by id. */
  remove(id) {
    const ok = removeItem(id);
    if (ok) { rebuildCover(); S.dirty = true; }
    return ok;
  },

  /** Remove every prop inside region {x0,z0,x1,z1} (whole world when omitted). Returns the count removed. */
  clear(region) {
    const n = clearRegion(region);
    if (n) S.ctx.events.emit('props:changed', region || { x0: -S.world.half, z0: -S.world.half, x1: S.world.half, z1: S.world.half });
    return n;
  },

  /** Tree/shade cover 0..1 at (x, z) — habitat scoring reads this. */
  coverAt(x, z) {
    if (!S.cover) return 0;
    return S.cover[cellIndexAt(x, z)];
  },

  /** Grazeable grass density 0..1 at (x, z), including the current grazing/regrowth state. */
  grassDensityAt(x, z) { return grassSample(x, z); },

  /** Animals eat: reduce grass in a disc. amount 0..1. Regrows in tick(). */
  graze(x, z, r, amount = 0.25) {
    if (!S.graze) return 0;
    const g = S.world.grid, cell = g.cell, res = g.res, half = S.world.half;
    const i0 = Math.max(0, Math.floor((x - r + half) / cell)), i1 = Math.min(res - 1, Math.ceil((x + r + half) / cell));
    const j0 = Math.max(0, Math.floor((z - r + half) / cell)), j1 = Math.min(res - 1, Math.ceil((z + r + half) / cell));
    let eaten = 0;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const cx = (i + 0.5) * cell - half, cz = (j + 0.5) * cell - half;
      const d = Math.hypot(cx - x, cz - z);
      if (d > r) continue;
      const idx = j * res + i;
      const before = S.graze[idx];
      const after = Math.max(0.06, before - amount * (1 - (d / r) * 0.7));
      S.graze[idx] = after;
      eaten += before - after;
      S.grazed.add(idx);
    }
    if (eaten > 0) {
      S._grazeRect = S._grazeRect || { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity };
      const R = S._grazeRect;
      R.x0 = Math.min(R.x0, x - r); R.x1 = Math.max(R.x1, x + r);
      R.z0 = Math.min(R.z0, z - r); R.z1 = Math.max(R.z1, z + r);
    }
    return eaten;
  },

  /** Every prop kind this module can place. */
  kinds() { return ALL_KINDS.slice(); },

  /** Species metadata: nominal height and crown radius per kind (for placement UIs and habitat scoring). */
  kindInfo(kind) {
    const sp = S.species.get(kind);
    if (!sp) return null;
    const h = sp.variants.reduce((a, v) => a + v.height, 0) / sp.variants.length;
    const c = sp.variants.reduce((a, v) => a + (v.crownR || 0), 0) / sp.variants.length;
    return { kind, type: sp.type, variants: sp.variants.length, height: h, crownR: c, hasImposter: !!sp.hasImposter };
  },

  /** Live counts, for critics and the perf HUD. */
  getStats() {
    return {
      items: S.items.size, trees: S.stats.trees, props: S.stats.props,
      grassInstances: S.grass ? S.grass.instanceCount : 0,
      grassCounts: S.grass ? S.grass.counts.slice() : [0, 0, 0],
      grassChunks: S.grass ? S.grass.near.size + S.grass.far.size : 0,
      instancedMeshesDrawn: S.stats.drawGroups,
      packMs: +S._packMs.toFixed(2), grassRebuildMs: +(S.grass?.lastRebuildMs || 0).toFixed(2),
    };
  },

  /** Turn the grass field on/off (perf debugging). */
  setGrassEnabled(v) { S.grass?.setEnabled(v); },

  /** Force a re-pack on the next frame. */
  refresh() { S.dirty = true; S.camX = 1e9; },
};

// ---------------------------------------------------------------------------------------------------------
// module
// ---------------------------------------------------------------------------------------------------------

const _cam = new THREE.Vector3();

export default {
  id: 'props',
  version: 1,
  dependencies: [],
  optional: ['terrain', 'environment'],
  api,

  async init(ctx) {
    S.ctx = ctx;
    S.world = ctx.world;
    S.rng = ctx.rng.fork('place');
    S.group = new THREE.Group();
    S.group.name = 'props';
    ctx.scene.add(S.group);
    try {
      S.terrain = ctx.modules.get('terrain');
      S.env = ctx.modules.get('environment');
      const gres = S.world.grid.res;
      S.cover = new Float32Array(gres * gres);
      S.graze = new Float32Array(gres * gres).fill(1);
      buildMacro();
      buildMaterials();
      buildSpecies();
      buildImposters();
      S.grass = new GrassField(ctx, S.group, grassSample);
      S.ready = true;
    } catch (err) {
      ctx.log.error('[props] init failed', err);
      return;
    }

    ctx.events.on('terrain:ready', () => {
      S.terrain = ctx.modules.get('terrain');
      S.grass?.clearCache();
      if (!ctx.isShowcase) { try { scatter({}); } catch (e) { ctx.log.error('[props] scatter failed', e); } }
      S.dirty = true;
    });
    ctx.events.on('terrain:modified', (p) => onTerrainModified(p));
    ctx.events.on('road:added', (p) => onRoadAdded(p));
    ctx.events.on('road:changed', (p) => onRoadAdded(p));
    ctx.events.on('building:placed', (p) => onBuildingPlaced(p));

    // In the full game the terrain is generated during its own init(), i.e. before ours, so the
    // terrain:ready above has already fired. Scatter now.
    if (!ctx.isShowcase && S.terrain) {
      try { scatter({}); } catch (err) { ctx.log.error('[props] initial scatter failed', err); }
    }
  },

  update(dt, t) {
    if (!S.ready) return;
    S._t += dt;
    const cam = S.ctx.camera;
    const tgt = S.ctx.rig?.target;
    // grass ring centre: between the camera's ground point and what it is looking at, so both a
    // low eye-level view and a tilted overview keep grass in the foreground.
    const gx = tgt ? cam.position.x * 0.45 + tgt.x * 0.55 : cam.position.x;
    const gz = tgt ? cam.position.z * 0.45 + tgt.z * 0.55 : cam.position.z;
    const g0 = performance.now();
    S.grass?.update(gx, gz, 14);
    S._grassMs = performance.now() - g0;

    const dx = cam.position.x - S.camX, dz = cam.position.z - S.camZ;
    if (S.dirty || dx * dx + dz * dz > 64) {
      S.camX = cam.position.x; S.camZ = cam.position.z;
      S.dirty = false;
      pack(S.camX, S.camZ);
    }
  },

  tick(simDt) {
    if (!S.graze || !S.grazed.size) return;
    // regrowth: ~4 % of the missing density per game-hour, faster where it is wetter
    const rate = 0.045 * simDt;
    const done = [];
    for (const idx of S.grazed) {
      const v = S.graze[idx] + (1 - S.graze[idx]) * rate;
      S.graze[idx] = v > 0.999 ? 1 : v;
      if (S.graze[idx] >= 0.999) done.push(idx);
    }
    for (const i of done) S.grazed.delete(i);
    S._regrowAcc = (S._regrowAcc || 0) + simDt;
    if (S._grazeRect && S._regrowAcc > 2) {
      S._regrowAcc = 0;
      const R = S._grazeRect;
      S.grass?.invalidate(R.x0, R.z0, R.x1, R.z1);
      S._grazeRect = null;
    }
  },

  dispose() {
    S.grass?.dispose(); S.grass = null;
    for (const sp of S.species.values()) {
      for (const v of sp.variants) {
        for (const g of v.groups) g?.dispose();
        for (const parts of v.lodParts) for (const p of parts) p.geo?.dispose();
      }
      for (const v of sp.variants) {
        v.imposterGroup?.dispose();
        if (!v.imposter) continue;
        v.imposter.texture?.userData?.renderTarget?.dispose();
        S.ctx.materials.untrack(v.imposter.mat); v.imposter.mat.dispose();
      }
    }
    for (const m of Object.values(S.mats)) { if (m?.isMaterial) { S.ctx.materials.untrack(m); m.dispose(); } }
    S.ctx?.textures.dispose('props:bark:acacia'); S.ctx?.textures.dispose('props:bark:fever');
    S.ctx?.textures.dispose('props:bark:baobab'); S.ctx?.textures.dispose('props:bark:dead');
    S.ctx?.textures.dispose('props:granite'); S.ctx?.textures.dispose('props:clay');
    S.imposterGeo?.dispose(); S.imposterGeo = null;
    S.species.clear(); S.items.clear(); S.byKind.clear();
    S.mats = {}; S.cover = null; S.graze = null; S.grazed.clear(); S.macro = null;
    S.group?.removeFromParent(); S.group = null;
    S.ready = false; S.scattered = false;
  },

  showcase: { presets, stage },
};
