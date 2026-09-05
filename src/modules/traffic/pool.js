// Generic swap-remove InstancedMesh pool. One pool = one draw call per material group, shared by
// every vehicle that uses it (bodies are pooled per kind+paint colour, wheels/lights/passengers are
// pooled once for the whole module). alloc()/free() are O(1) amortised; free() moves the last active
// instance into the freed slot and calls the moved owner's onMove(newSlot) so its stored slot index
// stays correct — the only per-frame cost is setMatrixAt/setColorAt on active slots.
import * as THREE from 'three';

const _m = new THREE.Matrix4();
const _c = new THREE.Color();

export class InstancedPool {
  constructor(geometry, material, capacity, { castShadow = true, receiveShadow = true, color = false, name = '' } = {}) {
    this.capacity = capacity;
    this.count = 0;
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.count = 0;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    mesh.frustumCulled = false; // small, scattered instances; per-instance culling isn't worth the CPU here
    mesh.name = name;
    if (color) mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3).fill(1), 3);
    this.mesh = mesh;
    this.owners = new Array(capacity).fill(null); // owners[slot] = { onMove(newSlot) } or null
  }

  /** Reserve a slot. owner: { onMove(newSlot) }. Returns slot index, or -1 if the pool is full. */
  alloc(owner) {
    if (this.count >= this.capacity) return -1;
    const slot = this.count++;
    this.mesh.count = this.count;
    this.owners[slot] = owner;
    return slot;
  }

  /** Release a slot, swap-moving the last active instance into it. */
  free(slot) {
    if (slot < 0 || slot >= this.count) return;
    const last = --this.count;
    this.mesh.count = this.count;
    if (slot !== last) {
      this.mesh.getMatrixAt(last, _m);
      this.mesh.setMatrixAt(slot, _m);
      if (this.mesh.instanceColor) {
        const a = this.mesh.instanceColor.array, s = slot * 3, l = last * 3;
        a[s] = a[l]; a[s + 1] = a[l + 1]; a[s + 2] = a[l + 2];
      }
      const moved = this.owners[last];
      this.owners[slot] = moved;
      if (moved) moved.onMove(slot);
    }
    this.owners[last] = null;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  setMatrix(slot, m) { this.mesh.setMatrixAt(slot, m); this.mesh.instanceMatrix.needsUpdate = true; }
  setColor(slot, hex) { this.mesh.setColorAt(slot, _c.set(hex)); if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true; }

  clear() {
    this.count = 0;
    this.mesh.count = 0;
    this.owners.fill(null);
  }

  dispose() {
    this.mesh.geometry?.dispose?.();
    const mats = Array.isArray(this.mesh.material) ? this.mesh.material : [this.mesh.material];
    for (const m of mats) m?.dispose?.();
    this.mesh.removeFromParent();
  }
}
