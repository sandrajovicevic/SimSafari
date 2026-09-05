// One vehicle's runtime state + per-frame kinematics: road following with a left-hand lane offset,
// speed by road kind with junction/bend/car-following slowdowns, wheel-contact suspension (pitch +
// roll from four independent world.getHeight samples, plus a dirt-road bob), wheel spin, and pushing
// the resulting pose into VehicleKit's instance pools. Allocation-free after spawn: every Vector3/
// Quaternion/Matrix4 a vehicle needs is created once in `createVehicle` and mutated thereafter; the
// module-level `_scratch*` temporaries below are reused serially across vehicles within one frame.
import * as THREE from 'three';
import { KINDS, CLOTHING_COLORS, SKIN_TONES, roadSpeedKmh } from './kinds.js';
import { sampleEdge, getLanes, getEdge, getNode, route as routeBetween, nodesOf, randomReachableNode } from './graph.js';

const UP = new THREE.Vector3(0, 1, 0);
const FWD_LOCAL = new THREE.Vector3(0, 0, 1);
const SPIN_AXIS = new THREE.Vector3(1, 0, 0);
// Wheel geometry's spin axis (its flat-face normal) is local +X. A road wheel keeps that axis lateral
// (see the non-spare branch below); a spare mounted flush against the tailgate needs its face normal
// turned to point along the body's Z instead — a rotation about Y, not Z.
const SPARE_TILT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
const ONE = new THREE.Vector3(1, 1, 1);

// module-level scratch, reused serially within one poseVehicle()/updateVehicle() call — never held
// across frames or across vehicles.
const _yawQ = new THREE.Quaternion();
const _tmpV = new THREE.Vector3();
const _center = new THREE.Vector3();
const _left = new THREE.Vector3();
const _fwd3 = new THREE.Vector3();
const _right3 = new THREE.Vector3();
const _up3 = new THREE.Vector3();
const _mat = new THREE.Matrix4();
const _spinQ = new THREE.Quaternion();
const _seatQ = new THREE.Quaternion();
const _wheelQ = new THREE.Quaternion();
const _bodyQ = new THREE.Quaternion();
const _wheelScale = new THREE.Vector3();
const _spareScale = new THREE.Vector3();
const _wpFL = new THREE.Vector3(), _wpFR = new THREE.Vector3(), _wpRL = new THREE.Vector3(), _wpRR = new THREE.Vector3();

const BRAKE_DIST = 16;      // m — start slowing this far from a junction
const FOLLOW_GAP = 9;       // m — desired bumper-to-bumper gap while car-following
const LOOKAHEAD = 26;       // m — how far ahead a vehicle scans for one to follow / a bend to read

let nextSeq = 1;

function leftOf(tangent, out) { return out.set(tangent.z, 0, -tangent.x).normalize(); }

export function createVehicle(ctx, kit, graph, id, kind, edgeId, s, forward, opts = {}) {
  const kindDef = KINDS[kind];
  const rng = ctx.rng.fork('vehicle' + id);
  const colorIdx = opts.colorIdx ?? rng.int(0, kindDef.paints.length - 1);
  const seatCount = opts.seatCount ?? (opts.tour ? kindDef.seats : rng.int(0, kindDef.seats));
  const handle = kit.spawn(kind, colorIdx, seatCount);
  if (!handle) return null;

  const v = {
    id, kind, edge: edgeId, s, x: 0, z: 0, y: 0, heading: 0, passengers: [],
    _seq: nextSeq++, _rng: rng, _kindDef: kindDef, _handle: handle, _colorIdx: colorIdx,
    _forward: forward, _speed: 0, _targetSpeed: 0,
    _state: 'drive', _stopTimer: 0, _sightAnimalId: null, _sightYaw: 0, _sightCooldown: 0, _paceMul: 1,
    _route: [], _routeIdx: 0, _tour: opts.tour || null,
    _wheelRot: 0, _bobPhase: rng.float() * 10,
    _dustTimer: rng.float() * 0.4,
    _pos: new THREE.Vector3(), _quat: new THREE.Quaternion(),
    _sample: { position: new THREE.Vector3(), tangent: new THREE.Vector3() },
    _sample2: { position: new THREE.Vector3(), tangent: new THREE.Vector3() },
    _audio: { x: 0, z: 0, rpm: 900, load: 0.3 },
    _dustDir: { x: 0, z: 1 },
    _spot: null, // assigned/cleared by index.js's night-spotlight pass
  };

  const n = handle.model.seatMounts.length + (handle.model.driverMount ? 1 : 0);
  const wantSeats = Math.min(seatCount + (handle.model.driverMount ? 1 : 0), n);
  for (let i = 0; i < wantSeats; i++) {
    const skin = rng.pick(SKIN_TONES), cloth = rng.pick(CLOTHING_COLORS);
    kit.setSeatColors(handle, i, skin, cloth);
    v.passengers.push(cloth);
  }
  sampleEdge(graph, v.edge, v.s, v._sample);
  poseVehicle(ctx, kit, graph, v);
  return v;
}

