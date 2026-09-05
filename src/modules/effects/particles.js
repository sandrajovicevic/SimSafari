// GPU particles: one instanced-quad draw call for ambient dust motes, dust puffs, smoke and splashes.
// Motion is analytic in the vertex shader (spawn position/velocity/time → position now), so the CPU
// only writes a few floats per spawn; steady state is allocation-free. Soft particles read the
// pipeline's scene depth texture; when the pipeline is bypassed they fall back to the hardware
// depth test (uSoft = 0).
import * as THREE from 'three';

export const KIND = Object.freeze({ ambient: 0, dust: 1, smoke: 2, splash: 3 });
const KIND_DEFAULTS = {
  dust: { rate: 12, speed: 1.2, spread: 0.8, size: 0.45, sizeJitter: 0.5, life: 2.2, lifeJitter: 0.4 },
  smoke: { rate: 8, speed: 0.6, spread: 0.25, size: 0.55, sizeJitter: 0.4, life: 5.0, lifeJitter: 0.5 },
  splash: { rate: 40, speed: 3.2, spread: 0.5, size: 0.12, sizeJitter: 0.5, life: 0.9, lifeJitter: 0.4 },
};
const MAX_EMITTERS = 64;
const MAX_SPAWN_PER_FRAME = 400;

const VERT = /* glsl */ `
attribute vec3 aPos;
attribute vec3 aVel;
attribute vec4 aInfo;   // birth, life, size, seed
attribute float aKind;  // 0 ambient, 1 dust, 2 smoke, 3 splash
uniform float uTime;
uniform vec3 uWind;      // m/s
uniform vec3 uSunDir;    // towards the sun
uniform vec3 uSunColor;  // radiance-ish
uniform vec3 uAmbient;
uniform vec3 uBoxCenter;
uniform vec3 uBoxSize;
uniform float uAmbientAlpha;
uniform vec3 uCamPos;
varying vec2 vUv;
varying vec4 vColor;
varying float vViewZ;
varying float vRadius;

void main() {
  vUv = uv;
  float birth = aInfo.x, life = aInfo.y, size = aInfo.z, seed = aInfo.w;
  float age = uTime - birth;
  vec3 p; float alpha; float radius = size; vec3 albedo;
  float rot = seed * 6.2831853;
  if (aKind < 0.5) {
    // ambient mote: world-anchored, wrapped into a box that follows the camera
    vec3 drift = uWind * age * 0.25
      + vec3(sin(age * 0.7 + seed * 17.0), cos(age * 0.9 + seed * 31.0) * 0.5, sin(age * 0.8 + seed * 7.0)) * 0.6;
    vec3 rel = aPos + drift - uBoxCenter + uBoxSize * 0.5;
    p = mod(rel, uBoxSize) - uBoxSize * 0.5 + uBoxCenter;
    vec3 e = abs(p - uBoxCenter) / (uBoxSize * 0.5);
    float edge = smoothstep(0.0, 0.3, 1.0 - max(e.x, max(e.y, e.z)));
    float twinkle = 0.55 + 0.45 * sin(age * (2.0 + seed * 3.0) + seed * 40.0);
    alpha = uAmbientAlpha * edge * twinkle;
    albedo = vec3(1.0, 0.93, 0.82);
    rot += age * 0.3;
  } else {
    if (age < 0.0 || age > life) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vColor = vec4(0.0); vViewZ = 1.0; vRadius = 1.0; return;
    }
    float t = age / life;
    if (aKind < 1.5) {
      // dust puff: initial kick with drag, then the wind carries it; grows and thins out
      float k = 1.8; float dragT = (1.0 - exp(-k * age)) / k;
      p = aPos + aVel * dragT + uWind * (age - dragT) * 0.6 + vec3(0.0, 0.35 * age * (1.0 - t), 0.0);
      p += vec3(sin(age * 1.7 + seed * 9.0), 0.0, cos(age * 1.3 + seed * 5.0)) * 0.15 * age;
      radius = size * (1.0 + 2.4 * t);
      alpha = smoothstep(0.0, 0.08, t) * (1.0 - t) * (1.0 - t) * 0.8;
      albedo = vec3(0.80, 0.68, 0.50);
    } else if (aKind < 2.5) {
      // smoke: buoyant rise, wind, lazy swirl
      p = aPos + aVel * age + uWind * age * 0.8 + vec3(0.0, 1.1 * age, 0.0)
        + vec3(sin(age * 1.3 + seed * 9.0), 0.0, cos(age * 1.1 + seed * 5.0)) * 0.35 * age;
      radius = size * (1.0 + 3.2 * t);
      alpha = smoothstep(0.0, 0.1, t) * (1.0 - t) * 0.45;
      albedo = vec3(0.42, 0.42, 0.45);
    } else {
      // splash droplets: ballistic
      p = aPos + aVel * age + vec3(0.0, -4.9 * age * age, 0.0);
      radius = size;
      alpha = (1.0 - t * t) * 0.9;
      albedo = vec3(0.9, 0.95, 1.05);
    }
    rot += age * (0.6 + seed);
  }
  // lighting: ambient + sun with a forward-scattering lobe (dust glows when looking towards the sun)
  vec3 viewDir = normalize(p - uCamPos);
  float fwd = pow(max(dot(viewDir, uSunDir), 0.0), 6.0);
  vec3 light = uAmbient + uSunColor * (0.45 + 1.8 * fwd);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float c = cos(rot), s = sin(rot);
  vec2 corner = position.xy * radius * 2.0;
  corner = vec2(corner.x * c - corner.y * s, corner.x * s + corner.y * c);
  mv.xy += corner;
  vViewZ = -mv.z;
  vRadius = radius;
  // fade out when the particle would fill the screen (near plane)
  alpha *= smoothstep(radius * 1.5, radius * 4.0 + 2.0, vViewZ);
  vColor = vec4(albedo * light, alpha);
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform sampler2D uDepth;
uniform vec2 uResolution;
uniform float uNear;
uniform float uFar;
uniform float uSoft;     // 0 = hardware depth only; >0 = soft fade over uSoft * radius
varying vec2 vUv;
varying vec4 vColor;
varying float vViewZ;
varying float vRadius;
void main() {
  vec4 tex = texture2D(uMap, vUv);
  float a = tex.a * vColor.a;
  if (uSoft > 0.0) {
    float d = texture2D(uDepth, gl_FragCoord.xy / uResolution).x;
    float z = d * 2.0 - 1.0;
    float sceneZ = (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
    a *= clamp((sceneZ - vViewZ) / max(vRadius * uSoft, 0.05), 0.0, 1.0);
  }
  if (a < 0.003) discard;
  gl_FragColor = vec4(vColor.rgb * tex.rgb, a);
}
`;

