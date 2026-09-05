// Terrain tool: raise / lower / flatten / smooth / paint-biome, radius + strength, continuous
// drag application, ring cursor, cost charged to world.economy.
//
// Undo strategy (see README "Undo model"):
//  - raise/lower are a pure additive falloff (`H[i] += amount*f`), so the exact inverse is calling
//    the same op again with -amount. We record every (x,z,r,amount) applied during a stroke and
//    replay it negated for undo / forward for redo, entirely through terrain's public API — so
//    terrain's own chunk/water/texture refresh always runs and stays correct.
//  - flatten/smooth/paintBiome are lossy (blend-toward-target / averaging / hard set), so instead we
//    snapshot only the *touched cells'* before-value the first time each is touched in the stroke
//    (a Map, not a full-array clone), then restore those exact values directly into world.terrain on
//    undo/redo and force terrain to refresh by calling `terrain.raise(cx, cz, coverR, 0)` — a
//    zero-amount call that runs terrain's full afterEdit() pipeline (chunk rebuild, water check,
//    control-texture upload, `terrain:modified`) with no actual height change. No terrain-internal
//    access is used; both tricks work purely through the public API in terrain/README.md.
import { COST, clamp, forEachTerrainCell, spend } from './common.js';
import { BIOME } from '../../core/World.js';

const RADIUS_MIN = 2, RADIUS_MAX = 60;
const STRENGTH_MIN = 1, STRENGTH_MAX = 20;
// A stroke's cumulative |height change| is capped so a stuck button (or, under a slow/contended
// renderer, a real frame gap of many seconds landing in a single dt) cannot dig/build an unbounded
// pit or mountain — dt itself is clamped upstream to 0.1s (core/App.js) but frame *count* is not.
const MAX_STROKE_RISE = 14;

export const TerrainTool = {
  id: 'terrain',
  needs: ['terrain'],
  defaults: { mode: 'raise', radius: 8, strength: 6, biome: BIOME.GRASS },

  activate(ctx, S) {
    S.stroke = null;
    ctx.log.info(`[tools] terrain tool: mode=${S.options.mode} r=${S.options.radius} s=${S.options.strength}`);
  },

  deactivate(ctx, S) {
    if (S.stroke) endStroke(ctx, S);
    S.ring.mesh.visible = false;
  },

  pointerDown(ctx, S, e) {
    if (e.button !== 0) return;
    const terrain = ctx.modules.get('terrain');
    if (!terrain || !e.ground) return;
    beginStroke(ctx, S);
    applyAt(ctx, S, terrain, e.ground.x, e.ground.z, 1 / 60);
  },

  pointerUp(ctx, S, e) {
    if (e.button !== 0) return;
    if (S.stroke) endStroke(ctx, S);
  },

  update(ctx, S, dt) {
    const terrain = ctx.modules.get('terrain');
    const input = ctx.app.input;
    const dragging = (input.buttons & 1) !== 0;
    if (S.stroke) {
      if (dragging && input.groundValid && terrain) applyAt(ctx, S, terrain, input.ground.x, input.ground.z, dt);
      else if (!dragging) endStroke(ctx, S);
    }
    // ring cursor
    const colors = { raise: 0x7dffb0, lower: 0xff8a5c, flatten: 0x6ec6ff, smooth: 0xffffff, paintBiome: 0xffd35c };
    S.ring.setColor(colors[S.options.mode] || 0x7dffb0);
    if (terrain && input.groundValid) {
      S.ring.update(ctx.world, input.ground.x, input.ground.z, S.options.radius);
      S.ring.mesh.visible = true;
    } else S.ring.mesh.visible = false;
  },

  key(ctx, S, e) {
    if (e.code === 'BracketLeft') S.options.radius = clamp(S.options.radius - 1, RADIUS_MIN, RADIUS_MAX);
    else if (e.code === 'BracketRight') S.options.radius = clamp(S.options.radius + 1, RADIUS_MIN, RADIUS_MAX);
    else if (e.code === 'Comma') S.options.strength = clamp(S.options.strength - 1, STRENGTH_MIN, STRENGTH_MAX);
    else if (e.code === 'Period') S.options.strength = clamp(S.options.strength + 1, STRENGTH_MIN, STRENGTH_MAX);
  },
};

function beginStroke(ctx, S) {
  S.stroke = {
    mode: S.options.mode,
    ops: [],              // raise/lower: [{x,z,r,amount}]
    totalRise: 0,         // raise/lower: cumulative |amount| this stroke, capped at MAX_STROKE_RISE
    before: null,         // flatten/smooth/paintBiome: Map<index, value>
    touched: null,         // { ix0,ix1,iz0,iz1 }
    flattenH: null,
    cost: 0,
  };
}

