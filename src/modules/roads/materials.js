// Procedural PBR sets (dirt / gravel / asphalt / planks / concrete) and the road surface material.
// Road material = MeshStandardMaterial + onBeforeCompile: tyre ruts, edge dust blend, markings, skirt alpha,
// macro variation along length. Vertex attribute aRoad = (across m, along m, edge distance m (<0 in skirt), junction 0..1).
import * as THREE from 'three';
import { GLSL_NOISE } from '../../core/Textures.js';

const HELPERS = /* glsl */ `
// tileable worley with a per-cell id: returns (d1, d2, id)
vec3 tworleyId(vec2 uv, float n, float seed){
  vec2 p=uv*n; vec2 i=floor(p); vec2 f=p-i; float d1=8.0,d2=8.0; float id=0.0;
  for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
    vec2 g=vec2(float(x),float(y)); vec2 c=mod(i+g,n);
    vec2 h=fract(sin(vec2(dot(c+seed,vec2(127.1,311.7)),dot(c+seed,vec2(269.5,183.3))))*43758.5453);
    vec2 r=g+h-f; float d=dot(r,r); if(d<d1){d2=d1;d1=d;id=h.x;}else if(d<d2){d2=d;}
  }
  return vec3(sqrt(d1),sqrt(d2),id);
}
`;