/** Turn a { nodes, edges } route into a flat [{ edgeId, forward }] step list. */
function planSteps(graph, r) {
  const steps = [];
  for (let i = 0; i < r.edges.length; i++) {
    const e = getEdge(graph, r.edges[i]);
    steps.push({ edgeId: e.id, forward: e.a === r.nodes[i] });
  }
  return steps;
}

/** Give a vehicle a fresh multi-edge route to follow (used by ambient traffic and by tours.js). */
export function planRouteTo(graph, v, targetNode) {
  const here = v._forward ? getEdge(graph, v.edge)?.b : getEdge(graph, v.edge)?.a;
  if (!here) return false;
  const r = routeBetween(graph, here, targetNode);
  if (!r || !r.edges.length) return false;
  v._route = planSteps(graph, r);
  v._routeIdx = 0;
  return true;
}

function planRandomRoute(graph, v) {
  const here = v._forward ? getEdge(graph, v.edge)?.b : getEdge(graph, v.edge)?.a;
  if (!here) return;
  const target = randomReachableNode(graph, here, v._rng);
  planRouteTo(graph, v, target);
}

function advanceEdge(graph, v) {
  if (v._routeIdx < v._route.length) {
    const step = v._route[v._routeIdx++];
    v.edge = step.edgeId; v._forward = step.forward; v.s = step.forward ? 0 : getEdge(graph, step.edgeId).length;
    return;
  }
  if (v._tour) { v._tour.needsAdvance = true; return; } // tours.js decides what happens next
  const e = getEdge(graph, v.edge);
  const endNode = v._forward ? e.b : e.a;
  const deg = getNode(graph, endNode)?.edges.length ?? 0;
  if (deg <= 1) { v._forward = !v._forward; return; } // reverse on a dead end
  planRandomRoute(graph, v);
  if (v._routeIdx < v._route.length) {
    const step = v._route[v._routeIdx++];
    v.edge = step.edgeId; v._forward = step.forward; v.s = step.forward ? 0 : getEdge(graph, step.edgeId).length;
    return;
  }
  v._forward = !v._forward; // disconnected graph — reverse rather than stall
}

function bendSlowdown(graph, v, e) {
  const here = v._forward ? v.s : e.length - v.s;
  const aheadS = Math.min(e.length, here + LOOKAHEAD);
  sampleEdge(graph, e.id, v._forward ? aheadS : e.length - aheadS, v._sample2);
  const a = v._sample.tangent, b = v._sample2.tangent;
  const cos = THREE.MathUtils.clamp(a.x * b.x + a.z * b.z, -1, 1);
  const angle = Math.acos(cos);
  return THREE.MathUtils.clamp(1 - angle / 0.55, 0.35, 1);
}

function junctionSlowdown(graph, v, e) {
  const remaining = v._forward ? e.length - v.s : v.s;
  if (remaining > BRAKE_DIST) return 1;
  const endNode = v._forward ? e.b : e.a;
  const deg = getNode(graph, endNode)?.edges.length ?? 2;
  if (deg < 3) return 1;
  const t = THREE.MathUtils.clamp(remaining / BRAKE_DIST, 0, 1);
  return 0.4 + 0.6 * t;
}

// reused across calls — read synchronously by the caller immediately after carFollowingSlowdown()
// returns, never held past that, so one shared mutable object is safe and allocation-free.
const _cf = { factor: 1, cap: Infinity };

function carFollowingSlowdown(v, all) {
  let nearestGap = Infinity, nearestSpeed = 999;
  for (let i = 0; i < all.length; i++) {
    const o = all[i];
    if (o === v || o.edge !== v.edge || o._forward !== v._forward) continue;
    const ds = v._forward ? o.s - v.s : v.s - o.s;
    if (ds > 0 && ds < nearestGap) { nearestGap = ds; nearestSpeed = o._speed; }
  }
  if (nearestGap === Infinity || nearestGap >= LOOKAHEAD) { _cf.factor = 1; _cf.cap = Infinity; return _cf; }
  if (nearestGap < FOLLOW_GAP * 0.5) { _cf.factor = 0; _cf.cap = 0; return _cf; }
  _cf.factor = THREE.MathUtils.clamp((nearestGap - FOLLOW_GAP * 0.5) / (LOOKAHEAD - FOLLOW_GAP * 0.5), 0, 1);
  _cf.cap = nearestSpeed + 1.5;
  return _cf;
}

