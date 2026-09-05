// buildings — owner of world.buildings and the BUILDING cells of world.grid.occupancy.
//
// Each catalogue type is modelled once into a prototype (a handful of merged BufferGeometries, one
// per render bucket) and then drawn with InstancedMesh, so a park with twenty staff houses costs the
// same number of draw calls as one. Every opaque surface — thatch, timber, poles, stone, plaster,
// corrugated iron, canvas, concrete, reed, painted steel — samples one DataArrayTexture pair through
// a per-vertex layer index, so a whole type is ONE opaque draw call plus at most two small extras
// (lit glass/lamps, and water/solar or the park sign).
//
// See README.md for the API, the events and the measured numbers.
import * as THREE from 'three';
import { OCC } from '../../core/World.js';
import { presets, stage } from './showcase.js';
import { TYPES, TYPE_KEYS, catalogueRows, getType } from './catalogue.js';
import { buildSurfaceArrays, signTexture, isSoftwareGL, bucketOf } from './textures.js';
import { createSurfaceMaterial, createGlowMaterial, createShinyMaterial, createSignMaterial, nightFactor } from './material.js';
import { BuildCtx } from './common.js';
import { BUILDERS } from './builders.js';

const MAX_LAMP_LIGHTS = 3;
const START_CAPACITY = 4;

const S = {
  ctx: null, group: null, arrays: null, mats: null, protos: new Map(), sets: new Map(),
  records: new Map(), byType: new Map(), ghost: null, lights: [], lightsIn: false,
  night: 0, spin: 0, ready: false, nextId: 1, parkName: 'MARA RIDGE',
};

const _m = new THREE.Matrix4();
const _mOut = new THREE.Matrix4();
const _mA = new THREE.Matrix4();
const _mB = new THREE.Matrix4();
const _mC = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const _zero = new THREE.Vector3(0, 0, 0);
const _up = new THREE.Vector3(0, 1, 0);
const _axis = new THREE.Vector3();
const _lampPos = new THREE.Vector3();

function log(...a) { S.ctx?.log?.info?.(...a); }

// ---------------------------------------------------------------------------------------------------------
// prototypes
// ---------------------------------------------------------------------------------------------------------

/** Build (once) the merged geometry of one building type. */
function getProto(type) {
  let p = S.protos.get(type);
  if (p) return p;
  const def = TYPES[type];
  const fn = def && BUILDERS[def.builder || type];
  if (!def || !fn) { S.ctx.log.warn(`[buildings] no builder for "${type}"`); return null; }
  const bc = new BuildCtx(S.ctx.rng.fork('proto:' + type), S.ctx.noise, { parkName: S.parkName });
  let info = null;
  try {
    info = fn(bc) || {};
  } catch (err) {
    S.ctx.log.error(`[buildings] builder "${type}" threw`, err);
    return null;
  }
  const buckets = bc.parts.build(bucketOf);
  const spinners = bc.spinners.map((sp) => ({
    pivot: sp.pivot, axis: sp.axis, speed: sp.speed, buckets: sp.parts.build(bucketOf),
  }));
  let tris = 0;
  for (const b of buckets) tris += b.triangles;
  for (const sp of spinners) for (const b of sp.buckets) tris += b.triangles;
  p = { type, def, buckets, spinners, lamps: bc.lamps, triangles: tris, top: info.top || def.height };
  S.protos.set(type, p);
  log(`[buildings] "${type}" prototype: ${buckets.length + spinners.length} bucket(s), ${tris} tris`);
  return p;
}

function materialFor(bucket) {
  return S.mats[bucket] || S.mats.opaque;
}

/** The InstancedMesh set for one type, grown as needed. */
function getSet(type, need) {
  let set = S.sets.get(type);
  if (!set) {
    const proto = getProto(type);
    if (!proto) return null;
    set = { proto, capacity: 0, count: 0, slots: [], meshes: [], spinMeshes: [] };
    S.sets.set(type, set);
  }
  if (need > set.capacity) growSet(set, Math.max(START_CAPACITY, need, set.capacity * 2));
  return set;
}

