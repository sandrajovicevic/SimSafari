// animals — species catalogue, procedurally modelled/textured/animated animals, needs & behaviour.
// Rendering: one pool per (species, variant). A pool owns the near geometry, a half-detail far LOD,
// baked skin textures, a float bone texture (one row per animal) and two InstancedMeshes; so every
// animal of a species is drawn in ONE draw call (+1 shadow pass for the near mesh).
import * as THREE from 'three';
import { SPECIES, SPECIES_IDS, speciesInfo } from './species.js';
import { buildAnimal } from './builder.js';
import { bakePositionMaps } from './geom.js';
import { bakeSkin, makeMaterials, skinSize } from './skin.js';
import { evalPose } from './anim.js';
import { Behaviour, STEP, STATES, wantsSleep } from './behaviour.js';
import { presets, stage } from './showcase.js';

const LOD_FAR = 250;      // beyond: half-detail rigid-pose instances, no shadow
const CULL_DIST = 1400;
const START_CAPACITY = 32;

let ctx = null, group = null, S = null, beh = null, acc = 0, shadows = null;
const pools = new Map();

const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _m = new THREE.Matrix4(), _fwd = new THREE.Vector3();
const _sp = new THREE.Vector3(), _ss = new THREE.Vector3(), _sq = new THREE.Quaternion(), _sq2 = new THREE.Quaternion(), _se = new THREE.Euler(), _sm = new THREE.Matrix4(), _sn = new THREE.Vector3(), _sun = new THREE.Vector3(), _lt = new THREE.Vector3();
const UP_Y = new THREE.Vector3(0, 1, 0);

/**
 * Contact shadows. Round 2 originally shipped this as the PRIMARY grounding cue because
 * `terrain/mesh.js` had `receiveShadow = false`, so the real shadow this module already casts
 * (`castShadow` + an animated `customDepthMaterial`) had nowhere to land. That core bug is now fixed
 * (terrain receives; the core fallback ground always did) and real shadows look correct on their own —
 * verified by A/B: hiding this mesh still leaves a full, correctly-shaped, soft-edged cast shadow.
 * So this is now demoted to a small, low-opacity contact-AO term only: it tightens the darkening
 * exactly at the feet/belly where a shadow map's bias or a coarse terrain LOD can leave a visible gap,
 * and it is deliberately weak and undirected (no sun offset) so it cannot be mistaken for a second,
 * misaligned shadow next to the real one. ONE extra draw call for the whole module either way.
 */
class ContactShadows {
  constructor() {
    this.geo = ContactShadows.disc(6, 40);
    this.material = new THREE.MeshBasicMaterial({
      color: 0x000000, vertexColors: true, transparent: true, depthWrite: false, toneMapped: false,
      opacity: 0.30, side: THREE.DoubleSide, fog: false,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8,
    });
    this.mesh = null; this.capacity = 0; this.n = 0;
    this.sunY = 1; this.sunX = 0; this.sunZ = 0; this.strength = 1;
    this._grow(64);
  }

