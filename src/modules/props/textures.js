import * as THREE from 'three';

// Procedural textures for props: bark PBR sets (acacia / fever / baobab / dead wood), alpha-cut foliage cards,
// granite, laterite clay. Everything is generated on the GPU through ctx.textures (no files, no network).
//
// Tiling note: the helpers in core/Textures.js (tfbm / tridged / tworley) map uv onto a torus, so they only tile
// when uv is scaled by INTEGER factors. Every anisotropic stretch below uses integer multipliers for that reason.


// ---------------------------------------------------------------------------------------------------------
// COLOUR SPACE — read this before touching any albedo constant below.
//
// core/Textures.gpu() applies linearToSRGBv() in its main(), AND creates the render target with
// colorSpace = SRGBColorSpace, which three maps to an SRGB8_ALPHA8 internal format — and WebGL2
// sRGB-encodes fragment output to such an attachment automatically. So the value lands DOUBLE
// encoded. Verified empirically by reading the target back through renderer.readRenderTargetPixels:
// an authored albedo of 0.088 linear was stored as byte 153 (double) instead of 84 (single), i.e.
// every prop albedo rendered ~3.7x too bright — pale grey trunks, mint-white foliage.
//
// RESOLVED 2026-09-02: core/Textures.js no longer encodes sRGB in the shader, so the hardware encode
// is the only one left and this pre-compensation is no longer needed. Per the original note, A() is
// now the identity — authored values below are true LINEAR albedo and pass through untouched. Kept as
// an identity rather than deleted so the 12 call sites stay readable as "this is authored linear".
const A = /* glsl */ `
vec3 A(vec3 c){ return c; }
`;

const BARK_COMMON = /* glsl */ `
// fissure field: high frequency around the trunk (u), stretched along it (v)
float fissure(vec2 uv, float f, float sd) {
  vec2 w = uv + vec2(0.06 * tfbm(uv * vec2(2.0, 1.0), 3.0, 3, sd + 11.0), 0.0);
  return tridged(w * vec2(4.0, 1.0), f, 5, sd);
}
`;

/** Rough, deeply fissured dark bark — Vachellia tortilis / marula. */
export function barkAcacia(T, { size = 512, seed = 3 } = {}) {
  return T.pbr({
    key: 'props:bark:acacia', size, seed, normalStrength: 0.32,
    height: `${BARK_COMMON}
float height(vec2 uv){
  float f = fissure(uv, 7.0, uSeed);
  float plates = tworley(uv * vec2(3.0, 1.0), 9.0, uSeed + 4.0).x;
  float grain = tfbm(uv * vec2(6.0, 2.0), 26.0, 3, uSeed + 2.0) * 0.5 + 0.5;
  float h = f * 0.62 + plates * 0.3 + grain * 0.12;
  return clamp(h, 0.0, 1.0);
}`,
    albedo: `${A}
vec3 albedo(vec2 uv, float h){
  // Dark grey-brown, not a silhouette. Real Vachellia bark sits around 0.06-0.10 linear; the wide
  // dark→pale spread across h is what keeps the fissures legible once the sun is on it.
  vec3 dark = vec3(0.0265, 0.0215, 0.0175);   // deep in a fissure
  vec3 mid  = vec3(0.0790, 0.0645, 0.0495);   // body of the bark
  vec3 pale = vec3(0.1850, 0.1560, 0.1220);   // sun-worn plate edges
  vec3 c = mix(dark, mid, smoothstep(0.10, 0.55, h));
  c = mix(c, pale, smoothstep(0.58, 0.92, h));
  float li = smoothstep(0.58, 0.86, tfbm(uv * vec2(2.0, 1.0), 5.0, 4, uSeed + 31.0) * 0.5 + 0.5);
  c = mix(c, vec3(0.0750, 0.0820, 0.0450), li * 0.45 * smoothstep(0.3, 0.8, h));
  c *= 0.80 + 0.40 * (tfbm(uv * vec2(5.0, 3.0), 34.0, 2, uSeed + 7.0) * 0.5 + 0.5);
  return A(c);
}`,
    roughness: `float rough(vec2 uv, float h){ return clamp(0.98 - 0.20 * h, 0.6, 1.0); }`,
    ao: `float ao(vec2 uv, float h){ return mix(0.42, 1.0, smoothstep(0.05, 0.75, h)); }`,
  });
}

