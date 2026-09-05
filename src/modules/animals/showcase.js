// Showcase presets + staging for the animals module alone (works on the flat core fallback ground or
// on real terrain if the terrain module is present).
import * as THREE from 'three';

const DEG = Math.PI / 180;

export const presets = {
  overview:  { camera: { target: [0, 0], distance: 230, pitch: 22, yaw: 215 }, tod: 16, description: 'Mixed herds on the plains: elephant, giraffe, zebra, wildebeest, buffalo, impala, ostrich, warthog, rhino, lion, cheetah' },
  herd:      { camera: { target: [0, 0], distance: 34, pitch: 11, yaw: 225 }, tod: 16.5, description: 'Zebra and wildebeest herd walking past, eye level' },
  waterhole: { camera: { target: [0, 0], distance: 46, pitch: 15, yaw: 100 }, tod: 8, description: 'Elephants and a giraffe drinking at a waterhole in morning light' },
  predators: { camera: { target: [0, 0], distance: 26, pitch: 13, yaw: 235 }, tod: 17.5, description: 'Lion pride resting, cheetah walking past' },
  close:     { camera: { target: [0, 0], distance: 12, pitch: 9, yaw: 200 }, tod: 15, description: 'One elephant at 12 m' },
  night:     { camera: { target: [0, 0], distance: 40, pitch: 14, yaw: 300 }, tod: 21.5, description: 'Night: hippos leaving the water, zebra and giraffe asleep' },
};

/** Camera-facing heading helper: preset yaw → heading that faces the camera, plus an offset. */
function facing(yawDeg, offset = 0) { return yawDeg * DEG + offset; }

