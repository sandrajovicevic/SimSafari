// Junction signposts (fingerpost with arrow boards + solar lamp), km stones. Everything instanced.
import * as THREE from 'three';

const NAMES = ['LODGE', 'MAIN GATE', 'HIDE', 'WATERHOLE', 'CAMP', 'KOPJE'];
const ROWS = NAMES.length;
const BOARD_L = 0.95, BOARD_H = 0.24, BOARD_T = 0.035;
const POST_H = 2.35;
const MAX_LIGHTS = 6;

function arrowBoardGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(0, -BOARD_H / 2);
  shape.lineTo(BOARD_L - 0.13, -BOARD_H / 2);
  shape.lineTo(BOARD_L, 0);
  shape.lineTo(BOARD_L - 0.13, BOARD_H / 2);
  shape.lineTo(0, BOARD_H / 2);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: BOARD_T, bevelEnabled: false, steps: 1 });
  g.translate(0.06, 0, -BOARD_T / 2);
  return g;
}

function signAtlas(textures) {
  return textures.canvas(512, (c, size) => {
    const rowH = size / ROWS;
    for (let r = 0; r < ROWS; r++) {
      const y = size - (r + 1) * rowH; // row 0 at the bottom (uv.y = 0)
      c.fillStyle = '#e3dcc4';
      c.fillRect(0, y, size, rowH);
      // grime / weathering
      for (let i = 0; i < 60; i++) {
        const gx = ((i * 97 + r * 31) % 512), gy = y + ((i * 53 + r * 17) % rowH);
        c.fillStyle = `rgba(90,70,40,${0.04 + ((i * 7) % 10) * 0.012})`;
        c.beginPath(); c.arc(gx, gy, 6 + (i % 5) * 4, 0, Math.PI * 2); c.fill();
      }
      c.fillStyle = 'rgba(60,45,25,0.35)';
      c.fillRect(0, y, size, 3); c.fillRect(0, y + rowH - 3, size, 3);
      c.fillStyle = '#2a2419';
      c.font = `bold ${Math.round(rowH * 0.5)}px Arial, Helvetica, sans-serif`;
      c.textBaseline = 'middle'; c.textAlign = 'left';
      c.fillText(NAMES[r], 26, y + rowH / 2 + 2);
      // small arrow glyph at the tip end
      c.beginPath();
      c.moveTo(size - 92, y + rowH * 0.32); c.lineTo(size - 48, y + rowH * 0.5); c.lineTo(size - 92, y + rowH * 0.68);
      c.lineTo(size - 82, y + rowH * 0.5); c.closePath(); c.fill();
    }
  }, { key: 'roads:signAtlas', srgb: true });
}

