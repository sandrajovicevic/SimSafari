// Salt-lick rendering (Wave P5, docs/specs/p5-rainfall-locusts-licks.md). Reads world.saltLicks
// (simulation owns the writes) and rebuilds two InstancedMeshes — a trampled bare-earth disc and a
// mineral block on a stake — on every 'saltlick:changed'. ≤ 2 draw calls for the whole feature
// however many licks exist. Procedural; no assets.
import * as THREE from 'three';

/** The trampled patch: a shallow displaced disc of bare, mineral-pale earth. */
function discGeometry() {
  const g = new THREE.CircleGeometry(1, 24);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const d = Math.hypot(x, z);
    pos.setY(i, 0.03 + Math.sin(d * 9.0) * 0.02 * (1 - d)); // gentle hummocks, flat at the rim
  }
  g.computeVertexNormals();
  return g;
}

/** The lick itself: a rough rectangular mineral block tilted on a short timber stake. Sized to
 * read at the spec's 30–80 m viewing band (the first pass was 0.6 m tall — ~3 px at 55 m, the
 * verifier read the whole lick as "a small grey blob"; park mineral stations are man-sized). */
function blockGeometry() {
  const block = new THREE.BoxGeometry(1.15, 1.35, 0.52);
  block.translate(0, 0.67, 0);
  // weather the block: jitter every vertex a touch so it reads hewn, not extruded
  const pos = block.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const s = Math.sin(pos.getX(i) * 37.1 + pos.getY(i) * 17.3 + pos.getZ(i) * 11.7);
    pos.setXYZ(i, pos.getX(i) + (s - 0.5) * 0.05, pos.getY(i) + Math.cos(s * 9.0) * 0.02, pos.getZ(i) + (s - 0.5) * 0.04);
  }
  block.computeVertexNormals();
  const stake = new THREE.CylinderGeometry(0.09, 0.11, 0.95, 6);
  stake.translate(0, 0.47, 0);
  // merge without a util dependency: stake as a second draw would break the ≤2 budget, so bake it
  // into the block geometry manually (both non-indexed, position+normal only)
  const a = block.toNonIndexed(), b = stake.toNonIndexed();
  const merged = new THREE.BufferGeometry();
  const count = a.attributes.position.count + b.attributes.position.count;
  const p = new Float32Array(count * 3), n = new Float32Array(count * 3);
  p.set(a.attributes.position.array, 0); p.set(b.attributes.position.array, a.attributes.position.array.length);
  n.set(a.attributes.normal.array, 0); n.set(b.attributes.normal.array, a.attributes.normal.array.length);
  merged.setAttribute('position', new THREE.BufferAttribute(p, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(n, 3));
  return merged;
}

export class SaltLickRenderer {
  constructor(world, parent) {
    this.world = world;
    this.group = new THREE.Group();
    this.group.name = 'props-saltlicks';
    parent.add(this.group);
    // true colours (the sRGB pipeline is fixed — no compensation): sun-bleached trampled earth
    // against a dark rust-ochre block — the pairing is the contrast that makes a lick readable
    // at distance (first pass: 0x9d8f78/0xb08954, too close in tone at 55 m per the verifier)
    this.discMat = new THREE.MeshStandardMaterial({ color: 0xc7b79e, roughness: 1.0, metalness: 0.0 });
    this.blockMat = new THREE.MeshStandardMaterial({ color: 0x96662f, roughness: 0.8, metalness: 0.0 });
    this.discGeo = discGeometry();
    this.blockGeo = blockGeometry();
    this.discs = new THREE.InstancedMesh(this.discGeo, this.discMat, 16);
    this.blocks = new THREE.InstancedMesh(this.blockGeo, this.blockMat, 16);
    this.discs.name = 'saltlick-discs';
    this.blocks.name = 'saltlick-blocks';
    this.discs.count = 0;
    this.blocks.count = 0;
    this.discs.castShadow = false; this.discs.receiveShadow = true;
    this.blocks.castShadow = true; this.blocks.receiveShadow = true;
    this.group.add(this.discs, this.blocks);
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._v = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this.rebuild();
  }

  /** Re-read world.saltLicks into the instance matrices. */
  rebuild() {
    const licks = [...(this.world.saltLicks?.values() || [])];
    const n = Math.min(licks.length, this.discs.instanceMatrix.count);
    for (let i = 0; i < n; i++) {
      const l = licks[i];
      const y = this.world.getHeight ? this.world.getHeight(l.x, l.z) : 0;
      this._v.set(l.x, y - 0.02, l.z);
      this._q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (l.x * 12.9898 + l.z * 78.233) % (Math.PI * 2));
      this._s.set(l.radius ?? 10, 1, l.radius ?? 10);
      this._m.compose(this._v, this._q, this._s);
      this.discs.setMatrixAt(i, this._m);
      // block sits off-centre inside the patch, tilted like it was dropped
      const rot = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.12, (l.x + l.z) % 1.2, 0.18));
      this._v.set(l.x + (l.radius ?? 10) * 0.32, y, l.z - (l.radius ?? 10) * 0.18);
      this._s.set(1, 1, 1);
      this._m.compose(this._v, rot, this._s);
      this.blocks.setMatrixAt(i, this._m);
    }
    this.discs.count = n;
    this.blocks.count = n;
    this.discs.instanceMatrix.needsUpdate = true;
    this.blocks.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.group.removeFromParent();
    this.discGeo.dispose(); this.blockGeo.dispose();
    this.discMat.dispose(); this.blockMat.dispose();
    this.discs.dispose(); this.blocks.dispose();
  }
}
