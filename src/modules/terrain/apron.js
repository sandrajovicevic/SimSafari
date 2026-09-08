// World-edge apron: a low-detail continuation of the plains from the playable 1024 m square out to ~5 km,
// so the map does not end in a hard slab cut floating in the sky colour. Ring 0 sits exactly on the
// heightfield border (shared heights → no seam, no z-fighting); outer rings extrapolate the plains with
// noise and rise into low distant highlands, so the rim always occludes the sky dome's horizon band.
// The material samples the SAME packed layer texture arrays (and the same two-scale UV scheme, height
// blend, and tint chain) as the playable terrain's splat shader, with an analytic plains control
// (dry-grass dominant + laterite patches + slope rock) — so across the world border the detail texels,
// detail frequency and colour grading are literally the same ground continuing, not a different-detail
// slab. Near the border the baked control aux (moisture/wet/macro) is sampled clamped, so even the
// macro-variation blotches and the riverine green band continue seamlessly.
import * as THREE from 'three';
import { GLSL_NOISE } from '../../core/Textures.js';

const OUTER = 6.5;      // outer radius as a multiple of world.half
const RINGS = 22;       // radial subdivisions
const SEGS = 128;       // subdivisions per world side (2 m at ring 0 — matches the terrain cell)

/** Point on the unit square boundary (Chebyshev radius 1) at perimeter parameter u ∈ [0,1). */
function squarePoint(u, out) {
  const t = (u * 4) % 4;
  if (t < 1) { out.x = -1 + 2 * t; out.z = -1; }
  else if (t < 2) { out.x = 1; out.z = -1 + 2 * (t - 1); }
  else if (t < 3) { out.x = 1 - 2 * (t - 2); out.z = 1; }
  else { out.x = -1; out.z = 1 - 2 * (t - 3); }
  return out;
}

