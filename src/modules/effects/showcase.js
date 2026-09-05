// Showcase: a self-contained "effects yard" so the pipeline can be judged without terrain/environment.
// Ground (only when terrain is absent), a sky dome with a sun disc (only when environment is absent),
// PBR spheres on plinths, crates, water tanks, rocks, lamp posts (emissive + point lights), a campfire,
// a trough, mid-distance sheds and trees, and a far skyline of tall boxes for the heat-haze band.
import * as THREE from 'three';

export const presets = {
  overview: {
    camera: { target: [0, 0], distance: 240, pitch: 26, yaw: 35 }, tod: 17.5,
    description: 'Full stack at golden hour over the effects yard: GTAO contact shadows under crates, spheres and rocks; subtle bloom on the sun disc and metal highlights; warm filmic grade, vignette, fine grain; ambient dust motes lit by the low sun.',
  },
  close: {
    // yaw 195 keeps the low sun (~288° compass bearing at tod 17, dry season) well outside the
    // frame (camera looks towards ~165°) so the sun rim-lights the dust/smoke from behind-left
    // instead of the whole sky blowing out white when staring straight into it (round-2 fix).
    camera: { target: [0, 0], distance: 26, pitch: 16, yaw: 195 }, tod: 17,
    description: 'Dust puffs kicked up along a track ~20 m from the camera, campfire smoke and trough splashes: soft particles fading into ground and crates, rim-lit by the low sun from behind, carried by the wind.',
  },
  heat: {
    camera: { target: [0, -150], distance: 120, pitch: 6, yaw: 0 }, tod: 13,
    description: 'Midday at 37 °C: heat-haze shimmer on the ground and skyline beyond ~120 m; nothing near the camera wobbles.',
  },
  night: {
    camera: { target: [0, 0], distance: 70, pitch: 18, yaw: 120 }, tod: 22,
    description: 'Night: bloom on the emissive lamp heads and embers, point-lit pools on the ground, cool grade, blacks not crushed.',
  },
  off: {
    camera: { target: [0, 0], distance: 240, pitch: 26, yaw: 35 }, tod: 17.5,
    description: 'Same view and time as overview with the whole pipeline bypassed (direct MSAA render, no particles) for A/B comparison.',
  },
};

