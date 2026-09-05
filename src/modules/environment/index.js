// environment — sun, sky, atmosphere, clouds, weather, time of day, night, exposure, cascaded shadows.
// See README.md for the API. Owns: all lights, scene.background/environment, scene.fog, toneMappingExposure.
import * as THREE from 'three';
import './chunks.js';
import { presets, stage, disposeStage } from './showcase.js';
import {
  ATMOS, SkySampler, sunDirection, moonDirection, moonPhase, moonIllumination, luminance, LATITUDE,
} from './atmosphere.js';
import * as S from './shaders.js';
import { Cascades } from './csm.js';
import { DEG, clamp, lerp, smoothstep } from '../../core/Units.js';

const LUT_W = 512, LUT_H = 256;
const SUN_KEY = 3.6;              // key light intensity at unit transmittance (three physical units, w/ ACES)
const GROUND_ALBEDO = [0.39, 0.30, 0.15]; // linear albedo of the fallback ground (0xa8956a)
const WEATHER_PRESETS = {
  clear: { cloud: 0.18, rain: 0, haze: 0.25 },
  cloudy: { cloud: 0.55, rain: 0, haze: 0.35 },
  overcast: { cloud: 0.92, rain: 0, haze: 0.5 },
  storm: { cloud: 1.0, rain: 0.8, haze: 0.6 },
};

let ctx = null, group = null, world = null;
const R = {}; // runtime objects
const st = {  // lighting state (allocation-free)
  hour: -1, lutHour: -99, pmremHour: -99, lutDirty: true, pmremDirty: true,
  sunDir: new THREE.Vector3(0, 1, 0), moonDir: new THREE.Vector3(0, -1, 0), keyDir: new THREE.Vector3(0, 1, 0),
  sunEl: 0, moonEl: 0, phase: 0.6, illum: 1, night: 0, turbidity: 1.2, moonE: 0,
  keyColor: new THREE.Color(), keyIntensity: 0, sunColor: new THREE.Color(), sunIntensity: 0,
  zenith: new THREE.Color(), horizon: new THREE.Color(), ambientLum: 0,
  exposureTarget: 1, exposure: 1, exposureBias: 1, isMoonKey: false,
  weather: { cloud: 0.2, rain: 0, haze: 0.3, storm: 0 },     // smoothed (rendered) values
  weatherTarget: { cloud: 0.2, rain: 0, haze: 0.3 },
  lutTurb: -1, lutMoonE: -1,
  celestialAngle: 0,
};
const sampler = new SkySampler();
const _c = new THREE.Color();
const _v = new THREE.Vector3();
const _m4 = new THREE.Matrix4();
const _pole = new THREE.Vector3(0, Math.sin(LATITUDE), -Math.cos(LATITUDE)).normalize();

// ---------------------------------------------------------------- setup helpers

function makeTextures() {
  const T = ctx.textures;
  R.nightTex = T.gpu(S.NIGHT_TEX_GLSL, { key: 'env:night', width: 2048, height: 1024, type: THREE.HalfFloatType, mipmaps: true, seed: 3 });
  R.nightTex.wrapS = THREE.RepeatWrapping; R.nightTex.wrapT = THREE.ClampToEdgeWrapping;
  R.moonTex = T.gpu(S.MOON_TEX_GLSL, { key: 'env:moon', width: 512, height: 256, mipmaps: true, seed: 5 });
  R.cloudNoise = T.gpu(S.CLOUD_NOISE_GLSL, { key: 'env:cloudnoise', size: 1024, mipmaps: true, seed: 11, anisotropy: 4 });
}

function makeLut() {
  R.lutRT = new THREE.WebGLRenderTarget(LUT_W, LUT_H, {
    type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false, generateMipmaps: false,
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.RepeatWrapping, wrapT: THREE.ClampToEdgeWrapping,
    colorSpace: THREE.NoColorSpace,
  });
  R.lutRT.texture.name = 'env:skylut';
  R.lutMat = new THREE.ShaderMaterial({
    vertexShader: S.LUT_VERT, fragmentShader: S.LUT_FRAG, depthTest: false, depthWrite: false,
    uniforms: {
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
      uSunE: { value: ATMOS.sunE }, uMoonE: { value: 0 }, uTurbidity: { value: 1.2 }, uG: { value: ATMOS.g },
    },
  });
  R.lutScene = new THREE.Scene();
  R.lutCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), R.lutMat);
  quad.frustumCulled = false;
  R.lutScene.add(quad);
  R.lutQuad = quad;
}

