// Post-processing pipeline. Pass order (high tier), draw calls in [brackets]:
//   ScenePass      scene → sceneRT (HalfFloat, MSAA, float depth texture)          [scene]
//   AOPass         GTAO from depth only (normals reconstructed) + Poisson denoise  [2]
//   ResolvePass    sceneRT × AO, heat-haze refraction → composer read buffer        [1]
//   ParticlesPass  instanced soft particles drawn over the read buffer              [1]
//   BloomPass      threshold → 3-level mip chain → tent upsample (¼ res result)     [5]
//   GradePass      + bloom, exposure/contrast/saturation/warmth, vignette, grain    [1]
//   FXAAPass | SMAAPass                                                             [1 | 3]
//   OutputPass     ACES tone mapping + sRGB (renderer.toneMappingExposure)          [1]
// sceneRT is never a render target while its depth is sampled, so there are no feedback loops.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { FXAAPass } from 'three/examples/jsm/postprocessing/FXAAPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { GLSL_NOISE } from '../../core/Textures.js';
import { HAZE_GLSL } from './heatHaze.js';

export const TIERS = {
  high: { msaa: 4, ao: true, aoSamples: 16, aoScale: 1.0, bloom: true, haze: true, aa: 'fxaa' },
  medium: { msaa: 2, ao: true, aoSamples: 8, aoScale: 0.5, bloom: true, haze: true, aa: 'fxaa' },
  low: { msaa: 0, ao: false, aoSamples: 0, aoScale: 0.5, bloom: false, haze: false, aa: 'fxaa' },
};

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

// ---------------------------------------------------------------- passes

class ScenePass extends Pass {
  constructor(scene, camera, target) {
    super();
    this.scene = scene; this.camera = camera; this.target = target;
    this.needsSwap = false;
  }
  render(renderer) {
    const oc = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(this.scene, this.camera);
    renderer.autoClear = oc;
  }
  setSize(w, h) { this.target.setSize(w, h); }
}

/** GTAO fed with the scene depth texture only: no second scene render for normals. */
class AOPass extends GTAOPass {
  constructor(scene, camera, w, h, depthTexture, scale, params) {
    const sw = Math.max(2, Math.round(w * scale)), sh = Math.max(2, Math.round(h * scale));
    super(scene, camera, sw, sh);
    this.scaleFactor = scale;
    this.setGBuffer(depthTexture, undefined);
    this.normalRenderTarget.dispose(); // unused: normals are reconstructed from depth
    this.output = GTAOPass.OUTPUT.Off;
    this.needsSwap = false;
    this.updateGtaoMaterial({
      radius: params.radius, distanceExponent: 1, thickness: params.thickness ?? 1, distanceFallOff: 1,
      scale: params.scale ?? 1, samples: params.samples, screenSpaceRadius: false,
    });
    this.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 4, radiusExponent: 1, rings: 2, samples: 16 });
    this.gtaoMaterial.needsUpdate = true;
    this.pdMaterial.needsUpdate = true;
  }
  setSize(w, h) {
    const sw = Math.max(2, Math.round(w * this.scaleFactor)), sh = Math.max(2, Math.round(h * this.scaleFactor));
    this.width = sw; this.height = sh;
    this.gtaoRenderTarget.setSize(sw, sh);
    this.pdRenderTarget.setSize(sw, sh);
    this.gtaoMaterial.uniforms.resolution.value.set(sw, sh);
    this.pdMaterial.uniforms.resolution.value.set(sw, sh);
  }
}

