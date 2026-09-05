// One builder per catalogue type (the lodge lives in lodge.js because it is much bigger).
//
// Convention: every building is modelled around the local origin, footprint `w` along x and `d`
// along z, ground at y = 0, and +z is the FRONT — the side that faces the road. index.js rotates
// and drops the finished mesh onto the terrain.
import * as THREE from 'three';
import {
  TILE, deck, railing, railingRect, window4, door, plinth, ironRoof, gableEnd,
  poleRow, footing, lantern, lampPost, walledBox, hipThatch, waterTank, solarArray,
  satelliteDish, latticeMast, stair, reedScreen, drums,
} from './common.js';
import { buildLodge } from './lodge.js';

const RED = [0.48, 0.055, 0.035];      // painted red, applied to the plaster layer
const WHITE = [1.45, 1.42, 1.36];
const GREEN = [0.16, 0.30, 0.13];

// ---------------------------------------------------------------------------------------------------------
// ENTRANCE GATE + TICKET OFFICE
// ---------------------------------------------------------------------------------------------------------
function buildGate(bc) {
  const st = bc.f('stone'), po = bc.f('pole'), ti = bc.f('timber'), pl = bc.f('plaster'), sg = bc.f('sign');
  const co = bc.f('concrete'), sl = bc.f('steel');

  // --- twin piers ------------------------------------------------------------------------------
  const PX = 4.2, PH = 4.5;
  for (const s of [-1, 1]) {
    const cx = s * PX;
    plinth(st, cx - 0.95, -0.95, cx + 0.95, 0.95, -0.35, PH, TILE.stone, 0.16);
    // corbelled cap
    st.box(cx - 1.02, PH - 0.35, -1.02, cx + 1.02, PH - 0.10, 1.02, TILE.stone, '-y');
    st.box(cx - 0.86, PH - 0.10, -0.86, cx + 0.86, PH + 0.16, 0.86, TILE.stone, '-y');
    lantern(bc, cx + s * 0.80, 3.35, 0, s > 0 ? '+x' : '-x', 0.42);
  }
  // low wing walls running out from the piers
  for (const s of [-1, 1]) {
    plinth(st, s > 0 ? PX + 0.9 : -8.4, -0.55, s > 0 ? 8.4 : -PX - 0.9, 0.55, -0.3, 1.5, TILE.stone, 0.10);
  }

  // --- lintel and sign -------------------------------------------------------------------------
  const LY = 4.35;
  for (const dz of [-0.42, 0.42]) {
    po.beam(-PX - 0.85, LY + 0.22, dz, PX + 0.85, LY + 0.22, dz, 0.24, 0.28, TILE.pole);
  }
  for (const x of [-2.6, 0, 2.6]) po.beam(x, LY + 0.22, -0.55, x, LY + 0.22, 0.55, 0.14, 0.18, TILE.pole);
  // hanging signboard
  const SW = 3.5;
  const sy0 = LY - 2.05, sy1 = LY - 0.90;
  for (const s of [-1, 1]) sl.cyl(s * SW * 0.72, 0, sy1 + 0.10, LY + 0.20, 0.035, 0.035, 6, TILE.steel, '');
  ti.box(-SW - 0.13, sy0 - 0.13, -0.085, SW + 0.13, sy1 + 0.13, 0.085, TILE.timber, '');
  // canvas textures are flipY, so canvas y 0.87..0.13 maps to v 0.13..0.87
  sg.quad([-SW, sy0, 0.10], [SW, sy0, 0.10], [SW, sy1, 0.10], [-SW, sy1, 0.10], 0.03, 0.13, 0.97, 0.87);
  sg.quad([SW, sy0, -0.10], [-SW, sy0, -0.10], [-SW, sy1, -0.10], [SW, sy1, -0.10], 0.03, 0.13, 0.97, 0.87);

  // --- thatched roof over the gateway ----------------------------------------------------------
  hipThatch(bc, 0, 0, 12.4, 3.6, LY + 0.55, 1.55, 0.75, { seg: 13, rows: 8, underside: true });

  // --- ticket office ---------------------------------------------------------------------------
  const OX = 8.2, OZ = -2.4;
  const oy = plinth(st, OX - 3.1, OZ - 2.6, OX + 3.1, OZ + 2.6, -0.3, 0.72, TILE.stone, 0.08);
  walledBox(bc, OX - 2.7, OZ - 2.2, OX + 2.7, OZ + 2.2, oy, oy + 2.85, { base: 0.55, wall: 'plaster' });
  // serving hatch facing the lane (-x), with a timber counter shelf and shutter
  window4(bc.parts, 'plaster', OX - 2.7, OZ, oy + 1.0, oy + 2.05, 0.95, '-x', TILE.plaster);
  ti.box(OX - 3.35, oy + 0.92, OZ - 1.15, OX - 2.55, oy + 1.03, OZ + 1.15, TILE.timber, '');
  ti.box(OX - 3.30, oy + 2.10, OZ - 1.25, OX - 2.66, oy + 2.22, OZ + 1.25, TILE.timber, '');
  door(bc.parts, 'plaster', OX, OZ + 2.2, oy, 0.52, 2.05, '+z', TILE.plaster);
  window4(bc.parts, 'plaster', OX, OZ - 2.2, oy + 1.15, oy + 2.10, 0.62, '-z', TILE.plaster);
  hipThatch(bc, OX, OZ, 7.4, 6.4, oy + 3.02, 2.05, 0.95, { seg: 12, rows: 9, underside: true });
  // veranda pole in front of the hatch
  po.cyl(OX - 3.6, OZ - 1.4, oy - 0.02, oy + 2.9, 0.14, 0.12, 8, TILE.pole, 'top');
  po.cyl(OX - 3.6, OZ + 1.4, oy - 0.02, oy + 2.9, 0.14, 0.12, 8, TILE.pole, 'top');
  lantern(bc, OX - 2.7, oy + 2.35, OZ + 1.3, '-x', 0.40);

  // --- boom barrier across the entry lane ------------------------------------------------------
  const BX = -1.6;
  co.box(BX - 0.32, -0.05, 1.9, BX + 0.32, 0.22, 2.54, TILE.concrete, '-y');
  sl.cyl(BX, 2.22, 0.22, 1.25, 0.09, 0.08, 8, TILE.steel, 'top');
  sl.box(BX - 0.22, 1.05, 2.10, BX + 0.22, 1.42, 2.34, TILE.steel, '');
  // striped boom, slightly raised
  const bl = 4.6, by = 1.28;
  const segs = 6;
  for (let i = 0; i < segs; i++) {
    const a = BX + 0.2 + (bl * i) / segs, b = BX + 0.2 + (bl * (i + 1)) / segs;
    const c = i % 2 ? RED : WHITE;
    pl.tint(c[0], c[1], c[2]);
    pl.box(a, by - 0.055, 2.14, b, by + 0.055, 2.30, TILE.plaster, '');
  }
  pl.tint(1, 1, 1);
  sl.box(BX - 0.55, by - 0.14, 2.10, BX - 0.18, by + 0.14, 2.34, TILE.steel, '');   // counterweight

  // --- apron -----------------------------------------------------------------------------------
  co.box(-5.6, -0.06, -3.4, 5.6, 0.04, 3.4, TILE.concrete, '-y');
  lampPost(bc, -7.4, 3.1, 0, 2.9);
  return { top: LY + 2.1 };
}

