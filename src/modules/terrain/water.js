// Water surface: one mesh for every body (river + wetland pools at world.terrain.waterLevel, each pan at its own
// level). Cells are emitted only where terrain dips near the body's level, so the plane never coincides with land.
// Material: MeshStandardMaterial + onBeforeCompile — animated dual-scroll normals, depth tint + alpha from the
// half-float height texture, shoreline foam, fresnel sky reflection (analytic sky, scaled down when an envMap exists).
import * as THREE from 'three';
import { GLSL_NOISE } from '../../core/Textures.js';
import { hourToSunElevation } from '../../core/Units.js';

/** bodies: [{ level, contains(ix, iz) → bool }] evaluated in order; first match wins. */
export function buildWaterGeometry(world, bodies, margin = 0.7) {
  const T = world.terrain, res = T.res, cell = T.cell, half = world.half, H = T.heights;
  const verts = [];
  for (let iz = 0; iz < res - 1; iz++) for (let ix = 0; ix < res - 1; ix++) {
    let level = null;
    for (const b of bodies) if (b.contains(ix, iz)) { level = b.level; break; }
    if (level === null) continue;
    const i = iz * res + ix;
    const mn = Math.min(H[i], H[i + 1], H[i + res], H[i + res + 1]);
    if (mn >= level + margin) continue;
    const x0 = ix * cell - half, z0 = iz * cell - half, x1 = x0 + cell, z1 = z0 + cell;
    verts.push(x0, level, z0, x0, level, z1, x1, level, z0, x1, level, z0, x0, level, z1, x1, level, z1);
  }
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(verts);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const nrm = new Float32Array(pos.length);
  for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1;
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  return geo;
}

