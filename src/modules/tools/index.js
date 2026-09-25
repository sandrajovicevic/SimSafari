// tools — the player's hands. Tool framework (activate/deactivate/current, undo/redo >=50 steps),
// owner of world.selection, drives terrain/roads/zoning/buildings/animals through their public APIs,
// renders cursors/ghosts/preview ribbons in the WebGL canvas. See README.md for the full API.
import { ZONE } from '../../core/World.js';
import * as THREE from 'three';
import { UndoStack } from './UndoStack.js';
import { RingCursor, RoadRibbon, SelectionMarker } from './cursors.js';
import { COST, DELETE_CONFIRM_WINDOW, entityPosition, spend } from './common.js';
import { SelectTool } from './SelectTool.js';
import { TerrainTool } from './TerrainTool.js';
import { RoadTool } from './RoadTool.js';
import { ZoneTool } from './ZoneTool.js';
import { BuildingTool } from './BuildingTool.js';
import { AnimalTool } from './AnimalTool.js';
import { presets, stage } from './showcase.js';

const TOOLS = {
  select: SelectTool, terrain: TerrainTool, road: RoadTool, zone: ZoneTool, building: BuildingTool, animal: AnimalTool,
};

let ctx = null;
const S = {
  group: null, undo: null, ring: null, ribbon: null, marker: null,
  current: 'select', toolObj: null, options: {},
  road: { points: [], lastClickT: 0, lastClickPt: null },
  stroke: null, zoneStroke: null,
  pendingDelete: null, // { kind, id, expires }
};
S.select = (kind, id) => setSelection(kind, id);

let offDown, offUp, offKey, offReq;
let markerTarget = null;

function setSelection(kind, id) {
  ctx.world.selection.kind = kind || null;
  ctx.world.selection.id = id ?? null;
  S.pendingDelete = null;
  ctx.events.emit('selection:changed', { kind: ctx.world.selection.kind, id: ctx.world.selection.id });
}

function missingModules(tool) {
  return (tool.needs || []).filter((id) => !ctx.modules.get(id));
}

function activate(name, options = {}) {
  const tool = TOOLS[name];
  if (!tool) { ctx.log.warn(`[tools] unknown tool "${name}"`); return false; }
  const missing = missingModules(tool);
  if (missing.length) {
    ctx.events.emit('ui:notify', { level: 'warn', text: `${name} tool needs ${missing.join(', ')} (not loaded)` });
    return false;
  }
  if (S.toolObj?.deactivate) { try { S.toolObj.deactivate(ctx, S); } catch (err) { ctx.log.error(`[tools] ${S.current}.deactivate threw`, err); } }
  S.current = name;
  S.options = { ...tool.defaults, ...options };
  S.toolObj = tool;
  S.pendingDelete = null;
  ctx.input.toolActive = true; // left button always belongs to the active tool (select included)
  try { tool.activate?.(ctx, S, S.options); } catch (err) { ctx.log.error(`[tools] ${name}.activate threw`, err); }
  ctx.events.emit('tool:selected', { tool: name, options: { ...S.options } });
  return true;
}

function deactivate() { activate('select'); }
function current() { return { tool: S.current, options: { ...S.options } }; }

function requestDelete() {
  const sel = ctx.world.selection;
  if (!sel.id) return false;
  const now = performance.now() / 1000;
  const pending = S.pendingDelete;
  if (pending && pending.kind === sel.kind && pending.id === sel.id && now < pending.expires) {
    S.pendingDelete = null;
    performDelete(sel.kind, sel.id);
    return true;
  }
  S.pendingDelete = { kind: sel.kind, id: sel.id, expires: now + DELETE_CONFIRM_WINDOW };
  ctx.events.emit('tool:confirmRequest', { kind: sel.kind, id: sel.id, message: `press Delete again to bulldoze this ${sel.kind}` });
  ctx.events.emit('ui:notify', { level: 'warn', text: `press Delete again to bulldoze this ${sel.kind}` });
  return true;
}

