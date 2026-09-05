// traffic — safari vehicles carrying visitors along the road graph. Owner of `world.vehicles`.
// See README.md for the full API. Movement/pose lives in vehicle.js, tours/sightings in tours.js,
// meshes/materials in build.js + materials.js + VehicleKit.js, the road graph in graph.js (real
// `roads` module when present, a tiny built-in loop otherwise — see fallback.js).
import * as THREE from 'three';
import { KIND_IDS, KINDS } from './kinds.js';
import { VehicleKit } from './VehicleKit.js';
import { resolveGraph, disposeFallback, getEdge, getNode, edgesOf } from './graph.js';
import { createVehicle, updateVehicle } from './vehicle.js';
import { startTour as startTourImpl, stepTours } from './tours.js';
import { presets, stage } from './showcase.js';

let ctx = null, group = null, kit = null, graph = null, densityRng = null;
const vehicles = new Map();     // id -> vehicle record (also the world.vehicles value)
let vehicleArr = [];            // kept in sync with `vehicles`, iterated per-frame (no per-frame alloc)
let density = 0;                // ambient (non-tour) vehicle target count, set via api.setDensity
const DUST_COOLDOWN = 0.16;

// night headlight spotlights — at most 2, reused, only lit for the 2 vehicles nearest the camera
let spotA = null, spotB = null, spotTargetA = null, spotTargetB = null;

