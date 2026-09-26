// plants.js — draws the P1 food-web plant catalogue (core/Plants.js, docs/specs/p1-food-web.md)
// from `world.vegetation` cover. Additive layer: coexists with index.js's own biome-driven
// scatter()/GrassField rather than replacing them — see README "Known gaps" for why merging cover
// into RULES/GrassField was judged too invasive for this wave (both are tuned, critic-passed
// systems keyed on biome/macro-noise, not per-plant cover).
//
// Placement is deterministic per 16 m vegetation cell: `_rebuildCell` forks a cell-keyed RNG from
// `ctx.rng` and re-derives that cell's instances from cover alone, so re-running it for the same
// cover is idempotent. `rebuildRect` re-derives only the cells overlapping the changed rect; the
// (cheap, capacity-bounded) GPU repack that turns the live per-cell records into instance buffers
// is throttled to REBUILD_THROTTLE seconds, batching bursts of `vegetation:changed` events.
import * as THREE from 'three';
import { PLANTS, PLANT_INDEX } from '../../core/Plants.js';
import { growCanopy, bakeBark, bakeLeafDisc } from './trees.js';
import { buildShrub } from './rocks.js';
import { buildTuft } from './grass.js';

const REBUILD_THROTTLE = 0.5; // seconds — contract: "throttled to at most once per 0.5 s"
const CULL_DIST = 300;        // metres — hard-cut beyond this (see README known gaps: no LOD tier)

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

const GRASS_IDS = ['red_oat', 'couch', 'lovegrass', 'sedge'];
// linear-RGB tint per grass species (author true colours — see CLAUDE.md § Colour authoring).
const GRASS_TINT = {
  red_oat: [0.300, 0.160, 0.050],   // golden red-oat
  couch: [0.205, 0.240, 0.075],     // yellow-green couch
  lovegrass: [0.330, 0.285, 0.155], // silvery drought-tan
  sedge: [0.070, 0.160, 0.060],     // deep wetland green
};
const GRASS_MAX_PER_CELL = 8;   // per grass id, at cover = 1
const SHRUB_MAX_PER_CELL = 3;
const TREE_MAX_PER_CELL = 2;

// ---------------------------------------------------------------------------------------------------------
// new geometry (reuses trees.js/rocks.js/grass.js generators per docs/specs/p1-food-web.md §props.1)
// ---------------------------------------------------------------------------------------------------------

