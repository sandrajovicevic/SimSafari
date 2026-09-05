// Procedural vehicle geometry. Every kind is built as loose box/cylinder primitives, tagged with a
// per-vertex colour (white for chrome/glass, a roof-to-rocker "dust gradient" for paint — TRUE linear,
// see CLAUDE.md), then merged into ONE indexed BufferGeometry with three material groups
// [0]=paint [1]=chrome [2]=glass so a whole vehicle kind renders in 3 draw calls total (shared by every
// instance of that kind via InstancedMesh, not 3 draw calls PER vehicle).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const HALF_PI = Math.PI / 2;

function box(w, h, d, cx, cy, cz, rotY = 0) {
  const g = new THREE.BoxGeometry(Math.max(0.01, w), Math.max(0.01, h), Math.max(0.01, d));
  if (rotY) g.rotateY(rotY);
  g.translate(cx, cy, cz);
  return g;
}
function cyl(r, h, cx, cy, cz, { rotX = 0, rotZ = 0, rt = null, seg = 10 } = {}) {
  const g = new THREE.CylinderGeometry(rt === null ? r : rt, r, Math.max(0.01, h), seg);
  if (rotX) g.rotateX(rotX);
  if (rotZ) g.rotateZ(rotZ);
  g.translate(cx, cy, cz);
  return g;
}

/** Per-vertex colour: paint fades toward a dusty grey near the ground (rocker panels, wheel arches). */
function tagDust(geo, roofY) {
  const pos = geo.attributes.position, n = pos.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const y = pos.getY(i);
    const t = THREE.MathUtils.clamp(1 - y / Math.max(0.6, roofY * 0.85), 0, 1);
    const shade = 1 - 0.42 * t * t; // clean at roof, dusty near the ground
    arr[i * 3] = shade; arr[i * 3 + 1] = shade; arr[i * 3 + 2] = shade;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}
function tagFlat(geo, v = 1) {
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3).fill(v);
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

function mergeBucket(pieces) { return pieces.length ? mergeGeometries(pieces, false) : null; }

/** pieces: { paint:[geo,...], chrome:[geo,...], glass:[geo,...] } → one geometry, 3 groups. */
function assemble(buckets, roofY) {
  const p = buckets.paint.map((g) => tagDust(g, roofY));
  const c = buckets.chrome.map((g) => tagFlat(g, 1));
  const gl = buckets.glass.map((g) => tagFlat(g, 1));
  const order = [];
  const pM = mergeBucket(p); if (pM) order.push(pM);
  const cM = mergeBucket(c); if (cM) order.push(cM);
  const glM = mergeBucket(gl); if (glM) order.push(glM);
  const geo = order.length > 1 ? mergeGeometries(order, true) : order[0];
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  return geo;
}

/** Mirrors: two small chrome boxes on thin arms either side of the cab. */
function addMirrors(paint, chrome, cabFrontZ, halfW, cabRoofY) {
  for (const side of [-1, 1]) {
    const ax = side * (halfW + 0.06);
    paint.push(box(0.04, 0.04, 0.35, ax, cabRoofY - 0.28, cabFrontZ - 0.15));
    chrome.push(box(0.22, 0.16, 0.05, side * (halfW + 0.24), cabRoofY - 0.22, cabFrontZ - 0.2));
  }
}

