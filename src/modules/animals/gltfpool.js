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
  // Gobkit (CC0): rigged, 4 clips (idle/walk/attack/dead) — no graze/run, those slots stay procedural.
  // Stylised textured models; `tint` pulls the flat cartoon colours toward natural tones.
  hippo: {
    path: 'models/gobkit/Hippo.glb', height: 1.5, yaw: 0, clips: { idle: 'idle', walk: 'walk', run: 'walk' },
    tint: { material: [0.62, 0.55, 0.5] },
  },
  rhino: {
    path: 'models/gobkit/Rhino.glb', height: 1.8, yaw: 0, clips: { idle: 'idle', walk: 'walk', run: 'walk' },
    tint: { material: [0.5, 0.56, 0.38] },
  },
  // Poly Pizza / Poly by Google (CC-BY 3.0): real zebra silhouette WITH the stripe texture and UVs
  // the old Quaternius Horse_White stand-in lacked (its mesh had no UVs, so stripes were impossible —
  // critic round 6 major). Static mesh: no rig exists for it on that source (see giraffe note below),
  // so it translates/turns but does not articulate. `tint` pulls the map's pure-white base (1,1,1)
  // toward zebra-off-white so the animal does not glow at distance (stripes are near-black and survive).
  zebra: {
    path: 'models/polypizza/Zebra.glb', height: 1.55, yaw: 0,
    tint: { lambert2SG: [0.82, 0.81, 0.76] },
  },
  buffalo: {
    path: 'models/quaternius/Bull.glb', height: 1.8, yaw: 0,
    clips: { idle: 'Idle', walk: 'Walk', run: 'Gallop', graze: 'Eating', drink: 'Eating', rest: 'Idle_Headlow' },
    tint: { Main: [0.05, 0.045, 0.04], Main_Light: [0.09, 0.085, 0.08], Horns: [0.28, 0.25, 0.2], Muzzle: [0.03, 0.03, 0.03], Hooves: [0.04, 0.04, 0.04] },
  },
  wildebeest: {
    path: 'models/quaternius/Bull.glb', height: 1.5, yaw: 0,
    clips: { idle: 'Idle', walk: 'Walk', run: 'Gallop', graze: 'Eating', drink: 'Eating', rest: 'Idle_Headlow' },
    tint: { Main: [0.1, 0.095, 0.09], Main_Light: [0.13, 0.12, 0.11], Horns: [0.35, 0.32, 0.26], Muzzle: [0.05, 0.05, 0.05], Hooves: [0.05, 0.05, 0.05] },
  },
  impala: {
    path: 'models/quaternius/Deer.glb', height: 1.0, yaw: 0,
    clips: { idle: 'Idle', walk: 'Walk', run: 'Gallop', graze: 'Eating', drink: 'Eating', rest: 'Idle_Headlow' },
    tint: { Main: [0.22, 0.13, 0.06], Main_Light: [0.42, 0.36, 0.28], Main_Dark: [0.14, 0.09, 0.05], Hooves: [0.05, 0.05, 0.05] },
  },
  // Poly Pizza / Google Poly (CC-BY 3.0): real species silhouettes + textures but NO rig — loadModel
  // synthesises a one-bone identity rig so the pool renders them; they do not articulate (see README).
  // elephant: the shipped Poly texture is a near-flat grey bake (see README "Known gaps") — skinDetail
  // adds a procedural wrinkle-grain modulation in the fragment shader so the 12 m close shot shows skin.
  giraffe: { path: 'models/polypizza/Giraffe.glb', height: 5.0, yaw: 0 },
  elephant: {
    path: 'models/polypizza/Elephant.glb', height: 3.4, yaw: 0,
    // gain: the shipped "BaseColor" is a dark grey bake (~0.15 linear) — lifted to the hide albedo
    // the module authors for elephants (~0.25-0.40 linear, see skin.js/README), then broken up with
    // the procedural wrinkle-grain below so the 12 m close shot shows skin.
    skinDetail: { scaleU: 9.0, scaleV: 3.5, strength: 0.45, gain: 1.9 },
  },
  lion: { path: 'models/polypizza/Lion.glb', height: 1.2, yaw: 0 },
};

