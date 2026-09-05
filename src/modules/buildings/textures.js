// Procedural PBR surface library for the buildings module.
//
// Every opaque building surface comes from ONE pair of DataArrayTextures — albedo+metalness and
// normal+roughness+AO — with one layer per material family. Geometry carries a per-vertex `aLayer`
// index, so thatch, timber, poles, stone, plaster, corrugated iron, canvas, concrete, reed and
// painted steel all render in a SINGLE draw call per building type. This is the same idiom
// terrain/textures.js uses for its splat layers.
//
// COLOUR: the constants below are TRUE LINEAR albedo. core/Textures.gpu() no longer double-encodes
// (see CLAUDE.md "Colour authoring"), so nothing here is darkened to compensate for tone mapping —
// that guidance was wrong and the older version of this file which followed it has been replaced.
// Thatch is a golden brown (linear ~0.33/0.21/0.08 → sRGB ~0.61/0.50/0.31), timber a warm mid-brown,
// stone a mid grey. The arrays are written with an explicit linearToSRGBv() into a NoColorSpace
// target (single encode) and decoded in the shader, exactly like terrain's layer arrays.
//
// Tiling note: tfbm / tridged / tworley map uv onto a torus, so they only tile when uv is scaled by
// INTEGER factors. Every anisotropic stretch below uses integer multipliers for that reason.

import * as THREE from 'three';

/** Surface-array layer per material family. Referenced by the `aLayer` vertex attribute. */
export const LAYER = Object.freeze({
  thatch: 0,
  timber: 1,     // sawn boards — decks, beams, doors, shutters
  pole: 2,       // weathered round pole timber — posts, rafters, stilts
  stone: 3,      // coursed rubble — plinths, gate piers, chimneys
  plaster: 4,    // warm limewashed render
  iron: 5,       // corrugated galvanised sheet
  canvas: 6,     // tent canvas
  concrete: 7,   // screed, troughs, parking pads
  reed: 8,       // split reed screen, thatch underside
  steel: 9,      // dark painted steel — railings, tanks, windpump, masts
});

/** Metres of world surface covered by one texture repeat, per family. Geometry UVs are metres / TILE. */
export const TILE = Object.freeze({
  thatch: 2.60,    // 5 courses per repeat → a thatch course every 0.52 m
  timber: 1.20,    // 6 boards per repeat → 200 mm boards
  pole: 0.90,
  stone: 3.20,     // 5 courses per repeat → 0.64 m courses, ~0.35 m stones
  plaster: 3.00,
  iron: 1.20,      // 12 corrugations per repeat → 100 mm pitch
  canvas: 2.00,
  concrete: 2.50,
  reed: 1.80,      // 46 rods per repeat → 39 mm reeds
  steel: 1.50,
  // buckets that do not sample the array
  glass: 1.0, lamp: 1.0, sign: 1.0, water: 1.0, solar: 1.0,
});

/** Render bucket per family. opaque = the array material; the rest are small dedicated materials. */
export const BUCKET = Object.freeze({
  thatch: 'opaque', timber: 'opaque', pole: 'opaque', stone: 'opaque', plaster: 'opaque',
  iron: 'opaque', canvas: 'opaque', concrete: 'opaque', reed: 'opaque', steel: 'opaque',
  glass: 'glow', lamp: 'glow',
  water: 'shiny', solar: 'shiny',
  sign: 'sign',
});

export function layerOf(family) { return LAYER[family] ?? 0; }
export function bucketOf(family) { return BUCKET[family] || 'opaque'; }