export function createWaterMaterial(ctx, heightTex, normalTex) {
  const world = ctx.world;
  const m = ctx.materials.standard({
    color: 0xffffff, roughness: 0.96, metalness: 0, transparent: true, opacity: 1, depthWrite: true, side: THREE.FrontSide,
  });
  // The environment PMREM is what turned the river into a sheet of grey sky. Keep a trace of it for the
  // shape of the highlight and let the analytic fresnel term below do the rest.
  m.envMapIntensity = 0.30;
  m.name = 'terrain-water';
  const uniforms = {
    tHeight: { value: heightTex }, tWaterN: { value: normalTex },
    uTime: ctx.materials.uniforms.uTime,
    uHalf: { value: world.half }, uInvCell: { value: 1 / world.terrain.cell }, uInvRes: { value: 1 / world.terrain.res },
    uSkyZenith: { value: new THREE.Color(0.2, 0.4, 0.8) }, uSkyHorizon: { value: new THREE.Color(0.6, 0.7, 0.85) },
    uSkyMix: { value: 1.0 }, uWaveStr: { value: 1.0 },
    // Beer–Lambert absorption for a silt/tannin-stained savannah river: blue is killed fastest,
    // so the residual colour walks from a warm ochre shallow to a near-black olive at depth.
    uGlint: { value: 0.6 }, uGlintPow: { value: 3200.0 }, uSheen: { value: 0.0 }, uExposure: { value: 1.0 }, uDay: { value: 1.0 }, uReflI: { value: 1.0 },
    uBed: { value: new THREE.Color(0.155, 0.098, 0.042) },   // wet sand/mud seen through 0 m of water
    uBody: { value: new THREE.Color(0.030, 0.038, 0.024) },  // suspended-sediment body colour (deep asymptote)
    uExt: { value: new THREE.Vector3(1.35, 1.75, 3.10) },    // per-metre extinction, r/g/b
  };
  m.userData.uniforms = uniforms;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D tHeight; uniform sampler2D tWaterN; uniform float uTime;
uniform float uHalf; uniform float uInvCell; uniform float uInvRes;
uniform vec3 uSkyZenith; uniform vec3 uSkyHorizon; uniform float uSkyMix; uniform float uWaveStr;
uniform vec3 uBed; uniform vec3 uBody; uniform vec3 uExt;
uniform float uGlint; uniform float uGlintPow; uniform float uSheen; uniform float uExposure; uniform float uDay; uniform float uReflI;
varying vec3 vWPos;
vec3 gWaterN; float gFoam; float gDepth;
${GLSL_NOISE}`)
      .replace('#include <map_fragment>', /* glsl */ `
{
  vec2 p = vWPos.xz;
  vec2 cuv = ((p + uHalf) * uInvCell + 0.5) * uInvRes;
  float ground = texture2D(tHeight, cuv).r;
  gDepth = max(0.0, vWPos.y - ground);
  float camD = distance(vWPos, cameraPosition);
  float str = uWaveStr * (1.0 - smoothstep(200.0, 800.0, camD));
  vec3 n1 = texture2D(tWaterN, p / 7.5 + uTime * vec2(0.011, 0.006)).xyz * 2.0 - 1.0;
  vec3 n2 = texture2D(tWaterN, p / 2.6 - uTime * vec2(0.008, 0.014)).xyz * 2.0 - 1.0;
  vec3 n3 = texture2D(tWaterN, p / 0.9 + uTime * vec2(0.02, -0.017)).xyz * 2.0 - 1.0;
  vec2 tnxy = (n1.xy * 0.55 + n2.xy * 0.35 + n3.xy * 0.15) * 0.085 * str;
  // calm water in shallow margins, slightly livelier mid-channel
  tnxy *= 0.6 + 0.4 * smoothstep(0.0, 1.5, gDepth);
  gWaterN = normalize(vec3(tnxy.x, 1.0, tnxy.y));
  // depth-based colour absorption: what survives through gDepth metres of stained water,
  // plus the sediment body colour that scatters back out of the column
  vec3 trans = exp(-uExt * max(gDepth, 0.015));
  diffuseColor.rgb = uBed * trans + uBody * (1.0 - trans);
  // silt line at the waterline instead of white foam — savannah rivers do not foam
  float fn = snoise(p * 0.9 + uTime * 0.12) * 0.5 + 0.5;
  float fn2 = snoise(p * 3.1 - uTime * 0.2) * 0.5 + 0.5;
  gFoam = smoothstep(0.45, 0.03, gDepth) * smoothstep(0.42, 0.72, fn * 0.7 + fn2 * 0.3) * 0.5;
  diffuseColor.a = clamp(0.42 + gDepth * 2.2, 0.0, 1.0) * 0.97;
}`)
      .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(gWaterN, 0.0)).xyz);')
      .replace('#include <opaque_fragment>', /* glsl */ `
{
  vec3 V = normalize(cameraPosition - vWPos);
  float NoV = clamp(dot(gWaterN, V), 0.0, 1.0);
  vec3 R = reflect(-V, gWaterN);
  R.y = abs(R.y); // ripples can tip a grazing reflection below the horizon; mirror it back up
  // Physically based Fresnel for water (F0 = 0.02): ~2 % head-on, rising to ~all at grazing. The old
  // path capped it at 0.30 and reflected a dimmed analytic sky, so rivers read as flat opaque paint
  // (critic savannah-round6). The earlier "white river" came from a full-strength GLOSSY env term on a
  // rough surface; here the reflection samples the environment's own sky PMREM at low roughness, so
  // it is exactly as bright as the sky it mirrors, never brighter.
  float fres = 0.02 + 0.98 * pow(1.0 - NoV, 5.0);
  fres *= 1.0 - 0.35 * smoothstep(0.35, 0.0, gDepth); // silty shallows: less mirror, more bed
  vec3 sky;
  #if defined( USE_ENVMAP ) && defined( ENVMAP_TYPE_CUBE_UV )
    sky = textureCubeUV( envMap, R, 0.06 ).rgb * uReflI;
  #else
    float up = clamp(R.y, 0.0, 1.0);
    sky = mix(uSkyHorizon, uSkyZenith, pow(up, 0.45)) * uSkyMix;
  #endif
  outgoingLight = outgoingLight * (1.0 - fres) + sky * fres;
  // Minimum in-column scatter floor: at near-top-down viewing angles fres collapses toward its
  // 0.015 floor (physically correct — Fresnel reflectance is weakest at normal incidence), so a
  // fully-shadowed patch (direct diffuse zeroed by the shadow map, indirect capped low via the
  // deliberately-small envMapIntensity above) had nothing left to light it and crushed to near
  // true black — verified via a raw pixel readback under a savannah waterhole's tree canopy:
  // byte ~12 per channel, well below even uBody's own "near-black olive at depth" asymptote
  // (linear 0.03 alone renders ~byte 48). Real water scatters some light within the column
  // itself regardless of surface-normal geometry or shadowing; this restores a small, physically
  // motivated floor of it — negligible on lit water, the only source of light in full shade.
  //
  // REGRESSION FOUND AND FIXED same day by the independent critic pass: this floor is a flat
  // linear-HDR addition, computed BEFORE renderer.toneMappingExposure is applied — so it scales
  // with whatever exposure the scene is currently using. At night the exposure ceiling is 12
  // (vs 4 by day, see environment/index.js computeLighting), and at night the water's other own
  // light terms are already small, so this floor became the DOMINANT term and blew every water
  // body to a uniform near-white glow — confirmed independently in six contexts (terrain,
  // animals, traffic, savannah, park module reviews, and the game's own night overview) and
  // visually unmistakable: the entire river/pans brighter than the lodge's own lamps. Divide by
  // the live exposure so the floor's DISPLAY brightness stays roughly constant across day/night
  // instead of tracking the night ceiling — restores the original day-only rescue without
  // reintroducing the night blowout.
  //
  // 2026-09-25: dividing by exposure made the floor's DISPLAY brightness constant, day and night, so
  // at night — when moonlit land falls near black — the river kept its daytime glow and read 2.5–3×
  // brighter than ground and sky (critic terrain r4 #1). In-column scatter follows the light that is
  // available: uDay scales it from 1 by day to 0.08 at night.
  outgoingLight += diffuseColor.rgb * 0.45 * uDay / max(uExposure, 0.3);
  // Explicit sun glint. The material itself is left rough (0.8) so three's GGX lobe contributes almost
  // nothing — a roughness-0.15..0.45 water surface spread a blown-out highlight across half the channel.
  // Here the highlight is a single tight Blinn lobe: bright, but only a few metres wide.
  #if NUM_DIR_LIGHTS > 0
  {
    // The tight lobe aliases into speckle from overview cameras (lobe far narrower than a pixel);
    // fade it out with distance. The waterhole/river showcase cameras sit well inside 250 m.
    float glintFade = 1.0 - 0.9 * smoothstep(250.0, 800.0, distance(vWPos, cameraPosition));
    vec3 Lw = normalize((vec4(directionalLights[0].direction, 0.0) * viewMatrix).xyz);
    vec3 Hv = normalize(Lw + V);
    float ndh = max(dot(gWaterN, Hv), 0.0);
    outgoingLight += directionalLights[0].color * (pow(ndh, uGlintPow) * uGlint * glintFade + pow(ndh, 70.0) * uSheen);
  }
  #endif
  // Silt line, LIT: the old code mixed in a fixed radiance (0.115, 0.085, 0.05) that ignored the
  // lighting, so at night — exposure up to 12× — it became a cream ring ~9× brighter than the grass
  // along every shoreline (critic savannah-round6 #2). Same diffuse irradiance the water body got,
  // applied to the silt albedo instead.
  vec3 irr = (reflectedLight.directDiffuse + reflectedLight.indirectDiffuse) / max(diffuseColor.rgb, vec3(1e-3));
  outgoingLight = mix(outgoingLight, irr * vec3(0.115, 0.085, 0.050), gFoam);
  diffuseColor.a = max(mix(diffuseColor.a, 1.0, fres * 0.8), gFoam * 0.8);
}
#include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'terrain-water-v9';
  return m;
}