export function buildTextureSets(textures, quality = 'high') {
  const size = quality === 'low' ? 512 : 1024;
  const sets = {};

  // ---- dry laterite dirt with pebbles and dust ----
  sets.dirt = textures.pbr({
    key: 'roads2:dirt', size, seed: 11, normalStrength: 0.05,
    height: HELPERS + /* glsl */ `
float height(vec2 uv){
  float base = tfbm(uv, 5.0, 5, uSeed) * 0.5 + 0.5;
  float fine = tfbm(uv, 70.0, 2, uSeed + 4.0) * 0.5 + 0.5;
  vec3 w = tworleyId(uv, 56.0, uSeed + 1.0);
  float peb = smoothstep(0.24, 0.08, w.x) * step(0.80, w.z);
  vec3 w2 = tworleyId(uv, 18.0, uSeed + 9.0);
  float stone = smoothstep(0.28, 0.10, w2.x) * step(0.90, w2.z);
  return clamp(base * 0.62 + fine * 0.20 + peb * 0.20 + stone * 0.34, 0.0, 1.0);
}`,
    albedo: HELPERS + /* glsl */ `
vec3 albedo(vec2 uv, float h){
  float macro = tfbm(uv, 2.0, 3, uSeed + 20.0) * 0.5 + 0.5;
  vec3 laterite = vec3(0.205, 0.108, 0.055);
  vec3 tan = vec3(0.400, 0.262, 0.138);
  vec3 c = mix(laterite, tan, macro);
  c *= 0.82 + 0.34 * h;
  vec3 w = tworleyId(uv, 56.0, uSeed + 1.0);
  float peb = smoothstep(0.24, 0.08, w.x) * step(0.80, w.z);
  vec3 w2 = tworleyId(uv, 18.0, uSeed + 9.0);
  float stone = smoothstep(0.28, 0.10, w2.x) * step(0.90, w2.z);
  vec3 pebCol = mix(vec3(0.245, 0.220, 0.190), vec3(0.150, 0.126, 0.104), w.z);
  c = mix(c, pebCol, peb * 0.45);
  c = mix(c, vec3(0.205, 0.185, 0.158) * (0.8 + 0.4 * w2.z), stone * 0.5);
  float fine = tfbm(uv, 90.0, 2, uSeed + 5.0);
  c *= 1.0 + fine * 0.06;
  return c;
}`,
    roughness: /* glsl */ `float rough(vec2 uv, float h){ return clamp(0.96 - h * 0.18 + tfbm(uv, 9.0, 2, uSeed + 3.0) * 0.06, 0.6, 1.0); }`,
    ao: /* glsl */ `float ao(vec2 uv, float h){ return mix(0.72, 1.0, h); }`,
  });

  // ---- crushed gravel ----
  sets.gravel = textures.pbr({
    key: 'roads2:gravel', size, seed: 23, normalStrength: 0.045,
    height: HELPERS + /* glsl */ `
float height(vec2 uv){
  vec3 w = tworleyId(uv, 44.0, uSeed);
  float stone = clamp(1.0 - w.x * 2.6, 0.0, 1.0);
  stone = sqrt(stone) * (0.7 + 0.3 * w.z);
  vec3 w2 = tworleyId(uv + 0.37, 90.0, uSeed + 2.0);
  float grit = clamp(1.0 - w2.x * 3.0, 0.0, 1.0) * 0.5;
  float base = tfbm(uv, 4.0, 4, uSeed + 7.0) * 0.5 + 0.5;
  return clamp(base * 0.25 + max(stone, grit) * 0.75, 0.0, 1.0);
}`,
    albedo: HELPERS + /* glsl */ `
vec3 albedo(vec2 uv, float h){
  vec3 w = tworleyId(uv, 44.0, uSeed);
  float stone = clamp(1.0 - w.x * 2.6, 0.0, 1.0);
  vec3 grey = vec3(0.275, 0.260, 0.235), warm = vec3(0.320, 0.235, 0.145), dark = vec3(0.140, 0.130, 0.120);
  vec3 sc = mix(mix(grey, warm, step(0.55, w.z)), dark, step(0.85, w.z));
  sc *= 0.75 + 0.5 * fract(w.z * 7.3);
  vec3 gap = vec3(0.195, 0.122, 0.062) * (0.8 + 0.4 * (tfbm(uv, 12.0, 2, uSeed + 3.0) * 0.5 + 0.5));
  vec3 c = mix(gap, sc, smoothstep(0.05, 0.4, stone));
  float macro = tfbm(uv, 2.0, 3, uSeed + 30.0);
  c *= 1.0 + macro * 0.12;
  return c * (0.85 + 0.3 * h);
}`,
    roughness: /* glsl */ `float rough(vec2 uv, float h){ return clamp(0.92 - h * 0.25, 0.55, 1.0); }`,
    ao: /* glsl */ `float ao(vec2 uv, float h){ return mix(0.6, 1.0, h); }`,
  });

  // ---- asphalt with aggregate, cracks and repair patches ----
  sets.asphalt = textures.pbr({
    key: 'roads2:asphalt', size, seed: 37, normalStrength: 0.03,
    height: HELPERS + /* glsl */ `
float height(vec2 uv){
  float agg = tfbm(uv, 110.0, 2, uSeed) * 0.5 + 0.5;
  float coarse = tfbm(uv, 24.0, 3, uSeed + 1.0) * 0.5 + 0.5;
  vec3 w = tworleyId(uv, 4.0, uSeed + 5.0);
  float crackLine = 1.0 - smoothstep(0.0, 0.03 + 0.02 * agg, w.y - w.x);
  float hasCrack = step(0.55, w.z);
  float wobble = tfbm(uv, 40.0, 2, uSeed + 8.0);
  float crack = crackLine * hasCrack * smoothstep(-0.2, 0.3, wobble);
  float pt = smoothstep(0.56, 0.64, tfbm(uv, 7.0, 3, uSeed + 12.0) * 0.5 + 0.5);
  float h = 0.55 + agg * 0.25 + coarse * 0.15;
  h = mix(h, 0.62 + agg * 0.08, pt);
  h -= crack * 0.45;
  return clamp(h, 0.0, 1.0);
}`,
    albedo: HELPERS + /* glsl */ `
vec3 albedo(vec2 uv, float h){
  float agg = tfbm(uv, 110.0, 2, uSeed) * 0.5 + 0.5;
  float pt = smoothstep(0.56, 0.64, tfbm(uv, 7.0, 3, uSeed + 12.0) * 0.5 + 0.5);
  float macro = tfbm(uv, 2.0, 3, uSeed + 40.0) * 0.5 + 0.5;
  vec3 base = mix(vec3(0.072, 0.072, 0.068), vec3(0.115, 0.112, 0.104), macro);
  base = mix(base, vec3(0.165, 0.160, 0.148), pow(agg, 3.0) * 0.6);
  vec3 patchCol = vec3(0.052, 0.052, 0.050) * (0.9 + 0.2 * agg);
  vec3 c = mix(base, patchCol, pt);
  float crack = 1.0 - smoothstep(0.15, 0.45, h);
  c = mix(c, vec3(0.026, 0.026, 0.022), crack);
  return c;
}`,
    roughness: /* glsl */ `float rough(vec2 uv, float h){
  float pt = smoothstep(0.56, 0.64, tfbm(uv, 7.0, 3, uSeed + 12.0) * 0.5 + 0.5);
  float r = 0.78 + (1.0 - h) * 0.15;
  return clamp(mix(r, 0.62, pt), 0.5, 1.0);
}`,
    ao: /* glsl */ `float ao(vec2 uv, float h){ return mix(0.55, 1.0, smoothstep(0.1, 0.6, h)); }`,
  });

  // ---- weathered timber planks (bridge decks, signs) : planks run along V ----
  sets.planks = textures.pbr({
    key: 'roads2:planks', size, seed: 51, normalStrength: 0.06,
    height: /* glsl */ `
float height(vec2 uv){
  float pl = fract(uv.y * 8.0);
  float groove = smoothstep(0.0, 0.06, pl) * smoothstep(1.0, 0.94, pl);
  float id = floor(uv.y * 8.0);
  float grain = tnoise(vec2(uv.x * 2.0, uv.y * 30.0), 3.0, uSeed + id) * 0.5 + 0.5;
  float knots = tfbm(vec2(uv.x * 3.0, uv.y * 6.0), 6.0, 3, uSeed + 3.0) * 0.5 + 0.5;
  float warp = hash12(vec2(id, uSeed)) * 0.15;
  return clamp(groove * (0.55 + grain * 0.25 + knots * 0.15 + warp), 0.0, 1.0);
}`,
    albedo: /* glsl */ `
vec3 albedo(vec2 uv, float h){
  float id = floor(uv.y * 8.0);
  float v = hash12(vec2(id * 3.1, uSeed + 1.0));
  vec3 a = vec3(0.340, 0.255, 0.170), b = vec3(0.440, 0.355, 0.265), g = vec3(0.300, 0.280, 0.250);
  vec3 c = mix(mix(a, b, v), g, smoothstep(0.4, 0.9, hash12(vec2(id, 7.0 + uSeed))) * 0.6);
  float grain = tnoise(vec2(uv.x * 2.0, uv.y * 30.0), 3.0, uSeed + id) * 0.5 + 0.5;
  c *= 0.8 + 0.35 * grain;
  c *= 0.55 + 0.5 * h;
  return c;
}`,
    roughness: /* glsl */ `float rough(vec2 uv, float h){ return clamp(0.82 + (1.0 - h) * 0.15, 0.6, 1.0); }`,
    ao: /* glsl */ `float ao(vec2 uv, float h){ return mix(0.5, 1.0, h); }`,
  });

  // ---- concrete (paved bridges, km stones) ----
  sets.concrete = textures.pbr({
    key: 'roads2:concrete', size, seed: 63, normalStrength: 0.02,
    height: /* glsl */ `float height(vec2 uv){ return clamp(0.5 + tfbm(uv, 40.0, 3, uSeed) * 0.25 + tfbm(uv, 6.0, 2, uSeed + 2.0) * 0.15, 0.0, 1.0); }`,
    albedo: /* glsl */ `vec3 albedo(vec2 uv, float h){
  float stain = tfbm(uv, 3.0, 3, uSeed + 5.0) * 0.5 + 0.5;
  vec3 c = mix(vec3(0.355, 0.345, 0.325), vec3(0.455, 0.440, 0.410), h);
  c *= 0.85 + 0.25 * stain;
  return c;
}`,
    roughness: /* glsl */ `float rough(vec2 uv, float h){ return 0.8 + h * 0.1; }`,
  });

  // ---- dry savannah ground (showcase staging only) ----
  sets.ground = textures.pbr({
    key: 'roads2:ground', size, seed: 77, normalStrength: 0.05,
    height: /* glsl */ `
float height(vec2 uv){
  float base = tfbm(uv, 6.0, 5, uSeed) * 0.5 + 0.5;
  float tuft = tridged(uv, 40.0, 3, uSeed + 2.0);
  float fine = tfbm(uv, 120.0, 2, uSeed + 3.0) * 0.5 + 0.5;
  return clamp(base * 0.45 + tuft * 0.4 + fine * 0.15, 0.0, 1.0);
}`,
    albedo: /* glsl */ `
vec3 albedo(vec2 uv, float h){
  float macro = tfbm(uv, 2.0, 3, uSeed + 10.0) * 0.5 + 0.5;
  float tuft = tridged(uv, 40.0, 3, uSeed + 2.0);
  vec3 dirt = vec3(0.330, 0.155, 0.062), grassDry = vec3(0.600, 0.385, 0.088), grassOlive = vec3(0.270, 0.258, 0.055);
  vec3 g = mix(grassDry, grassOlive, macro);
  vec3 c = mix(dirt, g, smoothstep(0.15, 0.55, tuft));
  c *= 0.8 + 0.35 * h;
  return c;
}`,
    roughness: /* glsl */ `float rough(vec2 uv, float h){ return 0.95 - h * 0.1; }`,
    ao: /* glsl */ `float ao(vec2 uv, float h){ return mix(0.7, 1.0, h); }`,
  });

  return sets;
}

