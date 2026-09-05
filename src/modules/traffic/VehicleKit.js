// Owns every InstancedMesh the traffic module draws: one body pool per (kind, paint colour) — 3
// material groups (paint/chrome/glass) merged into a single geometry per kind so a whole fleet of one
// colour costs 3 draw calls total — plus ONE shared wheel pool, ONE shared headlight pool, ONE shared
// taillight pool and TWO shared passenger pools (skin, clothing), all reused across every kind and
// every vehicle. Draw-call count is therefore constant regardless of fleet size until a pool's
// capacity is hit.
import * as THREE from 'three';
import { KINDS, KIND_IDS } from './kinds.js';
import { buildKindModel, buildWheelGeometry, buildLampGeometry, buildPassengerGeometry } from './build.js';
import { buildMaterialLibrary, disposeMaterialLibrary } from './materials.js';
import { InstancedPool } from './pool.js';

const CAP_BODY_PER_COLOUR = 16;
const CAP_WHEELS = 260;
const CAP_LIGHTS = 90;
const CAP_SEATS = 380;

export class VehicleKit {
  constructor(ctx, group) {
    this.ctx = ctx;
    this.group = group;
    this.lib = buildMaterialLibrary(ctx);
    this.kindModels = {};
    for (const id of KIND_IDS) this.kindModels[id] = buildKindModel(KINDS[id]);

    this.bodyPools = new Map();

    const wheelGeo = buildWheelGeometry();
    this.wheelPool = new InstancedPool(wheelGeo, [this.lib.tyreMat, this.lib.rimMat], CAP_WHEELS, { name: 'traffic-wheels' });

    const lampGeo = buildLampGeometry();
    this.headPool = new InstancedPool(lampGeo, this.lib.headlightMat, CAP_LIGHTS, { castShadow: false, receiveShadow: false, name: 'traffic-headlights' });
    this.tailPool = new InstancedPool(lampGeo.clone(), this.lib.taillightMat, CAP_LIGHTS, { castShadow: false, receiveShadow: false, name: 'traffic-taillights' });

    const parts = buildPassengerGeometry();
    this.skinPool = new InstancedPool(parts.skin, this.lib.skinMat, CAP_SEATS, { name: 'traffic-passenger-skin' });
    this.clothPool = new InstancedPool(parts.clothing, this.lib.clothingMat, CAP_SEATS, { color: true, name: 'traffic-passenger-clothing' });

    group.add(this.wheelPool.mesh, this.headPool.mesh, this.tailPool.mesh, this.skinPool.mesh, this.clothPool.mesh);
  }

  _bodyPool(kind, colorIdx) {
    const key = `${kind}:${colorIdx}`;
    let pool = this.bodyPools.get(key);
    if (!pool) {
      const model = this.kindModels[kind];
      const hex = KINDS[kind].paints[colorIdx % KINDS[kind].paints.length];
      const mats = [this.lib.paintMaterial(hex), this.lib.chrome, this.lib.glass];
      pool = new InstancedPool(model.geometry, mats, CAP_BODY_PER_COLOUR, { name: `traffic-body-${key}` });
      this.bodyPools.set(key, pool);
      this.group.add(pool.mesh);
    }
    return pool;
  }