const ST = {
  built: false, group: null, preset: null, api: null,
  dome: null, domeU: null, mats: [], geos: [], lights: [],
  smoke: null, splash: null, trackAngle: 0, puffAcc: 0, vehicleDir: { x: 0, z: 0 },
  hourCache: -1,
};

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() { vDir = (modelMatrix * vec4(position, 1.0)).xyz - cameraPosition; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const SKY_FRAG = /* glsl */ `
uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uGround; uniform vec3 uSunDir; uniform vec3 uSunColor; uniform float uSunUp; uniform float uStars;
varying vec3 vDir;
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 sky = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.45));
  vec3 col = h < 0.0 ? mix(uHorizon, uGround, clamp(-h * 8.0, 0.0, 1.0)) : sky;
  float s = max(dot(d, uSunDir), 0.0);
  col += uSunColor * (pow(s, 900.0) * 3.0 + pow(s, 24.0) * 0.18 + pow(s, 3.0) * 0.05) * uSunUp;
  if (uStars > 0.0 && h > 0.02) {
    vec2 c = floor(d.xz / max(h, 0.05) * 260.0);
    float st = step(0.9975, hash12(c));
    col += vec3(0.7, 0.8, 1.0) * st * uStars * (0.35 + 0.65 * hash12(c + 7.0)) * smoothstep(0.02, 0.2, h);
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

function track(o) { if (o.isMaterial) ST.mats.push(o); else ST.geos.push(o); return o; }

function applySet(m, set, { metal = false } = {}) {
  m.map = set.map; m.normalMap = set.normalMap; m.roughnessMap = set.roughnessMap; m.aoMap = set.aoMap;
  if (!metal) m.metalnessMap = set.metalnessMap;
  m.needsUpdate = true;
  return m;
}

function tileUv(geo, sx, sz = sx) {
  const uv = geo.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * sx, uv.getY(i) * sz);
  uv.needsUpdate = true;
  return geo;
}

function build(ctx, api, parent) {
  const rng = ctx.rng.fork('stage'), T = ctx.textures, M = ctx.materials, world = ctx.world;
  const g = new THREE.Group(); g.name = 'effects-stage';
  parent.add(g);
  ST.group = g;
  const hasTerrain = ctx.modules.has('terrain'), hasEnv = ctx.modules.has('environment');
  const gy = (x, z) => world.getHeight(x, z);
  const O = new THREE.Object3D();

  // ---- procedural PBR sets
  const ground = T.pbr({
    key: 'effects:ground', size: 1024, seed: 3, normalStrength: 0.05,
    height: 'float height(vec2 uv){ float h = tfbm(uv, 6.0, 6, uSeed) * 0.5 + 0.5; float w = tworley(uv, 24.0, uSeed + 2.0).x; return mix(h, 1.0 - w, 0.3); }',
    albedo: 'vec3 albedo(vec2 uv, float h){ vec3 dirt = vec3(0.40, 0.31, 0.20); vec3 dry = vec3(0.63, 0.52, 0.32); vec3 grass = vec3(0.34, 0.36, 0.16); float n = tfbm(uv, 3.0, 4, uSeed + 9.0) * 0.5 + 0.5; vec3 c = mix(dirt, dry, h); c = mix(c, grass, smoothstep(0.55, 0.8, n) * 0.7); c *= 0.85 + 0.3 * (tfbm(uv, 40.0, 3, uSeed + 5.0) * 0.5 + 0.5); return c; }',
    roughness: 'float rough(vec2 uv, float h){ return 0.82 + 0.16 * (1.0 - h); }',
  });
  const wood = T.pbr({
    key: 'effects:wood', size: 512, seed: 21, normalStrength: 0.04,
    height: 'float height(vec2 uv){ float plank = fract(uv.y * 4.0); float gap = smoothstep(0.0, 0.05, plank) * smoothstep(0.0, 0.05, 1.0 - plank); float grain = tfbm(vec2(uv.x, uv.y * 10.0), 8.0, 4, uSeed) * 0.5 + 0.5; return mix(0.2, 1.0, gap) * (0.7 + 0.3 * grain); }',
    albedo: 'vec3 albedo(vec2 uv, float h){ vec3 a = vec3(0.42, 0.27, 0.15); vec3 b = vec3(0.64, 0.46, 0.27); float gr = tfbm(vec2(uv.x * 2.0, uv.y * 24.0), 6.0, 3, uSeed + 3.0) * 0.5 + 0.5; return mix(a, b, gr) * (0.55 + 0.45 * h); }',
    roughness: 'float rough(vec2 uv, float h){ return 0.72 + 0.25 * (1.0 - h); }',
  });
  const rock = T.pbr({
    key: 'effects:rock', size: 512, seed: 33, normalStrength: 0.12,
    height: 'float height(vec2 uv){ return tridged(uv, 5.0, 5, uSeed) * 0.7 + tfbm(uv, 20.0, 3, uSeed + 1.0) * 0.15 + 0.15; }',
    albedo: 'vec3 albedo(vec2 uv, float h){ vec3 a = vec3(0.30, 0.27, 0.24); vec3 b = vec3(0.55, 0.48, 0.40); float m = tfbm(uv, 9.0, 3, uSeed + 4.0) * 0.5 + 0.5; return mix(a, b, h * 0.7 + m * 0.3); }',
    roughness: 'float rough(vec2 uv, float h){ return 0.85 + 0.12 * (1.0 - h); }',
  });
  const metal = T.pbr({
    key: 'effects:metal', size: 512, seed: 44, normalStrength: 0.01,
    height: 'float height(vec2 uv){ return tfbm(vec2(uv.x * 30.0, uv.y * 0.5), 6.0, 3, uSeed) * 0.5 + 0.5; }',
    albedo: 'vec3 albedo(vec2 uv, float h){ float rust = smoothstep(0.62, 0.8, tfbm(uv, 4.0, 4, uSeed + 2.0) * 0.5 + 0.5); return mix(vec3(0.62, 0.64, 0.66) * (0.85 + 0.15 * h), vec3(0.36, 0.18, 0.08), rust); }',
    roughness: 'float rough(vec2 uv, float h){ float rust = smoothstep(0.62, 0.8, tfbm(uv, 4.0, 4, uSeed + 2.0) * 0.5 + 0.5); return mix(0.38 + 0.2 * h, 0.9, rust); }',
  });
  const concrete = T.pbr({
    key: 'effects:concrete', size: 512, seed: 55, normalStrength: 0.03,
    height: 'float height(vec2 uv){ return tfbm(uv, 8.0, 5, uSeed) * 0.5 + 0.5; }',
    albedo: 'vec3 albedo(vec2 uv, float h){ float streak = tfbm(vec2(uv.x * 6.0, uv.y * 0.7), 5.0, 3, uSeed + 8.0) * 0.5 + 0.5; return mix(vec3(0.58, 0.55, 0.50), vec3(0.70, 0.66, 0.58), h) * (0.8 + 0.2 * streak); }',
    roughness: 'float rough(vec2 uv, float h){ return 0.8 + 0.15 * h; }',
  });
  const paint = T.pbr({
    key: 'effects:paint', size: 256, seed: 66, normalStrength: 0.006,
    height: 'float height(vec2 uv){ return tfbm(uv, 14.0, 4, uSeed) * 0.5 + 0.5; }',
    albedo: 'vec3 albedo(vec2 uv, float h){ return vec3(0.92 + 0.08 * h); }',
    roughness: 'float rough(vec2 uv, float h){ return 0.9 + 0.1 * (h - 0.5); }',
  });

  // ---- ground (flat world only)
  if (!hasTerrain) {
    const geo = track(tileUv(new THREE.PlaneGeometry(1100, 1100, 1, 1), 1100 / 5));
    geo.rotateX(-Math.PI / 2);
    // Tint the ground set to a savannah soil tone rather than white. The earlier white tint left the
    // yard reading as blown-out paper. (It was first darkened much further, to 0x6e5c3f, to
    // compensate for the sRGB double-encode bug in core/Textures.js; now that the core bug is fixed
    // that compensation would read as mud, so this is the true colour.)
    const mat = track(applySet(M.standard({ color: 0xa08a63, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }), ground));
    // macro variation to hide the 5 m tiling
    mat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
  vec4 sampledDiffuseColor = texture2D(map, vMapUv);
  vec3 macro = texture2D(map, vMapUv * 0.061 + vec2(0.37, 0.11)).rgb;
  vec3 macro2 = texture2D(map, vMapUv * 0.013 + vec2(0.71, 0.53)).rgb;
  sampledDiffuseColor.rgb *= mix(vec3(1.0), macro * 1.7, 0.4) * mix(vec3(1.0), macro2 * 1.7, 0.35);
  diffuseColor *= sampledDiffuseColor;`);
    };
    mat.customProgramCacheKey = () => 'effects-ground';
    const mesh = new THREE.Mesh(geo, mat); mesh.name = 'effects-ground'; mesh.receiveShadow = true; mesh.position.y = 0.0;
    g.add(mesh);
  }

  // ---- sky dome (no environment only)
  if (!hasEnv) {
    ST.domeU = {
      uZenith: { value: new THREE.Color(0.12, 0.3, 0.62) }, uHorizon: { value: new THREE.Color(0.6, 0.62, 0.66) }, uGround: { value: new THREE.Color(0.35, 0.3, 0.22) },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color(1, 0.9, 0.7) }, uSunUp: { value: 1 }, uStars: { value: 0 },
    };
    const mat = track(new THREE.ShaderMaterial({ uniforms: ST.domeU, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false }));
    const dome = new THREE.Mesh(track(new THREE.SphereGeometry(2800, 48, 24)), mat);
    dome.name = 'effects-sky'; dome.renderOrder = -10; dome.frustumCulled = false;
    g.add(dome); ST.dome = dome;
  }

  // ---- PBR spheres on plinths: 3 rows × 5
  const sphereGeo = track(new THREE.SphereGeometry(1.7, 48, 32));
  const plinthGeo = track(tileUv(new THREE.BoxGeometry(2.6, 0.5, 2.6), 1));
  const plinthMat = track(applySet(M.standard({ color: 0xd9d2c4, roughness: 1 }), concrete));
  const rows = [
    { z: -14, metal: 0, colors: [0xb5522e, 0x6f7a2a, 0xc9963c, 0x4d6a8c, 0xe9dfc8] },
    { z: 0, metal: 1, colors: [0xffd27a, 0xd07a4a, 0xa8aeb4, 0xf4f4f4, 0xb08a4c] },
    { z: 14, metal: 0.5, colors: [0x8a4a3a, 0x3f6b5a, 0x8a8a90, 0x6a4c8c, 0xcfb04a] },
  ];
  rows.forEach((row, ri) => {
    row.colors.forEach((col, ci) => {
      const x = -16 + ci * 8, z = row.z;
      const y0 = gy(x, z);
      const plinth = new THREE.Mesh(plinthGeo, plinthMat); plinth.position.set(x, y0 + 0.25, z); plinth.castShadow = plinth.receiveShadow = true; g.add(plinth);
      const rough = 0.08 + ci * 0.22;
      const mat = track(applySet(M.standard({ color: col, roughness: rough, metalness: row.metal }), ri === 2 && ci % 2 ? rock : paint, { metal: true }));
      const s = new THREE.Mesh(sphereGeo, mat); s.position.set(x, y0 + 0.5 + 1.7, z); s.castShadow = s.receiveShadow = true; g.add(s);
    });
  });

  // ---- crate clusters (instanced)
  const crateGeo = track(tileUv(new THREE.BoxGeometry(1, 1, 1), 1));
  const crateMat = track(applySet(M.standard({ color: 0xffffff, roughness: 1 }), wood));
  const clusters = [[-30, 10], [24, -24], [30, 20], [-8, 30]];
  const crateCount = clusters.length * 6;
  const crates = new THREE.InstancedMesh(crateGeo, crateMat, crateCount);
  let ci = 0;
  for (const [cx, cz] of clusters) {
    let stackH = 0;
    for (let i = 0; i < 6; i++) {
      const s = 1.1 + rng.float() * 0.6;
      const stacked = i > 2 && rng.bool(0.6);
      const px = stacked ? cx + (rng.float() - 0.5) * 0.3 : cx + (rng.float() - 0.5) * 5, pz = stacked ? cz + (rng.float() - 0.5) * 0.3 : cz + (rng.float() - 0.5) * 5;
      const y = gy(px, pz) + (stacked ? stackH + s / 2 : s / 2);
      if (stacked) stackH += s; else if (i === 0) stackH = s;
      O.position.set(px, y, pz); O.rotation.set(0, rng.float() * Math.PI, 0); O.scale.setScalar(s); O.updateMatrix();
      crates.setMatrixAt(ci++, O.matrix);
    }
  }
  crates.castShadow = crates.receiveShadow = true; crates.name = 'effects-crates'; g.add(crates);

  // ---- water tanks + trough (metal)
  const tankGeo = track(tileUv(new THREE.CylinderGeometry(2.2, 2.2, 3.2, 40), 3, 1));
  const tankMat = track(applySet(M.standard({ color: 0xffffff, roughness: 1, metalness: 1 }), metal, { metal: true }));
  for (const [x, z] of [[-24, -30], [-29, -25], [-20, -25]]) {
    const t = new THREE.Mesh(tankGeo, tankMat); t.position.set(x, gy(x, z) + 1.6, z); t.castShadow = t.receiveShadow = true; g.add(t);
  }
  const troughGeo = track(tileUv(new THREE.BoxGeometry(3, 0.7, 1.1), 1));
  const trough = new THREE.Mesh(troughGeo, tankMat); trough.position.set(7, gy(7, 5) + 0.35, 5); trough.rotation.y = 0.4; trough.castShadow = trough.receiveShadow = true; g.add(trough);
  const waterMat = track(M.physical({ color: 0x3a5a66, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.9 }));
  const water = new THREE.Mesh(track(new THREE.PlaneGeometry(2.8, 0.9)), waterMat); water.rotation.set(-Math.PI / 2, 0, 0); water.position.set(0, 0.32, 0); trough.add(water);

  // ---- rocks (displaced icosahedra, each unique)
  const rockMat = track(applySet(M.standard({ color: 0xffffff, roughness: 1 }), rock));
  const noise = ctx.noise;
  for (let i = 0; i < 9; i++) {
    const geo = track(new THREE.IcosahedronGeometry(1, 3));
    const p = geo.getAttribute('position'); const v = new THREE.Vector3();
    const seed = i * 7.3;
    for (let k = 0; k < p.count; k++) {
      v.set(p.getX(k), p.getY(k), p.getZ(k));
      const n = 1 + 0.28 * noise.fbm3D(v.x * 1.4 + seed, v.y * 1.4, v.z * 1.4, 4) + 0.08 * noise.noise3D(v.x * 5 + seed, v.y * 5, v.z * 5);
      v.multiplyScalar(n); p.setXYZ(k, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    const a = rng.float() * Math.PI * 2, r = 18 + rng.float() * 40;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const s = 1.2 + rng.float() * 2.0;
    const m = new THREE.Mesh(geo, rockMat);
    m.position.set(x, gy(x, z) + s * 0.55, z); m.scale.set(s * (0.8 + rng.float() * 0.5), s * 0.75, s * (0.8 + rng.float() * 0.5)); m.rotation.y = rng.float() * 6;
    m.castShadow = m.receiveShadow = true; g.add(m);
  }

  // ---- campfire: ring of stones, embers, smoke
  const fx = -7, fz = 6, fy = gy(fx, fz);
  const stoneGeo = track(new THREE.DodecahedronGeometry(0.28, 1));
  const stones = new THREE.InstancedMesh(stoneGeo, rockMat, 8);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    O.position.set(fx + Math.cos(a) * 0.9, fy + 0.18, fz + Math.sin(a) * 0.9); O.rotation.set(rng.float(), rng.float(), rng.float()); O.scale.setScalar(0.8 + rng.float() * 0.5); O.updateMatrix();
    stones.setMatrixAt(i, O.matrix);
  }
  stones.castShadow = stones.receiveShadow = true; g.add(stones);
  const emberMat = track(M.standard({ color: 0x1a0a05, emissive: 0xff5a10, emissiveIntensity: 4, roughness: 1 }));
  const embers = new THREE.Mesh(track(new THREE.SphereGeometry(0.42, 16, 10)), emberMat); embers.position.set(fx, fy + 0.15, fz); embers.scale.y = 0.45; g.add(embers);
  const fireLight = new THREE.PointLight(0xff7a2a, 8, 18, 2); fireLight.position.set(fx, fy + 0.8, fz); g.add(fireLight); ST.lights.push(fireLight);

  // ---- lamp posts around a 30 m ring (instanced), point lights on every other post
  const poleGeo = track(new THREE.CylinderGeometry(0.09, 0.13, 4.6, 12));
  const headGeo = track(new THREE.BoxGeometry(0.7, 0.36, 0.7));
  const poleMat = track(M.standard({ color: 0x2b2f33, roughness: 0.55, metalness: 0.8 }));
  const headMat = track(M.standard({ color: 0x221a10, emissive: 0xffd39a, emissiveIntensity: 7, roughness: 0.5 }));
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, 8), heads = new THREE.InstancedMesh(headGeo, headMat, 8);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.3, x = Math.cos(a) * 30, z = Math.sin(a) * 30, y = gy(x, z);
    O.position.set(x, y + 2.3, z); O.rotation.set(0, 0, 0); O.scale.setScalar(1); O.updateMatrix(); poles.setMatrixAt(i, O.matrix);
    O.position.set(x, y + 4.6 + 0.18, z); O.updateMatrix(); heads.setMatrixAt(i, O.matrix);
    if (i % 2 === 0) { const l = new THREE.PointLight(0xffd2a0, 28, 42, 2); l.position.set(x, y + 4.3, z); g.add(l); ST.lights.push(l); }
  }
  poles.castShadow = true; g.add(poles, heads);

  // ---- mid-distance sheds and trees (mostly north, towards the heat preset's view)
  const shedGeo = track(tileUv(new THREE.BoxGeometry(1, 1, 1), 2));
  const shedMat = track(applySet(M.standard({ color: 0xe0d8c8, roughness: 1 }), concrete));
  const sheds = new THREE.InstancedMesh(shedGeo, shedMat, 8);
  for (let i = 0; i < 8; i++) {
    const a = -Math.PI * 0.15 - rng.float() * Math.PI * 0.7 - Math.PI * 0.5; // north half
    const r = 110 + rng.float() * 150, x = Math.cos(a) * r, z = Math.sin(a) * r;
    const w = 8 + rng.float() * 6, h = 3.5 + rng.float() * 2.5, d = 6 + rng.float() * 5;
    O.position.set(x, gy(x, z) + h / 2, z); O.rotation.set(0, rng.float() * Math.PI, 0); O.scale.set(w, h, d); O.updateMatrix(); sheds.setMatrixAt(i, O.matrix);
  }
  sheds.castShadow = sheds.receiveShadow = true; g.add(sheds);
  const trunkGeo = track(new THREE.CylinderGeometry(0.18, 0.32, 1, 8)), canopyGeo = track(new THREE.SphereGeometry(1, 14, 10));
  const trunkMat = track(M.standard({ color: 0x4a3a28, roughness: 0.95 }));
  const canopyMat = track(M.standard({ color: 0x5c6a2c, roughness: 0.9 }));
  const nTrees = 14; const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, nTrees), canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, nTrees * 3);
  for (let i = 0; i < nTrees; i++) {
    const a = rng.float() * Math.PI * 2, r = 60 + rng.float() * 180, x = Math.cos(a) * r, z = Math.sin(a) * r, y = gy(x, z);
    const th = 4 + rng.float() * 4;
    O.position.set(x, y + th / 2, z); O.rotation.set(0, 0, 0); O.scale.set(1, th, 1); O.updateMatrix(); trunks.setMatrixAt(i, O.matrix);
    for (let k = 0; k < 3; k++) {
      const cr = 2.4 + rng.float() * 2.2;
      O.position.set(x + (rng.float() - 0.5) * 3, y + th + cr * 0.4, z + (rng.float() - 0.5) * 3); O.scale.set(cr, cr * 0.55, cr); O.updateMatrix(); canopies.setMatrixAt(i * 3 + k, O.matrix);
    }
  }
  trunks.castShadow = canopies.castShadow = true; canopies.receiveShadow = true; g.add(trunks, canopies);

  // ---- far skyline for the heat-haze band: tall boxes + silos at z ≈ -400..-470
  const farGeo = track(tileUv(new THREE.BoxGeometry(1, 1, 1), 3));
  const farMat = track(applySet(M.standard({ color: 0xd8cdb8, roughness: 1 }), concrete));
  const nFar = 18; const far = new THREE.InstancedMesh(farGeo, farMat, nFar);
  for (let i = 0; i < nFar; i++) {
    const x = -300 + (i / (nFar - 1)) * 600 + (rng.float() - 0.5) * 20, z = -400 - rng.float() * 70;
    const w = 8 + rng.float() * 8, h = 12 + rng.float() * 26, d = 8 + rng.float() * 8;
    O.position.set(x, gy(x, z) + h / 2, z); O.rotation.set(0, (rng.float() - 0.5) * 0.4, 0); O.scale.set(w, h, d); O.updateMatrix(); far.setMatrixAt(i, O.matrix);
  }
  g.add(far);
  const siloGeo = track(tileUv(new THREE.CylinderGeometry(1, 1, 1, 24), 4, 3));
  const silos = new THREE.InstancedMesh(siloGeo, tankMat, 6);
  for (let i = 0; i < 6; i++) {
    const x = -240 + i * 96 + (rng.float() - 0.5) * 30, z = -430 - rng.float() * 40, h = 18 + rng.float() * 10, r = 3.5 + rng.float() * 1.5;
    O.position.set(x, gy(x, z) + h / 2, z); O.rotation.set(0, 0, 0); O.scale.set(r, h, r); O.updateMatrix(); silos.setMatrixAt(i, O.matrix);
  }
  g.add(silos);

  // ---- emitters
  ST.smoke = api.emitter('smoke', { x: fx, y: fy + 0.5, z: fz, rate: 7, speed: 0.5, spread: 0.3, size: 0.4, life: 5.5 });
  ST.splash = api.emitter('splash', { x: 7, y: 0.8, z: 5, rate: 30, speed: 2.6, spread: 0.55, size: 0.09, life: 0.8 });
  ST.built = true;
}

