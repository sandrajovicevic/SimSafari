// Cascaded shadow maps: N DirectionalLights (near → far) fitted to slices of the camera frustum with
// bounding-sphere + texel snapping for stability. Cascade selection happens in the patched ShaderChunk
// (chunks.js): light 0 carries colour/intensity, the others only contribute their shadow maps.
import * as THREE from 'three';
import { clamp } from '../../core/Units.js';

const _corner = new THREE.Vector3();
const _center = new THREE.Vector3();
const _lightView = new THREE.Matrix4();
const _lightViewInv = new THREE.Matrix4();
const _eye = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _tmp = new THREE.Vector3();
const _corners = Array.from({ length: 8 }, () => new THREE.Vector3());

export class Cascades {
  constructor(camera, parent, { cascades = 3, mapSize = 2048, maxFar = 1500, margin = 600 } = {}) {
    this.camera = camera;
    this.parent = parent;
    this.count = cascades;
    this.mapSize = mapSize;
    this.maxFar = maxFar;
    this.margin = margin;
    this.direction = new THREE.Vector3(0.3, -1, 0.2).normalize(); // toward the ground (light travel direction)
    this.splits = [40, 200, maxFar];
    this.lights = [];
    this.radii = [];
    for (let i = 0; i < cascades; i++) {
      const l = new THREE.DirectionalLight(0xffffff, i === 0 ? 3 : 0);
      l.name = `sun-cascade-${i}`;
      l.castShadow = true;
      l.shadow.mapSize.set(mapSize, mapSize);
      l.shadow.camera.near = 0;
      l.shadow.camera.far = 1000;
      l.shadow.bias = -0.00012;
      l.shadow.normalBias = 0.05;
      l.shadow.radius = 1.5;
      l.target.name = `sun-cascade-target-${i}`;
      parent.add(l, l.target);
      this.lights.push(l);
      this.radii.push(0);
    }
    this.enabled = true;
  }

  get key() { return this.lights[0]; }

  setColor(color, intensity) {
    const k = this.lights[0];
    k.color.copy(color);
    k.intensity = intensity;
  }

  /** Recompute split distances from the rig's zoom so the near cascade stays sharp when zoomed in. */
  setViewDistance(d) {
    const s = this.splits;
    s[0] = clamp(d * 0.85, 30, 110);
    s[1] = clamp(d * 3.2, 140, 520);
    s[2] = this.maxFar;
    if (this.count === 2) { s[1] = this.maxFar; }
  }

  /** Fit each cascade to its frustum slice. Call every frame before rendering. */
  update() {
    const cam = this.camera;
    const dir = this.direction;
    const upAbs = Math.abs(dir.y) > 0.98 ? _up.set(0, 0, 1) : _up.set(0, 1, 0);
    _eye.set(0, 0, 0);
    _lightView.lookAt(_eye, dir, upAbs); // rotation only: light-space basis
    _lightViewInv.copy(_lightView).invert();
    const tanV = Math.tan((cam.fov * Math.PI / 180) * 0.5);
    const tanH = tanV * cam.aspect;
    let near = cam.near;
    for (let i = 0; i < this.count; i++) {
      const far = Math.min(this.splits[i], cam.far);
      const light = this.lights[i];
      // 8 frustum corners of the slice in world space
      let k = 0;
      for (const d of [near, far]) {
        const hh = d * tanV, hw = d * tanH;
        for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
          _corners[k++].set(sx * hw, sy * hh, -d).applyMatrix4(cam.matrixWorld);
        }
      }
      // bounding sphere: centre on the view axis between near and far slice
      _center.set(0, 0, 0);
      for (let j = 0; j < 8; j++) _center.add(_corners[j]);
      _center.multiplyScalar(1 / 8);
      let r = 0;
      for (let j = 0; j < 8; j++) r = Math.max(r, _center.distanceTo(_corners[j]));
      r = Math.ceil(r * 1.02);
      this.radii[i] = r;
      // snap centre to shadow texels in light space
      const texel = (2 * r) / this.mapSize;
      _tmp.copy(_center).applyMatrix4(_lightViewInv);
      _tmp.x = Math.floor(_tmp.x / texel) * texel;
      _tmp.y = Math.floor(_tmp.y / texel) * texel;
      _center.copy(_tmp).applyMatrix4(_lightView);
      const back = r + this.margin;
      light.position.copy(_center).addScaledVector(dir, -back);
      light.target.position.copy(_center);
      const sc = light.shadow.camera;
      sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r;
      sc.near = 0; sc.far = back + r + 50;
      sc.updateProjectionMatrix();
      // bias scales with texel size (world metres): no acne on the far cascade, no peter-panning near
      light.shadow.normalBias = clamp(texel * 1.6, 0.03, 1.2);
      light.shadow.bias = -0.00008;
      light.shadow.radius = i === 0 ? 1.6 : 1.2;
      near = far;
    }
  }

  setVisible(v) { for (const l of this.lights) l.visible = v; }

  dispose() {
    for (const l of this.lights) {
      l.shadow.dispose();
      l.target.removeFromParent();
      l.removeFromParent();
    }
    this.lights.length = 0;
  }
}
