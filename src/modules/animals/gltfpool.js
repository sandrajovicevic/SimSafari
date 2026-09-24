// Authored-model species (ARCHITECTURE §8, 2026-09-24). A GltfPool is a drop-in for the procedural
// Pool in index.js: same fields (nb, boneArr, uBones, meshHi/meshLo, dims, shW/shL, alloc/release,
// rig.writeIdentity, dispose) and the same one-draw-per-species instanced skinning (skin.js), but the
// geometry, texture and motion come from a rigged glTF instead of tubes + evalPose().
//
// Motion: every clip is BAKED once at load — sampled at BAKE_FPS into skinning matrices
//   M_i = N · meshWorld · bindMatrixInverse · bone_i.matrixWorld · boneInverse_i · bindMatrix
// (N = normalisation: model scaled to the species' size, turned to face +Z, feet on y = 0), so the
// per-frame cost is one Float32Array copy (or a two-clip lerp) per visible animal, no AnimationMixer.
// Clip choice follows the same blend weights evalPose() reads (_moveW, _runW, _lieW, _headDown,
// _drinkW); gait clips are driven by the behaviour's own stride phase so feet do not slide.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { injectSkinning } from './skin.js';

const BAKE_FPS = 30;

/**
 * species id → authored model. `height`: target height (m) of the posed model's bounding box top
 * (overall, ears/horns included); `yaw`: extra rotation (rad) so the model faces +Z; `clips`: behaviour
 * slot → clip name in the file (missing slots fall back to idle). Only files that are present AND
 * registered in docs/ASSETS.md belong here; anything that fails to load falls back to procedural.
 */
export const ASSET_SPECIES = {
  // e.g. hippo: { path: 'models/gobkit/Hippo.glb', height: 1.5, yaw: 0, clips: { idle: 'Idle', walk: 'Walk', run: 'Walk' } },
};

/** Test-only fixture used by the pipeline preset; never mapped to a real species. */
export const FIXTURES = {
  fox: { path: 'models/khronos/Fox.glb', height: 0.75, yaw: 0, clips: { idle: 'Survey', walk: 'Walk', run: 'Run', graze: 'Survey', rest: 'Survey' } },
};

const _m = new THREE.Matrix4(), _n = new THREE.Matrix4(), _bindInv = new THREE.Matrix4();

function firstSkinned(root) {
  const list = [];
  root.traverse((o) => { if (o.isSkinnedMesh) list.push(o); });
  return list;
}

