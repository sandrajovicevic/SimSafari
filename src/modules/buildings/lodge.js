// The safari lodge: the hero building.
//
// One huge pyramidal makuti roof carried on round timber poles over a veranda deck, a plastered
// great room with a stone base course, two guest wings of six rooms each, a battered stone plinth
// the whole thing stands on, a stone terrace with a plunge pool, chimney, water tank, solar array
// and satellite dish. Everything merges into ~7 material families.
import {
  TILE, deck, railing, window4, door, plinth, poleRow, footing, lantern,
  hipThatch, waterTank, solarArray, satelliteDish, stair,
} from './common.js';

export function buildLodge(bc) {
  const st = bc.f('stone'), ti = bc.f('timber'), pl = bc.f('plaster'), co = bc.f('concrete'), wa = bc.f('water');
  const po = bc.f('pole');

  // ---- plinth ---------------------------------------------------------------------------------
  const PT = plinth(st, -18, -11.5, 18, 12.0, -0.45, 1.35, TILE.stone, 0.16);   // ~0.9 above grade

  // ---- great room -----------------------------------------------------------------------------
  const GX = 9.5, GZ0 = -10.0, GZ1 = 3.5;
  const wallTop = PT + 4.05;
  st.box(-GX - 0.06, PT, GZ0 - 0.06, GX + 0.06, PT + 1.15, GZ1 + 0.06, TILE.stone, '-y');
  pl.box(-GX, PT + 1.15, GZ0, GX, wallTop, GZ1, TILE.plaster, '-y');
  ti.box(-GX - 0.14, wallTop, GZ0 - 0.14, GX + 0.14, wallTop + 0.19, GZ1 + 0.14, TILE.timber, '-y');

  // front (+z) — two tall windows and a double door onto the deck
  window4(bc.parts, 'plaster', -5.4, GZ1, PT + 1.25, PT + 3.35, 1.30, '+z', TILE.plaster);
  window4(bc.parts, 'plaster', 5.4, GZ1, PT + 1.25, PT + 3.35, 1.30, '+z', TILE.plaster);
  door(bc.parts, 'plaster', 0, GZ1, PT, 1.35, 2.75, '+z', TILE.plaster);
  // back (-z) — clerestory windows
  for (const x of [-6.2, 0, 6.2]) window4(bc.parts, 'plaster', x, GZ0, PT + 1.6, PT + 3.2, 1.05, '-z', TILE.plaster);
  // sides
  for (const z of [-7.4, -3.2]) {
    window4(bc.parts, 'plaster', GX, z, PT + 1.35, PT + 3.15, 0.95, '+x', TILE.plaster);
    window4(bc.parts, 'plaster', -GX, z, PT + 1.35, PT + 3.15, 0.95, '-x', TILE.plaster);
  }

  // ---- guest wings (6 rooms each) --------------------------------------------------------------
  for (const s of [-1, 1]) {
    const x0 = s < 0 ? -17.6 : 12.6, x1 = s < 0 ? -12.6 : 17.6;
    const z0 = -9.6, z1 = 3.0;
    const wt = PT + 3.15;
    st.box(x0 - 0.06, PT, z0 - 0.06, x1 + 0.06, PT + 1.0, z1 + 0.06, TILE.stone, '-y');
    pl.box(x0, PT + 1.0, z0, x1, wt, z1, TILE.plaster, '-y');
    ti.box(x0 - 0.13, wt, z0 - 0.13, x1 + 0.13, wt + 0.17, z1 + 0.13, TILE.timber, '-y');
    // six rooms: four windows on the outer wall, two on the end wall
    const ox = s < 0 ? x0 : x1;
    const axis = s < 0 ? '-x' : '+x';
    for (let i = 0; i < 4; i++) {
      const z = z0 + 1.9 + i * 2.95;
      window4(bc.parts, 'plaster', ox, z, PT + 1.25, PT + 2.65, 0.72, axis, TILE.plaster);
    }
    for (const dx of [-1.6, 1.6]) window4(bc.parts, 'plaster', (x0 + x1) * 0.5 + dx, z1, PT + 1.25, PT + 2.65, 0.62, '+z', TILE.plaster);
    // wing roof + veranda poles along the courtyard side
    hipThatch(bc, (x0 + x1) * 0.5, (z0 + z1) * 0.5, x1 - x0 + 1.7, z1 - z0 + 1.7, wt - 0.10, 2.75, 0.85, { seg: 11 });
    // small private stoep in front of each wing
    const ix = s < 0 ? x1 + 1.5 : x0 - 1.5;
    poleRow(po, ix, z0 + 1.2, ix, z1 - 1.2, 4, PT, wt - 0.15, 0.14);
    deck(ti, Math.min(ix - 0.9, x1), z0 + 0.6, Math.max(ix + 0.9, x0), z1 - 0.4, PT + 0.02, TILE.timber, 0.12, 0.2, true);
  }

  // ---- veranda deck ----------------------------------------------------------------------------
  const DZ0 = GZ1, DZ1 = 12.0, DX = 11.5;
  deck(ti, -DX, DZ0, DX, DZ1, PT + 0.03, TILE.timber, 0.16, 0.21, false);
  // deck edge fascia
  ti.box(-DX - 0.1, PT - 0.34, DZ1 - 0.12, DX + 0.1, PT + 0.04, DZ1 + 0.08, TILE.timber, '');
  ti.box(-DX - 0.12, PT - 0.34, DZ0, -DX + 0.06, PT + 0.04, DZ1, TILE.timber, '');
  ti.box(DX - 0.06, PT - 0.34, DZ0, DX + 0.12, PT + 0.04, DZ1, TILE.timber, '');

  // veranda poles carrying the great roof
  const eaveY = PT + 3.85;
  const postZ = DZ1 - 0.7;
  for (let i = 0; i < 7; i++) {
    const x = -10.4 + i * (20.8 / 6);
    po.cyl(x, postZ, PT, eaveY - 0.18, 0.190, 0.158, 10, TILE.pole, 'top');
    footing(st, x, postZ, PT - 0.02, 0.34, 0.16);
  }
  for (const s of [-1, 1]) {
    for (const z of [DZ0 + 2.6, DZ0 + 6.0]) {
      po.cyl(s * (DX - 0.6), z, PT, eaveY - 0.18, 0.190, 0.158, 10, TILE.pole, 'top');
      footing(st, s * (DX - 0.6), z, PT - 0.02, 0.34, 0.16);
    }
  }
  // ring beam on the pole heads
  ti.beam(-10.9, eaveY - 0.10, postZ, 10.9, eaveY - 0.10, postZ, 0.20, 0.30, TILE.timber);
  ti.beam(-(DX - 0.6), eaveY - 0.10, DZ0 + 1.4, -(DX - 0.6), eaveY - 0.10, postZ, 0.20, 0.30, TILE.timber);
  ti.beam(DX - 0.6, eaveY - 0.10, DZ0 + 1.4, DX - 0.6, eaveY - 0.10, postZ, 0.20, 0.30, TILE.timber);
  // rafters from the ring beam back to the wall plate
  for (let i = 0; i < 7; i++) {
    const x = -10.4 + i * (20.8 / 6);
    po.beam(x, eaveY - 0.22, postZ, x, wallTop + 0.10, GZ1 - 0.2, 0.115, 0.16, TILE.pole);
  }

  // deck railing, open in the middle where the stair drops to the terrace
  railing(ti, -DX, DZ1, -1.9, DZ1, PT + 0.03, 1.02, TILE.timber);
  railing(ti, 1.9, DZ1, DX, DZ1, PT + 0.03, 1.02, TILE.timber);
  railing(ti, -DX, DZ0 + 0.4, -DX, DZ1, PT + 0.03, 1.02, TILE.timber);
  railing(ti, DX, DZ0 + 0.4, DX, DZ1, PT + 0.03, 1.02, TILE.timber);

  // ---- the big roof ----------------------------------------------------------------------------
  hipThatch(bc, 0, 0.55, 22.5, 25.5, eaveY, 5.9, 1.0, { seg: 16, underside: true, rows: 12 });

  // ---- chimney ---------------------------------------------------------------------------------
  st.box(-6.6, PT, GZ0 - 0.9, -5.2, eaveY + 3.4, GZ0 + 0.5, TILE.stone, '-y');
  st.box(-6.85, eaveY + 3.4, GZ0 - 1.15, -4.95, eaveY + 3.62, GZ0 + 0.75, TILE.stone, '-y');
  st.box(-6.5, eaveY + 3.62, GZ0 - 0.8, -5.3, eaveY + 4.0, GZ0 + 0.4, TILE.stone, '-y');

  // ---- back-of-house: tank, solar, dish --------------------------------------------------------
  waterTank(bc, 15.4, -11.4, 0.0, 2.4, 1.05, 1.7);
  solarArray(bc, -14.6, -11.6, 1.7, 4, 1.0, 1.6, 0.45);
  satelliteDish(bc, 11.8, -11.2, 0.9, 0.62);

  // ---- terrace and plunge pool -----------------------------------------------------------------
  const TY = 0.12;
  st.box(-12.5, -0.35, DZ1, 12.5, TY, 15.9, TILE.stone, '-y');
  stair(bc, 0, DZ1, DZ1 + 2.0, PT + 0.03, TY, 3.2, 5);

  const px0 = 3.8, px1 = 11.2, pz0 = 12.9, pz1 = 15.4;
  const cw = 0.42;
  st.box(px0 - cw, TY, pz0 - cw, px1 + cw, TY + 0.16, pz0, TILE.stone, '-y');
  st.box(px0 - cw, TY, pz1, px1 + cw, TY + 0.16, pz1 + cw, TILE.stone, '-y');
  st.box(px0 - cw, TY, pz0, px0, TY + 0.16, pz1, TILE.stone, '-y');
  st.box(px1, TY, pz0, px1 + cw, TY + 0.16, pz1, TILE.stone, '-y');
  // basin: inward-facing walls + floor
  const bd = TY - 1.15;
  co.quad([px0, bd, pz0], [px1, bd, pz0], [px1, TY, pz0], [px0, TY, pz0], 0, 0, (px1 - px0) / TILE.concrete, 1.15 / TILE.concrete);
  co.quad([px1, bd, pz1], [px0, bd, pz1], [px0, TY, pz1], [px1, TY, pz1], 0, 0, (px1 - px0) / TILE.concrete, 1.15 / TILE.concrete);
  co.quad([px0, bd, pz1], [px0, bd, pz0], [px0, TY, pz0], [px0, TY, pz1], 0, 0, (pz1 - pz0) / TILE.concrete, 1.15 / TILE.concrete);
  co.quad([px1, bd, pz0], [px1, bd, pz1], [px1, TY, pz1], [px1, TY, pz0], 0, 0, (pz1 - pz0) / TILE.concrete, 1.15 / TILE.concrete);
  co.plate(px0, pz0, px1, pz1, bd, TILE.concrete, true);
  // Water tint: was near-black (0.02, 0.062, 0.075), which at low sun angles reflected almost no
  // sky/env light and rendered the whole pool as a flat black hole in screenshots. Raised to a true
  // dark teal-blue so the pool reads as water even at glancing reflection angles, while still relying
  // on the low roughness / envMapIntensity for the specular highlight that sells it as water.
  wa.tint(0.05, 0.16, 0.19);
  wa.plate(px0, pz0, px1, pz1, TY - 0.14, 1.0, true);
  wa.tint(1, 1, 1);

  // ---- lighting ---------------------------------------------------------------------------------
  for (let i = 0; i < 7; i += 2) {
    const x = -10.4 + i * (20.8 / 6);
    lantern(bc, x, PT + 2.55, postZ - 0.2, '+z', 0.34);
  }
  lantern(bc, -2.0, PT + 2.6, GZ1 + 0.16, '+z', 0.34);
  lantern(bc, 2.0, PT + 2.6, GZ1 + 0.16, '+z', 0.34);

  return { top: eaveY + 5.9 };
}
