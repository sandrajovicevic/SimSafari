// Select/inspect tool (the default tool): click picks animal/building/road/habitat, sets
// world.selection, emits selection:changed. Esc clears; Delete bulldozes (handled centrally in
// index.js so every tool shares the same confirm-to-bulldoze flow on whatever is selected).
import { pickEntity } from './common.js';

export const SelectTool = {
  id: 'select',
  needs: [],
  defaults: {},

  activate(ctx, S) {},
  deactivate(ctx, S) {},

  pointerDown(ctx, S, e) {
    if (e.button !== 0) return;
    if (!e.ground) { S.select(null, null); return; }
    const hit = pickEntity(ctx, e.ground.x, e.ground.z);
    S.select(hit ? hit.kind : null, hit ? hit.id : null);
  },

  pointerUp() {},
  update() {},
  key() {},
};
