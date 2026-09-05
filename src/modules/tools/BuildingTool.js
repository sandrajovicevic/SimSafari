// Building tool: ghost preview from buildings.preview(), validity colouring from canPlace(),
// rotation (R / shift+R), place on click, bulldoze mode.
import { COST, pickEntity, spend } from './common.js';

export const BuildingTool = {
  id: 'building',
  needs: ['buildings'],
  defaults: { type: null, rot: 0, bulldoze: false },

  activate(ctx, S) {},

  deactivate(ctx, S) {
    ctx.modules.get('buildings')?.preview?.(null);
  },

  pointerDown(ctx, S, e) {
    if (e.button !== 0 || !e.ground) return;
    const buildings = ctx.modules.get('buildings');
    if (!buildings) return;

    if (S.options.bulldoze) {
      const hit = pickEntity(ctx, e.ground.x, e.ground.z, { kinds: ['building'] });
      if (hit) bulldoze(ctx, S, buildings, hit.id);
      return;
    }
    const type = S.options.type;
    if (!type) return;
    const chk = buildings.canPlace(type, e.ground.x, e.ground.z, S.options.rot);
    if (!chk.ok) { ctx.events.emit('ui:notify', { level: 'warn', text: `cannot place ${type}: ${chk.reasons.join(', ')}` }); return; }
    const id = buildings.place(type, e.ground.x, e.ground.z, S.options.rot);
    if (!id) return;
    const cost = buildings.getType(type)?.cost || 0;
    spend(ctx, cost);
    const rec = buildings.get(id);
    const state = { id };
    S.undo.push({
      label: 'building:place',
      undo(ctx) { const b = ctx.modules.get('buildings'); if (b) b.remove(state.id); spend(ctx, -cost); },
      redo(ctx) { const b = ctx.modules.get('buildings'); if (b) state.id = b.place(type, rec.x, rec.z, rec.rot, { force: true }); spend(ctx, cost); },
    });
    ctx.events.emit('tool:applied', { tool: 'building', detail: { type, id, cost } });
  },

  update(ctx, S) {
    const buildings = ctx.modules.get('buildings');
    if (!buildings) return;
    if (S.options.bulldoze || !S.options.type) { buildings.preview(null); return; }
    const input = ctx.app.input;
    if (!input.groundValid) { buildings.preview(null); return; }
    const chk = buildings.canPlace(S.options.type, input.ground.x, input.ground.z, S.options.rot);
    buildings.preview(S.options.type, input.ground.x, input.ground.z, S.options.rot, chk.ok);
  },

  key(ctx, S, e) {
    if (e.code === 'KeyR') S.options.rot = (S.options.rot + (e.shift ? Math.PI / 2 : Math.PI / 12)) % (Math.PI * 2);
  },
};

function bulldoze(ctx, S, buildings, id) {
  const rec = buildings.get(id);
  if (!rec) return;
  if (!buildings.remove(id)) return;
  const refund = (rec.cost || 0) * COST.bulldozeRefundFrac;
  spend(ctx, -refund);
  if (ctx.world.selection.kind === 'building' && ctx.world.selection.id === id) {
    ctx.world.selection.kind = null; ctx.world.selection.id = null;
    ctx.events.emit('selection:changed', { kind: null, id: null });
  }
  const state = { id };
  S.undo.push({
    label: 'building:bulldoze',
    undo(ctx) {
      const b = ctx.modules.get('buildings'); if (!b) return;
      state.id = b.place(rec.type, rec.x, rec.z, rec.rot, { force: true });
      spend(ctx, refund);
    },
    redo(ctx) {
      const b = ctx.modules.get('buildings'); if (!b) return;
      b.remove(state.id); spend(ctx, -refund);
    },
  });
  ctx.events.emit('tool:applied', { tool: 'building', detail: { bulldoze: true, type: rec.type, refund } });
}