function growSet(set, capacity) {
  for (const m of set.meshes) { m.removeFromParent(); m.dispose(); }
  for (const m of set.spinMeshes) { m.mesh.removeFromParent(); m.mesh.dispose(); }
  set.meshes = []; set.spinMeshes = [];
  set.capacity = capacity;
  for (const b of set.proto.buckets) {
    const im = new THREE.InstancedMesh(b.geometry, materialFor(b.bucket), capacity);
    im.name = `buildings-${set.proto.type}-${b.bucket}`;
    im.castShadow = true; im.receiveShadow = true;
    im.frustumCulled = false;
    im.count = set.count;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    S.group.add(im);
    set.meshes.push(im);
  }
  set.proto.spinners.forEach((sp, si) => {
    for (const b of sp.buckets) {
      const im = new THREE.InstancedMesh(b.geometry, materialFor(b.bucket), capacity);
      im.name = `buildings-${set.proto.type}-spin${si}-${b.bucket}`;
      im.castShadow = true; im.receiveShadow = true;
      im.frustumCulled = false;
      im.count = set.count;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      S.group.add(im);
      set.spinMeshes.push({ mesh: im, spinner: sp });
    }
  });
  // rewrite every live matrix
  for (let i = 0; i < set.slots.length; i++) writeSlot(set, i);
  flushSet(set);
}

function baseMatrix(rec, out) {
  _p.set(rec.x, rec.y, rec.z);
  _q.setFromAxisAngle(_up, rec.rot);
  return out.compose(_p, _q, _s);
}

function writeSlot(set, i) {
  const rec = set.slots[i];
  if (!rec) return;
  baseMatrix(rec, _m);
  for (const im of set.meshes) im.setMatrixAt(i, _m);
  for (const sm of set.spinMeshes) {
    spinMatrix(sm.spinner, _m, _mOut);
    sm.mesh.setMatrixAt(i, _mOut);
  }
}

/** base · T(pivot) · R(axis, angle) · T(-pivot) — allocation free. */
function spinMatrix(sp, base, out) {
  const px = sp.pivot[0], py = sp.pivot[1], pz = sp.pivot[2];
  _axis.set(sp.axis[0], sp.axis[1], sp.axis[2]).normalize();
  _q.setFromAxisAngle(_axis, S.spin * sp.speed);
  _mA.makeTranslation(px, py, pz);
  _mB.compose(_zero, _q, _s);
  _mC.makeTranslation(-px, -py, -pz);
  return out.copy(base).multiply(_mA).multiply(_mB).multiply(_mC);
}

function flushSet(set) {
  for (const im of set.meshes) { im.count = set.count; im.instanceMatrix.needsUpdate = true; }
  for (const sm of set.spinMeshes) { sm.mesh.count = set.count; sm.mesh.instanceMatrix.needsUpdate = true; }
}

// ---------------------------------------------------------------------------------------------------------
// placement rules
// ---------------------------------------------------------------------------------------------------------

/** Footprint half-extents after rotation, in world axes. */
function footprint(def, rot) {
  const c = Math.abs(Math.cos(rot)), s = Math.abs(Math.sin(rot));
  return { hx: (def.w * c + def.d * s) * 0.5, hz: (def.w * s + def.d * c) * 0.5 };
}

function forFootprintCells(def, x, z, rot, fn) {
  const world = S.ctx.world, g = world.grid;
  const { hx, hz } = footprint(def, rot);
  const i0 = Math.max(0, Math.floor((x - hx + world.half) / g.cell));
  const i1 = Math.min(g.res - 1, Math.floor((x + hx + world.half) / g.cell));
  const j0 = Math.max(0, Math.floor((z - hz + world.half) / g.cell));
  const j1 = Math.min(g.res - 1, Math.floor((z + hz + world.half) / g.cell));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) fn(j * g.res + i, i, j);
}