/**
 * Per-variant authored models: species:variant → def, loaded in addition to ASSET_SPECIES
 * (getPool() looks up `species:variant` first, then `species`). Empty after a documented search
 * (2026-09-25, README "Authored species models"): every lion on poly.pizza is a maned male, so
 * prides currently render all-male. Drop a mane-less model here as `lion: { female: { … } }` and
 * female-spawned lions pick it up automatically.
 */
export const ASSET_VARIANTS = {};

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

/** Materialise interleaved vertex attributes (some exporters, e.g. gobkit, interleave
 * position/normal/uv/joints/weights into one 56-byte record) as plain typed arrays. Downstream code
 * (mergeGeometries, the skin-attribute copies, skinned-bounds loop) reads `.array` directly and
 * would silently mix neighbouring attributes' bytes into garbage without this. */
function plainAttributes(g) {
  for (const k of Object.keys(g.attributes)) {
    const a = g.attributes[k];
    if (a.isInterleavedBufferAttribute) {
      const out = new Float32Array(a.count * a.itemSize);
      for (let i = 0; i < a.count; i++) {
        for (let c = 0; c < a.itemSize; c++) out[i * a.itemSize + c] = a.getComponent(i, c);
      }
      g.setAttribute(k, new THREE.BufferAttribute(out, a.itemSize));
    }
  }
}

/** Keep only the triangles of one geometry group. Indexed geometries get their index sliced to the
 * group's range (the shared vertex buffer stays whole — these models are a few thousand verts);
 * non-indexed ones get every attribute sliced by vertex range. */
function stripToGroup(g, start, count) {
  const idx = g.getIndex();
  if (idx) {
    const Ctor = idx.array.constructor;
    g.setIndex(new THREE.BufferAttribute(new Ctor(idx.array.slice(start, start + count)), 1));
  } else {
    for (const k of Object.keys(g.attributes)) {
      const a = g.attributes[k];
      const out = new a.array.constructor(a.itemSize * count);
      for (let i = 0; i < count; i++) {
        for (let c = 0; c < a.itemSize; c++) out[i * a.itemSize + c] = a.array[(start + i) * a.itemSize + c];
      }
      g.setAttribute(k, new THREE.BufferAttribute(out, a.itemSize));
    }
  }
}

/**
 * One mesh → one { geometry, material } pair PER MATERIAL. Multi-primitive glTF meshes arrive as a
 * single BufferGeometry with a material ARRAY + groups; the old path pushed `mesh.material[0]` and
 * cleared the mesh's groups, which repainted the whole model with its first material (anything after
 * the first — skin detail, eyes, hooves — silently lost). Single-material meshes pass through as one
 * pair. Geometry is cloned + de-interleaved, in mesh-local space (callers apply mesh.matrixWorld).
 */
function meshParts(mesh) {
  const src = mesh.geometry.clone();
  plainAttributes(src);
  const multi = Array.isArray(mesh.material) && src.groups.length > 0 && mesh.material.length > 1;
  const parts = [];
  if (!multi) {
    src.clearGroups();
    parts.push({ g: src, mat: Array.isArray(mesh.material) ? mesh.material[0] : mesh.material });
    return parts;
  }
  for (const grp of src.groups) {
    const g = src.clone();
    stripToGroup(g, grp.start, grp.count);
    g.clearGroups();
    parts.push({ g, mat: mesh.material[grp.materialIndex] || mesh.material[0] });
  }
  return parts;
}

/** mergeGeometries() requires every geometry to carry the SAME attribute set: when any part kept a
 * vertex-colour attribute (several Poly models are vertex-coloured), fill the rest with white so the
 * merge cannot fail and uncoloured parts render unmodified. */