/** Smooth, powdery yellow-green bark — Vachellia xanthophloea (fever tree). */
export function barkFever(T, { size = 512, seed = 9 } = {}) {
  return T.pbr({
    key: 'props:bark:fever', size, seed, normalStrength: 0.05,
    height: `float height(vec2 uv){
  float peel = tfbm(uv * vec2(2.0, 1.0), 4.0, 4, uSeed) * 0.5 + 0.5;
  float grain = tfbm(uv * vec2(8.0, 1.0), 30.0, 2, uSeed + 5.0) * 0.5 + 0.5;
  return clamp(peel * 0.75 + grain * 0.25, 0.0, 1.0);
}`,
    albedo: `${A}
vec3 albedo(vec2 uv, float h){
  vec3 lo = vec3(0.0850, 0.0980, 0.0280);
  vec3 hi = vec3(0.2550, 0.2680, 0.0850);
  vec3 c = mix(lo, hi, smoothstep(0.15, 0.85, h));
  // flaking patches showing older grey-green bark underneath
  float fl = smoothstep(0.62, 0.86, tfbm(uv * vec2(3.0, 2.0), 9.0, 3, uSeed + 17.0) * 0.5 + 0.5);
  c = mix(c, vec3(0.1250, 0.1220, 0.0700), fl * 0.7);
  float lent = smoothstep(0.80, 0.98, tfbm(uv * vec2(1.0, 14.0), 22.0, 2, uSeed + 23.0) * 0.5 + 0.5);
  c = mix(c, vec3(0.0330, 0.0300, 0.0180), lent * 0.7);
  return A(c);
}`,
    roughness: `float rough(vec2 uv, float h){ return clamp(0.72 - 0.14 * h, 0.45, 0.9); }`,
    ao: `float ao(vec2 uv, float h){ return mix(0.72, 1.0, h); }`,
  });
}

/** Fat, smooth, grey-mauve baobab bark with vertical stretch folds. */
export function barkBaobab(T, { size = 512, seed = 14 } = {}) {
  return T.pbr({
    key: 'props:bark:baobab', size, seed, normalStrength: 0.14,
    height: `float height(vec2 uv){
  float fold = tridged(uv * vec2(3.0, 1.0), 3.0, 4, uSeed) ;
  float bump = tfbm(uv * vec2(4.0, 2.0), 14.0, 3, uSeed + 6.0) * 0.5 + 0.5;
  return clamp(fold * 0.7 + bump * 0.3, 0.0, 1.0);
}`,
    albedo: `${A}
vec3 albedo(vec2 uv, float h){
  vec3 lo = vec3(0.0420, 0.0360, 0.0350);
  vec3 hi = vec3(0.1650, 0.1500, 0.1420);
  vec3 c = mix(lo, hi, smoothstep(0.10, 0.80, h));
  c = mix(c, vec3(0.1150, 0.0930, 0.0760), smoothstep(0.5, 0.9, tfbm(uv * vec2(2.0, 1.0), 6.0, 3, uSeed + 12.0) * 0.5 + 0.5) * 0.45);
  c *= 0.88 + 0.24 * (tfbm(uv * vec2(6.0, 4.0), 30.0, 2, uSeed + 3.0) * 0.5 + 0.5);
  return A(c);
}`,
    roughness: `float rough(vec2 uv, float h){ return clamp(0.80 - 0.18 * h, 0.5, 0.95); }`,
    ao: `float ao(vec2 uv, float h){ return mix(0.55, 1.0, h); }`,
  });
}

