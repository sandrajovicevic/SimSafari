// ctx.assets — the ONLY way modules load authored files (ARCHITECTURE §8). Files live under
// public/assets/ and are served same-origin at /assets/...; every file must be registered in
// docs/ASSETS.md. Every loader resolves null (never throws / rejects) on a missing or broken file,
// so a module can fall back to its procedural path. Results are cached per path: two modules asking
// for the same texture share one GPU upload.
//
//   const gltf = await ctx.assets.gltf('models/quaternius/Deer.glb');   // { scene, animations, ... } | null
//   const tex  = await ctx.assets.texture('textures/polyhaven/dry_ground_rocks_diff.jpg', { srgb: true, repeat: true });
//   const env  = await ctx.assets.hdri('hdri/polyhaven/kloppenheim_06_1k.hdr');     // equirect DataTexture | null
//   ctx.assets.stats()   // { files, bytes, failed: [path…] }
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const BASE = (import.meta.env?.BASE_URL || '/') + 'assets/';

export class Assets {
  constructor(renderer, log) {
    this.renderer = renderer;
    this.log = log;
    this.cache = new Map(); // key -> Promise<result|null>
    this.bytes = 0;
    this.failed = [];
    this.manager = new THREE.LoadingManager();
    this.gltfLoader = new GLTFLoader(this.manager);
    this.gltfLoader.setMeshoptDecoder(MeshoptDecoder);
    this.texLoader = new THREE.TextureLoader(this.manager);
    this.rgbeLoader = new HDRLoader(this.manager);
    this.fileLoader = new THREE.FileLoader(this.manager);
    this.fileLoader.setResponseType('arraybuffer');
  }

  /** Resolve a path relative to public/assets/ (leading slashes / 'assets/' tolerated). */
  url(path) {
    const p = String(path).replace(/^\/+/, '').replace(/^assets\//, '');
    return BASE + p;
  }

  _once(key, make) {
    if (!this.cache.has(key)) {
      this.cache.set(key, make().catch((err) => {
        this.failed.push(key);
        this.log?.warn?.(`[assets] ${key} unavailable (${err?.message || err}); caller falls back`);
        return null;
      }));
    }
    return this.cache.get(key);
  }

  /** Raw bytes (ArrayBuffer) — used for byte accounting and for parse-from-buffer loaders. */
  _bytes(path) {
    const url = this.url(path);
    return new Promise((resolve, reject) => {
      this.fileLoader.load(url, (buf) => {
        // Vite answers unknown paths with index.html (200): reject anything that is not binary.
        const head = new Uint8Array(buf, 0, Math.min(16, buf.byteLength));
        if (head[0] === 0x3c /* '<' */) { reject(new Error('not found (got HTML)')); return; }
        this.bytes += buf.byteLength;
        resolve(buf);
      }, undefined, reject);
    });
  }

  /** glTF 2.0 (.glb / .gltf). Resolves the loader's result object or null. */
  gltf(path) {
    return this._once('gltf:' + path, async () => {
      const buf = await this._bytes(path);
      const url = this.url(path);
      const dir = url.slice(0, url.lastIndexOf('/') + 1);
      return await new Promise((resolve, reject) => this.gltfLoader.parse(buf, dir, resolve, reject));
    });
  }

  /**
   * Image texture. opts: { srgb (colour data, default false), repeat (RepeatWrapping), anisotropy }.
   * Colour maps (albedo) must pass srgb:true; normal/roughness/AO stay linear.
   */
  texture(path, { srgb = false, repeat = true, anisotropy = 8, flipY = true } = {}) {
    return this._once(`tex:${path}:${srgb}:${repeat}:${flipY}`, async () => {
      const url = this.url(path);
      const tex = await new Promise((resolve, reject) => this.texLoader.load(url, resolve, undefined, reject));
      const img = tex.image;
      if (!img || !img.width) throw new Error('not an image');
      this.bytes += img.width * img.height * 4; // GPU-side estimate
      tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.flipY = flipY;
      tex.anisotropy = Math.min(anisotropy, this.renderer?.capabilities?.getMaxAnisotropy?.() || 1);
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.needsUpdate = true;
      return tex;
    });
  }

  /** Radiance HDR (.hdr) as an equirectangular DataTexture (linear, HalfFloat). */
  hdri(path) {
    return this._once('hdri:' + path, async () => {
      const buf = await this._bytes(path);
      const data = this.rgbeLoader.parse(buf);
      const tex = new THREE.DataTexture(data.data, data.width, data.height, THREE.RGBAFormat, data.type);
      tex.colorSpace = THREE.LinearSRGBColorSpace;
      tex.mapping = THREE.EquirectangularReflectionMapping;
      tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = false;
      tex.needsUpdate = true;
      return tex;
    });
  }

  /** Did a previous load of `path` fail? (cheap check for fallbacks already taken) */
  hasFailed(path) { return this.failed.some((k) => k.endsWith(':' + path) || k.includes(':' + path + ':')); }

  stats() { return { files: this.cache.size, bytes: this.bytes, failed: this.failed.slice() }; }
}
