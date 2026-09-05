// Species → skinned geometry. Every body is assembled from Tube parts (torso, neck, head, legs, tail,
// ears + species features) along code-built bone chains; all parts are UV-atlased and merged into ONE
// indexed BufferGeometry with aBoneIndex / aBoneWeight / aInfo attributes. Proportions come from
// species.js (metres). The same code at detail < 1 produces the far LOD with identical UVs.
import * as THREE from 'three';
import { Tube, catmull, keyCurve, packAtlas, mergeParts, smoothstep, lerp, PI2 } from './geom.js';
import { Rig, TRUNK_NAMES, B } from './rig.js';

export const PART = Object.freeze({
  TORSO: 1, NECK: 2, HEAD: 3, EAR: 4, FORELEG: 5, HINDLEG: 6, TAIL: 7, TUSK: 8, HORN: 9, TRUNK: 10, MANE: 11, OSSICONE: 12, WING: 13, BEARD: 14,
});

const DEG = Math.PI / 180;
const UP = new THREE.Vector3(0, 1, 0), FWD = new THREE.Vector3(0, 0, 1), SIDE = new THREE.Vector3(1, 0, 0);

/** Deterministic hash → [0,1). Pure function of integers (no Math.random anywhere in this module). */
export function hash(a, b, c = 0) {
  let h = Math.imul((a * 73856093) ^ (b * 19349663) ^ (c * 83492791) ^ 0x9e3779b9, 2654435761) >>> 0;
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995) >>> 0; h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** Sample a Catmull-Rom path through ctrl into n points; also return the arc parameter of each ctrl point. */
function samplePath(ctrl, n) {
  const dense = 64;
  const pts = [];
  for (let i = 0; i < dense; i++) pts.push(catmull(ctrl, i / (dense - 1)));
  const cum = [0];
  for (let i = 1; i < dense; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const total = cum[dense - 1] || 1;
  const sCtrl = ctrl.map((_, k) => { const t = k / (ctrl.length - 1); const f = t * (dense - 1); const i = Math.min(Math.floor(f), dense - 2); const u = f - i; return (cum[i] * (1 - u) + cum[i + 1] * u) / total; });
  // resample uniformly by arc length
  const out = [];
  for (let i = 0; i < n; i++) {
    const target = (i / (n - 1)) * total;
    let k = 0;
    while (k < dense - 2 && cum[k + 1] < target) k++;
    const u = (target - cum[k]) / Math.max(1e-9, cum[k + 1] - cum[k]);
    out.push(pts[k].clone().lerp(pts[k + 1], u));
  }
  return { pts, sCtrl, out, total };
}

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

/**
 * Build one species variant. Returns { geometry, rig, eyes:{L,R}, dims, parts }.
 * detail: 1 = near mesh, 0.5 = far LOD (same atlas, same bones).
 */
export function buildAnimal(spec, { detail = 1, variant = 'default' } = {}) {
  const Bd = spec.body, F = Bd.features || {};
  const male = variant === 'male';
  const D = detail;
  const segs = (n) => Math.max(6, Math.round(n * D));
  const rings = (n) => Math.max(3, Math.round(n * D));
  const rig = new Rig(F.trunk ? TRUNK_NAMES : []);
  const parts = [];

  // ---------- torso ----------
  const zHip = -Bd.bodyLen / 2, zSh = Bd.bodyLen / 2, zTail = zHip - Bd.rumpLen, zNeck = zSh + Bd.chestLen, zMid = 0;
  const hump = Bd.hump || 0, sag = Bd.backSag || 0;
  const midTop = (Bd.hipH + Bd.shoulderH) / 2 - sag;
  const backKeys = [[zTail, Bd.hipH - Bd.hipDepth * 0.14], [zHip, Bd.hipH], [zMid, midTop], [zSh - Bd.bodyLen * 0.14, Bd.shoulderH + hump * 0.35], [zSh + Bd.bodyLen * 0.04, Bd.shoulderH + hump], [zNeck, Bd.shoulderH - Bd.chestDepth * 0.16 + hump * 0.5]];
  const bellyKeys = [[zTail, Bd.hipH - Bd.hipDepth * 0.82], [zHip, Bd.hipH - Bd.hipDepth], [zMid, midTop - Bd.bellyDepth], [zSh, Bd.shoulderH - Bd.chestDepth], [zNeck, Bd.shoulderH - Bd.chestDepth * 0.84]];
  const widthKeys = [[zTail, Bd.hipW * 0.5], [zHip, Bd.hipW], [zMid, Bd.bellyW], [zSh, Bd.chestW], [zNeck, Bd.chestW * 0.72]];
  const backY = (z) => keyCurve(backKeys, z), bellyY = (z) => keyCurve(bellyKeys, z), widthAt = (z) => keyCurve(widthKeys, z);
  const cy = (z) => (backY(z) + bellyY(z)) * 0.5, ryAt = (z) => (backY(z) - bellyY(z)) * 0.5;

  const nT = rings(26), tPath = [], tRx = [], tRy = [];
  for (let i = 0; i < nT; i++) {
    const s = i / (nT - 1), z = zTail + (zNeck - zTail) * s;
    tPath.push(v3(0, cy(z), z)); tRx.push(widthAt(z) * 0.5); tRy.push(ryAt(z));
  }
  const sOf = (z) => (z - zTail) / (zNeck - zTail);
  const sq = Bd.sq ?? 0.9;
  const torsoShape = (s, th) => {
    const as = Math.max(Math.abs(Math.sin(th)), 1e-4), ac = Math.max(Math.abs(Math.cos(th)), 1e-4);
    // superellipse: squarer back/belly; belly slightly rounder than back
    const p = Math.cos(th) > 0 ? sq : Math.min(1, sq + 0.08);
    return [Math.pow(as, p - 1), Math.pow(ac, p - 1)];
  };
  const spineJoints = [{ bone: B.root, s: 0 }, { bone: B.spine1, s: sOf(zHip + (zMid - zHip) * 0.6) }, { bone: B.chest, s: sOf(zMid + (zSh - zMid) * 0.55) }];
  parts.push(new Tube(tPath, tRx, tRy, { part: PART.TORSO, segs: segs(28), shape: torsoShape, joints: spineJoints, blend: 0.12, capStart: true, capEnd: true, capScale: 0.45, up: UP }));

  rig.setBind('root', 0, cy(zHip), zHip);
  rig.setBind('spine1', 0, cy(zMid), zMid);
  rig.setBind('chest', 0, cy(zSh), zSh);

  // ---------- neck ----------
  const N = Bd.neck, na = N.angle * DEG;
  const nd = v3(0, Math.sin(na), Math.cos(na)), nperp = v3(0, Math.cos(na), -Math.sin(na));
  const neckBase = v3(0, cy(zNeck) + ryAt(zNeck) * 0.2, zNeck);
  const neckEnd = neckBase.clone().addScaledVector(nd, N.len);
  const neckMid = neckBase.clone().addScaledVector(nd, N.len * 0.5).addScaledVector(nperp, N.arch || 0);
  const neckStart = neckBase.clone().addScaledVector(nd, -N.len * 0.12);
  const nN = rings(11);
  const neckS = samplePath([neckStart, neckBase, neckMid, neckEnd], nN);
  const neckRx = [], neckRy = [];
  for (let i = 0; i < nN; i++) {
    const s = i / (nN - 1);
    neckRx.push(lerp(N.r0 * 0.82, N.r1 * 0.9, Math.pow(s, 0.85)));
    neckRy.push(lerp(N.r0, N.r1, Math.pow(s, 0.9)));
  }
  const sNeck = (k) => neckS.sCtrl[1] + (1 - neckS.sCtrl[1]) * k;
  const neckJoints = [{ bone: B.chest, s: 0 }, { bone: B.neck1, s: sNeck(0) }, { bone: B.neck2, s: sNeck(1 / 3) }, { bone: B.neck3, s: sNeck(2 / 3) }, { bone: B.head, s: sNeck(0.97) }];
  const mane = F.mane;
  let neckExtrude = null;
  if (mane && (mane.type === 'ridge' || mane.type === 'shaggy')) {
    const width = mane.type === 'ridge' ? 0.16 : 0.42, h = mane.h;
    neckExtrude = (s, th, i, j) => {
      const a = Math.min(th, PI2 - th);
      const w = smoothstep(width, width * 0.25, a);
      const bell = smoothstep(0.02, 0.2, s) * smoothstep(1.0, 0.85, s);
      const n = mane.type === 'ridge' ? 0.85 + 0.3 * hash(i, j, 3) : 0.5 + 0.9 * hash(i, j, 4);
      return h * w * bell * n;
    };
  }
  parts.push(new Tube(neckS.out, neckRx, neckRy, { part: PART.NECK, segs: segs(20), joints: neckJoints, blend: 0.07, up: UP, extrude: neckExtrude, capStart: false, capEnd: true, capScale: 0.4 }));
  for (let k = 0; k < 3; k++) { const p = neckBase.clone().addScaledVector(nd, N.len * k / 3); rig.setBind(['neck1', 'neck2', 'neck3'][k], p.x, p.y, p.z); }
  rig.setBind('head', neckEnd.x, neckEnd.y, neckEnd.z);

  // ---------- head ----------
  const H = Bd.head, ha = na - H.pitch * DEG;
  const hd = v3(0, Math.sin(ha), Math.cos(ha)), uph = v3(0, Math.cos(ha), -Math.sin(ha));
  const hOrigin = neckEnd.clone();
  const hrx = (s) => keyCurve(H.profile, s, 1), hry = (s) => keyCurve(H.profile, s, 2), hdy = (s) => keyCurve(H.profile, s, 3);
  const headPt = (s, out = new THREE.Vector3()) => out.copy(hOrigin).addScaledVector(hd, s * H.len).addScaledVector(uph, hdy(s));
  const nH = rings(13), hPath = [], hRx = [], hRy = [];
  for (let i = 0; i < nH; i++) {
    const s = -0.1 + 1.1 * (i / (nH - 1));
    const sc = Math.max(0, Math.min(1, s));
    hPath.push(headPt(s)); hRx.push(hrx(sc) * (s < 0 ? 0.92 : 1)); hRy.push(hry(sc) * (s < 0 ? 0.92 : 1));
  }
  const headWeight = (s, th, pos, out) => {
    const sc = -0.1 + 1.1 * s;
    const ct = Math.cos(th);
    const w = smoothstep(0.5, 0.72, sc) * smoothstep(-0.3, -0.75, ct) * 0.85;
    out[0] = B.head; out[1] = 1 - w; out[2] = B.jaw; out[3] = w;
    return out;
  };
  let headExtrude = null;
  if (F.warts) {
    headExtrude = (s, th) => {
      const sc = -0.1 + 1.1 * s;
      let e = 0;
      for (const [ws, wt, wr] of [[0.42, 0.62, 0.028], [0.72, 0.7, 0.02]]) {
        const a = Math.min(Math.abs(th - wt * Math.PI), Math.abs(th - (2 - wt) * Math.PI));
        const d = Math.hypot((sc - ws) * 3.5, a * 0.9);
        e += wr * smoothstep(0.5, 0.0, d);
      }
      return e;
    };
  }
  const headShape = spec.id === 'hippo' || spec.id === 'rhino' ? (s, th) => { const as = Math.max(Math.abs(Math.sin(th)), 1e-4), ac = Math.max(Math.abs(Math.cos(th)), 1e-4); return [Math.pow(as, -0.2), Math.pow(ac, -0.2)]; } : null;
  parts.push(new Tube(hPath, hRx, hRy, { part: PART.HEAD, segs: segs(20), weight: headWeight, up: uph, capStart: true, capEnd: true, capScale: 0.55, extrude: headExtrude, shape: headShape }));
  const jawP = headPt(0.35).addScaledVector(uph, -hry(0.35) * 0.55);
  rig.setBind('jaw', jawP.x, jawP.y, jawP.z);
  const eyeC = headPt(H.eye.s);
  const eyes = {
    L: eyeC.clone().addScaledVector(SIDE, -hrx(H.eye.s) * 0.9 * H.eye.side).addScaledVector(uph, hry(H.eye.s) * 0.32),
    R: eyeC.clone().addScaledVector(SIDE, hrx(H.eye.s) * 0.9 * H.eye.side).addScaledVector(uph, hry(H.eye.s) * 0.32),
    r: H.eye.r,
  };
  const nose = headPt(1.0);

  // ---------- ears ----------
  const E = Bd.ears;
  for (const sgn of [-1, 1]) {
    const name = sgn < 0 ? 'earL' : 'earR';
    if (!E) { rig.setBind(name, eyeC.x + sgn * 0.05, eyeC.y, eyeC.z); continue; }
    const c = headPt(E.s);
    const base = c.clone().addScaledVector(SIDE, sgn * hrx(E.s) * 0.72).addScaledVector(uph, hry(E.s) * 0.7);
    const out = E.out * DEG, back = E.back * DEG;
    const dir = new THREE.Vector3().addScaledVector(SIDE, sgn * Math.sin(out))
      .addScaledVector(uph, Math.cos(out) * Math.cos(back)).addScaledVector(hd, -Math.cos(out) * Math.sin(back)).normalize();
    const bend = E.type === 'flap' ? new THREE.Vector3(0, -0.12 * E.len, 0) : dir.clone().cross(SIDE).multiplyScalar(0.06 * E.len * (E.type === 'tube' ? 0 : 1));
    const ctrl = [base.clone().addScaledVector(dir, -0.05 * E.len), base, base.clone().addScaledVector(dir, E.len * 0.5).add(bend), base.clone().addScaledVector(dir, E.len)];
    const nE = rings(8);
    const sp = samplePath(ctrl, nE);
    const rx = [], ry = [];
    for (let i = 0; i < nE; i++) {
      const s = i / (nE - 1);
      let w;
      if (E.type === 'leaf') w = Math.sin(Math.PI * Math.pow(s, 0.62)) * 0.5 * E.w;
      else if (E.type === 'round') w = Math.pow(Math.sin(Math.PI * Math.pow(s, 0.5)), 0.75) * 0.5 * E.w;
      else if (E.type === 'tube') w = (0.6 + 0.4 * Math.sin(Math.PI * s)) * 0.5 * E.w;
      else w = (0.35 + 0.65 * Math.sin(Math.PI * Math.pow(s, 0.85))) * 0.5 * E.w;
      rx.push(Math.max(w, 0.004)); ry.push(E.type === 'tube' ? Math.max(w * 0.6, 0.004) : Math.max(E.thick * (1 - 0.5 * s), 0.003));
    }
    const upHint = E.type === 'flap' ? SIDE.clone().multiplyScalar(sgn) : hd;
    const bone = B[name];
    parts.push(new Tube(sp.out, rx, ry, { part: PART.EAR, segs: segs(10), bone, up: upHint, capEnd: true, capScale: 0.3 }));
    rig.setBind(name, base.x, base.y, base.z);
  }

  // ---------- legs ----------
  // Anatomy: a tapered limb (heavy thigh/shoulder -> slim cannon), a bulge at each joint so the
  // stifle/knee and hock/ankle read as joints, and an explicit foot volume (hoof / paw / elephant pad
  // / bird toes) that flares back out below the fetlock instead of a blunt cylinder end.
  const Lg = Bd.legs, zig = Lg.zig;
  const FOOT = {
    hoof:   { len: 0.055, flare: 1.30, drop: 0.55, wide: 1.00, deep: 1.18, bulge: [0.24, 0.19] },
    pad:    { len: 0.115, flare: 1.55, drop: 0.42, wide: 1.16, deep: 1.00, bulge: [0.20, 0.16] },
    column: { len: 0.105, flare: 1.62, drop: 0.35, wide: 1.10, deep: 1.02, bulge: [0.15, 0.13] },
    bird:   { len: 0.250, flare: 1.15, drop: 0.30, wide: 0.85, deep: 1.00, bulge: [0.22, 0.18] },
  };
  const legPart = (kind, sgn) => {
    const hind = kind === 'hind';
    const L = hind ? Lg.hindY : Lg.foreY, prof = hind ? Lg.hindProf : Lg.foreProf;
    if (!prof || L <= 0) return;
    const FT = FOOT[Lg.foot] || FOOT.hoof;
    const ox = sgn * (hind ? Lg.hindX : Lg.foreX), oz = hind ? zHip : zSh;
    const P = (y, z) => v3(ox, y, oz + z);
    const fl = FT.len * L; // foot length forward of the ankle
    let ctrl, jointIdx;
    if (Lg.foot === 'bird') {
      ctrl = [P(L * 1.12, 0.02 * L), P(L, 0), P(L * 0.72, 0.2 * L), P(L * 0.42, -0.13 * L), P(L * 0.10, -0.01 * L),
        P(0.018, 0.05 * L), P(0.014, fl * 0.55), P(0.012, fl)];
      jointIdx = [1, 2, 3];
    } else if (hind) {
      ctrl = [P(L * 1.15, 0), P(L, 0), P(L * 0.58, 0.21 * L * zig), P(L * 0.29, -0.16 * L * zig), P(L * 0.09, -0.04 * L * zig),
        P(FT.drop * fl * 0.42, 0.01 * L), P(0.004, fl * 0.75)];
      jointIdx = [1, 2, 3];
    } else {
      ctrl = [P(L * 1.12, -0.05 * L * zig), P(L, 0), P(L * 0.60, -0.11 * L * zig), P(L * 0.32, -0.05 * L * zig), P(L * 0.09, -0.02 * L * zig),
        P(FT.drop * fl * 0.42, 0.01 * L), P(0.004, fl * 0.75)];
      jointIdx = [1, 2, 3];
    }
    const nL = rings(Lg.foot === 'bird' ? 20 : 18);
    const sp = samplePath(ctrl, nL);
    const r = Lg.r;
    // radius keys: hip/shoulder, (just below), stifle/knee, hock/ankle, fetlock, ankle-bottom, foot
    const keys = [[sp.sCtrl[0], prof[0] * r], [sp.sCtrl[1], prof[0] * r * 0.95], [sp.sCtrl[2], prof[1] * r],
      [sp.sCtrl[3], prof[2] * r], [sp.sCtrl[4], prof[3] * r], [sp.sCtrl[5], prof[3] * r * 1.04],
      [sp.sCtrl[6], prof[4] * r * FT.flare]];
    if (ctrl.length > 7) keys.push([sp.sCtrl[7], prof[4] * r * FT.flare * 0.55]);
    const sKnee = sp.sCtrl[jointIdx[1]], sHock = sp.sCtrl[jointIdx[2]], sFoot = sp.sCtrl[5];
    const jb = FT.bulge;
    const rx = [], ry = [];
    for (let i = 0; i < nL; i++) {
      const s = i / (nL - 1);
      // joint bulges make the stifle/knee and hock/ankle read as anatomy, not a smooth cone
      const bulge = 1 + jb[0] * Math.exp(-Math.pow((s - sKnee) / 0.11, 2)) + jb[1] * Math.exp(-Math.pow((s - sHock) / 0.085, 2));
      const rad = keyCurve(keys, s) * bulge;
      rx.push(rad); ry.push(rad);
    }
    const shape = (s, th) => {
      // upper limb: narrow across, deep front-to-back (thigh / shoulder mass)
      const thigh = 1 - smoothstep(0, 0.42, s);
      const cannon = smoothstep(0.42, 0.68, s) * (1 - smoothstep(0.86, 1, s));
      let xm = 1 - 0.22 * thigh, ym = 1 + 0.30 * thigh;
      xm *= 1 - 0.08 * cannon; ym *= 1 + 0.14 * cannon;   // cannon bone is oval, not round
      if (s > sFoot - 0.02) {
        const t = smoothstep(sFoot - 0.02, 1, s);
        xm *= 1 + (FT.wide - 1) * t; ym *= 1 + (FT.deep - 1) * t;
        ym *= 1 - 0.30 * t;                                // flatten the sole
      }
      return [xm, ym];
    };
    const names = hind ? (sgn < 0 ? ['hindUpL', 'hindLoL', 'hindFtL'] : ['hindUpR', 'hindLoR', 'hindFtR']) : (sgn < 0 ? ['foreUpL', 'foreLoL', 'foreFtL'] : ['foreUpR', 'foreLoR', 'foreFtR']);
    const joints = [{ bone: B[names[0]], s: 0 }, { bone: B[names[1]], s: sKnee }, { bone: B[names[2]], s: sHock }];
    parts.push(new Tube(sp.out, rx, ry, { part: hind ? PART.HINDLEG : PART.FORELEG, segs: segs(12), joints, blend: 0.05, up: FWD, shape, capEnd: true, capScale: Lg.foot === 'hoof' ? 0.3 : 0.45 }));
    for (let k = 0; k < 3; k++) { const p = ctrl[jointIdx[k]]; rig.setBind(names[k], p.x, p.y, p.z); }
  };
  for (const sgn of [-1, 1]) { legPart('hind', sgn); legPart('fore', sgn); }
  if (!Lg.foreProf) { // biped: park fore-leg bones at the shoulders (wings use them)
    for (const sgn of [-1, 1]) {
      const nm = sgn < 0 ? ['foreUpL', 'foreLoL', 'foreFtL'] : ['foreUpR', 'foreLoR', 'foreFtR'];
      rig.setBind(nm[0], sgn * Bd.chestW * 0.45, cy(zSh) + ryAt(zSh) * 0.3, zSh);
      rig.setBind(nm[1], sgn * Bd.chestW * 0.5, cy(zSh) + ryAt(zSh) * 0.1, zSh - 0.3);
      rig.setBind(nm[2], sgn * Bd.chestW * 0.5, cy(zSh) - ryAt(zSh) * 0.1, zSh - 0.5);
    }
  }

  // ---------- tail ----------
  const T = Bd.tail, ta = T.angle * DEG;
  const tdir = v3(0, -Math.cos(ta), -Math.sin(ta));
  const tailBase = v3(0, cy(zTail) + ryAt(zTail) * 0.7, zTail + 0.06 * Bd.rumpLen);
  const tctrl = [tailBase.clone().addScaledVector(tdir, -0.08 * T.len), tailBase, tailBase.clone().addScaledVector(tdir, T.len * 0.35).add(v3(0, 0, -0.04 * T.len)), tailBase.clone().addScaledVector(tdir, T.len * 0.7).add(v3(0, 0, -0.03 * T.len)), tailBase.clone().addScaledVector(tdir, T.len)];
  const nTl = rings(spec.biped ? 8 : 12);
  const tsp = samplePath(tctrl, nTl);
  const tlRx = [], tlRy = [];
  for (let i = 0; i < nTl; i++) {
    const s = i / (nTl - 1);
    let rad = T.r * (1 - 0.5 * s);
    if (T.tuft > 0 && s > T.tuftStart) { const u = (s - T.tuftStart) / (1 - T.tuftStart); rad += T.tuft * T.r * 2.6 * Math.pow(Math.sin(Math.PI * u), 0.7); }
    tlRx.push(rad); tlRy.push(rad);
  }
  const tailNoise = spec.biped ? (s, th, i, j) => 0.75 + 0.5 * hash(i, j, 9) : (s, th, i, j) => (s > T.tuftStart ? 0.85 + 0.3 * hash(i, j, 7) : 1);
  const tailJoints = [{ bone: B.root, s: 0 }, { bone: B.tail1, s: tsp.sCtrl[1] }, { bone: B.tail2, s: tsp.sCtrl[1] + (1 - tsp.sCtrl[1]) / 3 }, { bone: B.tail3, s: tsp.sCtrl[1] + (1 - tsp.sCtrl[1]) * 2 / 3 }];
  parts.push(new Tube(tsp.out, tlRx, tlRy, { part: PART.TAIL, segs: segs(10), joints: tailJoints, blend: 0.06, up: FWD, noise: tailNoise, capEnd: true, capScale: 0.5 }));
  for (let k = 0; k < 3; k++) { const p = tailBase.clone().addScaledVector(tdir, T.len * k / 3); rig.setBind(['tail1', 'tail2', 'tail3'][k], p.x, p.y, p.z); }

  // ---------- features ----------
  const headLocal = (s, side, up, fwd) => headPt(s).addScaledVector(SIDE, side).addScaledVector(uph, up).addScaledVector(hd, fwd);

  if (F.trunk) {
    const Tr = F.trunk, L = Tr.len, down = v3(0, -1, 0);
    const ctrl = [nose.clone().addScaledVector(hd, -0.12 * H.len), nose.clone().addScaledVector(down, 0.3 * L).addScaledVector(hd, 0.1 * L), nose.clone().addScaledVector(down, 0.62 * L).addScaledVector(hd, 0.15 * L), nose.clone().addScaledVector(down, 0.97 * L).addScaledVector(hd, 0.22 * L)];
    const n = rings(15), sp = samplePath(ctrl, n);
    const rx = [], ry = [];
    for (let i = 0; i < n; i++) { const s = i / (n - 1); const r = lerp(Tr.r0, Tr.r1, Math.pow(s, 0.8)) * (1 + 0.15 * smoothstep(0.9, 1, s)); rx.push(r); ry.push(r * 1.08); }
    const tj = [{ bone: B.head, s: 0 }, { bone: rig.index.trunk1, s: 0.1 }, { bone: rig.index.trunk2, s: 0.33 }, { bone: rig.index.trunk3, s: 0.56 }, { bone: rig.index.trunk4, s: 0.79 }];
    parts.push(new Tube(sp.out, rx, ry, { part: PART.TRUNK, segs: segs(16), joints: tj, blend: 0.06, up: FWD, capEnd: true, capScale: 0.35 }));
    for (let k = 0; k < 4; k++) { const p = catmull(ctrl, tj[k + 1].s); rig.setBind(TRUNK_NAMES[k], p.x, p.y, p.z); }
  }

  if (F.tusks) {
    const Tk = F.tusks, L = Tk.len, down = v3(0, -1, 0);
    for (const sgn of [-1, 1]) {
      let ctrl;
      if (Tk.type === 'warthog') {
        const base = headLocal(0.8, sgn * hrx(0.8) * 0.85, -hry(0.8) * 0.15, 0);
        ctrl = [base.clone().addScaledVector(SIDE, -sgn * 0.05 * L), base, base.clone().addScaledVector(SIDE, sgn * 0.5 * L).addScaledVector(uph, 0.45 * L).addScaledVector(hd, 0.15 * L), base.clone().addScaledVector(SIDE, sgn * 0.75 * L).addScaledVector(uph, 1.0 * L).addScaledVector(hd, -0.15 * L)];
      } else {
        const base = headLocal(0.86, sgn * hrx(0.86) * 0.5, -hry(0.86) * 0.6, 0);
        ctrl = [base.clone().addScaledVector(hd, -0.08 * L), base, base.clone().addScaledVector(SIDE, sgn * 0.07 * L).addScaledVector(down, 0.36 * L).addScaledVector(hd, 0.42 * L), base.clone().addScaledVector(SIDE, sgn * 0.15 * L).addScaledVector(down, 0.44 * L).addScaledVector(hd, 0.8 * L), base.clone().addScaledVector(SIDE, sgn * 0.2 * L).addScaledVector(down, 0.3 * L).addScaledVector(hd, 1.02 * L)];
      }
      const n = rings(9), sp = samplePath(ctrl, n);
      const rx = [], ry = [];
      for (let i = 0; i < n; i++) { const s = i / (n - 1); const r = Tk.r * (1 - 0.7 * Math.pow(s, 1.4)); rx.push(r); ry.push(r); }
      parts.push(new Tube(sp.out, rx, ry, { part: PART.TUSK, segs: segs(9), bone: B.head, up: UP, capEnd: true, capScale: 1.2 }));
    }
  }

  if (F.horns && (male || F.horns.type !== 'lyre')) {
    const Hn = F.horns, L = Hn.len;
    const hornTube = (ctrl, r, taper = 0.85, part = PART.HORN, ringsN = 10) => {
      const n = rings(ringsN), sp = samplePath(ctrl, n);
      const rx = [], ry = [];
      for (let i = 0; i < n; i++) { const s = i / (n - 1); const rr = r * (1 - taper * Math.pow(s, 1.3)); rx.push(rr); ry.push(rr); }
      parts.push(new Tube(sp.out, rx, ry, { part, segs: segs(10), bone: B.head, up: UP, capEnd: true, capScale: 1.0 }));
    };
    if (Hn.type === 'rhino') {
      const b1 = headLocal(0.84, 0, hry(0.84) * 0.85, 0);
      hornTube([b1.clone().addScaledVector(uph, -0.1 * L), b1, b1.clone().addScaledVector(uph, 0.5 * L).addScaledVector(hd, -0.06 * L), b1.clone().addScaledVector(uph, 0.95 * L).addScaledVector(hd, -0.25 * L)], Hn.r, 0.9);
      const b2 = headLocal(0.58, 0, hry(0.58) * 0.9, 0);
      hornTube([b2.clone().addScaledVector(uph, -0.05 * L), b2, b2.clone().addScaledVector(uph, 0.2 * L).addScaledVector(hd, -0.03 * L), b2.clone().addScaledVector(uph, 0.36 * L).addScaledVector(hd, -0.08 * L)], Hn.r * 0.7, 0.9, PART.HORN, 6);
    } else {
      for (const sgn of [-1, 1]) {
        const S = (x, y, z) => new THREE.Vector3().addScaledVector(SIDE, sgn * x * L).addScaledVector(uph, y * L).addScaledVector(hd, z * L);
        let ctrl;
        if (Hn.type === 'buffalo') {
          const base = headLocal(0.12, sgn * hrx(0.12) * 0.35, hry(0.12) * 0.85, 0);
          ctrl = [base.clone().add(S(-0.15, 0.05, 0)), base, base.clone().add(S(0.45, -0.28, 0.04)), base.clone().add(S(0.8, -0.42, 0.16)), base.clone().add(S(0.96, 0.02, 0.32)), base.clone().add(S(0.82, 0.42, 0.42))];
        } else if (Hn.type === 'wildebeest') {
          const base = headLocal(0.14, sgn * hrx(0.14) * 0.4, hry(0.14) * 0.85, 0);
          ctrl = [base.clone().add(S(-0.1, 0, 0)), base, base.clone().add(S(0.5, -0.12, 0.12)), base.clone().add(S(0.9, 0.0, 0.22)), base.clone().add(S(1.0, 0.42, 0.14)), base.clone().add(S(0.85, 0.68, 0.04)) ];
        } else { // lyre (impala)
          const base = headLocal(0.1, sgn * hrx(0.1) * 0.45, hry(0.1) * 0.85, 0);
          ctrl = [base.clone().add(S(0, -0.05, 0.02)), base, base.clone().add(S(0.12, 0.35, -0.22)), base.clone().add(S(0.32, 0.65, -0.36)), base.clone().add(S(0.36, 0.92, -0.22)), base.clone().add(S(0.22, 1.08, 0.02))];
        }
        hornTube(ctrl, Hn.r, Hn.type === 'lyre' ? 0.75 : 0.88);
      }
    }
  }

  if (F.ossicones) {
    const O = F.ossicones;
    for (const sgn of [-1, 1]) {
      const base = headLocal(0.16, sgn * hrx(0.16) * 0.42, hry(0.16) * 0.8, 0);
      const dir = new THREE.Vector3().addScaledVector(uph, 0.95).addScaledVector(hd, -0.28).addScaledVector(SIDE, sgn * 0.08).normalize();
      const ctrl = [base.clone().addScaledVector(dir, -0.1 * O.len), base, base.clone().addScaledVector(dir, O.len * 0.6), base.clone().addScaledVector(dir, O.len)];
      const n = rings(6), sp = samplePath(ctrl, n);
      const rx = [], ry = [];
      for (let i = 0; i < n; i++) { const s = i / (n - 1); const r = O.r * (0.9 + 0.45 * smoothstep(0.6, 1, s)); rx.push(r); ry.push(r); }
      parts.push(new Tube(sp.out, rx, ry, { part: PART.OSSICONE, segs: segs(8), bone: B.head, up: hd, capEnd: true, capScale: 0.9 }));
    }
  }

  if (mane && mane.type === 'full' && male) {
    const R = mane.r;
    const ctrl = [neckBase.clone().addScaledVector(nd, -N.len * 0.35).addScaledVector(UP, 0.02), neckBase.clone().addScaledVector(nd, N.len * 0.3), neckEnd.clone(), headPt(0.42)];
    const n = rings(11), sp = samplePath(ctrl, n);
    const rx = [], ry = [];
    for (let i = 0; i < n; i++) { const s = i / (n - 1); const r = R * (0.55 + 0.6 * Math.pow(Math.sin(Math.PI * Math.pow(s, 0.8)), 0.7)); rx.push(r * 0.95); ry.push(r); }
    const mj = [{ bone: B.chest, s: 0 }, { bone: B.neck1, s: 0.25 }, { bone: B.neck2, s: 0.45 }, { bone: B.neck3, s: 0.62 }, { bone: B.head, s: 0.82 }];
    const shape = (s, th) => { const ct = Math.cos(th); return [1, ct < 0 ? 1.28 : 0.92]; };
    const noise = (s, th, i, j) => 0.8 + 0.42 * hash(i, j, 11) + 0.15 * Math.sin(th * 9 + i * 1.7);
    parts.push(new Tube(sp.out, rx, ry, { part: PART.MANE, segs: segs(26), joints: mj, blend: 0.1, up: UP, shape, noise, capStart: true, capEnd: false, capScale: 0.5 }));
  }

  if (F.beard) {
    const bl = F.beard.len;
    const ctrl = [headLocal(0.78, 0, -hry(0.78) * 0.9 - bl * 0.45, 0), headLocal(0.5, 0, -hry(0.5) * 0.95 - bl * 0.5, 0), headLocal(0.15, 0, -hry(0.15) * 0.95 - bl * 0.5, 0), neckBase.clone().addScaledVector(nd, N.len * 0.55).addScaledVector(nperp, -N.r0 * 0.9 - bl * 0.45)];
    const n = rings(9), sp = samplePath(ctrl, n);
    const rx = [], ry = [];
    for (let i = 0; i < n; i++) { const s = i / (n - 1); rx.push(0.02 + 0.015 * Math.sin(Math.PI * s)); ry.push(bl * 0.5 * (0.6 + 0.4 * Math.sin(Math.PI * s))); }
    const bj = [{ bone: B.head, s: 0 }, { bone: B.neck3, s: 0.62 }, { bone: B.neck2, s: 0.85 }];
    parts.push(new Tube(sp.out, rx, ry, { part: PART.BEARD, segs: segs(8), joints: bj, blend: 0.08, up: v3(0, -1, 0), noise: (s, th, i, j) => 0.7 + 0.6 * hash(i, j, 13), capStart: true, capEnd: true, capScale: 0.3 }));
  }

  if (F.wings) {
    const W = F.wings;
    for (const sgn of [-1, 1]) {
      const base = v3(sgn * Bd.chestW * 0.42, cy(zSh) + ryAt(zSh) * 0.35, zSh + 0.05);
      const dir = v3(sgn * 0.3, -0.42, -1).normalize();
      const ctrl = [base, base.clone().addScaledVector(dir, W.len * 0.5).add(v3(sgn * 0.08, 0.03, 0)), base.clone().addScaledVector(dir, W.len)];
      const n = rings(9), sp = samplePath(ctrl, n);
      const rx = [], ry = [];
      for (let i = 0; i < n; i++) { const s = i / (n - 1); rx.push(Math.max(0.01, W.w * 0.5 * Math.sin(Math.PI * Math.pow(s, 0.7)))); ry.push(0.06 * (1 - 0.6 * s)); }
      const bone = sgn < 0 ? B.foreUpL : B.foreUpR;
      parts.push(new Tube(sp.out, rx, ry, { part: PART.WING, segs: segs(10), bone, up: SIDE.clone().multiplyScalar(sgn), noise: (s, th, i, j) => 0.85 + 0.3 * hash(i, j, 17), capEnd: true, capScale: 0.4 }));
    }
  }

  rig.finalize();

  // ---------- atlas + merge ----------
  packAtlas(parts, 1024, 6);
  const built = parts.map((p) => p.build());
  const geometry = mergeParts(built);

  const dims = {
    shoulderH: Bd.shoulderH, hipH: Bd.hipH, bodyLen: Bd.bodyLen, length: zNeck - zTail + N.len * Math.cos(na) + H.len,
    legLen: Math.max(Lg.hindY, Lg.foreY || 0), rootY: cy(zHip), bellyY: bellyY(zMid), chestY: cy(zSh),
    lieY: (Bd.bellyDepth) * 0.5 + 0.05, radius: Math.max(Bd.bodyLen, Bd.chestW) * 0.6, neckLen: N.len, headLen: H.len,
    neckAngle: na, headAngle: ha, noseY: nose.y,
  };
  return { geometry, rig, eyes, dims, partCount: parts.length, triangles: geometry.index.count / 3 };
}
