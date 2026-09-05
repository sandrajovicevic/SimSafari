// Procedural PBR layer sets for the terrain splat, packed into two DataArrayTextures so the
// splat shader needs only 2 samplers for 6 layers:
//   tAlb layer i : rgb = sRGB-encoded albedo, a = height (for height-based blending)
//   tNrm layer i : rg  = tangent normal xy (0..1), b = roughness, a = ambient occlusion
// Every map is rendered by ctx.textures.gpu() (GLSL snippets, no assets) and read back once.
import * as THREE from 'three';

export const LAYER = Object.freeze({ GRASS: 0, DRY_GRASS: 1, DIRT: 2, ROCK: 3, SAND: 4, MUD: 5 });
export const LAYER_NAMES = ['grass', 'dryGrass', 'dirt', 'rock', 'sand', 'mud'];

// ---- height / albedo / roughness / ao snippets per layer -------------------------------------
// Conventions: height(uv) in 0..1; albedo(uv,h) returns LINEAR colour; rough(uv,h), ao(uv,h) in 0..1.

const GRASS = {
  seed: 11, normalStrength: 0.09,
  height: /* glsl */ `
float height(vec2 uv){
  vec2 w = tworley(uv, 34.0, uSeed);
  float tuft = 1.0 - smoothstep(0.05, 0.75, w.x);
  vec2 w2 = tworley(uv + 0.37, 61.0, uSeed + 5.0);
  float tuft2 = 1.0 - smoothstep(0.05, 0.8, w2.x);
  float blades = tfbm(uv * vec2(1.0, 7.0), 40.0, 3, uSeed + 9.0) * 0.5 + 0.5;
  float soil = tfbm(uv, 5.0, 4, uSeed + 1.0) * 0.5 + 0.5;
  float fine = tfbm(uv, 110.0, 2, uSeed + 3.0) * 0.5 + 0.5;
  return clamp(0.22 * soil + 0.32 * tuft + 0.22 * tuft2 + 0.16 * blades + 0.08 * fine, 0.0, 1.0);
}`,
  albedo: /* glsl */ `
vec3 albedo(vec2 uv, float h){
  float pt = tfbm(uv, 3.0, 3, uSeed + 21.0) * 0.5 + 0.5;
  float blades = tfbm(uv * vec2(1.0, 7.0), 40.0, 3, uSeed + 9.0) * 0.5 + 0.5;
  vec3 soil = vec3(0.145, 0.092, 0.056);
  vec3 dark = vec3(0.058, 0.076, 0.034);
  vec3 tip  = vec3(0.160, 0.185, 0.082);
  vec3 dry  = vec3(0.390, 0.295, 0.135);
  vec3 g = mix(dark, tip, smoothstep(0.3, 0.85, h));
  g = mix(g, dry, smoothstep(0.55, 0.8, pt) * 0.55);
  g = mix(g, g * vec3(1.15, 1.1, 0.8), smoothstep(0.6, 0.9, blades) * 0.5);
  vec3 c = mix(soil, g, smoothstep(0.14, 0.38, h));
  c *= 0.92 + 0.16 * hash12(floor(uv * 1024.0) + uSeed);
  return c;
}`,
  roughness: 'float rough(vec2 uv, float h){ return 0.92 - 0.14 * h; }',
  ao: 'float ao(vec2 uv, float h){ return mix(0.55, 1.0, smoothstep(0.1, 0.8, h)); }',
};

const DRY_GRASS = {
  seed: 23, normalStrength: 0.09,
  height: GRASS.height,
  albedo: /* glsl */ `
vec3 albedo(vec2 uv, float h){
  float pt = tfbm(uv, 3.0, 3, uSeed + 21.0) * 0.5 + 0.5;
  float blades = tfbm(uv * vec2(1.0, 7.0), 40.0, 3, uSeed + 9.0) * 0.5 + 0.5;
  vec3 soil = vec3(0.200, 0.122, 0.062);
  vec3 dark = vec3(0.238, 0.163, 0.068);
  vec3 tip  = vec3(0.520, 0.360, 0.115);
  vec3 grn  = vec3(0.215, 0.215, 0.082);
  vec3 g = mix(dark, tip, smoothstep(0.3, 0.85, h));
  g = mix(g, grn, smoothstep(0.62, 0.85, pt) * 0.5);
  g = mix(g, g * vec3(1.12, 1.08, 0.9), smoothstep(0.6, 0.9, blades) * 0.5);
  vec3 c = mix(soil, g, smoothstep(0.14, 0.38, h));
  c *= 0.92 + 0.16 * hash12(floor(uv * 1024.0) + uSeed);
  return c;
}`,
  roughness: 'float rough(vec2 uv, float h){ return 0.9 - 0.12 * h; }',
  ao: GRASS.ao,
};