const SPECS = [
  // ------------------------------------------------------------------ 0 THATCH
  {
    name: 'thatch', seed: 11, normalStrength: 0.30,
    height: /* glsl */ `float height(vec2 uv){
  float strand = tfbm(uv * vec2(28.0, 2.0), 44.0, 3, uSeed) * 0.5 + 0.5;
  float bundle = tfbm(uv * vec2(8.0, 1.0), 11.0, 3, uSeed + 5.0) * 0.5 + 0.5;
  float c = fract(uv.y * 5.0);
  float course = smoothstep(0.0, 0.22, c) * (1.0 - smoothstep(0.78, 1.0, c));
  float clump = tfbm(uv * vec2(4.0, 1.0), 6.0, 2, uSeed + 13.0) * 0.5 + 0.5;
  return clamp(strand * 0.28 + bundle * 0.26 + course * 0.34 + clump * 0.12, 0.0, 1.0);
}`,
    albedo: /* glsl */ `vec3 albedo(vec2 uv, float h){
  vec3 shadow = vec3(0.045, 0.028, 0.011);   // deep between the strands
  vec3 mid    = vec3(0.330, 0.205, 0.075);   // body of dry grass thatch
  vec3 straw  = vec3(0.580, 0.420, 0.170);   // sunlit strand tips
  vec3 c = mix(shadow, mid, smoothstep(0.08, 0.55, h));
  c = mix(c, straw, smoothstep(0.55, 0.96, h));
  float weath = smoothstep(0.55, 0.95, tfbm(uv * vec2(3.0, 1.0), 5.0, 3, uSeed + 21.0) * 0.5 + 0.5);
  c = mix(c, vec3(0.190, 0.168, 0.115), weath * 0.45);            // grey weathered patches
  float moss = smoothstep(0.74, 0.99, tfbm(uv * vec2(2.0, 1.0), 3.0, 3, uSeed + 41.0) * 0.5 + 0.5);
  c = mix(c, vec3(0.055, 0.062, 0.024), moss * 0.35);
  c *= 0.84 + 0.32 * (tfbm(uv * vec2(14.0, 2.0), 70.0, 2, uSeed + 9.0) * 0.5 + 0.5);
  return c;
}`,
    rough: `float rough(vec2 uv, float h){ return clamp(0.99 - 0.12 * h, 0.78, 1.0); }`,
    ao: `float ao(vec2 uv, float h){ return mix(0.34, 1.0, smoothstep(0.02, 0.75, h)); }`,
    metal: `float metal(vec2 uv, float h){ return 0.0; }`,
  },
  // ------------------------------------------------------------------ 1 TIMBER (sawn boards)
  {
    name: 'timber', seed: 27, normalStrength: 0.10,
    height: /* glsl */ `float height(vec2 uv){
  float board = fract(uv.y * 6.0);
  float gap = smoothstep(0.0, 0.055, board) * (1.0 - smoothstep(0.945, 1.0, board));
  float grain = tfbm(uv * vec2(2.0, 20.0), 30.0, 3, uSeed) * 0.5 + 0.5;
  float ring = tridged(uv * vec2(1.0, 14.0), 9.0, 3, uSeed + 3.0);
  float saw = tfbm(uv * vec2(1.0, 40.0), 90.0, 2, uSeed + 8.0) * 0.5 + 0.5;
  return clamp(gap * 0.52 + grain * 0.22 + ring * 0.18 + saw * 0.08, 0.0, 1.0);
}`,
    albedo: /* glsl */ `vec3 albedo(vec2 uv, float h){
  float ring = tridged(uv * vec2(1.0, 14.0), 9.0, 3, uSeed + 3.0);
  vec3 pale = vec3(0.335, 0.208, 0.094);
  vec3 mid  = vec3(0.200, 0.115, 0.048);
  vec3 dark = vec3(0.072, 0.038, 0.016);
  vec3 c = mix(mid, pale, smoothstep(0.25, 0.85, ring));
  float bi = floor(uv.y * 6.0);                                    // each board a different piece of wood
  c *= 0.74 + 0.55 * hash12(vec2(bi, floor(uv.x * 2.0) + 7.0));
  c = mix(dark, c, smoothstep(0.0, 0.22, h));                      // shadow in the board gaps
  float knot = smoothstep(0.87, 0.99, tfbm(uv * vec2(3.0, 4.0), 8.0, 2, uSeed + 19.0) * 0.5 + 0.5);
  c = mix(c, vec3(0.045, 0.024, 0.010), knot * 0.8);
  c *= 0.90 + 0.20 * (tfbm(uv * vec2(2.0, 24.0), 48.0, 2, uSeed + 31.0) * 0.5 + 0.5);
  return c;
}`,
    rough: `float rough(vec2 uv, float h){ return clamp(0.86 - 0.16 * h, 0.55, 0.98); }`,
    ao: `float ao(vec2 uv, float h){ return mix(0.42, 1.0, smoothstep(0.0, 0.30, h)); }`,
    metal: `float metal(vec2 uv, float h){ return 0.0; }`,
  },
  // ------------------------------------------------------------------ 2 POLE (weathered round timber)
  {
    name: 'pole', seed: 43, normalStrength: 0.16,
    height: /* glsl */ `float height(vec2 uv){
  float grain = tfbm(uv * vec2(3.0, 16.0), 26.0, 4, uSeed) * 0.5 + 0.5;
  float check = tridged(uv * vec2(2.0, 10.0), 6.0, 3, uSeed + 4.0);   // drying checks along the pole
  float adze = tfbm(uv * vec2(6.0, 3.0), 9.0, 2, uSeed + 12.0) * 0.5 + 0.5;
  return clamp(grain * 0.32 + check * 0.44 + adze * 0.24, 0.0, 1.0);
}`,
    albedo: /* glsl */ `vec3 albedo(vec2 uv, float h){
  vec3 dark   = vec3(0.036, 0.026, 0.016);
  vec3 mid    = vec3(0.135, 0.100, 0.066);
  vec3 silver = vec3(0.265, 0.243, 0.212);    // sun-silvered surface
  vec3 c = mix(dark, mid, smoothstep(0.05, 0.5, h));
  c = mix(c, silver, smoothstep(0.5, 0.95, h) * 0.75);
  float weather = smoothstep(0.4, 0.9, tfbm(uv * vec2(2.0, 3.0), 4.0, 3, uSeed + 22.0) * 0.5 + 0.5);
  c = mix(c, vec3(0.165, 0.152, 0.138), weather * 0.4);
  c *= 0.86 + 0.26 * (tfbm(uv * vec2(4.0, 20.0), 55.0, 2, uSeed + 7.0) * 0.5 + 0.5);
  return c;
}`,
    rough: `float rough(vec2 uv, float h){ return clamp(0.97 - 0.14 * h, 0.7, 1.0); }`,
    ao: `float ao(vec2 uv, float h){ return mix(0.45, 1.0, smoothstep(0.0, 0.6, h)); }`,
    metal: `float metal(vec2 uv, float h){ return 0.0; }`,
  },
  // ------------------------------------------------------------------ 3 STONE (coursed rubble)
  {
    name: 'stone', seed: 59, normalStrength: 0.26,
    height: /* glsl */ `float height(vec2 uv){
  float row = uv.y * 5.0;
  float ri = floor(row), rf = fract(row);
  float off = hash12(vec2(ri, 3.0)) * 0.5;
  float col = (uv.x + off) * 9.0;
  float ci = floor(col), cf = fract(col);
  vec2 cid = vec2(ci, ri);
  float jx = (hash12(cid + 1.0) - 0.5) * 0.34;
  float jy = (hash12(cid + 5.0) - 0.5) * 0.26;
  vec2 d = vec2(cf - 0.5 - jx, rf - 0.5 - jy);
  float rx = 0.36 + hash12(cid + 9.0) * 0.10;
  float ry = 0.34 + hash12(cid + 17.0) * 0.08;
  float stone = 1.0 - smoothstep(0.70, 1.0, max(abs(d.x) / rx, abs(d.y) / ry)
                                 + 0.16 * (tfbm(uv * 18.0, 26.0, 2, uSeed + 2.0) * 0.5 + 0.5));
  float face = tfbm(uv * 26.0, 40.0, 3, uSeed + 6.0) * 0.5 + 0.5;
  float mortar = tfbm(uv * 30.0, 60.0, 2, uSeed + 11.0) * 0.5 + 0.5;
  return clamp(stone * (0.70 + 0.22 * face) + (1.0 - stone) * mortar * 0.16, 0.0, 1.0);
}`,
    albedo: /* glsl */ `vec3 albedo(vec2 uv, float h){
  float ri = floor(uv.y * 5.0);
  float off = hash12(vec2(ri, 3.0)) * 0.5;
  float ci = floor((uv.x + off) * 9.0);
  vec2 cid = vec2(ci, ri);
  vec3 grey = vec3(0.150, 0.146, 0.138);
  vec3 warm = vec3(0.215, 0.170, 0.118);
  vec3 dark = vec3(0.058, 0.054, 0.049);
  vec3 pale = vec3(0.310, 0.298, 0.270);
  vec3 s = mix(grey, warm, hash12(cid + 23.0));
  s = mix(s, pale, smoothstep(0.62, 1.0, hash12(cid + 47.0)) * 0.7);
  s = mix(s, dark, smoothstep(0.24, 0.0, hash12(cid + 71.0)) * 0.55);
  vec3 c = mix(vec3(0.215, 0.205, 0.185), s, smoothstep(0.14, 0.34, h));   // mortar → stone
  c *= 0.82 + 0.34 * (tfbm(uv * 22.0, 34.0, 3, uSeed + 15.0) * 0.5 + 0.5);
  float lich = smoothstep(0.80, 0.99, tfbm(uv * 6.0, 9.0, 3, uSeed + 51.0) * 0.5 + 0.5);
  c = mix(c, vec3(0.105, 0.115, 0.058), lich * 0.5);
  return c;
}`,
    rough: `float rough(vec2 uv, float h){ return clamp(0.94 - 0.14 * h, 0.65, 1.0); }`,
    ao: `float ao(vec2 uv, float h){ return mix(0.30, 1.0, smoothstep(0.05, 0.45, h)); }`,
    metal: `float metal(vec2 uv, float h){ return 0.0; }`,
  },
  // ------------------------------------------------------------------ 4 PLASTER (limewashed render)
  {
    name: 'plaster', seed: 71, normalStrength: 0.05,
    height: /* glsl */ `float height(vec2 uv){
  float trowel = tfbm(uv * 7.0, 10.0, 4, uSeed) * 0.5 + 0.5;
  float grit = tfbm(uv * 40.0, 80.0, 2, uSeed + 3.0) * 0.5 + 0.5;
  float crack = 1.0 - smoothstep(0.0, 0.035, abs(tridged(uv * 3.0, 5.0, 3, uSeed + 8.0) - 0.78));
  return clamp(trowel * 0.66 + grit * 0.28 - crack * 0.30 + 0.06, 0.0, 1.0);
}`,
    albedo: /* glsl */ `vec3 albedo(vec2 uv, float h){
  vec3 c = vec3(0.520, 0.470, 0.392) * (0.88 + 0.24 * h);
  float blotch = tfbm(uv * 4.0, 5.0, 3, uSeed + 9.0) * 0.5 + 0.5;
  c = mix(c, vec3(0.430, 0.372, 0.292), smoothstep(0.45, 0.95, blotch) * 0.55);
  float streak = tfbm(uv * vec2(24.0, 1.0), 30.0, 3, uSeed + 27.0) * 0.5 + 0.5;
  c = mix(c, vec3(0.270, 0.230, 0.175), smoothstep(0.62, 1.0, streak) * 0.35);
  c *= 0.94 + 0.12 * (tfbm(uv * 30.0, 55.0, 2, uSeed + 33.0) * 0.5 + 0.5);
  return c;
}`,
    rough: `float rough(vec2 uv, float h){ return clamp(0.88 - 0.10 * h, 0.65, 0.98); }`,
    ao: `float ao(vec2 uv, float h){ return mix(0.80, 1.0, h); }`,
    metal: `float metal(vec2 uv, float h){ return 0.0; }`,
  },
  // ------------------------------------------------------------------ 5 IRON (corrugated galvanised)
  {
    name: 'iron', seed: 83, normalStrength: 0.55,
    height: /* glsl */ `float height(vec2 uv){
  float corr = 0.5 + 0.5 * sin(uv.x * 6.28318530718 * 12.0);
  corr = pow(corr, 0.8);
  float dent = tfbm(uv * vec2(4.0, 4.0), 8.0, 3, uSeed) * 0.5 + 0.5;
  float lv = fract(uv.y * 2.0);
  float lap = smoothstep(0.0, 0.04, lv) * (1.0 - smoothstep(0.96, 1.0, lv));
  return clamp(corr * 0.72 + dent * 0.10 + lap * 0.18, 0.0, 1.0);
}`,
    albedo: /* glsl */ `vec3 albedo(vec2 uv, float h){
  vec3 c = mix(vec3(0.088, 0.092, 0.096), vec3(0.180, 0.188, 0.194), smoothstep(0.2, 0.9, h));
  float sp = tworley(uv * vec2(4.0, 2.0), 22.0, uSeed + 5.0).x;      // galvanised spangle
  c *= 0.86 + 0.28 * smoothstep(0.1, 0.6, sp);
  float r = smoothstep(0.58, 0.95, tfbm(uv * vec2(3.0, 3.0), 6.0, 4, uSeed + 17.0) * 0.5 + 0.5);
  c = mix(c, vec3(0.150, 0.055, 0.020), r * 0.85);
  float r2 = smoothstep(0.80, 0.99, tfbm(uv * vec2(8.0, 8.0), 20.0, 3, uSeed + 23.0) * 0.5 + 0.5);
  c = mix(c, vec3(0.068, 0.025, 0.010), r2 * 0.7);
  return c;
}`,
    rough: `float rough(vec2 uv, float h){
  float r = smoothstep(0.58, 0.95, tfbm(uv * vec2(3.0, 3.0), 6.0, 4, uSeed + 17.0) * 0.5 + 0.5);
  return clamp(mix(0.42, 0.94, r) + 0.10 * (1.0 - h), 0.28, 1.0);
}`,
    ao: `float ao(vec2 uv, float h){ return mix(0.62, 1.0, h); }`,
    metal: `float metal(vec2 uv, float h){
  float r = smoothstep(0.58, 0.95, tfbm(uv * vec2(3.0, 3.0), 6.0, 4, uSeed + 17.0) * 0.5 + 0.5);
  return mix(0.80, 0.05, r);
}`,
  },
  // ------------------------------------------------------------------ 6 CANVAS (tent)
  {
    name: 'canvas', seed: 97, normalStrength: 0.08,
    height: /* glsl */ `float height(vec2 uv){
  float warp = 0.5 + 0.5 * sin(uv.x * 6.28318530718 * 96.0);
  float weft = 0.5 + 0.5 * sin(uv.y * 6.28318530718 * 96.0);
  float slack = tfbm(uv * 3.0, 4.0, 3, uSeed) * 0.5 + 0.5;
  float sv = fract(uv.y * 3.0);
  float seam = smoothstep(0.0, 0.03, sv) * (1.0 - smoothstep(0.97, 1.0, sv));
  return clamp(max(warp, weft) * 0.34 + slack * 0.40 + seam * 0.26, 0.0, 1.0);
}`,
    albedo: /* glsl */ `vec3 albedo(vec2 uv, float h){
  vec3 c = vec3(0.520, 0.478, 0.386) * (0.90 + 0.20 * h);
  float stain = tfbm(uv * 5.0, 7.0, 3, uSeed + 13.0) * 0.5 + 0.5;
  c = mix(c, vec3(0.330, 0.292, 0.220), smoothstep(0.55, 0.98, stain) * 0.5);
  c *= 0.94 + 0.12 * (tfbm(uv * 40.0, 70.0, 2, uSeed + 5.0) * 0.5 + 0.5);
  return c;
}`,
    rough: `float rough(vec2 uv, float h){ return 0.92; }`,
    ao: `float ao(vec2 uv, float h){ return mix(0.85, 1.0, h); }`,
    metal: `float metal(vec2 uv, float h){ return 0.0; }`,
  },
  // ------------------------------------------------------------------ 7 CONCRETE
  {
    name: 'concrete', seed: 109, normalStrength: 0.07,
    height: /* glsl */ `float height(vec2 uv){
  float f = tfbm(uv * 9.0, 14.0, 4, uSeed) * 0.5 + 0.5;
  float agg = tworley(uv, 34.0, uSeed + 4.0).x;
  float pit = smoothstep(0.10, 0.0, tworley(uv, 60.0, uSeed + 8.0).x);
  return clamp(f * 0.5 + agg * 0.42 - pit * 0.3, 0.0, 1.0);
}`,
    albedo: /* glsl */ `vec3 albedo(vec2 uv, float h){
  vec3 c = mix(vec3(0.118, 0.115, 0.108), vec3(0.245, 0.240, 0.226), smoothstep(0.15, 0.85, h));
  float stain = tfbm(uv * 4.0, 6.0, 3, uSeed + 21.0) * 0.5 + 0.5;
  c = mix(c, vec3(0.088, 0.084, 0.078), smoothstep(0.55, 0.95, stain) * 0.5);
  c *= 0.90 + 0.20 * (tfbm(uv * 26.0, 44.0, 2, uSeed + 3.0) * 0.5 + 0.5);
  return c;
}`,
    rough: `float rough(vec2 uv, float h){ return clamp(0.93 - 0.10 * h, 0.7, 1.0); }`,
    ao: `float ao(vec2 uv, float h){ return mix(0.66, 1.0, h); }`,
    metal: `float metal(vec2 uv, float h){ return 0.0; }`,
  },
  // ------------------------------------------------------------------ 8 REED (screen / thatch underside)
  {
    name: 'reed', seed: 127, normalStrength: 0.34,
    height: /* glsl */ `float height(vec2 uv){
  float col = uv.x * 46.0;
  float ci = floor(col), cf = fract(col);
  float w = 0.30 + hash12(vec2(ci, 2.0)) * 0.22;
  float rod = 1.0 - smoothstep(w, 0.5, abs(cf - 0.5));
  float bow = 1.0 - abs(cf - 0.5) * 1.6;
  float node = smoothstep(0.75, 1.0, 0.5 + 0.5 * sin(uv.y * 6.28318530718 * 6.0 + hash12(vec2(ci, 9.0)) * 6.0));
  float lv = fract(uv.y * 3.0);
  float lash = smoothstep(0.0, 0.05, lv) * (1.0 - smoothstep(0.95, 1.0, lv));
  return clamp(rod * bow * 0.72 + node * 0.12 + lash * 0.16, 0.0, 1.0);
}`,
    albedo: /* glsl */ `vec3 albedo(vec2 uv, float h){
  float ci = floor(uv.x * 46.0);
  vec3 c = mix(vec3(0.215, 0.152, 0.070), vec3(0.400, 0.300, 0.145), hash12(vec2(ci, 33.0)));
  c = mix(vec3(0.030, 0.020, 0.010), c, smoothstep(0.02, 0.35, h));
  c *= 0.86 + 0.28 * (tfbm(uv * vec2(4.0, 20.0), 40.0, 2, uSeed + 6.0) * 0.5 + 0.5);
  return c;
}`,
    rough: `float rough(vec2 uv, float h){ return clamp(0.96 - 0.14 * h, 0.72, 1.0); }`,
    ao: `float ao(vec2 uv, float h){ return mix(0.30, 1.0, smoothstep(0.0, 0.55, h)); }`,
    metal: `float metal(vec2 uv, float h){ return 0.0; }`,
  },
  // ------------------------------------------------------------------ 9 STEEL (dark painted)
  {
    name: 'steel', seed: 149, normalStrength: 0.05,
    height: /* glsl */ `float height(vec2 uv){
  float f = tfbm(uv * 12.0, 20.0, 3, uSeed) * 0.5 + 0.5;
  float chip = smoothstep(0.86, 1.0, tfbm(uv * 22.0, 40.0, 2, uSeed + 4.0) * 0.5 + 0.5);
  return clamp(f * 0.7 - chip * 0.4 + 0.3, 0.0, 1.0);
}`,
    albedo: /* glsl */ `vec3 albedo(vec2 uv, float h){
  vec3 c = vec3(0.052, 0.055, 0.058) * (0.7 + 0.7 * h);
  float chip = smoothstep(0.86, 1.0, tfbm(uv * 22.0, 40.0, 2, uSeed + 4.0) * 0.5 + 0.5);
  c = mix(c, vec3(0.125, 0.056, 0.026), chip * 0.8);        // rust through the paint
  return c;
}`,
    rough: `float rough(vec2 uv, float h){
  float chip = smoothstep(0.86, 1.0, tfbm(uv * 22.0, 40.0, 2, uSeed + 4.0) * 0.5 + 0.5);
  return clamp(0.50 - 0.16 * h + 0.42 * chip, 0.25, 1.0);
}`,
    ao: `float ao(vec2 uv, float h){ return mix(0.80, 1.0, h); }`,
    metal: `float metal(vec2 uv, float h){ return 0.85; }`,
  },
];