function canPlace(type, x, z, rot = 0, opts = {}) {
  const reasons = [];
  const def = TYPES[type];
  if (!def) return { ok: false, reasons: ['unknown-type'] };
  const world = S.ctx.world;
  const rules = def.rules || {};
  const { hx, hz } = footprint(def, rot);

  if (!world.inBounds(x - hx, z - hz) || !world.inBounds(x + hx, z + hz)) reasons.push('out-of-bounds');

  const terrain = S.ctx.modules.get('terrain');
  const waterAt = (px, pz) => (terrain?.isWaterAt ? terrain.isWaterAt(px, pz) : world.isWater(px, pz));

  let maxSlope = 0, wet = false;
  const probes = [[0, 0], [-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz], [-hx, 0], [hx, 0], [0, -hz], [0, hz]];
  for (const [dx, dz] of probes) {
    const px = x + dx, pz = z + dz;
    if (!world.inBounds(px, pz)) continue;
    maxSlope = Math.max(maxSlope, world.getSlope(px, pz));
    if (waterAt(px, pz)) wet = true;
  }
  if (wet && !rules.allowWater) reasons.push('water');
  const maxDeg = rules.maxSlope ?? 10;
  if ((maxSlope * 180) / Math.PI > maxDeg) reasons.push('too-steep');

  if (!opts.ignoreOccupancy) {
    let blocked = 0;
    forFootprintCells(def, x, z, rot, (idx) => {
      const o = world.grid.occupancy[idx];
      if (o === OCC.BUILDING || o === OCC.ROAD) blocked++;
    });
    if (blocked) reasons.push('occupied');
  }

  if (rules.roadAccess > 0 && !opts.ignoreRoads) {
    const roads = S.ctx.modules.get('roads');
    if (roads?.nearestEdge) {
      const near = roads.nearestEdge(x, z, rules.roadAccess + Math.max(hx, hz));
      if (!near) reasons.push('no-road-access');
    }
    // if the roads module is absent we cannot judge access — do not fail on it
  }

  if (rules.zone != null) {
    const cell = world.cellAt(x, z);
    if (world.grid.zone[cell.index] !== rules.zone) reasons.push('wrong-zone');
  }

  return { ok: reasons.length === 0, reasons };
}

// ---------------------------------------------------------------------------------------------------------
// place / remove
// ---------------------------------------------------------------------------------------------------------

function place(type, x, z, rot = 0, opts = {}) {
  const def = TYPES[type];
  if (!def) { S.ctx.log.warn(`[buildings] place: unknown type "${type}"`); return null; }
  if (!opts.force) {
    const chk = canPlace(type, x, z, rot, opts);
    if (!chk.ok) return null;
  }
  const world = S.ctx.world;

  // flatten the ground under the footprint before we read the height back
  const terrain = S.ctx.modules.get('terrain');
  const { hx, hz } = footprint(def, rot);
  if (terrain?.flatten && (def.rules?.flatten ?? true) && opts.flatten !== false) {
    const r = Math.hypot(hx, hz) + 2.5;
    terrain.flatten(x, z, r, world.getHeight(x, z));
  }
  const y = world.getHeight(x, z);

  const id = `b_${S.nextId++}`;
  const rec = {
    id, type, x, z, y, rot,
    w: def.w, d: def.d,
    state: 'ok', staff: def.staff || 0, visitors: 0,
    cost: def.cost, upkeep: def.upkeep, capacity: def.capacity || 0,
  };

  const set = getSet(type, (S.byType.get(type)?.length || 0) + 1);
  if (!set) return null;
  const slot = set.count;
  set.slots[slot] = rec;
  set.count++;
  rec._slot = slot;
  if (set.count > set.capacity) growSet(set, set.capacity * 2);
  else { writeSlot(set, slot); flushSet(set); }

  // world state
  world.buildings.set(id, rec);
  forFootprintCells(def, x, z, rot, (idx) => { world.grid.occupancy[idx] = OCC.BUILDING; });
  world.grid.version++;
  S.records.set(id, rec);
  let list = S.byType.get(type);
  if (!list) { list = []; S.byType.set(type, list); }
  list.push(rec);

  S.ctx.events.emit('building:placed', { id, type, x, z, rot });
  return id;
}

