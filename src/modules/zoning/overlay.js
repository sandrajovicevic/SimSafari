// Ground-conforming zoning overlay: one fill draw + one boundary-ribbon draw. A terrain-following
// mesh (baked heights, rebuilt on terrain:modified) carries a per-cell data texture (R=zone id,
// G/B=habitatId lo/hi byte) sampled per fragment so cell edges stay crisp regardless of mesh
// resolution. The fragment shader tints HABITAT/VISITOR/SERVICE fill and feathers it into the ground
// over ~a cell; it adds a plank-line tint inside VISITOR cells (the boardwalk read). The animated
// boundary LINE itself lives in boundaries.js: interfaces are traced, corner-rounded (Chaikin) and
// drawn as one smooth marching-ants ribbon instead of following the 4 m cell staircase. NONE and the
// derived NO_BUILD zone render no fill — NO_BUILD is set automatically over every road and water cell
// on the whole map (see grid.js), and painting that solid red would carpet the terrain.
import * as THREE from 'three';
import { Z } from './state.js';
import { buildBoundaryGeometry, createBoundaryMaterial } from './boundaries.js';

const OVERLAY_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorldPos;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const OVERLAY_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uZone;
uniform float uRes;
uniform float uOpacity;
varying vec2 vUv;
varying vec3 vWorldPos;

vec3 zoneColor(float zid) {
  if (zid < 1.5) return vec3(0.22, 0.62, 0.20); // HABITAT — green
  if (zid < 2.5) return vec3(0.80, 0.58, 0.22); // VISITOR — tan / boardwalk
  return vec3(0.42, 0.46, 0.58);                // SERVICE — grey-blue
}

float regionKey(vec4 texel) {
  float z = floor(texel.r * 255.5);
  float hLo = floor(texel.g * 255.5);
  float hHi = floor(texel.b * 255.5);
  return z * 65536.0 + hHi * 256.0 + hLo;
}

