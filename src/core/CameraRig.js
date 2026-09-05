// Map-style camera rig: orbit around a ground target. Right-drag rotate, middle-drag pan,
// left-drag pan when no tool is active, wheel zoom, WASD/arrows pan, Q/E rotate, R/F pitch.
import * as THREE from 'three';
import { DEG, clamp } from './Units.js';

const _v = new THREE.Vector3();
const _ray = new THREE.Ray();
const _hit = new THREE.Vector3();

export class CameraRig {
  constructor(camera, dom, world, input) {
    this.camera = camera;
    this.dom = dom;
    this.world = world;
    this.input = input;
    this.target = new THREE.Vector3(0, 0, 0);
    this.distance = 700;
    this.pitch = 48 * DEG;   // above horizon
    this.yaw = 35 * DEG;     // around +Y
    this.minDistance = 4;
    this.maxDistance = 3200;
    this.minPitch = 6 * DEG;
    this.maxPitch = 89 * DEG;
    this.panSpeed = 1;
    this.enabled = true;
    this.presets = new Map();
    this._drag = null;
    this._keys = new Set();
    this._bind();

    const H = world.half;
    this.registerPreset('overview', { target: [0, 0], distance: 900, pitch: 50, yaw: 35, description: 'whole park from the south-east' });
    this.registerPreset('close', { target: [0, 0], distance: 140, pitch: 28, yaw: 55, description: 'ground detail' });
    this.registerPreset('low', { target: [0, 0], distance: 45, pitch: 12, yaw: 80, description: 'eye level' });
    this.registerPreset('top', { target: [0, 0], distance: 700, pitch: 85, yaw: 0, description: 'top-down' });
    this.registerPreset('night', { target: [0, 0], distance: 220, pitch: 22, yaw: 120, tod: 21.5, description: 'night' });
    this.registerPreset('corner', { target: [-H * 0.55, H * 0.55], distance: 600, pitch: 40, yaw: 225, description: 'from the north-west corner' });
  }

  registerPreset(name, def) { this.presets.set(name, def); }
  hasPreset(name) { return this.presets.has(name); }
  getPreset(name) { return this.presets.get(name); }

  setPreset(name) {
    const p = this.presets.get(name);
    if (!p) return false;
    this.apply(p);
    return true;
  }

  /** Accepts {target:[x,z], distance, pitch(deg), yaw(deg)} or {x,y,z,tx,ty,tz}. */
  apply(p) {
    if (p.target) {
      this.target.set(p.target[0], 0, p.target[1]);
      if (p.distance !== undefined) this.distance = p.distance;
      if (p.pitch !== undefined) this.pitch = p.pitch * DEG;
      if (p.yaw !== undefined) this.yaw = p.yaw * DEG;
    } else if (p.x !== undefined) {
      this.setCamera(p);
    }
    this.update(0);
  }

  setCamera({ x, y, z, tx = 0, ty = 0, tz = 0 }) {
    this.target.set(tx, ty, tz);
    const dx = x - tx, dy = y - ty, dz = z - tz;
    const horiz = Math.hypot(dx, dz);
    this.distance = Math.hypot(dx, dy, dz);
    this.pitch = clamp(Math.atan2(dy, horiz), this.minPitch, this.maxPitch);
    this.yaw = Math.atan2(dx, dz);
    this._lockY = ty; // keep explicit target height for one update
    this.update(0);
    this._lockY = undefined;
  }

  lookAt(x, z, distance, pitchDeg, yawDeg) {
    this.target.set(x, 0, z);
    if (distance !== undefined) this.distance = distance;
    if (pitchDeg !== undefined) this.pitch = pitchDeg * DEG;
    if (yawDeg !== undefined) this.yaw = yawDeg * DEG;
    this.update(0);
  }

  getState() {
    return { target: [this.target.x, this.target.z], distance: this.distance, pitch: this.pitch / DEG, yaw: this.yaw / DEG };
  }

  /** Ground point under a normalised device coordinate (-1..1). */
  groundAt(ndcX, ndcY, out = new THREE.Vector3()) {
    _v.set(ndcX, ndcY, 0.5).unproject(this.camera);
    _ray.origin.copy(this.camera.position);
    _ray.direction.copy(_v).sub(this.camera.position).normalize();
    return this.world.raycastGround(_ray, out) ? out : null;
  }

