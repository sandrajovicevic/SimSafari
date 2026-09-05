// Animal tool: pick a species then click inside a habitat to release it (cost); with no species
// selected, clicking an animal inspects it (sets world.selection) instead.
import { COST, pickEntity, spend } from './common.js';
import { ZONE } from '../../core/World.js';

export const AnimalTool = {
  id: 'animal',
  needs: ['animals'],
  defaults: { species: null },

  activate(ctx, S) {},
  deactivate(ctx, S) {},

  pointerDown(ctx, S, e) {
    if (e.button !== 0 || !e.ground) return;
    const animals = ctx.modules.get('animals');
    if (!animals) return;

    if (!S.options.species) {
      const hit = pickEntity(ctx, e.ground.x, e.ground.z, { kinds: ['animal'] });
      S.select(hit ? hit.kind : null, hit ? hit.id : null);
      return;
    }

    const zoning = ctx.modules.get('zoning');
    if (zoning) {
      const cell = ctx.world.cellAt(e.ground.x, e.ground.z);
      if (ctx.world.grid.zone[cell.index] !== ZONE.HABITAT) {
        ctx.events.emit('ui:notify', { level: 'warn', text: 'release animals inside a painted habitat' });
        return;
      }
    } // zoning absent: no habitat constraint to check against (documented simplification)

    const species = S.options.species;
    const ids = animals.spawn(species, e.ground.x, e.ground.z, 1);
    if (!ids || !ids.length) return;
    spend(ctx, COST.animal);
    const state = { ids };
    S.undo.push({
      label: 'animal:release',
      undo(ctx) { const a = ctx.modules.get('animals'); if (a) for (const id of state.ids) a.remove(id); spend(ctx, -COST.animal); },
      redo(ctx) { const a = ctx.modules.get('animals'); if (a) state.ids = a.spawn(species, e.ground.x, e.ground.z, 1) || []; spend(ctx, COST.animal); },
    });
    ctx.events.emit('tool:applied', { tool: 'animal', detail: { species, id: ids[0], cost: COST.animal } });
  },

  update() {},
  key() {},
};