/** Advance one vehicle by dt. `all` is the live vehicle list (for car-following). */
export function updateVehicle(ctx, kit, graph, v, all, dt, dustCooldown, audioApi) {
  if (v._state === 'stopped' || v._state === 'sighting') {
    v._speed = Math.max(0, v._speed - v._kindDef.decel * dt * 2);
    poseVehicle(ctx, kit, graph, v);
    if (audioApi) { v._audio.x = v.x; v._audio.z = v.z; v._audio.rpm = 700; v._audio.load = 0.15; audioApi.engine(v.id, v._audio); }
    return;
  }
  const e = getEdge(graph, v.edge);
  if (!e) return;
  const baseKmh = roadSpeedKmh(e.kind);
  let target = (baseKmh / 3.6) * v._kindDef.speedMul * (v._paceMul || 1);
  target *= bendSlowdown(graph, v, e);
  target *= junctionSlowdown(graph, v, e);
  const cf = carFollowingSlowdown(v, all);
  target = Math.max(0, Math.min(target * cf.factor, cf.cap));
  const rate = v._speed < target ? v._kindDef.accel : v._kindDef.decel;
  v._speed = Math.max(0, v._speed + THREE.MathUtils.clamp(target - v._speed, -rate * dt, rate * dt));

  v.s += v._forward ? v._speed * dt : -v._speed * dt;
  if ((v._forward && v.s >= e.length) || (!v._forward && v.s <= 0)) advanceEdge(graph, v);
  const curLen = getEdge(graph, v.edge)?.length ?? v.s;
  v.s = THREE.MathUtils.clamp(v.s, 0, curLen);

  v._wheelRot += (v._speed / Math.max(0.05, v._handle.model.wheelR)) * dt;
  v._bobPhase += v._speed * dt * 2.4;

  poseVehicle(ctx, kit, graph, v);

  const effects = ctx.modules.get('effects');
  const kindNow = getEdge(graph, v.edge)?.kind;
  if (effects && kindNow === 'dirt' && v._speed > 1.2) {
    v._dustTimer -= dt;
    if (v._dustTimer <= 0) {
      v._dustTimer = dustCooldown;
      v._dustDir.x = -_fwd3.x; v._dustDir.z = -_fwd3.z;
      effects.spawnDust(v.x - _fwd3.x * 1.5, v.z - _fwd3.z * 1.5, 1, v._dustDir);
    }
  }
  if (audioApi) {
    v._audio.x = v.x; v._audio.z = v.z;
    v._audio.rpm = 750 + Math.min(1, v._speed / 14) * 1800;
    v._audio.load = v._speed < target - 0.5 ? 0.85 : 0.35;
    audioApi.engine(v.id, v._audio);
  }
}

/** Sample the road, apply the lane offset, align to the four wheel-contact heights (slope + bob),
 * spin the wheels, aim the seats, and push every resulting matrix into the instance pools. */