/** Aloe marlothii rosette: thick tapered blades radiating from a low centre, tips curling upward. */
function buildAloeGeo(rng) {
  const pos = [], nrm = [], uv = [], idx = [];
  const blades = rng.int(13, 18);
  const R = rng.range(0.45, 0.70);
  for (let b = 0; b < blades; b++) {
    const a = (b / blades) * Math.PI * 2 + rng.gaussian(0, 0.22);
    const ca = Math.cos(a), sa = Math.sin(a);
    const len = R * rng.range(0.78, 1.05);
    const w = R * rng.range(0.16, 0.22);
    const curl = rng.range(0.55, 0.95); // fraction of length that arcs upward
    const segs = 3;
    const base = pos.length / 3;
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      const rr = t * len;
      const y = Math.pow(t, 1.6) * len * curl * 0.42;
      const hw = w * 0.5 * (1 - t * 0.82);
      let nx = ca * 0.55, ny = 1.0, nz = sa * 0.55;
      const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
      if (s === segs) {
        pos.push(ca * rr, y, sa * rr); nrm.push(nx, ny, nz); uv.push(0.5, t);
      } else {
        pos.push(ca * rr - sa * hw, y, sa * rr + ca * hw); nrm.push(nx, ny, nz); uv.push(0, t);
        pos.push(ca * rr + sa * hw, y, sa * rr - ca * hw); nrm.push(nx, ny, nz); uv.push(1, t);
      }
    }
    for (let s = 0; s < segs - 1; s++) {
      const i0 = base + s * 2;
      idx.push(i0, i0 + 2, i0 + 3, i0, i0 + 3, i0 + 1);
    }
    const last = base + (segs - 1) * 2;
    idx.push(last, last + 2, last + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/** Knobthorn (Senegalia nigrescens): gnarled, wider-spreading crown than the umbrella thorn, less flat. */
function knobthornSkeleton(rng) {
  const H = rng.range(7.5, 12.5);
  const trunkH = H * rng.range(0.34, 0.42);
  const crownR = H * rng.range(0.52, 0.68);
  const crownDepth = H * rng.range(0.20, 0.28);
  const sk = growCanopy(rng, {
    H, trunkH,
    trunkR: H * rng.range(0.034, 0.044),
    crownR, crownDepth,
    crownPow: 2.2,
    limbs: rng.int(4, 6),
    maxDepth: 5, forkP: 0.70, forkFrom: 1, jitter: 0.20, taper: 0.75, stepF: 0.48, lean: 0.09,
  });
  sk.crownDepth = crownDepth; sk.crownPow = 2.2;
  return sk;
}

/** Marula (Sclerocarya birrea): tall single trunk, round dome crown. */
function marulaSkeleton(rng) {
  const H = rng.range(9.0, 14.0);
  const trunkH = H * rng.range(0.42, 0.52);
  const crownR = H * rng.range(0.42, 0.56);
  const crownDepth = H * rng.range(0.30, 0.40);
  const sk = growCanopy(rng, {
    H, trunkH,
    trunkR: H * rng.range(0.032, 0.040),
    crownR, crownDepth,
    crownPow: 1.5,
    limbs: rng.int(4, 6),
    maxDepth: 5, forkP: 0.68, forkFrom: 0, jitter: 0.15, taper: 0.77, stepF: 0.48, lean: 0.06,
  });
  sk.crownDepth = crownDepth; sk.crownPow = 1.5;
  return sk;
}

/**
 * Build every new geometry + material the vegetation layer needs. `mats`/`species` come from
 * index.js's already-built props materials/species so umbrella_thorn and baobab reuse the exact
 * same textured bark/leaf as the existing acacia/baobab scatter (no new textures, per "reusing the
 * existing generators"). Returns { assets, ownedGeo, ownedMat } — `ownedGeo`/`ownedMat` are what
 * this factory allocated itself (excludes anything borrowed from `mats`/`species`), for dispose().
 */
export function buildPlantAssets(ctx, mats, species) {
  const ownedGeo = [], ownedMat = [];
  const rng = ctx.rng.fork('plants-assets');

  const grassGeo = buildTuft(rng.fork('grass-tuft'), { blades: 5, segments: 3, height: 1, width: 0.036, lean: 0.38, spread: 0.11, mat: 0 });
  const grassMat = ctx.materials.standard({ color: 0xffffff, roughness: 1.0, metalness: 0, side: THREE.DoubleSide, vertexColors: true });
  grassMat.userData.cacheKeyExtra = 'plants:grass';
  ctx.materials.withWind(grassMat, { strength: 0.14, pivotY: 0.0, frequency: 1.6 });
  ownedGeo.push(grassGeo); ownedMat.push(grassMat);

  const aloeGeo = buildAloeGeo(rng.fork('aloe'));
  const aloeMat = ctx.materials.standard({ color: 0x69785a, roughness: 0.55, metalness: 0, side: THREE.DoubleSide });
  aloeMat.userData.cacheKeyExtra = 'plants:aloe';
  ownedGeo.push(aloeGeo); ownedMat.push(aloeMat);

  const sourPlum = buildShrub(rng.fork('sour_plum'), { height: rng.range(1.1, 1.9), cards: 18, cardSize: 0.75, stems: 4 });
  ownedGeo.push(sourPlum.stem, sourPlum.leaf);

  const knobSkel = knobthornSkeleton(rng.fork('knobthorn'));
  const knobBark = bakeBark(knobSkel, { lod: 0, vScale: 1.4 });
  const knobLeaf = bakeLeafDisc(knobSkel, rng.fork('knobthorn-leaf'), { count: 520, size: knobSkel.crownR * 0.28, tiltBias: 0.45, aspect: 0.85, ragged: 0.20, snap: 0.24, roof: 50 });
  ownedGeo.push(knobBark, knobLeaf);

  const marulaSkel = marulaSkeleton(rng.fork('marula'));
  const marulaBark = bakeBark(marulaSkel, { lod: 0, vScale: 1.4 });
  const marulaLeaf = bakeLeafDisc(marulaSkel, rng.fork('marula-leaf'), { count: 480, size: marulaSkel.crownR * 0.30, tiltBias: 0.45, aspect: 0.9, ragged: 0.24, snap: 0.30, roof: 46 });
  ownedGeo.push(marulaBark, marulaLeaf);

  const acaciaV = species.get('acacia')?.variants[0];
  const baobabV = species.get('baobab')?.variants[0];

  const assets = {
    grass: { geo: grassGeo, mat: grassMat },
    aloe: { geo: aloeGeo, mat: aloeMat },
    sour_plum: { bark: sourPlum.stem, leaf: sourPlum.leaf, barkMat: mats.shrubStem, leafMat: mats.leafScrub },
    umbrella_thorn: { bark: acaciaV?.lodParts[0][0]?.geo, leaf: acaciaV?.lodParts[0][1]?.geo, barkMat: mats.barkAcacia, leafMat: mats.leafAcacia },
    knobthorn: { bark: knobBark, leaf: knobLeaf, barkMat: mats.barkFever, leafMat: mats.leafBroad },
    marula: { bark: marulaBark, leaf: marulaLeaf, barkMat: mats.barkBaobab, leafMat: mats.leafBroad },
    baobab: { bark: baobabV?.lodParts[0][0]?.geo, leaf: baobabV?.lodParts[0][1]?.geo, barkMat: mats.barkBaobab, leafMat: mats.leafBroad },
  };
  return { assets, ownedGeo, ownedMat };
}

// ---------------------------------------------------------------------------------------------------------
// instanced draw groups
// ---------------------------------------------------------------------------------------------------------

class MeshGroup {
  constructor(parts, cap, name, withColor = false) {
    this.cap = Math.max(4, cap);
    this.count = 0;
    this.meshes = parts.filter((p) => p && p.geo).map((p) => {
      const m = new THREE.InstancedMesh(p.geo, p.mat, this.cap);
      m.name = name;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.castShadow = true; m.receiveShadow = true;
      m.frustumCulled = false;
      m.count = 0;
      return m;
    });
    if (withColor && this.meshes[0]) {
      const ic = new THREE.InstancedBufferAttribute(new Float32Array(this.cap * 3), 3);
      ic.setUsage(THREE.DynamicDrawUsage);
      this.meshes[0].instanceColor = ic;
    }
  }
  addTo(group) { for (const m of this.meshes) group.add(m); return this; }
  reset() { this.count = 0; }
  write(mtx, color) {
    if (this.count >= this.cap) return false;
    const o = this.count * 16;
    for (const m of this.meshes) m.instanceMatrix.array.set(mtx.elements, o);
    const ic = this.meshes[0]?.instanceColor;
    if (color && ic) { const co = this.count * 3; ic.array[co] = color[0]; ic.array[co + 1] = color[1]; ic.array[co + 2] = color[2]; }
    this.count++;
    return true;
  }
  finish() {
    for (const m of this.meshes) {
      m.count = this.count; m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }
  dispose() { for (const m of this.meshes) m.removeFromParent(); this.meshes.length = 0; }
}

// ---------------------------------------------------------------------------------------------------------
// vegetation layer
// ---------------------------------------------------------------------------------------------------------

const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scl = new THREE.Vector3();
const _mtx = new THREE.Matrix4();
const _euler = new THREE.Euler();

const KINDS = ['sour_plum', 'umbrella_thorn', 'knobthorn', 'marula', 'baobab'];
const ALL_KINDS = ['aloe', ...KINDS];
// The biome scatter (index.js) already draws the seeded natural vegetation; draw only cover above that
// baseline (planting, spread, regrowth) so the two layers never double up. Cover grazed below the
// baseline is not shown as thinning (known gap).
function drawnCover(v, k) { const n = v.natural ? v.natural[k] : 0; const c = v.cover[k] - n; return c > 0 ? c : 0; }

const CAPS = { grass: 8000, aloe: 400, sour_plum: 400, umbrella_thorn: 300, knobthorn: 300, marula: 300, baobab: 150 };

export class VegetationLayer {
  constructor(ctx, parentGroup, assets) {
    this.ctx = ctx;
    this.world = ctx.world;
    this.group = new THREE.Group();
    this.group.name = 'props-plants';
    parentGroup.add(this.group);

    this.groups = {
      grass: new MeshGroup([assets.grass], CAPS.grass, 'props-plants-grass', true),
      aloe: new MeshGroup([assets.aloe], CAPS.aloe, 'props-plants-aloe'),
    };
    for (const k of KINDS) {
      const a = assets[k];
      this.groups[k] = new MeshGroup([{ geo: a.bark, mat: a.barkMat }, { geo: a.leaf, mat: a.leafMat }], CAPS[k], 'props-plants-' + k);
    }
    for (const g of Object.values(this.groups)) g.addTo(this.group);

    this.cells = new Map();  // cellIndex -> { grass:[], aloe:[], ... }
    this.dirty = false;
    this._acc = 0;
    this._everPacked = false;
    this.lastRepackMs = 0;
    this.camX = 1e9; this.camZ = 1e9;
  }

  /** Re-derive placement for every vegetation cell overlapping the world-space rect. */
  rebuildRect(x0, z0, x1, z1) {
    const v = this.world.vegetation, res = v.res, cell = v.cell, half = this.world.half;
    let i0 = Math.floor((x0 + half) / cell), i1 = Math.ceil((x1 + half) / cell);
    let j0 = Math.floor((z0 + half) / cell), j1 = Math.ceil((z1 + half) / cell);
    i0 = clamp(i0, 0, res - 1); i1 = clamp(i1, 0, res - 1);
    j0 = clamp(j0, 0, res - 1); j1 = clamp(j1, 0, res - 1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) this._rebuildCell(i, j);
    this.dirty = true;
    // first population, or a one-shot showcase render: pack immediately, do not wait on the throttle.
    if (!this._everPacked || this.ctx.isShowcase) { this._repack(); this._acc = 0; }
  }

  /** Instance count for one cell/plant. A tree's maxCover ceiling (e.g. baobab 0.15) is low enough
   * that a flat cover*maxPerCell would round down to 0 almost everywhere even at that plant's own
   * full cover — any cell with meaningfully non-zero cover gets at least one individual instead. */
  _densityCount(cover, maxPerCell, rng, maxCover = 1) {
    if (cover <= 0.01) return 0;
    const f = cover * maxPerCell;
    let n = Math.floor(f);
    if (rng.float() < f - n) n++;
    // guaranteed individual only for a substantial share of the plant's own ceiling (a planted patch);
    // small growth above the natural baseline stays probabilistic so it does not sprout a tree per cell
    return cover >= 0.5 * maxCover ? Math.max(1, n) : n;
  }

  _emit(list, rng, count, x0, z0, cellSize, yOffset, scaleRange, extra) {
    const w = this.world;
    for (let i = 0; i < count; i++) {
      const x = x0 + rng.float() * cellSize;
      const z = z0 + rng.float() * cellSize;
      const y = w.getHeight(x, z) + yOffset;
      const rotY = rng.range(0, Math.PI * 2);
      const scale = rng.range(scaleRange[0], scaleRange[1]);
      list.push(extra ? { x, y, z, rotY, scale, color: extra } : { x, y, z, rotY, scale });
    }
  }

  _rebuildCell(ix, iz) {
    const v = this.world.vegetation, res = v.res, cellSize = v.cell, half = this.world.half;
    const idx = iz * res + ix;
    const x0 = ix * cellSize - half, z0 = iz * cellSize - half;
    const rng = this.ctx.rng.fork('plants:cell:' + idx);

    let anyCover = false;
    const rec = {};

    rec.grass = [];
    for (const id of GRASS_IDS) {
      const cover = drawnCover(v, PLANT_INDEX[id] * res * res + idx);
      if (cover <= 0.01) continue;
      anyCover = true;
      const n = this._densityCount(cover, GRASS_MAX_PER_CELL, rng, PLANTS[PLANT_INDEX[id]].maxCover);
      this._emit(rec.grass, rng, n, x0, z0, cellSize, -0.02, [0.78, 1.25], GRASS_TINT[id]);
    }

    for (const id of ['aloe', 'sour_plum']) {
      const cover = drawnCover(v, PLANT_INDEX[id] * res * res + idx);
      rec[id] = [];
      if (cover <= 0.01) continue;
      anyCover = true;
      const n = this._densityCount(cover, SHRUB_MAX_PER_CELL, rng, PLANTS[PLANT_INDEX[id]].maxCover);
      this._emit(rec[id], rng, n, x0, z0, cellSize, -0.04, [0.75, 1.30]);
    }

    for (const id of ['umbrella_thorn', 'knobthorn', 'marula', 'baobab']) {
      const cover = drawnCover(v, PLANT_INDEX[id] * res * res + idx);
      rec[id] = [];
      if (cover <= 0.01) continue;
      anyCover = true;
      const n = this._densityCount(cover, TREE_MAX_PER_CELL, rng, PLANTS[PLANT_INDEX[id]].maxCover);
      this._emit(rec[id], rng, n, x0, z0, cellSize, -0.12, [0.68, 1.15]);
    }

    if (anyCover) this.cells.set(idx, rec); else this.cells.delete(idx);
  }

  _packList(list, group, cam, isGrass) {
    if (!list || !list.length) return;
    const cx = cam.position.x, cz = cam.position.z;
    for (const it of list) {
      const dx = it.x - cx, dz = it.z - cz;
      if (dx * dx + dz * dz > CULL_DIST * CULL_DIST) continue;
      _pos.set(it.x, it.y, it.z);
      _euler.set(0, it.rotY, 0, 'YXZ'); _quat.setFromEuler(_euler);
      _scl.set(it.scale, it.scale, it.scale);
      _mtx.compose(_pos, _quat, _scl);
      group.write(_mtx, isGrass ? it.color : null);
    }
  }

  _repack() {
    const t0 = performance.now();
    for (const g of Object.values(this.groups)) g.reset();
    const cam = this.ctx.camera;
    for (const rec of this.cells.values()) {
      this._packList(rec.grass, this.groups.grass, cam, true);
      for (const k of ALL_KINDS) this._packList(rec[k], this.groups[k], cam, false);
    }
    for (const g of Object.values(this.groups)) g.finish();
    this._everPacked = true;
    this.dirty = false;
    this.camX = cam.position.x; this.camZ = cam.position.z;
    this.lastRepackMs = performance.now() - t0;
  }

  update(dt) {
    // Cell records only change on rebuildRect (vegetation:changed / initial state), throttled here;
    // the pack step also culls by camera distance (CULL_DIST), so a camera move past the same 8 m
    // threshold index.js's own pack() uses must re-pack too, independent of the throttle — otherwise
    // a static scene whose camera moves after the last vegetation write (e.g. a showcase preset
    // positioning its camera post-stage) would stay packed against a stale, now-wrong camera position.
    const cam = this.ctx.camera;
    const dx = cam.position.x - this.camX, dz = cam.position.z - this.camZ;
    const moved = dx * dx + dz * dz > 64;
    if (this.dirty) {
      this._acc += dt;
      if (this._acc >= REBUILD_THROTTLE) { this._acc = 0; this._repack(); return; }
    }
    if (moved) this._repack();
  }

  dispose() {
    for (const g of Object.values(this.groups)) g.dispose();
    this.group.removeFromParent();
    this.cells.clear();
    for (const g of this._ownedGeo || []) g?.dispose();
    for (const m of this._ownedMat || []) { this.ctx.materials.untrack(m); m?.dispose(); }
  }
}