class ResolvePass extends Pass {
  constructor(sceneRT, aoTexture, camera) {
    super();
    this.sceneRT = sceneRT; this.camera = camera;
    this.needsSwap = true;
    this.uniforms = {
      tScene: { value: null }, tAO: { value: aoTexture }, uAO: { value: 1 },
      uHaze: { value: 0 }, uHazeNear: { value: 120 }, uHazeFar: { value: 650 }, uHazeAmp: { value: 3 }, uHazeHeight: { value: 18 }, uGroundY: { value: 0 },
      uTime: { value: 0 }, uResolution: { value: new THREE.Vector2(1, 1) }, uProjInv: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() },
      tDepth: { value: null },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: VERT,
      fragmentShader: /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tAO;
uniform float uAO;
varying vec2 vUv;
${GLSL_NOISE}
${HAZE_GLSL}
void main() {
  vec2 uv = hazeUv(vUv);
  vec3 col = texture2D(tScene, uv).rgb;
  float ao = texture2D(tAO, uv).r;
  col *= mix(1.0, ao, uAO);
  gl_FragColor = vec4(col, 1.0);
}`,
      depthTest: false, depthWrite: false, blending: THREE.NoBlending,
    });
    this.fsQuad = new FullScreenQuad(this.material);
  }
  render(renderer, writeBuffer) {
    const u = this.uniforms;
    u.tScene.value = this.sceneRT.texture;
    u.tDepth.value = this.sceneRT.depthTexture;
    u.uProjInv.value.copy(this.camera.projectionMatrixInverse);
    u.uCamWorld.value.copy(this.camera.matrixWorld);
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.fsQuad.render(renderer);
  }
  setSize(w, h) { this.uniforms.uResolution.value.set(w, h); }
  dispose() { this.material.dispose(); this.fsQuad.dispose(); }
}

class ParticlesPass extends Pass {
  constructor(particles, camera, sceneRT) {
    super();
    this.particles = particles; this.camera = camera; this.sceneRT = sceneRT;
    this.needsSwap = false;
  }
  render(renderer, writeBuffer, readBuffer) {
    if (!this.particles || !this.particles.enabled) return;
    const oc = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);
    this.particles.renderInto(renderer, this.camera, this.sceneRT.depthTexture, this.sceneRT.width, this.sceneRT.height);
    renderer.autoClear = oc;
  }
}

/** Lean bloom: soft-knee threshold into a 3-level mip chain, tent-filter upsample. Result at ¼ res. */
class BloomPass extends Pass {
  constructor(w, h, { threshold = 1.0, knee = 0.5, levels = 3, radius = 1.6 } = {}) {
    super();
    this.needsSwap = false;
    this.levels = levels;
    this.mips = [];
    for (let i = 0; i < levels; i++) {
      const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
      rt.texture.name = 'effects.bloom' + i;
      this.mips.push(rt);
    }
    this.uPre = { tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: threshold }, uKnee: { value: knee } };
    this.uDown = { tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2() } };
    this.uUp = { tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2() }, uRadius: { value: radius } };
    const common = { vertexShader: VERT, depthTest: false, depthWrite: false };
    this.matPre = new THREE.ShaderMaterial({ ...common, uniforms: this.uPre, blending: THREE.NoBlending, fragmentShader: /* glsl */ `
uniform sampler2D tDiffuse; uniform vec2 uTexel; uniform float uThreshold; uniform float uKnee;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tDiffuse, vUv + vec2(-1.0, -1.0) * uTexel).rgb + texture2D(tDiffuse, vUv + vec2(1.0, -1.0) * uTexel).rgb
         + texture2D(tDiffuse, vUv + vec2(-1.0, 1.0) * uTexel).rgb + texture2D(tDiffuse, vUv + vec2(1.0, 1.0) * uTexel).rgb;
  c = min(c * 0.25, vec3(24.0));
  float br = max(c.r, max(c.g, c.b));
  float soft = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee);
  soft = soft * soft / (4.0 * uKnee + 1e-4);
  float contrib = max(soft, br - uThreshold) / max(br, 1e-4);
  gl_FragColor = vec4(c * contrib, 1.0);
}` });
    this.matDown = new THREE.ShaderMaterial({ ...common, uniforms: this.uDown, blending: THREE.NoBlending, fragmentShader: /* glsl */ `