/** Bleached, cracked, sun-silvered dead wood. */
export function barkDead(T, { size = 512, seed = 21 } = {}) {
  return T.pbr({
    key: 'props:bark:dead', size, seed, normalStrength: 0.20,
    height: `float height(vec2 uv){
  float crack = tridged(uv * vec2(2.0, 1.0), 5.0, 5, uSeed);
  float split = smoothstep(0.55, 0.95, tridged(uv * vec2(6.0, 1.0), 3.0, 3, uSeed + 8.0));
  float grain = tfbm(uv * vec2(10.0, 1.0), 40.0, 2, uSeed + 2.0) * 0.5 + 0.5;
  return clamp(crack * 0.55 + grain * 0.25 + split * 0.3, 0.0, 1.0);
}`,
    albedo: `${A}
vec3 albedo(vec2 uv, float h){
  vec3 lo = vec3(0.0300, 0.0260, 0.0210);
  vec3 hi = vec3(0.2150, 0.2020, 0.1800);   // sun-bleached silver-grey
  vec3 c = mix(lo, hi, smoothstep(0.12, 0.85, h));
  c = mix(c, vec3(0.0880, 0.0720, 0.0510), smoothstep(0.4, 0.9, tfbm(uv * vec2(3.0, 1.0), 7.0, 3, uSeed + 19.0) * 0.5 + 0.5) * 0.5);
  return A(c);
}`,
    roughness: `float rough(vec2 uv, float h){ return clamp(0.99 - 0.16 * h, 0.7, 1.0); }`,
    ao: `float ao(vec2 uv, float h){ return mix(0.40, 1.0, smoothstep(0.05, 0.8, h)); }`,
  });
}

/** Coarse grey/pink granite with biotite specks and lichen — kopje boulders. */
export function granite(T, { size = 512, seed = 33 } = {}) {
  return T.pbr({
    key: 'props:granite', size, seed, normalStrength: 0.10,
    height: `float height(vec2 uv){
  vec2 w = tworley(uv, 14.0, uSeed);
  float xtal = 1.0 - (w.y - w.x);
  float coarse = tfbm(uv, 3.0, 4, uSeed + 4.0) * 0.5 + 0.5;
  float pit = smoothstep(0.72, 1.0, tworley(uv, 40.0, uSeed + 9.0).x);
  return clamp(xtal * 0.34 + coarse * 0.52 + pit * 0.14, 0.0, 1.0);
}`,
    albedo: `${A}
vec3 albedo(vec2 uv, float h){
  vec2 w = tworley(uv, 14.0, uSeed);
  float rnd = hash12(floor(uv * 14.0) + uSeed);
  vec3 felds = mix(vec3(0.1600, 0.1370, 0.1190), vec3(0.2150, 0.1600, 0.1330), rnd);   // pinkish feldspar
  vec3 quartz = vec3(0.1920, 0.1920, 0.1870);
  vec3 biotite = vec3(0.0150, 0.0142, 0.0157);
  vec3 c = mix(felds, quartz, step(0.55, rnd));
  float mica = smoothstep(0.55, 0.90, tworley(uv, 46.0, uSeed + 21.0).x) * step(0.72, hash12(floor(uv * 46.0) + uSeed * 0.7));
  c = mix(c, biotite, mica * 0.85);
  c *= 0.82 + 0.30 * h;
  // weathering: iron staining and pale grey-green crustose lichen
  float rust = smoothstep(0.52, 0.90, tfbm(uv, 2.0, 4, uSeed + 41.0) * 0.5 + 0.5);
  c = mix(c, vec3(0.1220, 0.0720, 0.0365), rust * 0.40);
  float lich = smoothstep(0.58, 0.88, tfbm(uv, 6.0, 5, uSeed + 55.0) * 0.5 + 0.5);
  c = mix(c, vec3(0.1330, 0.1420, 0.0890), lich * 0.55);
  return A(c);
}`,
    roughness: `float rough(vec2 uv, float h){ return clamp(0.94 - 0.22 * h, 0.55, 1.0); }`,
    ao: `float ao(vec2 uv, float h){ return mix(0.55, 1.0, h); }`,
  });
}