const DIRT = {
  seed: 37, normalStrength: 0.07,
  height: /* glsl */ `
float pebbles(vec2 uv){
  vec2 w = tworley(uv, 48.0, uSeed + 2.0);
  float mask = step(0.62, hash12(floor(uv * 48.0) + uSeed));
  return smoothstep(0.42, 0.1, w.x) * mask;
}
float height(vec2 uv){
  float base = tfbm(uv, 6.0, 5, uSeed) * 0.5 + 0.5;
  float peb = pebbles(uv);
  vec2 c = tworley(uv, 7.0, uSeed + 4.0);
  float crack = 1.0 - smoothstep(0.0, 0.05, c.y - c.x);
  float fine = tfbm(uv, 90.0, 2, uSeed + 8.0) * 0.5 + 0.5;
  float ruts = tfbm(uv * vec2(3.0, 1.0), 6.0, 3, uSeed + 12.0) * 0.5 + 0.5;
  return clamp(0.36 * base + 0.32 * peb + 0.12 * fine + 0.12 * ruts - 0.16 * crack + 0.1, 0.0, 1.0);
}`,
  albedo: /* glsl */ `
vec3 albedo(vec2 uv, float h){
  float peb = pebbles(uv);
  vec2 c = tworley(uv, 7.0, uSeed + 4.0);
  float crack = 1.0 - smoothstep(0.0, 0.05, c.y - c.x);
  float lf = tfbm(uv, 2.0, 3, uSeed + 30.0) * 0.5 + 0.5;
  vec3 lo = vec3(0.150, 0.076, 0.044);
  vec3 hi = vec3(0.360, 0.200, 0.118);
  vec3 col = mix(lo, hi, smoothstep(0.2, 0.75, h));
  col = mix(col, col * vec3(0.88, 0.96, 1.06) + 0.03, smoothstep(0.4, 0.7, lf) * 0.45);
  vec3 stone = mix(vec3(0.30, 0.26, 0.22), vec3(0.46, 0.40, 0.33), hash12(floor(uv * 48.0) + 3.0));
  col = mix(col, stone, smoothstep(0.2, 0.6, peb));
  col *= 1.0 - 0.5 * crack;
  col *= 0.9 + 0.2 * hash12(floor(uv * 1024.0) + uSeed);
  return col;
}`,
  roughness: 'float rough(vec2 uv, float h){ return 0.96 - 0.12 * h; }',
  ao: 'float ao(vec2 uv, float h){ return mix(0.6, 1.0, smoothstep(0.1, 0.7, h)); }',
};

const ROCK = {
  seed: 53, normalStrength: 0.16,
  height: /* glsl */ `
float height(vec2 uv){
  float big = tridged(uv, 2.0, 3, uSeed);
  float mid = tfbm(uv, 9.0, 4, uSeed + 3.0) * 0.5 + 0.5;
  vec2 c = tworley(uv, 4.0, uSeed + 7.0);
  float crack = 1.0 - smoothstep(0.0, 0.06, c.y - c.x);
  vec2 c2 = tworley(uv + 0.5, 11.0, uSeed + 17.0);
  float crack2 = 1.0 - smoothstep(0.0, 0.035, c2.y - c2.x);
  float grain = tfbm(uv, 160.0, 2, uSeed + 11.0) * 0.5 + 0.5;
  float exfol = smoothstep(0.3, 0.7, tfbm(uv, 3.0, 2, uSeed + 13.0) * 0.5 + 0.5);
  return clamp(0.42 * big + 0.28 * mid + 0.08 * grain + 0.16 * exfol - 0.22 * crack - 0.1 * crack2 + 0.06, 0.0, 1.0);
}`,
  albedo: /* glsl */ `
vec3 albedo(vec2 uv, float h){
  float mid = tfbm(uv, 9.0, 4, uSeed + 3.0) * 0.5 + 0.5;
  vec2 c = tworley(uv, 4.0, uSeed + 7.0);
  float crack = 1.0 - smoothstep(0.0, 0.06, c.y - c.x);
  float sp = hash12(floor(uv * 1024.0) + uSeed);
  float sp2 = hash12(floor(uv * 512.0) + uSeed + 9.0);
  vec3 col = mix(vec3(0.078, 0.066, 0.056), vec3(0.290, 0.252, 0.212), mid);
  col = mix(col, vec3(0.380, 0.262, 0.205), step(0.86, sp) * 0.7);    // pink feldspar
  col = mix(col, vec3(0.045, 0.042, 0.040), step(0.88, sp2) * 0.6);   // biotite
  float lich = tfbm(uv, 12.0, 3, uSeed + 5.0) * 0.5 + 0.5;
  float lich2 = tfbm(uv + 0.3, 7.0, 3, uSeed + 25.0) * 0.5 + 0.5;
  col = mix(col, vec3(0.300, 0.128, 0.018), smoothstep(0.72, 0.86, lich) * 0.45);  // orange lichen
  col = mix(col, vec3(0.140, 0.155, 0.072), smoothstep(0.72, 0.86, lich2) * 0.45); // grey-green lichen
  float stain = tfbm(uv * vec2(1.0, 5.0), 6.0, 3, uSeed + 31.0) * 0.5 + 0.5;
  col *= mix(0.55, 1.05, smoothstep(0.30, 0.70, stain));                            // water streaks
  col *= mix(0.28, 1.10, smoothstep(0.03, 0.62, h));                                // dark crevices
  col *= 1.0 - 0.62 * crack;
  return col;
}`,
  roughness: 'float rough(vec2 uv, float h){ return 0.7 + 0.22 * (1.0 - h); }',
  ao: 'float ao(vec2 uv, float h){ return mix(0.45, 1.0, smoothstep(0.05, 0.7, h)); }',
};