function renderLut() {
  const r = ctx.renderer;
  const u = R.lutMat.uniforms;
  u.uSunDir.value.copy(st.sunDir); u.uMoonDir.value.copy(st.moonDir);
  u.uMoonE.value = st.moonE; u.uTurbidity.value = st.turbidity; u.uG.value = lerp(0.76, 0.84, clamp(st.weather.haze, 0, 1));
  const prevRT = r.getRenderTarget(); const prevXr = r.xr.enabled; r.xr.enabled = false;
  const prevAuto = r.autoClear; r.autoClear = true;
  r.setRenderTarget(R.lutRT); r.render(R.lutScene, R.lutCam); r.setRenderTarget(prevRT);
  r.xr.enabled = prevXr; r.autoClear = prevAuto;
  st.lutHour = st.hour; st.lutTurb = st.turbidity; st.lutMoonE = st.moonE; st.lutDirty = false;
}

function makeSky() {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  R.skyMat = new THREE.ShaderMaterial({
    vertexShader: S.SKY_VERT, fragmentShader: S.SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      uLut: { value: R.lutRT.texture }, uNight: { value: R.nightTex }, uMoonTex: { value: R.moonTex },
      uSunDir: { value: st.sunDir }, uMoonDir: { value: st.moonDir },
      uSunDisc: { value: new THREE.Vector3() }, uMoonColor: { value: new THREE.Vector3() },
      uSunDiscOn: { value: 1 }, uNightAmount: { value: 0 }, uStarScale: { value: 0.035 }, uCelestial: { value: new THREE.Matrix3() },
      uGroundLit: { value: new THREE.Vector3() }, uHorizon: { value: new THREE.Vector3() }, uCloudDim: { value: 1 }, uCamHeight: { value: 100 },
    },
  });
  R.sky = new THREE.Mesh(geo, R.skyMat);
  R.sky.name = 'sky'; R.sky.scale.setScalar(100); R.sky.frustumCulled = false; R.sky.renderOrder = -1000;
  group.add(R.sky);

  R.cloudMat = new THREE.ShaderMaterial({
    vertexShader: S.SKY_VERT, fragmentShader: S.CLOUD_FRAG, side: THREE.BackSide, depthWrite: false, transparent: true, fog: false,
    uniforms: {
      uNoise: { value: R.cloudNoise }, uSunDir: { value: st.sunDir },
      uSunLight: { value: new THREE.Vector3() }, uSunHigh: { value: new THREE.Vector3() }, uAmbient: { value: new THREE.Vector3() }, uHorizon: { value: new THREE.Vector3() },
      uCoverage: { value: 0.2 }, uCirrus: { value: 0.3 }, uStorm: { value: 0 }, uTime: { value: 0 }, uWind: { value: new THREE.Vector2(1, 0.2) },
      uCamHeight: { value: 100 }, uMoonBoost: { value: 0 },
    },
  });
  R.clouds = new THREE.Mesh(geo, R.cloudMat);
  R.clouds.name = 'clouds'; R.clouds.scale.setScalar(100); R.clouds.frustumCulled = false; R.clouds.renderOrder = -900;
  group.add(R.clouds);
  R.skyGeo = geo;
}

