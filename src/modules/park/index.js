// park — DEMO (wave 3): the complete playable demo park. Composes every other module through its
// public API into a running game state — generated terrain, an entrance gate + lodge complex, a
// gravel loop road with two dirt spurs, four fenced habitats, hides + a viewing tower, biome props,
// four safari vehicles on tour, the economy/simulation running at speed 1, ui + audio alive — and
// registers itself as the default full-game start. See README.md for the full story, the measured
// gameplay-loop numbers and an honest gap list.
import * as THREE from 'three';
import { buildPark, clearPark } from './build.js';
import { presets, stage } from './showcase.js';

let ctx = null;
let group = null;
let built = false;

const api = {
  /** Build the demo park on the world's current seed. Idempotent: clears any prior park state first. */
  async loadDemo() {
    if (!ctx) return null;
    clearPark(ctx);
    const report = await buildPark(ctx, { seed: ctx.world.seed });
    built = true;
    return report;
  },
  /** Start a fresh game. If `seed` differs from the current world seed, terrain is regenerated on it
   * (see README "Known gaps" — every other module's own ctx.rng was already forked from the seed the
   * world was constructed with, so this reseeds terrain + this module's own placement decisions, not
   * every module's internal randomness). Then rebuilds the demo park exactly as loadDemo() does. */
  async newGame(seed) {
    if (!ctx) return null;
    clearPark(ctx);
    const terrain = ctx.modules.get('terrain');
    const useSeed = Number.isFinite(seed) ? seed : ctx.world.seed;
    if (terrain?.generate && useSeed !== ctx.world.seed) {
      ctx.world.seed = useSeed;
      try { terrain.generate({ preset: 'savannah', seed: useSeed }); } catch (err) { ctx.log.error('[park] newGame: terrain.generate failed', err); }
    }
    const report = await buildPark(ctx, { seed: useSeed });
    built = true;
    return report;
  },
  isBuilt: () => built,
};

export default {
  id: 'park',
  version: 1,
  dependencies: [],
  optional: ['terrain', 'environment', 'roads', 'zoning', 'buildings', 'props', 'animals', 'traffic', 'simulation', 'tools', 'ui', 'audio'],
  api,

  async init(c) {
    ctx = c;
    group = new THREE.Group();
    group.name = 'park';
    ctx.scene.add(group);

    if (!ctx.isShowcase) {
      // Full game (no ?module=). There is no save/load system anywhere in this project (checked:
      // no localStorage/save API in src/), so "no save exists" is unconditionally true today — the
      // demo is always the default start. Wait for core:ready: park is last in topological order
      // (every dependency above is optional, so the registry initialises them all first), but the
      // event is the documented, explicit hook per docs/specs/park.md rather than relying on
      // initialisation order alone.
      ctx.events.once('core:ready', () => {
        api.loadDemo().catch((err) => ctx.log.error('[park] loadDemo on core:ready failed', err));
      });
    }
  },

  update() {},
  tick() {},

  dispose() {
    try { clearPark(ctx); } catch {}
    group?.removeFromParent();
    group = null; ctx = null; built = false;
  },

  showcase: { presets, stage },
};