function remove(id) {
  const rec = S.records.get(id);
  if (!rec) return false;
  const world = S.ctx.world;
  const set = S.sets.get(rec.type);
  if (set) {
    const slot = rec._slot;
    const last = set.count - 1;
    if (slot !== last) {
      const moved = set.slots[last];
      set.slots[slot] = moved;
      moved._slot = slot;
      writeSlot(set, slot);
    }
    set.slots[last] = null;
    set.count = last;
    flushSet(set);
  }
  forFootprintCells(TYPES[rec.type], rec.x, rec.z, rec.rot, (idx) => {
    if (world.grid.occupancy[idx] === OCC.BUILDING) world.grid.occupancy[idx] = OCC.FREE;
  });
  world.grid.version++;
  world.buildings.delete(id);
  S.records.delete(id);
  const list = S.byType.get(rec.type);
  if (list) { const i = list.indexOf(rec); if (i >= 0) list.splice(i, 1); }
  S.ctx.events.emit('building:removed', { id, type: rec.type });
  return true;
}

function clearAll() {
  for (const id of [...S.records.keys()]) remove(id);
}

// ---------------------------------------------------------------------------------------------------------
// preview ghost
// ---------------------------------------------------------------------------------------------------------

function preview(type, x, z, rot = 0, valid = true) {
  if (!type) { if (S.ghost) S.ghost.visible = false; return null; }
  const proto = getProto(type);
  if (!proto) return null;
  if (!S.ghost) {
    S.ghost = new THREE.Group();
    S.ghost.name = 'buildings-preview';
    S.ghost.userData.mat = new THREE.MeshBasicMaterial({
      color: 0x66ff88, transparent: true, opacity: 0.34, depthWrite: false, side: THREE.DoubleSide,
    });
    S.group.add(S.ghost);
  }
  if (S.ghost.userData.type !== type) {
    for (const c of [...S.ghost.children]) c.removeFromParent();
    for (const b of proto.buckets) S.ghost.add(new THREE.Mesh(b.geometry, S.ghost.userData.mat));
    S.ghost.userData.type = type;
  }
  const y = S.ctx.world.getHeight(x, z);
  S.ghost.position.set(x, y, z);
  S.ghost.rotation.y = rot;
  S.ghost.visible = true;
  S.ghost.userData.mat.color.setHex(valid ? 0x63ff8c : 0xff5a48);
  return S.ghost;
}

// ---------------------------------------------------------------------------------------------------------
// night lighting
// ---------------------------------------------------------------------------------------------------------

function updateNight(force = false) {
  const n = nightFactor(S.ctx.world.time.hour);
  if (!force && Math.abs(n - S.night) < 0.004) return;
  S.night = n;
  if (S.mats) {
    S.mats.glow.emissiveIntensity = 0.06 + 3.4 * n;
    S.mats.glow.color.setRGB(0.014 + 0.02 * (1 - n), 0.017 + 0.02 * (1 - n), 0.021 + 0.02 * (1 - n));
  }
  // three nearest lamps become real point lights once it is dark
  const want = n > 0.03;
  if (want && !S.lightsIn) {
    for (const l of S.lights) S.group.add(l);
    S.lightsIn = true;
  } else if (!want && S.lightsIn) {
    for (const l of S.lights) l.removeFromParent();
    S.lightsIn = false;
  }
  if (S.lightsIn) placeLamps();
}

function placeLamps() {
  const cam = S.ctx.camera;
  const best = [];
  for (const rec of S.records.values()) {
    const proto = S.protos.get(rec.type);
    if (!proto || !proto.lamps.length) continue;
    const c = Math.cos(rec.rot), s = Math.sin(rec.rot);
    for (const [lx, ly, lz, pw] of proto.lamps) {
      const wx = rec.x + lx * c + lz * s;
      const wz = rec.z - lx * s + lz * c;
      const d = _lampPos.set(wx, rec.y + ly, wz).distanceToSquared(cam.position);
      best.push({ d, x: wx, y: rec.y + ly, z: wz, pw });
    }
  }
  best.sort((a, b) => a.d - b.d);
  for (let i = 0; i < S.lights.length; i++) {
    const l = S.lights[i], b = best[i];
    if (!b) { l.intensity = 0; continue; }
    l.position.set(b.x, b.y, b.z);
    l.intensity = 16 * b.pw * S.night;
  }
}