export const ROAD_REPEAT = { dirt: 3.0, gravel: 2.2, paved: 4.0 };
export const SKIRT = { dirt: 1.5, gravel: 1.3, paved: 1.8 };

/** Shared uniforms across all road materials (night factor for reflective paint, dust colour). */
export function makeRoadUniforms() {
  return {
    uNight: { value: 0 },
    uDust: { value: new THREE.Color(0.300, 0.196, 0.098) },
  };
}

/**
 * Road surface material for one kind. Shares `uni`. defines ROAD_DIRT / ROAD_GRAVEL / ROAD_PAVED.
 */
export function makeRoadMaterial(materials, sets, kind, uni) {
  const set = kind === 'paved' ? sets.asphalt : kind === 'gravel' ? sets.gravel : sets.dirt;
  const mat = materials.standard({
    color: 0xffffff, roughness: 1, metalness: 0,
    transparent: true, depthWrite: true,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
  });
  materials.applyPbr(mat, set, { repeatMetres: ROAD_REPEAT[kind] });
  mat.normalScale.set(kind === 'paved' ? 0.8 : 1.2, kind === 'paved' ? 0.8 : 1.2);
  mat.defines = { ['ROAD_' + kind.toUpperCase()]: 1 };
  mat.name = 'road-' + kind;
  mat.userData.kind = kind;
  const skirt = SKIRT[kind];
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = uni.uNight;
    shader.uniforms.uDust = uni.uDust;
    shader.uniforms.uSkirt = { value: skirt };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec4 aRoad; varying vec4 vRoad; varying vec3 vWPos;`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
vRoad = aRoad; vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec4 vRoad; varying vec3 vWPos; uniform float uNight; uniform vec3 uDust; uniform float uSkirt;
float gRut = 0.0; float gPaint = 0.0; float gDust = 0.0;
${GLSL_NOISE}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
{
  float a = vRoad.x; float s = vRoad.y; float ed = vRoad.z; float jn = vRoad.w;
  float aa = abs(a);
  vec3 col = diffuseColor.rgb;
  // macro variation along the road (patches of lighter dust / darker compaction)
  float macro = fbm(vWPos.xz * 0.035, 3);
  float macro2 = snoise(vWPos.xz * 0.006 + 3.7);
  col *= 1.0 + macro * 0.14;
  col = mix(col, col * vec3(1.06, 1.0, 0.92), macro2 * 0.5 + 0.5);
  float rutMask = 1.0 - jn;
  #ifdef ROAD_DIRT
    float wob = snoise(vec2(s * 0.04, 3.1)) * 0.12;
    float rutPos = 0.82 + wob;
    // two dark wheel channels — the single strongest read of a savannah two-track at any distance
    float rut = exp(-pow((aa - rutPos) / 0.34, 2.0));
    float rutN = 0.72 + 0.28 * (snoise(vec2(s * 0.6, a * 3.0)) * 0.5 + 0.5);
    rut *= rutN * rutMask;
    gRut = rut;
    col *= 1.0 - 0.58 * rut;
    col = mix(col, col * vec3(0.88, 0.94, 1.04), rut * 0.5);            // compacted, damper, cooler
    // dusty untravelled crown between the wheels, and the un-driven strips outside them
    float mid = exp(-pow(aa / 0.42, 2.0)) * rutMask;
    float midN = smoothstep(0.15, 0.75, fbm(vWPos.xz * 0.8, 2) * 0.5 + 0.5);
    col = mix(col, vec3(0.230, 0.180, 0.070) * (0.85 + 0.5 * midN), mid * 0.62);
    col = mix(col, col * vec3(1.10, 1.06, 0.98), mid * 0.30 * (1.0 - midN));
    float loose = smoothstep(0.35, 0.7, snoise(vWPos.xz * 1.3 + s * 0.02) * 0.5 + 0.5) * (1.0 - rut);
    col = mix(col, col * vec3(1.16, 1.09, 0.98), loose * 0.4);
  #endif
  #ifdef ROAD_GRAVEL
    float wob = snoise(vec2(s * 0.05, 7.1)) * 0.10;
    float rut = exp(-pow((aa - 0.82 - wob) / 0.32, 2.0)) * rutMask;
    gRut = rut;
    col *= 1.0 - 0.34 * rut;
    float fines = smoothstep(0.3, 0.8, fbm(vWPos.xz * 0.5 + s * 0.01, 2) * 0.5 + 0.5);
    col = mix(col, col * vec3(1.12, 1.05, 0.95), fines * 0.35 * rutMask);
    float spill = smoothstep(0.55, 0.85, snoise(vWPos.xz * 2.2) * 0.5 + 0.5) * (1.0 - smoothstep(-0.9, 0.2, ed));
    col = mix(col, vec3(0.275, 0.250, 0.220), spill * 0.6);
  #endif
  #ifdef ROAD_PAVED
    float wear = smoothstep(0.30, 0.80, fbm(vec2(s * 0.07, a * 1.5), 3) * 0.5 + 0.5);
    float wear2 = smoothstep(0.2, 0.9, snoise(vWPos.xz * 1.6) * 0.5 + 0.5);
    float el = 1.0 - smoothstep(0.045, 0.075, abs(ed - 0.32));
    float dash = step(fract(s / 9.0), 0.36) * (1.0 - smoothstep(0.05, 0.085, aa)) * rutMask;
    float paint = max(el, dash) * (0.25 + 0.75 * wear) * (0.6 + 0.4 * wear2);
    gPaint = paint;
    col = mix(col, vec3(0.42, 0.41, 0.37), paint * 0.85);
    float tyre = exp(-pow((aa - 1.0) / 0.35, 2.0)) * rutMask * 0.5 + exp(-pow((aa - 2.2) / 0.35, 2.0)) * rutMask * 0.5;
    col *= 1.0 - 0.12 * tyre * (0.5 + 0.5 * wear2);
    totalEmissiveRadiance += vec3(0.9, 0.85, 0.7) * paint * uNight * 0.35;
  #endif
  // edge dust blend toward terrain colour, broken up by noise
  // shoulder: a wide, noisy dust band that walks the surface colour into the terrain so the ribbon
  // never reads as a painted line. Widened from 0.9 m to 1.8 m and taken to full strength at the edge.
  float dustW = 1.0 - smoothstep(-0.2, 1.8, ed);
  float dn = snoise(vWPos.xz * 0.55) * 0.5 + 0.5;
  float dn2 = snoise(vWPos.xz * 2.1) * 0.5 + 0.5;
  dustW *= 0.45 + 0.75 * (dn * 0.6 + dn2 * 0.4);
  dustW = clamp(dustW, 0.0, 1.0);
  #ifdef ROAD_PAVED
    dustW *= 0.65;
  #endif
  gDust = dustW;
  col = mix(col, uDust * (0.90 + 0.22 * macro), dustW);
  // skirt: alpha feather that already starts 0.3 m inside the road edge, broken by noise
  float sk = clamp((0.3 - ed) / (uSkirt + 0.3), 0.0, 1.0);
  float skn = snoise(vWPos.xz * 1.9) * 0.5 + 0.5;
  float alpha = 1.0 - smoothstep(0.0, 1.0, sk * (0.72 + 0.6 * skn));
  diffuseColor.rgb = col;
  diffuseColor.a *= alpha;
}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = clamp(roughnessFactor - gRut * 0.12 + gDust * 0.06 - gPaint * 0.15, 0.3, 1.0);`);
  };
  mat.customProgramCacheKey = () => 'road3-' + kind;
  return mat;
}