/** Find real water near (x,z) on the terrain, or build a stage waterhole disc. Returns {x,z,r}. */
function ensureWater(ctx, api, x, z, r) {
  const world = ctx.world;
  if (world.terrain.waterLevel > -1e8) {
    // search real water near the requested spot
    let best = null;
    for (let rad = 0; rad <= 45 && !best; rad += 5) {
      const n = Math.max(1, Math.round(rad / 6));
      for (let k = 0; k < n; k++) {
        const ang = (k / n) * Math.PI * 2, px = x + Math.cos(ang) * rad, pz = z + Math.sin(ang) * rad;
        if (world.inBounds(px, pz) && world.isWater(px, pz)) { best = { x: px, z: pz }; break; }
      }
    }
    if (best) {
      // shore points: march outward from the water sample in 12 directions
      let rr = 0;
      for (let k = 0; k < 12; k++) {
        const ang = (k / 12) * Math.PI * 2;
        let d = 0;
        while (d < 120 && world.isWater(best.x + Math.cos(ang) * d, best.z + Math.sin(ang) * d)) d += 1.5;
        api.addWaterPoint(best.x + Math.cos(ang) * d, best.z + Math.sin(ang) * d, Math.cos(ang), Math.sin(ang));
        rr += d / 12;
      }
      if (rr >= 3) return { x: best.x, z: best.z, r: rr, real: true };
      api.waterPoints().length = 0;
    }
  }
  // stage waterhole on the fallback ground
  const group = api._group();
  const T = ctx.textures;
  const wob = wobbleShape(x, z);
  const mudTex = T.pbr({
    key: 'animals:stage-mud', size: 512, normalStrength: 0.05,
    height: 'float height(vec2 uv){ return tfbm(uv, 7.0, 5, uSeed) * 0.5 + 0.5; }',
    // muddy trampled bank: dark wet clay near the water lightening to dry dust at the rim, with hoof-
    // churned patches (low-frequency worley-ish blotches) breaking up any obvious radial symmetry
    albedo: 'vec3 albedo(vec2 uv, float h){ vec2 c=uv-0.5; float rr=length(c)*2.0; float blotch=smoothstep(0.3,0.9,tfbm(uv,5.0,4,3.0)); vec3 wet=vec3(0.14,0.10,0.075); vec3 dry=vec3(0.42,0.35,0.24); vec3 base=mix(wet,dry,clamp(rr*0.85+0.1,0.0,1.0)); return base*(0.82+0.3*h)*(0.9+0.22*blotch); }',
    roughness: 'float rough(vec2 uv, float h){ return 0.97 - 0.15 * h; }',
  });
  // Fade the mud apron out with per-vertex alpha so it blends into the grass instead of ending on a
  // hard circle, and bend both the mud and the water to an irregular (non-circular) footprint.
  const ringGeo = new THREE.RingGeometry(r * 0.94, r * 2.0, 96, 8);
  const rp = ringGeo.attributes.position, rc = new Float32Array(rp.count * 4);
  for (let i = 0; i < rp.count; i++) {
    const rx = rp.getX(i), ry = rp.getY(i), rad0 = Math.hypot(rx, ry), ang = Math.atan2(ry, rx);
    const rad = rad0 * wob(ang);
    rp.setX(i, Math.cos(ang) * rad); rp.setY(i, Math.sin(ang) * rad);
    const t = Math.min(1, Math.max(0, (rad0 - r * 0.94) / (r * 1.06)));
    const shade = 0.6 + 0.4 * t;
    const a = 1 - t * t * (3 - 2 * t);
    rc[i * 4] = shade; rc[i * 4 + 1] = shade; rc[i * 4 + 2] = shade; rc[i * 4 + 3] = a;
  }
  rp.needsUpdate = true; ringGeo.computeVertexNormals();
  ringGeo.setAttribute('color', new THREE.BufferAttribute(rc, 4));
  const ring = new THREE.Mesh(ringGeo, ctx.materials.applyPbr(ctx.materials.standard({ roughness: 1, vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }), mudTex));
  ring.rotation.x = -Math.PI / 2; ring.receiveShadow = true; ring.name = 'animals-stage-mud';
  // Basin height: average several samples INSIDE the pool footprint (where the animals actually
  // stand), not the far rim — sampling out at the mud's outer edge once picked up an unrelated rise
  // in the terrain and floated the whole pool a metre-plus above the animals drinking at it.
  let y0 = world.getHeight(x, z), n = 1;
  for (let k = 0; k < 12; k++) {
    const ang = (k / 12) * Math.PI * 2;
    y0 += world.getHeight(x + Math.cos(ang) * r * 0.55, z + Math.sin(ang) * r * 0.55); n++;
  }
  y0 /= n;
  ring.position.set(x, y0 + 0.012, z);
  // Muddy, low-saturation water (not aquarium-blue): a dark olive-brown that picks up a little sky.
  const waterMat = ctx.materials.physical({
    color: 0x33362c, roughness: 0.16, metalness: 0, transparent: true, opacity: 0.92,
    clearcoat: 0.7, clearcoatRoughness: 0.22, envMapIntensity: 0.85, iridescence: 0,
  });
  const waterGeo = new THREE.CircleGeometry(r * 0.97, 64);
  const wp = waterGeo.attributes.position;
  for (let i = 1; i < wp.count; i++) { // skip the centre vertex
    const wx = wp.getX(i), wy = wp.getY(i), rad0 = Math.hypot(wx, wy), ang = Math.atan2(wy, wx);
    const rad = rad0 * wob(ang) * 0.985; // stay a hair inside the mud so the wet rim always shows
    wp.setX(i, Math.cos(ang) * rad); wp.setY(i, Math.sin(ang) * rad);
  }
  wp.needsUpdate = true; waterGeo.computeVertexNormals();
  const water = new THREE.Mesh(waterGeo, waterMat);
  water.rotation.x = -Math.PI / 2; water.position.set(x, y0 + 0.03, z); water.receiveShadow = true; water.name = 'animals-stage-water';
  group.add(ring, water);
  api._stageMeshes().push(ring, water);
  for (let k = 0; k < 16; k++) { const ang = (k / 16) * Math.PI * 2; const rr = r * wob(ang); api.addWaterPoint(x + Math.cos(ang) * rr, z + Math.sin(ang) * rr, Math.cos(ang), Math.sin(ang)); }
  return { x, z, r, real: false };
}

function towards(x, z, tx, tz) { return Math.atan2(tx - x, tz - z); }

/** Deterministic 0..1 hash from a position + salt (no Math.random — a waterhole's wobble shape
 * must be reproducible from x,z alone so re-staging the same preset looks the same). */
function posHash(x, z, n) { const v = Math.sin(x * 12.9898 + z * 78.233 + n * 37.719) * 43758.5453; return v - Math.floor(v); }