class Emitter {
  constructor(sys, index) {
    this.sys = sys; this.index = index;
    this.active = false; this.kind = KIND.dust;
    this.position = new THREE.Vector3(); this.dir = new THREE.Vector3(0, 1, 0);
    this.rate = 0; this.speed = 1; this.spread = 0.5; this.size = 0.5; this.sizeJitter = 0.5;
    this.life = 2; this.lifeJitter = 0.4; this.acc = 0;
  }
  /** opts: {x,y,z, dir:[x,y,z]|Vector3, rate, speed, spread, size, sizeJitter, life, lifeJitter} */
  set(opts = {}) {
    if (opts.x !== undefined) this.position.x = opts.x;
    if (opts.y !== undefined) this.position.y = opts.y;
    if (opts.z !== undefined) this.position.z = opts.z;
    if (opts.dir) { const d = opts.dir; if (d.isVector3) this.dir.copy(d); else this.dir.set(d[0], d[1], d[2]); this.dir.normalize(); }
    for (const k of ['rate', 'speed', 'spread', 'size', 'sizeJitter', 'life', 'lifeJitter']) if (opts[k] !== undefined) this[k] = opts[k];
    return this;
  }
  setPosition(x, y, z) { this.position.set(x, y, z); return this; }
  /** Emit n particles now (independent of rate). */
  burst(n) { this.sys._emitFrom(this, n); return this; }
  stop() { this.rate = 0; return this; }
  dispose() { this.active = false; this.rate = 0; this.acc = 0; }
}