/** Macro-variation + wet-darkening injection for the staging ground (showcase only). */
export function makeGroundMaterial(materials, sets, waterLevel) {
  const mat = materials.standard({ color: 0xffffff, roughness: 1, metalness: 0 });
  materials.applyPbr(mat, sets.ground, { repeatMetres: 7 });
  mat.name = 'roads-staging-ground';
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWater = { value: waterLevel };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWPos; uniform float uWater;\n${GLSL_NOISE}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
{
  // second scale to break tiling
  vec4 far = texture2D(map, vMapUv * 0.173 + 0.31);
  diffuseColor.rgb = mix(diffuseColor.rgb, far.rgb, 0.45);
  float macro = fbm(vWPos.xz * 0.012, 3);
  float macro2 = snoise(vWPos.xz * 0.003 + 9.1);
  diffuseColor.rgb *= 1.0 + macro * 0.18;
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.85, 0.95, 0.72), smoothstep(0.1, 0.8, macro2) * 0.5);
  float wet = 1.0 - smoothstep(uWater, uWater + 2.5, vWPos.y);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.45, 0.42, 0.36), wet * 0.85);
  float green = 1.0 - smoothstep(uWater + 1.0, uWater + 6.0, vWPos.y);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.7, 0.95, 0.55), green * 0.5);
}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.55, 1.0 - smoothstep(uWater, uWater + 2.0, vWPos.y));`);
  };
  mat.customProgramCacheKey = () => 'roads-ground';
  return mat;
}

/** Simple animated water for the staging strip (showcase only). */
export function makeWaterMaterial(materials, textures) {
  const nrm = textures.gpu(/* glsl */ `