function performDelete(kind, id) {
  if (kind === 'building') {
    const buildings = ctx.modules.get('buildings');
    const rec = buildings?.get(id);
    if (!rec || !buildings.remove(id)) return;
    const refund = (rec.cost || 0) * COST.bulldozeRefundFrac;
    spend(ctx, -refund);
    const state = { id };
    S.undo.push({
      label: 'delete:building',
      undo(ctx) { const b = ctx.modules.get('buildings'); if (b) state.id = b.place(rec.type, rec.x, rec.z, rec.rot, { force: true }); spend(ctx, refund); },
      redo(ctx) { const b = ctx.modules.get('buildings'); if (b) b.remove(state.id); spend(ctx, -refund); },
    });
  } else if (kind === 'animal') {
    const animals = ctx.modules.get('animals');
    const rec = animals?.get(id);
    if (!rec || !animals.remove(id)) return;
    const species = rec.species, x = rec.x, z = rec.z;
    const state = { ids: [] };
    S.undo.push({
      label: 'delete:animal',
      undo(ctx) { const a = ctx.modules.get('animals'); if (a) state.ids = a.spawn(species, x, z, 1) || []; },
      redo(ctx) { const a = ctx.modules.get('animals'); if (a) for (const i of state.ids) a.remove(i); },
    });
  } else if (kind === 'road') {
    const roads = ctx.modules.get('roads');
    const edge = roads?.getEdge(id);
    if (!edge || !roads.removeRoad(id)) return;
    const pts = []; for (let i = 0; i < edge.points.length; i += 2) pts.push([edge.points[i], edge.points[i + 1]]);
    const kindName = edge.kind, width = edge.width;
    const state = { ids: [] };
    S.undo.push({
      label: 'delete:road',
      undo(ctx) { const r = ctx.modules.get('roads'); if (r) state.ids = r.addRoad(pts, kindName, width) || []; },
      redo(ctx) { const r = ctx.modules.get('roads'); if (r) for (const i of state.ids) r.removeRoad(i); },
    });
  } else {
    ctx.events.emit('ui:notify', { level: 'info', text: `${kind} cannot be bulldozed` });
    return;
  }
  ctx.events.emit('tool:applied', { tool: S.current, detail: { deleted: kind, id } });
  setSelection(null, null);
}

/**
 * ui → tools bridge (spec: "Listens to tool:request from ui"). This listener was never written, so no
 * toolbar card or panel Demolish/Sell/Remove button did anything in the real game (critic tools
 * round 4, verified: nothing in src/ handled the event). ui speaks dotted names; translate them.
 */
const ZONE_BY_NAME = { habitat: ZONE.HABITAT, visitor: ZONE.VISITOR, service: ZONE.SERVICE };
function handleToolRequest(req = {}) {
  const name = req.tool, o = req.options || {};
  if (!name || name === 'select') { activate('select'); return; }
  if (name === 'overlay') return; // ui-local map overlay, not a tool
  const [cat, sub] = String(name).split('.');
  if (cat === 'bulldoze' || (cat === 'animal' && sub === 'sell')) {
    if (o.id == null) { activate('road', { bulldoze: true }); return; } // toolbar card: bulldoze mode
    let kind = cat === 'animal' ? 'animal' : null;
    if (!kind && ctx.modules.get('buildings')?.get?.(o.id)) kind = 'building';
    if (!kind && ctx.modules.get('roads')?.getEdge?.(o.id)) kind = 'road';
    if (!kind && ctx.modules.get('animals')?.get?.(o.id)) kind = 'animal';
    if (kind) performDelete(kind, o.id); // explicit panel button: no second confirmation
    else ctx.log.warn(`[tools] tool:request ${name}: unknown id ${o.id}`);
    return;
  }
  if (cat === 'terrain') { activate('terrain', { ...o, mode: sub === 'paint' ? 'paintBiome' : (sub || 'raise') }); return; }
  if (cat === 'road') { activate('road', { ...o, kind: sub || 'dirt', bulldoze: false }); return; }
  if (cat === 'zone') {
    if (sub === 'erase') activate('zone', { ...o, mode: 'erase' });
    else activate('zone', { ...o, zone: ZONE_BY_NAME[sub] ?? ZONE.HABITAT, mode: 'paint' });
    return;
  }
  if (cat === 'building') { activate('building', { ...o, bulldoze: false }); return; }
  if (cat === 'animal') { activate('animal', o); return; }
  if (TOOLS[cat]) { activate(cat, o); return; }
  ctx.log.warn(`[tools] tool:request: unknown tool "${name}"`);
}

function handleGlobalKey(e) {
  if (e.code === 'Escape') {
    if (S.pendingDelete) { S.pendingDelete = null; return; }
    if (S.current === 'road' && RoadTool.cancelPending(S)) return;
    if (S.current !== 'select') { deactivate(); return; }
    setSelection(null, null);
    return;
  }
  if (e.code === 'Delete' || e.code === 'Backspace') {
    if (S.current === 'select') { requestDelete(); return; }
  }
  if (e.ctrl && e.code === 'KeyZ') { if (e.shift) api.redo(); else api.undo(); return; }
  if (e.ctrl && e.code === 'KeyY') { api.redo(); return; }
}

