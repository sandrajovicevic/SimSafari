// roads — road graph (world.roads), terrain-conforming road meshes (dirt/gravel/paved), junction patches,
// bridges over water, signposts, and the pathfinding/sampling API used by traffic.
import * as THREE from 'three';
import { flattenHeightfield, refreshTerrain } from './terrainConform.js';
import { RoadGraph, KINDS } from './graph.js';
import { buildTextureSets, makeRoadMaterial, makeRoadUniforms } from './materials.js';
import { buildRoadMeshes } from './ribbon.js';
import { PropKit } from './props.js';
import { presets, stage } from './showcase.js';

let ctx = null, group = null, graph = null, sets = null, uni = null, mats = null, kit = null;
let meshes = [];
let dirty = false, dirtyAt = 0, selfEdit = false, moon = null;
let lastBuild = { drawables: 0, triangles: 0, ms: 0, junctions: 0, bridges: 0, edges: 0 };
let lastVersionBuilt = -1;
// Edge ids whose ground is already flattened + dusted. Conforming is incremental: a rebuild only conforms
// (and asks terrain to refresh) the edges not in here, so one road edit costs its own footprint instead of
// re-flattening the whole network (critic roads r4 #5: 1.6 s per edit). Cleared when the terrain is
// regenerated; an external terrain edit drops the edges it touches so they re-conform.
const conformed = new Set();

function nightFactor(h) {
  const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  return h >= 12 ? ss(18, 19.5, h) : 1 - ss(5, 6.5, h);
}

/** Flatten the terrain under every not-yet-conformed edge and paint road dust, then refresh the terrain module's meshes. */
function conformTerrain() {
  const terrain = ctx.modules.get('terrain');
  for (const id of conformed) if (!graph.edges.has(id)) conformed.delete(id);
  if (!terrain || graph.edges.size === 0) return 0;
  const todo = [];
  for (const e of graph.edges.values()) if (!conformed.has(e.id)) todo.push(e);
  if (!todo.length) return 0;
  const world = ctx.world;
  selfEdit = true;
  try {
    const isWater = typeof terrain.isWaterAt === 'function' ? (x, z) => terrain.isWaterAt(x, z) : null;
    const bbox = flattenHeightfield(world, graph, { paint: true, isWater, edges: todo });
    refreshTerrain(terrain, world, bbox, ctx.log);
    for (const e of todo) conformed.add(e.id);
  } catch (err) {
    ctx.log.warn('[roads] terrain conform failed: ' + (err?.message || err));
  } finally { selfEdit = false; }
  return todo.length;
}

/** Forget the conform state of every edge whose footprint overlaps an external terrain edit. */
function unconformRect(r) {
  if (!r || !Number.isFinite(r.x0)) { conformed.clear(); return; }
  for (const e of graph.edges.values()) {
    if (!conformed.has(e.id)) continue;
    const p = e.points, m = e.width * 0.5 + 6;
    for (let i = 0; i < p.length; i += 2) {
      if (p[i] >= r.x0 - m && p[i] <= r.x1 + m && p[i + 1] >= r.z0 - m && p[i + 1] <= r.z1 + m) { conformed.delete(e.id); break; }
    }
  }
}

function disposeMeshes() {
  for (const m of meshes) { m.removeFromParent(); m.geometry.dispose(); }
  meshes = [];
}

/** Rebuild every road mesh from the graph (terrain conform is incremental, see `conformed`). Synchronous. */
function rebuild() {
  if (!ctx) return;
  const t0 = performance.now();
  dirty = false;
  graph.markOccupancy();
  const conformedEdges = conformTerrain();
  const tConform = performance.now();
  disposeMeshes();
  const terrain = ctx.modules.get('terrain');
  const isWater = terrain && typeof terrain.isWaterAt === 'function' ? (x, z) => terrain.isWaterAt(x, z) : null;
  const built = buildRoadMeshes(graph, ctx.world, { isWater });
  let tris = 0, drawables = 0;
  for (const kind of ['dirt', 'gravel', 'paved']) {
    const g = built.kinds[kind];
    if (!g) continue;
    const m = new THREE.Mesh(g, mats[kind]);
    m.name = 'road-' + kind; m.receiveShadow = true; m.castShadow = false; m.frustumCulled = true;
    m.renderOrder = kind === 'paved' ? 3 : kind === 'gravel' ? 2 : 1;
    group.add(m); meshes.push(m);
    tris += g.index.count / 3; drawables++;
  }
  for (const k of ['wood', 'concrete']) {
    const g = built.bridges[k];
    if (!g) continue;
    const m = new THREE.Mesh(g, mats[k]);
    m.name = 'bridge-' + k; m.receiveShadow = true; m.castShadow = true;
    group.add(m); meshes.push(m);
    tris += g.index.count / 3; drawables++;
  }
  const tMesh = performance.now();
  const props = kit.place(built.junctions, [...graph.edges.values()], ctx.world, ctx.rng.fork('props' + graph.version()));
  lastBuild = {
    drawables: drawables + kit.meshes.length, triangles: Math.round(tris), ms: +(performance.now() - t0).toFixed(1),
    junctions: built.junctions.length, bridges: built.bridgeSpans.length, edges: graph.edges.size, props,
    conformedEdges, conformMs: +(tConform - t0).toFixed(1), meshMs: +(tMesh - tConform).toFixed(1), propsMs: +(performance.now() - tMesh).toFixed(1),
  };
  lastVersionBuilt = graph.version();
  ctx.log.info(`[roads] rebuilt: ${lastBuild.edges} edges, ${lastBuild.junctions} junctions, ${lastBuild.bridges} bridges, ${lastBuild.triangles} tris, ${lastBuild.drawables} drawables in ${lastBuild.ms} ms`);
  ctx.events.emit('road:changed', { edgeId: null, version: graph.version() });
}