// ---------------------------------------------------------------------------------------------------------
// public API
// ---------------------------------------------------------------------------------------------------------

const api = {
  /** Every buildable type as plain rows: footprint, cost, upkeep, staff, capacity, appeal, rules. */
  catalogue() { return catalogueRows(); },
  /** One catalogue row, or null. */
  getType(type) { const t = getType(type); return t ? catalogueRows().find((r) => r.key === type) : null; },
  types() { return TYPE_KEYS.slice(); },

  /** { ok, reasons[] } — reasons: out-of-bounds | water | too-steep | occupied | no-road-access | wrong-zone. */
  canPlace(type, x, z, rot = 0, opts = {}) { return canPlace(type, x, z, rot, opts); },

  /** Place a building. Returns its id, or null if canPlace() failed. opts: { force, flatten, ignoreRoads }. */
  place(type, x, z, rot = 0, opts = {}) { return place(type, x, z, rot, opts); },

  remove(id) { return remove(id); },
  /** Remove every building (used by the showcase and the demo scenes). */
  clear() { clearAll(); },

  get(id) { return S.records.get(id) || null; },
  /** All records, optionally filtered by type. */
  list(type) {
    if (type) return (S.byType.get(type) || []).slice();
    return [...S.records.values()];
  },
  count(type) { return type ? (S.byType.get(type) || []).length : S.records.size; },

  /** Ghost mesh for the build tool. preview(null) hides it. */
  preview(type, x, z, rot = 0, valid = true) { return preview(type, x, z, rot, valid); },

  /** Update simulation state on one building: { staff, visitors, state }. */
  setState(id, patch = {}) {
    const rec = S.records.get(id);
    if (!rec) return false;
    if (patch.staff !== undefined) rec.staff = patch.staff;
    if (patch.visitors !== undefined) rec.visitors = patch.visitors;
    if (patch.state !== undefined) rec.state = patch.state;
    return true;
  },

  /** Nearest building of a type (or of any type when omitted). */
  findNearest(type, x, z) {
    let best = null, bd = Infinity;
    const src = type ? (S.byType.get(type) || []) : S.records.values();
    for (const rec of src) {
      const d = (rec.x - x) * (rec.x - x) + (rec.z - z) * (rec.z - z);
      if (d < bd) { bd = d; best = rec; }
    }
    return best ? { ...best, distance: Math.sqrt(bd) } : null;
  },

  /** Height of the top of a type's silhouette above its ground point (cameras and LOD use it). */
  heightOf(type) { const p = getProto(type); return p ? p.top : (TYPES[type]?.height || 0); },

  /** Park name shown on the entrance sign. Changing it rebuilds the sign texture. */
  setParkName(name) {
    S.parkName = String(name || 'MARA RIDGE');
    if (S.mats?.sign) { S.mats.sign.map = signTexture(S.ctx, S.parkName); S.mats.sign.needsUpdate = true; }
  },
  getParkName() { return S.parkName; },

  /** { drawCalls, triangles, types } for the README / critic. */
  stats() {
    let calls = 0, tris = 0;
    for (const set of S.sets.values()) {
      if (!set.count) continue;
      calls += set.meshes.length + set.spinMeshes.length;
      for (const b of set.proto.buckets) tris += b.triangles * set.count;
      for (const sp of set.proto.spinners) for (const b of sp.buckets) tris += b.triangles * set.count;
    }
    return { drawCalls: calls, triangles: tris, buildings: S.records.size, types: S.sets.size };
  },

  get group() { return S.group; },
};

// ---------------------------------------------------------------------------------------------------------

