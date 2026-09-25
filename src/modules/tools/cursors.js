// WebGL cursor/preview meshes: the terrain ring decal, the road preview ribbon, and the selection
// marker. All three pre-allocate their geometry once and mutate typed arrays in place every frame
// (no per-frame `new` beyond a couple of reused scratch THREE.Vector3s), per ARCHITECTURE §2.
import * as THREE from 'three';

const _v0 = new THREE.Vector3();
const _v1 = new THREE.Vector3();
const _n = new THREE.Vector3();

// ---------------------------------------------------------------------------------------------
// Terrain ring cursor: an annulus that conforms to the heightfield under the brush.
// ---------------------------------------------------------------------------------------------
export class RingCursor {
  constructor(segments = 56) {
    this.segments = segments;
    const n = segments;
    const positions = new Float32Array((n + 1) * 2 * 3);
    const idx = [];
    for (let i = 0; i < n; i++) {
      const a = i * 2, b = i * 2 + 1, c = ((i + 1) % n) * 2, d = ((i + 1) % n) * 2 + 1;
      idx.push(a, b, c, b, d, c);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setIndex(idx);
    geo.setDrawRange(0, idx.length);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x7dffb0, transparent: true, opacity: 0.85, depthWrite: false,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.name = 'tools-ring-cursor';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 50;
    this.mesh.visible = false;
    this.geo = geo; this.mat = mat;
  }

  setColor(hex) { this.mat.color.setHex(hex); }

  /** Rebuild the ring's vertex positions in place around (x,z), radius r, conforming to terrain. */
  update(world, x, z, r) {
    const n = this.segments;
    const pos = this.geo.attributes.position.array;
    const w = Math.max(0.25, Math.min(1.6, r * 0.06));
    const inner = Math.max(0.05, r - w), outer = r + w;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const cx = Math.cos(a), sz = Math.sin(a);
      const ix = x + cx * inner, iz = z + sz * inner;
      const ox = x + cx * outer, oz = z + sz * outer;
      const iy = world.getHeight(ix, iz) + 0.08;
      const oy = world.getHeight(ox, oz) + 0.08;
      const bi = i * 2 * 3;
      pos[bi] = ix; pos[bi + 1] = iy; pos[bi + 2] = iz;
      pos[bi + 3] = ox; pos[bi + 4] = oy; pos[bi + 5] = oz;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.computeBoundingSphere();
    this.mesh.position.set(0, 0, 0);
  }

  /** Drape the thin ring over the terrain around (pos, radius). Call when the selection changes; a flat
   *  ring at the building's centre height was buried wherever the ground rose (critic r4 follow-up). */
  drape(world, pos, radius) {
    if (!pos || radius <= 6) return;
    const a = this.thinGeo.attributes.position, b = this._thinBase;
    for (let i = 0; i < a.count; i++) {
      const ux = b[i * 3], uz = b[i * 3 + 2];
      a.array[i * 3 + 1] = world.getHeight(pos.x + ux * radius, pos.z + uz * radius) - pos.y + 0.25;
    }
    a.needsUpdate = true;
    this.thinGeo.computeBoundingSphere();
  }

  dispose() { this.geo.dispose(); this.thinGeo.dispose(); this.mat.dispose(); }
}

// ---------------------------------------------------------------------------------------------
// Road preview ribbon: Catmull-Rom through the committed points + the live cursor point, coloured
// by grade (red beyond 12%), plus small node markers and a snap indicator.
// ---------------------------------------------------------------------------------------------
const MAX_SAMPLES = 160;
const GRADE_WARN = 0.12;

export class RoadRibbon {
  constructor() {
    const cap = MAX_SAMPLES;
    const positions = new Float32Array(cap * 2 * 3);
    const colors = new Float32Array(cap * 2 * 3);
    const idx = new Uint16Array((cap - 1) * 6);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.setDrawRange(0, 0);
    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.75, depthWrite: false,
      side: THREE.DoubleSide, toneMapped: false,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.name = 'tools-road-ribbon';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 49;
    this.mesh.visible = false;
    this.geo = geo; this.mat = mat; this.cap = cap;

    // node markers: small discs, one InstancedMesh sized for a generous point cap
    const markGeo = new THREE.CircleGeometry(1, 16);
    markGeo.rotateX(-Math.PI / 2);
    this.markMat = new THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false });
    this.markers = new THREE.InstancedMesh(markGeo, this.markMat, 32);
    this.markers.name = 'tools-road-markers';
    this.markers.frustumCulled = false;
    this.markers.renderOrder = 51;
    this.markers.count = 0;
    this.markers.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    // snap indicator: a bright ring shown at the point the live cursor snapped to — and at the
    // committed point the path is pinned to when that snapped (see RoadTool._committedSnap)
    const snapGeo = new THREE.RingGeometry(0.9, 1.3, 24);
    snapGeo.rotateX(-Math.PI / 2);
    this.snapMat = new THREE.MeshBasicMaterial({ color: 0x66e0ff, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    this.snap = new THREE.Mesh(snapGeo, this.snapMat);
    this.snap.name = 'tools-road-snap';
    this.snap.frustumCulled = false;
    this.snap.renderOrder = 52;
    this.snap.visible = false;

    this.group = new THREE.Group();
    this.group.name = 'tools-road-preview';
    this.group.add(this.mesh, this.markers, this.snap);
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3(1, 1, 1);
    // one reusable curve over a fixed Vector3 pool; its arc-length table is rebuilt only when the
    // control points actually change (so an idle cursor costs nothing and allocates nothing)
    this._pool = [];
    for (let i = 0; i < 40; i++) this._pool.push(new THREE.Vector3());
    this._curvePts = [];
    this._curve = new THREE.CatmullRomCurve3(this._curvePts, false, 'catmullrom', 0.5);
    this._key = new Float64Array(40 * 2 + 2);
    this._keyN = -1;
  }

  /** True (and remembers the new set) when points/width differ from the last built preview. */
  _changed(points, width) {
    const n = Math.min(points.length, 40), k = this._key;
    let same = n === this._keyN && k[0] === width;
    for (let i = 0; i < n && same; i++) same = k[1 + i * 2] === points[i].x && k[2 + i * 2] === points[i].z;
    if (same) return false;
    this._keyN = n; k[0] = width;
    for (let i = 0; i < n; i++) { k[1 + i * 2] = points[i].x; k[2 + i * 2] = points[i].z; }
    return true;
  }

  /** points: [{x,z}] committed + live cursor point appended by the caller. width in metres. */
  update(world, points, width, snapPoint) {
    if (!points || points.length < 2) { this.hide(); return; }
    if (!this._changed(points, width)) { this._placeSnap(world, snapPoint); return; }
    const n = Math.min(this.cap, Math.max(2, Math.min(points.length * 8, this.cap)));
    // sample a Catmull-Rom curve through the points at (x, height, z)
    const m = Math.min(points.length, this._pool.length);
    this._curvePts.length = 0;
    for (let i = 0; i < m; i++) this._curvePts.push(this._pool[i].set(points[i].x, world.getHeight(points[i].x, points[i].z) + 0.12, points[i].z));
    const curve = this._curve;
    curve.needsUpdate = true;
    const pos = this.geo.attributes.position.array;
    const col = this.geo.attributes.color.array;
    const half = width * 0.5;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      curve.getPointAt(t, _v0);
      curve.getTangentAt(t, _v1).normalize();
      // perpendicular in the XZ plane
      const px = -_v1.z, pz = _v1.x;
      const y = world.getHeight(_v0.x, _v0.z) + 0.12;
      const li = i * 2 * 3;
      // each edge follows the terrain under it (a flat cross-section let slopes cut through the ribbon)
      const lx = _v0.x + px * half, lz = _v0.z + pz * half, rx = _v0.x - px * half, rz = _v0.z - pz * half;
      pos[li] = lx; pos[li + 1] = Math.max(y, world.getHeight(lx, lz) + 0.12); pos[li + 2] = lz;
      pos[li + 3] = rx; pos[li + 4] = Math.max(y, world.getHeight(rx, rz) + 0.12); pos[li + 5] = rz;
      // grade at this sample: compare to the previous sample
      let grade = 0;
      if (i > 0) {
        const t0 = (i - 1) / (n - 1);
        curve.getPointAt(t0, _n);
        const dxz = Math.hypot(_v0.x - _n.x, _v0.z - _n.z) || 1e-3;
        grade = Math.abs(y - (world.getHeight(_n.x, _n.z) + 0.12)) / dxz;
      }
      const bad = grade > GRADE_WARN;
      const r = bad ? 1.0 : 0.35, g = bad ? 0.18 : 0.95, b = bad ? 0.12 : 0.55;
      col[li] = r; col[li + 1] = g; col[li + 2] = b;
      col[li + 3] = r; col[li + 4] = g; col[li + 5] = b;
    }
    const idxArr = this.geo.index.array;
    for (let i = 0; i < n - 1; i++) {
      const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1;
      const bi = i * 6;
      idxArr[bi] = a; idxArr[bi + 1] = b; idxArr[bi + 2] = c;
      idxArr[bi + 3] = b; idxArr[bi + 4] = d; idxArr[bi + 5] = c;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.index.needsUpdate = true;
    this.geo.setDrawRange(0, (n - 1) * 6);
    this.geo.computeBoundingSphere();
    this.mesh.visible = true;

    // node markers at every committed control point
    const count = Math.min(this.markers.instanceMatrix.count, points.length);
    for (let i = 0; i < count; i++) {
      const p = points[i];
      const y = world.getHeight(p.x, p.z) + 0.1;
      this._m.compose(_v0.set(p.x, y, p.z), this._q, this._s.setScalar(0.55));
      this.markers.setMatrixAt(i, this._m);
    }
    this.markers.count = count;
    this.markers.instanceMatrix.needsUpdate = true;

    this._placeSnap(world, snapPoint);
  }

  _placeSnap(world, snapPoint) {
    if (snapPoint) {
      const y = world.getHeight(snapPoint.x, snapPoint.z) + 0.1;
      this.snap.position.set(snapPoint.x, y, snapPoint.z);
      this.snap.visible = true;
    } else this.snap.visible = false;
  }

  hide() { this.mesh.visible = false; this.markers.count = 0; this.snap.visible = false; this._keyN = -1; }

  dispose() {
    this.geo.dispose(); this.mat.dispose();
    this.markers.geometry.dispose(); this.markMat.dispose();
    this.snap.geometry.dispose(); this.snapMat.dispose();
  }
}

// ---------------------------------------------------------------------------------------------
// Selection marker: a pulsing bracket ring at the selected entity's position.
// ---------------------------------------------------------------------------------------------
export class SelectionMarker {
  constructor() {
    const geo = new THREE.RingGeometry(1, 1.25, 32);
    geo.rotateX(-Math.PI / 2);
    // large selections (buildings, radius > 6 m) use a thin band: 25 % of a 25 m radius is a 6 m stripe
    this.thinGeo = new THREE.RingGeometry(1, 1.035, 96);
    this.thinGeo.rotateX(-Math.PI / 2);
    this._thinBase = Float32Array.from(this.thinGeo.attributes.position.array);   // flat unit ring
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.name = 'tools-selection-marker';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 53;
    this.mesh.visible = false;
    this.mat = mat; this.geo = geo;
    this._t = 0;
  }

