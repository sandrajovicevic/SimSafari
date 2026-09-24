// Billboard imposters. At init the LOD0 mesh of a species is rendered, unlit (albedo only), into a
// small RGBA render target from a side view; far instances then draw as one camera-facing quad each.
//
// The billboard is a normal MeshStandardMaterial so it still receives the scene's sun colour, cascade
// shadows and fog — only its geometry is replaced in the vertex shader (cylindrical billboarding) and
// its shading normal is forced to +Y so the card responds to the time of day like the ground does.
import * as THREE from 'three';

const _box = new THREE.Box3();
const _size = new THREE.Vector3();
const _center = new THREE.Vector3();

/**
 * Render meshes into an imposter texture.
 * @returns { texture, width, height, aspect } — width/height in metres of the captured box.
 */
export function bakeImposter(ctx, meshes, { size = 256, pad = 1.04 } = {}) {
  const scene = new THREE.Scene();
  const swapped = [];
  _box.makeEmpty();
  for (const m of meshes) {
    if (!m) continue;
    const mesh = new THREE.Mesh(m.geometry, m.material);
    // unlit albedo: keeps the bake independent of the time of day it happened to be baked at
    const basic = new THREE.MeshBasicMaterial({
      map: m.material.map || null,
      color: m.material.color ? m.material.color.clone() : new THREE.Color(0xffffff),
      alphaTest: m.material.alphaTest || 0,
      side: THREE.DoubleSide,
      transparent: false,
      fog: false,
      toneMapped: false,
    });
    mesh.material = basic;
    swapped.push(basic);
    scene.add(mesh);
    m.geometry.computeBoundingBox();
    _box.union(m.geometry.boundingBox);
  }
  _box.getSize(_size);
  _box.getCenter(_center);
  const w = Math.max(0.5, _size.x, _size.z) * pad;
  const h = Math.max(0.5, _size.y) * pad;
  const aspect = w / h;
  const texW = Math.round(size * Math.min(2, Math.max(0.5, aspect)));
  const texH = size;

  const cam = new THREE.OrthographicCamera(-w / 2, w / 2, h / 2, -h / 2, 0.1, 400);
  cam.position.set(0, _box.min.y + h / 2, 160);
  cam.lookAt(0, _box.min.y + h / 2, 0);

  const rt = new THREE.WebGLRenderTarget(texW, texH, {
    format: THREE.RGBAFormat, type: THREE.UnsignedByteType,
    minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
    generateMipmaps: true, depthBuffer: true, stencilBuffer: false,
    colorSpace: THREE.LinearSRGBColorSpace,   // render targets always receive working-space (linear) colour
  });
  rt.texture.wrapS = rt.texture.wrapT = THREE.ClampToEdgeWrapping;
  rt.texture.anisotropy = Math.min(4, ctx.textures.maxAnisotropy);

  const r = ctx.renderer;
  const prevRT = r.getRenderTarget();
  const prevClear = r.getClearColor(new THREE.Color());
  const prevAlpha = r.getClearAlpha();
  const prevAuto = r.autoClear;
  r.setRenderTarget(rt);
  r.setClearColor(0x000000, 0);
  r.autoClear = true;
  r.clear(true, true, false);
  r.render(scene, cam);
  r.setRenderTarget(prevRT);
  r.setClearColor(prevClear, prevAlpha);
  r.autoClear = prevAuto;

  // TOP view (2026-09-24): from a high camera the side card foreshortens into a line — every distant
  // acacia read as a black dash across the overview. A second, top-down bake drives a horizontal
  // crown card that takes over as the view steepens. Centred on the tree origin (like the side
  // card), extent covers the crown in x and z; image right = +x, image up = -z.
  const ext = Math.max(0.5, 2 * Math.max(Math.abs(_box.min.x), Math.abs(_box.max.x), Math.abs(_box.min.z), Math.abs(_box.max.z))) * pad;
  const topSize = Math.max(64, Math.round(size * 0.75));
  const camT = new THREE.OrthographicCamera(-ext / 2, ext / 2, ext / 2, -ext / 2, 0.1, 400);
  camT.up.set(0, 0, -1);
  camT.position.set(0, _box.max.y + 100, 0);
  camT.lookAt(0, 0, 0);
  const rtT = new THREE.WebGLRenderTarget(topSize, topSize, {
    format: THREE.RGBAFormat, type: THREE.UnsignedByteType,
    minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
    generateMipmaps: true, depthBuffer: true, stencilBuffer: false, colorSpace: THREE.LinearSRGBColorSpace,
  });
  rtT.texture.wrapS = rtT.texture.wrapT = THREE.ClampToEdgeWrapping;
  r.setRenderTarget(rtT);
  r.setClearColor(0x000000, 0);
  r.autoClear = true;
  r.clear(true, true, false);
  r.render(scene, camT);
  r.setRenderTarget(prevRT);
  r.setClearColor(prevClear, prevAlpha);
  r.autoClear = prevAuto;

  for (const s of swapped) s.dispose();
  scene.clear();

  const tex = rt.texture;
  tex.userData.renderTarget = rt;
  const top = rtT.texture;
  top.userData.renderTarget = rtT;
  // crown card height as a fraction of the side card (top of the crown, a little down into it)
  const crownY = Math.min(0.98, Math.max(0.3, (_box.max.y - _box.min.y) * 0.9 / Math.max(1e-3, h)));
  return { texture: tex, top, topExtent: ext, crownY, width: w, height: h, baseY: _box.min.y };
}