function makeStars() {
  const rng = ctx.rng.fork('stars');
  const N = 1400;
  const pos = new Float32Array(N * 3), size = new Float32Array(N), col = new Float32Array(N * 3), tw = new Float32Array(N);
  const gn = new THREE.Vector3(0.82, 0.5, 0.27).normalize();
  const e1 = new THREE.Vector3().crossVectors(gn, new THREE.Vector3(0, 0, 1)).normalize();
  const e2 = new THREE.Vector3().crossVectors(gn, e1);
  const RADIUS = 2500;
  for (let i = 0; i < N; i++) {
    let d;
    if (rng.bool(0.45)) { // galactic band member
      const l = rng.range(-Math.PI, Math.PI), b = rng.gaussian(0, 0.22);
      d = new THREE.Vector3().addScaledVector(e1, Math.cos(l) * Math.cos(b)).addScaledVector(e2, Math.sin(l) * Math.cos(b)).addScaledVector(gn, Math.sin(b));
    } else {
      const z = rng.range(-1, 1), a = rng.range(0, Math.PI * 2), r = Math.sqrt(1 - z * z);
      d = new THREE.Vector3(r * Math.cos(a), z, r * Math.sin(a));
    }
    d.normalize().multiplyScalar(RADIUS);
    pos[i * 3] = d.x; pos[i * 3 + 1] = d.y; pos[i * 3 + 2] = d.z;
    const m = Math.pow(rng.float(), 4.5); // magnitude (0 faint .. 1 brightest)
    size[i] = 1.6 + 4.2 * m;
    const t = rng.float();
    const cr = lerp(1.0, 0.7, t), cg = lerp(0.72, 0.82, t), cb = lerp(0.5, 1.0, t);
    const br = 0.25 + 2.5 * m;
    col[i * 3] = cr * br; col[i * 3 + 1] = cg * br; col[i * 3 + 2] = cb * br;
    tw[i] = rng.float();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aTwinkle', new THREE.BufferAttribute(tw, 1));
  R.starMat = new THREE.ShaderMaterial({
    vertexShader: S.STAR_VERT, fragmentShader: S.STAR_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uTime: { value: 0 }, uPixelRatio: { value: ctx.renderer.getPixelRatio() }, uAmount: { value: 0 }, uScale: { value: 0.045 } },
  });
  R.stars = new THREE.Points(g, R.starMat);
  R.stars.name = 'stars'; R.stars.frustumCulled = false; R.stars.renderOrder = -950; R.stars.visible = false;
  group.add(R.stars);
}

function makeRain() {
  const rng = ctx.rng.fork('rain');
  const N = 2600;
  const off = new Float32Array(N * 4 * 3), corner = new Float32Array(N * 4 * 2), seed = new Float32Array(N * 4);
  const idx = new Uint32Array(N * 6);
  const C = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
  for (let i = 0; i < N; i++) {
    const ox = rng.float(), oy = rng.float(), oz = rng.float(), s = rng.float();
    for (let k = 0; k < 4; k++) {
      const v = i * 4 + k;
      off[v * 3] = ox; off[v * 3 + 1] = oy; off[v * 3 + 2] = oz;
      corner[v * 2] = C[k][0]; corner[v * 2 + 1] = C[k][1];
      seed[v] = s;
    }
    idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 4 * 3), 3)); // unused, keeps three happy
  g.setAttribute('aOffset', new THREE.BufferAttribute(off, 3));
  g.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  R.rainMat = new THREE.ShaderMaterial({
    vertexShader: S.RAIN_VERT, fragmentShader: S.RAIN_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
    uniforms: {
      uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uVolume: { value: new THREE.Vector3(70, 45, 70) },
      uFall: { value: new THREE.Vector3(0.1, -1, 0.02) }, uIntensity: { value: 0 }, uColor: { value: new THREE.Vector3(0.6, 0.65, 0.7) },
    },
  });
  R.rain = new THREE.Mesh(g, R.rainMat);
  R.rain.name = 'rain'; R.rain.frustumCulled = false; R.rain.renderOrder = 500; R.rain.visible = false;
  group.add(R.rain);
}

function makePmrem() {
  R.pmrem = new THREE.PMREMGenerator(ctx.renderer);
  R.pmrem.compileEquirectangularShader();
  R.envScene = new THREE.Scene();
  const sky2 = new THREE.Mesh(R.skyGeo, R.skyMat); sky2.scale.setScalar(100); sky2.frustumCulled = false; sky2.renderOrder = -1000;
  const cl2 = new THREE.Mesh(R.skyGeo, R.cloudMat); cl2.scale.setScalar(100); cl2.frustumCulled = false; cl2.renderOrder = -900;
  R.envScene.add(sky2, cl2);
}

function renderPmrem() {
  const prevDisc = R.skyMat.uniforms.uSunDiscOn.value;
  R.skyMat.uniforms.uSunDiscOn.value = 0;
  const prevTM = ctx.renderer.toneMapping;
  let rt = null;
  try {
    rt = R.pmrem.fromScene(R.envScene, 0.02, 1, 1000, { size: 128 });
  } finally {
    R.skyMat.uniforms.uSunDiscOn.value = prevDisc;
    ctx.renderer.toneMapping = prevTM;
  }
  if (!rt) return;
  const old = R.envRT;
  R.envRT = rt;
  rt.texture.name = 'env:pmrem';
  ctx.scene.environment = rt.texture;
  ctx.materials.setEnvMap(rt.texture, 1);
  if (old) old.dispose();
  st.pmremHour = st.hour; st.pmremDirty = false;
}

