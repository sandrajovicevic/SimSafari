// Instanced wooden-post-and-wire fences along every habitat's boundary. One InstancedMesh for posts,
// one for the two-wire rail (rail geometry is fixed-length — every boundary edge is exactly one grid
// cell, world.grid.cell metres — so no per-instance scaling is needed, only a rotation basis + terrain
// height). Where a road crosses the boundary the rail is skipped and the flanking posts are raised
// slightly, reading as a gate opening. 2 draw calls total (posts + rails).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Z } from './state.js';
import { traceBoundaryEdges } from './habitats.js';

const POST_H = 1.15, POST_R_TOP = 0.045, POST_R_BOT = 0.062;
const WIRE_H = [0.86, 0.42];
const WIRE_R = 0.026;
const GATE_MARGIN = 2.4; // metres added to half the road width when testing an edge for a gate

function buildPostGeometry() {
  const geo = new THREE.CylinderGeometry(POST_R_TOP, POST_R_BOT, POST_H, 7, 2);
  geo.translate(0, POST_H / 2, 0);
  return geo;
}

function buildRailGeometry(length) {
  const parts = [];
  for (const h of WIRE_H) {
    const g = new THREE.CylinderGeometry(WIRE_R, WIRE_R, length, 5, 1);
    g.rotateZ(Math.PI / 2);
    g.translate(0, h, 0);
    parts.push(g);
  }
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  merged.computeVertexNormals();
  return merged;
}

function buildMaterials(ctx) {
  const T = ctx.textures;
  const wood = T.pbr({
    key: 'zoning:post', size: 256, seed: 41, normalStrength: 0.06,
    height: /* glsl */ `float height(vec2 uv){
  float grain = tnoise(vec2(uv.x * 3.0, uv.y * 24.0), 3.0, uSeed) * 0.5 + 0.5;
  float split = tfbm(uv, 6.0, 3, uSeed + 2.0) * 0.5 + 0.5;
  return clamp(0.45 + grain * 0.35 + split * 0.20, 0.0, 1.0);
}`,
    albedo: /* glsl */ `vec3 albedo(vec2 uv, float h){
  vec3 dark = vec3(0.145, 0.098, 0.055), pale = vec3(0.260, 0.185, 0.112);
  vec3 c = mix(dark, pale, h);
  float weather = tfbm(uv, 2.5, 3, uSeed + 6.0) * 0.5 + 0.5;
  c = mix(c, vec3(0.185, 0.170, 0.150), smoothstep(0.55, 0.85, weather) * 0.35);
  return c;
}`,
    roughness: /* glsl */ `float rough(vec2 uv, float h){ return clamp(0.94 - h * 0.14, 0.62, 1.0); }`,
    ao: /* glsl */ `float ao(vec2 uv, float h){ return mix(0.68, 1.0, h); }`,
  });
  const postMat = ctx.materials.standard({ roughness: 1, metalness: 0, envMapIntensity: 0.5 });
  ctx.materials.applyPbr(postMat, wood, { repeatMetres: 1.1 });
  postMat.name = 'zoning-post';

  const railMat = ctx.materials.standard({
    color: new THREE.Color(0.075, 0.065, 0.055), roughness: 0.55, metalness: 0.3, envMapIntensity: 0.65,
  });
  railMat.name = 'zoning-rail';
  return { postMat, railMat };
}

function makeInstanced(geo, mat, cap, name) {
  const m = new THREE.InstancedMesh(geo, mat, cap);
  m.name = name;
  m.count = 0;
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.castShadow = true; m.receiveShadow = true;
  m.frustumCulled = false;
  return m;
}

export function buildFences(ctx) {
  const postGeo = buildPostGeometry();
  const railGeo = buildRailGeometry(Z.world.grid.cell);
  const { postMat, railMat } = buildMaterials(ctx);
  const postMesh = makeInstanced(postGeo, postMat, 96, 'zoning-fence-posts');
  const railMesh = makeInstanced(railGeo, railMat, 96, 'zoning-fence-rails');
  Z.group.add(postMesh, railMesh);
  Z.fences = { postGeo, railGeo, postMat, railMat, postMesh, railMesh, postCap: 96, railCap: 96 };
}

function growCapacity(kind, need) {
  const F = Z.fences;
  const capKey = kind + 'Cap', meshKey = kind + 'Mesh', geoKey = kind + 'Geo', matKey = kind + 'Mat';
  if (need <= F[capKey]) return;
  const cap = Math.max(need, Math.ceil(F[capKey] * 1.5));
  const old = F[meshKey];
  const nu = makeInstanced(F[geoKey], F[matKey], cap, old.name);
  Z.group.add(nu);
  old.removeFromParent();
  old.dispose();
  F[meshKey] = nu;
  F[capKey] = cap;
}