/** Load + bake one model. Resolves a "model" record or null (never throws). */
export async function loadModel(ctx, def) {
  try {
    const gltf = await ctx.assets.gltf(def.path);
    if (!gltf) return null;
    const scene = gltf.scene;
    scene.updateMatrixWorld(true);
    const meshes = firstSkinned(scene);
    if (!meshes.length) { ctx.log.warn(`[animals] ${def.path}: no skinned mesh`); return null; }
    const skeleton = meshes[0].skeleton;
    const skinMeshes = meshes.filter((m) => m.skeleton === skeleton);
    const bones = skeleton.bones, nb = bones.length;

    // geometry: one merged, bind-space geometry per material, skin attributes renamed for skin.js
    const geos = [], mats = [];
    for (const mesh of skinMeshes) {
      const g = mesh.geometry.clone();
      const si = g.getAttribute('skinIndex'), sw = g.getAttribute('skinWeight');
      if (!si || !sw) continue;
      g.setAttribute('aBoneIndex', new THREE.Float32BufferAttribute(Float32Array.from(si.array), 4));
      g.setAttribute('aBoneWeight', new THREE.Float32BufferAttribute(Float32Array.from(sw.array), 4));
      g.deleteAttribute('skinIndex'); g.deleteAttribute('skinWeight');
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'aBoneIndex', 'aBoneWeight'].includes(k)) g.deleteAttribute(k);
      if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      if (!g.getAttribute('normal')) g.computeVertexNormals();
      // merged meshes share mesh0's bind frame below — true for single-armature exports
      geos.push(g);
      mats.push(Array.isArray(mesh.material) ? mesh.material[0] : mesh.material);
    }
    if (!geos.length) return null;
    const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, true);
    if (!merged) { ctx.log.warn(`[animals] ${def.path}: geometries could not be merged`); return null; }
    const mesh0 = skinMeshes[0];
    _bindInv.copy(mesh0.bindMatrix).invert();

    // bake every clip
    const mixer = new THREE.AnimationMixer(scene);
    const clips = {};
    const bakeClip = (clip) => {
      const frames = Math.max(2, Math.ceil(clip.duration * BAKE_FPS) + 1);
      const data = new Float32Array(frames * nb * 16);
      mixer.stopAllAction();
      const action = mixer.clipAction(clip); action.reset(); action.play();
      for (let f = 0; f < frames; f++) {
        mixer.setTime(Math.min(clip.duration, f / BAKE_FPS));
        scene.updateMatrixWorld(true);
        for (let i = 0; i < nb; i++) {
          _m.multiplyMatrices(bones[i].matrixWorld, skeleton.boneInverses[i]).premultiply(_bindInv).multiply(mesh0.bindMatrix).premultiply(mesh0.matrixWorld);
          _m.toArray(data, (f * nb + i) * 16);
        }
      }
      action.stop();
      return { name: clip.name, duration: Math.max(1e-3, clip.duration), frames, data };
    };
    for (const clip of gltf.animations) clips[clip.name] = bakeClip(clip);
    const idleName = def.clips?.idle && clips[def.clips.idle] ? def.clips.idle : Object.keys(clips)[0];
    if (!idleName) { ctx.log.warn(`[animals] ${def.path}: no animation clips`); return null; }

    // normalisation from the idle pose's skinned bounds
    const box = new THREE.Box3(), v = new THREE.Vector3(), tmp = new THREE.Vector3();
    const P = merged.attributes.position, BI = merged.attributes.aBoneIndex, BW = merged.attributes.aBoneWeight;
    const idle = clips[idleName];
    const skinPoint = (k, data, off, out) => {
      out.set(0, 0, 0);
      for (let j = 0; j < 4; j++) {
        const w = BW.array[k * 4 + j]; if (w <= 0) continue;
        _m.fromArray(data, off + BI.array[k * 4 + j] * 16);
        tmp.fromBufferAttribute(P, k).applyMatrix4(_m).multiplyScalar(w);
        out.add(tmp);
      }
      return out;
    };
    for (let k = 0; k < P.count; k++) box.expandByPoint(skinPoint(k, idle.data, 0, v));
    const size = box.getSize(new THREE.Vector3());
    const s = def.height / Math.max(1e-3, size.y);
    const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
    _n.makeRotationY(def.yaw || 0).multiply(new THREE.Matrix4().makeScale(s, s, s)).multiply(new THREE.Matrix4().makeTranslation(-cx, -box.min.y, -cz));
    for (const c of Object.values(clips)) {
      for (let q = 0; q < c.frames * nb; q++) { _m.fromArray(c.data, q * 16).premultiply(_n); _m.toArray(c.data, q * 16); }
    }
    const len = Math.max(size.x, size.z) * s, wid = Math.min(size.x, size.z) * s;
    const slot = (k) => clips[def.clips?.[k]] || null;
    return {
      path: def.path, nb, geometry: merged, materials: mats, clips,
      slots: { idle: clips[idleName], walk: slot('walk'), run: slot('run') || slot('walk'), graze: slot('graze'), drink: slot('drink') || slot('graze'), rest: slot('rest') },
      len, wid, height: def.height, triangles: (merged.index ? merged.index.count : P.count) / 3,
    };
  } catch (err) {
    ctx.log.warn(`[animals] ${def.path}: load/bake failed, procedural fallback`, err);
    return null;
  }
}

function sampleInto(clip, time, out, off, nb, w, add) {
  const u = ((time % clip.duration) + clip.duration) % clip.duration * BAKE_FPS;
  const f0 = Math.min(clip.frames - 1, Math.floor(u)), f1 = Math.min(clip.frames - 1, f0 + 1), fr = u - f0;
  const a0 = f0 * nb * 16, a1 = f1 * nb * 16, n = nb * 16, d = clip.data;
  if (add) for (let i = 0; i < n; i++) out[off + i] += w * (d[a0 + i] + (d[a1 + i] - d[a0 + i]) * fr);
  else for (let i = 0; i < n; i++) out[off + i] = w * (d[a0 + i] + (d[a1 + i] - d[a0 + i]) * fr);
}

/**
 * Pool for one authored species. `env` = { ctx, group, capacity, dims, spec } from index.js.
 * Matrix lerp between two clips is an approximation (it can shrink limbs mid-blend); weights are
 * eased by behaviour, so blends are brief.
 */