// ---------------------------------------------------------------- lighting

const _sT = [0, 0, 0];
function computeLighting() {
  const T = world.time, W = st.weather;
  st.hour = T.hour;
  const season = world.weather.season || 'dry';
  sunDirection(T.hour, season, st.sunDir);
  moonDirection(T.hour, T.day, season, st.moonDir);
  st.phase = moonPhase(T.day);
  st.illum = moonIllumination(st.phase);
  st.sunEl = Math.asin(clamp(st.sunDir.y, -1, 1));
  st.moonEl = Math.asin(clamp(st.moonDir.y, -1, 1));
  st.night = smoothstep(-1.5 * DEG, -11 * DEG, -st.sunEl) * 0 + smoothstep(1.5 * DEG, 11 * DEG, -st.sunEl);
  st.turbidity = 1.1 + W.haze * 2.6 + W.cloud * 0.9 + W.rain * 2.0;
  st.moonE = ATMOS.sunE * ATMOS.moonRatio * Math.pow(st.illum, 1.5);

  sampler.update({ sunDir: st.sunDir, moonDir: st.moonDir, moonE: st.moonE, turbidity: st.turbidity });
  const sunT = sampler.sunT, moonT = sampler.moonT;

  // cloud attenuation: overcast → 15 % direct, storm → 6 %
  const cloudAtten = 1 - 0.85 * Math.pow(W.cloud, 1.6) - 0.09 * W.rain;
  st.sunColor.setRGB(sunT[0], sunT[1], sunT[2]);
  st.sunIntensity = SUN_KEY * cloudAtten * (st.sunDir.y > 0 ? 1 : 0);
  const sunKeyLum = st.sunIntensity * luminance(sunT) * Math.max(0, st.sunDir.y);
  // moon: blue-grey (Purkinje) tint
  const moonI = SUN_KEY * ATMOS.moonRatio * Math.pow(st.illum, 1.5) * cloudAtten * (st.moonDir.y > 0 ? 1 : 0);
  const moonKeyLum = moonI * luminance(moonT) * Math.max(0, st.moonDir.y);
  st.isMoonKey = moonKeyLum > sunKeyLum;
  if (st.isMoonKey) {
    st.keyDir.copy(st.moonDir);
    st.keyColor.setRGB(moonT[0] * 0.78, moonT[1] * 0.86, moonT[2] * 1.0);
    st.keyIntensity = moonI;
  } else {
    st.keyDir.copy(st.sunDir);
    st.keyColor.copy(st.sunColor);
    st.keyIntensity = st.sunIntensity;
  }
  // sky colours
  const z = sampler.zenith, h = sampler.horizon;
  const overcastMix = Math.pow(W.cloud, 2) * 0.75;
  st.zenith.setRGB(z[0], z[1], z[2]);
  st.horizon.setRGB(h[0], h[1], h[2]);
  // overcast: sky ambient goes grey and a bit brighter than clear-blue zenith
  const zl = luminance(z), hl = luminance(h);
  st.zenith.lerp(_c.setRGB(hl * 0.9, hl * 0.9, hl * 0.92), overcastMix);
  st.horizon.lerp(_c.setRGB(hl * 0.85, hl * 0.85, hl * 0.86), overcastMix * 0.6);
  st.ambientLum = Math.PI * (luminance([st.zenith.r, st.zenith.g, st.zenith.b]) * 0.5 + luminance([st.horizon.r, st.horizon.g, st.horizon.b]) * 0.5);

  // key light
  const dirLight = R.csm;
  dirLight.setColor(st.keyColor, st.keyIntensity);
  dirLight.direction.copy(st.keyDir).multiplyScalar(-1);

  // exposure from the scene key (partial adaptation, so noon stays bright and night stays dark-but-readable)
  const keyLum = st.keyIntensity * luminance([st.keyColor.r, st.keyColor.g, st.keyColor.b]) * Math.max(0, st.keyDir.y);
  const L = 0.18 * (keyLum + st.ambientLum) + 1e-5;
  // Ceiling was 60. As the sun drops toward the horizon L shrinks fast (Math.max(0, keyDir.y) kills
  // the key term well before the sky actually looks dim), so 0.62/L^0.62 was hitting extreme values
  // long before true night: measured 5.46 at golden hour (tod 17.5) and 60 at tod 21.5, both while
  // the scene was still meant to be readably lit — every material several-fold overexposed (verified
  // by reading back a lion's baked albedo directly: correct ~0.38 linear on the texture, near-white
  // on screen). Lowered to keep sunlit/golden-hour scenes from blowing out.
  //
  // A single ceiling cannot serve both regimes: golden hour's natural (pre-clamp) value was 5.46,
  // so any ceiling ≥ 4 leaves it overexposed, but true night's natural value was 60 — measured with
  // the animals module's own ground-level showcase (tools/shots/animals-night-r4.png) after this same
  // ceiling of 4 landed the scene essentially unlit black, because moonRatio's absolute light level
  // (atmosphere.js, "boosted for readability" from the physical value but still tiny) leans entirely
  // on a large exposure multiplier to become visible at all. `isMoonKey` (set just above) is true only
  // when the moon is genuinely the dominant light — i.e. real night, not merely a low sun — so it is
  // the right gate for a separate, higher night ceiling without reopening the golden-hour overexposure.
  // 12 is a first correction, not a tuned value: still needs a pass against real night-photo references.
  const ceiling = st.isMoonKey ? 12 : 4;
  st.exposureTarget = clamp(0.62 / Math.pow(L, 0.62), 0.55, ceiling) * st.exposureBias;

  // fog: horizon-tinted, denser with haze/cloud/rain and at golden hour (dust)
  const goldenHaze = smoothstep(28 * DEG, 4 * DEG, Math.abs(st.sunEl)) * 0.5;
  const fogDensity = 0.00016 * (1 + 1.6 * W.haze + goldenHaze + 1.2 * W.cloud + 3.0 * W.rain);
  const fog = ctx.scene.fog;
  fog.color.copy(st.horizon);
  fog.density = fogDensity;

  // sky uniforms
  const su = R.skyMat.uniforms;
  const discScale = 24 * cloudAtten + 2;
  su.uSunDisc.value.set(sunT[0] * discScale, sunT[1] * discScale, sunT[2] * discScale);
  const moonDisc = 0.9 * (0.3 + 0.7 * cloudAtten);
  su.uMoonColor.value.set(moonT[0] * moonDisc, moonT[1] * moonDisc, moonT[2] * moonDisc);
  su.uNightAmount.value = st.night * (1 - 0.7 * W.cloud);
  su.uCloudDim.value = 1 - 0.85 * W.cloud;
  const ambE = st.ambientLum; // scalar irradiance proxy; colour from zenith
  const zc = st.zenith, zlum = Math.max(1e-6, luminance([zc.r, zc.g, zc.b]));
  const keyCos = Math.max(0, st.keyDir.y);
  su.uGroundLit.value.set(
    GROUND_ALBEDO[0] * (st.keyColor.r * st.keyIntensity * keyCos + ambE * zc.r / zlum * 0.9) / Math.PI,
    GROUND_ALBEDO[1] * (st.keyColor.g * st.keyIntensity * keyCos + ambE * zc.g / zlum * 0.9) / Math.PI,
    GROUND_ALBEDO[2] * (st.keyColor.b * st.keyIntensity * keyCos + ambE * zc.b / zlum * 0.9) / Math.PI);
  su.uHorizon.value.set(st.horizon.r, st.horizon.g, st.horizon.b);

  // clouds
  const cu = R.cloudMat.uniforms;
  const sh = sampler.sunTHigh;
  const sunOn = smoothstep(-6 * DEG, 2 * DEG, st.sunEl);
  const cloudSunScale = 0.85;
  cu.uSunLight.value.set(sunT[0], sunT[1], sunT[2]).multiplyScalar(cloudSunScale * sunOn);
  // high clouds keep the sun after ground sunset: use transmittance at 8 km, faded by elevation of the terminator
  const highOn = smoothstep(-9 * DEG, 0.5 * DEG, st.sunEl);
  cu.uSunHigh.value.set(sh[0], sh[1], sh[2]).multiplyScalar(cloudSunScale * highOn);
  cu.uAmbient.value.set(st.zenith.r, st.zenith.g, st.zenith.b).multiplyScalar(1.3);
  cu.uHorizon.value.set(st.horizon.r, st.horizon.g, st.horizon.b);
  if (st.isMoonKey || st.sunEl < -6 * DEG) {
    // moonlit clouds: add the moon as the cloud light (blue-grey)
    cu.uSunLight.value.set(moonT[0] * 0.78, moonT[1] * 0.86, moonT[2]).multiplyScalar(0.7 * ATMOS.moonRatio * Math.pow(st.illum, 1.5) * (st.moonDir.y > 0 ? 1 : 0) * 25);
  }
  cu.uCoverage.value = W.cloud;
  cu.uCirrus.value = clamp(0.12 + W.cloud * 0.7 - W.rain * 0.4, 0, 0.55) * (1 - Math.pow(W.cloud, 4));
  cu.uStorm.value = clamp(W.rain * 1.2, 0, 1);

  // stars
  R.starMat.uniforms.uAmount.value = su.uNightAmount.value;
  R.stars.visible = su.uNightAmount.value > 0.01;
  // rain
  R.rainMat.uniforms.uIntensity.value = W.rain;
  R.rain.visible = W.rain > 0.02;
  R.rainMat.uniforms.uColor.value.set(st.horizon.r, st.horizon.g, st.horizon.b).multiplyScalar(1.4).addScalar(0.02);

  // LUT / PMREM refresh policy
  const twilight = Math.abs(st.sunEl) < 12 * DEG;
  if (st.lutDirty || Math.abs(st.hour - st.lutHour) > (twilight ? 0.012 : 0.03) || Math.abs(st.turbidity - st.lutTurb) > 0.05 || Math.abs(st.moonE - st.lutMoonE) > 1e-4) renderLut();
  if (st.pmremDirty || Math.abs(st.hour - st.pmremHour) > (twilight ? 0.06 : 0.2)) renderPmrem();
}