const SAND = {
  seed: 71, normalStrength: 0.05,
  height: /* glsl */ `
float height(vec2 uv){
  float warp = tnoise(uv, 3.0, uSeed) * 0.6;
  float ripple = sin((uv.y * 14.0 + warp) * 6.2831853) * 0.5 + 0.5;
  float fine = tfbm(uv, 120.0, 2, uSeed + 3.0) * 0.5 + 0.5;
  float lf = tfbm(uv, 5.0, 3, uSeed + 7.0) * 0.5 + 0.5;
  vec2 w = tworley(uv, 30.0, uSeed + 11.0);
  float peb = smoothstep(0.35, 0.08, w.x) * step(0.82, hash12(floor(uv * 30.0) + uSeed));
  return clamp(0.28 * ripple + 0.30 * lf + 0.12 * fine + 0.4 * peb + 0.1, 0.0, 1.0);
}`,
  albedo: /* glsl */ `
vec3 albedo(vec2 uv, float h){
  float lf = tfbm(uv, 2.0, 3, uSeed + 19.0) * 0.5 + 0.5;
  vec2 w = tworley(uv, 30.0, uSeed + 11.0);
  float peb = smoothstep(0.35, 0.08, w.x) * step(0.82, hash12(floor(uv * 30.0) + uSeed));
  vec3 pale = vec3(0.345, 0.252, 0.145);
  vec3 dark = vec3(0.175, 0.122, 0.068);
  vec3 col = mix(dark, pale, smoothstep(0.2, 0.7, h));
  col = mix(col, col * 0.72, smoothstep(0.55, 0.75, lf));                             // damp patches
  col = mix(col, vec3(0.290, 0.250, 0.205), smoothstep(0.3, 0.7, peb));
  col *= 0.93 + 0.14 * hash12(floor(uv * 1024.0) + uSeed);
  return col;
}`,
  roughness: 'float rough(vec2 uv, float h){ return 0.86; }',
  ao: 'float ao(vec2 uv, float h){ return mix(0.8, 1.0, h); }',
};

const MUD = {
  seed: 89, normalStrength: 0.11,
  height: /* glsl */ `
float height(vec2 uv){
  vec2 c = tworley(uv, 9.0, uSeed);
  float crack = 1.0 - smoothstep(0.0, 0.09, c.y - c.x);
  float plate = 1.0 - c.x * 0.6;
  vec2 c2 = tworley(uv + 0.21, 23.0, uSeed + 3.0);
  float crack2 = 1.0 - smoothstep(0.0, 0.05, c2.y - c2.x);
  float fine = tfbm(uv, 50.0, 3, uSeed + 5.0) * 0.5 + 0.5;
  float lf = tfbm(uv, 4.0, 3, uSeed + 9.0) * 0.5 + 0.5;
  float dried = smoothstep(0.45, 0.7, lf);
  return clamp(0.5 * plate + 0.15 * fine + 0.2 * lf - 0.45 * crack * (0.5 + 0.5 * dried) - 0.15 * crack2 * dried, 0.0, 1.0);
}`,
  albedo: /* glsl */ `
vec3 albedo(vec2 uv, float h){
  vec2 c = tworley(uv, 9.0, uSeed);
  float crack = 1.0 - smoothstep(0.0, 0.09, c.y - c.x);
  float lf = tfbm(uv, 4.0, 3, uSeed + 9.0) * 0.5 + 0.5;
  float dried = smoothstep(0.45, 0.7, lf);
  float algae = smoothstep(0.55, 0.75, tfbm(uv, 6.0, 3, uSeed + 41.0) * 0.5 + 0.5);
  vec3 wetc = vec3(0.075, 0.050, 0.028);
  vec3 dryc = vec3(0.290, 0.195, 0.098);
  vec3 col = mix(wetc, dryc, dried);
  col = mix(col, vec3(0.105, 0.150, 0.030), algae * 0.7 * (1.0 - dried));
  col *= mix(0.55, 1.05, smoothstep(0.1, 0.8, h));
  col *= 1.0 - 0.5 * crack;
  col *= 0.94 + 0.12 * hash12(floor(uv * 1024.0) + uSeed);
  return col;
}`,
  roughness: /* glsl */ `float rough(vec2 uv, float h){
  float lf = tfbm(uv, 4.0, 3, uSeed + 9.0) * 0.5 + 0.5;
  return mix(0.45, 0.85, smoothstep(0.45, 0.7, lf));
}`,
  ao: 'float ao(vec2 uv, float h){ return mix(0.45, 1.0, smoothstep(0.05, 0.7, h)); }',
};

