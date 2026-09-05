// roads showcase: presets + stage(). Lays a loop network (paved spine, gravel loop, dirt tracks) with
// 5 junctions and two bridges over a river strip. Works on the flat core fallback (we stage a gentle
// rolling heightfield + river ourselves) and on real terrain when the terrain module is present.
import * as THREE from 'three';
import { makeGroundMaterial, makeWaterMaterial } from './materials.js';
import { flattenHeightfield } from './terrainConform.js';

export const presets = {
  overview: { camera: { target: [-10, 80], distance: 560, pitch: 44, yaw: 22 }, tod: 15, description: 'loop network: paved spine, gravel loop, dirt tracks, 5 junctions, 2 bridges' },
  close:    { camera: { target: [112, 156], distance: 22, pitch: 16, yaw: 262 }, tod: 16.5, description: 'dirt two-track at 20 m: ruts, dust edges, timber bridge beyond' },
  paved:    { camera: { target: [-150, -52], distance: 42, pitch: 15, yaw: 268 }, tod: 10, description: 'tar road: crown, edge lines, faded centre dashes, patches, km stone' },
  junction: { camera: { target: [40, -30], distance: 46, pitch: 32, yaw: 205 }, tod: 17, description: '3-way paved/gravel junction with fingerpost sign' },
  bridge:   { camera: { target: [194, 160], distance: 60, pitch: 18, yaw: 150 }, tod: 9, description: 'timber bridge over the river on the dirt track' },
  night:    { camera: { target: [40, -30], distance: 95, pitch: 24, yaw: 120 }, tod: 21.5, description: 'night: moonlight, solar lamps on the signposts, reflective paint' },
};

const WATER_LEVEL = 0.5;
let staging = null; // THREE.Group of showcase-only meshes

function riverX(z) { return 150 + 45 * Math.sin(z * 0.011) + 14 * Math.sin(z * 0.031 + 1.3); }

/** Write a gentle rolling heightfield + river channel into world.terrain (only when no terrain module exists). */
function stageHeights(ctx) {
  const world = ctx.world, T = world.terrain, res = T.res, h = T.heights, noise = ctx.noise;
  for (let iz = 0; iz < res; iz++) {
    for (let ix = 0; ix < res; ix++) {
      const { x, z } = world.sampleToWorld(ix, iz);
      let y = 1.8 + noise.noise2D(x / 230 + 3.1, z / 230) * 1.5 + noise.noise2D(x / 70, z / 70 + 7.7) * 0.35 + noise.noise2D(x / 18, z / 18) * 0.06;
      const dr = Math.abs(x - riverX(z));
      const t = Math.min(1, dr / 17);
      const ss = t * t * (3 - 2 * t);
      y -= 3.4 * (1 - ss);
      // small floodplain terrace
      const t2 = Math.min(1, Math.max(0, (dr - 14) / 30));
      y -= 0.5 * (1 - t2 * t2 * (3 - 2 * t2));
      h[iz * res + ix] = y;
    }
  }
  T.waterLevel = WATER_LEVEL;
  world.updateHeightStats();
}

