// Thatch roofs.
//
// A thatch roof is NOT a smooth cone. It is a stack of courses of cut grass, each course overhanging
// the one below by a hand's width, with a thick ragged cut edge at the eave and a rolled ridge capping.
// This builds exactly that: a lofted surface from an eave polygon to a ridge polyline, noise-displaced
// so the surface undulates, plus N "course lips" — small ledges whose lower edge is displaced per column
// so no two straws end at the same height — plus a fat eave course and a ridge roll.
import * as THREE from 'three';

const _p = new THREE.Vector3();
const _q = new THREE.Vector3();
const _r = new THREE.Vector3();
const _n = new THREE.Vector3();

/** Quad whose winding is chosen so the face normal points roughly along ref. */
function quadFacing(buf, a, b, c, d, u0, v0, u1, v1, refx, refy, refz) {
  _p.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  _q.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
  _n.copy(_p).cross(_q);
  if (_n.x * refx + _n.y * refy + _n.z * refz >= 0) buf.quad(a, b, c, d, u0, v0, u1, v1);
  else buf.quad(a, d, c, b, u0, v0, u1, v1);
}

/** Eave/ridge polygons for a hipped rectangular roof (ridge runs along the longer axis). */
export function hipOutline(w, d, overhang, seg = 15) {
  const a = w * 0.5 + overhang, b = d * 0.5 + overhang;
  const alongZ = b >= a;
  const short = alongZ ? a : b;
  const long = alongZ ? b : a;
  const rh = Math.max(0, long - short);      // half length of the ridge (45 degree hips)
  const eave = [], ridge = [];
  const push = (x, z) => {
    eave.push([x, z]);
    if (alongZ) ridge.push([0, Math.max(-rh, Math.min(rh, z))]);
    else ridge.push([Math.max(-rh, Math.min(rh, x)), 0]);
  };
  // walk the rectangle counter-clockwise in plan, sampling each edge proportionally
  const edges = [[-a, -b, a, -b], [a, -b, a, b], [a, b, -a, b], [-a, b, -a, -b]];
  for (const [x0, z0, x1, z1] of edges) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(2, Math.round((len / (2 * (a + b))) * seg * 4));
    for (let i = 0; i < n; i++) {
      const t = i / n;
      push(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t);
    }
  }
  return { eave, ridge, ridgeHalf: rh, alongZ };
}

/** Eave/ridge polygons for a conical roof (rondavel). */
export function coneOutline(r, seg = 40) {
  const eave = [], ridge = [];
  for (let i = 0; i < seg; i++) {
    const t = (i / seg) * Math.PI * 2;
    eave.push([Math.cos(t) * r, Math.sin(t) * r]);
    ridge.push([0, 0]);
  }
  return { eave, ridge, ridgeHalf: 0, alongZ: true };
}

/**
 * Build a thatch roof into `buf`.
 * opts: { eave, ridge } from hipOutline/coneOutline, plus
 *   eaveY   height of the eave line
 *   height  ridge height above the eave
 *   rows    lofted rows (12)
 *   courses v positions of the course lips
 *   tile    texture tile size in metres (0.5)
 *   noise   ctx.noise
 *   seed    noise offset
 */