export default {
  id: 'buildings',
  version: 1,
  dependencies: [],
  // terrain: real ground heights + footprint flattening. roads: road-access rules.
  // props: the showcase would otherwise stand on bare dirt. environment: sky, PMREM, exposure, shadows.
  optional: ['terrain', 'roads', 'props', 'environment'],
  api,

  async init(ctx) {
    S.ctx = ctx;
    S.group = new THREE.Group(); S.group.name = 'buildings';
    ctx.scene.add(S.group);
    S.records.clear(); S.byType.clear(); S.protos.clear(); S.sets.clear();
    S.nextId = 1;
    S.parkName = ctx.params?.park || 'MARA RIDGE';

    try {
      const soft = isSoftwareGL(ctx.renderer);
      const size = (soft || ctx.quality === 'low') ? 384 : 512;
      const t0 = performance.now();
      S.arrays = buildSurfaceArrays(ctx, { size, anisotropy: soft ? 1 : 8 });
      S.mats = {
        opaque: createSurfaceMaterial(ctx, S.arrays),
        glow: createGlowMaterial(ctx),
        shiny: createShinyMaterial(ctx),
        sign: createSignMaterial(ctx, signTexture(ctx, S.parkName)),
      };
      log(`[buildings] ${S.arrays.layers} surface layers @ ${size}² in ${(performance.now() - t0).toFixed(0)} ms`);
    } catch (err) {
      ctx.log.error('[buildings] surface generation failed', err);
    }

    for (let i = 0; i < MAX_LAMP_LIGHTS; i++) {
      const l = new THREE.PointLight(0xffb264, 0, 26, 2);
      l.name = 'buildings-lamp-' + i;
      l.castShadow = false;
      S.lights.push(l);
    }

    ctx.events.on('time:set', () => updateNight(true));
    updateNight(true);
    S.ready = true;
  },

  update(dt) {
    if (!S.ready) return;
    updateNight();
    // windpump rotors
    let anySpin = false;
    for (const set of S.sets.values()) if (set.count && set.spinMeshes.length) { anySpin = true; break; }
    if (anySpin) {
      S.spin += dt * (0.6 + 0.5 * Math.min(2, (S.ctx.world.weather?.wind?.speed || 3) / 3));
      for (const set of S.sets.values()) {
        if (!set.count || !set.spinMeshes.length) continue;
        for (let i = 0; i < set.count; i++) {
          const rec = set.slots[i];
          if (!rec) continue;
          baseMatrix(rec, _m);
          for (const sm of set.spinMeshes) {
            spinMatrix(sm.spinner, _m, _mOut);
            sm.mesh.setMatrixAt(i, _mOut);
          }
        }
        for (const sm of set.spinMeshes) sm.mesh.instanceMatrix.needsUpdate = true;
      }
    }
    if (S.lightsIn) placeLamps();
  },

  tick() {},

  dispose() {
    for (const set of S.sets.values()) {
      for (const m of set.meshes) { m.removeFromParent(); m.dispose(); }
      for (const sm of set.spinMeshes) { sm.mesh.removeFromParent(); sm.mesh.dispose(); }
    }
    for (const p of S.protos.values()) {
      for (const b of p.buckets) b.geometry.dispose();
      for (const sp of p.spinners) for (const b of sp.buckets) b.geometry.dispose();
    }
    for (const l of S.lights) l.removeFromParent();
    S.lights = []; S.lightsIn = false;
    if (S.ghost) { S.ghost.userData.mat?.dispose(); S.ghost.removeFromParent(); S.ghost = null; }
    if (S.mats) {
      for (const m of Object.values(S.mats)) { S.ctx.materials.untrack(m); m.userData.dummyNormal?.dispose(); m.dispose(); }
      S.mats = null;
    }
    S.arrays?.dispose(); S.arrays = null;
    S.ctx?.textures.dispose('buildings:sign:' + S.parkName);
    S.sets.clear(); S.protos.clear(); S.records.clear(); S.byType.clear();
    S.group?.removeFromParent(); S.group = null;
    S.ready = false;
  },

  showcase: { presets, stage },
};