export const LAYER_SPECS = [GRASS, DRY_GRASS, DIRT, ROCK, SAND, MUD];

/**
 * Build the two packed texture arrays. Returns { tAlb, tNrm, size, dispose() }.
 * Each layer costs 3 GPU passes at size²; the intermediate render targets are released after readback.
 */
export function buildLayerArrays(ctx, { size = 1024, anisotropy = 8 } = {}) {
  const tex = ctx.textures;
  const renderer = ctx.renderer;
  const n = LAYER_SPECS.length;
  const albData = new Uint8Array(size * size * 4 * n);
  const nrmData = new Uint8Array(size * size * 4 * n);
  const slice = new Uint8Array(size * size * 4);

  for (let i = 0; i < n; i++) {
    const spec = LAYER_SPECS[i];
    const seed = spec.seed + (ctx.world.seed % 1000) * 0.01;
    const heightTex = tex.gpu(`${spec.height}\nvec4 shade(vec2 uv){ return vec4(vec3(height(uv)), 1.0); }`,
      { size, type: THREE.HalfFloatType, mipmaps: false, seed });
    const albTex = tex.gpu(`${spec.height}\n${spec.albedo}\nvec4 shade(vec2 uv){ float h = texture(uH, uv).r; vec3 c = clamp(albedo(uv, h), 0.0, 1.0); return vec4(linearToSRGBv(c), h); }`,
      { size, uniforms: { uH: heightTex }, mipmaps: false, seed });
    const nrmTex = tex.gpu(`${spec.height}\n${spec.roughness}\n${spec.ao}
vec4 shade(vec2 uv){
  float px = 1.0 / uSize;
  float l = texture(uH, uv + vec2(-px, 0.0)).r, r = texture(uH, uv + vec2(px, 0.0)).r;
  float d = texture(uH, uv + vec2(0.0, -px)).r, u = texture(uH, uv + vec2(0.0, px)).r;
  float h = texture(uH, uv).r;
  vec3 nn = normalize(vec3((l - r) * uStrength * uSize * 0.5, (d - u) * uStrength * uSize * 0.5, 1.0));
  return vec4(nn.xy * 0.5 + 0.5, clamp(rough(uv, h), 0.0, 1.0), clamp(ao(uv, h), 0.0, 1.0));
}`, { size, uniforms: { uH: heightTex, uStrength: spec.normalStrength }, mipmaps: false, seed });

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
    t.colorSpace = THREE.NoColorSpace; // albedo is sRGB-encoded bytes, decoded manually in the splat shader
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = Math.max(1, Math.min(anisotropy, tex.maxAnisotropy || 1));
    t.needsUpdate = true;
    return t;
  };
  const tAlb = make(albData, 'terrain-albedo-array');
  const tNrm = make(nrmData, 'terrain-normal-array');
  return { tAlb, tNrm, size, layers: n, dispose() { tAlb.dispose(); tNrm.dispose(); } };
}

/** Tileable water normal map (rg = xy, b = z), 512². */
export function buildWaterNormal(ctx, { size = 512, anisotropy = 4 } = {}) {
  return ctx.textures.gpu(/* glsl */ `
float hgt(vec2 uv){
  float a = tfbm(uv, 5.0, 4, uSeed);
  float b = tfbm(uv * vec2(2.0, 1.0) + 0.3, 9.0, 3, uSeed + 7.0);
  float c = tnoise(uv + 0.6, 21.0, uSeed + 13.0);
  return a * 0.55 + b * 0.3 + c * 0.15;
}
vec4 shade(vec2 uv){
  float px = 1.0 / uSize;
  float l = hgt(uv + vec2(-px, 0.0)), r = hgt(uv + vec2(px, 0.0));
  float d = hgt(uv + vec2(0.0, -px)), u = hgt(uv + vec2(0.0, px));
  vec3 nn = normalize(vec3((l - r) * 26.0, (d - u) * 26.0, 1.0));
  return vec4(nn * 0.5 + 0.5, 1.0);
}`, { key: 'terrain:waterNormal', size, seed: 3, mipmaps: true, anisotropy });
}