function updateCelestial() {
  st.celestialAngle = -(world.time.hour / 24) * Math.PI * 2 + 1.9;
  _m4.makeRotationAxis(_pole, st.celestialAngle);
  R.skyMat.uniforms.uCelestial.value.setFromMatrix4(_m4);
  R.stars.quaternion.setFromAxisAngle(_pole, -st.celestialAngle);
}

// ---------------------------------------------------------------- weather

function applyWeatherTarget(partial, immediate = false) {
  const w = world.weather;
  if (partial.cloud !== undefined) w.cloud = clamp(partial.cloud, 0, 1);
  if (partial.rain !== undefined) w.rain = clamp(partial.rain, 0, 1);
  if (partial.haze !== undefined) w.haze = clamp(partial.haze, 0, 1);
  if (partial.season !== undefined) w.season = partial.season === 'wet' ? 'wet' : 'dry';
  if (partial.temperature !== undefined) w.temperature = partial.temperature;
  if (partial.wind) {
    if (partial.wind.x !== undefined) w.wind.x = partial.wind.x;
    if (partial.wind.z !== undefined) w.wind.z = partial.wind.z;
    if (partial.wind.speed !== undefined) w.wind.speed = partial.wind.speed;
  }
  if (w.rain > 0) w.cloud = Math.max(w.cloud, 0.6 + 0.4 * w.rain);
  st.weatherTarget.cloud = w.cloud; st.weatherTarget.rain = w.rain; st.weatherTarget.haze = w.haze;
  if (immediate) { Object.assign(st.weather, st.weatherTarget); }
  st.lutDirty = true; st.pmremDirty = true;
}