function equaliseColors(geos) {
  if (!geos.some((g) => g.getAttribute('color'))) return false;
  for (const g of geos) {
    if (g.getAttribute('color')) continue;
    const n = g.attributes.position.count;
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  }
  return true;
}

/** def.tint: material name → linear albedo, applied to a clone so two species may share one file. */
function tintMaterials(def, mats) {
  if (!def.tint) return mats;
  return mats.map((m) => {
    const t = def.tint[m.name];
    if (!t) return m;
    const c = m.clone();
    c.color.setRGB(t[0], t[1], t[2]);
    return c;
  });
}

/**
 * Procedural skin grain for static models whose shipped texture is a flat bake (the Poly elephant's
 * "BaseColor" PNG is a near-featureless grey with the shading baked in — README "Known gaps").
 * Multiplies the map's albedo with stretched value noise evaluated in UV space: two wrinkle octaves
 * (long along U, second at the non-harmonic ×2.618 so crests never align into a lattice — the same
 * construction the procedural elephant hide uses) plus a fine grain. Deterministic GLSL hash, no
 * sampler, no allocation. Chained AFTER injectSkinning's onBeforeCompile (ARCHITECTURE §9).
 */
function injectSkinDetail(material, d) {
  const prev = material.onBeforeCompile;
  const prevKey = material.customProgramCacheKey;
  material.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
float _h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float _vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(_h21(i), _h21(i + vec2(1.0, 0.0)), f.x), mix(_h21(i + vec2(0.0, 1.0)), _h21(i + vec2(1.0, 1.0)), f.x), f.y); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
{
  diffuseColor.rgb *= ${(+d.gain || 1).toFixed(3)};
  float w1 = _vn(vMapUv * vec2(${d.scaleU.toFixed(1)}, ${d.scaleV.toFixed(1)}));
  float w2 = _vn(vMapUv * vec2(${(d.scaleU * 2.618).toFixed(1)}, ${(d.scaleV * 2.618).toFixed(1)}) + 7.31);
  float grain = _vn(vMapUv * vec2(${(d.scaleU * 6.0).toFixed(1)}, ${(d.scaleV * 6.0).toFixed(1)}) + 3.7);
  float t = 0.55 * (0.5 + 0.5 * sin((w1 * 0.7 + w2 * 0.3) * 18.849)) + 0.45 * grain;
  diffuseColor.rgb *= mix(${(1 - d.strength).toFixed(3)}, ${(1 + d.strength * 0.45).toFixed(3)}, t);
}`);
  };
  material.customProgramCacheKey = () => ((prevKey && prevKey.call(material)) || '') + '+skindetail';
}

/**
 * Static-mesh path: Poly Pizza / Google Poly models ship no rig or clips. Synthesise a one-bone
 * identity rig + a one-frame identity "clip" so the same instanced-skinning pool renders them.
 * Honest limitation: these species translate and turn but do not articulate (no walk cycle).
 */
function bakeStatic(ctx, def, gltf) {
  const list = [];
  gltf.scene.traverse((o) => { if (o.isMesh && o.geometry) list.push(o); });
  if (!list.length) { ctx.log.warn(`[animals] ${def.path}: no usable mesh`); return null; }
  const geos = [], mats = [];
  for (const mesh of list) {
    for (const { g, mat } of meshParts(mesh)) {
      g.applyMatrix4(mesh.matrixWorld);
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
      if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      if (!g.getAttribute('normal')) g.computeVertexNormals();
      const n = g.attributes.position.count;
      g.setAttribute('aBoneIndex', new THREE.Float32BufferAttribute(new Float32Array(n * 4), 4));
      const w = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) w[i * 4] = 1;
      g.setAttribute('aBoneWeight', new THREE.Float32BufferAttribute(w, 4));
      geos.push(g);
      mats.push(mat);
    }
  }
  const hasVertexColors = equaliseColors(geos);
  const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, true);
  if (!merged) { ctx.log.warn(`[animals] ${def.path}: geometries could not be merged`); return null; }

  merged.computeBoundingBox();
  const box = merged.boundingBox, size = box.getSize(new THREE.Vector3());
  const s = def.height / Math.max(1e-3, size.y);
  const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
  _n.makeRotationY(def.yaw || 0).multiply(new THREE.Matrix4().makeScale(s, s, s)).multiply(new THREE.Matrix4().makeTranslation(-cx, -box.min.y, -cz));
  merged.applyMatrix4(_n);

  const identity = new Float32Array(16); identity[0] = identity[5] = identity[10] = identity[15] = 1;
  const clip = { name: 'idle', duration: 1, frames: 1, data: identity };
  const len = Math.max(size.x, size.z) * s, wid = Math.min(size.x, size.z) * s;
  return {
    path: def.path, nb: 1, geometry: merged, materials: tintMaterials(def, mats), clips: { idle: clip },
    slots: { idle: clip, walk: null, run: null, graze: null, drink: null, rest: null },
    len, wid, height: def.height, triangles: (merged.index ? merged.index.count : merged.attributes.position.count) / 3,
    static: true, vertexColors: hasVertexColors, skinDetail: def.skinDetail || null,
  };
}

/** Load + bake one model. Resolves a "model" record or null (never throws). */
export async function loadModel(ctx, def) {
  try {
    const gltf = await ctx.assets.gltf(def.path);
    if (!gltf) return null;
    const scene = gltf.scene;
    scene.updateMatrixWorld(true);
    const meshes = firstSkinned(scene);
    if (!meshes.length) return bakeStatic(ctx, def, gltf);
    const skeleton = meshes[0].skeleton;
    const skinMeshes = meshes.filter((m) => m.skeleton === skeleton);
    const bones = skeleton.bones, nb = bones.length;

    // geometry: one merged, bind-space geometry per material, skin attributes renamed for skin.js
    const geos = [], mats = [];
    for (const mesh of skinMeshes) {
      for (const { g, mat } of meshParts(mesh)) {
        const si = g.getAttribute('skinIndex'), sw = g.getAttribute('skinWeight');
        if (!si || !sw) continue;
        g.setAttribute('aBoneIndex', new THREE.Float32BufferAttribute(Float32Array.from(si.array), 4));
        g.setAttribute('aBoneWeight', new THREE.Float32BufferAttribute(Float32Array.from(sw.array), 4));
        g.deleteAttribute('skinIndex'); g.deleteAttribute('skinWeight');
        for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color', 'aBoneIndex', 'aBoneWeight'].includes(k)) g.deleteAttribute(k);
        if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
        if (!g.getAttribute('normal')) g.computeVertexNormals();
        // merged meshes share mesh0's bind frame below — true for single-armature exports
        geos.push(g);
        mats.push(mat);
      }
    }
    if (!geos.length) return null;
    const hasVertexColors = equaliseColors(geos);
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
      path: def.path, nb, geometry: merged, materials: tintMaterials(def, mats), clips,
      slots: { idle: clips[idleName], walk: slot('walk'), run: slot('run') || slot('walk'), graze: slot('graze'), drink: slot('drink') || slot('graze'), rest: slot('rest') },
      len, wid, height: def.height, triangles: (merged.index ? merged.index.count : P.count) / 3,
      static: false, vertexColors: hasVertexColors, skinDetail: def.skinDetail || null,
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
      const m = ctx.materials.standard({ map: src.map || null, normalMap: src.normalMap || null, color: src.color?.clone?.() || new THREE.Color(1, 1, 1), roughness: src.roughness ?? 0.85, metalness: 0, roughnessMap: src.roughnessMap || null, vertexColors: this.model.vertexColors === true });
      injectSkinning(m, this.uBones);
      // AFTER injectSkinning: injectSkinDetail wraps the skinning handler (injectSkinning assigns
      // material.onBeforeCompile directly, so an earlier wrapper would be overwritten and lost).
      if (this.model.skinDetail && src.map) injectSkinDetail(m, this.model.skinDetail);
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
