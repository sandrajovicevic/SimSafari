// Plant tool (Wave P1, docs/specs/p1-food-web.md): click to plant a disc of one core/Plants.js plant
// through `simulation.plant()` (which prices it at cost × ha, charges it and writes world.vegetation).
// The ring previews the disc (green = affordable, red = not / nothing plantable), the vegetation overlay
// shows that plant's cover while the tool is active, and every planting is undoable
// (`simulation.unplant(token)` restores the exact prior cover and refunds).
import { PLANTS, PLANT_INDEX } from '../../core/Plants.js';

const QUOTE = { cells: 0, ha: 0, cost: 0, affordable: false };

export const PlantTool = {
  id: 'plant',
  needs: ['simulation'],
  defaults: { plant: 'red_oat', radius: 16 },

  activate(ctx, S) {
    S.plantQuote = { key: '', q: QUOTE };
    S.vegOverlay?.show(ctx.world, S.options.plant);
  },

  deactivate(ctx, S) {
    S.ring.mesh.visible = false;
    if (!S.vegOverlaySticky) S.vegOverlay?.hide();
    else S.vegOverlay?.setPlant(null);
    ctx.events.emit('tool:preview', null);
  },

  pointerDown(ctx, S, e) {
    if (e.button !== 0 || !e.ground) return;
    const sim = ctx.modules.get('simulation');
    const type = S.options.plant, p = PLANTS[PLANT_INDEX[type]];
    if (!sim?.plant || !p) return;
    const { x, z } = e.ground, radius = S.options.radius;
    const cover = +(p.maxCover * 0.6).toFixed(3);
    const res = sim.plant(type, x, z, radius, cover);
    if (!res?.ok) {
      ctx.events.emit('ui:notify', { level: 'warn', text: res?.error === 'no plantable cells in the disc' ? `Nothing to plant here (water)` : `Cannot afford ${p.name} ($${Math.round(res?.cost || 0).toLocaleString()})` });
      return;
    }
    const state = { token: res.undo };
    S.undo.push({
      label: 'plant',
      undo(ctx) { const s2 = ctx.modules.get('simulation'); if (s2 && state.token) s2.unplant(state.token); },
      redo(ctx) { const s2 = ctx.modules.get('simulation'); const r2 = s2?.plant(type, x, z, radius, cover); state.token = r2?.ok ? r2.undo : null; },
    });
    S.plantQuote.key = ''; // cells now planted: re-quote
    ctx.events.emit('tool:applied', { tool: 'plant', detail: { plant: type, cells: res.cells, ha: res.ha, cost: Math.round(res.cost) } });
    ctx.events.emit('ui:notify', { level: 'info', text: `Planted ${p.name}: ${res.ha.toFixed(2)} ha for $${Math.round(res.cost).toLocaleString()}` });
  },

  update(ctx, S) {
    const input = ctx.app.input, sim = ctx.modules.get('simulation');
    if (!input.groundValid || !sim) { S.ring.mesh.visible = false; return; }
    const { x, z } = input.ground, r = S.options.radius;
    // re-price only when the disc lands on a different set of 16 m cells (quote allocates a small object)
    const cell = ctx.world.vegetation.cell;
    const key = `${S.options.plant}|${r}|${Math.round(x / (cell * 0.5))}|${Math.round(z / (cell * 0.5))}`;
    if (key !== S.plantQuote.key) {
      S.plantQuote.key = key;
      S.plantQuote.q = sim.plantQuote?.(S.options.plant, x, z, r) || QUOTE;
      ctx.events.emit('tool:preview', { tool: 'plant', plant: S.options.plant, cost: Math.round(S.plantQuote.q.cost), ha: S.plantQuote.q.ha, affordable: S.plantQuote.q.affordable });
    }
    S.ring.setColor(S.plantQuote.q.affordable ? 0x7dffb0 : 0xff5a5a);
    S.ring.update(ctx.world, x, z, r);
    S.ring.mesh.visible = true;
  },

  key(ctx, S, e) {
    if (e.code === 'BracketLeft') S.options.radius = Math.max(8, S.options.radius - 4);
    else if (e.code === 'BracketRight') S.options.radius = Math.min(64, S.options.radius + 4);
  },
};