/** Red laterite clay — termite mounds, anthills. */
export function clay(T, { size = 512, seed = 57 } = {}) {
  return T.pbr({
    key: 'props:clay', size, seed, normalStrength: 0.13,
    height: `float height(vec2 uv){
  float grain = tfbm(uv, 22.0, 4, uSeed) * 0.5 + 0.5;
  float lump = tfbm(uv, 5.0, 3, uSeed + 3.0) * 0.5 + 0.5;
  float pel = 1.0 - tworley(uv, 34.0, uSeed + 11.0).x;
  return clamp(lump * 0.5 + grain * 0.24 + pel * 0.26, 0.0, 1.0);
}`,
    albedo: `${A}
vec3 albedo(vec2 uv, float h){
  vec3 lo = vec3(0.0550, 0.0240, 0.0110);
  vec3 hi = vec3(0.2150, 0.0980, 0.0440);
  vec3 c = mix(lo, hi, smoothstep(0.1, 0.9, h));
  c = mix(c, vec3(0.1560, 0.1060, 0.0650), smoothstep(0.55, 0.95, tfbm(uv, 3.0, 3, uSeed + 27.0) * 0.5 + 0.5) * 0.45);
  return A(c);
}`,
    roughness: `float rough(vec2 uv, float h){ return clamp(1.0 - 0.12 * h, 0.8, 1.0); }`,
    ao: `float ao(vec2 uv, float h){ return mix(0.5, 1.0, h); }`,
  });
}

// ---------------------------------------------------------------------------------------------------------
// Foliage cards. Each is one alpha-cut sprite holding a whole leaf cluster; trees are built from many of them.
// ---------------------------------------------------------------------------------------------------------

const FOLIAGE_COMMON = /* glsl */ `
${A}
// distance from p to the segment (a → a + dir * L)
float segd(vec2 p, vec2 a, vec2 dir, float L, out float t) {
  vec2 rel = p - a;
  t = clamp(dot(rel, dir), 0.0, L);
  return length(rel - dir * t);
}
`;

/**
 * Bipinnate acacia foliage: pinnae radiating from the stalk, each a row of tiny leaflets.
 * Returns RGBA with a hard-ish alpha edge for alphaTest.
 */
export function foliageAcacia(T, { size = 256, seed = 5, key = 'props:leaf:acacia', tint = [0.108, 0.150, 0.058] } = {}) {
  return T.gpu(/* glsl */ `${FOLIAGE_COMMON}
vec4 shade(vec2 uv){
  vec2 p = uv * 2.0 - 1.0;
  float m = 0.0;
  float lit = 0.0;
  // Four small rosettes of pinnae rather than one big fan: a card must read as a CLUMP of foliage
  // from any angle. One fan per card made every leaf card legible as a palm frond.
  for (int c = 0; c < 5; c++) {
    float fc = float(c);
    vec2 cc = vec2(hash12(vec2(fc, uSeed)) - 0.5, hash12(vec2(fc + 9.0, uSeed)) - 0.5) * 1.05;
    float rot = hash12(vec2(fc + 21.0, uSeed)) * 6.2831853;
    for (int i = 0; i < 6; i++) {
      float fi = float(i);
      float r1 = hash12(vec2(fi + fc * 7.0, uSeed));
      float ang = rot + (-1.35 + 2.70 * (fi + 0.5) / 6.0) + 0.18 * (r1 - 0.5);
      float L = 0.34 + 0.28 * r1;
      vec2 dir = vec2(sin(ang), cos(ang));
      float t;
      float d = segd(p, cc, dir, L, t);
      float u = t / max(L, 1e-3);
      float bead = 0.5 + 0.5 * cos((t + r1 * 0.3) * 74.0);      // rows of tiny leaflets
      float w = 0.072 * (1.0 - 0.40 * u) * (0.45 + 0.85 * bead);
      float a = 1.0 - smoothstep(w * 0.5, w * 1.05, d);
      a *= smoothstep(0.0, 0.06, t);
      m = max(m, a);
      lit = max(lit, a * (0.35 + 0.65 * u));
      float ra = 1.0 - smoothstep(0.006, 0.013, d);              // rachis
      m = max(m, ra * step(t, L * 0.97) * 0.9);
    }
  }
  float n = tfbm(uv, 10.0, 4, uSeed) * 0.5 + 0.5;
  m *= 0.86 + 0.42 * n;
  float a = smoothstep(0.20, 0.42, m);
  vec3 c = uTint * (0.42 + 0.95 * lit);
  c *= 0.78 + 0.44 * (tfbm(uv, 22.0, 3, uSeed + 4.0) * 0.5 + 0.5);
  c = mix(c, c * vec3(1.30, 1.16, 0.72), smoothstep(0.60, 1.0, lit) * 0.45);   // sun-bleached tips
  return vec4(A(c), a);
}`, { key, size, srgb: true, seed, wrap: THREE.ClampToEdgeWrapping, uniforms: { uTint: new THREE.Vector3(tint[0], tint[1], tint[2]) } });
}