export class Particles {
  constructor(ctx, { capacity = 8192, ambientCount = 2500 } = {}) {
    this.ctx = ctx;
    this.rng = ctx.rng.fork('particles');
    this.world = ctx.world;
    this.capacity = capacity;
    this.ambientCount = Math.max(0, Math.min(ambientCount, capacity - 512));
    this.ringStart = this.ambientCount;
    this.head = this.ringStart;
    this.time = 0;
    this.enabled = true;
    this.softness = 1.0;
    this.boxSize = new THREE.Vector3(90, 28, 90);
    this.stats = { spawned: 0, alive: 0 };
    this._dirtyLo = Infinity; this._dirtyHi = -1; this._wrapped = false;

    const N = capacity;
    this.pos = new Float32Array(N * 3);
    this.vel = new Float32Array(N * 3);
    this.info = new Float32Array(N * 4);
    this.kind = new Float32Array(N);
    // dead by default: birth far in the past, life 0
    for (let i = 0; i < N; i++) { this.info[i * 4] = -1e6; this.info[i * 4 + 1] = 0; }

    const plane = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.setIndex(plane.getIndex());
    geo.setAttribute('position', plane.getAttribute('position'));
    geo.setAttribute('uv', plane.getAttribute('uv'));
    this._plane = plane;
    const mk = (arr, n) => { const a = new THREE.InstancedBufferAttribute(arr, n); a.setUsage(THREE.DynamicDrawUsage); return a; };
    this.aPos = mk(this.pos, 3); this.aVel = mk(this.vel, 3); this.aInfo = mk(this.info, 4); this.aKind = mk(this.kind, 1);
    geo.setAttribute('aPos', this.aPos); geo.setAttribute('aVel', this.aVel); geo.setAttribute('aInfo', this.aInfo); geo.setAttribute('aKind', this.aKind);
    geo.instanceCount = N;
    this._attrs = [[this.aPos, 3], [this.aVel, 3], [this.aInfo, 4], [this.aKind, 1]];
    this.geometry = geo;

    // ambient motes fill [0, ambientCount)
    const r = this.rng, B = this.boxSize;
    for (let i = 0; i < this.ambientCount; i++) {
      this.pos[i * 3] = r.float() * B.x; this.pos[i * 3 + 1] = r.float() * B.y; this.pos[i * 3 + 2] = r.float() * B.z;
      this.info[i * 4] = -r.float() * 100; this.info[i * 4 + 1] = 1e9;
      this.info[i * 4 + 2] = 0.035 + r.float() * r.float() * 0.14; this.info[i * 4 + 3] = r.float();
      this.kind[i] = KIND.ambient;
    }

    this.sprite = ctx.textures.gpu(/* glsl */ `
vec4 shade(vec2 uv){
  vec2 p = uv - 0.5; float r = length(p) * 2.0;
  float n = fbm(uv * 6.0 + uSeed, 4) * 0.5 + 0.5;
  float n2 = fbm(uv * 14.0 + 3.7, 3) * 0.5 + 0.5;
  float core = 1.0 - smoothstep(0.0, 1.0, r);
  float a = core * core * (0.55 + 0.45 * n) * (0.8 + 0.2 * n2);
  a *= smoothstep(1.0, 0.8, r);
  return vec4(vec3(0.85 + 0.15 * n2), clamp(a, 0.0, 1.0));
}`, { key: 'effects:sprite', size: 128, seed: 7, wrap: THREE.ClampToEdgeWrapping, mipmaps: true, anisotropy: 1 });

    this.uniforms = {
      uTime: { value: 0 }, uWind: { value: new THREE.Vector3(1, 0, 0.2) },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color(1, 1, 1) }, uAmbient: { value: new THREE.Color(0.3, 0.35, 0.45) },
      uBoxCenter: { value: new THREE.Vector3() }, uBoxSize: { value: this.boxSize }, uAmbientAlpha: { value: 0 }, uCamPos: { value: new THREE.Vector3() },
      uMap: { value: this.sprite }, uDepth: { value: null }, uResolution: { value: new THREE.Vector2(1, 1) },
      uNear: { value: 0.5 }, uFar: { value: 6000 }, uSoft: { value: 0 },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.NormalBlending, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.name = 'effects-particles';
    this.mesh.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.mesh);

