// Materials for the buildings module.
//
// `opaque` is a MeshStandardMaterial extended through onBeforeCompile so that map / roughness /
// metalness / normal / AO all come from a sampler2DArray indexed by the per-vertex `aLayer`
// attribute (textures.js). That is what lets a whole building type — ten different surfaces —
// render in one draw call while keeping three's lights, shadows, fog and envMap.
//
// The other three materials are tiny and shared: `glow` (window panes and lamp globes, emissive at
// night, tinted per vertex), `shiny` (pool / trough water and photovoltaic glass) and `sign` (the
// park-name board, a 2D canvas texture).

import * as THREE from 'three';

const PARS = /* glsl */ `
uniform sampler2DArray bAlb; uniform sampler2DArray bNrm;
varying float vLayer;
vec4 bA; vec4 bN;
vec3 bSrgb2lin(vec3 c){ return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
`;

const MAP_FRAG = /* glsl */ `
bA = texture(bAlb, vec3(vNormalMapUv, vLayer));
bN = texture(bNrm, vec3(vNormalMapUv, vLayer));
diffuseColor.rgb *= bSrgb2lin(bA.rgb);
`;

/** 1×1 flat tangent-space normal. Only there so three defines USE_NORMALMAP_TANGENTSPACE (gives us `tbn`). */
function flatNormalTexture() {
  const t = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.colorSpace = THREE.NoColorSpace;
  t.needsUpdate = true;
  t.name = 'buildings-flat-normal';
  return t;
}

/** The single opaque material every building surface uses. */
export function createSurfaceMaterial(ctx, arrays) {
  const dummy = flatNormalTexture();
  const m = ctx.materials.standard({
    color: 0xffffff, roughness: 1, metalness: 1, vertexColors: true, side: THREE.FrontSide,
  });
  m.name = 'buildings-surface';
  m.normalMap = dummy;
  m.normalScale.set(1.15, 1.15);
  const uniforms = { bAlb: { value: arrays.tAlb }, bNrm: { value: arrays.tNrm } };
  m.userData.uniforms = uniforms;
  m.userData.dummyNormal = dummy;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aLayer;\nvarying float vLayer;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLayer = aLayer;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + PARS)
      .replace('#include <map_fragment>', MAP_FRAG)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = roughness * clamp(bN.b, 0.04, 1.0);')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = metalness * bA.a;')
      .replace('#include <normal_fragment_maps>', `
{
  vec3 mapN = vec3(bN.rg * 2.0 - 1.0, 0.0);
  mapN.z = sqrt(max(0.0, 1.0 - dot(mapN.xy, mapN.xy)));
  mapN.xy *= normalScale;
  normal = normalize(tbn * mapN);
}`)
      .replace('#include <aomap_fragment>', `
{
  float bAo = bN.a;
  reflectedLight.indirectDiffuse *= bAo;
  reflectedLight.directDiffuse *= mix(1.0, bAo, 0.30);
  reflectedLight.indirectSpecular *= mix(1.0, bAo, 0.6);
}`);
  };
  m.customProgramCacheKey = () => 'buildings-surface-v1';
  return m;
}

/**
 * Window panes and lamp globes. Vertex colour is the EMISSIVE tint (not the diffuse tint), so one
 * material covers cool dark glass by day and warm lit interiors / lamps at night.
 */
export function createGlowMaterial(ctx) {
  const m = ctx.materials.standard({
    color: 0x1c2226, roughness: 0.14, metalness: 0.0, vertexColors: true,
    emissive: new THREE.Color(0xffffff), emissiveIntensity: 0,
  });
  m.name = 'buildings-glow';
  m.envMapIntensity = 1.6;
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <color_fragment>', '')                                  // vColor is emissive-only
      .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance *= vColor.rgb;');
  };
  m.customProgramCacheKey = () => 'buildings-glow-v1';
  return m;
}

/** Pool / trough water and photovoltaic glass: dark, smooth, strongly environment-lit. */
export function createShinyMaterial(ctx) {
  const m = ctx.materials.standard({ color: 0xffffff, roughness: 0.07, metalness: 0.15, vertexColors: true });
  m.name = 'buildings-shiny';
  m.envMapIntensity = 2.0;
  return m;
}

/** Park-name board. */
export function createSignMaterial(ctx, map) {
  const m = ctx.materials.standard({ color: 0xffffff, roughness: 0.68, metalness: 0, vertexColors: true });
  m.name = 'buildings-sign';
  m.map = map;
  m.needsUpdate = true;
  return m;
}

/** 0 by day → 1 in the middle of the night; used to fade emissive windows and lamps. */
export function nightFactor(hour) {
  const h = ((hour % 24) + 24) % 24;
  // lamps on from 18:15, full by 19:15; off between 05:45 and 06:45
  const dusk = Math.min(1, Math.max(0, (h - 18.25) / 1.0));
  const dawn = Math.min(1, Math.max(0, (6.75 - h) / 1.0));
  return h > 12 ? dusk : dawn;
}
