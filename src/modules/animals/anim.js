// Procedural skeletal animation. evalPose() writes per-bone XYZ euler rotations (radians) and a few
// bone offsets into the animal's Float32Arrays — no allocation. Layers: gait (walk ↔ gallop blend,
// lateral-sequence walk / transverse gallop phase offsets), body bounce & spine flex, head/neck targets
// (graze, drink, alert, sleep, look), lying/sleeping pose, tail swish, ear flicks, breathing, chewing,
// elephant trunk cycle. Every layer is weighted by blend factors the behaviour eases in update().
import { B } from './rig.js';

const DEG = Math.PI / 180;
const PI2 = Math.PI * 2;

/**
 * Per-species animation tuning. Elevations in degrees (0 = horizontal, negative = pointing down):
 * grazeNeck/grazeHead, drinkNeck/drinkHead = target elevations of neck axis / head axis.
 * lie: 'sphinx' (cats, ungulates) | 'stand' (sleep standing) ; legAmp = stride angle multiplier.
 */
export const ANIM = {
  elephant:   { grazeNeck: 2, grazeHead: -40, drinkNeck: -6, drinkHead: -52, legAmp: 0.55, lie: 'sphinx', sleepStand: true, stride: 1.9, trunk: true, sway: 0.35 },
  giraffe:    { grazeNeck: 58, grazeHead: -5, drinkNeck: -52, drinkHead: -95, legAmp: 0.6, lie: 'sphinx', sleepStand: true, stride: 2.2, splay: 0.55, nod: true },
  zebra:      { grazeNeck: -48, grazeHead: -95, drinkNeck: -46, drinkHead: -95, legAmp: 1.0, lie: 'sphinx', sleepStand: true, stride: 1.8 },
  wildebeest: { grazeNeck: -52, grazeHead: -95, drinkNeck: -50, drinkHead: -95, legAmp: 1.0, lie: 'sphinx', sleepStand: false, stride: 1.8 },
  buffalo:    { grazeNeck: -46, grazeHead: -92, drinkNeck: -44, drinkHead: -92, legAmp: 0.85, lie: 'sphinx', sleepStand: false, stride: 1.8 },
  lion:       { grazeNeck: -35, grazeHead: -80, drinkNeck: -38, drinkHead: -80, legAmp: 1.0, lie: 'sphinx', sleepStand: false, stride: 2.0 },
  cheetah:    { grazeNeck: -35, grazeHead: -80, drinkNeck: -40, drinkHead: -80, legAmp: 1.1, lie: 'sphinx', sleepStand: false, stride: 2.3 },
  hippo:      { grazeNeck: -18, grazeHead: -60, drinkNeck: -18, drinkHead: -60, legAmp: 0.7, lie: 'sphinx', sleepStand: false, stride: 1.7 },
  rhino:      { grazeNeck: -26, grazeHead: -62, drinkNeck: -28, drinkHead: -64, legAmp: 0.65, lie: 'sphinx', sleepStand: false, stride: 1.8 },
  warthog:    { grazeNeck: -30, grazeHead: -75, drinkNeck: -32, drinkHead: -75, legAmp: 1.0, lie: 'sphinx', sleepStand: false, stride: 1.9, kneel: true },
  ostrich:    { grazeNeck: -55, grazeHead: -100, drinkNeck: -55, drinkHead: -100, legAmp: 1.0, lie: 'sphinx', sleepStand: false, stride: 2.4, biped: true },
  impala:     { grazeNeck: -48, grazeHead: -95, drinkNeck: -48, drinkHead: -95, legAmp: 1.05, lie: 'sphinx', sleepStand: false, stride: 2.0 },
};

// leg phase offsets: [hindL, foreL, hindR, foreR]
const WALK_OFF = [0, 0.25, 0.5, 0.75];
const GALLOP_OFF = [0, 0.5, 0.12, 0.62];
const LEGS = [
  [B.hindUpL, B.hindLoL, B.hindFtL, true],
  [B.foreUpL, B.foreLoL, B.foreFtL, false],
  [B.hindUpR, B.hindLoR, B.hindFtR, true],
  [B.foreUpR, B.foreLoR, B.foreFtR, false],
];

function smooth(t) { return t * t * (3 - 2 * t); }
function fract(x) { return x - Math.floor(x); }
function lerp(a, b, t) { return a + (b - a) * t; }

function flick(t0, t) {
  const d = t - t0;
  if (d < 0 || d > 0.45) return 0;
  return Math.sin(d * 22) * Math.exp(-d * 7) * 0.7;
}

/**
 * a: animal runtime record; spec: species; dims: builder dims; rig: Rig; t: seconds.
 * Writes a._rot (count*3) and a._off (count*3).
 */