  /**
   * A radial disc of unit diameter in XZ. Coverage is carried by per-vertex ALPHA (RGBA colour
   * attribute) rather than a texture, and the rim curls down in local Y so that when the instance
   * is scaled it sinks into the terrain instead of hovering over its micro-relief.
   */
  static disc(rings, segs) {
    const nv = 1 + rings * segs;
    const pos = new Float32Array(nv * 3), col = new Float32Array(nv * 4);
    const idx = [];
    const put = (i, x, y, z, a) => {
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      col[i * 4] = 1; col[i * 4 + 1] = 1; col[i * 4 + 2] = 1; col[i * 4 + 3] = a;
    };
    // solid core under the body, smooth penumbra out to the rim
    const cover = (r) => {
      const t = Math.min(1, Math.max(0, (r - 0.38) / 0.62));
      return 1 - t * t * (3 - 2 * t);
    };
    put(0, 0, 0, 0, cover(0));
    for (let ri = 0; ri < rings; ri++) {
      const r = (ri + 1) / rings;
      for (let si = 0; si < segs; si++) {
        const ang = (si / segs) * Math.PI * 2;
        // deterministic rim wobble so the shadow is not a perfect ellipse
        const wob = 1 + 0.09 * Math.sin(ang * 3 + ri * 2.1) + 0.05 * Math.sin(ang * 7 + 1.3);
        const rr = r * (ri === rings - 1 ? wob : 1);
        put(1 + ri * segs + si, Math.sin(ang) * rr * 0.5, -Math.pow(r, 4), Math.cos(ang) * rr * 0.5, cover(rr));
      }
    }
    for (let si = 0; si < segs; si++) idx.push(0, 1 + si, 1 + ((si + 1) % segs));
    for (let ri = 0; ri < rings - 1; ri++) {
      const a0 = 1 + ri * segs, b0 = 1 + (ri + 1) * segs;
      for (let si = 0; si < segs; si++) {
        const sn = (si + 1) % segs;
        idx.push(a0 + si, b0 + si, a0 + sn, a0 + sn, b0 + si, b0 + sn);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 4));
    g.setIndex(idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }

  _grow(cap) {
    const old = this.mesh;
    const m = new THREE.InstancedMesh(this.geo, this.material, cap);
    m.name = 'animals:contact-shadows';
    m.frustumCulled = false; m.castShadow = false; m.receiveShadow = false; m.count = 0;
    m.renderOrder = 2;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(m);
    if (old) { group.remove(old); old.dispose(); }
    this.mesh = m; this.capacity = cap;
  }

  /** Find the scene's sun once per time change (environment's sun, or core's fallback sun). */
  refreshSun() {
    let best = null, bestI = -1;
    ctx.scene.traverse((o) => { if (o.isDirectionalLight && o.intensity > bestI) { best = o; bestI = o.intensity; } });
    if (!best) { this.sunY = 1; this.sunX = this.sunZ = 0; this.strength = 0.85; return; }
    _sun.copy(best.position);
    if (best.target) { best.target.updateWorldMatrix(true, false); _lt.setFromMatrixPosition(best.target.matrixWorld); _sun.sub(_lt); }
    if (_sun.lengthSq() < 1e-6) _sun.set(0, 1, 0);
    _sun.normalize();
    this.sunX = _sun.x; this.sunY = Math.max(0.05, _sun.y); this.sunZ = _sun.z;
    // fade with sun elevation, but never to nothing: an animal always occludes the sky above it (AO).
    this.strength = 0.34 + 0.66 * Math.min(1, Math.max(0, _sun.y) * 2.2);
  }

  begin(n) {
    if (n > this.capacity) this._grow(Math.max(n, this.capacity * 2));
    this.n = 0;
  }

  /** a: animal, w/l: footprint half-extents in metres at scale 1. */
  add(a, w, l) {
    const k = this.n;
    if (k >= this.capacity) return;
    const world = S.world;
    // small, centred AO puddle — no sun offset/stretch, that shaping now belongs to the real shadow
    const spread = (1 + 0.4 * a._lieW) * a._scale;
    const sw = w * 1.3 * spread, sl = l * 1.3 * spread, big = Math.max(sw, sl);
    const cx = a.x, cz = a.z;
    // A heightfield wanders several cm under a footprint metres across, which buries a flat quad.
    // Sit on the HIGHEST ground under the quad, sampled at the quad's own centre and rim.
    const ch = Math.cos(a.heading), sh = Math.sin(a.heading);
    const ew = sw * 0.32, el = sl * 0.32;
    let gy = world.getHeight(cx, cz);
    for (let q = 0; q < 8; q++) {
      const ang = q * (Math.PI / 4), lx = Math.sin(ang) * ew, lz = Math.cos(ang) * el;
      const hh = world.getHeight(cx + lx * ch + lz * sh, cz - lx * sh + lz * ch);
      if (hh > gy) gy = hh;
    }
    // ground normal so the ellipse lies along a slope instead of hovering over it
    _sn.set(0, 1, 0);
    if (world.getNormal) { try { world.getNormal(cx, cz, _sn); _sn.normalize(); if (!(_sn.y > 0.2)) _sn.set(0, 1, 0); } catch { _sn.set(0, 1, 0); } }
    _sp.set(cx, gy + 0.05 + 0.022 * big, cz);
    _sq.setFromUnitVectors(UP_Y, _sn);
    _se.set(0, a.heading, 0, 'YXZ');
    _sq.multiply(_sq2.setFromEuler(_se));
    _ss.set(sw, 0.045 * big, sl);       // Y scales the domed rim, which sinks into the ground
    _sm.compose(_sp, _sq, _ss);
    this.mesh.instanceMatrix.array.set(_sm.elements, k * 16);
    this.n++;
  }

  end() {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.material.opacity = 0.30 * this.strength;
    this.material.visible = this.n > 0;
  }

  dispose() {
    group.remove(this.mesh); this.mesh.dispose();
    this.geo.dispose(); this.material.dispose();
  }
}

class Pool {
  constructor(spec, variant) {
    this.key = `${spec.id}:${variant}`;
    this.spec = spec; this.variant = variant;
    const hi = buildAnimal(spec, { detail: 1, variant });
    const lo = buildAnimal(spec, { detail: 0.5, variant });
    this.rig = hi.rig; this.dims = hi.dims; this.eyes = hi.eyes;
    this.geoHi = hi.geometry; this.geoLo = lo.geometry;
    const Bd = spec.body;
    this.shW = (Bd.bellyW + Bd.chestW) * 0.5 * 0.48;                       // half-width of the footprint
    this.shL = (Bd.bodyLen + Bd.rumpLen + Bd.chestLen) * 0.40;             // half-length
    this.trisHi = hi.triangles; this.trisLo = lo.triangles;
    const size = skinSize(ctx, spec);
    const maps = bakePositionMaps(hi.geometry, size);
    this.tex = bakeSkin(ctx, spec, variant, maps, hi.eyes, S.rng.fork('skin:' + this.key).float() * 100);
    maps.pos.dispose(); maps.info.dispose();
    this.nb = this.rig.count;
    this.capacity = 0;
    this.free = [];
    this.uBones = { value: null };
    const mats = makeMaterials(ctx, this.tex, this.uBones);
    this.material = mats.material; this.depthMaterial = mats.depthMaterial;
    this.meshHi = null; this.meshLo = null;
    this.animals = [];
    this._allocate(START_CAPACITY);
  }