uniform sampler2D tDiffuse; uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tDiffuse, vUv + vec2(-1.0, -1.0) * uTexel).rgb + texture2D(tDiffuse, vUv + vec2(1.0, -1.0) * uTexel).rgb
         + texture2D(tDiffuse, vUv + vec2(-1.0, 1.0) * uTexel).rgb + texture2D(tDiffuse, vUv + vec2(1.0, 1.0) * uTexel).rgb;
  gl_FragColor = vec4(c * 0.25, 1.0);
}` });
    this.matUp = new THREE.ShaderMaterial({ ...common, uniforms: this.uUp, blending: THREE.AdditiveBlending, transparent: true, fragmentShader: /* glsl */ `
uniform sampler2D tDiffuse; uniform vec2 uTexel; uniform float uRadius;
varying vec2 vUv;
void main() {
  vec2 d = uTexel * uRadius;
  vec3 c = texture2D(tDiffuse, vUv + vec2(-d.x, -d.y)).rgb * 1.0 + texture2D(tDiffuse, vUv + vec2(0.0, -d.y)).rgb * 2.0 + texture2D(tDiffuse, vUv + vec2(d.x, -d.y)).rgb * 1.0
         + texture2D(tDiffuse, vUv + vec2(-d.x, 0.0)).rgb * 2.0 + texture2D(tDiffuse, vUv).rgb * 4.0 + texture2D(tDiffuse, vUv + vec2(d.x, 0.0)).rgb * 2.0
         + texture2D(tDiffuse, vUv + vec2(-d.x, d.y)).rgb * 1.0 + texture2D(tDiffuse, vUv + vec2(0.0, d.y)).rgb * 2.0 + texture2D(tDiffuse, vUv + vec2(d.x, d.y)).rgb * 1.0;
  gl_FragColor = vec4(c / 16.0, 1.0);
}` });
    this.fsQuad = new FullScreenQuad(null);
    this.setSize(w, h);
  }
  get texture() { return this.mips[0].texture; }
  setSize(w, h) {
    this.srcTexel = new THREE.Vector2(1 / w, 1 / h);
    let mw = Math.max(1, Math.round(w / 4)), mh = Math.max(1, Math.round(h / 4));
    for (let i = 0; i < this.levels; i++) { this.mips[i].setSize(mw, mh); mw = Math.max(1, Math.round(mw / 2)); mh = Math.max(1, Math.round(mh / 2)); }
  }
  render(renderer, writeBuffer, readBuffer) {
    const oc = renderer.autoClear; renderer.autoClear = false;
    // prefilter: read buffer → mip0
    this.uPre.tDiffuse.value = readBuffer.texture; this.uPre.uTexel.value.copy(this.srcTexel);
    this.fsQuad.material = this.matPre;
    renderer.setRenderTarget(this.mips[0]); this.fsQuad.render(renderer);
    // downsample chain
    for (let i = 0; i < this.levels - 1; i++) {
      const src = this.mips[i];
      this.uDown.tDiffuse.value = src.texture; this.uDown.uTexel.value.set(1 / src.width, 1 / src.height);
      this.fsQuad.material = this.matDown;
      renderer.setRenderTarget(this.mips[i + 1]); this.fsQuad.render(renderer);
    }
    // upsample (additive) back to mip0
    for (let i = this.levels - 1; i > 0; i--) {
      const src = this.mips[i];
      this.uUp.tDiffuse.value = src.texture; this.uUp.uTexel.value.set(1 / src.width, 1 / src.height);
      this.fsQuad.material = this.matUp;
      renderer.setRenderTarget(this.mips[i - 1]); this.fsQuad.render(renderer);
    }
    renderer.autoClear = oc;
  }
  dispose() { for (const m of this.mips) m.dispose(); this.matPre.dispose(); this.matDown.dispose(); this.matUp.dispose(); this.fsQuad.dispose(); }
}

class GradePass extends Pass {
  constructor(bloomTexture) {
    super();
    this.needsSwap = true;
    this.uniforms = {
      tDiffuse: { value: null }, tBloom: { value: bloomTexture }, uBloom: { value: 0 },
      uExposure: { value: 1 }, uContrast: { value: 1 }, uSaturation: { value: 1 }, uTint: { value: new THREE.Vector3(1, 1, 1) }, uLift: { value: 0 },
      uVignette: { value: 0 }, uGrain: { value: 0 }, uTime: { value: 0 }, uResolution: { value: new THREE.Vector2(1, 1) },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: VERT, depthTest: false, depthWrite: false, blending: THREE.NoBlending,
      fragmentShader: /* glsl */ `