// ---------------------------------------------------------------------------------------------------------
// GIFT SHOP
// ---------------------------------------------------------------------------------------------------------
function buildShop(bc) {
  const st = bc.f('stone'), po = bc.f('pole'), ti = bc.f('timber'), sg = bc.f('sign');
  const PT = plinth(st, -5.4, -4.4, 5.4, 2.6, -0.35, 0.62, TILE.stone, 0.10);
  walledBox(bc, -4.6, -3.7, 4.6, 1.9, PT, PT + 3.35, { base: 0.85, wall: 'plaster' });

  // shopfront: two display windows and a door
  for (const x of [-2.9, 2.9]) window4(bc.parts, 'plaster', x, 1.9, PT + 0.95, PT + 2.85, 1.25, '+z', TILE.plaster);
  door(bc.parts, 'plaster', 0, 1.9, PT, 0.62, 2.15, '+z', TILE.plaster);
  for (const z of [-2.6, -0.4]) {
    window4(bc.parts, 'plaster', 4.6, z, PT + 1.15, PT + 2.55, 0.62, '+x', TILE.plaster);
    window4(bc.parts, 'plaster', -4.6, z, PT + 1.15, PT + 2.55, 0.62, '-x', TILE.plaster);
  }
  window4(bc.parts, 'plaster', 0, -3.7, PT + 1.35, PT + 2.55, 0.75, '-z', TILE.plaster);

  // veranda
  deck(ti, -5.2, 1.9, 5.2, 4.3, PT + 0.05, TILE.timber, 0.13, 0.20, false);
  for (let i = 0; i < 4; i++) {
    const x = -4.4 + i * (8.8 / 3);
    po.cyl(x, 3.95, PT, PT + 3.30, 0.145, 0.125, 8, TILE.pole, 'top');
    footing(st, x, 3.95, PT - 0.02, 0.28, 0.13);
  }
  po.beam(-4.9, PT + 3.36, 3.95, 4.9, PT + 3.36, 3.95, 0.18, 0.24, TILE.pole);
  railing(ti, -5.2, 4.3, -1.1, 4.3, PT + 0.05, 0.95, TILE.timber);
  railing(ti, 1.1, 4.3, 5.2, 4.3, PT + 0.05, 0.95, TILE.timber);
  stair(bc, 0, 4.3, 5.5, PT + 0.05, -0.02, 1.6, 4);

  hipThatch(bc, 0, 0.25, 12.6, 10.0, PT + 3.52, 2.55, 0.85, { seg: 14, rows: 10, underside: true });

  // hanging shop sign under the veranda beam
  const sw = 1.35, sy0 = PT + 2.20, sy1 = PT + 2.98;
  for (const s of [-1, 1]) bc.f('steel').cyl(s * sw * 0.7, 3.95, sy1, PT + 3.30, 0.028, 0.028, 6, TILE.steel, '');
  ti.box(-sw - 0.10, sy0 - 0.10, 3.86, sw + 0.10, sy1 + 0.10, 4.04, TILE.timber, '');
  sg.quad([-sw, sy0, 4.06], [sw, sy0, 4.06], [sw, sy1, 4.06], [-sw, sy1, 4.06], 0.08, 0.28, 0.92, 0.74);
  sg.quad([sw, sy0, 3.84], [-sw, sy0, 3.84], [-sw, sy1, 3.84], [sw, sy1, 3.84], 0.08, 0.28, 0.92, 0.74);

  lantern(bc, -3.4, PT + 2.55, 1.92, '+z', 0.38);
  lantern(bc, 3.4, PT + 2.55, 1.92, '+z', 0.38);
  return { top: PT + 6.1 };
}

// ---------------------------------------------------------------------------------------------------------
// RESTAURANT / BOMA
// ---------------------------------------------------------------------------------------------------------
function buildRestaurant(bc) {
  const st = bc.f('stone'), po = bc.f('pole'), ti = bc.f('timber'), ir = bc.f('iron'), lm = bc.f('lamp');
  const PT = plinth(st, -10.2, -7.2, 10.2, 6.6, -0.45, 0.85, TILE.stone, 0.14);
  deck(ti, -9.6, -6.5, 9.6, 6.0, PT + 0.04, TILE.timber, 0.15, 0.21, false);

  // kitchen block at the back
  walledBox(bc, -4.6, -6.4, 4.6, -3.2, PT, PT + 3.0, { base: 0.8, wall: 'plaster' });
  ironRoof(ir, -5.0, -6.7, 5.0, -3.0, PT + 4.05, PT + 3.1, TILE.iron, 0.3);
  gableEnd(bc.f('plaster'), -4.6, 4.6, -6.4, PT + 3.0, PT + 4.05, TILE.plaster);
  gableEnd(bc.f('plaster'), -4.6, 4.6, -3.2, PT + 3.0, PT + 4.05, TILE.plaster);
  window4(bc.parts, 'plaster', -2.4, -3.2, PT + 1.15, PT + 2.35, 0.72, '+z', TILE.plaster);
  window4(bc.parts, 'plaster', 2.4, -3.2, PT + 1.15, PT + 2.35, 0.72, '+z', TILE.plaster);
  door(bc.parts, 'plaster', 0, -3.2, PT, 0.55, 2.05, '+z', TILE.plaster);
  st.box(-5.5, PT, -6.9, -4.7, PT + 5.6, -5.9, TILE.stone, '-y');                    // kitchen chimney
  st.box(-5.65, PT + 5.6, -7.05, -4.55, PT + 5.85, -5.75, TILE.stone, '-y');

  // ring of poles carrying the big thatch
  const EY = PT + 3.95;
  const ring = [];
  for (let i = 0; i < 5; i++) ring.push([-8.6 + i * 4.3, 5.5]);
  for (let i = 1; i < 3; i++) { ring.push([-8.6, 5.5 - i * 3.9]); ring.push([8.6, 5.5 - i * 3.9]); }
  ring.push([-8.6, -6.0]); ring.push([8.6, -6.0]);
  for (const [x, z] of ring) {
    po.cyl(x, z, PT - 0.02, EY - 0.12, 0.20, 0.165, 10, TILE.pole, 'top');
    footing(st, x, z, PT - 0.03, 0.36, 0.16);
  }
  po.beam(-9.0, EY - 0.02, 5.5, 9.0, EY - 0.02, 5.5, 0.22, 0.30, TILE.pole);
  po.beam(-8.6, EY - 0.02, -6.2, -8.6, EY - 0.02, 5.7, 0.22, 0.30, TILE.pole);
  po.beam(8.6, EY - 0.02, -6.2, 8.6, EY - 0.02, 5.7, 0.22, 0.30, TILE.pole);
  for (let i = 0; i < 7; i++) {
    const x = -8.6 + i * (17.2 / 6);
    po.beam(x, EY - 0.14, 5.5, x, EY + 1.9, -0.4, 0.11, 0.15, TILE.pole);
  }
  hipThatch(bc, 0, -0.2, 21.0, 14.4, EY, 3.8, 1.2, { seg: 17, rows: 12, underside: true });

  // stone bar counter with a timber top
  st.box(4.2, PT + 0.04, -2.6, 9.2, PT + 1.05, -1.5, TILE.stone, '-y');
  ti.box(4.05, PT + 1.05, -2.75, 9.35, PT + 1.16, -1.35, TILE.timber, '-y');
  for (let i = 0; i < 4; i++) {          // bar stools
    const x = 4.9 + i * 1.15;
    po.cyl(x, -0.95, PT + 0.04, PT + 0.72, 0.075, 0.07, 6, TILE.pole, '');
    ti.cyl(x, -0.95, PT + 0.72, PT + 0.80, 0.20, 0.20, 10, TILE.timber, 'top');
  }
  // long tables and benches
  for (let t = 0; t < 3; t++) {
    const z = 3.6 - t * 3.0;
    ti.box(-8.0, PT + 0.72, z - 0.45, -2.0, PT + 0.80, z + 0.45, TILE.timber, '-y');
    for (const bx of [-7.6, -2.4]) po.cyl(bx, z, PT + 0.04, PT + 0.72, 0.07, 0.065, 6, TILE.pole, '');
    for (const s of [-1, 1]) {
      ti.box(-8.0, PT + 0.44, z + s * 0.78 - 0.16, -2.0, PT + 0.50, z + s * 0.78 + 0.16, TILE.timber, '-y');
      for (const bx of [-7.4, -2.6]) po.cyl(bx, z + s * 0.78, PT + 0.04, PT + 0.44, 0.055, 0.05, 6, TILE.pole, '');
    }
  }
  // fire pit in front of the deck
  const fx = 5.2, fz = 8.4;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    st.box(fx + Math.cos(a) * 1.5 - 0.24, -0.05, fz + Math.sin(a) * 1.5 - 0.24,
      fx + Math.cos(a) * 1.5 + 0.24, 0.32, fz + Math.sin(a) * 1.5 + 0.24, TILE.stone, '-y');
  }
  po.tint(0.28, 0.24, 0.22);
  for (let i = 0; i < 5; i++) {
    const a = i * 1.31;
    po.beam(fx + Math.cos(a) * 0.85, 0.02, fz + Math.sin(a) * 0.85, fx - Math.cos(a) * 0.3, 0.46, fz - Math.sin(a) * 0.3, 0.14, 0.14, TILE.pole);
  }
  po.tint(1, 1, 1);
  lm.tint(2.6, 0.85, 0.16);
  lm.cyl(fx, fz, 0.05, 0.30, 0.62, 0.30, 12, 1, 'top');
  lm.tint(1, 1, 1);
  bc.lamp(fx, 0.55, fz, 1.6);

  railing(ti, -9.6, 6.0, -1.6, 6.0, PT + 0.04, 1.0, TILE.timber);
  railing(ti, 1.6, 6.0, 9.6, 6.0, PT + 0.04, 1.0, TILE.timber);
  railing(ti, -9.6, -6.5, -9.6, 6.0, PT + 0.04, 1.0, TILE.timber);
  railing(ti, 9.6, -6.5, 9.6, 6.0, PT + 0.04, 1.0, TILE.timber);
  stair(bc, 0, 6.0, 8.0, PT + 0.04, -0.02, 2.2, 5);

  for (const x of [-8.6, -4.3, 0, 4.3, 8.6]) lantern(bc, x, PT + 2.6, 5.35, '+z', 0.40);
  return { top: EY + 3.8 };
}