function emitWeather() {
  const w = world.weather;
  ctx.events.emit('weather:changed', { cloud: w.cloud, rain: w.rain, wind: w.wind, season: w.season, haze: w.haze, temperature: w.temperature });
}

// ---------------------------------------------------------------- module

const api = {
  /** Unit vector toward the sun (even below the horizon). */
  getSunDirection(out = new THREE.Vector3()) { return out.copy(st.sunDir); },
  /** Unit vector toward the moon. */
  getMoonDirection(out = new THREE.Vector3()) { return out.copy(st.moonDir); },
  /** Direction toward the current key light (sun by day, moon by night). */
  getKeyDirection(out = new THREE.Vector3()) { return out.copy(st.keyDir); },
  /** Linear RGB colour (0..1) of sunlight after atmospheric transmittance. */
  getSunColor(out = new THREE.Color()) { return out.copy(st.sunColor); },
  /** Key light intensity (three physical units), 0 at night when the moon is down. */
  getSunIntensity() { return st.keyIntensity; },
  /** Zenith sky colour, linear RGB radiance. */
  getSkyColor(out = new THREE.Color()) { return out.copy(st.zenith); },
  /** Horizon (fog) colour, linear RGB radiance. */
  getHorizonColor(out = new THREE.Color()) { return out.copy(st.horizon); },
  /** PMREM environment texture (also on scene.environment). */
  getEnvMap() { return R.envRT ? R.envRT.texture : null; },
  /** The shadow-casting key light (cascade 0) and all cascades. */
  getKeyLight() { return R.csm ? R.csm.key : null; },
  getCascades() { return R.csm ? R.csm.lights : []; },
  /** Sun elevation in radians (negative below horizon). */
  getSunElevation() { return st.sunEl; },
  /** Moon phase 0..1 (0 new, 0.5 full) and illuminated fraction. */
  getMoonPhase() { return st.phase; },
  getMoonIllumination() { return st.illum; },
  /** True from civil dusk to civil dawn (sun below -6°). */
  isNight() { return st.sunEl < -6 * DEG; },
  /** 0 by day → 1 at full night. */
  getNightAmount() { return st.night; },
  /** Current tone-mapping exposure. */
  getExposure() { return st.exposure; },
  /** Multiplier on the automatic exposure (effects/ui may use it). */
  setExposureBias(v) { st.exposureBias = clamp(v, 0.1, 10); },
  /** Merge into world.weather ({cloud, rain, haze, wind:{x,z,speed}, season, temperature}) and emit weather:changed. */
  setWeather(partial = {}, { immediate = false } = {}) {
    applyWeatherTarget(partial, immediate);
    if (R.csm) computeLighting();
    emitWeather();
    return world.weather;
  },
  /** Apply a named preset: clear | cloudy | overcast | storm. */
  setWeatherPreset(name, opts) { return api.setWeather(WEATHER_PRESETS[name] || WEATHER_PRESETS.clear, opts); },
  getWeather() { return world.weather; },
  /** Albedo (linear RGB) of the distant plain drawn below the horizon; terrain may match its average colour. */
  setHorizonGround(r, g, b) { GROUND_ALBEDO[0] = r; GROUND_ALBEDO[1] = g; GROUND_ALBEDO[2] = b; if (R.csm) computeLighting(); },
  /** Force LUT + PMREM regeneration on the next frame. */
  refresh() { st.lutDirty = true; st.pmremDirty = true; },
  /** Debug/perf toggles: { sky, clouds, stars, rain, shadows } booleans. */
  setDebug(flags = {}) {
    if (flags.sky !== undefined) R.sky.visible = !!flags.sky;
    if (flags.clouds !== undefined) R.clouds.visible = !!flags.clouds;
    if (flags.stars !== undefined) R.stars.visible = !!flags.stars;
    if (flags.rain !== undefined) R.rain.visible = !!flags.rain;
    if (flags.shadows !== undefined) for (const l of R.csm.lights) l.castShadow = !!flags.shadows;
    st.debugFlags = flags;
  },
  /** Snapshot of the lighting state for debugging / critics. */
  getState() {
    return {
      hour: st.hour, sunElevationDeg: st.sunEl / DEG, sunAzimuthDeg: Math.atan2(st.sunDir.x, -st.sunDir.z) / DEG,
      moonElevationDeg: st.moonEl / DEG, moonPhase: st.phase, moonIllumination: st.illum, night: st.night, keyIsMoon: st.isMoonKey,
      keyIntensity: st.keyIntensity, keyColor: [st.keyColor.r, st.keyColor.g, st.keyColor.b],
      exposure: st.exposure, turbidity: st.turbidity, fogDensity: ctx?.scene.fog?.density,
      weather: { ...st.weather }, cascadeRadii: R.csm ? R.csm.radii.slice() : [], cascadeSplits: R.csm ? R.csm.splits.slice() : [],
    };
  },
};