const api = {
  KINDS,
  /** Add a road through [[x,z],...] control points. Returns the new edge ids. */
  addRoad(points, kind = 'dirt', width) {
    const ids = graph.addRoad(points, kind, width);
    if (ids.length) dirty = true;
    return ids;
  },
  removeRoad(edgeId) { const ok = graph.removeRoad(edgeId); if (ok) dirty = true; return ok; },
  /** Remove every road. */
  clear() { graph.clear(); dirty = true; },
  nearestEdge(x, z, maxDist) { return graph.nearestEdge(x, z, null, maxDist); },
  nearestNode(x, z, maxDist) { return graph.nearestNode(x, z, maxDist); },
  /** A* → array of node ids or null. */
  pathfind(a, b) { return graph.pathfind(a, b); },
  /** A* → { nodes, edges, length } or null. */
  route(a, b) { return graph.route(a, b); },
  /** Position + tangent at arc length s. out = { position: Vector3, tangent: Vector3 } (reused, no allocation). */
  sampleEdge(edgeId, s, out) { return graph.sampleEdge(edgeId, s, out); },
  getLanes(edgeId) { return graph.getLanes(edgeId); },
  graphVersion() { return graph.version(); },
  getEdge(id) { return graph.edges.get(id) || null; },
  getNode(id) { return graph.nodes.get(id) || null; },
  edges() { return graph.edges; },
  nodes() { return graph.nodes; },
  stats() { return { ...graph.stats(), build: lastBuild }; },
  /** Force a synchronous mesh rebuild (normally happens automatically on the next frame). full = re-conform every edge. */
  rebuild(full = false) { if (full) conformed.clear(); rebuild(); },
  isDirty() { return dirty; },
  /** Colour the road edges blend towards (terrain dust). */
  setDustColor(r, g, b) { uni.uDust.value.setRGB(r, g, b); },
  get group() { return group; },
};

export default {
  id: 'roads',
  version: 1,
  dependencies: [],
  // environment is optional but strongly wanted: it supplies the sky, PMREM ambient, fog and exposure the
  // road surface is graded against. Without it the core fallback lighting leaves everything flat and pale.
  optional: ['terrain', 'environment'],
  api,

  async init(c) {
    ctx = c;
    group = new THREE.Group(); group.name = 'roads';
    ctx.scene.add(group);
    graph = new RoadGraph(ctx.world, ctx.events, ctx.log);
    try {
      sets = buildTextureSets(ctx.textures, ctx.quality);
      uni = makeRoadUniforms();
      mats = {
        dirt: makeRoadMaterial(ctx.materials, sets, 'dirt', uni),
        gravel: makeRoadMaterial(ctx.materials, sets, 'gravel', uni),
        paved: makeRoadMaterial(ctx.materials, sets, 'paved', uni),
        wood: ctx.materials.standard({ color: 0xffffff, roughness: 1 }),
        concrete: ctx.materials.standard({ color: 0xffffff, roughness: 1 }),
      };
      ctx.materials.applyPbr(mats.wood, sets.planks, { repeatMetres: 2 });
      ctx.materials.applyPbr(mats.concrete, sets.concrete, { repeatMetres: 3 });
      mats.wood.name = 'bridge-wood'; mats.concrete.name = 'bridge-concrete';
      kit = new PropKit(ctx, sets);
      group.add(kit.group);
    } catch (err) {
      ctx.log.error('[roads] init failed building materials', err);
    }
    ctx.events.on('terrain:ready', () => { conformed.clear(); dirty = true; });
    ctx.events.on('terrain:modified', (r) => { if (!selfEdit && graph.edges.size) { unconformRect(r); dirty = true; dirtyAt = ctx.app.time + 0.4; } });
    ctx.events.on('time:set', () => { uni.uNight.value = nightFactor(ctx.world.time.hour); });
    // world.roads is owned by us; expose kinds table for tools/ui
    ctx.world.roads.kinds = KINDS;
  },

  update(dt, t) {
    if (!ctx) return;
    const n = nightFactor(ctx.world.time.hour);
    uni.uNight.value = n;
    kit.setNight(n);
    if (moon) moon.intensity = 0.55 * n;
    if (dirty && t >= dirtyAt) rebuild();
  },

  tick() {},

  dispose() {
    disposeMeshes();
    kit?.dispose();
    if (mats) for (const m of Object.values(mats)) { ctx.materials.untrack(m); m.dispose(); }
    for (const k of ['roads2:dirt', 'roads2:gravel', 'roads2:asphalt', 'roads2:planks', 'roads2:concrete', 'roads2:ground']) {
      for (const suf of [':height', ':albedo', ':orm', ':normal']) ctx.textures.dispose(k + suf);
    }
    ctx.textures.dispose('roads:signAtlas'); ctx.textures.dispose('roads2:waterN');
    if (moon) { moon.removeFromParent(); moon = null; }
    group?.removeFromParent();
    ctx = null; group = null; graph = null; meshes = []; conformed.clear();
  },

  showcase: {
    presets,
    async stage(c, preset) {
      return stage(c, preset, {
        api, sets, rebuild, graph,
        setMoon(light) { moon = light; },
      });
    },
  },
};