export class PropKit {
  constructor(ctx, sets) {
    this.ctx = ctx;
    this.group = new THREE.Group(); this.group.name = 'roads-props';
    const mats = ctx.materials;
    this.atlas = signAtlas(ctx.textures);

    // wood (posts, board bodies)
    this.woodMat = mats.standard({ color: new THREE.Color(0.36, 0.27, 0.18), roughness: 0.9 });
    this.woodMat.normalMap = sets.planks.normalMap; this.woodMat.normalScale.set(0.6, 0.6);
    this.woodMat.roughnessMap = sets.planks.roughnessMap;

    // board: front face textured from the atlas (row per instance), other faces painted wood
    this.boardMat = mats.standard({ color: 0xffffff, roughness: 0.75, map: this.atlas });
    this.boardMat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
attribute float aRow; varying float vRow; varying vec3 vObj; varying float vFront;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
vRow = aRow; vObj = position; vFront = step(0.9, normal.z);`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
varying float vRow; varying vec3 vObj; varying float vFront;`)
        .replace('#include <map_fragment>', `
{
  vec2 auv = vec2(clamp((vObj.x - 0.06) / ${BOARD_L.toFixed(3)}, 0.0, 1.0), (clamp((vObj.y / ${BOARD_H.toFixed(3)}) + 0.5, 0.0, 1.0) + vRow) / ${ROWS.toFixed(1)});
  vec4 texelColor = texture2D(map, auv);
  vec3 painted = vec3(0.62, 0.58, 0.48);
  diffuseColor.rgb *= mix(painted, texelColor.rgb, vFront);
}`);
    };
    this.boardMat.customProgramCacheKey = () => 'roads-board';

    this.lampMat = mats.standard({ color: new THREE.Color(0.12, 0.12, 0.12), roughness: 0.5, metalness: 0.4, emissive: new THREE.Color(1.0, 0.75, 0.45), emissiveIntensity: 0 });
    this.stoneMat = mats.standard({ color: 0xffffff, roughness: 0.85 });
    this.stoneMat.map = sets.concrete.map; this.stoneMat.normalMap = sets.concrete.normalMap;
    this.stoneMat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying float vObjY;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjY = position.y;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vObjY;')
        .replace('#include <map_fragment>', `#include <map_fragment>
diffuseColor.rgb = mix(diffuseColor.rgb * vec3(1.55, 1.5, 1.4), vec3(0.05), smoothstep(0.24, 0.26, vObjY));`);
    };
    this.stoneMat.customProgramCacheKey = () => 'roads-stone';

    this.postGeo = new THREE.CylinderGeometry(0.06, 0.075, POST_H, 10);
    this.postGeo.translate(0, POST_H / 2, 0);
    this.boardGeo = arrowBoardGeometry();
    this.lampGeo = new THREE.BoxGeometry(0.24, 0.1, 0.24);
    // km stone: box + rounded cap
    const body = new THREE.BoxGeometry(0.3, 0.3, 0.14); body.translate(0, 0.15, 0);
    const cap = new THREE.CylinderGeometry(0.15, 0.15, 0.14, 12, 1, false, 0, Math.PI);
    cap.rotateY(Math.PI / 2); cap.rotateX(Math.PI / 2); cap.translate(0, 0.3, 0);
    this.stoneGeo = mergeSimple([body, cap]);

    this.lights = [];
    for (let i = 0; i < MAX_LIGHTS; i++) {
      const l = new THREE.PointLight(0xffc07a, 0, 16, 2);
      l.visible = false;
      this.group.add(l);
      this.lights.push(l);
    }
    this.meshes = [];
    this.night = 0;
  }

  /** Place signposts at junctions and km stones along edges. */
  place(junctions, edges, world, rng) {
    this.clearMeshes();
    const H = (x, z) => world.getHeight(x, z);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), scl = new THREE.Vector3(1, 1, 1);
    // ---- signposts ----
    const posts = [], boards = [], rows = [];
    let li = 0;
    for (const j of junctions) {
      if (!j.wedgeDir) continue;
      const dist = j.W / Math.sin(Math.min(j.wedgeDir.gap * 0.5, Math.PI / 2)) + 2.6 + rng.float() * 0.6;
      const px = j.x + j.wedgeDir.x * dist, pz = j.z + j.wedgeDir.z * dist;
      const py = H(px, pz);
      if (world.isWater(px, pz)) continue;
      const yaw0 = rng.float() * 0.2 - 0.1;
      posts.push({ x: px, y: py, z: pz, yaw: yaw0 });
      // one board per direction, highest first; names cycle deterministically
      const dirs = j.dirs.slice().sort((a, b) => Math.atan2(a.z, a.x) - Math.atan2(b.z, b.x));
      let bi = 0;
      for (const d of dirs) {
        if (bi >= 3) break;
        const yaw = Math.atan2(-d.z, d.x);
        boards.push({ x: px, y: py + 2.05 - bi * 0.3, z: pz, yaw, row: (rng.int(0, ROWS - 1)) });
        bi++;
      }
      if (li < MAX_LIGHTS) {
        const l = this.lights[li++];
        l.position.set(px, py + POST_H + 0.02, pz);
        l.visible = true; l.userData.active = true;
      }
    }
    for (let k = li; k < MAX_LIGHTS; k++) { this.lights[k].visible = false; this.lights[k].userData.active = false; }

    if (posts.length) {
      const pm = new THREE.InstancedMesh(this.postGeo, this.woodMat, posts.length);
      const lm = new THREE.InstancedMesh(this.lampGeo, this.lampMat, posts.length);
      posts.forEach((p, i) => {
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.yaw);
        m4.compose(pos.set(p.x, p.y - 0.05, p.z), q, scl); pm.setMatrixAt(i, m4);
        m4.compose(pos.set(p.x, p.y + POST_H + 0.06, p.z), q, scl); lm.setMatrixAt(i, m4);
      });
      pm.castShadow = true; pm.receiveShadow = true; lm.castShadow = true;
      pm.name = 'sign-posts'; lm.name = 'sign-lamps';
      this.group.add(pm, lm); this.meshes.push(pm, lm);
    }
    if (boards.length) {
      const geo = this.boardGeo.clone();
      const rowAttr = new THREE.InstancedBufferAttribute(new Float32Array(boards.length), 1);
      const bm = new THREE.InstancedMesh(geo, this.boardMat, boards.length);
      boards.forEach((b, i) => {
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), b.yaw);
        m4.compose(pos.set(b.x, b.y, b.z), q, scl); bm.setMatrixAt(i, m4);
        rowAttr.setX(i, b.row);
      });
      geo.setAttribute('aRow', rowAttr);
      bm.castShadow = true; bm.receiveShadow = true; bm.name = 'sign-boards';
      this.group.add(bm); this.meshes.push(bm);
      this.boardGeoInst = geo;
    }
    // ---- km stones along gravel/paved edges, left side, every 200 m (first at 100 m) ----
    const stones = [];
    const tmp = { position: new THREE.Vector3(), tangent: new THREE.Vector3() };
    for (const e of edges) {
      if (e.kind === 'dirt') continue;
      for (let s = 100; s < e.length - 20; s += 200) {
        // sample polyline
        let i = 0; while (i < e.cum.length - 2 && e.cum[i + 1] < s) i++;
        const l = e.cum[i + 1] - e.cum[i], t = l > 1e-9 ? (s - e.cum[i]) / l : 0;
        const x = e.points[i * 2] + (e.points[i * 2 + 2] - e.points[i * 2]) * t, z = e.points[i * 2 + 1] + (e.points[i * 2 + 3] - e.points[i * 2 + 1]) * t;
        const dx = e.points[i * 2 + 2] - e.points[i * 2], dz = e.points[i * 2 + 3] - e.points[i * 2 + 1], L = Math.hypot(dx, dz) || 1;
        const lx = dz / L, lz = -dx / L; // left of travel
        const off = e.width * 0.5 + 2.3;
        const sx = x + lx * off, sz = z + lz * off;
        if (world.isWater(sx, sz)) continue;
        stones.push({ x: sx, y: H(sx, sz), z: sz, yaw: Math.atan2(lx, lz) });
      }
    }
    if (stones.length) {
      const sm = new THREE.InstancedMesh(this.stoneGeo, this.stoneMat, stones.length);
      stones.forEach((s, i) => {
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.yaw);
        m4.compose(pos.set(s.x, s.y - 0.03, s.z), q, scl); sm.setMatrixAt(i, m4);
      });
      sm.castShadow = true; sm.receiveShadow = true; sm.name = 'km-stones';
      this.group.add(sm); this.meshes.push(sm);
    }
    void tmp;
    return { posts: posts.length, boards: boards.length, stones: stones.length };
  }

  setNight(n) {
    if (n === this.night) return;
    this.night = n;
    this.lampMat.emissiveIntensity = 2.5 * n;
    for (const l of this.lights) if (l.userData.active) l.intensity = 18 * n;
  }

  clearMeshes() {
    for (const m of this.meshes) { m.removeFromParent(); m.dispose?.(); }
    this.meshes.length = 0;
    if (this.boardGeoInst) { this.boardGeoInst.dispose(); this.boardGeoInst = null; }
  }

  dispose() {
    this.clearMeshes();
    for (const g of [this.postGeo, this.boardGeo, this.lampGeo, this.stoneGeo]) g.dispose();
    for (const m of [this.woodMat, this.boardMat, this.lampMat, this.stoneMat]) { this.ctx.materials.untrack(m); m.dispose(); }
    this.group.removeFromParent();
  }
}

/** Merge non-indexed copies of simple geometries (position/normal/uv). */
function mergeSimple(geos) {
  const pos = [], nrm = [], uv = [];
  for (const g of geos) {
    const ng = g.index ? g.toNonIndexed() : g;
    pos.push(...ng.attributes.position.array);
    nrm.push(...ng.attributes.normal.array);
    uv.push(...ng.attributes.uv.array);
    if (ng !== g) ng.dispose();
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return out;
}
