// Ground-conforming zoning overlay: one draw call. A terrain-following mesh (baked heights, rebuilt on
// terrain:modified) carries a per-cell data texture (R=zone id, G/B=habitatId lo/hi byte) sampled per
// fragment so cell edges stay crisp regardless of mesh resolution. The fragment shader tints HABITAT/
// VISITOR/SERVICE fill, traces a soft anti-aliased line at every zone/habitat boundary with an animated
// "marching ants" dash, and adds a plank-line tint inside VISITOR cells (the boardwalk read). NONE and
// the derived NO_BUILD zone render nothing — NO_BUILD is set automatically over every road and water
// cell on the whole map (see grid.js), and painting that solid red would carpet the terrain.
import * as THREE from 'three';
import { Z } from './state.js';

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
uniform float uCellSize;
uniform float uTime;
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
  // NONE (0) and the derived NO_BUILD (4, roads/water — see grid.js) never paint a fill; they can still
  // contribute an edge line against a habitat/visitor/service neighbour below.
  bool paints = zid > 0.5 && zid < 3.5;

  float here = regionKey(here4);
  float rE = regionKey(texture2D(uZone, vUv + vec2(texel.x, 0.0)));
  float rW = regionKey(texture2D(uZone, vUv - vec2(texel.x, 0.0)));
  float rN = regionKey(texture2D(uZone, vUv + vec2(0.0, texel.y)));
  float rS = regionKey(texture2D(uZone, vUv - vec2(0.0, texel.y)));

  vec2 cellUv = fract(vUv * uRes);
  float dE = rE != here ? (1.0 - cellUv.x) : 2.0;
  float dW = rW != here ? cellUv.x : 2.0;
  float dN = rN != here ? (1.0 - cellUv.y) : 2.0;
  float dS = rS != here ? cellUv.y : 2.0;
  float edgeFrac = min(min(dE, dW), min(dN, dS));
  float edgeDistM = edgeFrac * uCellSize;
  // a wide (1.4 m) soft line: bright core, fading tail, clearly a highlighted boundary rather than
  // just the raw staircase edge of the fill (that staircase is still the true shape — this is the
  // "obviously drawn on top" outline a zoning-tool reference wants).
  float edge = 1.0 - smoothstep(0.0, 1.4, edgeDistM);
  float edgeCore = 1.0 - smoothstep(0.0, 0.35, edgeDistM);
  // an edge only reads on the side that actually has a fill (paints); the auto no-build side stays blank
  if (!paints) edge = 0.0;

  if (!paints && edge <= 0.0) discard;

  // marching ants: a bright dash travelling along the boundary direction is approximated with a
  // world-space diagonal coordinate (cheap, direction-agnostic, reads fine on a thin line)
  float dashCoord = (vWorldPos.x + vWorldPos.z) * 0.22 - uTime * 2.2;
  float dashW = fwidth(dashCoord) * 1.5 + 0.001;
  float dashPhase = fract(dashCoord);
  float dash = smoothstep(0.42 - dashW, 0.42 + dashW, dashPhase) * smoothstep(0.92 + dashW, 0.92 - dashW, dashPhase);

  vec3 col = paints ? zoneColor(zid) : vec3(1.0);
  if (paints && zid > 1.5 && zid < 2.5) {
    // boardwalk plank read: alternating tint + a thin seam every ~1.35 m across the visitor path.
    // fwidth-derived antialiasing keeps this from turning into moire noise at a distant/top-down camera
    // (a naive fract() seam aliases hard once the plank period drops below a pixel's world footprint).
    float plankPos = (vWorldPos.x * 0.7 + vWorldPos.z * 0.3) / 1.35;
    float pf = fract(plankPos);
    float pw = clamp(fwidth(plankPos) * 1.4, 0.01, 0.5);
    float seam = smoothstep(0.0, pw, pf) * smoothstep(1.0, 1.0 - pw, pf);
    col *= mix(0.86, 1.05, seam);
  }
  // bright warm highlight on the boundary line, brightest right at the cell edge
  vec3 lineColor = vec3(1.0, 0.93, 0.55);
  col = mix(col, lineColor, edge * mix(0.55, 1.0, dash) * 0.9 + edgeCore * 0.1);

  float fillA = paints ? 0.30 : 0.0;
  float edgeA = edge * mix(0.55, 1.0, dash);
  float a = max(fillA, edgeA);
  gl_FragColor = vec4(col, a * uOpacity);
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
      uZone: { value: dataTex }, uRes: { value: res }, uCellSize: { value: world.grid.cell },
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
  Z.overlay = { mesh, material, geo, dataTex, data, res, segs, dirty: false, heightsDirty: false };
}

export function markOverlayDirty() { if (Z.overlay) Z.overlay.dirty = true; }
export function markOverlayHeightsDirty() { if (Z.overlay) Z.overlay.heightsDirty = true; }

export function setOverlay(on) {
  Z.overlayOn = !!on;
  if (Z.overlay) Z.overlay.mesh.visible = Z.overlayOn;
}

export function updateOverlay(dt) {
  const o = Z.overlay;
  if (!o) return;
  o.material.uniforms.uTime.value += dt;
  if (o.dirty) { fillZoneData(Z.world, o.data); o.dataTex.needsUpdate = true; o.dirty = false; }
  if (o.heightsDirty) {
    const newGeo = buildGeometry(Z.world, o.segs);
    o.mesh.geometry.dispose();
    o.mesh.geometry = newGeo;
    o.geo = newGeo;
    o.heightsDirty = false;
  }
}

export function disposeOverlay() {
  const o = Z.overlay;
  if (!o) return;
  o.mesh.removeFromParent();
  o.geo.dispose();
  o.material.dispose();
  o.dataTex.dispose();
  Z.overlay = null;
}