function buildSafari(d) {
  const paint = [], chrome = [], glass = [];
  const halfW = d.width / 2, halfL = d.length / 2;
  const floorY = d.clearance + 0.06;
  const cabFrontZ = halfL - 0.15;
  const cabRoofY = floorY + 1.28;
  const deckStartZ = cabFrontZ - d.cabLength;

  // chassis rail
  paint.push(box(d.width * 0.86, 0.16, d.length * 0.92, 0, d.clearance * 0.5, 0));
  // cab: hood, cabin, floor
  paint.push(box(d.width * 0.98, 0.22, 0.9, 0, floorY + 0.7, cabFrontZ - 0.45)); // hood
  paint.push(box(d.width * 0.94, 0.9, 0.65, 0, floorY + 0.65, cabFrontZ - 1.05)); // cabin box
  paint.push(box(d.width * 0.94, 0.08, d.cabLength, 0, floorY, cabFrontZ - d.cabLength / 2)); // cab floor
  // windscreen (raked) + side cab windows
  const wind = box(d.width * 0.86, 0.6, 0.05, 0, floorY + 1.05, cabFrontZ - 0.75);
  wind.rotateX(-0.18);
  glass.push(wind);
  for (const side of [-1, 1]) glass.push(box(0.04, 0.42, 0.55, side * (halfW - 0.02), floorY + 0.75, cabFrontZ - 1.05));
  // grille + bumper (chrome)
  chrome.push(box(d.width * 0.7, 0.28, 0.06, 0, floorY + 0.45, cabFrontZ + 0.05));
  chrome.push(box(d.width * 0.9, 0.16, 0.14, 0, d.wheelR * 0.7, halfL - 0.03));
  chrome.push(box(d.width * 0.9, 0.14, 0.14, 0, d.wheelR * 0.7, -halfL + 0.03));
  addMirrors(paint, chrome, cabFrontZ, halfW, cabRoofY);

  // open rear deck: floor, low side rails, corner posts + canopy posts, spare-wheel backplate
  const deckLen = deckStartZ - (-halfL + 0.2);
  const deckMidZ = (deckStartZ + (-halfL + 0.2)) / 2;
  paint.push(box(d.width * 0.94, 0.08, deckLen, 0, floorY, deckMidZ));
  for (const side of [-1, 1]) {
    paint.push(box(0.06, 0.34, deckLen, side * (halfW - 0.03), floorY + 0.17, deckMidZ));
  }
  paint.push(box(d.width * 0.9, 0.3, 0.06, 0, floorY + 0.17, -halfL + 0.2)); // tailgate

  // 3 tiered bench rows, rising toward the back like a real safari-truck grandstand
  const rows = 3, seatsPerRow = [2, 3, 3];
  const rowZ = [deckStartZ - 0.5, deckMidZ, -halfL + 0.75];
  const rowY = [floorY + 0.5, floorY + 0.72, floorY + 0.95];
  const seatMounts = [];
  for (let r = 0; r < rows; r++) {
    const bw = d.width * 0.86, by = rowY[r], bz = rowZ[r];
    paint.push(box(bw, 0.08, 0.42, 0, by, bz)); // seat pan
    paint.push(box(bw, 0.34, 0.06, 0, by + 0.2, bz - 0.24)); // backrest
    // simple step/riser under the bench so tiers read as a grandstand
    paint.push(box(bw, by - floorY - 0.04, 0.4, 0, floorY + (by - floorY) / 2, bz));
    const n = seatsPerRow[r];
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * (bw / n) * 0.92;
      seatMounts.push({ x, y: by + 0.05, z: bz + 0.02, yaw: 0 });
    }
  }
  // canopy over the deck on 4 corner posts + roof rack — tall enough to clear the tiered rear row's
  // seated head height (rowY[2] + seat rise + head height), not just the cab roofline.
  const canopyY = floorY + 1.95;
  const postZs = [deckStartZ - 0.15, -halfL + 0.35];
  for (const pz of postZs) for (const side of [-1, 1]) {
    paint.push(cyl(0.03, canopyY - floorY, side * (halfW - 0.08), (canopyY + floorY) / 2, pz, { seg: 6 }));
  }
  paint.push(box(d.width * 0.98, 0.06, deckLen + 0.5, 0, canopyY, deckMidZ - 0.1));
  if (d.hasRoofRack) {
    const rackY = canopyY + 0.14;
    for (const side of [-1, 1]) chrome.push(box(0.035, 0.1, deckLen + 0.3, side * (halfW - 0.14), rackY, deckMidZ - 0.1));
    for (let i = -2; i <= 2; i++) chrome.push(box(d.width * 0.9, 0.03, 0.03, 0, rackY, deckMidZ - 0.1 + i * (deckLen / 5)));
  }
  // spare wheel backplate (the wheel itself is a shared instanced part, non-spinning)
  paint.push(box(0.08, 0.7, 0.7, 0, floorY + 0.5, -halfL - 0.03));

  const geometry = assemble({ paint, chrome, glass }, canopyY);
  const wheelMounts = [
    { x: -d.track / 2, y: d.wheelR, z: d.wheelbase / 2 }, { x: d.track / 2, y: d.wheelR, z: d.wheelbase / 2 },
    { x: -d.track / 2, y: d.wheelR, z: -d.wheelbase / 2 }, { x: d.track / 2, y: d.wheelR, z: -d.wheelbase / 2 },
  ];
  if (d.hasSpare) wheelMounts.push({ x: 0, y: floorY + 0.5, z: -halfL - 0.1, spare: true });
  return {
    geometry,
    wheelR: d.wheelR, wheelW: d.wheelW,
    wheelMounts,
    headlightMounts: [{ x: -halfW * 0.68, y: floorY + 0.45, z: halfL - 0.02 }, { x: halfW * 0.68, y: floorY + 0.45, z: halfL - 0.02 }],
    taillightMounts: [{ x: -halfW * 0.7, y: d.wheelR * 0.7, z: -halfL + 0.02 }, { x: halfW * 0.7, y: d.wheelR * 0.7, z: -halfL + 0.02 }],
    driverMount: { x: -halfW * 0.42, y: floorY + 0.42, z: cabFrontZ - 1.15, yaw: 0 },
    seatMounts,
    dims: { ...d, roofY: canopyY },
  };
}