function roadPoints(ctx) {
  const roads = ctx.modules.get('roads');
  const out = [];
  if (!roads?.edges) return out;
  try {
    for (const e of roads.edges().values()) {
      const w = e.width || 5;
      const pts = e.points || [];
      for (let i = 0; i < pts.length; i += 2) out.push(pts[i], pts[i + 1], w);
    }
  } catch { /* roads module mid-rebuild — treat as no roads this pass */ }
  return out;
}

function nearRoad(pts, x, z) {
  for (let i = 0; i < pts.length; i += 3) {
    const dx = pts[i] - x, dz = pts[i + 1] - z, r = pts[i + 2] * 0.5 + GATE_MARGIN;
    if (dx * dx + dz * dz < r * r) return true;
  }
  return false;
}

const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1), _m = new THREE.Matrix4();
const _bx = new THREE.Vector3(), _by = new THREE.Vector3(0, 1, 0), _bz = new THREE.Vector3(), _bm = new THREE.Matrix4();

function basisAlong(dx, dz) {
  const len = Math.hypot(dx, dz) || 1;
  _bx.set(dx / len, 0, dz / len);
  _bz.crossVectors(_bx, _by);
  _bm.makeBasis(_bx, _by, _bz);
  return _bm;
}

/** Rebuild every fence instance from the current world.habitats boundaries. Sets habitat.fenced. */
export function rebuildFences() {
  const F = Z.fences;
  if (!F) return;
  const ctx = Z.ctx, world = Z.world;
  const rpts = roadPoints(ctx);
  const postMap = new Map(); // "x,z" (cm-rounded) -> { x, z, gate }
  const rails = []; // { x, z, dx, dz }

  for (const h of world.habitats.values()) {
    const edges = traceBoundaryEdges(world, h.id);
    let fencedN = 0;
    for (const e of edges) {
      const mx = (e.x0 + e.x1) / 2, mz = (e.z0 + e.z1) / 2;
      const gate = nearRoad(rpts, mx, mz);
      for (const [px, pz] of [[e.x0, e.z0], [e.x1, e.z1]]) {
        const k = Math.round(px * 10) + ',' + Math.round(pz * 10);
        const prev = postMap.get(k);
        if (prev) { if (gate) prev.gate = true; } else postMap.set(k, { x: px, z: pz, gate });
      }
      if (!gate) { fencedN++; rails.push({ x: mx, z: mz, dx: e.x1 - e.x0, dz: e.z1 - e.z0 }); }
    }
    h.fenced = edges.length ? fencedN / edges.length : 0;
  }

  const posts = [...postMap.values()];
  growCapacity('post', posts.length);
  growCapacity('rail', rails.length);

  let pi = 0;
  for (const p of posts) {
    const y = world.getHeight(p.x, p.z);
    _p.set(p.x, y, p.z);
    _q.identity();
    _s.set(1, p.gate ? 1.3 : 1, 1);
    _m.compose(_p, _q, _s);
    F.postMesh.instanceMatrix.array.set(_m.elements, pi * 16);
    pi++;
  }
  F.postMesh.count = pi;
  F.postMesh.instanceMatrix.needsUpdate = true;
  F.postMesh.computeBoundingSphere();

  let ri = 0;
  for (const r of rails) {
    const y = world.getHeight(r.x, r.z);
    _q.setFromRotationMatrix(basisAlong(r.dx, r.dz));
    _p.set(r.x, y, r.z);
    _s.set(1, 1, 1);
    _m.compose(_p, _q, _s);
    F.railMesh.instanceMatrix.array.set(_m.elements, ri * 16);
    ri++;
  }
  F.railMesh.count = ri;
  F.railMesh.instanceMatrix.needsUpdate = true;
  F.railMesh.computeBoundingSphere();
}

export function disposeFences() {
  const F = Z.fences;
  if (!F) return;
  F.postMesh.removeFromParent(); F.postMesh.dispose();
  F.railMesh.removeFromParent(); F.railMesh.dispose();
  F.postGeo.dispose(); F.railGeo.dispose();
  Z.ctx.materials.untrack(F.postMat); F.postMat.dispose();
  Z.ctx.materials.untrack(F.railMat); F.railMat.dispose();
  for (const suf of [':height', ':albedo', ':orm', ':normal']) Z.ctx.textures.dispose('zoning:post' + suf);
  Z.fences = null;
}