vec4 shade(vec2 uv){
  float h = tfbm(uv, 10.0, 4, uSeed) * 0.5 + tfbm(uv + 0.5, 23.0, 3, uSeed + 4.0) * 0.25;
  float px = 1.0 / uSize;
  float l = tfbm(uv - vec2(px * 2.0, 0.0), 10.0, 4, uSeed) * 0.5 + tfbm(uv - vec2(px * 2.0, 0.0) + 0.5, 23.0, 3, uSeed + 4.0) * 0.25;
  float d = tfbm(uv - vec2(0.0, px * 2.0), 10.0, 4, uSeed) * 0.5 + tfbm(uv - vec2(0.0, px * 2.0) + 0.5, 23.0, 3, uSeed + 4.0) * 0.25;
  vec3 n = normalize(vec3((l - h) * 40.0, (d - h) * 40.0, 1.0));
  return vec4(n * 0.5 + 0.5, 1.0);
}`, { key: 'roads2:waterN', size: 512, seed: 5 });
  const mat = materials.physical({
    color: new THREE.Color(0.10, 0.17, 0.16), roughness: 0.12, metalness: 0,
    transparent: true, opacity: 0.86, normalMap: nrm, normalScale: new THREE.Vector2(0.35, 0.35),
    envMapIntensity: 1.0, depthWrite: false,
  });
  mat.normalMap.repeat.set(1, 1);
  mat.name = 'roads-staging-water';
  return mat;
}
