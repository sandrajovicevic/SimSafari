// Terrain splat material: MeshStandardMaterial + onBeforeCompile (keeps three's lights, shadows, fog, envMap).
// Layers come from two DataArrayTextures (see textures.js); per-sample control from three 513² data textures:
//   tCtl0 = (grass, dryGrass, dirt, rock) weights, tCtl1 = (sand, wetland, riverbed, roadDust) weights,
//   tAux  = (moisture, wetness, macro variation, 1).
// Techniques: two-scale UV blending (uScaleA / uScaleB metres), height-based layer blending, slope-driven rock,
// FULL TRIPLANAR on every layer above ~25° (fully triplanar past ~60°) so cliff faces never get stretched texels,
// an orthonormal tangent frame built from the world normal (valid at N.y == 0, unlike the old XZ-biased blend),
// macro colour variation, moisture greening, wet darkening near water, road-dust tint, ACES saturation compensation.
import * as THREE from 'three';
import { GLSL_NOISE } from '../../core/Textures.js';

const L = 6;

function splatGLSL() {
  let s = /* glsl */ `
vec3 tAlbedo; float tRough; float tAo; vec3 tNormalW;
{
  vec3 N = normalize(vWNormal);
  vec2 wxz = vWPos.xz;
  // Biome weights live on a 2 m control grid, so a linear fetch gives a hard 2 m boundary.
  // Warping the lookup with two octaves of noise turns every boundary into organic fingers
  // at 4-30 m without touching the CPU-side classification.
  vec2 warp = vec2(snoise(wxz * 0.037 + 3.1), snoise(wxz * 0.037 + 11.7)) * uWarpA
            + vec2(snoise(wxz * 0.17 + 5.3), snoise(wxz * 0.17 + 19.1)) * uWarpB
            + vec2(snoise(wxz * 0.63 + 1.9), snoise(wxz * 0.63 + 7.5)) * uWarpC;
  vec2 cuv = clamp(((wxz + warp + uHalf) * uInvCell + 0.5) * uInvRes, 0.0, 1.0);
  vec4 c0 = texture2D(tCtl0, cuv); vec4 c1 = texture2D(tCtl1, cuv); vec4 aux = texture2D(tAux, cuv);
  float moist = aux.r; float wet = aux.g; float macro = aux.b;
  float camD = distance(vWPos, cameraPosition);
  float slope = 1.0 - N.y;
  float m2 = snoise(wxz * 0.021) * 0.5 + 0.5;
  float m3 = snoise(wxz * 0.083 + 7.0) * 0.5 + 0.5;
  // triplanar ramp: 0 below ~25°, 0.5 at ~40°, 1 past ~60°
  float tri = smoothstep(0.09, 0.50, slope + 0.06 * (m3 - 0.5));
  vec3 bw = abs(N); bw = bw * bw; bw /= max(bw.x + bw.y + bw.z, 1e-4);
  float wRockS = smoothstep(0.10, 0.34, slope + 0.05 * (m3 - 0.5));
  // slope-dirt is a plains effect only: on rock (kopjes, cliff) it used to draw an orange laterite
  // outline around every block edge, which read as piping. c0.a is the rock control weight.
  float wDirtS = smoothstep(0.05, 0.16, slope) * (1.0 - wRockS) * (1.0 - c0.a);
  float keep = 1.0 - max(wRockS, wDirtS);
  float w[${L}];
  w[0] = c0.r * keep; w[1] = c0.g * keep; w[2] = (c0.b + c1.a) * keep + wDirtS;
  w[3] = c0.a * keep + wRockS; w[4] = (c1.r + c1.b) * keep; w[5] = c1.g * keep;
  float wsum = w[0] + w[1] + w[2] + w[3] + w[4] + w[5] + 1e-5;
  ${Array.from({ length: L }, (_, i) => `w[${i}] /= wsum;`).join(' ')}
  vec2 uvA = wxz * uInvScaleA; vec2 uvB = wxz * uInvScaleB;
  float mb = 0.5 + 0.2 * (m2 - 0.5);
  vec4 A[${L}]; vec4 Bn[${L}];
`;
  for (let i = 0; i < L; i++) {
    s += `
  if (w[${i}] > 0.004) sampleLayer(${i}.0, tri, uvA, uvB, bw, vWPos, mb, A[${i}], Bn[${i}]);
  else { A[${i}] = vec4(0.0); Bn[${i}] = vec4(0.5, 0.5, 1.0, 1.0); }`;
  }
  s += /* glsl */ `
  // height-based blend
  float hh[${L}]; float ma = 0.0;
  ${Array.from({ length: L }, (_, i) => `hh[${i}] = A[${i}].a * 0.9 + w[${i}]; ma = max(ma, hh[${i}]);`).join('\n  ')}
  float b[${L}]; float bs = 0.0;
  ${Array.from({ length: L }, (_, i) => `b[${i}] = max(hh[${i}] - ma + uBlendDepth, 0.0) * step(0.004, w[${i}]); bs += b[${i}];`).join('\n  ')}
  bs = max(bs, 1e-4);
  ${Array.from({ length: L }, (_, i) => `b[${i}] /= bs;`).join(' ')}
  vec3 alb = vec3(0.0); vec2 tn = vec2(0.0); float rough = 0.0; float ao = 0.0;
  ${Array.from({ length: L }, (_, i) => `alb += srgb2lin(A[${i}].rgb) * b[${i}]; rough += Bn[${i}].b * b[${i}]; ao += Bn[${i}].a * b[${i}]; tn += (Bn[${i}].rg * 2.0 - 1.0) * b[${i}];`).join('\n  ')}
  // world-space detail normal through an orthonormal frame built on N (works for vertical faces)
  vec3 tnv = vec3(tn, sqrt(max(0.04, 1.0 - dot(tn, tn))));
  vec3 upv = abs(N.y) < 0.995 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 Tg = normalize(cross(upv, N)); vec3 Bt = cross(N, Tg);
  vec3 nW = normalize(Tg * tnv.x + Bt * tnv.y + N * tnv.z);
  float nStr = uNormalStr * (1.0 - 0.8 * smoothstep(120.0, 900.0, camD));
  nW = normalize(mix(N, nW, nStr));
  // ---- tints -------------------------------------------------------------------------------
  float rockShare = b[3];
  float rmac = snoise(vWPos.xz * 0.013 + vWPos.y * 0.021) * 0.5 + 0.5;
  float rmac2 = snoise(vWPos.xz * 0.055 + vWPos.y * 0.09 + 4.0) * 0.5 + 0.5;
  alb *= mix(1.0, mix(0.58, 1.22, rmac) * mix(0.85, 1.12, rmac2), rockShare);
  float dust = c1.a; float rbed = c1.b;
  alb = mix(alb, alb * vec3(1.10, 0.98, 0.84) + vec3(0.10, 0.075, 0.045), clamp(dust * 1.2, 0.0, 1.0) * b[2]);
  alb *= mix(1.0, 0.55, rbed);
  float grassShare = b[1] + b[0] * 0.5;
  // riverine green band: darker, much greener than the plains gold
  alb = mix(alb, alb * vec3(0.82, 1.00, 0.72), moist * grassShare * 0.5);
  // macro variation: baked (150–300 m) + in-shader (50 m, 12 m)
  alb *= mix(0.74, 1.16, macro) * mix(0.90, 1.10, m2) * mix(0.95, 1.05, m3);
  alb *= mix(vec3(1.04, 0.98, 0.90), vec3(0.94, 1.00, 0.96), m2);
  // wetness
  alb *= mix(1.0, 0.40, wet);
  rough = mix(rough, 0.34, wet);
  // No saturation/contrast compensation here: core's sRGB double-encode is fixed, so the layer
  // textures are authored as true linear colour and are used as-is. uSat/uContrast stay at neutral.
  float lum = dot(alb, vec3(0.2126, 0.7152, 0.0722));
  alb = max(vec3(0.0), mix(vec3(lum), alb, uSat));
  alb = clamp(alb * uGain, 0.0, 1.0);
  alb = alb * alb * (3.0 - 2.0 * alb) * uContrast + alb * (1.0 - uContrast);
  tAlbedo = clamp(alb, 0.0, 1.0); tRough = clamp(rough, 0.2, 1.0); tAo = mix(1.0, ao, 0.7); tNormalW = nW;
}
diffuseColor.rgb *= tAlbedo;
`;
  return s;
}