    this.emitters = [];
    for (let i = 0; i < MAX_EMITTERS; i++) this.emitters.push(new Emitter(this, i));
    this._fwd = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
  }

  // ---------- spawning ----------

  spawn(kind, x, y, z, vx, vy, vz, life, size, seed) {
    const i = this.head;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.info[i * 4] = this.time; this.info[i * 4 + 1] = life; this.info[i * 4 + 2] = size; this.info[i * 4 + 3] = seed;
    this.kind[i] = kind;
    if (i < this._dirtyLo) this._dirtyLo = i;
    if (i > this._dirtyHi) this._dirtyHi = i;
    this.head = i + 1 >= this.capacity ? this.ringStart : i + 1;
    if (this.head === this.ringStart) this._wrapped = true;
    this.stats.spawned++;
  }

  /** Dust puff at ground level. amount ≈ 1 for a wheel/hoof, dir optional {x,z} or Vector3 for a travel direction. */
  spawnDust(x, z, amount = 1, dir = null) {
    if (!this.enabled) return;
    const r = this.rng;
    const n = Math.max(1, Math.min(60, Math.round(amount * 7)));
    const y = this.world.getHeight(x, z) + 0.15;
    let dx = 0, dz = 0;
    if (dir) { dx = dir.x || 0; dz = dir.z || 0; const l = Math.hypot(dx, dz); if (l > 1e-4) { dx /= l; dz /= l; } }
    for (let i = 0; i < n; i++) {
      const a = r.float() * Math.PI * 2, s = 0.4 + r.float() * 1.6;
      const vx = Math.cos(a) * s - dx * (0.8 + r.float() * 1.2), vz = Math.sin(a) * s - dz * (0.8 + r.float() * 1.2);
      const vy = 0.6 + r.float() * 1.8;
      this.spawn(KIND.dust, x + (r.float() - 0.5) * 0.6, y + r.float() * 0.3, z + (r.float() - 0.5) * 0.6,
        vx, vy, vz, 1.4 + r.float() * 1.6, (0.3 + r.float() * 0.5) * Math.min(1.5, 0.6 + amount * 0.5), r.float());
    }
  }

  /** Generic emitter. kind: 'dust'|'smoke'|'splash'. Returns an Emitter handle or null if the pool is exhausted. */
  emitter(kind = 'dust', opts = {}) {
    const e = this.emitters.find((m) => !m.active);
    if (!e) return null;
    const k = typeof kind === 'number' ? kind : (KIND[kind] ?? KIND.dust);
    const d = KIND_DEFAULTS[typeof kind === 'string' ? kind : 'dust'] || KIND_DEFAULTS.dust;
    e.active = true; e.kind = k; e.acc = 0;
    e.position.set(0, 0, 0); e.dir.set(0, 1, 0);
    Object.assign(e, d);
    e.set(opts);
    return e;
  }

  _emitFrom(e, n) {
    const r = this.rng, d = e.dir, t = this._tmp;
    for (let i = 0; i < n; i++) {
      // random direction within a cone around e.dir
      t.set(r.float() - 0.5, r.float() - 0.5, r.float() - 0.5).multiplyScalar(2 * e.spread).add(d).normalize();
      const sp = e.speed * (0.6 + r.float() * 0.8);
      const life = e.life * (1 + (r.float() - 0.5) * 2 * e.lifeJitter);
      const size = e.size * (1 + (r.float() - 0.5) * 2 * e.sizeJitter);
      const j = e.kind === KIND.smoke ? 0.25 : 0.15;
      this.spawn(e.kind, e.position.x + (r.float() - 0.5) * j, e.position.y + (r.float() - 0.5) * j, e.position.z + (r.float() - 0.5) * j,
        t.x * sp, t.y * sp, t.z * sp, Math.max(0.1, life), Math.max(0.02, size), r.float());
    }
  }

  // ---------- per frame ----------

  /**
   * @param {number} dt seconds
   * @param {number} t elapsed seconds
   * @param {{sunDir:THREE.Vector3, sunColor:THREE.Color, ambient:THREE.Color, wind:{x,z,speed}, camera:THREE.Camera, target:THREE.Vector3, ambientAlpha:number}} L
   */
  update(dt, t, L) {
    this.time = t;
    const u = this.uniforms;
    u.uTime.value = t;
    if (L.wind) { const w = L.wind; const l = Math.hypot(w.x, w.z) || 1; const s = w.speed ?? 3; u.uWind.value.set((w.x / l) * s, 0, (w.z / l) * s); }
    if (L.sunDir) u.uSunDir.value.copy(L.sunDir);
    if (L.sunColor) u.uSunColor.value.copy(L.sunColor);
    if (L.ambient) u.uAmbient.value.copy(L.ambient);
    u.uAmbientAlpha.value = L.ambientAlpha ?? 0;
    const cam = L.camera;
    if (cam) {
      u.uCamPos.value.copy(cam.position);
      u.uNear.value = cam.near; u.uFar.value = cam.far;
      // ambient box: a bit in front of the camera, towards the target
      cam.getWorldDirection(this._fwd);
      const dist = L.target ? cam.position.distanceTo(L.target) : 60;
      u.uBoxCenter.value.copy(cam.position).addScaledVector(this._fwd, Math.min(50, dist * 0.35));
    }
    // continuous emitters
    let budget = MAX_SPAWN_PER_FRAME;
    if (this.enabled && dt > 0) {
      for (let i = 0; i < this.emitters.length && budget > 0; i++) {
        const e = this.emitters[i];
        if (!e.active || e.rate <= 0) continue;
        e.acc += e.rate * dt;
        const n = Math.min(budget, Math.floor(e.acc));
        if (n > 0) { e.acc -= n; budget -= n; this._emitFrom(e, n); }
      }
    }
    this._flush();
  }

  _flush() {
    if (this._dirtyHi < 0) return;
    let lo = this._dirtyLo, hi = this._dirtyHi;
    if (this._wrapped) { lo = this.ringStart; hi = this.capacity - 1; }
    for (let k = 0; k < this._attrs.length; k++) {
      const attr = this._attrs[k][0], n = this._attrs[k][1];
      attr.clearUpdateRanges();
      attr.addUpdateRange(lo * n, (hi - lo + 1) * n);
      attr.needsUpdate = true;
    }
    this._dirtyLo = Infinity; this._dirtyHi = -1; this._wrapped = false;
  }

  // ---------- rendering ----------

  /** Draw into the current render target with soft depth from the pipeline's scene depth. */
  renderInto(renderer, camera, depthTexture, width, height) {
    if (!this.enabled) return;
    const u = this.uniforms;
    u.uDepth.value = depthTexture; u.uResolution.value.set(width, height); u.uSoft.value = this.softness;
    this.material.depthTest = false;
    renderer.render(this.scene, camera);
  }

  /** Bypass mode: hardware depth test against the default framebuffer, no soft fade. */
  renderDirect(renderer, camera) {
    if (!this.enabled) return;
    const u = this.uniforms;
    u.uSoft.value = 0; u.uDepth.value = null;
    this.material.depthTest = true;
    const oc = renderer.autoClear; renderer.autoClear = false;
    renderer.render(this.scene, camera);
    renderer.autoClear = oc;
  }

  dispose() {
    this.geometry.dispose(); this._plane.dispose(); this.material.dispose();
    this.ctx.textures.dispose('effects:sprite');
    this.scene.remove(this.mesh);
    for (const e of this.emitters) e.dispose();
  }
}