function nightFactor(hour) {
  const ss = (a, b, x) => { const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  return hour >= 12 ? ss(18, 19.5, hour) : 1 - ss(5, 6.5, hour);
}

// The single source of truth for adding/removing a vehicle: keeps `vehicles` (id lookup),
// `ctx.world.vehicles` (ARCHITECTURE §3 ownership) and `vehicleArr` (the allocation-free per-frame
// iteration order) all in sync. tours.js and the showcase go through these too, never the Map/array
// directly, so a tour finishing mid-frame can't leave a stale entry in either place.
function addVehicle(v) {
  vehicles.set(v.id, v);
  ctx.world.vehicles.set(v.id, v);
  vehicleArr.push(v);
}
function dropVehicle(v) {
  vehicles.delete(v.id);
  ctx.world.vehicles.delete(v.id);
  const i = vehicleArr.indexOf(v);
  if (i >= 0) { vehicleArr[i] = vehicleArr[vehicleArr.length - 1]; vehicleArr.pop(); }
  kit?.free(v._handle);
}
const mgr = { addVehicle, dropVehicle };

function pickAmbientKind(rng) {
  return rng.weighted([{ v: 'safari', w: 4 }, { v: 'minibus', w: 3 }, { v: 'ranger', w: 1.5 }, { v: 'service', w: 1.5 }]);
}

function spawnAmbient(rng) {
  if (!graph) return null;
  const edges = [...edgesOf(graph).values()];
  if (!edges.length) return null;
  const edge = rng.pick(edges);
  const kind = pickAmbientKind(rng);
  const s = rng.range(0, edge.length);
  const forward = rng.bool();
  const id = ctx.world.nextId('veh');
  const v = createVehicle(ctx, kit, graph, id, kind, edge.id, s, forward);
  if (!v) return null;
  addVehicle(v);
  ctx.events.emit('vehicle:spawned', { id });
  return id;
}

function removeOneAmbient(rng) {
  const ambient = vehicleArr.filter((v) => !v._tour);
  if (!ambient.length) return false;
  dropVehicle(rng.pick(ambient));
  return true;
}

function ambientCount() { let n = 0; for (const v of vehicleArr) if (!v._tour) n++; return n; }

function applyDensity() {
  if (!graph) return;
  let guard = 0;
  while (ambientCount() < density && guard++ < density + 4) if (!spawnAmbient(densityRng)) break;
  guard = 0;
  while (ambientCount() > density && guard++ < density + 4) if (!removeOneAmbient(densityRng)) break;
}

function updateSpotlights(night) {
  if (night < 0.05 || vehicleArr.length === 0) {
    if (spotA) spotA.visible = false;
    if (spotB) spotB.visible = false;
    return;
  }
  if (!spotA) {
    spotTargetA = new THREE.Object3D(); spotTargetB = new THREE.Object3D();
    spotA = new THREE.SpotLight(0xfff0c8, 0, 34, Math.PI * 0.16, 0.55, 1.4);
    spotB = new THREE.SpotLight(0xfff0c8, 0, 34, Math.PI * 0.16, 0.55, 1.4);
    spotA.castShadow = false; spotB.castShadow = false;
    spotA.target = spotTargetA; spotB.target = spotTargetB;
    group.add(spotA, spotA.target, spotB, spotB.target);
  }
  const cam = ctx.camera.position;
  let bi = -1, bd = Infinity, si = -1, sd = Infinity;
  for (let i = 0; i < vehicleArr.length; i++) {
    const v = vehicleArr[i];
    const d = (v.x - cam.x) ** 2 + (v.y - cam.y) ** 2 + (v.z - cam.z) ** 2;
    if (d < bd) { sd = bd; si = bi; bd = d; bi = i; } else if (d < sd) { sd = d; si = i; }
  }
  const assign = (light, tgt, idx) => {
    if (idx < 0) { light.visible = false; return; }
    const v = vehicleArr[idx];
    const m0 = v._handle.model.headlightMounts[0];
    const worldX = v.x + Math.sin(v.heading) * m0.z + Math.cos(v.heading) * m0.x;
    const worldZ = v.z + Math.cos(v.heading) * m0.z - Math.sin(v.heading) * m0.x;
    light.visible = true;
    light.position.set(worldX, v.y + m0.y, worldZ);
    light.intensity = 22 * night;
    tgt.position.set(worldX + Math.sin(v.heading) * 20, v.y + m0.y - 2, worldZ + Math.cos(v.heading) * 20);
  };
  assign(spotA, spotTargetA, bi);
  assign(spotB, spotTargetB, si);
}

function clearAll() {
  for (const v of vehicleArr) { kit?.free(v._handle); ctx.world.vehicles.delete(v.id); }
  vehicles.clear();
  vehicleArr.length = 0;
}

const api = {
  KINDS: KIND_IDS,
  /** Spawn one vehicle on an existing edge id at arc length s (a→b direction). Returns the new vehicle id, or null. */
  spawn(kind, edgeId, s = 0) {
    if (!graph || !KINDS[kind]) return null;
    const edge = getEdge(graph, edgeId);
    if (!edge) return null;
    const id = ctx.world.nextId('veh');
    const v = createVehicle(ctx, kit, graph, id, kind, edgeId, THREE.MathUtils.clamp(s, 0, edge.length), true);
    if (!v) return null;
    addVehicle(v);
    ctx.events.emit('vehicle:spawned', { id });
    return id;
  },
  remove(id) {
    const v = vehicles.get(id);
    if (!v) return false;
    dropVehicle(v);
    ctx.events.emit('vehicle:despawned', { id });
    return true;
  },
  list() { return vehicleArr.slice(); },
  get(id) { return vehicles.get(id) || null; },
  /** Target number of ambient (non-tour) vehicles kept in the world; spawned/despawned incrementally to match. */
  setDensity(n) { density = Math.max(0, Math.round(n)); applyDensity(); },
  getDensity() { return density; },
  /** { from: gateNodeId, stops: [nodeId,...], durationHours } → vehicle id, or null. See README "Tours". */
  startTour(opts) { return graph ? startTourImpl(ctx, kit, graph, mgr, opts) : null; },
  stats() { return { vehicles: vehicles.size, ...(kit ? kit.stats() : {}) }; },
  /** Which graph backend traffic is actually driving on: 'roads' or 'fallback'. */
  graphBackend() { return graph ? graph.backend : null; },
};

export default {
  id: 'traffic',
  version: 1,
  dependencies: [],
  optional: ['roads', 'animals', 'effects', 'audio'],
  api,

  async init(c) {
    ctx = c;
    group = new THREE.Group(); group.name = 'traffic';
    ctx.scene.add(group);
    densityRng = ctx.rng.fork('density');
    try {
      kit = new VehicleKit(ctx, group);
      graph = resolveGraph(ctx);
    } catch (err) {
      ctx.log.error('[traffic] init failed building vehicle kit/graph', err);
    }
  },

  update(dt, t) {
    void t;
    if (!ctx || !kit || !graph) return;
    if (dt > 0.1) dt = 0.1;
    const audioApi = ctx.modules.get('audio');
    for (let i = 0; i < vehicleArr.length; i++) updateVehicle(ctx, kit, graph, vehicleArr[i], vehicleArr, dt, DUST_COOLDOWN, audioApi);
    stepTours(ctx, graph, vehicleArr, mgr, dt);
    const night = nightFactor(ctx.world.time.hour);
    kit.setHeadlightIntensity(night * 2.2);
    kit.setTaillightIntensity(night);
    updateSpotlights(night);
  },

  tick() {},

  dispose() {
    clearAll();
    kit?.dispose();
    spotA?.removeFromParent(); spotB?.removeFromParent();
    spotA = null; spotB = null; spotTargetA = null; spotTargetB = null;
    disposeFallback();
    group?.removeFromParent();
    ctx = null; group = null; kit = null; graph = null; density = 0; densityRng = null;
  },

  showcase: {
    presets,
    async stage(c, preset) {
      return stage(c, preset, {
        group, kit, mgr,
        getGraph: () => graph,
        setGraph: (g) => { graph = g; },
        clearAll,
        spawnVehicle(kind, edgeId, s, forward, opts) {
          const id = ctx.world.nextId('veh');
          const v = createVehicle(ctx, kit, graph, id, kind, edgeId, s, forward, opts);
          if (v) { addVehicle(v); ctx.events.emit('vehicle:spawned', { id }); }
          return v;
        },
        startTour: api.startTour,
        getNode: (id) => getNode(graph, id),
        edgesOf: () => edgesOf(graph),
      });
    },
  },
};
