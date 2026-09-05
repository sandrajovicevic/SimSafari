// Skeleton template and allocation-free pose → bone-matrix evaluation.
// Bind pose has identity rotations, so a bone's inverse bind matrix is a pure translation.
import * as THREE from 'three';

export const BONE_NAMES = [
  'root', 'spine1', 'chest', 'neck1', 'neck2', 'neck3', 'head', 'jaw', 'earL', 'earR',
  'tail1', 'tail2', 'tail3',
  'hindUpL', 'hindLoL', 'hindFtL', 'hindUpR', 'hindLoR', 'hindFtR',
  'foreUpL', 'foreLoL', 'foreFtL', 'foreUpR', 'foreLoR', 'foreFtR',
];
const PARENT_NAMES = [
  null, 'root', 'spine1', 'chest', 'neck1', 'neck2', 'neck3', 'head', 'head', 'head',
  'root', 'tail1', 'tail2',
  'root', 'hindUpL', 'hindLoL', 'root', 'hindUpR', 'hindLoR',
  'chest', 'foreUpL', 'foreLoL', 'chest', 'foreUpR', 'foreLoR',
];
export const TRUNK_NAMES = ['trunk1', 'trunk2', 'trunk3', 'trunk4'];

/** Bone index constants for the base skeleton. */
export const B = Object.fromEntries(BONE_NAMES.map((n, i) => [n, i]));
export const BASE_BONES = BONE_NAMES.length;

const _euler = new THREE.Euler();
const _m = new THREE.Matrix4();

export class Rig {
  constructor(extra = []) {
    this.names = [...BONE_NAMES, ...extra];
    this.count = this.names.length;
    this.parents = new Int16Array(this.count);
    for (let i = 0; i < BASE_BONES; i++) this.parents[i] = PARENT_NAMES[i] ? BONE_NAMES.indexOf(PARENT_NAMES[i]) : -1;
    for (let i = 0; i < extra.length; i++) this.parents[BASE_BONES + i] = i === 0 ? B.head : BASE_BONES + i - 1;
    this.bind = new Float32Array(this.count * 3);   // world bind position
    this.local = new Float32Array(this.count * 3);  // relative to parent
    this.index = Object.fromEntries(this.names.map((n, i) => [n, i]));
    this._world = [];
    for (let i = 0; i < this.count; i++) this._world.push(new THREE.Matrix4());
  }

  setBind(name, x, y, z) {
    const i = this.index[name];
    this.bind[i * 3] = x; this.bind[i * 3 + 1] = y; this.bind[i * 3 + 2] = z;
  }
  getBind(name, out) {
    const i = this.index[name];
    return out.set(this.bind[i * 3], this.bind[i * 3 + 1], this.bind[i * 3 + 2]);
  }

  /** Call after all setBind(): computes local offsets. */
  finalize() {
    for (let i = 0; i < this.count; i++) {
      const p = this.parents[i];
      for (let k = 0; k < 3; k++) this.local[i * 3 + k] = this.bind[i * 3 + k] - (p >= 0 ? this.bind[p * 3 + k] : 0);
    }
  }

  /**
   * rot: Float32Array(count*3) XYZ euler radians per bone; off: Float32Array(count*3) extra local translation.
   * Writes count*16 floats (column-major skin matrices = world * inverseBind) into out at offset o.
   */
  evaluate(rot, off, out, o) {
    const W = this._world, local = this.local, bind = this.bind, parents = this.parents;
    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3;
      const m = W[i];
      _euler.set(rot[i3], rot[i3 + 1], rot[i3 + 2], 'XYZ');
      m.makeRotationFromEuler(_euler);
      const e = m.elements;
      e[12] = local[i3] + off[i3]; e[13] = local[i3 + 1] + off[i3 + 1]; e[14] = local[i3 + 2] + off[i3 + 2];
      const p = parents[i];
      if (p >= 0) m.premultiply(W[p]);
      // skin = world * T(-bind)
      const bx = bind[i3], by = bind[i3 + 1], bz = bind[i3 + 2];
      const k = o + i * 16;
      out[k] = e[0]; out[k + 1] = e[1]; out[k + 2] = e[2]; out[k + 3] = 0;
      out[k + 4] = e[4]; out[k + 5] = e[5]; out[k + 6] = e[6]; out[k + 7] = 0;
      out[k + 8] = e[8]; out[k + 9] = e[9]; out[k + 10] = e[10]; out[k + 11] = 0;
      out[k + 12] = e[12] - (e[0] * bx + e[4] * by + e[8] * bz);
      out[k + 13] = e[13] - (e[1] * bx + e[5] * by + e[9] * bz);
      out[k + 14] = e[14] - (e[2] * bx + e[6] * by + e[10] * bz);
      out[k + 15] = 1;
    }
  }

  /** Identity skin matrices (bind pose). */
  writeIdentity(out, o) {
    for (let i = 0; i < this.count; i++) {
      const k = o + i * 16;
      for (let j = 0; j < 16; j++) out[k + j] = (j % 5 === 0) ? 1 : 0;
    }
  }
}

export { _m as _scratchMatrix };