  _allocate(cap) {
    const nb = this.nb;
    const arr = new Float32Array(nb * 16 * cap);
    if (this.boneArr) arr.set(this.boneArr);
    else for (let i = 0; i < cap; i++) this.rig.writeIdentity(arr, i * nb * 16);
    const tex = new THREE.DataTexture(arr, nb * 4, cap, THREE.RGBAFormat, THREE.FloatType);
    tex.minFilter = tex.magFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.needsUpdate = true;
    const old = this.uBones.value;
    this.uBones.value = tex; this.boneArr = arr;
    if (old) old.dispose();
    for (let i = this.capacity; i < cap; i++) this.free.push(i);
    this.capacity = cap;
    // meshes
    const mk = (geo, shadow) => {
      geo.setAttribute('aSlot', new THREE.InstancedBufferAttribute(new Float32Array(cap), 1));
      const m = new THREE.InstancedMesh(geo, this.material, cap);
      m.name = `animals:${this.key}:${shadow ? 'near' : 'far'}`;
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
      m.customDepthMaterial = this.depthMaterial;
      m.castShadow = shadow; m.receiveShadow = true; m.frustumCulled = false; m.count = 0;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      group.add(m);
      return m;
    };
    if (this.meshHi) { group.remove(this.meshHi, this.meshLo); this.meshHi.dispose(); this.meshLo.dispose(); }
    this.meshHi = mk(this.geoHi, true);
    this.meshLo = mk(this.geoLo, false);
  }

  alloc() {
    if (!this.free.length) this._allocate(this.capacity * 2);
    return this.free.pop();
  }
  release(slot) { this.free.push(slot); }