// ---------------------------------------------------------------------------------------------------------
// RANGER STATION
// ---------------------------------------------------------------------------------------------------------
function buildRanger(bc) {
  const st = bc.f('stone'), po = bc.f('pole'), ti = bc.f('timber'), ir = bc.f('iron');
  const co = bc.f('concrete'), sl = bc.f('steel'), pl = bc.f('plaster');
  co.box(-7.2, -0.14, -5.2, 7.2, 0.06, 5.2, TILE.concrete, '-y');

  walledBox(bc, -4.6, -3.4, 2.4, 1.4, 0.06, 3.05, { base: 0.7, wall: 'plaster' });
  ironRoof(ir, -4.9, -3.7, 2.7, 1.7, 4.35, 3.15, TILE.iron, 0.45);
  gableEnd(pl, -4.6, 2.4, -3.4, 3.05, 4.35, TILE.plaster);
  gableEnd(pl, -4.6, 2.4, 1.4, 3.05, 4.35, TILE.plaster);

  door(bc.parts, 'plaster', -1.1, 1.4, 0.06, 0.55, 2.10, '+z', TILE.plaster);
  window4(bc.parts, 'plaster', 1.1, 1.4, 1.05, 2.35, 0.62, '+z', TILE.plaster);
  for (const z of [-2.4, -0.6]) window4(bc.parts, 'plaster', -4.6, z, 1.05, 2.35, 0.62, '-x', TILE.plaster);
  window4(bc.parts, 'plaster', -1.1, -3.4, 1.05, 2.35, 0.62, '-z', TILE.plaster);

  // veranda along the front
  for (const x of [-4.2, -1.1, 2.0]) {
    po.cyl(x, 3.6, 0.06, 2.92, 0.135, 0.115, 8, TILE.pole, 'top');
    footing(st, x, 3.6, 0.04, 0.26, 0.12);
  }
  po.beam(-4.5, 2.98, 3.6, 2.3, 2.98, 3.6, 0.16, 0.20, TILE.pole);
  ir.quad([-4.9, 3.15, 1.7], [2.7, 3.15, 1.7], [2.7, 2.90, 3.95], [-4.9, 2.90, 3.95], -4.9 / TILE.iron, 0, 2.7 / TILE.iron, 2.4 / TILE.iron);
  ir.quad([2.7, 3.11, 1.7], [-4.9, 3.11, 1.7], [-4.9, 2.86, 3.95], [2.7, 2.86, 3.95], -4.9 / TILE.iron, 0, 2.7 / TILE.iron, 2.4 / TILE.iron);
  ti.box(-4.6, 0.06, 1.4, 2.4, 0.14, 3.7, TILE.timber, '-y');

  // open equipment bay to the +x side
  for (const [x, z] of [[3.6, -3.2], [6.6, -3.2], [3.6, 1.2], [6.6, 1.2]]) {
    po.cyl(x, z, 0.06, 3.15, 0.15, 0.13, 8, TILE.pole, 'top');
  }
  ir.quad([3.2, 3.75, -3.6], [7.0, 3.75, -3.6], [7.0, 3.20, 1.7], [3.2, 3.20, 1.7], 3.2 / TILE.iron, 0, 7.0 / TILE.iron, 5.4 / TILE.iron);
  ir.quad([7.0, 3.71, -3.6], [3.2, 3.71, -3.6], [3.2, 3.16, 1.7], [7.0, 3.16, 1.7], 3.2 / TILE.iron, 0, 7.0 / TILE.iron, 5.4 / TILE.iron);
  ir.box(6.9, 0.06, -3.6, 7.05, 3.72, 1.7, TILE.iron, '');
  ir.box(3.2, 0.06, -3.75, 7.05, 3.75, -3.6, TILE.iron, '');
  po.beam(3.6, 3.10, -3.2, 6.6, 3.10, -3.2, 0.13, 0.17, TILE.pole);
  po.beam(3.6, 2.98, 1.2, 6.6, 2.98, 1.2, 0.13, 0.17, TILE.pole);

  latticeMast(bc, -6.2, -3.9, 0.06, 9.2, 0.52, 0.16, 7, 0.05);
  sl.cyl(-6.2, -3.9, 9.26, 10.4, 0.035, 0.03, 6, TILE.steel, 'top');
  for (const dz of [-0.5, 0.5]) sl.beam(-6.55, 9.6 + dz * 0.2, -3.9, -5.85, 9.6 + dz * 0.2, -3.9, 0.03, 0.03, TILE.steel);

  waterTank(bc, 5.6, 3.4, 0.06, 2.5, 1.05, 1.7);
  solarArray(bc, -2.0, -4.4, 2.2, 4, 1.0, 1.55, 0.44);
  satelliteDish(bc, 2.9, -4.4, 0.06, 0.55);
  drums(bc, 5.2, -1.2, 4, bc.rng, 0.06);

  // flagpole
  sl.cyl(-6.9, 3.9, 0.06, 7.2, 0.075, 0.055, 8, TILE.steel, 'top');
  pl.tint(GREEN[0], GREEN[1], GREEN[2]);
  pl.quad([-6.85, 6.0, 3.9], [-5.35, 6.0, 3.9], [-5.35, 7.0, 3.9], [-6.85, 7.0, 3.9], 0, 0, 0.6, 0.4);
  pl.quad([-5.35, 6.0, 3.86], [-6.85, 6.0, 3.86], [-6.85, 7.0, 3.86], [-5.35, 7.0, 3.86], 0, 0, 0.6, 0.4);
  pl.tint(1, 1, 1);

  lantern(bc, 2.3, 2.5, 1.42, '+z', 0.38);
  lampPost(bc, -7.6, 4.6, 0.06, 3.0);
  return { top: 10.4 };
}