  /** Reserve every instance slot a vehicle of `kind` needs. Returns a handle or null if any pool is full. */
  spawn(kind, colorIdx, seatCount) {
    const model = this.kindModels[kind];
    const bodyPool = this._bodyPool(kind, colorIdx);
    const handle = {
      kind, colorIdx, model, bodyPool,
      bodySlot: -1, wheelSlots: [], headSlots: [], tailSlots: [], seatSlots: [],
    };
    handle.bodySlot = bodyPool.alloc({ onMove: (s) => { handle.bodySlot = s; } });
    for (let i = 0; i < model.wheelMounts.length; i++) {
      const s = this.wheelPool.alloc({ onMove: (ns) => { handle.wheelSlots[i] = ns; } });
      handle.wheelSlots.push(s);
    }
    for (let i = 0; i < model.headlightMounts.length; i++) {
      const s = this.headPool.alloc({ onMove: (ns) => { handle.headSlots[i] = ns; } });
      handle.headSlots.push(s);
    }
    for (let i = 0; i < model.taillightMounts.length; i++) {
      const s = this.tailPool.alloc({ onMove: (ns) => { handle.tailSlots[i] = ns; } });
      handle.tailSlots.push(s);
    }
    const nSeats = Math.min(seatCount, model.seatMounts.length) + (model.driverMount ? 1 : 0);
    for (let i = 0; i < nSeats; i++) {
      const skin = this.skinPool.alloc({ onMove: (ns) => { handle.seatSlots[i].skin = ns; } });
      const cloth = this.clothPool.alloc({ onMove: (ns) => { handle.seatSlots[i].cloth = ns; } });
      handle.seatSlots.push({ skin, cloth });
    }
    if (handle.bodySlot < 0 || handle.wheelSlots.some((s) => s < 0) || handle.headSlots.some((s) => s < 0) || handle.tailSlots.some((s) => s < 0)) {
      this.free(handle);
      return null;
    }
    return handle;
  }

  free(handle) {
    if (handle.bodySlot >= 0) handle.bodyPool.free(handle.bodySlot);
    for (const s of handle.wheelSlots) if (s >= 0) this.wheelPool.free(s);
    for (const s of handle.headSlots) if (s >= 0) this.headPool.free(s);
    for (const s of handle.tailSlots) if (s >= 0) this.tailPool.free(s);
    for (const p of handle.seatSlots) {
      if (p.skin >= 0) this.skinPool.free(p.skin);
      if (p.cloth >= 0) this.clothPool.free(p.cloth);
    }
    handle.bodySlot = -1; handle.wheelSlots.length = 0; handle.headSlots.length = 0; handle.tailSlots.length = 0; handle.seatSlots.length = 0;
  }

  setBodyMatrix(h, m) { h.bodyPool.setMatrix(h.bodySlot, m); }
  setWheelMatrix(h, i, m) { if (h.wheelSlots[i] >= 0) this.wheelPool.setMatrix(h.wheelSlots[i], m); }
  setHeadMatrix(h, i, m) { if (h.headSlots[i] >= 0) this.headPool.setMatrix(h.headSlots[i], m); }
  setTailMatrix(h, i, m) { if (h.tailSlots[i] >= 0) this.tailPool.setMatrix(h.tailSlots[i], m); }
  setSeatMatrix(h, i, m) {
    const slot = h.seatSlots[i]; if (!slot) return;
    if (slot.skin >= 0) this.skinPool.setMatrix(slot.skin, m);
    if (slot.cloth >= 0) this.clothPool.setMatrix(slot.cloth, m);
  }
  setSeatColors(h, i, skinHex, clothHex) {
    const slot = h.seatSlots[i]; if (!slot) return;
    if (slot.skin >= 0) this.skinPool.setColor(slot.skin, skinHex);
    if (slot.cloth >= 0) this.clothPool.setColor(slot.cloth, clothHex);
  }
  setHeadlightIntensity(v) { this.lib.headlightMat.emissiveIntensity = v; }
  setTaillightIntensity(v) { this.lib.taillightMat.emissiveIntensity = 0.15 + v * 2.2; }

  stats() {
    let bodyDraws = 0;
    for (const p of this.bodyPools.values()) bodyDraws += Array.isArray(p.mesh.material) ? p.mesh.material.length : 1;
    return {
      drawCalls: bodyDraws + 2 /*wheels*/ + 1 /*head*/ + 1 /*tail*/ + 2 /*passengers*/,
      bodyPools: this.bodyPools.size,
      wheels: this.wheelPool.count, seats: this.skinPool.count,
    };
  }

  dispose() {
    for (const p of this.bodyPools.values()) p.dispose();
    this.bodyPools.clear();
    this.wheelPool.dispose(); this.headPool.dispose(); this.tailPool.dispose();
    this.skinPool.dispose(); this.clothPool.dispose();
    disposeMaterialLibrary(this.ctx, this.lib);
  }
}
