// Showcase presets + a neutral PBR test scene so the lighting is judged on its own.
import * as THREE from 'three';

export const presets = {
  overview: { camera: { target: [0, 0], distance: 260, pitch: 32, yaw: 35 }, tod: 14, weather: 'clear', description: 'Early afternoon, clear sky with fair-weather cumulus; hard overhead light, short shadows' },
  dawn:     { camera: { target: [-10, 0], distance: 110, pitch: 9, yaw: 275 }, tod: 6.3, weather: { cloud: 0.3, rain: 0, haze: 0.55 }, description: 'Sunrise: hazy orange sun on the eastern horizon, long cool shadows, dust haze' },
  golden:   { camera: { target: [0, 0], distance: 120, pitch: 14, yaw: 40 }, tod: 17.6, weather: { cloud: 0.25, rain: 0, haze: 0.45 }, description: 'Golden hour: warm low sun from the west, long shadows, lit cumulus' },
  dusk:     { camera: { target: [0, 0], distance: 150, pitch: 8, yaw: 75 }, tod: 18.7, weather: { cloud: 0.3, rain: 0, haze: 0.4 }, description: 'Civil twilight: sun just set, orange→blue gradient, afterglow on high clouds, first stars' },
  night:    { camera: { target: [0, 0], distance: 130, pitch: 16, yaw: 190 }, tod: 22, weather: { cloud: 0.08, rain: 0, haze: 0.2 }, description: 'Moonlit night: blue-grey moonlight with soft shadows, star field and Milky Way' },
  overcast: { camera: { target: [0, 0], distance: 180, pitch: 24, yaw: 35 }, tod: 13, weather: 'overcast', description: 'Overcast midday: flat grey diffuse light, no hard shadows, low contrast' },
  storm:    { camera: { target: [0, 0], distance: 80, pitch: 12, yaw: 20 }, tod: 15, weather: 'storm', description: 'Rain storm: dark cloud deck, rain streaks driven by wind, heavy haze' },
  close:    { camera: { target: [0, 0], distance: 170, pitch: 10, yaw: 60 }, tod: 16, weather: 'clear', description: 'Low angle 30 m above ground looking at the horizon: shadows sharp near, present far' },
};

let stageGroup = null;
let stageCtx = null;

export function disposeStage() {
  if (!stageGroup) return;
  stageGroup.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) { stageCtx?.materials.untrack(o.material); o.material.dispose(); }
  });
  stageGroup.removeFromParent();
  stageGroup = null;
}

export async function stage(ctx, presetName) {
  disposeStage();
  stageCtx = ctx;
  const p = presets[presetName] || presets.overview;
  const env = ctx.modules.get('environment');
  if (env) {
    if (typeof p.weather === 'string') env.setWeatherPreset(p.weather, { immediate: true });
    else env.setWeather(p.weather, { immediate: true });
    env.setWeather({ wind: { x: 1, z: 0.35, speed: presetName === 'storm' ? 14 : 3 } }, { immediate: true });
  }

  stageGroup = new THREE.Group(); stageGroup.name = 'environment-showcase';
  ctx.scene.add(stageGroup);
  const M = ctx.materials, T = ctx.textures;
  const y0 = (x, z) => ctx.world.getHeight(x, z);

  // subtle procedural surface so boxes are not flat colour
  const pbr = T.pbr({
    key: 'env:test', size: 512, normalStrength: 0.03, seed: 2,
    height: 'float height(vec2 uv){ return tfbm(uv, 6.0, 5, uSeed) * 0.5 + 0.5; }',
    albedo: 'vec3 albedo(vec2 uv, float h){ return vec3(0.62 + 0.12 * (h - 0.5)); }',
    roughness: 'float rough(vec2 uv, float h){ return 0.6 + 0.25 * h; }',
  });
  const addMesh = (geo, mat, x, y, z, name) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y0(x, z) + y, z);
    m.castShadow = true; m.receiveShadow = true; m.name = name;
    stageGroup.add(m);
    return m;
  };

  // spheres: roughness ramp + one metal
  const sphereGeo = new THREE.SphereGeometry(2.5, 48, 32);
  const roughs = [0.08, 0.32, 0.58, 0.85];
  roughs.forEach((r, i) => {
    const mat = M.standard({ color: 0xbfbfbf, roughness: r, metalness: 0 });
    addMesh(sphereGeo, mat, -18 + i * 9, 2.5, 6, `sphere-r${r}`);
  });
  addMesh(sphereGeo, M.standard({ color: 0xd8b060, roughness: 0.25, metalness: 1 }), 18, 2.5, 6, 'sphere-metal');

  // boxes: white / 18 % grey / near-black albedo
  const boxGeo = new THREE.BoxGeometry(4, 4, 4);
  const boxes = [[0xf0f0f0, 'box-white'], [0x767676, 'box-grey'], [0x2a2a2a, 'box-dark']];
  boxes.forEach(([c, name], i) => {
    const mat = M.standard({ color: c, roughness: 0.75 });
    M.applyPbr(mat, pbr); mat.map.repeat.set(1, 1); mat.color.set(c);
    addMesh(boxGeo, mat, -8 + i * 8, 2, -8, name);
  });

  // a long low wall for shadow contact and length
  const wallMat = M.standard({ color: 0xc9b89a, roughness: 0.85 });
  M.applyPbr(wallMat, pbr); wallMat.color.set(0xc9b89a);
  addMesh(new THREE.BoxGeometry(34, 2.2, 0.6), wallMat, 0, 1.1, -20, 'wall');

  // distance markers: pillars along -X and -Z at 40 .. 450 m (instanced) to show cascade reach
  const dists = [40, 90, 160, 260, 450];
  const pillarGeo = new THREE.BoxGeometry(1.6, 11, 1.6);
  const pillarMat = M.standard({ color: 0xd9d2c4, roughness: 0.7 });
  const pillars = new THREE.InstancedMesh(pillarGeo, pillarMat, dists.length * 2);
  const mtx = new THREE.Matrix4();
  dists.forEach((d, i) => {
    mtx.makeTranslation(-d, y0(-d, 0) + 5.5, 0); pillars.setMatrixAt(i * 2, mtx);
    mtx.makeTranslation(0, y0(0, -d) + 5.5, -d); pillars.setMatrixAt(i * 2 + 1, mtx);
  });
  pillars.instanceMatrix.needsUpdate = true;
  pillars.castShadow = true; pillars.receiveShadow = true; pillars.name = 'pillars';
  stageGroup.add(pillars);
}