  _bind() {
    const dom = this.dom;
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    dom.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      const toolActive = !!this.input?.toolActive;
      let mode = null;
      if (e.button === 2) mode = 'rotate';
      else if (e.button === 1) mode = 'pan';
      else if (e.button === 0 && !toolActive) mode = 'pan';
      if (!mode) return;
      dom.setPointerCapture(e.pointerId);
      this._drag = { mode, x: e.clientX, y: e.clientY, ground: null };
      if (mode === 'pan') {
        const r = dom.getBoundingClientRect();
        const nx = ((e.clientX - r.left) / r.width) * 2 - 1, ny = -((e.clientY - r.top) / r.height) * 2 + 1;
        const g = this.groundAt(nx, ny, _hit);
        this._drag.ground = g ? g.clone() : null;
      }
      e.preventDefault();
    });
    dom.addEventListener('pointermove', (e) => {
      const d = this._drag; if (!d || !this.enabled) return;
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      d.x = e.clientX; d.y = e.clientY;
      if (d.mode === 'rotate') {
        this.yaw -= dx * 0.005;
        this.pitch = clamp(this.pitch + dy * 0.005, this.minPitch, this.maxPitch);
      } else if (d.mode === 'pan') {
        if (d.ground) {
          // keep the grabbed ground point under the cursor
          const r = dom.getBoundingClientRect();
          const nx = ((e.clientX - r.left) / r.width) * 2 - 1, ny = -((e.clientY - r.top) / r.height) * 2 + 1;
          const g = this.groundAt(nx, ny, _hit);
          if (g) { this.target.x += d.ground.x - g.x; this.target.z += d.ground.z - g.z; }
        } else {
          const s = this.distance * 0.0015;
          const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
          this.target.x -= (dx * cy - dy * sy) * s;
          this.target.z -= (-dx * sy - dy * cy) * s;
        }
        this._clampTarget();
      }
    });
    const end = (e) => { if (this._drag) { try { dom.releasePointerCapture(e.pointerId); } catch {} } this._drag = null; };
    dom.addEventListener('pointerup', end);
    dom.addEventListener('pointercancel', end);
    dom.addEventListener('wheel', (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      this.distance = clamp(this.distance * Math.exp(e.deltaY * 0.0012), this.minDistance, this.maxDistance);
    }, { passive: false });
    window.addEventListener('keydown', (e) => { if (!e.target.closest?.('input,textarea')) this._keys.add(e.code); });
    window.addEventListener('keyup', (e) => this._keys.delete(e.code));
    window.addEventListener('blur', () => this._keys.clear());
  }

  _clampTarget() {
    const H = this.world.half * 1.1;
    this.target.x = clamp(this.target.x, -H, H);
    this.target.z = clamp(this.target.z, -H, H);
  }

  update(dt) {
    if (this.enabled && dt > 0 && this._keys.size) {
      const k = this._keys;
      const s = this.distance * 0.8 * dt * this.panSpeed;
      const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
      let fx = 0, fz = 0;
      if (k.has('KeyW') || k.has('ArrowUp')) { fx -= sy; fz -= cy; }
      if (k.has('KeyS') || k.has('ArrowDown')) { fx += sy; fz += cy; }
      if (k.has('KeyA') || k.has('ArrowLeft')) { fx -= cy; fz += sy; }
      if (k.has('KeyD') || k.has('ArrowRight')) { fx += cy; fz -= sy; }
      this.target.x += fx * s; this.target.z += fz * s;
      if (k.has('KeyQ')) this.yaw += 1.2 * dt;
      if (k.has('KeyE')) this.yaw -= 1.2 * dt;
      if (k.has('KeyR')) this.pitch = clamp(this.pitch + 0.8 * dt, this.minPitch, this.maxPitch);
      if (k.has('KeyF')) this.pitch = clamp(this.pitch - 0.8 * dt, this.minPitch, this.maxPitch);
      if (k.has('Equal') || k.has('NumpadAdd')) this.distance = clamp(this.distance * (1 - dt), this.minDistance, this.maxDistance);
      if (k.has('Minus') || k.has('NumpadSubtract')) this.distance = clamp(this.distance * (1 + dt), this.minDistance, this.maxDistance);
      this._clampTarget();
    }
    // target rides the ground
    this.target.y = this._lockY !== undefined ? this._lockY : this.world.getHeight(this.target.x, this.target.z);
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const px = this.target.x + Math.sin(this.yaw) * cp * this.distance;
    const pz = this.target.z + Math.cos(this.yaw) * cp * this.distance;
    let py = this.target.y + sp * this.distance;
    // never go under the terrain
    const ground = this.world.getHeight(px, pz);
    if (py < ground + 1.7) py = ground + 1.7;
    this.camera.position.set(px, py, pz);
    this.camera.lookAt(this.target);
  }
}