function buildRanger(d) {
  const paint = [], chrome = [], glass = [];
  const halfW = d.width / 2, halfL = d.length / 2;
  const floorY = d.clearance + 0.05;
  const cabFrontZ = halfL - 0.1;
  const cabRoofY = floorY + 1.22;
  const cabRearZ = cabFrontZ - d.cabLength;

  paint.push(box(d.width * 0.86, 0.14, d.length * 0.92, 0, d.clearance * 0.5, 0));
  paint.push(box(d.width * 0.98, 0.2, 0.75, 0, floorY + 0.62, cabFrontZ - 0.4)); // bonnet
  paint.push(box(d.width * 0.94, 0.92, d.cabLength - 0.1, 0, floorY + 0.65, cabFrontZ - d.cabLength / 2)); // cab
  const wind = box(d.width * 0.84, 0.5, 0.05, 0, floorY + 1.05, cabFrontZ - 0.72); wind.rotateX(-0.16);
  glass.push(wind);
  for (const side of [-1, 1]) glass.push(box(0.04, 0.4, d.cabLength * 0.55, side * (halfW - 0.02), floorY + 0.72, cabFrontZ - d.cabLength / 2 + 0.1));
  const rear = box(d.width * 0.82, 0.42, 0.05, 0, floorY + 0.8, cabRearZ + 0.03); rear.rotateX(0.08);
  glass.push(rear);
  addMirrors(paint, chrome, cabFrontZ, halfW, cabRoofY);
  if (d.bullbar) {
    chrome.push(box(d.width * 0.94, 0.5, 0.06, 0, d.wheelR * 0.85, halfL - 0.02));
    for (const side of [-0.6, 0.6]) chrome.push(cyl(0.03, 0.5, side * halfW * 0.9, d.wheelR * 0.85, halfL - 0.02, { seg: 6 }));
  } else {
    chrome.push(box(d.width * 0.9, 0.16, 0.12, 0, d.wheelR * 0.7, halfL - 0.02));
  }
  chrome.push(box(d.width * 0.7, 0.24, 0.05, 0, floorY + 0.44, cabFrontZ + 0.05));
  chrome.push(box(d.width * 0.86, 0.12, 0.1, 0, d.wheelR * 0.65, -halfL + 0.02));

  // open load bed
  const bedLen = cabRearZ - (-halfL + 0.15);
  const bedMidZ = (cabRearZ + (-halfL + 0.15)) / 2;
  paint.push(box(d.width * 0.9, 0.08, bedLen, 0, floorY, bedMidZ));
  for (const side of [-1, 1]) paint.push(box(0.06, 0.42, bedLen, side * (halfW - 0.03), floorY + 0.22, bedMidZ));
  paint.push(box(d.width * 0.86, 0.4, 0.06, 0, floorY + 0.2, -halfL + 0.15));
  // roof-mounted amber light bar
  chrome.push(box(0.6, 0.08, 0.1, 0, cabRoofY + 0.05, cabFrontZ - d.cabLength + 0.2));

  const geometry = assemble({ paint, chrome, glass }, cabRoofY);
  return {
    geometry, wheelR: d.wheelR, wheelW: d.wheelW,
    wheelMounts: [
      { x: -d.track / 2, y: d.wheelR, z: d.wheelbase / 2 }, { x: d.track / 2, y: d.wheelR, z: d.wheelbase / 2 },
      { x: -d.track / 2, y: d.wheelR, z: -d.wheelbase / 2 }, { x: d.track / 2, y: d.wheelR, z: -d.wheelbase / 2 },
      ...(d.hasSpare ? [{ x: halfW * 0.55, y: floorY + 0.42, z: -halfL + 0.18, spare: true }] : []),
    ],
    headlightMounts: [{ x: -halfW * 0.65, y: floorY + 0.45, z: halfL - 0.02 }, { x: halfW * 0.65, y: floorY + 0.45, z: halfL - 0.02 }],
    taillightMounts: [{ x: -halfW * 0.68, y: d.wheelR * 0.7, z: -halfL + 0.02 }, { x: halfW * 0.68, y: d.wheelR * 0.7, z: -halfL + 0.02 }],
    driverMount: { x: -halfW * 0.4, y: floorY + 0.4, z: cabFrontZ - d.cabLength / 2, yaw: 0 },
    seatMounts: [{ x: halfW * 0.4, y: floorY + 0.4, z: cabFrontZ - d.cabLength / 2, yaw: 0 }],
    dims: { ...d, roofY: cabRoofY },
  };
}

