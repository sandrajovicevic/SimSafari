// Batched terrain conforming: flatten the heightfield under every edge (smoothed centreline, banked into the
// slope) and paint BIOME.ROAD_DUST beside the road. One pass over the network, then a handful of refresh calls
// into the terrain module — its per-call flatten()/paintBiome() re-pack the whole control grid (≈100 ms each),
// which makes ~900 per-sample calls per rebuild infeasible. See README "Known gaps" + docs/requests/roads.md.
import { BIOME } from '../../core/World.js';

/**
 * Write flattened heights + dust biome into world.terrain for all edges in the graph.
 * Returns the touched sample bbox {ix0, iz0, ix1, iz1} or null.
 */
export function flattenHeightfield(world, graph, { paint = true, isWater = null, dustRadius = 3 } = {}) {
  const T = world.terrain, res = T.res, h = T.heights, cell = T.cell;
  const wet = isWater || ((x, z) => world.isWater(x, z));
  const bestW = new Float32Array(res * res), bestT = new Float32Array(res * res);
  let ix0 = res, iz0 = res, ix1 = -1, iz1 = -1;
  const dust = paint ? new Uint8Array(res * res) : null;
  for (const e of graph.edges.values()) {
    const p = e.points, n = p.length >> 1, W = e.width * 0.5;
    const hs = new Float32Array(n), wetFlag = new Uint8Array(n);
    for (let i = 0; i < n; i++) { hs[i] = world.getHeight(p[i * 2], p[i * 2 + 1]); wetFlag[i] = wet(p[i * 2], p[i * 2 + 1]) ? 1 : 0; }
    // smoothed centreline (±8 m) ignoring samples in water
    const target = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let sum = 0, cnt = 0;
      for (let k = -4; k <= 4; k++) { const j = i + k; if (j >= 0 && j < n && !wetFlag[j]) { sum += hs[j]; cnt++; } }
      target[i] = cnt ? sum / cnt : hs[i];
    }
    const r = W + 3.5, rd = W + dustRadius;
    const rc = Math.ceil(Math.max(r, rd) / cell);
    for (let i = 0; i < n; i++) {
      const x = p[i * 2], z = p[i * 2 + 1];
      const { fx, fz } = world.toSample(x, z);
      const inWater = wetFlag[i];
      for (let jz = Math.floor(fz) - rc; jz <= Math.ceil(fz) + rc; jz++) {
        for (let jx = Math.floor(fx) - rc; jx <= Math.ceil(fx) + rc; jx++) {
          if (jx < 0 || jz < 0 || jx >= res || jz >= res) continue;
          const d = Math.hypot((jx - fx) * cell, (jz - fz) * cell);
          const k = jz * res + jx;
          if (dust && d <= rd && !inWater) dust[k] = 1;
          if (inWater || d > r) continue;
          const t = Math.min(1, Math.max(0, (d - (W + 0.7)) / (r - (W + 0.7))));
          const w = 1 - t * t * (3 - 2 * t);
          if (w > bestW[k]) { bestW[k] = w; bestT[k] = target[i]; }
          if (jx < ix0) ix0 = jx; if (jx > ix1) ix1 = jx; if (jz < iz0) iz0 = jz; if (jz > iz1) iz1 = jz;
        }
      }
    }
  }
  if (ix1 < 0) return null;
  for (let k = 0; k < h.length; k++) {
    if (bestW[k] > 0) {
      const nh = h[k] + (bestT[k] - h[k]) * bestW[k];
      // never flatten below the water level (keeps banks dry)
      h[k] = nh < T.waterLevel + 0.15 && h[k] >= T.waterLevel + 0.15 ? T.waterLevel + 0.15 : nh;
    }
  }
  if (dust) for (let k = 0; k < dust.length; k++) if (dust[k] && h[k] >= T.waterLevel) T.biome[k] = BIOME.ROAD_DUST;
  world.updateHeightStats();
  return { ix0, iz0, ix1, iz1 };
}

/**
 * Ask the terrain module to refresh the chunks covering a sample bbox after a direct heightfield write.
 * Prefers a batched API when the terrain module offers one; falls back to zero-strength smooth() per chunk
 * (its afterEdit refreshes the chunk mesh, height texture and control textures).
 */
export function refreshTerrain(terrain, world, bbox, log) {
  if (!terrain || !bbox) return 0;
  const T = world.terrain, cell = T.cell, half = world.half;
  const x0 = bbox.ix0 * cell - half, z0 = bbox.iz0 * cell - half, x1 = bbox.ix1 * cell - half, z1 = bbox.iz1 * cell - half;
  try {
    if (typeof terrain.refreshRegion === 'function') { terrain.refreshRegion(x0, z0, x1, z1); return 1; }
    if (typeof terrain.smooth !== 'function') return 0;
    // collect distinct chunks by walking the region
    const seen = new Set(), targets = [];
    const step = 64;
    for (let z = z0; z <= z1 + step; z += step) for (let x = x0; x <= x1 + step; x += step) {
      const cx = Math.min(x, x1), cz = Math.min(z, z1);
      const ch = typeof terrain.getChunkAt === 'function' ? terrain.getChunkAt(cx, cz) : null;
      const key = ch ? `${ch.cx},${ch.cz}` : `${Math.floor(cx / 128)},${Math.floor(cz / 128)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      targets.push(ch ? { x: (ch.x0 + ch.x1) * 0.5, z: (ch.z0 + ch.z1) * 0.5 } : { x: cx, z: cz });
    }
    for (const t of targets) terrain.smooth(t.x, t.z, 0.01, 0);
    return targets.length;
  } catch (err) {
    log?.warn('[roads] terrain refresh failed: ' + (err?.message || err));
    return 0;
  }
}
