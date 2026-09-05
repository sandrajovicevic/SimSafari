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

  dispose() { this.geo.dispose(); this.mat.dispose(); }
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

    // snap indicator: a bright ring shown at the point the live cursor snapped to
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
  }

  /** points: [{x,z}] committed + live cursor point appended by the caller. width in metres. */
  update(world, points, width, snapPoint) {
    if (!points || points.length < 2) { this.mesh.visible = false; this.markers.count = 0; this.snap.visible = false; return; }
    const n = Math.min(this.cap, Math.max(2, Math.min(points.length * 8, this.cap)));
    // sample a Catmull-Rom curve through the points at (x, height, z)
    const curvePts = points.map((p) => new THREE.Vector3(p.x, world.getHeight(p.x, p.z) + 0.12, p.z));
    const curve = new THREE.CatmullRomCurve3(curvePts, false, 'catmullrom', 0.5);
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
      pos[li] = _v0.x + px * half; pos[li + 1] = y; pos[li + 2] = _v0.z + pz * half;
      pos[li + 3] = _v0.x - px * half; pos[li + 4] = y; pos[li + 5] = _v0.z - pz * half;
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

    if (snapPoint) {
      const y = world.getHeight(snapPoint.x, snapPoint.z) + 0.1;
      this.snap.position.set(snapPoint.x, y, snapPoint.z);
      this.snap.visible = true;
    } else this.snap.visible = false;
  }

  hide() { this.mesh.visible = false; this.markers.count = 0; this.snap.visible = false; }

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
    this.mesh.scale.setScalar(radius * pulse);
    this.mesh.visible = true;
  }

  dispose() { this.geo.dispose(); this.mat.dispose(); }
}