function buildMinibus(d) {
  const paint = [], chrome = [], glass = [];
  const halfW = d.width / 2, halfL = d.length / 2;
  const floorY = d.clearance + 0.04;
  const roofY = floorY + 1.55;

  paint.push(box(d.width * 0.88, 0.14, d.length * 0.94, 0, d.clearance * 0.5, 0));
  // boxy van body with a shallow bonnet
  paint.push(box(d.width * 0.96, 0.2, 0.55, 0, floorY + 0.55, halfL - 0.35));
  paint.push(box(d.width, roofY - floorY - 0.15, d.length - 0.75, 0, floorY + (roofY - floorY) / 2, -0.25));
  const wind = box(d.width * 0.9, 0.56, 0.05, 0, floorY + 1.0, halfL - 0.62); wind.rotateX(-0.12);
  glass.push(wind);
  // window band down both sides (glass) with pillars (paint) between
  const winRows = 3;
  for (const side of [-1, 1]) {
    for (let i = 0; i < winRows; i++) {
      const z = halfL - 1.1 - i * 1.15;
      glass.push(box(0.04, 0.5, 0.85, side * (halfW - 0.01), floorY + 1.15, z));
    }
  }
  chrome.push(box(d.width * 0.9, 0.16, 0.1, 0, d.wheelR * 0.75, halfL - 0.02));
  chrome.push(box(d.width * 0.88, 0.12, 0.1, 0, d.wheelR * 0.7, -halfL + 0.02));
  addMirrors(paint, chrome, halfL - 0.2, halfW, roofY - 0.3);
  if (d.hasRoofRack) {
    for (const side of [-1, 1]) chrome.push(box(0.03, 0.08, d.length - 1.2, side * (halfW - 0.16), roofY + 0.05, -0.2));
    for (let i = -2; i <= 2; i++) chrome.push(box(d.width * 0.86, 0.025, 0.025, 0, roofY + 0.05, -0.2 + i * ((d.length - 1.2) / 5)));
  }

  const seatMounts = [];
  const rows = [halfL - 1.55, halfL - 2.6, halfL - 3.65];
  for (const z of rows) for (const side of [-1, 1]) seatMounts.push({ x: side * halfW * 0.42, y: floorY + 0.42, z, yaw: 0 });

  const geometry = assemble({ paint, chrome, glass }, roofY);
  return {
    geometry, wheelR: d.wheelR, wheelW: d.wheelW,
    wheelMounts: [
      { x: -d.track / 2, y: d.wheelR, z: d.wheelbase / 2 }, { x: d.track / 2, y: d.wheelR, z: d.wheelbase / 2 },
      { x: -d.track / 2, y: d.wheelR, z: -d.wheelbase / 2 }, { x: d.track / 2, y: d.wheelR, z: -d.wheelbase / 2 },
    ],
    headlightMounts: [{ x: -halfW * 0.62, y: floorY + 0.42, z: halfL - 0.02 }, { x: halfW * 0.62, y: floorY + 0.42, z: halfL - 0.02 }],
    taillightMounts: [{ x: -halfW * 0.66, y: d.wheelR * 0.7, z: -halfL + 0.02 }, { x: halfW * 0.66, y: d.wheelR * 0.7, z: -halfL + 0.02 }],
    driverMount: { x: -halfW * 0.42, y: floorY + 0.42, z: halfL - 0.9, yaw: 0 },
    seatMounts,
    dims: { ...d, roofY },
  };
}