  update(dt, pos, radius = 1.6) {
    if (!pos) { this.mesh.visible = false; return; }
    this._t += dt;
    const pulse = 1 + Math.sin(this._t * 4) * 0.08;
    this.mesh.position.set(pos.x, pos.y + 0.15, pos.z);
    const thin = radius > 6;
    // thin rings are draped over the terrain (see drape()), so their local y is metres: don't scale y
    this.mesh.scale.set(radius * pulse, thin ? 1 : radius * pulse, radius * pulse);
    this.mesh.geometry = thin ? this.thinGeo : this.geo;
    this.mesh.visible = true;
  }

  /** Drape the thin ring over the terrain around (pos, radius). Call when the selection changes; a flat
   *  ring at the building's centre height was buried wherever the ground rose (critic r4 follow-up). */
  drape(world, pos, radius) {
    if (!pos || radius <= 6) return;
    const a = this.thinGeo.attributes.position, b = this._thinBase;
    for (let i = 0; i < a.count; i++) {
      const ux = b[i * 3], uz = b[i * 3 + 2];
      a.array[i * 3 + 1] = world.getHeight(pos.x + ux * radius, pos.z + uz * radius) - pos.y + 0.25;
    }
    a.needsUpdate = true;
    this.thinGeo.computeBoundingSphere();
  }

  dispose() { this.geo.dispose(); this.thinGeo.dispose(); this.mat.dispose(); }
}