/** Build the apron geometry from the current heightfield. */
export function buildApronGeometry(world, noise) {
  const half = world.half;
  const nPer = SEGS * 4;                 // perimeter vertices (ring is closed: last column duplicates the first)
  const cols = nPer + 1;
  const rows = RINGS + 1;
  const pos = new Float32Array(cols * rows * 3);
  const sp = { x: 0, z: 0 };
  const fb = (x, z, s, o) => noise.fbm2D(x / s + 37.3, z / s + 91.7, o);
  for (let r = 0; r < rows; r++) {
    const v = r / RINGS;
    const t = Math.pow(v, 1.35);                       // rings bunch up near the playable edge
    const f = 1 + t * (OUTER - 1);
    for (let c = 0; c < cols; c++) {
      const u = (c % nPer) / nPer;
      squarePoint(u, sp);
      const ex = sp.x * half, ez = sp.z * half;        // point on the world border
      const x = sp.x * half * f, z = sp.z * half * f;
      const edgeH = world.getHeight(ex, ez);
      // continue the plains: same low-frequency relief, fading sag so the far rim drops out of frame
      // relief fades back to flat at the rim: a tilted outermost row renders as a hard dark line
      // along the horizon (it is seen almost edge-on and its normal points away from the sun).
      const rim = 1 - Math.max(0, (v - 0.7) / 0.3);
      const relief = (3.0 * fb(x, z, 430, 3) + 1.0 * fb(x, z, 140, 2)) * Math.min(1, t * 3) * rim * rim;
      // The apron reaches 3.3 km; a ground-level eye sees the true horizon far beyond that, so a flat
      // or sagging rim leaves a strip of the sky dome's below-horizon colour showing as a black band.
      // Rising ground (distant highlands, which is what the Serengeti basin actually looks like)
      // keeps the rim above eye level from any ground camera and gives the far field some shape.
      const rise = 45 * t * t
        + t * t * (16 * noise.ridged2D(x / 820 + 5.1, z / 820 + 2.3, 3) + 7 * fb(x, z, 380, 2));
      const k = (r * cols + c);
      pos[k * 3] = x; pos[k * 3 + 1] = edgeH + relief + rise; pos[k * 3 + 2] = z;
    }
  }
  const idx = new Uint32Array(RINGS * nPer * 6);
  let q = 0;
  for (let r = 0; r < RINGS; r++) for (let c = 0; c < nPer; c++) {
    const a = r * cols + c, b = a + 1, d = a + cols, e = d + 1;
    // winding must give +Y face normals going around the square perimeter: (a,b,d) / (b,e,d).
    idx[q++] = a; idx[q++] = b; idx[q++] = d;
    idx[q++] = b; idx[q++] = e; idx[q++] = d;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  return geo;
}

// PARS: the splat's shared helpers (sRGB decode, rotated lookup) + the packed layer arrays. Names are
// suffixed A so a future copy-paste of splat code into the same program can never double-define.
const APRON_PARS = /* glsl */ `
uniform sampler2DArray tAlb; uniform sampler2DArray tNrm; uniform sampler2D tAux;
uniform float uHalf; uniform float uInvCell; uniform float uInvRes;
uniform float uInvScaleA; uniform float uInvScaleB; uniform float uBlendDepth;
varying vec3 vWPos; varying vec3 vWNormal;
vec3 srgb2linA(vec3 c){ return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
vec2 rot2A(vec2 p, float a){ float c = cos(a), s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }
${GLSL_NOISE}
`;

// The splat's plains path, re-derived for positions outside the control textures' range. Every constant
// here (tile scales, height-blend depth, tint multipliers, normal/roughness distance falloffs) is copied
// 1:1 from material.js's splatGLSL so the two sides of the border grade identically.
const APRON_FRAG = /* glsl */ `
vec3 tAlbedo; float tRough; float tAo; vec3 tNormalW;
{
  vec3 N = normalize(vWNormal);
  vec2 wxz = vWPos.xz;
  float camD = distance(vWPos, cameraPosition);
  float slope = 1.0 - N.y;
  // same analytic variation terms as the splat — these match exactly across the border
  float m2 = snoise(wxz * 0.021) * 0.5 + 0.5;
  float m3 = snoise(wxz * 0.083 + 7.0) * 0.5 + 0.5;
  // baked control aux, sampled clamped: moisture / wetness / macro continue the border values outward
  vec2 cc = clamp(wxz, -uHalf, uHalf);
  vec4 aux = texture2D(tAux, clamp(((cc + uHalf) * uInvCell + 0.5) * uInvRes, 0.0, 1.0));
  // analytic far-field aux at the baked fields' frequencies (GLSL noise differs per-blotch from the CPU
  // bake, but frequency and contrast match, so the variation reads as one continuing field)
  float macroA = 0.5 + 0.5 * (0.6 * fbm(wxz * (1.0 / 210.0) + vec2(3.3, 8.1), 3) + 0.4 * fbm(wxz * (1.0 / 70.0) + vec2(1.1, 4.4), 2));
  float moistA = clamp(0.18 + 0.16 * fbm(wxz * (1.0 / 300.0) + vec2(37.3, 91.7), 2), 0.0, 1.0);
  float fade = smoothstep(20.0, 220.0, length(max(abs(wxz) - uHalf, vec2(0.0))));
  float macro = mix(aux.b, macroA, fade);
  float moist = mix(aux.r, moistA, fade);
  float wet = mix(aux.g, 0.0, fade);
  float pt = fbm(wxz * (1.0 / 90.0) + vec2(37.3, 91.7), 3);
  // plains layer weights mirroring generate.js classifySample (grass / dryGrass / laterite dirt patches)
  // plus the splat's slope-driven dirt and rock so cut banks and cliff exits keep grading correctly
  float wGrass = smoothstep(0.50, 0.62, moist + 0.22 * pt);
  float wDirt = smoothstep(0.36, 0.46, pt) * (1.0 - smoothstep(0.30, 0.45, moist)) * 0.8;
  float wRockS = smoothstep(0.10, 0.34, slope + 0.05 * (m3 - 0.5));
  float wDirtS = smoothstep(0.05, 0.16, slope) * (1.0 - wRockS);
  float keep = 1.0 - max(wRockS, wDirtS);
  float w0 = wGrass * keep;
  float w1 = max(1.0 - max(wGrass, wDirt), 0.0) * keep;
  float w2 = min(wDirt * keep + wDirtS, 1.0);
  float w3 = wRockS;
  float wsum = max(w0 + w1 + w2 + w3, 1e-4);
  w0 /= wsum; w1 /= wsum; w2 /= wsum; w3 /= wsum;
  // the splat's two-scale UV blend at the same fixed odd rotations
  vec2 uvA = rot2A(wxz * uInvScaleA, 0.13);
  vec2 uvB = rot2A(wxz * uInvScaleB, 0.37) + 0.31;
  float mb = 0.5 + 0.2 * (m2 - 0.5);
  vec4 A0 = mix(texture(tAlb, vec3(uvA, 0.0)), texture(tAlb, vec3(uvB, 0.0)), mb);
  vec4 A1 = mix(texture(tAlb, vec3(uvA, 1.0)), texture(tAlb, vec3(uvB, 1.0)), mb);
  vec4 A2 = mix(texture(tAlb, vec3(uvA, 2.0)), texture(tAlb, vec3(uvB, 2.0)), mb);
  vec4 A3 = mix(texture(tAlb, vec3(uvA, 3.0)), texture(tAlb, vec3(uvB, 3.0)), mb);
  vec4 B0 = mix(texture(tNrm, vec3(uvA, 0.0)), texture(tNrm, vec3(uvB, 0.0)), mb);
  vec4 B1 = mix(texture(tNrm, vec3(uvA, 1.0)), texture(tNrm, vec3(uvB, 1.0)), mb);
  vec4 B2 = mix(texture(tNrm, vec3(uvA, 2.0)), texture(tNrm, vec3(uvB, 2.0)), mb);
  vec4 B3 = mix(texture(tNrm, vec3(uvA, 3.0)), texture(tNrm, vec3(uvB, 3.0)), mb);
  // height-based blend, as in the splat
  float h0 = A0.a * 0.9 + w0; float h1 = A1.a * 0.9 + w1;
  float h2 = A2.a * 0.9 + w2; float h3 = A3.a * 0.9 + w3;
  float ma = max(max(h0, h1), max(h2, h3));
  float b0 = max(h0 - ma + uBlendDepth, 0.0);
  float b1 = max(h1 - ma + uBlendDepth, 0.0);
  float b2 = max(h2 - ma + uBlendDepth, 0.0);
  float b3 = max(h3 - ma + uBlendDepth, 0.0);
  float bs = max(b0 + b1 + b2 + b3, 1e-4);
  b0 /= bs; b1 /= bs; b2 /= bs; b3 /= bs;
  vec3 alb = srgb2linA(A0.rgb) * b0 + srgb2linA(A1.rgb) * b1 + srgb2linA(A2.rgb) * b2 + srgb2linA(A3.rgb) * b3;
  vec2 tn = (B0.rg * 2.0 - 1.0) * b0 + (B1.rg * 2.0 - 1.0) * b1 + (B2.rg * 2.0 - 1.0) * b2 + (B3.rg * 2.0 - 1.0) * b3;
  float rough = B0.b * b0 + B1.b * b1 + B2.b * b2 + B3.b * b3;
  float ao = B0.a * b0 + B1.a * b1 + B2.a * b2 + B3.a * b3;
  // world-space detail normal through the splat's orthonormal frame, with the same distance flattening
  vec3 tnv = vec3(tn, sqrt(max(0.04, 1.0 - dot(tn, tn))));
  vec3 upv = abs(N.y) < 0.995 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 Tg = normalize(cross(upv, N)); vec3 Bt = cross(N, Tg);
  vec3 nW = normalize(Tg * tnv.x + Bt * tnv.y + N * tnv.z);
  float nStr = 1.0 * (1.0 - 0.85 * smoothstep(150.0, 700.0, camD));
  nW = normalize(mix(N, nW, nStr));
  // ---- the splat's tint chain (rockShare from the slope weight; dust/riverbed are zero out here) ----
  float rockShare = b3;
  float rmac = snoise(wxz * 0.013 + vWPos.y * 0.021) * 0.5 + 0.5;
  float rmac2 = snoise(wxz * 0.055 + vWPos.y * 0.09 + 4.0) * 0.5 + 0.5;
  alb *= mix(1.0, mix(0.58, 1.22, rmac) * mix(0.85, 1.12, rmac2), rockShare);
  float grassShare = b1 + b0 * 0.5;
  alb = mix(alb, alb * vec3(0.82, 1.00, 0.72), moist * grassShare * 0.5);
  alb *= mix(0.74, 1.16, macro) * mix(0.90, 1.10, m2) * mix(0.95, 1.05, m3);
  alb *= mix(vec3(1.04, 0.98, 0.90), vec3(0.94, 1.00, 0.96), m2);
  alb *= mix(1.0, 0.40, wet);
  rough = mix(rough, 0.50, wet);
  rough += 0.35 * smoothstep(200.0, 800.0, camD);
  // measured balance (game overview, tod 14): the apron read ~5% brighter than the interior plains
  // relative to the previous apron, mostly because props' tree shadows end at the border. A 5% gain
  // restores the previous interior/apron luminance ratio on top of the shared tint chain.
  alb *= 0.95;
  tAlbedo = clamp(alb, 0.0, 1.0); tRough = clamp(rough, 0.2, 1.0); tAo = mix(1.0, ao, 0.7); tNormalW = nW;
}
diffuseColor.rgb *= tAlbedo;
`;

/** Splat-continuation material: same layer texture arrays, same two-scale sampling, same tint chain. */
export function createApronMaterial(ctx, layers, control) {
  const world = ctx.world;
  const m = ctx.materials.standard({ color: 0xffffff, roughness: 1, metalness: 0, side: THREE.FrontSide });
  m.name = 'terrain-apron';
  const uniforms = {
    tAlb: { value: layers.tAlb }, tNrm: { value: layers.tNrm }, tAux: { value: control.tAux },
    uHalf: { value: world.half }, uInvCell: { value: 1 / world.terrain.cell }, uInvRes: { value: 1 / world.terrain.res },
    uInvScaleA: { value: 1 / 3.7 }, uInvScaleB: { value: 1 / 29 }, uBlendDepth: { value: 0.30 },
  };
  m.userData.uniforms = uniforms;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos; varying vec3 vWNormal;')
      .replace('#include <defaultnormal_vertex>', '#include <defaultnormal_vertex>\nvWNormal = normalize(mat3(modelMatrix) * objectNormal);')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + APRON_PARS)
      .replace('#include <map_fragment>', APRON_FRAG)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = roughness * tRough;')
      .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(tNormalW, 0.0)).xyz);')
      .replace('#include <aomap_fragment>', 'reflectedLight.indirectDiffuse *= tAo; reflectedLight.directDiffuse *= mix(1.0, tAo, 0.35);');
  };
  m.customProgramCacheKey = () => 'terrain-apron-v8';
  return m;
}