export const SURFACE_NAMES = SPECS.map((s) => s.name);

export function isSoftwareGL(renderer) {
  try {
    const gl = renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    return /swiftshader|llvmpipe|software/i.test(String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : ''));
  } catch { return false; }
}

/**
 * Build the two DataArrayTextures every opaque building surface samples.
 *   albedo array: RGB = sRGB-encoded albedo bytes (decoded in the shader), A = metalness.
 *   normal array: RG  = tangent-space normal xy, B = roughness, A = ambient occlusion.
 */
export function buildSurfaceArrays(ctx, { size = 512, anisotropy = 8 } = {}) {
  const tex = ctx.textures;
  const renderer = ctx.renderer;
  const n = SPECS.length;
  const albData = new Uint8Array(size * size * 4 * n);
  const nrmData = new Uint8Array(size * size * 4 * n);
  const slice = new Uint8Array(size * size * 4);

  for (let i = 0; i < n; i++) {
    const s = SPECS[i];
    const seed = s.seed + (ctx.world.seed % 997) * 0.013;
    const heightTex = tex.gpu(`${s.height}\nvec4 shade(vec2 uv){ return vec4(vec3(height(uv)), 1.0); }`,
      { size, type: THREE.HalfFloatType, mipmaps: false, seed });
    const albTex = tex.gpu(`${s.height}\n${s.albedo}\n${s.metal}
vec4 shade(vec2 uv){
  float h = texture(uH, uv).r;
  vec3 c = clamp(albedo(uv, h), 0.0, 1.0);
  return vec4(linearToSRGBv(c), clamp(metal(uv, h), 0.0, 1.0));
}`, { size, uniforms: { uH: heightTex }, mipmaps: false, seed });
    const nrmTex = tex.gpu(`${s.height}\n${s.rough}\n${s.ao}
vec4 shade(vec2 uv){
  float px = 1.0 / uSize;
  float l = texture(uH, uv + vec2(-px, 0.0)).r, r = texture(uH, uv + vec2(px, 0.0)).r;
  float d = texture(uH, uv + vec2(0.0, -px)).r, u = texture(uH, uv + vec2(0.0, px)).r;
  float h = texture(uH, uv).r;
  vec3 nn = normalize(vec3((l - r) * uStrength * uSize * 0.5, (d - u) * uStrength * uSize * 0.5, 1.0));
  return vec4(nn.xy * 0.5 + 0.5, clamp(rough(uv, h), 0.0, 1.0), clamp(ao(uv, h), 0.0, 1.0));
}`, { size, uniforms: { uH: heightTex, uStrength: s.normalStrength }, mipmaps: false, seed });

    renderer.readRenderTargetPixels(albTex.userData.renderTarget, 0, 0, size, size, slice);
    albData.set(slice, i * size * size * 4);
    renderer.readRenderTargetPixels(nrmTex.userData.renderTarget, 0, 0, size, size, slice);
    nrmData.set(slice, i * size * size * 4);

    for (const t of [heightTex, albTex, nrmTex]) { t.userData.renderTarget?.dispose(); t.dispose(); }
  }

  const make = (data, name) => {
    const t = new THREE.DataArrayTexture(data, size, size, n);
    t.name = name;
    t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType;
    t.colorSpace = THREE.NoColorSpace;             // albedo holds sRGB bytes, decoded in the shader
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = Math.max(1, Math.min(anisotropy, tex.maxAnisotropy || 1));
    t.needsUpdate = true;
    return t;
  };
  const tAlb = make(albData, 'buildings-albedo-array');
  const tNrm = make(nrmData, 'buildings-normal-array');
  return { tAlb, tNrm, size, layers: n, dispose() { tAlb.dispose(); tNrm.dispose(); } };
}

