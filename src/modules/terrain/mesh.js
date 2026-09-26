// Chunked heightfield mesh. CH×CH chunks, seamless normals from the global heightfield,
// alternating diagonals, castShadow only on chunks with real relief.
import * as THREE from 'three';
import { normalAt } from './generate.js';

const _n = [0, 0, 0];

export function buildChunks(world, material, { chunksPerSide = 4 } = {}) {
  const T = world.terrain;
  const res = T.res, cell = T.cell, half = world.half;
  const cells = (res - 1) / chunksPerSide; // samples per chunk edge minus one
  const chunks = [];
  for (let cz = 0; cz < chunksPerSide; cz++) for (let cx = 0; cx < chunksPerSide; cx++) {
    const ix0 = cx * cells, iz0 = cz * cells;
    const nv = (cells + 1) * (cells + 1);
    const pos = new Float32Array(nv * 3);
    const nrm = new Float32Array(nv * 3);
    const idx = new Uint32Array(cells * cells * 6);
    let k = 0;
    for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) {
      const a = j * (cells + 1) + i, b = a + 1, c = a + cells + 1, d = c + 1;
      if (((i + j) & 1) === 0) { idx[k++] = a; idx[k++] = c; idx[k++] = b; idx[k++] = b; idx[k++] = c; idx[k++] = d; }
      else { idx[k++] = a; idx[k++] = c; idx[k++] = d; idx[k++] = a; idx[k++] = d; idx[k++] = b; }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    const mesh = new THREE.Mesh(geo, material);
    mesh.name = `terrain-chunk-${cx}-${cz}`;
    // Was `false // BENCH` — a leftover benchmarking flag. Its effect: nothing in the game can cast
    // a visible shadow onto the ground, anywhere, ever (filed by `animals` as the root cause of their
    // round-1 "no contact shadow" blocker, which they worked around with a drawn decal in the
    // meantime). Fixed by the integrator since it is a one-line, well-evidenced leftover flag.
    mesh.receiveShadow = true;
    mesh.frustumCulled = true;
    mesh.matrixAutoUpdate = false;
    const chunk = {
      cx, cz, ix0, iz0, ix1: ix0 + cells, iz1: iz0 + cells, cells, mesh, geo,
      x0: ix0 * cell - half, z0: iz0 * cell - half, x1: (ix0 + cells) * cell - half, z1: (iz0 + cells) * cell - half,
      minH: 0, maxH: 0,
    };
    refreshChunk(world, chunk);
    chunks.push(chunk);
  }
  return chunks;
}

/** Recompute positions/normals of one chunk from world.terrain.heights. */
export function refreshChunk(world, chunk) {
  const T = world.terrain, res = T.res, cell = T.cell, half = world.half, H = T.heights;
  const pos = chunk.geo.attributes.position.array, nrm = chunk.geo.attributes.normal.array;
  const cells = chunk.cells;
  let mn = Infinity, mx = -Infinity, maxSlope = 0;
  let o = 0;
  for (let j = 0; j <= cells; j++) {
    const iz = chunk.iz0 + j;
    for (let i = 0; i <= cells; i++) {
      const ix = chunk.ix0 + i;
      const h = H[iz * res + ix];
      pos[o] = ix * cell - half; pos[o + 1] = h; pos[o + 2] = iz * cell - half;
      normalAt(H, res, cell, ix, iz, _n);
      nrm[o] = _n[0]; nrm[o + 1] = _n[1]; nrm[o + 2] = _n[2];
      if (h < mn) mn = h; if (h > mx) mx = h;
      const s = 1 - _n[1]; if (s > maxSlope) maxSlope = s;
      o += 3;
    }
  }
  chunk.minH = mn; chunk.maxH = mx; chunk.maxSlope = maxSlope;
  chunk.geo.attributes.position.needsUpdate = true;
  chunk.geo.attributes.normal.needsUpdate = true;
  chunk.geo.computeBoundingSphere();
  chunk.geo.computeBoundingBox();
  // only chunks with real relief cast shadows (kopjes, escarpment, river banks are not enough)
  chunk.mesh.castShadow = (mx - mn) > 18 || maxSlope > 0.35;
}

/**
 * Recompute only the vertices of `chunk` inside sample rect [ix0..ix1]×[iz0..iz1] (grown by 1 for the
 * normals), uploading just those rows through BufferAttribute update ranges instead of the whole chunk.
 * Height bounds only grow here (a dig can leave them slightly loose until the next full refresh; they
 * feed culling and the shadow flag, both conservative when loose).
 */
export function refreshChunkRect(world, chunk, ix0, iz0, ix1, iz1) {
  const T = world.terrain, res = T.res, cell = T.cell, half = world.half, H = T.heights;
  const cells = chunk.cells, n = cells + 1;
  const i0 = Math.max(0, ix0 - 1 - chunk.ix0), i1 = Math.min(cells, ix1 + 1 - chunk.ix0);
  const j0 = Math.max(0, iz0 - 1 - chunk.iz0), j1 = Math.min(cells, iz1 + 1 - chunk.iz0);
  if (i0 > i1 || j0 > j1) return;
  const posA = chunk.geo.attributes.position, nrmA = chunk.geo.attributes.normal;
  const pos = posA.array, nrm = nrmA.array;
  let mn = chunk.minH, mx = chunk.maxH, maxSlope = chunk.maxSlope || 0;
  for (let j = j0; j <= j1; j++) {
    const iz = chunk.iz0 + j;
    for (let i = i0; i <= i1; i++) {
      const ix = chunk.ix0 + i, o = (j * n + i) * 3;
      const h = H[iz * res + ix];
      pos[o] = ix * cell - half; pos[o + 1] = h; pos[o + 2] = iz * cell - half;
      normalAt(H, res, cell, ix, iz, _n);
      nrm[o] = _n[0]; nrm[o + 1] = _n[1]; nrm[o + 2] = _n[2];
      if (h < mn) mn = h; if (h > mx) mx = h;
      const sl = 1 - _n[1]; if (sl > maxSlope) maxSlope = sl;
    }
    const start = (j * n + i0) * 3, count = (i1 - i0 + 1) * 3;
    posA.addUpdateRange(start, count); nrmA.addUpdateRange(start, count);
  }
  posA.needsUpdate = true; nrmA.needsUpdate = true;
  chunk.minH = mn; chunk.maxH = mx; chunk.maxSlope = maxSlope;
  const bb = chunk.geo.boundingBox;
  if (bb) { if (mn < bb.min.y) bb.min.y = mn; if (mx > bb.max.y) bb.max.y = mx; bb.getBoundingSphere(chunk.geo.boundingSphere); }
  chunk.mesh.castShadow = (mx - mn) > 18 || maxSlope > 0.35;
}

export function chunkAt(chunks, chunksPerSide, world, x, z) {
  const T = world.terrain, cell = T.cell, half = world.half;
  const cells = (T.res - 1) / chunksPerSide;
  let cx = Math.floor((x + half) / cell / cells), cz = Math.floor((z + half) / cell / cells);
  cx = cx < 0 ? 0 : cx >= chunksPerSide ? chunksPerSide - 1 : cx;
  cz = cz < 0 ? 0 : cz >= chunksPerSide ? chunksPerSide - 1 : cz;
  return chunks[cz * chunksPerSide + cx];
}