uniform sampler2D tDiffuse; uniform sampler2D tBloom; uniform float uBloom;
uniform float uExposure; uniform float uContrast; uniform float uSaturation; uniform vec3 uTint; uniform float uLift;
uniform float uVignette; uniform float uGrain; uniform float uTime; uniform vec2 uResolution;
varying vec2 vUv;
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main() {
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  if (uBloom > 0.0) c += texture2D(tBloom, vUv).rgb * uBloom;
  c = max(c * uExposure * uTint, vec3(0.0));
  // contrast about middle grey (linear light, before the ACES curve in OutputPass)
  c = 0.18 * pow(c / 0.18, vec3(uContrast));
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uSaturation);
  c += uLift;
  // elliptical vignette, gentle
  vec2 q = vUv * 2.0 - 1.0;
  float v = smoothstep(0.35, 1.25, dot(q, q) * 0.5);
  c *= 1.0 - uVignette * v;
  // fine multiplicative grain (keeps blacks black)
  float g = hash12(gl_FragCoord.xy + vec2(fract(uTime * 7.31) * 173.0, fract(uTime * 3.17) * 91.0)) - 0.5;
  c *= 1.0 + g * 2.0 * uGrain;
  gl_FragColor = vec4(c, 1.0);
}` });
    this.fsQuad = new FullScreenQuad(this.material);
  }
  render(renderer, writeBuffer, readBuffer) {
    this.uniforms.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.fsQuad.render(renderer);
  }
  setSize(w, h) { this.uniforms.uResolution.value.set(w, h); }
  dispose() { this.material.dispose(); this.fsQuad.dispose(); }
}

// ---------------------------------------------------------------- pipeline

export class Pipeline {
  constructor(ctx, particles, opts = {}) {
    this.ctx = ctx; this.renderer = ctx.renderer; this.camera = ctx.camera; this.scene = ctx.scene; this.particles = particles;
    this.log = ctx.log;
    this.enabled = { pipeline: true, ao: true, bloom: true, haze: true, grade: true, vignette: true, grain: true, aa: true, particles: true };
    this.grade = { exposure: 1, contrast: 1.06, saturation: 1.05, warmth: 0.35, lift: 0, vignette: 0.28, grain: 0.02, bloom: 0.18 };
    this.aoParams = { radius: 2.5, intensity: 1.0, scale: 1.2, thickness: 1.0 };
    this.bloomParams = { threshold: 1.0, knee: 0.5, mode: opts.bloomMode || 'mip' };
    this.haze = { strength: 0, near: 120, far: 650, amplitude: 3, height: 18, groundY: 0 };
    this.tint = new THREE.Vector3(1, 1, 1);
    this.failed = {};
    this.quality = ctx.quality || 'high';
    this.aaMode = opts.aa || null;
    this.time = 0;
    this._size = new THREE.Vector2();
    this._white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    this._white.needsUpdate = true;
    this._build();
  }

  get tier() { return TIERS[this.quality] || TIERS.high; }
  get composer() { return this._composer; }

  _pass(name, fn) {
    try { return fn(); } catch (err) { this.failed[name] = String(err?.message || err); this.log.error(`[effects] ${name} pass failed to build, disabled:`, err); return null; }
  }

  _build() {
    this._destroy();
    const r = this.renderer, tier = this.tier;
    const pr = r.getPixelRatio();
    r.getSize(this._size);
    const W = Math.max(2, Math.floor(this._size.x * pr)), H = Math.max(2, Math.floor(this._size.y * pr));
    const samples = Math.min(tier.msaa, r.capabilities.maxSamples || 0);
    const depthTexture = new THREE.DepthTexture(W, H, THREE.FloatType);
    depthTexture.name = 'effects.depth';
    this.sceneRT = new THREE.WebGLRenderTarget(W, H, {
      type: THREE.HalfFloatType, samples, depthTexture, depthBuffer: true, stencilBuffer: false,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false,
    });
    this.sceneRT.texture.name = 'effects.scene';
    const rt1 = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false });
    rt1.texture.name = 'effects.rt1';
    const c = new EffectComposer(r, rt1);
    c.setSize(this._size.x, this._size.y);
    this._composer = c;

    this.scenePass = new ScenePass(this.scene, this.camera, this.sceneRT);
    c.addPass(this.scenePass);
    this.aoPass = tier.ao ? this._pass('ao', () => new AOPass(this.scene, this.camera, W, H, depthTexture, tier.aoScale,
      { radius: this.aoParams.radius, scale: this.aoParams.scale, thickness: this.aoParams.thickness, samples: tier.aoSamples })) : null;
    if (this.aoPass) c.addPass(this.aoPass);
    this.resolvePass = new ResolvePass(this.sceneRT, this.aoPass ? this.aoPass.gtaoMap : this._white, this.camera);
    c.addPass(this.resolvePass);
    this.particlesPass = new ParticlesPass(this.particles, this.camera, this.sceneRT);
    c.addPass(this.particlesPass);
    this.bloomPass = null; this.unrealBloom = null;
    if (tier.bloom) {
      if (this.bloomParams.mode === 'unreal') {
        this.unrealBloom = this._pass('bloom', () => new UnrealBloomPass(new THREE.Vector2(W, H), this.grade.bloom, 0.4, this.bloomParams.threshold));
        if (this.unrealBloom) c.addPass(this.unrealBloom);
      } else {
        this.bloomPass = this._pass('bloom', () => new BloomPass(W, H, { threshold: this.bloomParams.threshold, knee: this.bloomParams.knee }));
        if (this.bloomPass) c.addPass(this.bloomPass);
      }
    }
    this.gradePass = new GradePass(this.bloomPass ? this.bloomPass.texture : this._white);
    c.addPass(this.gradePass);
    const aa = this.aaMode || tier.aa;
    this.aaPass = null;
    if (aa === 'smaa') this.aaPass = this._pass('smaa', () => new SMAAPass());
    else if (aa === 'fxaa') this.aaPass = this._pass('fxaa', () => new FXAAPass());
    if (this.aaPass) c.addPass(this.aaPass);
    this.outputPass = new OutputPass();
    c.addPass(this.outputPass);
    this.msaaSamples = samples;
    this._applyState();
  }

  _destroy() {
    if (!this._composer) return;
    for (const p of this._composer.passes) { try { p.dispose?.(); } catch { /* ignore */ } }
    this._composer.dispose();
    this.sceneRT?.depthTexture?.dispose();
    this.sceneRT?.dispose();
    this._composer = null;
  }

  /** Push enabled flags + parameters into the passes (cheap; called after any setter). */
  _applyState() {
    const e = this.enabled, g = this.grade, tier = this.tier;
    if (this.aoPass) this.aoPass.enabled = e.ao;
    this.resolvePass.uniforms.uAO.value = this.aoPass && e.ao ? this.aoParams.intensity : 0;
    const bloomOn = e.bloom && tier.bloom;
    if (this.bloomPass) this.bloomPass.enabled = bloomOn;
    if (this.unrealBloom) { this.unrealBloom.enabled = bloomOn; this.unrealBloom.strength = g.bloom; this.unrealBloom.threshold = this.bloomParams.threshold; }
    const gu = this.gradePass.uniforms;
    gu.uBloom.value = bloomOn && this.bloomPass ? g.bloom : 0;
    const grade = e.grade;
    gu.uExposure.value = g.exposure;
    gu.uContrast.value = grade ? g.contrast : 1;
    gu.uSaturation.value = grade ? g.saturation : 1;
    gu.uLift.value = grade ? g.lift : 0;
    gu.uVignette.value = grade && e.vignette ? g.vignette : 0;
    gu.uGrain.value = grade && e.grain ? g.grain : 0;
    if (!grade) gu.uTint.value.set(1, 1, 1);
    if (this.aaPass) this.aaPass.enabled = e.aa;
    if (this.bloomPass) { this.bloomPass.uPre.uThreshold.value = this.bloomParams.threshold; this.bloomPass.uPre.uKnee.value = this.bloomParams.knee; }
    if (this.aoPass) this.aoPass.updateGtaoMaterial({ radius: this.aoParams.radius, scale: this.aoParams.scale, thickness: this.aoParams.thickness });
    const ru = this.resolvePass.uniforms, h = this.haze;
    ru.uHazeNear.value = h.near; ru.uHazeFar.value = h.far; ru.uHazeAmp.value = h.amplitude; ru.uHazeHeight.value = h.height;
  }

  // ---------- public ----------

  setEnabled(name, on) {
    if (!(name in this.enabled)) return false;
    this.enabled[name] = !!on;
    if (name === 'particles' && this.particles) this.particles.enabled = !!on;
    this._applyState();
    return true;
  }
  isEnabled(name) { return !!this.enabled[name]; }

  setQuality(q) {
    if (!TIERS[q]) return false;
    this.quality = q;
    this._build();
    return true;
  }

  setAA(mode) { this.aaMode = mode; this._build(); }
  setBloomMode(mode) { this.bloomParams.mode = mode === 'unreal' ? 'unreal' : 'mip'; this._build(); }

  setGrade(g = {}) { Object.assign(this.grade, g); this._applyState(); }
  setAO(o = {}) { Object.assign(this.aoParams, o); this._applyState(); }
  setHazeParams(o = {}) { Object.assign(this.haze, o); this._applyState(); }
  setBloom(o = {}) { Object.assign(this.bloomParams, o); this._applyState(); }

  /** Per-frame inputs from the module: sun colour (linear, unnormalised ok), sun elevation factor, haze strength, ground y. */
  setFrame({ sunColor, sunUp = 1, haze = 0, groundY = 0 }) {
    const e = this.enabled, g = this.grade;
    if (e.grade && sunColor) {
      // warm tint follows the (luminance-normalised) sun colour while the sun is up; cool at night
      const lum = Math.max(1e-3, sunColor.r * 0.2126 + sunColor.g * 0.7152 + sunColor.b * 0.0722);
      const day = Math.min(1, sunUp * 12);
      const w = g.warmth;
      const tr = 1 + (sunColor.r / lum - 1) * w * day, tg = 1 + (sunColor.g / lum - 1) * w * day, tb = 1 + (sunColor.b / lum - 1) * w * day;
      const night = 1 - day;
      this.tint.set(tr * (1 - 0.08 * w * night), tg * (1 - 0.03 * w * night), tb * (1 + 0.12 * w * night));
      this.gradePass.uniforms.uTint.value.copy(this.tint);
    }
    this.resolvePass.uniforms.uHaze.value = e.haze && this.tier.haze ? haze : 0;
    this.resolvePass.uniforms.uGroundY.value = groundY;
  }

  resize(width, height) {
    this._composer.setSize(width, height);
  }

  render(scene, camera, dt) {
    const r = this.renderer;
    if (!this.enabled.pipeline) {
      r.render(scene, camera);
      if (this.particles && this.enabled.particles) this.particles.renderDirect(r, camera);
      return;
    }
    this.time += dt;
    this.resolvePass.uniforms.uTime.value = this.time;
    this.gradePass.uniforms.uTime.value = this.time;
    this._composer.render(dt);
  }

  /** Render once directly and once through the chain; returns draw-call counts for both. */
  measure(scene, camera) {
    const r = this.renderer;
    r.info.reset(); r.render(scene, camera); const direct = r.info.render.calls;
    r.info.reset(); this._composer.render(0); const chain = r.info.render.calls;
    return { direct, pipeline: chain, extra: chain - direct, msaa: this.msaaSamples, quality: this.quality, failed: { ...this.failed } };
  }

  dispose() {
    this._destroy();
    this._white.dispose();
  }
}
