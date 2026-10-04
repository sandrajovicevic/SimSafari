// Wildlife tool (Wave P5): two modes for the enrichment verbs.
//   saltlick — click inside a habitat to place a mineral lick through `simulation.placeSaltLick()`
//              ($3,500 flat): a trampled patch props renders, grazers gather at, and visitors can
//              plan around. Refused outside habitats (the sim decides, this only relays).
//   spray    — click to insecticide a disc through `simulation.sprayLocusts()` ($180/ha): every
//              locust swarm centred inside loses 80% of its density.
// No undo: like the fire tool, these are vegetation/world edits logged in `simulation.getSpendLog()`.
const COST = { saltlick: '$3,500', spray: '$180/ha' };

export const WildlifeTool = {
  id: 'wildlife',
  needs: ['simulation'],
  defaults: { mode: 'saltlick', radius: 48 },

  activate(ctx, S) {
    S.previewKey = '';
    ctx.log.info(`[tools] wildlife tool: mode=${S.options.mode}`);
  },

  deactivate(ctx, S) {
    S.ring.mesh.visible = false;
    ctx.events.emit('tool:preview', null);
  },

  pointerDown(ctx, S, e) {
    if (e.button !== 0 || !e.ground) return;
    const sim = ctx.modules.get('simulation');
    const { x, z } = e.ground;
    if (S.options.mode === 'spray') {
      if (!sim?.sprayLocusts) return;
      const res = sim.sprayLocusts(x, z, S.options.radius);
      if (!res.ok) { ctx.events.emit('ui:notify', { level: 'warn', text: 'No swarms under the spray' }); return; }
      ctx.events.emit('tool:applied', { tool: 'wildlife', detail: { mode: 'spray', swarms: res.swarms, ha: res.ha, cost: Math.round(res.cost) } });
      ctx.events.emit('ui:notify', { level: 'info', text: `Sprayed ${res.ha.toFixed(2)} ha — ${res.swarms} swarm${res.swarms === 1 ? '' : 's'} cut to 20% density ($${Math.round(res.cost).toLocaleString()})` });
      return;
    }
    if (!sim?.placeSaltLick) return;
    const res = sim.placeSaltLick(x, z);
    if (!res.ok) { ctx.events.emit('ui:notify', { level: 'warn', text: res.error === 'not inside a habitat' ? 'Salt licks go inside a habitat' : 'Cannot place a salt lick here' }); return; }
    ctx.events.emit('tool:applied', { tool: 'wildlife', detail: { mode: 'saltlick', id: res.id, cost: res.cost } });
    ctx.events.emit('ui:notify', { level: 'info', text: `Salt lick placed ($${res.cost.toLocaleString()}) — grazers will gather` });
  },

  update(ctx, S) {
    const input = ctx.app.input;
    if (!input.groundValid) { S.ring.mesh.visible = false; return; }
    const { x, z } = input.ground;
    const r = S.options.mode === 'spray' ? S.options.radius : 10;
    S.ring.setColor(S.options.mode === 'spray' ? 0x9fd677 : 0xd8c08a);
    S.ring.update(ctx.world, x, z, r);
    S.ring.mesh.visible = true;
    const pk = S.options.mode + '|' + S.options.radius;
    if (pk !== S.previewKey) {
      S.previewKey = pk;
      ctx.events.emit('tool:preview', { tool: 'wildlife', mode: S.options.mode, cost: 0, ha: 0, note: COST[S.options.mode] });
    }
  },

  key(ctx, S, e) {
    if (e.code === 'BracketLeft') S.options.radius = Math.max(16, S.options.radius - 16);
    else if (e.code === 'BracketRight') S.options.radius = Math.min(128, S.options.radius + 16);
  },
};