/**
 * Material for imposter quads: camera-facing, normal forced to +Y, alpha tested.
 * The unit quad geometry spans x ∈ [-0.5, 0.5], y ∈ [0, 1]; the instance matrix carries
 * world position (translation) and metre size (scale.x = width, scale.y = height).
 */
export function imposterMaterial(ctx, texture, key, top = null, topExtent = 1, crownY = 0.8, bakedW = 1) {
  const mat = ctx.materials.standard({
    map: texture, alphaTest: 0.42, roughness: 1.0, metalness: 0,
    side: THREE.DoubleSide, transparent: false,
  });
  mat.userData.cacheKeyExtra = 'imposter:' + key;
  mat.customProgramCacheKey = () => (top ? 'imposter-2view' : 'imposter');
  if (top) mat.defines = { ...(mat.defines || {}), IMPOSTER_2VIEW: '' };
  const uTop = { value: top }, uTopExt = { value: topExtent }, uCrownY = { value: crownY }, uW = { value: bakedW };
  mat.onBeforeCompile = (shader) => {
    if (top) {
      shader.uniforms.uTop = uTop; shader.uniforms.uTopExt = uTopExt; shader.uniforms.uCrownY = uCrownY; shader.uniforms.uW = uW;
      // aKind = 1 marks the horizontal crown card. Weights cross-fade on the camera's downward
      // pitch (|forward.y|): side card below ~25°, crown card above ~45°, dithered so no sorting.
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aKind; uniform float uTopExt; uniform float uCrownY; uniform float uW; varying float vKind; varying float vW; varying vec2 vTopUv;')
        .replace('#include <uv_vertex>', `#include <uv_vertex>
  vKind = aKind;
  float camDown = abs( viewMatrix[1][2] ); // world-up component of the camera's view axis
  float wTop = smoothstep( 0.42, 0.72, camDown );
  vW = aKind > 0.5 ? wTop : 1.0 - smoothstep( 0.55, 0.85, camDown );
  vTopUv = vec2( position.x + 0.5, 0.5 - position.z );`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D uTop; varying float vKind; varying float vW; varying vec2 vTopUv;')
        .replace('#include <map_fragment>', `
  vec4 sampledDiffuseColor = vKind > 0.5 ? texture2D( uTop, vTopUv ) : texture2D( map, vMapUv );
  diffuseColor *= sampledDiffuseColor;
  // dithered fade: interleaved-gradient noise against the view weight
  float ign = fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) );
  if ( ign > vW ) diffuseColor.a = 0.0;`);
    }
    // Cylindrical billboard. The instance matrix stays a plain translate+scale so three's own
    // project_vertex / worldpos_vertex / shadowmap_vertex chunks keep working: we only pre-rotate
    // `transformed` so that instanceMatrix * transformed lands on the camera-facing quad.
    shader.vertexShader = shader.vertexShader
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3( 0.0, 1.0, 0.0 );')
      .replace('#include <begin_vertex>', /* glsl */ `
vec3 transformed = vec3( position );
#ifdef USE_INSTANCING
  // instanceMatrix is a plain translate+scale, so column 0 x is the SIGNED width scale; using it
  // (rather than its length) means a negative scale mirrors the card instead of shearing it.
  float iSX = instanceMatrix[0][0];
  vec3 camRightW = normalize( vec3( viewMatrix[0][0], 0.0, viewMatrix[2][0] ) + vec3( 1e-5, 0.0, 0.0 ) );
  transformed = vec3( camRightW.x * position.x, position.y, camRightW.z * position.x * iSX );
  #ifdef IMPOSTER_2VIEW
  if ( aKind > 0.5 ) {
    // crown card: instance x scale is (signed) baked width × tree scale, z scale is 1 — so x stays in
    // baked-width units and z is converted to metres × tree scale (wAbs / uW)
    float wAbs = abs( iSX );
    transformed = vec3( position.x * uTopExt / uW, uCrownY, position.z * uTopExt * wAbs / uW );
  }
  #endif
#endif
`);
  };
  return mat;
}

/** Unit quad: x ∈ [-0.5, 0.5], y ∈ [0, 1], uv 0..1. */
export function imposterGeometry() {
  // side card (aKind 0) + horizontal crown card (aKind 1, y and extent set in the vertex shader)
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0,
    -0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5,
  ], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(8).fill([0, 1, 0]).flat(), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0], 2));
  g.setAttribute('aKind', new THREE.Float32BufferAttribute([0, 0, 0, 0, 1, 1, 1, 1], 1));
  g.setIndex([0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6]);
  g.computeBoundingSphere();
  return g;
}