/** Broad-leaved cluster: shrubs, marula, riverine understorey. */
export function foliageBroad(T, { size = 256, seed = 8, key = 'props:leaf:broad', tint = [0.070, 0.130, 0.042] } = {}) {
  return T.gpu(/* glsl */ `${FOLIAGE_COMMON}
vec4 shade(vec2 uv){
  vec2 p = uv * 2.0 - 1.0;
  float m = 0.0, sh = 0.0;
  for (int i = 0; i < 11; i++) {
    float fi = float(i);
    float r1 = hash12(vec2(fi, uSeed));
    float r2 = hash12(vec2(fi + 13.0, uSeed));
    float r3 = hash12(vec2(fi + 77.0, uSeed));
    vec2 c = vec2((r1 - 0.5) * 1.5, (r2 - 0.42) * 1.6);
    float ang = r3 * 6.2831;
    vec2 e = vec2(cos(ang), sin(ang));
    vec2 q = p - c;
    vec2 lq = vec2(dot(q, e), dot(q, vec2(-e.y, e.x)));
    float rad = 0.30 + 0.16 * r1;
    // leaf: pointed ellipse
    float d = length(lq / vec2(rad, rad * 0.44));
    float a = 1.0 - smoothstep(0.72, 1.0, d);
    a *= 1.0 - smoothstep(0.55, 1.0, abs(lq.x) / rad);
    m = max(m, a);
    sh = max(sh, a * (0.42 + 0.62 * r2));
  }
  float n = tfbm(uv, 8.0, 3, uSeed) * 0.5 + 0.5;
  m *= 0.68 + 0.55 * n;
  float a = smoothstep(0.28, 0.50, m);
  vec3 c = uTint * (0.42 + 1.00 * sh);
  c *= 0.80 + 0.40 * (tfbm(uv, 24.0, 3, uSeed + 6.0) * 0.5 + 0.5);
  return vec4(A(c), a);
}`, { key, size, srgb: true, seed, wrap: THREE.ClampToEdgeWrapping, uniforms: { uTint: new THREE.Vector3(tint[0], tint[1], tint[2]) } });
}

/** Small, dense, grey-green thorn scrub cluster (Salvadora / dwarf Vachellia). */
export function foliageScrub(T, { size = 256, seed = 12, key = 'props:leaf:scrub', tint = [0.098, 0.115, 0.062] } = {}) {
  return T.gpu(/* glsl */ `${A}
vec4 shade(vec2 uv){
  vec2 p = uv * 2.0 - 1.0;
  float rr = length(p * vec2(1.0, 1.18));
  float blob = 1.0 - smoothstep(0.35, 1.0, rr);
  float n = tfbm(uv, 11.0, 5, uSeed) * 0.5 + 0.5;
  float fine = tworley(uv, 22.0, uSeed + 3.0).x;
  float m = blob * (0.35 + 1.15 * n) * (0.55 + 0.85 * (1.0 - fine));
  float a = smoothstep(0.30, 0.50, m);
  // dark woody twigs, never brighter than the leaves around them
  float tw = 1.0 - smoothstep(0.006, 0.017, abs(p.x * 0.7 + p.y * 0.25));
  tw *= 1.0 - smoothstep(0.45, 0.95, rr);
  a = max(a, tw * 0.85);
  vec3 c = uTint * (0.42 + 1.05 * n);
  c = mix(c, vec3(0.0300, 0.0245, 0.0140), smoothstep(0.55, 1.0, rr) * 0.55);
  c = mix(c, vec3(0.0170, 0.0140, 0.0100), tw * 0.75);
  return vec4(A(c), a);
}`, { key, size, srgb: true, seed, wrap: THREE.ClampToEdgeWrapping, uniforms: { uTint: new THREE.Vector3(tint[0], tint[1], tint[2]) } });
}
