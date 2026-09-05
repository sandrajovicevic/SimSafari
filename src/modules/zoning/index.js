// zoning — habitat/visitor/service zone painting, habitat quality tracking, ground overlay decal and
// boundary fences. Owns world.grid.zone, world.grid.habitatId, world.habitats. See README.md for the
// full API and docs/specs/zoning.md for the brief.
import * as THREE from 'three';
import { ZONE } from '../../core/World.js';
import { Z } from './state.js';
import {
  paint, paintCells, erase, fill, getZone, cellsInRadius, isBuildable, nearestHabitat,
  recomputeNoBuild, rectFromWorld,
} from './grid.js';
import { rebuildHabitats, boundary, getHabitatQuality } from './habitats.js';
import { buildOverlay, setOverlay, updateOverlay, markOverlayDirty, markOverlayHeightsDirty, disposeOverlay } from './overlay.js';
import { buildFences, rebuildFences, disposeFences } from './fences.js';
import { presets, stage } from './showcase.js';

let ctx = null;
let pendingSpeciesRefresh = false;
let speciesRefreshTimer = 0;

function onTerrainModified(p) {
  const rect = (p && Number.isFinite(p.x0)) ? rectFromWorld(p.x0, p.z0, p.x1, p.z1, 1) : undefined;
  recomputeNoBuild(rect);
  rebuildHabitats();
  rebuildFences();
  markOverlayDirty();
  markOverlayHeightsDirty();
}

function onRoadChanged() {
  recomputeNoBuild(); // roads rebuild wholesale and carry no bounds — sweep the whole grid
  rebuildHabitats();
  rebuildFences();
  markOverlayDirty();
}

function onBuildingChanged(p) {
  const b = ctx.world.buildings.get(p?.id);
  const rect = b ? rectFromWorld(b.x - (b.w || 10), b.z - (b.d || 10), b.x + (b.w || 10), b.z + (b.d || 10), 1) : undefined;
  recomputeNoBuild(rect);
  rebuildHabitats();
  rebuildFences();
  markOverlayDirty();
}

const api = {
  ZONE,
  // ---- painting ----
  paint, paintCells, erase, fill, getZone,
  // ---- queries ----
  cellsInRadius, isBuildable, nearestHabitat,
  // ---- habitats ----
  getHabitat: (id) => Z.world.habitats.get(id) || null,
  habitatAt(x, z) {
    const { index } = Z.world.cellAt(x, z);
    const id = Z.world.grid.habitatId[index];
    return id ? Z.world.habitats.get(id) || null : null;
  },
  listHabitats: () => [...Z.world.habitats.values()],
  getHabitatQuality,
  boundary,
  renameHabitat(id, name) {
    const h = Z.world.habitats.get(id);
    if (!h) return false;
    h.name = String(name);
    ctx.events.emit('habitat:changed', { id });
    return true;
  },
  // ---- overlay ----
  setOverlay,
  getOverlay: () => Z.overlayOn,
};

export default {
  id: 'zoning',
  version: 1,
  dependencies: [],
  optional: ['terrain', 'roads', 'props', 'animals', 'simulation'],
  api,

  async init(c) {
    ctx = c;
    Z.ctx = ctx;
    Z.world = ctx.world;
    Z.group = new THREE.Group();
    Z.group.name = 'zoning';
    ctx.scene.add(Z.group);
    try {
      recomputeNoBuild(); // whole grid: flag every existing road/water cell before anything paints over it
      buildOverlay(ctx);
      buildFences(ctx);
      rebuildHabitats();
      rebuildFences();
    } catch (err) {
      ctx.log.error('[zoning] init build failed', err);
    }
    ctx.events.on('terrain:modified', onTerrainModified);
    ctx.events.on('terrain:ready', () => { recomputeNoBuild(); rebuildHabitats(); rebuildFences(); markOverlayDirty(); markOverlayHeightsDirty(); });
    ctx.events.on('road:changed', onRoadChanged);
    ctx.events.on('building:placed', onBuildingChanged);
    ctx.events.on('building:removed', onBuildingChanged);
    // species-set changes are cheap to fold into the next habitat rebuild but frequent (herds spawning/
    // dying) — batch them instead of a full flood-fill rebuild per animal.
    ctx.events.on('animal:spawned', () => { pendingSpeciesRefresh = true; });
    ctx.events.on('animal:died', () => { pendingSpeciesRefresh = true; });
  },

  update(dt, t) {
    updateOverlay(dt);
    if (pendingSpeciesRefresh) {
      speciesRefreshTimer += dt;
      if (speciesRefreshTimer > 1.2) { speciesRefreshTimer = 0; pendingSpeciesRefresh = false; rebuildHabitats(); }
    }
  },

  tick() {},

  dispose() {
    disposeOverlay();
    disposeFences();
    Z.group?.removeFromParent();
    Z.ctx = null; Z.world = null; Z.group = null;
    Z.nextHabitatId = 1; Z.overlayOn = false;
    ctx = null; pendingSpeciesRefresh = false; speciesRefreshTimer = 0;
  },

  showcase: { presets, stage },
};