  dispose() {
    group.remove(this.meshHi, this.meshLo);
    this.meshHi.dispose(); this.meshLo.dispose();
    this.geoHi.dispose(); this.geoLo.dispose();
    this.material.dispose(); this.depthMaterial.dispose(); ctx.materials.untrack(this.material);
    this.uBones.value?.dispose();
    for (const k of this.tex.keys) ctx.textures.dispose(k);
  }
}

function getPool(spec, variant) {
  const key = `${spec.id}:${variant}`;
  let p = pools.get(key);
  if (!p) { p = new Pool(spec, variant); pools.set(key, p); }
  return p;
}

function variantFor(spec, sex) {
  if (spec.id === 'lion' || spec.id === 'impala') return sex === 'male' ? 'male' : 'female';
  return 'default';
}

function newHerd(spec, x, z, r, count) {
  const id = S.nextHerd++;
  const spread = Math.max(6, Math.sqrt(count) * spec.body.bodyLen * 2.2);
  const h = { id, species: spec.id, members: [], home: { x, z, r }, tx: x, tz: z, cx: x, cz: z, timer: S.rng.range(5, 20), intent: 'graze', water: null, spread };
  S.herds.set(id, h);
  return h;
}

function snapBlends(a) { for (let i = 0; i < 3; i++) beh.integrate(a, 5, false); a._posed = false; }

function defaultState(spec, hour) {
  if (wantsSleep(spec, hour)) return 'sleep';
  if (spec.predator) return S.rng.float() < 0.6 ? 'rest' : 'idle';
  return S.rng.float() < 0.7 ? 'graze' : 'idle';
}

function spawn(species, x, z, count = 1, opts = {}) {
  const spec = SPECIES[species];
  if (!spec) { ctx.log.warn(`unknown species "${species}"`); return []; }
  const rng = S.rng, world = S.world;
  const ids = [];
  const herd = opts.herd !== undefined ? S.herds.get(opts.herd) : newHerd(spec, x, z, opts.homeRadius ?? (count > 1 ? 35 + count * 3 : 25), count);
  const baseHeading = opts.heading ?? rng.float() * Math.PI * 2;
  const spacing = spec.body.bodyLen * 1.6 + 0.6;
  const cluster = opts.spread ?? Math.max(spacing * 1.2, Math.sqrt(count) * spacing * 0.9);
  for (let i = 0; i < count; i++) {
    let px = x, pz = z;
    if (count > 1 || opts.spread) {
      for (let tries = 0; tries < 16; tries++) {
        const ang = rng.float() * Math.PI * 2, rad = Math.sqrt(rng.float()) * cluster;
        px = x + Math.cos(ang) * rad; pz = z + Math.sin(ang) * rad;
        let ok = true;
        for (const m of herd.members) { const dx = m.x - px, dz = m.z - pz; if (dx * dx + dz * dz < spacing * spacing) { ok = false; break; } }
        if (ok && !(world.terrain.waterLevel > -1e8 && world.isWater(px, pz) && species !== 'hippo')) break;
      }
    }
    const sex = opts.sex ?? (rng.float() < (spec.id === 'lion' ? 0.25 : 0.5) ? 'male' : 'female');
    const variant = variantFor(spec, sex);
    const pool = getPool(spec, variant);
    const slot = pool.alloc();
    const id = world.nextId('an');
    const a = {
      id, species, variant, sex, x: px, z: pz, y: world.getHeight(px, pz), heading: baseHeading + rng.range(-0.35, 0.35), speed: 0,
      state: 'idle', herd: herd.id, needs: { food: rng.range(0.5, 0.95), water: rng.range(0.45, 0.95), rest: rng.range(0.5, 1), safety: 1, social: 0.7 },
      happiness: 0.6, age: rng.range(2, 12),
      _spec: spec, _dims: pool.dims, _pool: pool, _slot: slot,
      _rot: new Float32Array(pool.nb * 3), _off: new Float32Array(pool.nb * 3),
      _phase: rng.float(), _moveW: 0, _runW: 0, _headDown: 0, _drinkW: 0, _lieW: 0, _sleepW: 0, _alertW: 0,
      _lookYaw: 0, _lookTarget: 0, _lookTimer: rng.range(0, 4), _targetSpeed: 0, _desired: 0,
      _tx: px, _tz: pz, _hasTarget: false, _arrive: null, _timer: 0, _hold: opts.hold ?? 0, _seed: rng.float(),
      _pitch: 0, _roll: 0, _earFlickL: -10, _earFlickR: -10, _nextFlick: rng.range(0, 4), _fleeFrom: null, _prey: null,
      _scale: (opts.scale ?? rng.range(0.93, 1.07)) * (sex === 'male' && (spec.id === 'lion' || spec.id === 'elephant') ? 1.06 : 1),
      _posed: false,
    };
    a._desired = a.heading;
    herd.members.push(a);
    S.animals.push(a); S.byId.set(id, a); world.animals.set(id, a);
    if (spec.predator) S.predators.push(a); if (spec.prey) S.prey.push(a);
    const st = opts.state ?? defaultState(spec, world.time.hour);
    beh.setState(a, st, opts.duration ?? rng.range(10, 40));
    if (opts.target) { a._tx = opts.target[0] + (count > 1 ? px - x : 0); a._tz = opts.target[1] + (count > 1 ? pz - z : 0); a._hasTarget = true; a._arrive = opts.arrive || 'graze'; a._desired = Math.atan2(a._tx - a.x, a._tz - a.z); a.heading = a._desired; }
    if (st === 'walk' || st === 'run' || st === 'chase' || st === 'flee' || st === 'stalk') a.speed = a._targetSpeed;
    snapBlends(a);
    ids.push(id);
    S.events.emit('animal:spawned', { id, species });
  }
  return ids;
}

function removeNow(id, reason = 'removed') {
  const a = S.byId.get(id);
  if (!a) return false;
  a.state = 'dead';
  a._pool.release(a._slot);
  a._pool.rig.writeIdentity(a._pool.boneArr, a._slot * a._pool.nb * 16);
  S.byId.delete(id); S.world.animals.delete(id);
  const drop = (arr) => { const i = arr.indexOf(a); if (i >= 0) arr.splice(i, 1); };
  drop(S.animals); drop(S.predators); drop(S.prey);
  const h = S.herds.get(a.herd);
  if (h) { drop(h.members); if (!h.members.length) S.herds.delete(h.id); }
  a._spec = null;
  S.events.emit('animal:died', { id, species: a.species, reason });
  return true;
}

function remove(id, reason) {
  if (S.inStep) { S.toRemove.push([id, reason]); return true; }
  return removeNow(id, reason);
}

const api = {
  spawn,
  remove: (id) => remove(id, 'removed'),
  clear() {
    for (const a of S.animals.slice()) removeNow(a.id, 'cleared');
    S.herds.clear(); S.water.length = 0;
    for (const m of S.stageMeshes) { group.remove(m); m.geometry.dispose(); m.material.dispose(); }
    S.stageMeshes.length = 0;
  },
  list(species) { const out = []; for (const a of S.animals) if (!species || a.species === species) out.push(a); return out; },
  get: (id) => S.byId.get(id) || null,
  count(species) { if (!species) return S.animals.length; let n = 0; for (const a of S.animals) if (a.species === species) n++; return n; },
  speciesInfo,
  allSpecies: () => SPECIES_IDS.slice(),
  getHappiness: (id) => S.byId.get(id)?.happiness ?? 0,
  setHabitatQualityFn(fn) { S.qualityFn = typeof fn === 'function' ? fn : null; },
  nearest(x, z, r) {
    const out = [], r2 = r * r;
    for (const a of S.animals) { const dx = a.x - x, dz = a.z - z; const d = dx * dx + dz * dz; if (d <= r2) out.push({ a, d }); }
    out.sort((p, q) => p.d - q.d);
    return out.map((o) => o.a);
  },
  setState(id, state, hold = 0) { const a = S.byId.get(id); if (!a || !STATES.includes(state)) return false; beh.setState(a, state, 30); a._hold = hold; snapBlends(a); return true; },
  addWaterPoint(x, z, nx = 0, nz = 1) { S.water.push({ x, z, nx, nz }); },
  waterPoints: () => S.water.slice(),
  herds: () => [...S.herds.values()].map((h) => ({ id: h.id, species: h.species, count: h.members.length, home: { ...h.home }, target: [h.tx, h.tz], intent: h.intent })),
  states: () => STATES.slice(),
  stats() {
    let near = 0, far = 0, tris = 0;
    for (const p of pools.values()) { near += p.meshHi.count; far += p.meshLo.count; tris += p.meshHi.count * p.trisHi + p.meshLo.count * p.trisLo; }
    return { animals: S.animals.length, pools: pools.size, nearInstances: near, farInstances: far, triangles: tris, drawCallsEstimate: pools.size * 2 + [...pools.values()].filter((p) => p.meshHi.count > 0).length };
  },
  /** internal: the module group (stage helpers add water props here) */
  _group: () => group,
  _stageMeshes: () => S.stageMeshes,
};

export default {
  id: 'animals',
  version: 1,
  dependencies: [],
  optional: ['terrain', 'zoning'],
  api,

  async init(c) {
    ctx = c;
    group = new THREE.Group(); group.name = 'animals';
    ctx.scene.add(group);
    S = {
      ctx, world: ctx.world, rng: ctx.rng.fork('sim'), events: ctx.events, time: 0,
      animals: [], byId: new Map(), herds: new Map(), predators: [], prey: [], water: [], nextHerd: 1,
      qualityFn: null, inStep: false, toRemove: [], stageMeshes: [], remove, _n: new THREE.Vector3(),
    };
    beh = new Behaviour(S);
    acc = 0;
    try {
      shadows = new ContactShadows();
      shadows.refreshSun();
      ctx.events.on('time:set', () => { try { shadows?.refreshSun(); } catch (err) { ctx.log.warn('sun refresh failed', err); } }, 'animals');
    } catch (err) { shadows = null; ctx.log.error(err); }
    try {
      const zoning = ctx.modules.get('zoning');
      if (zoning?.getHabitatQuality) S.qualityFn = (herd, species) => zoning.getHabitatQuality(herd, species);
    } catch (err) { ctx.log.warn('zoning habitat quality unavailable', err); }
    ctx.log.info(`animals ready: ${SPECIES_IDS.length} species`);
  },

  update(dt, t) {
    if (!S) return;
    S.time = t;
    const world = S.world;
    const live = !world.time.paused || ctx.isShowcase;
    if (live) {
      acc += dt;
      let n = 0;
      S.inStep = true;
      while (acc >= STEP && n < 4) { acc -= STEP; beh.step(STEP); n++; }
      S.inStep = false;
      if (S.toRemove.length) { for (const [id, r] of S.toRemove) removeNow(id, r); S.toRemove.length = 0; }
      if (acc > STEP * 4) acc = 0;
    }
    const animals = S.animals;
    for (let i = 0; i < animals.length; i++) beh.integrate(animals[i], dt, live);

    const cam = ctx.camera;
    cam.getWorldDirection(_fwd);
    const cx = cam.position.x, cy = cam.position.y, cz = cam.position.z;
    for (const p of pools.values()) { p.hiN = 0; p.loN = 0; p.dirty = false; }
    if (shadows) { if (!shadows.sunSeen) { shadows.refreshSun(); shadows.sunSeen = true; } shadows.begin(animals.length); }
    for (let i = 0; i < animals.length; i++) {
      const a = animals[i], pool = a._pool;
      const dx = a.x - cx, dy = a.y + 1 - cy, dz = a.z - cz;
      const d2 = dx * dx + dy * dy + dz * dz;
      const far = d2 > LOD_FAR * LOD_FAR;
      const inv = 1 / Math.max(1e-3, Math.sqrt(d2));
      const facing = (dx * _fwd.x + dy * _fwd.y + dz * _fwd.z) * inv;
      const inView = d2 < CULL_DIST * CULL_DIST && (facing > -0.35 || d2 < 60 * 60);
      if ((inView && !far && live) || !a._posed) {
        evalPose(a, a._spec, pool.dims, pool.rig, t);
        pool.rig.evaluate(a._rot, a._off, pool.boneArr, a._slot * pool.nb * 16);
        pool.dirty = true; a._posed = true;
      }
      if (!inView) continue;
      _p.set(a.x, a.y, a.z);
      _e.set(a._pitch, a.heading, a._roll, 'YXZ');
      _q.setFromEuler(_e);
      _s.setScalar(a._scale);
      _m.compose(_p, _q, _s);
      const mesh = far ? pool.meshLo : pool.meshHi;
      const k = far ? pool.loN++ : pool.hiN++;
      mesh.instanceMatrix.array.set(_m.elements, k * 16);
      mesh.geometry.attributes.aSlot.array[k] = a._slot;
      const tint = 0.86 + 0.14 * a._seed;
      const col = mesh.instanceColor.array; col[k * 3] = tint; col[k * 3 + 1] = tint * (0.98 + 0.04 * a._seed); col[k * 3 + 2] = tint * (0.96 + 0.06 * a._seed);
      if (shadows) shadows.add(a, pool.shW, pool.shL);
    }
    if (shadows) shadows.end();
    for (const p of pools.values()) {
      p.meshHi.count = p.hiN; p.meshLo.count = p.loN;
      p.meshHi.instanceMatrix.needsUpdate = true; p.meshLo.instanceMatrix.needsUpdate = true;
      p.meshHi.geometry.attributes.aSlot.needsUpdate = true; p.meshLo.geometry.attributes.aSlot.needsUpdate = true;
      p.meshHi.instanceColor.needsUpdate = true; p.meshLo.instanceColor.needsUpdate = true;
      if (p.dirty) p.uBones.value.needsUpdate = true;
    }
  },

  tick(simDt) {
    if (!S) return;
    for (let i = 0; i < S.animals.length; i++) beh.tick(S.animals[i], simDt);
  },

  dispose() {
    if (!S) return;
    for (const p of pools.values()) p.dispose();
    pools.clear();
    try { shadows?.dispose(); } catch (err) { ctx.log.warn('shadow dispose', err); }
    shadows = null;
    api.clear();
    group?.removeFromParent();
    S = null; beh = null; group = null;
  },

  showcase: { presets, stage },
};