export function thatchRoof(buf, opts) {
  const {
    eave, ridge, eaveY = 0, height = 3, rows = 12, tile = 0.55, noise, seed = 0,
    courses = [0.0, 0.17, 0.35, 0.54, 0.74], profile = 0.88, bulge = 0.10, ragged = 0.075,
    ridgeRoll = true, underside = false, underDrop = 0.30,
  } = opts;

  const P = eave.length;
  const nz = (x, y) => (noise ? noise.fbm2D(x + seed * 13.7, y + seed * 7.3, 3) : 0);

  // outward horizontal direction per column
  const outX = new Float64Array(P), outZ = new Float64Array(P);
  for (let i = 0; i < P; i++) {
    let dx = eave[i][0] - ridge[i][0], dz = eave[i][1] - ridge[i][1];
    let l = Math.hypot(dx, dz);
    if (l < 1e-5) { dx = eave[i][0]; dz = eave[i][1]; l = Math.hypot(dx, dz) || 1; }
    outX[i] = dx / l; outZ[i] = dz / l;
  }

  // cumulative arc length around the eave -> u
  const arc = new Float64Array(P + 1);
  for (let i = 1; i <= P; i++) {
    const a = eave[i - 1], b = eave[i % P];
    arc[i] = arc[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]);
  }

  // surface point (column i, parameter v) -> out[3]
  function surf(i, v, out) {
    const E = eave[i], R = ridge[i];
    const s = v;
    let x = E[0] + (R[0] - E[0]) * s;
    let z = E[1] + (R[1] - E[1]) * s;
    const y = eaveY + height * Math.pow(v, profile);
    const bu = bulge * Math.sin(Math.PI * Math.min(1, v * 1.05));
    const rn = nz(E[0] * 0.55, E[1] * 0.55 + v * 2.6) * ragged * (1 - v * 0.45);
    x += outX[i] * (bu + rn * 0.6);
    z += outZ[i] * (bu + rn * 0.6);
    out[0] = x; out[1] = y + rn * 0.55; out[2] = z;
    return out;
  }

  // ---- main lofted surface, smooth-shaded -----------------------------------------------------
  const cols = P + 1;                       // duplicate the seam column for continuous UVs
  const gx = new Float64Array(cols * (rows + 1));
  const gy = new Float64Array(cols * (rows + 1));
  const gz = new Float64Array(cols * (rows + 1));
  const gu = new Float64Array(cols * (rows + 1));
  const gv = new Float64Array(cols * (rows + 1));
  const tmp = [0, 0, 0];
  for (let c = 0; c < cols; c++) {
    const i = c % P;
    let acc = 0;
    for (let r = 0; r <= rows; r++) {
      const v = r / rows;
      surf(i, v, tmp);
      const k = r * cols + c;
      if (r > 0) {
        const pk = (r - 1) * cols + c;
        acc += Math.hypot(tmp[0] - gx[pk], tmp[1] - gy[pk], tmp[2] - gz[pk]);
      }
      gx[k] = tmp[0]; gy[k] = tmp[1]; gz[k] = tmp[2];
      gu[k] = arc[c] / tile; gv[k] = acc / tile;
    }
  }
  // smooth normals from grid differences
  const base = buf.vcount;
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c < cols; c++) {
      const k = r * cols + c;
      const cl = r * cols + (c > 0 ? c - 1 : cols - 2);
      const cr = r * cols + (c < cols - 1 ? c + 1 : 1);
      const rd = (r > 0 ? r - 1 : r) * cols + c;
      const ru = (r < rows ? r + 1 : r) * cols + c;
      _p.set(gx[cr] - gx[cl], gy[cr] - gy[cl], gz[cr] - gz[cl]);
      _q.set(gx[ru] - gx[rd], gy[ru] - gy[rd], gz[ru] - gz[rd]);
      _n.copy(_p).cross(_q).normalize();
      if (_n.y < 0) _n.negate();
      buf.vert(gx[k], gy[k], gz[k], _n.x, _n.y, _n.z, gu[k], gv[k]);
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = base + r * cols + c, b = base + r * cols + c + 1;
      const cc = base + (r + 1) * cols + c + 1, dd = base + (r + 1) * cols + c;
      buf.tri(a, b, cc); buf.tri(a, cc, dd);
    }
  }

  // ---- underside (only for roofs you can stand under: verandas, hides, open bomas) --------------
  if (underside) {
    const ub = buf.vcount;
    for (let r = 0; r <= rows; r++) {
      for (let c = 0; c < cols; c++) {
        const k = r * cols + c;
        buf.vert(gx[k], gy[k] - underDrop, gz[k], 0, -1, 0, gu[k], gv[k]);
      }
    }
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const a = ub + r * cols + c, b = ub + r * cols + c + 1;
        const cc = ub + (r + 1) * cols + c + 1, dd = ub + (r + 1) * cols + c;
        buf.tri(a, cc, b); buf.tri(a, dd, cc);
      }
    }
  }

  // ---- course lips ----------------------------------------------------------------------------
  const S = [0, 0, 0], S2 = [0, 0, 0];
  courses.forEach((vk, ci) => {
    const isEave = ci === 0;
    const lipOut = isEave ? 0.17 : 0.085;
    const lipDown = isEave ? 0.34 : 0.14;
    const jag = isEave ? 0.13 : 0.055;
    const T = [], B = [], U = [];
    for (let c = 0; c < cols; c++) {
      const i = c % P;
      surf(i, vk, S);
      const rag = nz(eave[i][0] * 2.3 + ci * 31.1, eave[i][1] * 2.3 - ci * 17.9) * jag;
      const ox = outX[i], oz = outZ[i];
      T.push([S[0] + ox * lipOut * 0.2, S[1] + 0.012, S[2] + oz * lipOut * 0.2]);
      B.push([S[0] + ox * (lipOut + rag * 0.5), S[1] - lipDown - rag, S[2] + oz * (lipOut + rag * 0.5)]);
      // inner point for the soffit / underside
      surf(i, vk + (isEave ? 0.13 : 0.05), S2);
      U.push([S2[0], S2[1] - (isEave ? 0.16 : 0.06), S2[2]]);
    }
    for (let c = 0; c < cols - 1; c++) {
      const i = c % P;
      const u0 = arc[c] / tile, u1 = arc[c + 1] / tile;
      const vh = (lipDown + 0.05) / tile;
      quadFacing(buf, T[c], T[c + 1], B[c + 1], B[c], u0, vh, u1, 0, outX[i], -0.35, outZ[i]);
      quadFacing(buf, B[c], B[c + 1], U[c + 1], U[c], u0, 0, u1, vh, 0, -1, 0);
    }
  });

  // ---- ridge roll -----------------------------------------------------------------------------
  if (ridgeRoll) {
    const rr = 0.26 + height * 0.012;
    // ridge polyline = the unique ridge points; build a tube of little spheres approximated by boxes
    const a = ridge[0], seen = [];
    for (const p of ridge) {
      if (!seen.length || Math.hypot(p[0] - seen[seen.length - 1][0], p[1] - seen[seen.length - 1][1]) > 0.05) seen.push(p);
    }
    // find the extreme two ridge points
    let p0 = ridge[0], p1 = ridge[0], best = -1;
    for (let i = 0; i < ridge.length; i++) for (let j = i + 1; j < ridge.length; j++) {
      const dd = Math.hypot(ridge[i][0] - ridge[j][0], ridge[i][1] - ridge[j][1]);
      if (dd > best) { best = dd; p0 = ridge[i]; p1 = ridge[j]; }
    }
    void a;
    const y = eaveY + height;
    if (best > 0.35) {
      const dx = p1[0] - p0[0], dz = p1[1] - p0[1];
      const L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L;
      const ext = 0.22;
      const ax = p0[0] - ux * ext, az = p0[1] - uz * ext;
      const bx = p1[0] + ux * ext, bz = p1[1] + uz * ext;
      const segs = Math.max(3, Math.round(L / 0.9));
      const px = -uz, pz = ux;
      const ringA = [], ringB = [];
      for (let s = 0; s <= segs; s++) {
        const t = s / segs;
        const cx = ax + (bx - ax) * t, cz = az + (bz - az) * t;
        const wob = nz(cx * 1.4, cz * 1.4) * 0.05;
        ringA.push([cx, cz, wob]);
      }
      void ringB;
      const SIDES = 7;
      const idx = [];
      for (let s = 0; s <= segs; s++) {
        const row = [];
        const [cx, cz, wob] = ringA[s];
        for (let k = 0; k <= SIDES; k++) {
          const ang = -Math.PI * 0.06 + (k / SIDES) * Math.PI * 1.12;
          const rx = Math.cos(ang), ry = Math.sin(ang);
          const R = rr + wob;
          const vx = cx + px * rx * R, vy = y - 0.06 + ry * R, vz = cz + pz * rx * R;
          row.push(buf.vert(vx, vy, vz, px * rx, ry, pz * rx, (s / segs) * L / tile, (k / SIDES) * (Math.PI * R) / tile));
        }
        idx.push(row);
      }
      for (let s = 0; s < segs; s++) buf.strip(idx[s], idx[s + 1]);
    }
  }
  void _r;
}