// ---------------------------------------------------------------------------------------------------------
// VETERINARY CLINIC
// ---------------------------------------------------------------------------------------------------------
function buildClinic(bc) {
  const st = bc.f('stone'), po = bc.f('pole'), ti = bc.f('timber'), ir = bc.f('iron');
  const co = bc.f('concrete'), pl = bc.f('plaster'), sl = bc.f('steel');
  co.box(-8.2, -0.14, -5.8, 8.2, 0.06, 5.8, TILE.concrete, '-y');

  walledBox(bc, -5.4, -4.0, 1.0, 2.0, 0.06, 3.25, { base: 0.55, wall: 'plaster' });
  ironRoof(ir, -5.7, -4.3, 1.3, 2.3, 4.55, 3.35, TILE.iron, 0.45);
  gableEnd(pl, -5.4, 1.0, -4.0, 3.25, 4.55, TILE.plaster);
  gableEnd(pl, -5.4, 1.0, 2.0, 3.25, 4.55, TILE.plaster);
  door(bc.parts, 'plaster', -2.2, 2.0, 0.06, 0.60, 2.20, '+z', TILE.plaster);
  for (const x of [0.0, -4.2]) window4(bc.parts, 'plaster', x, 2.0, 1.15, 2.55, 0.68, '+z', TILE.plaster);
  for (const z of [-3.0, -1.2, 0.6]) window4(bc.parts, 'plaster', -5.4, z, 1.15, 2.55, 0.62, '-x', TILE.plaster);
  window4(bc.parts, 'plaster', -2.2, -4.0, 1.35, 2.45, 0.72, '-z', TILE.plaster);

  // red cross board over the door
  pl.tint(WHITE[0], WHITE[1], WHITE[2]);
  pl.box(-3.05, 2.45, 1.98, -1.35, 3.05, 2.06, TILE.plaster, '');
  pl.tint(RED[0], RED[1], RED[2]);
  pl.box(-2.42, 2.55, 2.05, -1.98, 2.95, 2.10, TILE.plaster, '');
  pl.box(-2.62, 2.68, 2.05, -1.78, 2.82, 2.10, TILE.plaster, '');
  pl.tint(1, 1, 1);

  // covered vehicle bay
  for (const [x, z] of [[2.6, -3.6], [7.0, -3.6], [2.6, 1.6], [7.0, 1.6]]) {
    po.cyl(x, z, 0.06, 3.55, 0.15, 0.13, 8, TILE.pole, 'top');
    footing(st, x, z, 0.04, 0.28, 0.12);
  }
  po.beam(2.6, 3.50, -3.6, 7.0, 3.50, -3.6, 0.14, 0.19, TILE.pole);
  po.beam(2.6, 3.30, 1.6, 7.0, 3.30, 1.6, 0.14, 0.19, TILE.pole);
  ir.quad([2.2, 4.05, -4.0], [7.4, 4.05, -4.0], [7.4, 3.42, 2.1], [2.2, 3.42, 2.1], 2.2 / TILE.iron, 0, 7.4 / TILE.iron, 6.1 / TILE.iron);
  ir.quad([7.4, 4.01, -4.0], [2.2, 4.01, -4.0], [2.2, 3.38, 2.1], [7.4, 3.38, 2.1], 2.2 / TILE.iron, 0, 7.4 / TILE.iron, 6.1 / TILE.iron);

  // holding pen: post and rail
  const px0 = -7.6, px1 = -1.6, pz0 = 2.8, pz1 = 5.4;
  const corners = [[px0, pz0], [px1, pz0], [px1, pz1], [px0, pz1]];
  for (let i = 0; i < 4; i++) {
    const a = corners[i], b = corners[(i + 1) % 4];
    if (i === 0) continue;
    const n = Math.max(2, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 1.6));
    poleRow(po, a[0], a[1], b[0], b[1], n + 1, 0.02, 1.45, 0.10);
    for (const h of [0.55, 1.05, 1.38]) ti.beam(a[0], h, a[1], b[0], h, b[1], 0.07, 0.11, TILE.timber);
  }
  sl.cyl(-6.0, 4.1, 0.06, 2.4, 0.05, 0.045, 6, TILE.steel, 'top');       // vent / water pipe
  waterTank(bc, 6.6, 4.2, 0.06, 2.2, 0.85, 1.4);
  lantern(bc, 0.9, 2.6, 1.98, '+z', 0.38);
  return { top: 4.6 };
}

// ---------------------------------------------------------------------------------------------------------
// WORKSHOP / GARAGE
// ---------------------------------------------------------------------------------------------------------
function buildWorkshop(bc) {
  const ir = bc.f('iron'), sl = bc.f('steel'), co = bc.f('concrete'), ti = bc.f('timber'), po = bc.f('pole');
  co.box(-9.4, -0.16, -6.4, 9.4, 0.06, 6.4, TILE.concrete, '-y');

  const X = 7.6, Z = 5.0, EY = 3.6, RY = 5.2;
  // portal frames
  for (let i = 0; i <= 4; i++) {
    const z = -Z + (2 * Z * i) / 4;
    sl.beam(-X, 0.06, z, -X, EY, z, 0.16, 0.16, TILE.steel);
    sl.beam(X, 0.06, z, X, EY, z, 0.16, 0.16, TILE.steel);
    sl.beam(-X, EY, z, 0, RY, z, 0.14, 0.22, TILE.steel);
    sl.beam(X, EY, z, 0, RY, z, 0.14, 0.22, TILE.steel);
  }
  // clad: back wall, both ends, and the top half of the front
  ir.box(-X - 0.08, 0.06, -Z - 0.08, X + 0.08, EY, -Z + 0.06, TILE.iron, '');
  ir.box(-X - 0.08, 0.06, -Z, -X + 0.06, EY, Z, TILE.iron, '');
  ir.box(X - 0.06, 0.06, -Z, X + 0.08, EY, Z, TILE.iron, '');
  ir.box(-X - 0.08, EY - 0.9, Z - 0.06, X + 0.08, EY, Z + 0.08, TILE.iron, '');
  // gable infill
  gableEnd(ir, -X, X, -Z - 0.06, EY, RY, TILE.iron);
  gableEnd(ir, -X, X, Z + 0.06, EY, RY, TILE.iron);
  ironRoof(ir, -X, -Z, X, Z, RY, EY, TILE.iron, 0.45);

  // roller-door openings marked by timber frames
  for (const cx of [-4.0, 4.0]) {
    ti.box(cx - 2.5, 0.06, Z - 0.10, cx - 2.3, EY - 0.85, Z + 0.10, TILE.timber, '');
    ti.box(cx + 2.3, 0.06, Z - 0.10, cx + 2.5, EY - 0.85, Z + 0.10, TILE.timber, '');
    ti.box(cx - 2.5, EY - 1.0, Z - 0.10, cx + 2.5, EY - 0.85, Z + 0.10, TILE.timber, '');
  }
  // one bay shuttered
  ir.tint(0.85, 0.85, 0.85);
  ir.box(-6.4, 0.06, Z - 0.02, -1.6, EY - 1.0, Z + 0.05, TILE.iron, '');
  ir.tint(1, 1, 1);

  // jib crane
  sl.cyl(5.6, -2.6, 0.06, 4.6, 0.13, 0.11, 10, TILE.steel, 'top');
  sl.beam(5.6, 4.45, -2.6, 5.6, 4.45, 1.4, 0.14, 0.20, TILE.steel);
  sl.beam(5.6, 3.5, -2.6, 5.6, 4.4, 0.6, 0.07, 0.07, TILE.steel);
  sl.cyl(5.6, 1.2, 3.1, 4.4, 0.05, 0.05, 6, TILE.steel, '');
  sl.box(5.4, 2.75, 1.0, 5.8, 3.15, 1.4, TILE.steel, '');

  // workbench and drums outside
  ti.box(-7.2, 0.06, -4.4, -2.6, 0.92, -3.5, TILE.timber, '-y');
  for (const x of [-7.0, -2.8]) po.cyl(x, -3.95, 0.06, 0.86, 0.08, 0.08, 6, TILE.pole, '');
  drums(bc, 8.2, 3.4, 5, bc.rng, 0.06);
  lantern(bc, 0, 3.2, Z + 0.08, '+z', 0.42);
  return { top: RY };
}