function buildGround(ctx, sets, parent) {
  const world = ctx.world, T = world.terrain, res = T.res;
  const step = 2; // heightfield samples per mesh vertex → 4 m cells
  const n = Math.floor((res - 1) / step) + 1;
  const pos = new Float32Array(n * n * 3), uv = new Float32Array(n * n * 2);
  for (let jz = 0; jz < n; jz++) for (let jx = 0; jx < n; jx++) {
    const ix = Math.min(res - 1, jx * step), iz = Math.min(res - 1, jz * step);
    const { x, z } = world.sampleToWorld(ix, iz);
    const k = jz * n + jx;
    pos[k * 3] = x; pos[k * 3 + 1] = T.heights[iz * res + ix]; pos[k * 3 + 2] = z;
    uv[k * 2] = x / 7; uv[k * 2 + 1] = z / 7;
  }
  const idx = new Uint32Array((n - 1) * (n - 1) * 6);
  let q = 0;
  for (let jz = 0; jz < n - 1; jz++) for (let jx = 0; jx < n - 1; jx++) {
    const a = jz * n + jx, b = a + 1, c = a + n, d = c + 1;
    idx[q++] = a; idx[q++] = c; idx[q++] = b; idx[q++] = b; idx[q++] = c; idx[q++] = d;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, makeGroundMaterial(ctx.materials, sets, WATER_LEVEL));
  mesh.name = 'staging-ground'; mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function buildWater(ctx, parent) {
  const pts = [], half = ctx.world.half;
  const w = 26;
  const pos = [], uv = [], idx = [];
  let k = 0;
  for (let z = -half; z <= half; z += 8) {
    const x = riverX(z);
    pos.push(x - w, WATER_LEVEL, z, x + w, WATER_LEVEL, z);
    uv.push((x - w) / 30, z / 30, (x + w) / 30, z / 30);
    if (k > 0) { const a = (k - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    k++;
  }
  void pts;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, makeWaterMaterial(ctx.materials, ctx.textures));
  mesh.name = 'staging-water'; mesh.receiveShadow = true; mesh.renderOrder = 10;
  parent.add(mesh);
  return mesh;
}

/** The showcase network. Coordinates in metres. */
function layNetwork(api) {
  const ids = [];
  // paved spine east–west, crossing the river (concrete bridge)
  ids.push(...api.addRoad([[-330, -70], [-200, -55], [-80, -45], [40, -30], [120, -10], [200, 5], [300, 30]], 'paved'));
  // gravel loop hanging off the spine (two 3-way junctions)
  ids.push(...api.addRoad([[40, -30], [70, 60], [50, 170], [-40, 230], [-160, 225], [-230, 140], [-200, 30], [-80, -45]], 'gravel'));
  // dirt track east across the river (timber bridge) to a hide
  ids.push(...api.addRoad([[50, 170], [140, 150], [220, 175], [320, 130], [380, 60]], 'dirt'));
  // dirt track crossing the loop (4-way) and ending at the loop's south-east node (4-way)
  ids.push(...api.addRoad([[-330, 100], [-230, 140], [-120, 120], [-30, 120], [50, 170]], 'dirt'));
  // gravel spur from the paved end to a camp (kind change at a 2-way node → transition patch)
  ids.push(...api.addRoad([[300, 30], [340, -60], [330, -150]], 'gravel'));
  // dirt spur south to a hide
  ids.push(...api.addRoad([[-40, 230], [-30, 300], [-70, 360]], 'dirt'));
  return ids;
}

/** On real terrain: if nothing crosses water, add a dirt crossing over the nearest water body. */
function ensureBridge(ctx, api, graph) {
  const world = ctx.world;
  for (const e of graph.edges.values()) for (let i = 0; i < e.points.length; i += 2) if (world.isWater(e.points[i], e.points[i + 1])) return;
  let best = null, bd = Infinity;
  for (let z = -420; z <= 420; z += 8) for (let x = -420; x <= 420; x += 8) {
    if (!world.isWater(x, z)) continue;
    const d = Math.hypot(x, z);
    if (d < bd) { bd = d; best = { x, z }; }
  }
  if (!best) return;
  for (const [dx, dz] of [[1, 0], [0, 1]]) {
    let a = 0, b = 0;
    while (a < 80 && world.isWater(best.x - dx * a, best.z - dz * a)) a += 2;
    while (b < 80 && world.isWater(best.x + dx * b, best.z + dz * b)) b += 2;
    if (a >= 80 || b >= 80) continue;
    const span = a + b;
    if (span > 70) continue;
    const ax = best.x - dx * (a + 30), az = best.z - dz * (a + 30), bx = best.x + dx * (b + 30), bz = best.z + dz * (b + 30);
    api.addRoad([[ax, az], [best.x - dx * a, best.z - dz * a], [best.x + dx * b, best.z + dz * b], [bx, bz]], 'dirt');
    return;
  }
}

/** Find the water crossing that best matches the "timber bridge on a dirt track" showcase shot:
 * the longest water span on a dirt edge (falls back to any edge) — real terrain's river almost never
 * lines up with the coordinates the fixed showcase network was authored against on the flat fallback,
 * so the 'bridge' preset must find its subject instead of assuming one. */
function locateBridge(ctx, api, graph) {
  const world = ctx.world;
  const tmp = { position: new THREE.Vector3(), tangent: new THREE.Vector3() };
  let best = null;
  for (const e of graph.edges.values()) {
    let inWater = false, s0 = 0;
    for (let s = 0; s <= e.length; s += 2) {
      api.sampleEdge(e.id, s, tmp);
      const w = world.isWater(tmp.position.x, tmp.position.z);
      if (w && !inWater) { inWater = true; s0 = s; }
      if (!w && inWater) {
        inWater = false;
        const len = s - s0;
        const rank = len + (e.kind === 'dirt' ? 1000 : 0);   // strongly prefer a dirt crossing
        if (!best || rank > best.rank) { const mid = (s0 + s) / 2; api.sampleEdge(e.id, mid, tmp); best = { rank, x: tmp.position.x, z: tmp.position.z, dx: tmp.tangent.x, dz: tmp.tangent.z, len }; }
      }
    }
    if (inWater) {
      const len = e.length - s0;
      const rank = len + (e.kind === 'dirt' ? 1000 : 0);
      if (!best || rank > best.rank) { const mid = (s0 + e.length) / 2; api.sampleEdge(e.id, mid, tmp); best = { rank, x: tmp.position.x, z: tmp.position.z, dx: tmp.tangent.x, dz: tmp.tangent.z, len }; }
    }
  }
  return best;
}

export async function stage(ctx, presetName, mod) {
  const world = ctx.world;
  const group = mod.api.group;
  if (staging) { staging.removeFromParent(); staging.traverse((o) => { o.geometry?.dispose?.(); }); staging = null; }
  staging = new THREE.Group(); staging.name = 'roads-staging';
  group.add(staging);
  mod.api.clear();

  const terrain = ctx.modules.get('terrain');
  if (terrain) {
    try {
      if (typeof terrain.generate === 'function' && !(world.terrain.version > 0)) await terrain.generate({ preset: 'savannah', seed: world.seed });
    } catch (err) { ctx.log.warn('[roads] terrain.generate failed: ' + (err?.message || err)); }
    layNetwork(mod.api);
    ensureBridge(ctx, mod.api, mod.graph);
  } else {
    stageHeights(ctx);
    layNetwork(mod.api);
    flattenHeightfield(world, mod.graph, { paint: false });
    buildGround(ctx, mod.sets, staging);
    buildWater(ctx, staging);
  }
  mod.rebuild();

  // Reposition the 'bridge' preset onto whatever water crossing actually exists — the fixed network's
  // coordinates were authored for the flat-fallback river, which real terrain's generated river rarely
  // matches, so a hardcoded target frequently pointed at open plains with no bridge in frame.
  const found = locateBridge(ctx, mod.api, mod.graph);
  if (found) {
    const yaw = (Math.atan2(-found.dx, -found.dz) * 180) / Math.PI + 55; // 3/4 view across the span
    presets.bridge.camera = { target: [found.x, found.z], distance: Math.max(34, found.len * 1.1), pitch: 18, yaw };
  }
  for (const [name, p] of Object.entries(presets)) ctx.rig.registerPreset?.('roads-' + name, { ...p.camera, tod: p.tod, description: p.description });

  if (!ctx.modules.get('environment')) {
    const moon = new THREE.DirectionalLight(0x9fb6e0, 0);
    moon.position.set(-300, 520, 240); moon.target.position.set(0, 0, 0);
    moon.name = 'roads-moon';
    staging.add(moon, moon.target);
    mod.setMoon(moon);
  }
  void presetName;
}