export function evalPose(a, spec, dims, rig, t) {
  const rot = a._rot, off = a._off;
  rot.fill(0); off.fill(0);
  const P = ANIM[spec.id] || ANIM.zebra;
  const idx = rig.index;
  const H = dims.shoulderH;
  const seed = a._seed * PI2;
  const move = a._moveW, run = a._runW, lie = a._lieW, sleep = a._sleepW, alert = a._alertW, graze = a._headDown, drink = a._drinkW;
  const up = 1 - lie;
  const r3 = (b, x, y, z) => { rot[b * 3] += x; rot[b * 3 + 1] += y; rot[b * 3 + 2] += z; };
  const rx = (b, x) => { rot[b * 3] += x; };

  // ---------------- gait ----------------
  const ph = a._phase;
  const stance = lerp(0.62, 0.38, run);
  const A = lerp(0.3, 0.55, run) * P.legAmp;
  const K = lerp(0.65, 1.15, run) * P.legAmp;
  const gaitW = move * up;
  for (let i = 0; i < 4; i++) {
    const [upB, loB, ftB, hind] = LEGS[i];
    if (!hind && P.biped) continue;
    let offset = P.biped ? (hind ? (i === 0 ? 0 : 0.5) : 0) : lerp(WALK_OFF[i], GALLOP_OFF[i], run);
    const p = fract(ph + offset);
    let hip, knee;
    if (p < stance) { const u = p / stance; hip = lerp(A, -A, u); knee = 0.1 * Math.sin(Math.PI * u) * (hind ? 1 : 0.5); }
    else { const u = (p - stance) / (1 - stance); hip = lerp(-A, A, smooth(u)); knee = K * Math.sin(Math.PI * u); }
    if (hind) {
      r3(upB, -hip * gaitW, 0, 0);
      rx(loB, knee * 1.0 * gaitW);
      rx(ftB, -knee * 0.85 * gaitW);
    } else {
      r3(upB, -hip * gaitW, 0, 0);
      rx(loB, -knee * 0.4 * gaitW);
      rx(ftB, knee * 1.15 * gaitW);
    }
  }
  // body bounce / spine flex
  const walkBob = Math.sin(ph * 2 * PI2) * 0.012 * H * (1 - run);
  const runBob = Math.sin(ph * PI2 + 0.6) * 0.045 * H * run;
  off[B.root * 3 + 1] += (walkBob + runBob) * gaitW;
  const flex = Math.sin(ph * PI2) * run * gaitW;
  rx(B.root, 0.07 * flex);
  rx(B.spine1, -0.05 * Math.sin(ph * PI2 + 0.4) * run * gaitW);
  rx(B.chest, -0.04 * flex);
  rot[B.root * 3 + 2] += 0.018 * Math.sin(ph * PI2) * gaitW * (1 - run);
  // head nod with gait
  rx(B.head, 0.035 * Math.sin(ph * 2 * PI2 + 1) * gaitW);
  if (P.nod) rx(B.neck1, 0.05 * Math.sin(ph * PI2) * gaitW);
  else rx(B.neck2, 0.02 * Math.sin(ph * 2 * PI2) * gaitW);

  // ---------------- neck / head targets ----------------
  const naDeg = dims.neckAngle / DEG, pitchDeg = (dims.neckAngle - dims.headAngle) / DEG;
  const neckRot = (elev) => (naDeg - elev) * DEG;
  const headRot = (neckElev, headElev) => (neckElev - pitchDeg - headElev) * DEG;
  const gN = neckRot(P.grazeNeck) * graze, gH = headRot(P.grazeNeck, P.grazeHead) * graze;
  const dN = neckRot(P.drinkNeck) * drink, dH = headRot(P.drinkNeck, P.drinkHead) * drink;
  const nTot = gN * (1 - drink) + dN, hTot = gH * (1 - drink) + dH;
  rx(B.neck1, nTot * 0.3); rx(B.neck2, nTot * 0.35); rx(B.neck3, nTot * 0.35); rx(B.head, hTot);
  if (P.splay) { rot[B.foreUpL * 3 + 2] += P.splay * drink; rot[B.foreUpR * 3 + 2] -= P.splay * drink; off[B.root * 3 + 1] -= 0.18 * drink; }
  if (P.kneel) { rx(B.foreUpL, 1.2 * graze); rx(B.foreLoL, -2.2 * graze); rx(B.foreUpR, 1.2 * graze); rx(B.foreLoR, -2.2 * graze); off[B.root * 3 + 1] -= 0.16 * graze; rx(B.root, 0.25 * graze); }
  // alert: neck up, head up, still
  rx(B.neck1, -0.12 * alert); rx(B.neck2, -0.1 * alert); rx(B.neck3, -0.08 * alert); rx(B.head, -0.18 * alert);
  // look around (yaw)
  rot[B.neck3 * 3 + 1] += a._lookYaw * 0.35; rot[B.head * 3 + 1] += a._lookYaw * 0.65;
  // sleep: droop (standing) or curl (lying)
  const sleepDroop = sleep * (P.sleepStand ? (1 - lie) : 1);
  rx(B.neck1, 0.12 * sleepDroop); rx(B.neck2, 0.16 * sleepDroop); rx(B.neck3, 0.14 * sleepDroop); rx(B.head, 0.3 * sleepDroop);
  const curl = sleep * lie;
  rot[B.neck2 * 3 + 1] += 0.45 * curl; rot[B.neck3 * 3 + 1] += 0.55 * curl; rx(B.neck2, 0.25 * curl); rx(B.neck3, 0.3 * curl);
  // chewing when grazing
  rx(B.jaw, 0.1 * Math.max(0, Math.sin(t * 6.5 + seed)) * graze * (1 - drink));

  // ---------------- lying ----------------
  if (lie > 0) {
    off[B.root * 3 + 1] -= (dims.rootY - dims.lieY) * lie;
    rx(B.root, 0.03 * lie);
    if (!P.biped) {
      for (const [upB, loB, ftB, hind] of LEGS) {
        if (hind) {
          const side = upB === B.hindUpL ? -1 : 1;
          rot[upB * 3] += -1.25 * lie; rot[upB * 3 + 2] += side * 0.42 * lie;
          rx(loB, 2.35 * lie); rx(ftB, -0.95 * lie);
        } else {
          rx(upB, 1.05 * lie); rx(loB, -2.25 * lie); rx(ftB, 1.05 * lie);
        }
      }
    } else {
      for (const [upB, loB, ftB, hind] of LEGS) if (hind) { rx(upB, -1.2 * lie); rx(loB, 2.4 * lie); rx(ftB, -1.2 * lie); }
    }
  }

  // ---------------- tail ----------------
  const sw = Math.sin(t * 1.7 + seed) * 0.28 + Math.sin(t * 3.3 + seed * 2) * 0.1;
  const tailW = P.biped ? 0.15 : 1;
  rot[B.tail1 * 3 + 1] += sw * 0.5 * tailW; rot[B.tail2 * 3 + 1] += sw * 0.7 * tailW; rot[B.tail3 * 3 + 1] += sw * 0.8 * tailW;
  rx(B.tail1, (0.12 * move + 0.5 * run * move) * tailW);
  rx(B.tail2, 0.3 * run * move * tailW);
  rx(B.tail1, 0.9 * lie); rx(B.tail2, 0.3 * lie);
  rx(B.tail1, 0.02 * Math.sin(t * 2.1 + seed));

  // ---------------- ears ----------------
  const fl = flick(a._earFlickL, t), fr = flick(a._earFlickR, t);
  r3(B.earL, fl * 0.5, 0, fl * 0.6); r3(B.earR, fr * 0.5, 0, -fr * 0.6);
  rx(B.earL, -0.35 * alert); rx(B.earR, -0.35 * alert);
  rot[B.earL * 3 + 2] += 0.3 * sleep; rot[B.earR * 3 + 2] -= 0.3 * sleep;
  if (P.trunk) { // elephant ears flap slowly
    const fan = Math.sin(t * 0.9 + seed) * 0.12 + 0.04 * Math.sin(t * 2.7 + seed);
    rot[B.earL * 3 + 1] += fan; rot[B.earR * 3 + 1] -= fan;
  }

  // ---------------- breathing ----------------
  const br = Math.sin(t * 1.4 + seed);
  rx(B.chest, 0.006 * br * (1 - move));
  off[B.chest * 3 + 1] += 0.003 * H * br * (1 - move);

  // ---------------- trunk ----------------
  if (P.trunk && idx.trunk1 !== undefined) {
    const t1 = idx.trunk1, t2 = idx.trunk2, t3 = idx.trunk3, t4 = idx.trunk4;
    const sway = Math.sin(t * 0.7 + seed) * 0.12 * (1 - move) + Math.sin(ph * PI2) * 0.1 * move;
    rot[t1 * 3 + 1] += sway * 0.4; rot[t2 * 3 + 1] += sway * 0.5;
    rx(t2, 0.12); rx(t3, 0.2); rx(t4, 0.32);
    const w = Math.max(graze, drink);
    if (w > 0) {
      const c = fract(t * 0.11 + a._seed);
      let reach = 0, curlK = 0;
      if (c < 0.3) reach = smooth(c / 0.3);
      else if (c < 0.45) { reach = 1; curlK = smooth((c - 0.3) / 0.15); }
      else if (c < 0.7) { reach = 1 - smooth((c - 0.45) / 0.25) * 0.4; curlK = 1; }
      else { reach = 0.6 * (1 - smooth((c - 0.7) / 0.3)); curlK = 1 - smooth((c - 0.7) / 0.3); }
      rx(t1, -0.15 * reach * w); rx(t2, 0.2 * reach * w);
      rx(t2, 0.75 * curlK * w); rx(t3, 1.1 * curlK * w); rx(t4, 0.9 * curlK * w);
      rot[t3 * 3 + 1] += 0.3 * curlK * w;
    }
    rx(t1, -0.2 * alert); rx(t2, -0.3 * alert);
  }
}