// ---------------------------------------------------------------------------------------------------------
// HIDE (viewing shelter on stilts)
// ---------------------------------------------------------------------------------------------------------
function buildHide(bc) {
  const po = bc.f('pole'), ti = bc.f('timber'), re = bc.f('reed'), st = bc.f('stone');
  const DY = 2.55;
  const X = 4.0, Z0 = -2.6, Z1 = 2.6;

  // stilts
  const stilts = [];
  for (const x of [-X + 0.35, 0, X - 0.35]) for (const z of [Z0 + 0.35, Z1 - 0.35]) stilts.push([x, z]);
  stilts.push([-X + 0.35, 0], [X - 0.35, 0]);
  for (const [x, z] of stilts) {
    po.cyl(x, z, -0.5, DY, 0.155, 0.135, 8, TILE.pole, '');
    footing(st, x, z, -0.06, 0.30, 0.14);
  }
  // bearers and joists
  for (const z of [Z0 + 0.35, 0, Z1 - 0.35]) po.beam(-X, DY - 0.16, z, X, DY - 0.16, z, 0.14, 0.20, TILE.pole);
  deck(ti, -X, Z0, X, Z1, DY, TILE.timber, 0.13, 0.20, true);
  ti.box(-X - 0.07, DY - 0.34, Z0 - 0.07, X + 0.07, DY - 0.13, Z1 + 0.07, TILE.timber, '-y');

  // corner posts up to the roof
  const WY = DY + 2.45;
  for (const [x, z] of [[-X + 0.15, Z0 + 0.15], [X - 0.15, Z0 + 0.15], [-X + 0.15, Z1 - 0.15], [X - 0.15, Z1 - 0.15],
    [0, Z0 + 0.15], [0, Z1 - 0.15]]) {
    po.cyl(x, z, DY, WY, 0.125, 0.11, 8, TILE.pole, 'top');
  }
  po.beam(-X - 0.1, WY - 0.08, Z0 + 0.15, X + 0.1, WY - 0.08, Z0 + 0.15, 0.14, 0.18, TILE.pole);
  po.beam(-X - 0.1, WY - 0.08, Z1 - 0.15, X + 0.1, WY - 0.08, Z1 - 0.15, 0.14, 0.18, TILE.pole);

  // reed walls: solid to sill, viewing slot, reed again up to the plate
  const SILL = DY + 1.02, HEAD = DY + 1.62;
  const walls = [
    [-X + 0.15, Z1 - 0.15, X - 0.15, Z1 - 0.15],       // front (+z) — the viewing side
    [-X + 0.15, Z0 + 0.15, X - 0.15, Z0 + 0.15],       // back
    [-X + 0.15, Z0 + 0.15, -X + 0.15, Z1 - 0.15],
    [X - 0.15, Z0 + 0.15, X - 0.15, Z1 - 0.15],
  ];
  walls.forEach(([ax, az, bx, bz], i) => {
    const slot = i === 0 || i === 2 || i === 3;
    if (i === 1) {                                      // back wall has the doorway
      reedScreen(re, ax, az, -0.85, az, DY, WY - 0.1);
      reedScreen(re, 0.85, az, bx, bz, DY, WY - 0.1);
      reedScreen(re, -0.85, az, 0.85, az, DY + 2.05, WY - 0.1);
    } else {
      reedScreen(re, ax, az, bx, bz, DY, SILL);
      if (slot) reedScreen(re, ax, az, bx, bz, HEAD, WY - 0.1);
      else reedScreen(re, ax, az, bx, bz, SILL, WY - 0.1);
    }
  });
  // sill shelf and lintel
  ti.box(-X - 0.12, SILL, Z1 - 0.42, X + 0.12, SILL + 0.09, Z1 + 0.06, TILE.timber, '');
  ti.box(-X - 0.06, HEAD - 0.10, Z1 - 0.24, X + 0.06, HEAD, Z1 + 0.02, TILE.timber, '');
  for (const s of [-1, 1]) {
    ti.box(s * X - 0.06 * s - 0.30, SILL, Z0 + 0.2, s * X + 0.06 * s + 0.02, SILL + 0.09, Z1 - 0.2, TILE.timber, '');
  }

  // rafters + thatch
  for (let i = 0; i < 5; i++) {
    const x = -X + i * (2 * X / 4);
    po.beam(x, WY - 0.02, Z0 - 0.7, x, WY + 1.05, 0, 0.09, 0.13, TILE.pole);
    po.beam(x, WY - 0.02, Z1 + 0.7, x, WY + 1.05, 0, 0.09, 0.13, TILE.pole);
  }
  hipThatch(bc, 0, 0, 9.2, 6.6, WY + 0.02, 1.55, 0.95, { seg: 13, rows: 9, underside: true });

  // stair up the back
  stair(bc, 0, Z0 - 2.6, Z0 + 0.1, -0.1, DY, 1.15, 11);
  railing(ti, -0.7, Z0 - 2.6, -0.7, Z0 + 0.1, DY - 1.2, 0.95, TILE.timber);
  railing(ti, 0.7, Z0 - 2.6, 0.7, Z0 + 0.1, DY - 1.2, 0.95, TILE.timber);
  return { top: WY + 1.6 };
}

// ---------------------------------------------------------------------------------------------------------
// VIEWING TOWER
// ---------------------------------------------------------------------------------------------------------
function buildTower(bc) {
  const po = bc.f('pole'), ti = bc.f('timber'), st = bc.f('stone');
  const H = 10.8;
  const B = 2.75, T = 1.65;
  const legs = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const at = (i, t) => {
    const s = B + (T - B) * t;
    return [legs[i][0] * s, -0.4 + (H + 0.4) * t, legs[i][1] * s];
  };
  for (let i = 0; i < 4; i++) {
    const a = at(i, 0), b = at(i, 1);
    po.beam(a[0], a[1], a[2], b[0], b[1], b[2], 0.24, 0.24, TILE.pole);
    footing(st, a[0], a[2], -0.1, 0.42, 0.22);
  }
  // horizontal rings and X bracing
  const levels = [0.30, 0.56, 0.82];
  for (const t of levels) {
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      const a = at(i, t), b = at(j, t);
      po.beam(a[0], a[1], a[2], b[0], b[1], b[2], 0.11, 0.15, TILE.pole);
    }
  }
  const spans = [[0.02, 0.30], [0.30, 0.56], [0.56, 0.82]];
  for (const [t0, t1] of spans) {
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      const a = at(i, t0), b = at(j, t1), c = at(j, t0), d = at(i, t1);
      po.beam(a[0], a[1], a[2], b[0], b[1], b[2], 0.085, 0.11, TILE.pole);
      po.beam(c[0], c[1], c[2], d[0], d[1], d[2], 0.085, 0.11, TILE.pole);
    }
  }
  // two landings and the top platform
  const decks = [[0.30, 1.9], [0.56, 1.75]];
  for (const [t, hw] of decks) {
    const y = -0.4 + (H + 0.4) * t;
    deck(ti, -hw, -hw, hw, hw, y, TILE.timber, 0.11, 0.19, true);
    railingRect(ti, -hw, -hw, hw, hw, y, 1.0, TILE.timber, '-z');
  }
  const TY = H;
  deck(ti, -T - 0.35, -T - 0.35, T + 0.35, T + 0.35, TY, TILE.timber, 0.13, 0.20, false);
  ti.box(-T - 0.42, TY - 0.30, -T - 0.42, T + 0.42, TY - 0.11, T + 0.42, TILE.timber, '-y');
  railingRect(ti, -T - 0.35, -T - 0.35, T + 0.35, T + 0.35, TY, 1.08, TILE.timber, '-z', 0.5);

  // switchback stairs between the levels
  let prevY = -0.1;
  const stops = [-0.4 + (H + 0.4) * 0.30, -0.4 + (H + 0.4) * 0.56, TY];
  stops.forEach((y, k) => {
    const s = k % 2 ? 1 : -1;
    stair(bc, s * 1.15, -2.5 * s, 1.5 * s, prevY, y, 1.0, Math.max(4, Math.round((y - prevY) / 0.21)));
    prevY = y;
  });

  // thatched crow's-nest roof on four short posts
  for (const [x, z] of [[-T, -T], [T, -T], [T, T], [-T, T]]) {
    po.cyl(x, z, TY, TY + 2.15, 0.11, 0.095, 8, TILE.pole, 'top');
  }
  hipThatch(bc, 0, 0, 4.9, 4.9, TY + 2.15, 1.5, 0.75, { seg: 12, rows: 8, underside: true });
  lantern(bc, 0, TY + 1.7, T, '+z', 0.32);
  return { top: TY + 3.7 };
}