const _c = new THREE.Color();

/** Per-frame: analytic sky colours from the hour (matches the core fallback sky roughly). */
export function updateWaterSky(material, world, renderer) {
  const u = material.userData.uniforms;
  // environment.setEnvMap() rewrites envMapIntensity on every tracked material whenever the PMREM is
  // regenerated, so the water's low value has to be re-asserted here every frame — a full-strength sky
  // probe on a roughness-0.45 surface is what turned the river into a sheet of white.
  material.envMapIntensity = 0.10;
  // Live exposure, so the in-column-scatter floor (opaque_fragment) can counter-scale against it —
  // see the fix note at its call site. Falls back to 1.0 if a renderer wasn't passed (keeps this
  // function safe to call from anywhere that doesn't have one handy).
  u.uExposure.value = renderer ? renderer.toneMappingExposure : 1.0;
  const el = hourToSunElevation(world.time.hour);
  const up = Math.max(0, Math.sin(el));
  const dusk = Math.max(0, 1 - Math.abs(up - 0.12) / 0.18); // warm band around sunrise/sunset
  u.uDay.value = Math.max(0.08, Math.min(1, up * 4));   // daylight available for in-column scatter
  u.uSkyZenith.value.setHSL(0.6, 0.55, 0.05 + 0.45 * up);
  u.uSkyHorizon.value.setHSL(0.58, 0.4, 0.07 + 0.6 * up);
  _c.setRGB(0.9, 0.5, 0.25);
  u.uSkyHorizon.value.lerp(_c, dusk * 0.5);
  u.uSkyMix.value = material.envMap ? 0.18 : 0.55;
}