/** Park-name sign face: carved pale lettering routed into a dark stained board. */
export function signTexture(ctx, parkName) {
  return ctx.textures.canvas(1024, (c, s) => {
    const g = c.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, '#4a331d'); g.addColorStop(0.5, '#3a2714'); g.addColorStop(1, '#2c1d0e');
    c.fillStyle = g; c.fillRect(0, 0, s, s);
    for (let i = 0; i < 260; i++) {
      const y = (i * 97.13) % s;
      c.strokeStyle = `rgba(${26 + (i % 7) * 7},${17 + (i % 5) * 5},${9 + (i % 3) * 4},0.5)`;
      c.lineWidth = 1 + (i % 3);
      c.beginPath();
      c.moveTo(0, y);
      c.bezierCurveTo(s * 0.3, y + ((i * 31) % 17) - 8, s * 0.7, y - ((i * 19) % 15) + 7, s, y + ((i * 7) % 11) - 5);
      c.stroke();
    }
    c.strokeStyle = 'rgba(14,9,4,0.85)'; c.lineWidth = s * 0.018;
    c.strokeRect(s * 0.045, s * 0.13, s * 0.91, s * 0.74);
    c.strokeStyle = 'rgba(206,166,104,0.35)'; c.lineWidth = s * 0.006;
    c.strokeRect(s * 0.055, s * 0.145, s * 0.89, s * 0.71);
    const name = String(parkName || 'MARA RIDGE').toUpperCase();
    c.textAlign = 'center'; c.textBaseline = 'middle';
    let fs = Math.round(s * 0.155);
    c.font = `700 ${fs}px Georgia, "Times New Roman", serif`;
    while (c.measureText(name).width > s * 0.80 && fs > 20) {
      fs -= 4; c.font = `700 ${fs}px Georgia, "Times New Roman", serif`;
    }
    c.fillStyle = 'rgba(10,6,2,0.92)';
    c.fillText(name, s * 0.5 + s * 0.006, s * 0.42 + s * 0.008);
    c.fillStyle = '#d8ac68';
    c.fillText(name, s * 0.5, s * 0.42);
    c.font = `600 ${Math.round(s * 0.072)}px Georgia, "Times New Roman", serif`;
    c.fillStyle = 'rgba(10,6,2,0.92)';
    c.fillText('SAFARI PARK', s * 0.5 + s * 0.004, s * 0.635 + s * 0.005);
    c.fillStyle = '#bb904f';
    c.fillText('SAFARI PARK', s * 0.5, s * 0.635);
    c.strokeStyle = 'rgba(206,166,104,0.35)'; c.lineWidth = s * 0.008;
    c.beginPath(); c.moveTo(s * 0.2, s * 0.735); c.lineTo(s * 0.8, s * 0.735); c.stroke();
  }, { key: 'buildings:sign:' + String(parkName || 'MARA RIDGE'), srgb: true });
}