// ---------------------------------------------------------------------------------------------------------
// WATER PUMP + TROUGH
// ---------------------------------------------------------------------------------------------------------
function buildPump(bc) {
  const sl = bc.f('steel'), co = bc.f('concrete'), wa = bc.f('water'), po = bc.f('pole'), ir = bc.f('iron');
  const H = 6.2;
  latticeMast(bc, -1.8, 0, 0, H, 0.95, 0.30, 6, 0.055);

  // rotor: hub + multi blades, mounted on a spinner so it turns in the wind.
  // IMPORTANT: a spinner's geometry must be authored at the pivot's ABSOLUTE local coordinates —
  // index.js rotates it about that pivot with base * T(pivot) * R * T(-pivot); vertices built at
  // the origin would rotate about a point far from where they actually sit. So every vertex below
  // is offset by (HX,HY,HZ), the same point passed to bc.spinner().
  const HX = -1.8, HY = H + 0.55, HZ = 0.30;
  const sp = bc.spinner(HX, HY, HZ, [0, 0, 1], 0.55);
  const sb = sp.f('steel');
  const NB = 16, R = 1.55, Ri = 0.26;
  const blade = new THREE.Matrix4().makeTranslation(HX, HY, HZ);
  sb.xform(blade);
  for (let i = 0; i < NB; i++) {
    const a = (i / NB) * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    const px = -0.06;
    const bw = 0.30;
    // blade as a slightly pitched quad from the hub to the rim
    const p0 = [ca * Ri - sa * bw * 0.35, sa * Ri + ca * bw * 0.35, px - 0.05];
    const p1 = [ca * Ri + sa * bw * 0.35, sa * Ri - ca * bw * 0.35, px + 0.05];
    const p2 = [ca * R + sa * bw * 0.5, sa * R - ca * bw * 0.5, px + 0.12];
    const p3 = [ca * R - sa * bw * 0.5, sa * R + ca * bw * 0.5, px + 0.02];
    sb.quad(p0, p1, p2, p3, 0, 0, bw / TILE.steel, R / TILE.steel);
    sb.quad(p3, p2, p1, p0, 0, 0, bw / TILE.steel, R / TILE.steel);
  }
  sb.xform(null);
  // hub + rim ring (a short cylinder normally along local Y, rotated to face along Z)
  {
    const m = new THREE.Matrix4().makeRotationX(Math.PI / 2);
    m.premultiply(new THREE.Matrix4().makeTranslation(HX, HY, HZ));
    sb.xform(m);
    sb.cyl(0, 0, -0.22, 0.10, 0.26, 0.26, 12, TILE.steel, 'topbot');
    sb.cyl(0, 0, 0.05, 0.14, R + 0.04, R + 0.04, 28, TILE.steel, '');
    sb.xform(null);
  }
  // tail vane
  sl.beam(-1.8, H + 0.55, 0.15, -1.8, H + 0.55, 2.6, 0.07, 0.09, TILE.steel);
  sl.tint(1.35, 1.30, 1.25);
  sl.quad([-1.86, H + 0.05, 1.9], [-1.86, H + 0.05, 3.15], [-1.86, H + 1.35, 3.15], [-1.86, H + 1.35, 1.9], 0, 0, 0.9, 0.9);
  sl.quad([-1.74, H + 0.05, 3.15], [-1.74, H + 0.05, 1.9], [-1.74, H + 1.35, 1.9], [-1.74, H + 1.35, 3.15], 0, 0, 0.9, 0.9);
  sl.tint(1, 1, 1);
  // gearbox + pump rod
  sl.box(-2.1, H + 0.30, -0.22, -1.5, H + 0.80, 0.26, TILE.steel, '');
  sl.cyl(-1.8, 0, 0.1, H + 0.3, 0.035, 0.035, 6, TILE.steel, '');
  co.box(-2.35, -0.12, -0.55, -1.25, 0.30, 0.55, TILE.concrete, '-y');

  // header tank on a short stand
  waterTank(bc, 1.4, -2.3, 0, 2.0, 0.85, 1.35);
  sl.cyl(0.9, -2.3, 0.4, 0.5, 0.05, 0.05, 6, TILE.steel, '');
  sl.beam(1.4, 3.6, -2.3, 1.4, 3.6, 1.1, 0.07, 0.07, TILE.steel);
  sl.cyl(1.4, 1.1, 0.9, 3.6, 0.05, 0.05, 6, TILE.steel, '');

  // concrete trough
  const tx0 = -0.4, tx1 = 4.2, tz0 = 0.9, tz1 = 2.3, ty = 0.62;
  co.box(tx0, -0.12, tz0, tx1, ty, tz0 + 0.22, TILE.concrete, '-y');
  co.box(tx0, -0.12, tz1 - 0.22, tx1, ty, tz1, TILE.concrete, '-y');
  co.box(tx0, -0.12, tz0, tx0 + 0.22, ty, tz1, TILE.concrete, '-y');
  co.box(tx1 - 0.22, -0.12, tz0, tx1, ty, tz1, TILE.concrete, '-y');
  co.plate(tx0 + 0.22, tz0 + 0.22, tx1 - 0.22, tz1 - 0.22, 0.14, TILE.concrete, true);
  wa.tint(0.024, 0.058, 0.062);
  wa.plate(tx0 + 0.22, tz0 + 0.22, tx1 - 0.22, tz1 - 0.22, ty - 0.14, 1.0, true);
  wa.tint(1, 1, 1);
  // splash apron + a couple of poles keeping vehicles off
  co.box(tx0 - 0.8, -0.14, tz0 - 0.8, tx1 + 0.8, -0.02, tz1 + 0.8, TILE.concrete, '-y');
  po.cyl(tx0 - 0.5, tz1 + 0.5, -0.1, 0.85, 0.10, 0.09, 6, TILE.pole, 'top');
  po.cyl(tx1 + 0.5, tz1 + 0.5, -0.1, 0.85, 0.10, 0.09, 6, TILE.pole, 'top');
  ir.box(-2.6, 0.3, -3.4, -1.0, 0.34, -3.0, TILE.iron, '');   // discarded sheet
  return { top: H + 2.0 };
}

// ---------------------------------------------------------------------------------------------------------
// FEEDING STATION
// ---------------------------------------------------------------------------------------------------------
function buildFeeder(bc) {
  const po = bc.f('pole'), ti = bc.f('timber'), th = bc.f('thatch'), co = bc.f('concrete');
  for (const [x, z] of [[-1.7, -1.7], [1.7, -1.7], [1.7, 1.7], [-1.7, 1.7]]) {
    po.cyl(x, z, -0.3, 2.85, 0.14, 0.12, 8, TILE.pole, 'top');
  }
  po.beam(-1.9, 2.75, -1.7, 1.9, 2.75, -1.7, 0.11, 0.15, TILE.pole);
  po.beam(-1.9, 2.75, 1.7, 1.9, 2.75, 1.7, 0.11, 0.15, TILE.pole);
  hipThatch(bc, 0, 0, 5.0, 5.0, 2.80, 1.25, 0.7, { seg: 11, rows: 7, underside: true });

  // hay crib: slatted timber V
  ti.box(-1.5, 0.75, -0.95, 1.5, 0.90, 0.95, TILE.timber, '-y');
  for (let i = 0; i < 9; i++) {
    const x = -1.42 + i * (2.84 / 8);
    for (const s of [-1, 1]) ti.beam(x, 0.90, s * 0.9, x, 1.72, s * 0.55, 0.07, 0.07, TILE.timber);
  }
  for (const s of [-1, 1]) ti.beam(-1.5, 1.70, s * 0.56, 1.5, 1.70, s * 0.56, 0.08, 0.10, TILE.timber);
  // hay
  th.tint(1.25, 1.18, 0.95);
  for (let i = 0; i < 22; i++) {
    const x = bc.rng.range(-1.4, 1.4), z = bc.rng.range(-0.5, 0.5);
    const y = 1.45 + bc.rng.range(0, 0.35);
    th.beam(x, y, z, x + bc.rng.range(-0.4, 0.4), y + bc.rng.range(-0.15, 0.2), z + bc.rng.range(-0.4, 0.4), 0.07, 0.07, TILE.thatch);
  }
  th.tint(1, 1, 1);
  // salt lick
  co.box(1.9, -0.02, 1.9, 2.5, 0.55, 2.5, TILE.concrete, '-y');
  co.tint(1.35, 1.30, 1.20);
  co.box(1.96, 0.55, 1.96, 2.44, 0.78, 2.44, TILE.concrete, '-y');
  co.tint(1, 1, 1);
  return { top: 4.05 };
}