export default {
  id: 'environment',
  version: 1,
  dependencies: [],
  optional: [],
  api,

  async init(c) {
    ctx = c; world = c.world;
    group = new THREE.Group(); group.name = 'environment';
    ctx.scene.add(group);
    ctx.scene.background = null;
    ctx.scene.fog = new THREE.FogExp2(0x9fb4cc, 0.0002);

    try {
      makeTextures();
      makeLut();
      makeSky();
      makeStars();
      makeRain();
      makePmrem();
      R.csm = new Cascades(ctx.camera, group, { cascades: ctx.quality === 'low' ? 2 : 3, mapSize: ctx.quality === 'low' ? 1024 : 2048 });
    } catch (err) {
      ctx.log.error('environment init failed', err);
      return;
    }

    // initial weather: world defaults, optionally overridden by ?weather=
    const preset = ctx.params?.weather && WEATHER_PRESETS[ctx.params.weather];
    applyWeatherTarget(preset || {}, true);

    ctx.events.on('time:set', () => {
      st.lutDirty = true; st.pmremDirty = true;
      computeLighting();
      st.exposure = st.exposureTarget;
      updateCelestial();
    });

    computeLighting();
    st.exposure = st.exposureTarget;
    ctx.renderer.toneMappingExposure = st.exposure;
    updateCelestial();
    ctx.log.info(`environment ready: sun el ${(st.sunEl / DEG).toFixed(1)}°, exposure ${st.exposure.toFixed(2)}`);
  },

  update(dt, t) {
    if (!R.csm) return;
    const W = st.weather, WT = st.weatherTarget;
    // weather eases over ~6 s
    const k = 1 - Math.exp(-dt * 0.6);
    let wChanged = false;
    for (const key of ['cloud', 'rain', 'haze']) {
      const d = WT[key] - W[key];
      if (Math.abs(d) > 1e-4) { W[key] += d * k; wChanged = true; }
    }
    if (Math.abs(world.time.hour - st.hour) > 1e-6 || wChanged) computeLighting();

    // exposure adaptation (~1 s)
    st.exposure += (st.exposureTarget - st.exposure) * (1 - Math.exp(-dt * 2.5));
    ctx.renderer.toneMappingExposure = st.exposure;

    // follow the camera
    const cam = ctx.camera;
    R.sky.position.copy(cam.position);
    R.clouds.position.copy(cam.position);
    R.stars.position.copy(cam.position);
    R.skyMat.uniforms.uCamHeight.value = Math.max(2, cam.position.y - world.getHeight(cam.position.x, cam.position.z));
    R.cloudMat.uniforms.uCamHeight.value = cam.position.y;
    R.cloudMat.uniforms.uTime.value = t;
    const wind = world.weather.wind;
    const ws = (wind.speed ?? 3);
    R.cloudMat.uniforms.uWind.value.set(wind.x, wind.z).normalize().multiplyScalar(ws * 0.6 + 0.4);
    R.starMat.uniforms.uTime.value = t;
    if (!world.time.paused) updateCelestial();

    if (R.rain.visible) {
      const ru = R.rainMat.uniforms;
      ru.uTime.value = t;
      cam.getWorldDirection(_v);
      ru.uCenter.value.copy(cam.position).addScaledVector(_v, 22);
      ru.uCenter.value.y = Math.min(ru.uCenter.value.y, cam.position.y);
      ru.uFall.value.set(wind.x * ws * 0.03, -1, wind.z * ws * 0.03);
    }

    // cascades
    R.csm.setViewDistance(ctx.rig ? ctx.rig.distance : 300);
    R.csm.update();
  },

  tick(simDt) {
    if (!world) return;
    // diurnal temperature model (dry season savannah): 17 °C before dawn, 33 °C mid-afternoon
    const h = world.time.hour, w = world.weather;
    const diurnal = Math.cos(((h - 15) / 24) * Math.PI * 2) * 0.5 + 0.5;
    const base = w.season === 'wet' ? 21 : 17;
    const target = base + diurnal * 16 - w.cloud * 4 - w.rain * 5;
    const prev = w.temperature;
    w.temperature = prev + (target - prev) * Math.min(1, simDt * 2);
    if (Math.abs(Math.round(w.temperature) - Math.round(prev)) >= 1) emitWeather();
  },

  dispose() {
    disposeStage();
    if (ctx?.events) { /* listeners are removed by the registry via offOwner */ }
    R.csm?.dispose();
    R.envRT?.dispose(); R.pmrem?.dispose();
    R.lutRT?.dispose(); R.lutMat?.dispose(); R.lutQuad?.geometry.dispose();
    R.skyMat?.dispose(); R.cloudMat?.dispose(); R.starMat?.dispose(); R.rainMat?.dispose();
    R.skyGeo?.dispose(); R.stars?.geometry.dispose(); R.rain?.geometry.dispose();
    ctx?.textures.dispose('env:night'); ctx?.textures.dispose('env:moon'); ctx?.textures.dispose('env:cloudnoise');
    if (ctx) { ctx.scene.environment = null; ctx.scene.fog = null; ctx.scene.background = new THREE.Color(0x87a8c8); ctx.renderer.toneMappingExposure = 1; }
    group?.removeFromParent();
    for (const k of Object.keys(R)) delete R[k];
    ctx = null; world = null; group = null;
  },

  showcase: { presets, stage },
};
