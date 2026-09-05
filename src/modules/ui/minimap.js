// Minimap: 200×200 canvas of terrain (biome + hillshade + water), zones, roads, buildings, animals, vehicles and the camera footprint.
// Click to jump the camera. Terrain/zone layers are cached and only redrawn when world.terrain.version / grid.version change.
import * as THREE from 'three';
import { el, setText } from './dom.js';
import { icon } from './icons.js';

const BIOME_RGB = [
  [110, 142, 62],   // grass
  [176, 158, 90],   // dry grass
  [150, 120, 78],   // dirt
  [122, 118, 110],  // rock
  [206, 188, 132],  // sand
  [88, 134, 84],    // wetland
  [164, 146, 100],  // riverbed
  [178, 158, 124],  // road dust
];
const ZONE_RGBA = { 1: [98, 207, 126, 0.22], 2: [93, 179, 240, 0.25], 3: [240, 177, 60, 0.28], 4: [240, 106, 90, 0.18] };
const N = 200;      // logical pixels
const SCALE = 2;    // canvas backing scale for crispness

const _v = new THREE.Vector3(), _ray = new THREE.Ray(), _hit = new THREE.Vector3();
const _corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

export function createMinimap(root, s) {
  const world = s.world;
  const canvas = el('canvas', { width: N * SCALE, height: N * SCALE, 'data-tip': 'Click to move the camera there', 'data-tip-pos': 'above' });
  const coord = el('span.coord', { text: '' });
  const node = el('div.minimap.panel.pe', null,
    el('div.mm-h', null, el('span', { style: 'display:inline-flex;align-items:center;gap:5px' }, icon('map'), 'Park map'), coord),
    canvas, el('span.n', { text: 'N' }));
  root.appendChild(node);

  const g = canvas.getContext('2d');
  const terrainLayer = document.createElement('canvas'); terrainLayer.width = N; terrainLayer.height = N;
  const zoneLayer = document.createElement('canvas'); zoneLayer.width = N; zoneLayer.height = N;
  let terrainVersion = -1, zoneVersion = -1, acc = 1, terrainFlat = true;
  let preview = null; // terrain-shaped object drawn instead of world.terrain while the real one is flat (showcase only)
  const footprint = new Float32Array(8);
  const terrainSource = () => (preview && world.terrain.maxHeight === world.terrain.minHeight ? preview : world.terrain);

  // world → map px
  const toMap = (x, z) => [((x + world.half) / world.size) * N, ((z + world.half) / world.size) * N];

  function drawTerrain() {
    const t = terrainSource(), res = t.res, h = t.heights, b = t.biome;
    const img = terrainLayer.getContext('2d').createImageData(N, N);
    const d = img.data;
    const range = Math.max(1e-3, t.maxHeight - t.minHeight);
    terrainFlat = range < 0.5;
    const step = (res - 1) / N;
    const cell = t.cell;
    for (let py = 0; py < N; py++) {
      const iz = Math.min(res - 1, Math.round(py * step));
      for (let px = 0; px < N; px++) {
        const ix = Math.min(res - 1, Math.round(px * step));
        const i = iz * res + ix;
        const H = h[i];
        let r, gg, bb;
        if (H < t.waterLevel) {
          const depth = Math.min(1, (t.waterLevel - H) / 12);
          r = 70 - depth * 30; gg = 140 - depth * 50; bb = 200 - depth * 40;
        } else {
          const c = BIOME_RGB[b[i]] || BIOME_RGB[0];
          // hillshade from central differences (light from the north-west)
          const hl = h[iz * res + Math.max(0, ix - 2)], hr = h[iz * res + Math.min(res - 1, ix + 2)];
          const hu = h[Math.max(0, iz - 2) * res + ix], hd = h[Math.min(res - 1, iz + 2) * res + ix];
          const nx = (hl - hr) / (4 * cell), nz = (hu - hd) / (4 * cell);
          const shade = terrainFlat ? 1 : Math.max(0.55, Math.min(1.35, 1 + (nx * -0.7 + nz * -0.7) * 2.2));
          const alt = terrainFlat ? 1 : 0.92 + ((H - t.minHeight) / range) * 0.18;
          r = c[0] * shade * alt; gg = c[1] * shade * alt; bb = c[2] * shade * alt;
        }
        const o = (py * N + px) * 4;
        d[o] = r; d[o + 1] = gg; d[o + 2] = bb; d[o + 3] = 255;
      }
    }
    terrainLayer.getContext('2d').putImageData(img, 0, 0);
    terrainVersion = t.version;
  }

  function drawZones() {
    const gr = world.grid, res = gr.res;
    const zc = zoneLayer.getContext('2d');
    zc.clearRect(0, 0, N, N);
    const img = zc.createImageData(N, N), d = img.data;
    const step = res / N;
    let any = false;
    for (let py = 0; py < N; py++) {
      const iz = Math.min(res - 1, Math.floor(py * step));
      for (let px = 0; px < N; px++) {
        const ix = Math.min(res - 1, Math.floor(px * step));
        const z = gr.zone[iz * res + ix];
        const c = ZONE_RGBA[z];
        if (!c) continue;
        any = true;
        const o = (py * N + px) * 4;
        d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = Math.round(c[3] * 255);
      }
    }
    if (any) zc.putImageData(img, 0, 0);
    // habitat outlines: mark cells whose neighbour has a different habitat id
    if (any) {
      zc.strokeStyle = 'rgba(255,255,255,0.35)'; zc.lineWidth = 1;
      const hid = gr.habitatId;
      zc.beginPath();
      for (let py = 1; py < N; py++) {
        const iz = Math.min(res - 1, Math.floor(py * step)), izp = Math.min(res - 1, Math.floor((py - 1) * step));
        for (let px = 1; px < N; px++) {
          const ix = Math.min(res - 1, Math.floor(px * step)), ixp = Math.min(res - 1, Math.floor((px - 1) * step));
          const a = hid[iz * res + ix];
          if (a !== hid[iz * res + ixp]) { zc.moveTo(px + 0.5, py); zc.lineTo(px + 0.5, py + 1); }
          if (a !== hid[izp * res + ix]) { zc.moveTo(px, py + 0.5); zc.lineTo(px + 1, py + 0.5); }
        }
      }
      zc.stroke();
    }
    zoneVersion = gr.version;
  }

  function computeFootprint() {
    const cam = s.ctx.camera, rig = s.ctx.rig;
    for (let i = 0; i < 4; i++) {
      const [nx, ny] = _corners[i];
      _v.set(nx, ny, 0.5).unproject(cam);
      _ray.origin.copy(cam.position);
      _ray.direction.copy(_v).sub(cam.position).normalize();
      let ok = false;
      try { ok = world.raycastGround(_ray, _hit, rig.distance * 6); } catch { ok = false; }
      if (!ok) {
        // ray misses the ground (looking at the sky): take a far point along the ray, flattened to the map
        const d = _ray.direction, far = rig.distance * 4;
        _hit.set(_ray.origin.x + d.x * far, 0, _ray.origin.z + d.z * far);
      }
      const lim = world.half * 1.6;
      footprint[i * 2] = Math.max(-lim, Math.min(lim, _hit.x));
      footprint[i * 2 + 1] = Math.max(-lim, Math.min(lim, _hit.z));
    }
  }

  function draw() {
    if (terrainSource().version !== terrainVersion) drawTerrain();
    if (world.grid.version !== zoneVersion) drawZones();
    g.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    g.imageSmoothingEnabled = false;
    g.drawImage(terrainLayer, 0, 0);
    g.drawImage(zoneLayer, 0, 0);
    g.imageSmoothingEnabled = true;
    if (terrainFlat) {
      g.strokeStyle = 'rgba(255,255,255,0.07)'; g.lineWidth = 1;
      g.beginPath();
      for (let k = 1; k < 8; k++) { const p = (k / 8) * N + 0.5; g.moveTo(p, 0); g.lineTo(p, N); g.moveTo(0, p); g.lineTo(N, p); }
      g.stroke();
    }
    // roads
    for (const e of world.roads.edges.values()) {
      const p = e.points; if (!p || p.length < 4) continue;
      g.strokeStyle = e.kind === 'paved' ? '#f2f0e6' : e.kind === 'gravel' ? '#d9d1bd' : '#c9a86b';
      g.lineWidth = e.kind === 'paved' ? 2.2 : e.kind === 'gravel' ? 1.8 : 1.4;
      g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath();
      for (let i = 0; i < p.length; i += 2) { const [mx, my] = toMap(p[i], p[i + 1]); if (i === 0) g.moveTo(mx, my); else g.lineTo(mx, my); }
      g.stroke();
    }
    // buildings
    for (const b of world.buildings.values()) {
      const [mx, my] = toMap(b.x, b.z);
      const sz = Math.max(3, Math.min(7, ((b.w || 10) / world.size) * N * 2));
      g.fillStyle = '#ffd47a'; g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 1;
      g.fillRect(mx - sz / 2, my - sz / 2, sz, sz); g.strokeRect(mx - sz / 2, my - sz / 2, sz, sz);
    }
    // vehicles
    g.fillStyle = '#5db3f0';
    for (const v of world.vehicles.values()) { const [mx, my] = toMap(v.x, v.z); g.fillRect(mx - 1.5, my - 1.5, 3, 3); }
    // animals
    for (const a of world.animals.values()) {
      const [mx, my] = toMap(a.x, a.z);
      g.fillStyle = a.species === 'lion' || a.species === 'cheetah' || a.species === 'hyena' || a.diet === 'predator' ? '#f06a5a' : '#ffffff';
      g.beginPath(); g.arc(mx, my, 1.4, 0, Math.PI * 2); g.fill();
    }
    // selection
    const sel = world.selection;
    if (sel && sel.kind === 'animal' && world.animals.get(sel.id)) {
      const a = world.animals.get(sel.id); const [mx, my] = toMap(a.x, a.z);
      g.strokeStyle = '#f0b13c'; g.lineWidth = 1.5; g.beginPath(); g.arc(mx, my, 4.5, 0, Math.PI * 2); g.stroke();
    }
    // camera footprint
    computeFootprint();
    g.beginPath();
    for (let i = 0; i < 4; i++) { const [mx, my] = toMap(footprint[i * 2], footprint[i * 2 + 1]); if (i === 0) g.moveTo(mx, my); else g.lineTo(mx, my); }
    g.closePath();
    g.fillStyle = 'rgba(255,255,255,0.09)'; g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 1.2; g.stroke();
    const t = s.ctx.rig.target; const [tx, ty] = toMap(t.x, t.z);
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(tx, ty, 2, 0, Math.PI * 2); g.fill();
    // border vignette
    g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 2; g.strokeRect(1, 1, N - 2, N - 2);
  }

  function mapToWorld(e) {
    const r = canvas.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * N, py = ((e.clientY - r.top) / r.height) * N;
    return { x: (px / N) * world.size - world.half, z: (py / N) * world.size - world.half };
  }
  canvas.addEventListener('click', (e) => {
    const p = mapToWorld(e);
    try { s.ctx.rig.lookAt(p.x, p.z); } catch {}
    acc = 1;
  });
  canvas.addEventListener('mousemove', (e) => { const p = mapToWorld(e); setText(coord, Math.round(p.x) + ', ' + Math.round(p.z)); });
  canvas.addEventListener('mouseleave', () => setText(coord, ''));

  function update(dt) {
    acc += dt;
    if (acc < 0.12) return; // ~8 Hz is plenty for a minimap
    acc = 0;
    draw();
  }

  return {
    el: node, update,
    redraw: () => { acc = 1; terrainVersion = -1; zoneVersion = -1; },
    /** Showcase only: draw this terrain-like object while world.terrain is still flat. */
    setPreview(t) { preview = t || null; terrainVersion = -1; acc = 1; },
    dispose() { node.remove(); },
  };
}