// ---------------------------------------------------------------------------------------------------------
// STAFF HOUSE (village)
// ---------------------------------------------------------------------------------------------------------
function buildHouse(bc) {
  const st = bc.f('stone'), po = bc.f('pole'), ti = bc.f('timber'), co = bc.f('concrete');
  const X = 3.3, Z0 = -2.5, Z1 = 1.6;
  co.box(-X - 0.5, -0.20, Z0 - 0.5, X + 0.5, 0.10, Z1 + 1.9, TILE.concrete, '-y');
  walledBox(bc, -X, Z0, X, Z1, 0.10, 2.72, { base: 0.45, wall: 'plaster' });
  door(bc.parts, 'plaster', -1.3, Z1, 0.10, 0.48, 2.02, '+z', TILE.plaster);
  window4(bc.parts, 'plaster', 1.4, Z1, 1.05, 2.10, 0.55, '+z', TILE.plaster);
  window4(bc.parts, 'plaster', -X, -0.9, 1.05, 2.10, 0.52, '-x', TILE.plaster);
  window4(bc.parts, 'plaster', X, -0.9, 1.05, 2.10, 0.52, '+x', TILE.plaster);
  window4(bc.parts, 'plaster', 0.6, Z0, 1.15, 2.05, 0.48, '-z', TILE.plaster);

  // stoep with two poles
  for (const x of [-2.4, 2.4]) {
    po.cyl(x, Z1 + 1.5, 0.10, 2.62, 0.115, 0.10, 8, TILE.pole, 'top');
    footing(st, x, Z1 + 1.5, 0.08, 0.22, 0.10);
  }
  po.beam(-2.7, 2.66, Z1 + 1.5, 2.7, 2.66, Z1 + 1.5, 0.13, 0.17, TILE.pole);
  ti.box(-2.8, 0.10, Z1, 2.8, 0.18, Z1 + 1.7, TILE.timber, '-y');

  hipThatch(bc, 0, Z1 * 0.25, 8.4, 7.2, 2.86, 1.95, 0.85, { seg: 12, rows: 9, underside: true });

  // washing line and a water drum by the door
  const sl = bc.f('steel');
  sl.cyl(3.9, Z1 + 2.4, 0.05, 2.1, 0.05, 0.045, 6, TILE.steel, 'top');
  sl.cyl(-3.9, Z1 + 2.4, 0.05, 2.1, 0.05, 0.045, 6, TILE.steel, 'top');
  sl.beam(-3.9, 2.02, Z1 + 2.4, 3.9, 1.94, Z1 + 2.4, 0.02, 0.02, TILE.steel);
  bc.f('iron').cyl(-2.9, Z1 + 0.6, 0.14, 1.02, 0.30, 0.30, 12, TILE.iron, 'top');
  lantern(bc, -1.3, 2.25, Z1 + 0.02, '+z', 0.32);
  return { top: 4.85 };
}

// ---------------------------------------------------------------------------------------------------------
// TOILETS
// ---------------------------------------------------------------------------------------------------------
function buildToilets(bc) {
  const ir = bc.f('iron'), co = bc.f('concrete'), pl = bc.f('plaster'), sl = bc.f('steel');
  co.box(-3.4, -0.14, -2.2, 3.4, 0.10, 2.6, TILE.concrete, '-y');
  walledBox(bc, -2.8, -1.7, 2.8, 1.5, 0.10, 2.62, { base: 0.4, wall: 'plaster' });
  ironRoof(ir, -3.0, -1.9, 3.0, 1.7, 3.55, 2.72, TILE.iron, 0.4);
  gableEnd(pl, -2.8, 2.8, -1.7, 2.62, 3.55, TILE.plaster);
  gableEnd(pl, -2.8, 2.8, 1.5, 2.62, 3.55, TILE.plaster);
  door(bc.parts, 'plaster', -1.35, 1.5, 0.10, 0.45, 2.02, '+z', TILE.plaster);
  door(bc.parts, 'plaster', 1.35, 1.5, 0.10, 0.45, 2.02, '+z', TILE.plaster);
  // pictogram plates over the doors
  pl.tint(WHITE[0], WHITE[1], WHITE[2]);
  pl.box(-1.65, 2.16, 1.48, -1.05, 2.50, 1.54, TILE.plaster, '');
  pl.box(1.05, 2.16, 1.48, 1.65, 2.50, 1.54, TILE.plaster, '');
  pl.tint(0.10, 0.10, 0.11);
  pl.box(-1.44, 2.24, 1.53, -1.26, 2.44, 1.56, TILE.plaster, '');
  pl.box(1.26, 2.24, 1.53, 1.44, 2.44, 1.56, TILE.plaster, '');
  pl.tint(1, 1, 1);
  for (const x of [-2.2, 2.2]) sl.cyl(x, -1.4, 0.1, 4.3, 0.055, 0.05, 6, TILE.steel, 'top');
  window4(bc.parts, 'plaster', -1.35, -1.7, 1.95, 2.35, 0.35, '-z', TILE.plaster);
  window4(bc.parts, 'plaster', 1.35, -1.7, 1.95, 2.35, 0.35, '-z', TILE.plaster);
  waterTank(bc, 4.0, 0.2, 0.10, 1.6, 0.70, 1.15);
  lantern(bc, 0, 2.30, 1.52, '+z', 0.32);
  return { top: 4.3 };
}

// ---------------------------------------------------------------------------------------------------------
// TENTED CAMP UNIT
// ---------------------------------------------------------------------------------------------------------
function buildTent(bc) {
  const po = bc.f('pole'), ti = bc.f('timber'), ca = bc.f('canvas'), sl = bc.f('steel');
  const DY = 0.55;
  const X = 2.4, Z0 = -2.4, Z1 = 2.9;
  for (const [x, z] of [[-X + 0.3, Z0 + 0.3], [X - 0.3, Z0 + 0.3], [-X + 0.3, Z1 - 0.3], [X - 0.3, Z1 - 0.3], [-X + 0.3, 0.2], [X - 0.3, 0.2]]) {
    po.cyl(x, z, -0.4, DY - 0.14, 0.13, 0.12, 8, TILE.pole, '');
  }
  po.beam(-X, DY - 0.20, Z0 + 0.3, X, DY - 0.20, Z0 + 0.3, 0.12, 0.16, TILE.pole);
  po.beam(-X, DY - 0.20, Z1 - 0.3, X, DY - 0.20, Z1 - 0.3, 0.12, 0.16, TILE.pole);
  deck(ti, -X, Z0, X, Z1, DY, TILE.timber, 0.12, 0.19, true);

  // ridge tent
  const RY = DY + 2.35, WY = DY + 1.45, HX = 1.95, TZ0 = Z0 + 0.25, TZ1 = 1.35;
  po.cyl(0, TZ0, DY, RY + 0.15, 0.065, 0.06, 6, TILE.pole, '');
  po.cyl(0, TZ1, DY, RY + 0.15, 0.065, 0.06, 6, TILE.pole, '');
  po.beam(0, RY, TZ0, 0, RY, TZ1, 0.06, 0.06, TILE.pole);
  // walls
  ca.box(-HX, DY, TZ0, -HX + 0.04, WY, TZ1, TILE.canvas, '');
  ca.box(HX - 0.04, DY, TZ0, HX, WY, TZ1, TILE.canvas, '');
  ca.box(-HX, DY, TZ0, HX, WY, TZ0 + 0.04, TILE.canvas, '');
  // roof slopes + fly sheet slightly above
  for (const o of [0, 0.16]) {
    const s = o > 0 ? 0.28 : 0;
    ca.quad([-HX - s, WY - o * 0.4, TZ0 - s], [-HX - s, WY - o * 0.4, TZ1 + s], [0, RY + o, TZ1 + s], [0, RY + o, TZ0 - s],
      0, 0, (TZ1 - TZ0) / TILE.canvas, 2.2 / TILE.canvas);
    ca.quad([HX + s, WY - o * 0.4, TZ1 + s], [HX + s, WY - o * 0.4, TZ0 - s], [0, RY + o, TZ0 - s], [0, RY + o, TZ1 + s],
      0, 0, (TZ1 - TZ0) / TILE.canvas, 2.2 / TILE.canvas);
  }
  // gable end above the door, and rolled-up flaps
  ca.tri3([-HX, WY, TZ0], [HX, WY, TZ0], [0, RY, TZ0], [0, 0], [2 * HX / TILE.canvas, 0], [HX / TILE.canvas, 0.9 / TILE.canvas]);
  ca.tri3([HX, WY, TZ1], [-HX, WY, TZ1], [0, RY, TZ1], [0, 0], [2 * HX / TILE.canvas, 0], [HX / TILE.canvas, 0.9 / TILE.canvas]);
  ca.cyl(-1.15, TZ1 + 0.02, WY + 0.35, WY + 1.0, 0.13, 0.13, 8, TILE.canvas, 'topbot');
  ca.cyl(1.15, TZ1 + 0.02, WY + 0.35, WY + 1.0, 0.13, 0.13, 8, TILE.canvas, 'topbot');
  // guy ropes
  for (const [ax, az, bx, bz] of [[-HX - 0.28, TZ0 - 0.28, -X - 0.8, Z0 - 0.5], [HX + 0.28, TZ0 - 0.28, X + 0.8, Z0 - 0.5],
    [-HX - 0.28, TZ1 + 0.28, -X - 0.8, 2.0], [HX + 0.28, TZ1 + 0.28, X + 0.8, 2.0]]) {
    sl.beam(ax, WY + 0.55, az, bx, -0.05, bz, 0.022, 0.022, TILE.steel);
    po.cyl(bx, bz, -0.25, 0.18, 0.045, 0.04, 5, TILE.pole, 'top');
  }
  // small veranda: two chairs and a table
  ti.box(-1.5, DY, 1.75, -0.6, DY + 0.42, 2.6, TILE.timber, '-y');
  ti.box(-1.5, DY + 0.42, 1.75, -0.6, DY + 0.95, 1.9, TILE.timber, '-y');
  ti.box(0.6, DY, 1.75, 1.5, DY + 0.42, 2.6, TILE.timber, '-y');
  ti.box(0.6, DY + 0.42, 1.75, 1.5, DY + 0.95, 1.9, TILE.timber, '-y');
  railing(ti, -X, Z1, X, Z1, DY, 0.85, TILE.timber);
  stair(bc, 0, Z1, Z1 + 0.9, DY, -0.05, 0.9, 3);
  lantern(bc, -0.9, DY + 1.9, TZ1 + 0.05, '+z', 0.28);
  return { top: RY + 0.3 };
}