const PARS = /* glsl */ `
uniform sampler2DArray tAlb; uniform sampler2DArray tNrm;
uniform sampler2D tCtl0; uniform sampler2D tCtl1; uniform sampler2D tAux;
uniform float uHalf; uniform float uInvCell; uniform float uInvRes;
uniform float uInvScaleA; uniform float uInvScaleB; uniform float uInvScaleT;
uniform float uNormalStr; uniform float uBlendDepth;
uniform float uWarpA; uniform float uWarpB; uniform float uWarpC;
uniform float uSat; uniform float uGain; uniform float uContrast;
varying vec3 vWPos; varying vec3 vWNormal;
vec3 srgb2lin(vec3 c){ return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
${GLSL_NOISE}
// Two-scale planar (XZ) sample blended with X/Z projections by the squared normal.
// tri = 0 → pure planar (flat ground, cheapest path); tri = 1 → full triplanar (cliff faces).
void sampleLayer(float layer, float tri, vec2 uvA, vec2 uvB, vec3 bw, vec3 P, float mb, out vec4 A, out vec4 Nn){
  A  = mix(texture(tAlb, vec3(uvA, layer)), texture(tAlb, vec3(uvB, layer)), mb);
  Nn = mix(texture(tNrm, vec3(uvA, layer)), texture(tNrm, vec3(uvB, layer)), mb);
  if (tri > 0.004) {
    vec2 uX = P.zy * uInvScaleT, uZ = P.xy * uInvScaleT;
    vec4 aX = texture(tAlb, vec3(uX, layer)), aZ = texture(tAlb, vec3(uZ, layer));
    vec4 nX = texture(tNrm, vec3(uX, layer)), nZ = texture(tNrm, vec3(uZ, layer));
    A  = mix(A,  aX * bw.x + A  * bw.y + aZ * bw.z, tri);
    Nn = mix(Nn, nX * bw.x + Nn * bw.y + nZ * bw.z, tri);
  }
}
`;