export async function stage(ctx, presetName, api, group) {
  ST.preset = presetName; ST.api = api;
  if (!ST.built) build(ctx, api, group || ctx.scene);
  // The environment module owns renderer.toneMappingExposure. In this standalone showcase it is
  // normally absent, and nobody else sets it — so exposure stays at the renderer default of 1.0 and
  // the whole yard blows out to white, making the passes impossible to judge. Take ownership of
  // exposure only when environment is not loaded (updateStage drives it from the sun elevation).
  ST.ownsExposure = !ctx.modules.has('environment');
  // preset-specific state
  if (presetName === 'heat') {
    ctx.world.weather.temperature = 37;   // environment owns weather; in this standalone showcase nobody else writes it
    api.setAmbientDust(0.1);
  }
  if (presetName === 'off') {
    api.setEnabled('pipeline', false);
    api.setEnabled('particles', false);
  }
  if (presetName === 'overview') api.setAmbientDust(-1);
  if (presetName === 'close') { api.setAmbientDust(0.5); ST.trackAngle = 0; }
  // pre-roll the emitters so the first frame already has smoke/splashes in the air
  if (ST.smoke) ST.smoke.burst(24);
  if (ST.splash) ST.splash.burst(30);
  if (presetName === 'close') for (let i = 0; i < 12; i++) { const a = -i * 0.12; api.spawnDust(Math.cos(a) * 13, Math.sin(a) * 13, 0.8, { x: -Math.sin(a), z: Math.cos(a) }); }
}