function buildService(d) {
  const paint = [], chrome = [], glass = [];
  const halfW = d.width / 2, halfL = d.length / 2;
  const floorY = d.clearance + 0.06;
  const cabFrontZ = halfL - 0.1;
  const cabRoofY = floorY + 1.3;
  const cabRearZ = cabFrontZ - d.cabLength;

  paint.push(box(d.width * 0.88, 0.16, d.length * 0.92, 0, d.clearance * 0.5, 0));
  paint.push(box(d.width * 0.98, 0.22, 0.85, 0, floorY + 0.68, cabFrontZ - 0.42));
  paint.push(box(d.width * 0.95, 0.95, d.cabLength - 0.1, 0, floorY + 0.68, cabFrontZ - d.cabLength / 2));
  const wind = box(d.width * 0.86, 0.55, 0.05, 0, floorY + 1.08, cabFrontZ - 0.78); wind.rotateX(-0.17);
  glass.push(wind);
  for (const side of [-1, 1]) glass.push(box(0.04, 0.42, d.cabLength * 0.5, side * (halfW - 0.02), floorY + 0.78, cabFrontZ - d.cabLength / 2 + 0.1));
  chrome.push(box(d.width * 0.7, 0.26, 0.05, 0, floorY + 0.46, cabFrontZ + 0.05));
  chrome.push(box(d.width * 0.9, 0.16, 0.12, 0, d.wheelR * 0.72, halfL - 0.02));
  chrome.push(box(d.width * 0.88, 0.12, 0.1, 0, d.wheelR * 0.68, -halfL + 0.02));
  addMirrors(paint, chrome, cabFrontZ, halfW, cabRoofY);

  // flatbed with a water tank + crates (all paint/chrome primitives, no separate draw calls)
  const bedLen = cabRearZ - (-halfL + 0.15);
  const bedMidZ = (cabRearZ + (-halfL + 0.15)) / 2;
  paint.push(box(d.width * 0.94, 0.1, bedLen, 0, floorY, bedMidZ));
  for (const side of [-1, 1]) paint.push(box(0.05, 0.3, bedLen, side * (halfW - 0.03), floorY + 0.15, bedMidZ));
  paint.push(cyl(d.width * 0.34, bedLen * 0.62, 0, floorY + 0.55, bedMidZ - bedLen * 0.05, { seg: 10 }));
  chrome.push(box(0.16, 0.16, 0.1, 0, floorY + 0.9, bedMidZ - bedLen * 0.05));
  for (let i = -1; i <= 1; i += 2) paint.push(box(0.5, 0.4, 0.5, i * halfW * 0.4, floorY + 0.2, -halfL + 0.6));

  const geometry = assemble({ paint, chrome, glass }, cabRoofY);
  return {
    geometry, wheelR: d.wheelR, wheelW: d.wheelW,
    wheelMounts: [
      { x: -d.track / 2, y: d.wheelR, z: d.wheelbase / 2 }, { x: d.track / 2, y: d.wheelR, z: d.wheelbase / 2 },
      { x: -d.track / 2, y: d.wheelR, z: -d.wheelbase / 2 }, { x: d.track / 2, y: d.wheelR, z: -d.wheelbase / 2 },
      ...(d.hasSpare ? [{ x: 0, y: floorY + 0.5, z: -halfL - 0.03, spare: true }] : []),
    ],
    headlightMounts: [{ x: -halfW * 0.65, y: floorY + 0.46, z: halfL - 0.02 }, { x: halfW * 0.65, y: floorY + 0.46, z: halfL - 0.02 }],
    taillightMounts: [{ x: -halfW * 0.68, y: d.wheelR * 0.7, z: -halfL + 0.02 }, { x: halfW * 0.68, y: d.wheelR * 0.7, z: -halfL + 0.02 }],
    driverMount: { x: -halfW * 0.4, y: floorY + 0.42, z: cabFrontZ - d.cabLength / 2, yaw: 0 },
    seatMounts: [{ x: halfW * 0.4, y: floorY + 0.42, z: cabFrontZ - d.cabLength / 2, yaw: 0 }],
    dims: { ...d, roofY: cabRoofY },
  };
}