export function createTerrainMaterial(ctx, layers, control) {
  const world = ctx.world;
  const m = ctx.materials.standard({ color: 0xffffff, roughness: 1, metalness: 0, side: THREE.FrontSide });
  m.name = 'terrain-splat';
  const uniforms = {
    tAlb: { value: layers.tAlb }, tNrm: { value: layers.tNrm },
    tCtl0: { value: control.tCtl0 }, tCtl1: { value: control.tCtl1 }, tAux: { value: control.tAux },
    uHalf: { value: world.half }, uInvCell: { value: 1 / world.terrain.cell }, uInvRes: { value: 1 / world.terrain.res },
    uInvScaleA: { value: 1 / 3.7 }, uInvScaleB: { value: 1 / 29 }, uInvScaleT: { value: 1 / 6.5 },
    uNormalStr: { value: 1.0 }, uBlendDepth: { value: 0.30 },
    uWarpA: { value: 11.0 }, uWarpB: { value: 3.4 }, uWarpC: { value: 1.1 },
    uSat: { value: 1.0 }, uGain: { value: 1.0 }, uContrast: { value: 0.0 },
  };
  m.userData.uniforms = uniforms;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos; varying vec3 vWNormal;')
      .replace('#include <defaultnormal_vertex>', '#include <defaultnormal_vertex>\nvWNormal = normalize(mat3(modelMatrix) * objectNormal);')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + PARS)
      .replace('#include <map_fragment>', splatGLSL())
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = roughness * tRough;')
      .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(tNormalW, 0.0)).xyz);')
      .replace('#include <aomap_fragment>', 'reflectedLight.indirectDiffuse *= tAo; reflectedLight.directDiffuse *= mix(1.0, tAo, 0.35);');
  };
  m.customProgramCacheKey = () => 'terrain-splat-v3';
  return m;
}

/** Control textures from packed byte arrays (513² RGBA8, clamp, linear, no mipmaps). */
export function createControlTextures(world, ctl0, ctl1, aux) {
  const res = world.terrain.res;
  const mk = (data, name) => {
    const t = new THREE.DataTexture(data, res, res, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.name = name; t.colorSpace = THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = false;
    t.needsUpdate = true;
    return t;
  };
  return { tCtl0: mk(ctl0, 'terrain-ctl0'), tCtl1: mk(ctl1, 'terrain-ctl1'), tAux: mk(aux, 'terrain-aux') };
}

/** Half-float height texture (R16F) for shaders that need terrain height under a point (water depth). */
export function createHeightTexture(world) {
  const res = world.terrain.res;
  const data = new Uint16Array(res * res);
  const t = new THREE.DataTexture(data, res, res, THREE.RedFormat, THREE.HalfFloatType);
  t.name = 'terrain-height';
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = false;
  t.colorSpace = THREE.NoColorSpace;
  updateHeightTexture(world, t);
  return t;
}

export function updateHeightTexture(world, tex) {
  const H = world.terrain.heights, d = tex.image.data;
  for (let i = 0; i < H.length; i++) d[i] = THREE.DataUtils.toHalfFloat(H[i]);
  tex.needsUpdate = true;
}