const _skyZ = new THREE.Color(), _skyH = new THREE.Color();

export function updateStage(dt, t, S, ctx) {
  if (!ST.built) return;
  // Exposure fallback when environment is absent (see stage()). Roughly matches what environment
  // does: bright sun needs a low exposure, night needs a high one, so the image lands mid-range.
  if (ST.ownsExposure && ctx) {
    // 0.45 at noon, ~0.55 at golden hour, 1.8 under a sun below the horizon. The falloff is steep
    // because sunUp is small (~0.16) even at golden hour, when the scene is still fully sunlit.
    const up = Math.max(0, S.sunUp);
    ctx.renderer.toneMappingExposure = 0.45 + 1.35 * Math.exp(-up * 16);
  }
  // sky colours follow the sun
  if (ST.domeU) {
    const up = S.sunUp, u = ST.domeU;
    const dusk = Math.max(0, 1 - up * 5) * Math.min(1, up * 30);   // orange band at sunrise/sunset
    _skyZ.setHSL(0.6, 0.55, 0.02 + 0.33 * Math.min(1, up * 1.6));
    _skyH.setHSL(0.58 - 0.5 * dusk, 0.35 + 0.35 * dusk, 0.05 + 0.5 * Math.min(1, up * 2.5));
    u.uZenith.value.copy(_skyZ); u.uHorizon.value.copy(_skyH);
    u.uGround.value.setRGB(0.05 + 0.3 * up, 0.045 + 0.25 * up, 0.035 + 0.18 * up);
    u.uSunDir.value.copy(S.sunDir); u.uSunColor.value.copy(S.sunColor); u.uSunUp.value = Math.min(1, up * 4);
    u.uStars.value = Math.max(0, 1 - up * 25);
  }
  // dust along a circular track in the close preset (a vehicle we do not draw: traffic owns vehicles)
  if (ST.preset === 'close' && ST.api && dt > 0) {
    ST.trackAngle -= dt * 0.45;
    ST.puffAcc += dt;
    if (ST.puffAcc > 0.09) {
      ST.puffAcc = 0;
      const a = ST.trackAngle, x = Math.cos(a) * 13, z = Math.sin(a) * 13;
      ST.vehicleDir.x = -Math.sin(a); ST.vehicleDir.z = Math.cos(a);
      ST.api.spawnDust(x, z, 0.8, ST.vehicleDir);
    }
  }
}

export function disposeStage(ctx) {
  if (!ST.built) return;
  ST.smoke?.dispose(); ST.splash?.dispose();
  for (const m of ST.mats) { ctx?.materials.untrack(m); m.dispose(); }
  for (const g of ST.geos) g.dispose();
  ST.group?.removeFromParent();
  for (const k of ['effects:ground', 'effects:wood', 'effects:rock', 'effects:metal', 'effects:concrete', 'effects:paint']) {
    for (const s of [':height', ':albedo', ':orm', ':normal']) ctx?.textures.dispose(k + s);
  }
  ST.mats.length = 0; ST.geos.length = 0; ST.lights.length = 0;
  ST.built = false; ST.group = null; ST.dome = null; ST.domeU = null; ST.smoke = ST.splash = null;
}