// ---------------------------------------------------------------------------------------------------------
// CAR PARK
// ---------------------------------------------------------------------------------------------------------
function buildParking(bc) {
  const co = bc.f('concrete'), po = bc.f('pole'), st = bc.f('stone'), pl = bc.f('plaster'), ti = bc.f('timber');
  const X = 13.5, Z = 8.5;
  co.box(-X, -0.18, -Z, X, 0.04, Z, TILE.concrete, '-y');
  // painted bay lines
  pl.tint(WHITE[0] * 0.8, WHITE[1] * 0.8, WHITE[2] * 0.72);
  for (let i = 0; i <= 10; i++) {
    const x = -11.5 + i * 2.3;
    pl.box(x - 0.06, 0.045, -Z + 0.8, x + 0.06, 0.062, -Z + 5.6, TILE.plaster, '-y');
    pl.box(x - 0.06, 0.045, Z - 5.6, x + 0.06, 0.062, Z - 0.8, TILE.plaster, '-y');
  }
  pl.tint(1, 1, 1);
  // timber kerb logs along the ends of the bays
  for (const z of [-Z + 5.8, Z - 5.8]) {
    for (let i = 0; i < 10; i++) {
      const x = -11.5 + i * 2.3 + 1.15;
      const m = new THREE.Matrix4().makeRotationZ(Math.PI / 2);
      m.premultiply(new THREE.Matrix4().makeTranslation(x, 0.18, z));
      po.xform(m); po.cyl(0, 0, -0.85, 0.85, 0.16, 0.15, 8, TILE.pole, 'topbot'); po.xform(null);
    }
  }
  // shade island
  st.box(-2.4, 0.04, -1.5, 2.4, 0.30, 1.5, TILE.stone, '-y');
  co.tint(0.9, 0.85, 0.7);
  co.box(-2.2, 0.30, -1.3, 2.2, 0.36, 1.3, TILE.concrete, '-y');
  co.tint(1, 1, 1);
  // bollards and a couple of benches
  for (let i = 0; i < 6; i++) {
    const x = -X + 1.6 + i * ((2 * X - 3.2) / 5);
    po.cyl(x, Z - 0.6, 0.02, 0.92, 0.10, 0.09, 6, TILE.pole, 'top');
  }
  for (const s of [-1, 1]) {
    ti.box(s * 3.6 - 0.9, 0.36, -0.22, s * 3.6 + 0.9, 0.46, 0.22, TILE.timber, '-y');
    for (const dx of [-0.75, 0.75]) po.cyl(s * 3.6 + dx, 0, 0.30, 0.38, 0.07, 0.07, 6, TILE.pole, '');
  }
  lampPost(bc, -X + 1.2, -Z + 1.2, 0.04, 4.0);
  lampPost(bc, X - 1.2, -Z + 1.2, 0.04, 4.0);
  lampPost(bc, -X + 1.2, Z - 1.2, 0.04, 4.0);
  lampPost(bc, X - 1.2, Z - 1.2, 0.04, 4.0);
  return { top: 4.4 };
}

// ---------------------------------------------------------------------------------------------------------
// FENCE GATE
// ---------------------------------------------------------------------------------------------------------
function buildFenceGate(bc) {
  const po = bc.f('pole'), ti = bc.f('timber'), sl = bc.f('steel'), st = bc.f('stone');
  for (const s of [-1, 1]) {
    po.cyl(s * 3.0, 0, -0.6, 2.85, 0.20, 0.17, 10, TILE.pole, 'top');
    footing(st, s * 3.0, 0, -0.1, 0.34, 0.18);
    po.beam(s * 3.0, 2.55, 0, s * 4.4, 0.3, 0, 0.12, 0.14, TILE.pole);      // raking brace
    po.cyl(s * 4.4, 0, -0.5, 0.35, 0.14, 0.13, 8, TILE.pole, 'top');
  }
  po.beam(-3.15, 2.72, 0, 3.15, 2.72, 0, 0.16, 0.20, TILE.pole);
  // two gate leaves with diagonal bracing
  for (const s of [-1, 1]) {
    const x0 = s > 0 ? 0.06 : -2.86, x1 = s > 0 ? 2.86 : -0.06;
    ti.box(x0, 0.35, -0.05, x1, 0.48, 0.05, TILE.timber, '');
    ti.box(x0, 1.05, -0.05, x1, 1.18, 0.05, TILE.timber, '');
    ti.box(x0, 1.75, -0.05, x1, 1.88, 0.05, TILE.timber, '');
    ti.box(x0, 0.35, -0.06, x0 + 0.14, 2.05, 0.06, TILE.timber, '');
    ti.box(x1 - 0.14, 0.35, -0.06, x1, 2.05, 0.06, TILE.timber, '');
    ti.beam(x0 + 0.05, 0.42, 0, x1 - 0.05, 1.98, 0, 0.11, 0.09, TILE.timber);
    sl.box(s > 0 ? 2.80 : -2.98, 0.55, -0.09, s > 0 ? 2.98 : -2.80, 0.75, 0.09, TILE.steel, '');
    sl.box(s > 0 ? 2.80 : -2.98, 1.65, -0.09, s > 0 ? 2.98 : -2.80, 1.85, 0.09, TILE.steel, '');
  }
  return { top: 2.9 };
}

// ---------------------------------------------------------------------------------------------------------

export const BUILDERS = {
  gate: buildGate,
  lodge: buildLodge,
  tent: buildTent,
  restaurant: buildRestaurant,
  shop: buildShop,
  ranger: buildRanger,
  clinic: buildClinic,
  workshop: buildWorkshop,
  hide: buildHide,
  tower: buildTower,
  pump: buildPump,
  feeder: buildFeeder,
  house: buildHouse,
  toilets: buildToilets,
  parking: buildParking,
  fencegate: buildFenceGate,
};