function updateMarker(dt) {
  const sel = ctx.world.selection;
  if (!sel.id) { S.marker.update(dt, null); return; }
  if (!markerTarget || markerTarget.kind !== sel.kind || markerTarget.id !== sel.id) {
    const pos = entityPosition(ctx, sel.kind, sel.id);
    const b = sel.kind === 'building' ? ctx.world.buildings.get(sel.id) : null;
    // ring sized from the footprint (a fixed 4 m ring sat hidden under a 30 m lodge)
    const radius = b ? Math.hypot(b.w || 8, b.d || 8) * 0.5 + 1.5 : sel.kind === 'habitat' ? 6 : 2;
    markerTarget = { kind: sel.kind, id: sel.id, pos: pos ? { x: pos.x, y: pos.y, z: pos.z } : null, radius };
    S.marker.drape(ctx.world, markerTarget.pos, radius);
  }
  if (sel.kind === 'animal' && markerTarget.pos) {
    // animals walk: follow the live record (written into the cached object, no allocation)
    const a = ctx.world.animals.get(sel.id);
    if (a) { markerTarget.pos.x = a.x; markerTarget.pos.z = a.z; markerTarget.pos.y = a.y ?? ctx.world.getHeight(a.x, a.z); }
  }
  S.marker.update(dt, markerTarget.pos, markerTarget.radius);
}

/** After undo/redo: drop a selection whose entity no longer exists (ui would show a ghost panel). */
function dropStaleSelection() {
  const sel = ctx.world.selection;
  if (sel.id && !entityPosition(ctx, sel.kind, sel.id)) setSelection(null, null);
}

const api = {
  activate(name, options) { return activate(name, options); },
  deactivate() { deactivate(); },
  current() { return current(); },
  availableTools() { return Object.keys(TOOLS).filter((n) => missingModules(TOOLS[n]).length === 0); },
  isActive(name) { return S.current === name; },

  setOption(key, value) { S.options[key] = value; },
  getOptions() { return { ...S.options }; },

  undo() { if (!S.undo.canUndo()) return false; const op = S.undo.undo(ctx); dropStaleSelection(); if (op) ctx.events.emit('tool:applied', { tool: 'undo', detail: { label: op.label } }); return !!op; },
  redo() { if (!S.undo.canRedo()) return false; const op = S.undo.redo(ctx); dropStaleSelection(); if (op) ctx.events.emit('tool:applied', { tool: 'redo', detail: { label: op.label } }); return !!op; },
  canUndo() { return S.undo.canUndo(); },
  canRedo() { return S.undo.canRedo(); },
  historySize() { return S.undo.sizes(); },

  select(kind, id) { setSelection(kind, id); },
  clearSelection() { setSelection(null, null); },
  requestDelete() { return requestDelete(); },

  get group() { return S.group; },
};

export default {
  id: 'tools',
  version: 1,
  dependencies: [],
  optional: ['terrain', 'roads', 'zoning', 'buildings', 'animals', 'simulation'],
  api,

  async init(c) {
    ctx = c;
    S.group = new THREE.Group(); S.group.name = 'tools';
    ctx.scene.add(S.group);
    S.undo = new UndoStack(64);
    S.ring = new RingCursor();
    S.ribbon = new RoadRibbon();
    S.marker = new SelectionMarker();
    S.group.add(S.ring.mesh, S.ribbon.group, S.marker.mesh);
    S.current = 'select'; S.options = {}; S.toolObj = null;
    S.pendingDelete = null;
    markerTarget = null;

    offDown = ctx.events.on('input:down', (e) => { try { S.toolObj?.pointerDown?.(ctx, S, e); } catch (err) { ctx.log.error(`[tools] ${S.current}.pointerDown threw`, err); } });
    offUp = ctx.events.on('input:up', (e) => { try { S.toolObj?.pointerUp?.(ctx, S, e); } catch (err) { ctx.log.error(`[tools] ${S.current}.pointerUp threw`, err); } });
    offKey = ctx.events.on('input:key', (e) => {
      try { handleGlobalKey(e); } catch (err) { ctx.log.error('[tools] global key handler threw', err); }
      try { S.toolObj?.key?.(ctx, S, e); } catch (err) { ctx.log.error(`[tools] ${S.current}.key threw`, err); }
    });

    offReq = ctx.events.on('tool:request', (r) => { try { handleToolRequest(r); } catch (err) { ctx.log.error('[tools] tool:request handler threw', err); } });

    activate('select');
    ctx.log.info('[tools] ready');
  },

  update(dt) {
    if (!ctx) return;
    if (S.pendingDelete && performance.now() / 1000 > S.pendingDelete.expires) S.pendingDelete = null;
    try { S.toolObj?.update?.(ctx, S, dt); } catch (err) { ctx.log.error(`[tools] ${S.current}.update threw`, err); }
    updateMarker(dt);
  },

  tick() {},

  dispose() {
    if (!ctx) return;
    offDown?.(); offUp?.(); offKey?.(); offReq?.();
    S.ring?.dispose(); S.ribbon?.dispose(); S.marker?.dispose();
    S.group?.removeFromParent();
    S.group = null; S.undo = null; S.ring = null; S.ribbon = null; S.marker = null;
    S.toolObj = null; markerTarget = null;
    ctx = null;
  },

  showcase: { presets, stage },
};
