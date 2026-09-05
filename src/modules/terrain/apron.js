// World-edge apron: a low-detail continuation of the plains from the playable 1024 m square out to ~5 km,
// so the map does not end in a hard slab cut floating in the sky colour. Ring 0 sits exactly on the
// heightfield border (shared heights → no seam, no z-fighting); outer rings extrapolate the plains with
// noise and rise into low distant highlands, so the rim always occludes the sky dome's horizon band.
import * as THREE from 'three';
import { GLSL_NOISE } from '../../core/Textures.js';

const OUTER = 6.5;      // outer radius as a multiple of world.half
const RINGS = 22;       // radial subdivisions
const SEGS = 128;       // subdivisions per world side (2 m at ring 0 — matches the terrain cell)
const TILE = 26;        // metres per texture repeat

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
  const uv = new Float32Array(cols * rows * 2);
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
      uv[k * 2] = x / TILE; uv[k * 2 + 1] = z / TILE;   // tiles (TILE metres per repeat)
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
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  return geo;
}

/** Dry-plains PBR set + macro variation, tuned to sit under the splat material's plains colour. */
export function createApronMaterial(ctx) {
  const size = ctx.quality === 'low' ? 256 : 512;
  // Albedo is authored as TRUE LINEAR colour; core's Textures.pbr() does the single sRGB encode.
  // Values are matched to the splat's dry-grass / laterite plains so the apron and the playable
  // terrain read as one continuous surface across the world border.
  const set = ctx.textures.pbr({
    key: 'terrain:apron4', size, seed: 91, normalStrength: 0.06,
    height: /* glsl */ `
float height(vec2 uv){
  float base = tfbm(uv, 6.0, 4, uSeed) * 0.5 + 0.5;
  float tuft = tridged(uv, 30.0, 3, uSeed + 2.0);
  float fine = tfbm(uv, 90.0, 2, uSeed + 5.0) * 0.5 + 0.5;
  return clamp(base * 0.48 + tuft * 0.40 + fine * 0.12, 0.0, 1.0);
}`,
    albedo: /* glsl */ `
vec3 albedo(vec2 uv, float h){
  float macro = tfbm(uv, 2.0, 3, uSeed + 10.0) * 0.5 + 0.5;
  float pt = tfbm(uv, 5.0, 3, uSeed + 17.0) * 0.5 + 0.5;
  // Values below were re-matched (2026-09-05) against the splat's RENDERED plains at overview
  // distance: the previous set read one step brighter and yellower than the playable terrain, so the
  // world showed as a hard-edged bright slab inside a paler plain. The splat also carries its own AO
  // (0.72-1.0) and macro darkening that this flat sheet must partially mirror.
  vec3 soil  = vec3(0.170, 0.105, 0.055);
  vec3 gold  = vec3(0.405, 0.300, 0.105);
  vec3 olive = vec3(0.185, 0.190, 0.075);
  vec3 lat   = vec3(0.310, 0.175, 0.105);
  vec3 c = mix(soil, gold, smoothstep(0.14, 0.60, h));
  c = mix(c, olive, smoothstep(0.55, 0.85, macro) * 0.55);
  c = mix(c, lat, smoothstep(0.62, 0.86, pt) * 0.5);
  c *= 0.86 + 0.24 * h;
  c *= 0.88;   // overall step down: the splat's AO averages ~0.9 under the same light
  return c;
}`,
    roughness: 'float rough(vec2 uv, float h){ return 0.95 - 0.1 * h; }',
    ao: 'float ao(vec2 uv, float h){ return mix(0.72, 1.0, h); }',
  });
  const m = ctx.materials.standard({ color: 0xffffff, roughness: 1, metalness: 0, side: THREE.FrontSide });
  m.name = 'terrain-apron';
  ctx.materials.applyPbr(m, set, { repeatMetres: TILE });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPosA;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPosA = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWPosA;\n${GLSL_NOISE}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
{
  // second scale kills the tiling of one tile seen across kilometres
  vec3 far = texture2D(map, vMapUv * 0.137 + 0.29).rgb;
  diffuseColor.rgb = mix(diffuseColor.rgb, far, 0.5);
  float macro = fbm(vWPosA.xz * 0.0068, 3);
  float macro2 = snoise(vWPosA.xz * 0.0012 + 5.3);
  // bare laterite blobs at the same 40-90 m scale the splat puts them on, so the apron breaks up
  // the same way the playable terrain does instead of reading as one smooth sheet
  float blob = smoothstep(0.42, 0.72, fbm(vWPosA.xz * 0.021 + 11.0, 3) * 0.5 + 0.5);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.290, 0.158, 0.092), blob * 0.55);
  diffuseColor.rgb *= 0.74 + 0.40 * macro;
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.86, 0.98, 0.70), smoothstep(0.15, 0.9, macro2) * 0.42);
  float lumA = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
  diffuseColor.rgb = clamp(mix(vec3(lumA), diffuseColor.rgb, 1.18), 0.0, 1.0);
}`);
  };
  m.customProgramCacheKey = () => 'terrain-apron-v6';
  m.userData.pbrSet = set;
  return m;
}