void main() {
  vec2 texel = vec2(1.0 / uRes);
  vec4 here4 = texture2D(uZone, vUv);
  float zid = floor(here4.r * 255.5);
  // NONE (0) and the derived NO_BUILD (4, roads/water — see grid.js) never paint a fill; the smooth
  // boundary ribbon (boundaries.js) draws the line along their interface with painted regions.
  bool paints = zid > 0.5 && zid < 3.5;
  if (!paints) discard;

  float here = regionKey(here4);

  // Soft-boundary field: a 5×5 pyramid-weighted sample of "same region as centre". Its 0.5 contour
  // traces the region boundary with the cell staircase's corners rounded into diagonals, and its
  // falloff feathers the fill into the ground over ~a cell — the spec's soft-edged boundary. The
  // data texture stays Nearest so the per-cell region tests below remain exact.
  float same = 0.0, wsum = 0.0;
  for (int j = -2; j <= 2; j++) {
    for (int i = -2; i <= 2; i++) {
      float w = 3.0 - float(max(abs(i), abs(j)));
      same += w * (regionKey(texture2D(uZone, vUv + vec2(float(i), float(j)) * texel * 1.2)) == here ? 1.0 : 0.0);
      wsum += w;
    }
  }
  float field = same / wsum; // 1 deep inside, ~0.5 on the boundary, 0 outside

  // marching-ants dashes and the crisp contour line are drawn by the boundary ribbon; this pass is
  // fill only. The fill still feathers out over the field's falloff instead of stopping hard.
  float fillA = 0.30 * smoothstep(0.42, 0.9, field);

  vec3 col = zoneColor(zid);
  if (zid > 1.5 && zid < 2.5) {
    // boardwalk plank read: alternating tint + a thin seam every ~1.35 m across the visitor path.
    // fwidth-derived antialiasing keeps this from turning into moire noise at a distant/top-down camera
    // (a naive fract() seam aliases hard once the plank period drops below a pixel's world footprint).
    float plankPos = (vWorldPos.x * 0.7 + vWorldPos.z * 0.3) / 1.35;
    float pf = fract(plankPos);
    float pw = clamp(fwidth(plankPos) * 1.4, 0.01, 0.5);
    float seam = smoothstep(0.0, pw, pf) * smoothstep(1.0, 1.0 - pw, pf);
    col *= mix(0.86, 1.05, seam);
  }
  gl_FragColor = vec4(col, fillA * uOpacity);
}`;

function buildGeometry(world, segs) {
  const half = world.half, size = world.size, step = size / segs, nx = segs + 1;
  const pos = new Float32Array(nx * nx * 3);
  const uv = new Float32Array(nx * nx * 2);
  for (let iz = 0; iz <= segs; iz++) {
    for (let ix = 0; ix <= segs; ix++) {
      const x = ix * step - half, z = iz * step - half;
      const y = world.getHeight(x, z) + 0.06;
      const k = iz * nx + ix;
      pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
      uv[k * 2] = (x + half) / size; uv[k * 2 + 1] = (z + half) / size;
    }
  }
  const idx = new Uint32Array(segs * segs * 6);
  let w = 0;
  for (let iz = 0; iz < segs; iz++) {
    for (let ix = 0; ix < segs; ix++) {
      const a = iz * nx + ix, b = a + 1, c = a + nx, d = c + 1;
      idx[w++] = a; idx[w++] = c; idx[w++] = b;
      idx[w++] = b; idx[w++] = c; idx[w++] = d;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

function fillZoneData(world, data) {
  const g = world.grid, N = g.res * g.res, zone = g.zone, hid = g.habitatId;
  for (let i = 0; i < N; i++) {
    const o = i * 4;
    data[o] = zone[i];
    const h = hid[i];
    data[o + 1] = h & 0xff;
    data[o + 2] = (h >> 8) & 0xff;
    data[o + 3] = 255;
  }
}

export function buildOverlay(ctx) {
  const world = ctx.world;
  const res = world.grid.res;
  const data = new Uint8Array(res * res * 4);
  fillZoneData(world, data);
  const dataTex = new THREE.DataTexture(data, res, res, THREE.RGBAFormat, THREE.UnsignedByteType);
  dataTex.magFilter = dataTex.minFilter = THREE.NearestFilter;
  dataTex.wrapS = dataTex.wrapT = THREE.ClampToEdgeWrapping;
  dataTex.generateMipmaps = false;
  dataTex.needsUpdate = true;

  const segs = 128;
  const geo = buildGeometry(world, segs);
  const material = new THREE.ShaderMaterial({
    vertexShader: OVERLAY_VERT, fragmentShader: OVERLAY_FRAG,
    uniforms: {
      uZone: { value: dataTex }, uRes: { value: res },
      uTime: { value: 0 }, uOpacity: { value: 1 },
    },
    transparent: true, depthWrite: false, depthTest: true,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6,
    side: THREE.FrontSide, fog: false,
  });
  material.name = 'zoning-overlay';
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'zoning-overlay';
  mesh.renderOrder = 6;
  mesh.matrixAutoUpdate = false;
  mesh.frustumCulled = false;
  mesh.castShadow = false; mesh.receiveShadow = false;
  mesh.visible = Z.overlayOn;
  Z.group.add(mesh);

  // smooth boundary ribbon (one extra draw call); shares the fill's uTime uniform object
  const lineMat = createBoundaryMaterial(material.uniforms.uTime);
  const lineGeo = buildBoundaryGeometry(world);
  let lineMesh = null;
  if (lineGeo) {
    lineMesh = new THREE.Mesh(lineGeo, lineMat);
    lineMesh.name = 'zoning-overlay-boundary';
    lineMesh.renderOrder = 7;
    lineMesh.matrixAutoUpdate = false;
    lineMesh.frustumCulled = false;
    lineMesh.castShadow = false; lineMesh.receiveShadow = false;
    lineMesh.visible = Z.overlayOn;
    Z.group.add(lineMesh);
  }

  Z.overlay = { mesh, material, geo, dataTex, data, res, segs, dirty: false, heightsDirty: false, lineMesh, lineMat, lineGeo };
}

/** Re-trace + rebuild the smooth boundary ribbon (paint edits / terrain edits). */
function rebuildLines(o) {
  const geo = buildBoundaryGeometry(Z.world);
  if (o.lineGeo) o.lineGeo.dispose();
  o.lineGeo = geo;
  if (geo) {
    if (!o.lineMesh) {
      o.lineMesh = new THREE.Mesh(geo, o.lineMat);
      o.lineMesh.name = 'zoning-overlay-boundary';
      o.lineMesh.renderOrder = 7;
      o.lineMesh.matrixAutoUpdate = false;
      o.lineMesh.frustumCulled = false;
      o.lineMesh.castShadow = false; o.lineMesh.receiveShadow = false;
      o.lineMesh.visible = Z.overlayOn;
      Z.group.add(o.lineMesh);
    } else {
      o.lineMesh.geometry = geo;
    }
    o.lineMesh.visible = Z.overlayOn;
  } else if (o.lineMesh) {
    o.lineMesh.visible = false;
  }
}

export function markOverlayDirty() { if (Z.overlay) Z.overlay.dirty = true; }
export function markOverlayHeightsDirty() { if (Z.overlay) Z.overlay.heightsDirty = true; }

export function setOverlay(on) {
  Z.overlayOn = !!on;
  if (Z.overlay) {
    Z.overlay.mesh.visible = Z.overlayOn;
    if (Z.overlay.lineMesh) Z.overlay.lineMesh.visible = Z.overlayOn && !!Z.overlay.lineGeo;
  }
}

export function updateOverlay(dt) {
  const o = Z.overlay;
  if (!o) return;
  o.material.uniforms.uTime.value += dt;
  const rebuild = o.dirty || o.heightsDirty;
  if (o.dirty) { fillZoneData(Z.world, o.data); o.dataTex.needsUpdate = true; o.dirty = false; }
  if (o.heightsDirty) {
    const newGeo = buildGeometry(Z.world, o.segs);
    o.mesh.geometry.dispose();
    o.mesh.geometry = newGeo;
    o.geo = newGeo;
    o.heightsDirty = false;
  }
  if (rebuild) rebuildLines(o);
}

export function disposeOverlay() {
  const o = Z.overlay;
  if (!o) return;
  o.mesh.removeFromParent();
  o.geo.dispose();
  o.material.dispose();
  o.dataTex.dispose();
  if (o.lineMesh) { o.lineMesh.removeFromParent(); }
  if (o.lineGeo) o.lineGeo.dispose();
  if (o.lineMat) o.lineMat.dispose();
  Z.overlay = null;
}