const BUILDERS = { safari: buildSafari, ranger: buildRanger, minibus: buildMinibus, service: buildService };

export function buildKindModel(kindDef) {
  const model = BUILDERS[kindDef.id](kindDef);
  // precomputed ONCE per kind (not per vehicle, not per frame) — poseVehicle() in vehicle.js iterates
  // this every frame and must never rebuild it.
  model.allSeatMounts = model.driverMount ? [model.driverMount, ...model.seatMounts] : model.seatMounts;
  return model;
}

/** Shared wheel geometry at unit radius/width; scaled per-kind via the instance matrix.
 * Local +X = spin axis (lateral), rolling happens in the local Y-Z plane. Groups: [0] tyre [1] rim. */
export function buildWheelGeometry() {
  const tyre = new THREE.CylinderGeometry(1, 1, 1, 14, 1, false);
  tyre.rotateZ(HALF_PI);
  const rim = new THREE.CylinderGeometry(0.56, 0.56, 1.03, 10);
  rim.rotateZ(HALF_PI);
  tagFlat(tyre, 1); tagFlat(rim, 1);
  const geo = mergeGeometries([tyre, rim], true);
  geo.computeBoundingSphere();
  return geo;
}

/** Small emissive lens, forward = local +Z. */
export function buildLampGeometry(w = 0.16, h = 0.1) {
  const g = box(w, h, 0.04, 0, 0, 0);
  tagFlat(g, 1);
  return g;
}

/** Seated low-poly passenger, split into skin (head/neck/arms) and clothing (torso/legs/cap) —
 * two InstancedMeshes, each tinted per-instance via instanceColor. Forward = local +Z. Seated on a
 * bench at y=0 (hips), scaled to an average adult (~1.7 m standing equivalent). */
export function buildPassengerGeometry() {
  const skinParts = [
    box(0.16, 0.2, 0.15, 0, 0.62, 0.03),        // neck/head base
    new THREE.SphereGeometry(0.11, 8, 6).translate(0, 0.78, 0.03), // head
    box(0.07, 0.32, 0.07, -0.19, 0.42, 0.02),   // left forearm/hand resting
    box(0.07, 0.32, 0.07, 0.19, 0.42, 0.02),    // right forearm/hand
  ];
  const clothingParts = [
    box(0.34, 0.42, 0.22, 0, 0.36, 0),          // torso
    box(0.12, 0.24, 0.13, -0.16, 0.6, 0),       // left shoulder/upper arm
    box(0.12, 0.24, 0.13, 0.16, 0.6, 0),        // right shoulder/upper arm
    box(0.16, 0.1, 0.36, -0.09, 0.13, 0.14),    // left thigh (seated, forward)
    box(0.16, 0.1, 0.36, 0.09, 0.13, 0.14),     // right thigh
  ];
  for (const g of skinParts) tagFlat(g, 1);
  for (const g of clothingParts) tagFlat(g, 1);
  const skin = mergeGeometries(skinParts, false);
  const clothing = mergeGeometries(clothingParts, false);
  skin.computeBoundingSphere(); clothing.computeBoundingSphere();
  return { skin, clothing };
}

/** A visor-cap, merged into the clothing geometry as an option — kept separate so seatless drivers
 * still read distinctly; reuses tagFlat. */
export function buildCapGeometry() {
  const g = new THREE.CylinderGeometry(0.11, 0.11, 0.06, 8).translate(0, 0.86, 0.02);
  tagFlat(g, 1);
  return g;
}