export class GltfPool {
  constructor(env, model, key) {
    const { ctx, group, spec, dims, capacity } = env;
    this.ctx = ctx; this.group = group; this.gltf = true;
    this.key = key; this.spec = spec; this.variant = 'default'; this.model = model;
    this.nb = model.nb; this.dims = dims;
    this.shW = model.wid * 0.5; this.shL = model.len * 0.45;
    this.trisHi = this.trisLo = model.triangles;
    this.geoHi = model.geometry; this.geoLo = model.geometry.clone();
    this.uBones = { value: null };
    const nb = this.nb;
    this.rig = { writeIdentity: (arr, off) => { for (let i = 0; i < nb; i++) _m.identity().toArray(arr, off + i * 16); } };
    const mk = (src) => {
      const m = ctx.materials.standard({ map: src.map || null, normalMap: src.normalMap || null, color: src.color?.clone?.() || new THREE.Color(1, 1, 1), roughness: src.roughness ?? 0.85, metalness: 0, roughnessMap: src.roughnessMap || null });
      injectSkinning(m, this.uBones);
      return m;
    };
    this.material = model.materials.length > 1 ? model.materials.map(mk) : mk(model.materials[0]);
    this.depthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    injectSkinning(this.depthMaterial, this.uBones);
    this.capacity = 0; this.free = []; this.meshHi = null; this.meshLo = null;
    this._allocate(capacity);
  }

  _allocate(cap) {
    const nb = this.nb;
    const arr = new Float32Array(nb * 16 * cap);
    if (this.boneArr) arr.set(this.boneArr); else for (let i = 0; i < cap; i++) this.rig.writeIdentity(arr, i * nb * 16);
    const tex = new THREE.DataTexture(arr, nb * 4, cap, THREE.RGBAFormat, THREE.FloatType);
    tex.minFilter = tex.magFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.needsUpdate = true;
    const old = this.uBones.value; this.uBones.value = tex; this.boneArr = arr; if (old) old.dispose();
    for (let i = this.capacity; i < cap; i++) this.free.push(i);
    this.capacity = cap;
    const mk = (geo, shadow) => {
      geo.setAttribute('aSlot', new THREE.InstancedBufferAttribute(new Float32Array(cap), 1));
      const m = new THREE.InstancedMesh(geo, this.material, cap);
      m.name = `animals:${this.key}:${shadow ? 'near' : 'far'}`;
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
      m.customDepthMaterial = this.depthMaterial;
      m.castShadow = shadow; m.receiveShadow = true; m.frustumCulled = false; m.count = 0;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(m);
      return m;
    };
    if (this.meshHi) { this.group.remove(this.meshHi, this.meshLo); this.meshHi.dispose(); this.meshLo.dispose(); }
    this.meshHi = mk(this.geoHi, true);
    this.meshLo = mk(this.geoLo, false);
  }

  alloc() { if (!this.free.length) this._allocate(this.capacity * 2); return this.free.pop(); }
  release(slot) { this.free.push(slot); }

  /** Write animal `a`'s skinning matrices for time t into its row. Allocation-free. */
  pose(a, t) {
    const S = this.model.slots, nb = this.nb, off = a._slot * nb * 16, out = this.boneArr;
    const move = a._moveW * (1 - a._lieW);
    const gait = (a._phase % 1 + 1) % 1;
    const idleT = t + a._seed * 17;
    // dominant layer + one secondary blend
    let A = S.idle, tA = idleT, B = null, tB = 0, wB = 0;
    if (a._lieW > 0.5 && S.rest) { A = S.rest; }
    else if (a._drinkW > 0.5 && S.drink) { A = S.drink; }
    else if (a._headDown > 0.5 && S.graze) { A = S.graze; }
    if (move > 0.02 && S.walk) {
      const G = a._runW > 0.5 && S.run ? S.run : S.walk;
      B = G; tB = gait * G.duration; wB = Math.min(1, move);
    }
    if (wB >= 0.999) { sampleInto(B, tB, out, off, nb, 1, false); return; }
    sampleInto(A, tA, out, off, nb, 1 - wB, false);
    if (B && wB > 0) sampleInto(B, tB, out, off, nb, wB, true);
  }

  dispose() {
    this.group.remove(this.meshHi, this.meshLo);
    this.meshHi.dispose(); this.meshLo.dispose(); this.geoLo.dispose();
    for (const m of [].concat(this.material)) { m.dispose(); this.ctx.materials.untrack?.(m); }
    this.depthMaterial.dispose(); this.uBones.value?.dispose();
  }
}
