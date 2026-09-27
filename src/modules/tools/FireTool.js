// Fire tool (Wave P2): two modes for fighting wildfires on the vegetation grid.
//   firebreak — drag a stroke; every 16 m cell under the strip is bulldozed to stubble through
//               `simulation.firebreak()` ($200/ha), so fire cannot cross the cleared line. The strip
//               regrows naturally, so long games need re-cutting (real firebreaks need maintenance).
//   water     — click to drop a wet disc through `simulation.waterDrop()` ($120/ha); cells stay too
//               wet to ignite or carry fire for ~6-7 days while the wetness decays.
// No undo in v1: the ground change is a vegetation edit like a terrain stroke; the spend log
// (`simulation.getSpendLog()`) records the charges.
const COST = { firebreak: '$200/ha', water: '$120/ha' };

export const FireTool = {
  id: 'fire',
  needs: ['simulation'],
  defaults: { mode: 'firebreak', radius: 24, width: 16 },

  activate(ctx, S) {
    S.last = null;
    S.spent = 0;
    ctx.log.info(`[tools] fire tool: mode=${S.options.mode}`);
  },

  deactivate(ctx, S) {
    S.ring.mesh.visible = false;
    S.last = null;
    ctx.events.emit('tool:preview', null);
  },

  pointerDown(ctx, S, e) {
    if (e.button !== 0 || !e.ground) return;
    const sim = ctx.modules.get('simulation');
    if (!sim?.firebreak) return;
    const { x, z } = e.ground;
    if (S.options.mode === 'water') {
      const res = sim.waterDrop(x, z, S.options.radius);
      if (!res.ok) { ctx.events.emit('ui:notify', { level: 'warn', text: 'Nothing to wet here (water)' }); return; }
      S.spent += res.cost;
      ctx.events.emit('tool:applied', { tool: 'fire', detail: { mode: 'water', ha: res.ha, cost: Math.round(res.cost) } });
      ctx.events.emit('ui:notify', { level: 'info', text: `Water drop: ${res.ha.toFixed(2)} ha wet for $${Math.round(res.cost).toLocaleString()}` });
      return;
    }
    S.last = { x, z };
    this._cut(ctx, sim, x, z, x, z, S);
  },

  pointerUp(ctx, S) { S.last = null; },

  _cut(ctx, sim, x0, z0, x1, z1, S) {
    const res = sim.firebreak(x0, z0, x1, z1, S.options.width);
    if (!res.ok) return;
    S.spent += res.cost;
    ctx.events.emit('tool:applied', { tool: 'fire', detail: { mode: 'firebreak', ha: res.ha, cost: Math.round(res.cost) } });
  },

  update(ctx, S) {
    const sim = ctx.modules.get('simulation');
    const input = ctx.app.input;
    if (!input.groundValid || !sim) { S.ring.mesh.visible = false; return; }
    const { x, z } = input.ground;
    const r = S.options.mode === 'water' ? S.options.radius : S.options.width * 0.5;
    // drag extension: cut the segment from the last applied point to the cursor
    if (S.options.mode === 'firebreak' && S.last && (input.buttons & 1) !== 0) {
      const dx = x - S.last.x, dz = z - S.last.z;
      if (dx * dx + dz * dz >= 64) { this._cut(ctx, sim, S.last.x, S.last.z, x, z, S); S.last = { x, z }; }
    }
    S.ring.setColor(S.options.mode === 'water' ? 0x59c8ff : 0xffb14d);
    S.ring.update(ctx.world, x, z, r);
    S.ring.mesh.visible = true;
    ctx.events.emit('tool:preview', { tool: 'fire', mode: S.options.mode, cost: 0, ha: 0, note: COST[S.options.mode] });
  },

  key(ctx, S, e) {
    if (e.code === 'BracketLeft') S.options.radius = Math.max(8, S.options.radius - 8);
    else if (e.code === 'BracketRight') S.options.radius = Math.min(96, S.options.radius + 8);
  },
};