export function poseVehicle(ctx, kit, graph, v) {
  const world = ctx.world;
  const model = v._handle.model;
  const s = sampleEdge(graph, v.edge, v.s, v._sample);
  if (!s) return;

  leftOf(s.tangent, _left);
  const lanes = getLanes(graph, v.edge);
  const lane = lanes ? lanes.lanes[v._forward ? 0 : 1] : { offset: 0 };
  const centerX = s.position.x + _left.x * lane.offset;
  const centerZ = s.position.z + _left.z * lane.offset;
  _center.set(centerX, 0, centerZ);

  _fwd3.set(v._forward ? s.tangent.x : -s.tangent.x, 0, v._forward ? s.tangent.z : -s.tangent.z);
  if (_fwd3.lengthSq() < 1e-8) _fwd3.set(0, 0, 1);
  _fwd3.normalize();
  _yawQ.setFromUnitVectors(FWD_LOCAL, _fwd3);

  // sample the four wheel-contact points to derive slope + suspension pitch/roll
  const mounts = model.wheelMounts;
  const fl = mounts[0], fr = mounts[1], rl = mounts[2], rr = mounts[3];
  _wpFL.set(fl.x, 0, fl.z).applyQuaternion(_yawQ).add(_center);
  _wpFR.set(fr.x, 0, fr.z).applyQuaternion(_yawQ).add(_center);
  _wpRL.set(rl.x, 0, rl.z).applyQuaternion(_yawQ).add(_center);
  _wpRR.set(rr.x, 0, rr.z).applyQuaternion(_yawQ).add(_center);
  const hFL = world.getHeight(_wpFL.x, _wpFL.z), hFR = world.getHeight(_wpFR.x, _wpFR.z);
  const hRL = world.getHeight(_wpRL.x, _wpRL.z), hRR = world.getHeight(_wpRR.x, _wpRR.z);
  const avgY = (hFL + hFR + hRL + hRR) / 4;
  const frontMidY = (hFL + hFR) / 2, rearMidY = (hRL + hRR) / 2;
  const leftMidY = (hFL + hRL) / 2, rightMidY = (hFR + hRR) / 2;
  const wheelbase = Math.max(0.5, fl.z - rl.z), track = Math.max(0.5, fr.x - fl.x);
  _fwd3.set(0, frontMidY - rearMidY, wheelbase).applyQuaternion(_yawQ).normalize();
  _right3.set(track, rightMidY - leftMidY, 0).applyQuaternion(_yawQ).normalize();
  _up3.crossVectors(_fwd3, _right3);
  if (_up3.y < 0) _up3.crossVectors(_right3, _fwd3);
  _up3.normalize();
  _right3.crossVectors(_up3, _fwd3).normalize();
  _mat.makeBasis(_right3, _up3, _fwd3);
  _bodyQ.setFromRotationMatrix(_mat);
  v._quat.copy(_bodyQ);

  const kind = s.edge ? s.edge.kind : 'dirt';
  const dirt = kind === 'dirt' ? 1 : kind === 'gravel' ? 0.4 : 0.12;
  const bob = (Math.sin(v._bobPhase) * 0.016 + Math.sin(v._bobPhase * 1.9 + 1.7) * 0.008) * dirt;

  v._pos.set(centerX, avgY + bob, centerZ);
  v.x = v._pos.x; v.z = v._pos.z; v.y = v._pos.y;
  v.heading = Math.atan2(_fwd3.x, _fwd3.z);

  _mat.compose(v._pos, v._quat, ONE);
  kit.setBodyMatrix(v._handle, _mat);

  for (let i = 0; i < mounts.length; i++) {
    const m = mounts[i];
    _tmpV.set(m.x, m.y, m.z).applyQuaternion(v._quat).add(v._pos);
    if (m.spare) {
      _wheelQ.copy(v._quat).multiply(SPARE_TILT);
      // scale is applied in the geometry's own local axes BEFORE _wheelQ rotates it, so X is still
      // the axial/width axis here even though the tilt above turns that axis to point along body Z.
      _spareScale.set(model.wheelW * 0.6, model.wheelR, model.wheelR);
      _mat.compose(_tmpV, _wheelQ, _spareScale);
    } else {
      _spinQ.setFromAxisAngle(SPIN_AXIS, v._wheelRot);
      _wheelQ.copy(v._quat).multiply(_spinQ);
      _wheelScale.set(model.wheelW, model.wheelR, model.wheelR);
      _mat.compose(_tmpV, _wheelQ, _wheelScale);
    }
    kit.setWheelMatrix(v._handle, i, _mat);
  }
  for (let i = 0; i < model.headlightMounts.length; i++) {
    const m = model.headlightMounts[i];
    _tmpV.set(m.x, m.y, m.z).applyQuaternion(v._quat).add(v._pos);
    _mat.compose(_tmpV, v._quat, ONE);
    kit.setHeadMatrix(v._handle, i, _mat);
  }
  for (let i = 0; i < model.taillightMounts.length; i++) {
    const m = model.taillightMounts[i];
    _tmpV.set(m.x, m.y, m.z).applyQuaternion(v._quat).add(v._pos);
    _mat.compose(_tmpV, v._quat, ONE);
    kit.setTailMatrix(v._handle, i, _mat);
  }
  const seatMounts = model.allSeatMounts;
  const nSeats = v._handle.seatSlots.length;
  for (let i = 0; i < nSeats && i < seatMounts.length; i++) {
    const m = seatMounts[i];
    const yaw = (v._state === 'sighting' && i > 0) ? v._sightYaw * 0.6 : 0;
    _seatQ.setFromAxisAngle(UP, yaw);
    _tmpV.set(m.x, m.y, m.z).applyQuaternion(v._quat).add(v._pos);
    _wheelQ.copy(v._quat).multiply(_seatQ);
    _mat.compose(_tmpV, _wheelQ, ONE);
    kit.setSeatMatrix(v._handle, i, _mat);
  }
}

export { advanceEdge, planRandomRoute, nodesOf };