/** Irregular closed radial profile (0.82..1.18) so a staged waterhole reads as a natural pool, not a
 * perfect circle: three sine harmonics at non-integer-ratio frequencies with position-seeded phase. */
function wobbleShape(x, z) {
  const p0 = posHash(x, z, 1) * Math.PI * 2, p1 = posHash(x, z, 2) * Math.PI * 2, p2 = posHash(x, z, 3) * Math.PI * 2;
  return (ang) => 1 + 0.11 * Math.sin(ang * 2.15 + p0) + 0.07 * Math.sin(ang * 3.7 + p1) + 0.045 * Math.sin(ang * 6.3 + p2);
}

/** Re-aim a preset's camera target. Core reads preset.camera after stage() resolves, so this lands. */
function aim(P, x, z) { if (P?.camera?.target) { P.camera.target[0] = x; P.camera.target[1] = z; } }

export async function stage(ctx, preset) {
  const api = ctx.modules.get('animals');
  if (!api) return;
  api.clear();
  const terrain = ctx.modules.get('terrain');
  if (terrain?.generate) { try { await terrain.generate(); } catch (err) { ctx.log.warn('terrain.generate() failed in animals stage', err); } }
  const hold = 1e6; // showcase animals hold their staged state
  const P = presets[preset] || presets.overview;
  const yaw = P.camera.yaw;

  switch (preset) {
    case 'close': {
      api.spawn('elephant', 0, 0, 1, { heading: facing(yaw, 0.7), state: 'idle', hold, sex: 'female', scale: 1 });
      break;
    }
    case 'herd': {
      const dir = facing(yaw, Math.PI / 2 - 0.15); // cross the view
      const dx = Math.sin(dir), dz = Math.cos(dir);
      api.spawn('zebra', -4 + dx * -6, 6 + dz * -6, 12, { heading: dir, state: 'walk', hold, target: [-4 + dx * 90, 6 + dz * 90], spread: 9 });
      api.spawn('wildebeest', 10 + dx * 4, -8 + dz * 4, 14, { heading: dir + 0.1, state: 'walk', hold, target: [10 + dx * 90, -8 + dz * 90], spread: 11 });
      api.spawn('impala', -22, -30, 8, { heading: dir, state: 'graze', hold, spread: 8 });
      break;
    }
    case 'waterhole': {
      const w = ensureWater(ctx, api, -12, 0, 13);
      aim(P, w.x + 6, w.z);
      const shore = (ang, d) => [w.x + Math.cos(ang) * (w.r + d), w.z + Math.sin(ang) * (w.r + d)];
      const e = [shore(-0.35, 2.2), shore(0.05, 2.5), shore(0.45, 2.2)];
      for (const [x, z] of e) api.spawn('elephant', x, z, 1, { heading: towards(x, z, w.x, w.z), state: 'drink', hold });
      const [gx, gz] = shore(-0.95, 2.6);
      api.spawn('giraffe', gx, gz, 1, { heading: towards(gx, gz, w.x, w.z), state: 'drink', hold, sex: 'male' });
      const [g2x, g2z] = shore(-1.25, 9);
      api.spawn('giraffe', g2x, g2z, 1, { heading: towards(g2x, g2z, w.x, w.z) + 0.6, state: 'idle', hold });
      const [zx, zz] = shore(1.1, 2.0);
      api.spawn('zebra', zx, zz, 4, { heading: towards(zx, zz, w.x, w.z), state: 'drink', hold, spread: 4 });
      api.spawn('impala', w.x + 8, w.z - 34, 9, { heading: facing(yaw, 1.2), state: 'graze', hold, spread: 8 });
      api.spawn('warthog', w.x + 20, w.z + 20, 3, { state: 'graze', hold, spread: 3 });
      break;
    }
    case 'predators': {
      const f = facing(yaw, 0);
      api.spawn('lion', 0, 0, 1, { heading: f - 0.5, state: 'rest', hold, sex: 'male' });
      api.spawn('lion', 3.2, 2.2, 1, { heading: f + 0.9, state: 'sleep', hold, sex: 'female' });
      api.spawn('lion', -3.4, 1.4, 1, { heading: f - 1.3, state: 'rest', hold, sex: 'female' });
      api.spawn('lion', 1.5, -3.6, 1, { heading: f + 0.2, state: 'idle', hold, sex: 'female' });
      api.spawn('lion', -1.5, 4.5, 1, { heading: f + 2.6, state: 'sleep', hold, sex: 'female' });
      const cd = f + Math.PI / 2 + 0.2;
      api.spawn('cheetah', -9 + Math.sin(cd) * -6, 7 + Math.cos(cd) * -6, 1, { heading: cd, state: 'walk', hold, target: [-9 + Math.sin(cd) * 60, 7 + Math.cos(cd) * 60] });
      api.spawn('zebra', 30, -40, 9, { state: 'graze', hold, spread: 9, heading: f + 1 });
      api.spawn('wildebeest', -35, -30, 10, { state: 'graze', hold, spread: 10 });
      break;
    }
    case 'night': {
      const w = ensureWater(ctx, api, -14, 6, 12);
      aim(P, w.x + 4, w.z + 2);
      const camDir = facing(yaw, 0);
      const out = (ang, d, st, extra = {}) => {
        const x = w.x + Math.cos(ang) * (w.r + d), z = w.z + Math.sin(ang) * (w.r + d);
        api.spawn('hippo', x, z, 1, { heading: towards(w.x, w.z, x, z), state: st, hold, target: [x + Math.sin(camDir + 0.4) * 30, z + Math.cos(camDir + 0.4) * 30], ...extra });
      };
      out(-0.5, 1.5, 'walk'); out(-0.1, 4.5, 'walk'); out(0.35, 2.5, 'idle'); out(-0.85, -3, 'graze'); out(0.9, -4, 'idle'); out(0.05, 9, 'graze');
      api.spawn('zebra', 22, -14, 7, { state: 'sleep', hold, spread: 7 });
      api.spawn('giraffe', -6, -30, 2, { state: 'sleep', hold, spread: 5 });
      api.spawn('lion', 34, 18, 3, { state: 'walk', hold, spread: 5, heading: camDir + 2.5, target: [34 + Math.sin(camDir + 2.5) * 60, 18 + Math.cos(camDir + 2.5) * 60] });
      break;
    }
    default: { // overview
      const f = facing(yaw, 0);
      api.spawn('elephant', -40, 30, 8, { state: 'walk', hold, heading: f + 1.1, target: [-40 + Math.sin(f + 1.1) * 120, 30 + Math.cos(f + 1.1) * 120], spread: 16 });
      api.spawn('zebra', 22, -22, 14, { state: 'graze', hold, spread: 14, heading: f + 0.6 });
      api.spawn('wildebeest', 52, 12, 22, { state: 'walk', hold, spread: 18, heading: f - 1.4, target: [52 + Math.sin(f - 1.4) * 150, 12 + Math.cos(f - 1.4) * 150] });
      api.spawn('giraffe', -70, -40, 6, { state: 'graze', hold, spread: 14 });
      api.spawn('buffalo', 70, 60, 16, { state: 'graze', hold, spread: 16 });
      api.spawn('impala', -20, -70, 18, { state: 'graze', hold, spread: 14 });
      api.spawn('ostrich', 12, 62, 6, { state: 'walk', hold, spread: 10, heading: f + 2, target: [12 + Math.sin(f + 2) * 100, 62 + Math.cos(f + 2) * 100] });
      api.spawn('warthog', -60, 70, 4, { state: 'graze', hold, spread: 5 });
      api.spawn('rhino', 92, -48, 2, { state: 'graze', hold, spread: 6 });
      api.spawn('lion', -92, 24, 4, { state: 'rest', hold, spread: 6 });
      api.spawn('cheetah', 62, -92, 2, { state: 'walk', hold, spread: 4, heading: f + 0.3, target: [62 + Math.sin(f + 0.3) * 100, -92 + Math.cos(f + 0.3) * 100] });
      api.spawn('hippo', -110, -100, 4, { state: 'graze', hold, spread: 8 });
      api.spawn('zebra', -30, 110, 10, { state: 'graze', hold, spread: 12 });
      api.spawn('impala', 120, 100, 12, { state: 'graze', hold, spread: 12 });
      break;
    }
  }
}