function growTouched(S, rect) {
  const t = S.stroke.touched;
  if (!t) { S.stroke.touched = { ...rect }; return; }
  t.ix0 = Math.min(t.ix0, rect.ix0); t.ix1 = Math.max(t.ix1, rect.ix1);
  t.iz0 = Math.min(t.iz0, rect.iz0); t.iz1 = Math.max(t.iz1, rect.iz1);
}

function captureBefore(ctx, S, x, z, r, field) {
  if (!S.stroke.before) S.stroke.before = new Map();
  const before = S.stroke.before;
  const rect = forEachTerrainCell(ctx.world, x, z, r, (i) => { if (!before.has(i)) before.set(i, field[i]); });
  growTouched(S, rect);
}

function applyAt(ctx, S, terrain, x, z, dt) {
  const { mode, radius, strength, biome } = S.options;
  const T = ctx.world.terrain;
  const stroke = S.stroke;
  if (mode === 'raise' || mode === 'lower') {
    const remaining = MAX_STROKE_RISE - (stroke.totalRise || 0);
    if (remaining <= 0) return; // stroke maxed out for this drag — ring cursor still tracks the cursor
    let amount = (mode === 'lower' ? -1 : 1) * strength * dt;
    if (Math.abs(amount) > remaining) amount = Math.sign(amount) * remaining;
    terrain.raise(x, z, radius, amount);
    stroke.ops.push({ x, z, r: radius, amount });
    stroke.totalRise = (stroke.totalRise || 0) + Math.abs(amount);
    growTouched(S, forEachTerrainCell(ctx.world, x, z, radius, () => {}));
    stroke.cost += Math.abs(amount) * radius * radius * 0.5 * COST.terrainPerM3;
  } else if (mode === 'flatten') {
    if (stroke.flattenH == null) stroke.flattenH = ctx.world.getHeight(x, z);
    captureBefore(ctx, S, x, z, radius, T.heights);
    terrain.flatten(x, z, radius, stroke.flattenH);
    stroke.cost += radius * radius * 0.35 * COST.terrainPerM3;
  } else if (mode === 'smooth') {
    captureBefore(ctx, S, x, z, radius, T.heights);
    terrain.smooth(x, z, radius, 1);
    stroke.cost += radius * radius * 0.12 * COST.smoothPerApply;
  } else if (mode === 'paintBiome') {
    captureBefore(ctx, S, x, z, radius, T.biome);
    terrain.paintBiome(x, z, radius, biome);
    stroke.cost += Math.PI * radius * radius * COST.paintPerM2 * 0.02;
  }
}

function endStroke(ctx, S) {
  const stroke = S.stroke;
  S.stroke = null;
  if (!stroke) return;
  const { mode, ops, before, touched, cost } = stroke;
  if (!touched) return; // nothing actually applied (e.g. terrain absent mid-stroke)

  const terrain = ctx.modules.get('terrain');
  const world = ctx.world;
  const cx = ((touched.ix0 + touched.ix1) / 2) * world.terrain.cell - world.half;
  const cz = ((touched.iz0 + touched.iz1) / 2) * world.terrain.cell - world.half;
  const coverR = Math.hypot((touched.ix1 - touched.ix0) * world.terrain.cell, (touched.iz1 - touched.iz0) * world.terrain.cell) * 0.5 + 2;

  let op;
  if (mode === 'raise' || mode === 'lower') {
    const opsSnapshot = ops.slice();
    op = {
      label: `terrain:${mode}`,
      undo(ctx) { const t = ctx.modules.get('terrain'); if (!t) return; for (let i = opsSnapshot.length - 1; i >= 0; i--) { const o = opsSnapshot[i]; t.raise(o.x, o.z, o.r, -o.amount); } spend(ctx, -cost); },
      redo(ctx) { const t = ctx.modules.get('terrain'); if (!t) return; for (const o of opsSnapshot) t.raise(o.x, o.z, o.r, o.amount); spend(ctx, cost); },
    };
  } else {
    const field = mode === 'paintBiome' ? world.terrain.biome : world.terrain.heights;
    const afterMap = new Map();
    for (const idx of before.keys()) afterMap.set(idx, field[idx]);
    op = {
      label: `terrain:${mode}`,
      undo(ctx) {
        const f = mode === 'paintBiome' ? ctx.world.terrain.biome : ctx.world.terrain.heights;
        for (const [i, v] of before) f[i] = v;
        ctx.modules.get('terrain')?.raise(cx, cz, coverR, 0); // zero-amount: forces terrain's own refresh pipeline
        spend(ctx, -cost);
      },
      redo(ctx) {
        const f = mode === 'paintBiome' ? ctx.world.terrain.biome : ctx.world.terrain.heights;
        for (const [i, v] of afterMap) f[i] = v;
        ctx.modules.get('terrain')?.raise(cx, cz, coverR, 0);
        spend(ctx, cost);
      },
    };
  }
  spend(ctx, cost);
  S.undo.push(op);
  ctx.events.emit('tool:applied', { tool: 'terrain', detail: { mode, radius: S.options.radius, cost: +cost.toFixed(0) } });
}
