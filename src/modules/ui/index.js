// ui module — HUD, toolbar, side panel, notifications, daily report, minimap, settings. Plain DOM in #ui-root.
// Shows only in the full game or its own showcase; respects ?noui=1. Never throws into the render loop.
import { CSS } from './ui.css.js';
import { presets, stage } from './showcase.js';
import { el, setText } from './dom.js';
import { createTooltip } from './tooltip.js';
import { createNotifications } from './notify.js';
import { createTopbar } from './topbar.js';
import { createToolbar } from './toolbar.js';
import { createSidePanel } from './sidepanel.js';
import { createReport, buildFallbackReport } from './report.js';
import { createMinimap } from './minimap.js';
import { createSettings } from './settings.js';
import { icon } from './icons.js';

const BASE_SPEED = 0.05;            // game-hours per real second at 1× (a game day ≈ 8 min)
const SPEED_STEPS = [1, 3, 10];

let ctx = null, root = null, styleEl = null, parts = null, s = null, keyHandler = null;
let acc05 = 0, acc02 = 0, lastSelKey = '', lastErrT = -10;

const handle = { get parts() { return parts; }, get state() { return s; }, api: null };

const api = {
  /** Toast: level 'info'|'warn'|'error'|'good'; opts {title, sub, x, z, ttl(seconds, -1 sticky)}. */
  notify(level, text, opts) { if (parts) parts.notifications.push(level, text, opts); },
  /** 'report' | 'settings' | 'selection' | a toolbar category id ('terrain','roads','zones','buildings','animals','view'). */
  openPanel(name) {
    if (!parts) return false;
    if (name === 'report') { parts.settings.hide(); parts.report.show(currentReport()); return true; }
    if (name === 'settings') { parts.report.hide(); parts.settings.show(); return true; }
    if (name === 'selection') { const sel = s.world.selection; return sel?.kind ? parts.sidepanel.show(sel.kind, sel.id) : false; }
    parts.toolbar.openCategory(name);
    return parts.toolbar.getOpen() === name;
  },
  /** Closes the topmost thing: modal → toolbar category → side panel. Returns true if something closed. */
  closePanel() {
    if (!parts) return false;
    if (parts.report.isOpen()) { parts.report.hide(); return true; }
    if (parts.settings.isOpen()) { parts.settings.hide(); return true; }
    if (parts.toolbar.getOpen()) { parts.toolbar.openCategory(null); return true; }
    if (parts.sidepanel.isOpen()) { parts.sidepanel.hide(); return true; }
    return false;
  },
  /** Replace toolbar categories: [{id, name, icon, key, hint, items:[{id, name, icon, tool, options, cost, desc}]}]. */
  setToolbar(items) { if (parts && Array.isArray(items)) parts.toolbar.setCategories(items); },
  showReport(report) { if (parts) parts.report.show(report || currentReport()); },
  setVisible(visible) { if (root) root.classList.toggle('hidden', !visible); },
  isVisible() { return !!root && !root.classList.contains('hidden'); },
  setParkName(name) { if (s) { s.parkName = String(name || 'Safari park'); parts?.topbar.refresh(); } },
  showFps(on) { if (parts) { s.settings.fps = !!on; parts.fps.hidden = !on; } },
  setSpeed(mult) { if (s) s.setSpeed(mult); },
  /** Re-read world.* into every widget (call after bulk changes). */
  refresh() { if (parts) { parts.topbar.refresh(); parts.toolbar.refresh(); parts.sidepanel.refresh(); parts.minimap.redraw(); } },
  getState() { return parts ? { activeTool: s.activeTool, category: parts.toolbar.getOpen(), overlay: parts.toolbar.getOverlay(), reportOpen: parts.report.isOpen(), settingsOpen: parts.settings.isOpen(), selection: parts.sidepanel.current(), toasts: parts.notifications.count(), speed: s.speedMult } : null; },
  isEnabled() { return !!parts; },
};
handle.api = api;

function currentReport() {
  if (s.lastReport) return s.lastReport;
  try { const r = ctx.modules.get('simulation')?.getReport?.(); if (r) return r; } catch {}
  return buildFallbackReport(s);
}

function setSpeed(mult) {
  mult = Number(mult) || 0;
  if (mult > 0) s.speedMult = mult;
  try { ctx.app.setSpeed(BASE_SPEED * mult); } catch (e) { ctx.log.warn('setSpeed failed', e); }
  try { ctx.modules.get('simulation')?.speed?.(mult); } catch {}
  try { ctx.modules.get('audio')?.play?.('ui_click', { gain: 0.4 }); } catch {}
  parts?.topbar.refresh();
}

function requestTool(tool, options, item) {
  s.activeTool = tool ? { tool, options: options || null, item: item || null } : null;
  ctx.events.emit('tool:request', { tool, options: options || null });
  try { ctx.modules.get('audio')?.play?.('ui_click', { gain: 0.4 }); } catch {}
  parts?.toolbar.refresh();
}

function onKey(e) {
  if (!parts || e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target;
  if (t && t.closest && t.closest('input,textarea,select,[contenteditable]')) return;
  const w = s.world;
  switch (e.code) {
    case 'Escape':
      if (parts.report.isOpen() || parts.settings.isOpen()) { parts.report.hide(); parts.settings.hide(); }
      else if (s.activeTool) requestTool(null, null, null);
      else if (parts.toolbar.getOpen()) parts.toolbar.openCategory(null);
      else if (parts.sidepanel.isOpen()) { ctx.events.emit('selection:clear', {}); if (!ctx.modules.get('tools')) { w.selection.kind = null; w.selection.id = null; } parts.sidepanel.hide(); }
      e.preventDefault(); break;
    case 'Space': setSpeed(w.time.paused ? s.speedMult || 1 : 0); e.preventDefault(); break;
    case 'Comma': { const i = SPEED_STEPS.indexOf(s.speedMult); setSpeed(w.time.paused ? 0 : SPEED_STEPS[Math.max(0, i - 1)]); break; }
    case 'Period': { const i = SPEED_STEPS.indexOf(s.speedMult); setSpeed(w.time.paused ? SPEED_STEPS[0] : SPEED_STEPS[Math.min(SPEED_STEPS.length - 1, i + 1)]); break; }
    case 'KeyJ': parts.report.isOpen() ? parts.report.hide() : api.openPanel('report'); break;
    case 'KeyO': parts.settings.isOpen() ? parts.settings.hide() : api.openPanel('settings'); break;
    case 'KeyM': parts.minimap.el.hidden = !parts.minimap.el.hidden; break;
    case 'KeyH': api.setVisible(!api.isVisible()); break;
    default: {
      if (/^Digit[1-9]$/.test(e.code)) {
        const c = parts.toolbar.categoryByKey(e.code.slice(5));
        if (c) { parts.toolbar.openCategory(parts.toolbar.getOpen() === c.id ? null : c.id); e.preventDefault(); }
      }
    }
  }
}

export default {
  id: 'ui',
  version: 1,
  dependencies: [],
  optional: ['simulation', 'animals', 'buildings', 'tools', 'audio', 'environment', 'terrain'],
  api,

  async init(c) {
    ctx = c;
    if (ctx.params?.noui) { ctx.log.info('noui: ui disabled'); return; }
    if (ctx.isShowcase && ctx.params?.module !== 'ui') { ctx.log.info('another module\'s showcase: ui hidden'); return; }
    const host = document.getElementById('ui-root');
    if (!host) { ctx.log.warn('#ui-root missing; ui disabled'); return; }

    try {
      s = {
        ctx, world: ctx.world, api, parkName: 'Serengeti Ridge', speedMult: 1, reputation: 0.5, activeTool: null,
        popHistory: [], lastReport: null, settings: { fps: false, autoReport: true, volume: 0.8 }, setSpeed, requestTool,
      };
      styleEl = document.createElement('style'); styleEl.id = 'sf-ui-style'; styleEl.textContent = CSS;
      document.head.appendChild(styleEl);
      root = el('div.sf');
      host.appendChild(root);

      const tooltip = createTooltip(root);
      const notifications = createNotifications(root, s);
      const topbar = createTopbar(root, s);
      const toolbar = createToolbar(root, s);
      const sidepanel = createSidePanel(root, s);
      const report = createReport(root, s);
      const minimap = createMinimap(root, s);
      const settings = createSettings(root, s);
      const fps = el('div.fps.panel.mono', { hidden: true }, el('b', { text: '— fps' }), ' · ', el('span', { text: '— ms' }), ' · ', el('span', { text: '— draws' }));
      root.appendChild(fps);
      root.appendChild(tooltip.el); // keep the tooltip on top
      parts = { tooltip, notifications, topbar, toolbar, sidepanel, report, minimap, settings, fps };
      globalThis.__SIMSAFARI_UI__ = handle;

      // speed: reflect whatever core/showcase set
      const sp = ctx.world.time.speed / BASE_SPEED;
      s.speedMult = SPEED_STEPS.reduce((best, v) => (Math.abs(v - sp) < Math.abs(best - sp) ? v : best), 1);

      // ---- events
      const ev = ctx.events;
      ev.on('ui:notify', (p) => parts && parts.notifications.push(p?.level || 'info', p?.text ?? '', p || {}));
      ev.on('tool:selected', (p) => { if (!parts) return; const tool = p?.tool ?? null; s.activeTool = tool ? { tool, options: p.options ?? (s.activeTool?.tool === tool ? s.activeTool.options : null), item: s.activeTool?.tool === tool ? s.activeTool.item : null } : null; parts.toolbar.refresh(); });
      ev.on('economy:updated', () => parts && parts.topbar.refresh());
      ev.on('weather:changed', () => parts && parts.topbar.refresh());
      ev.on('time:set', () => parts && parts.topbar.refresh());
      ev.on('sim:day', (p) => {
        if (!parts) return;
        const r = p?.report || null;
        if (r) {
          s.lastReport = r;
          if (typeof r.reputation === 'number') s.reputation = r.reputation;
          const n = r.population ? Object.values(r.population).reduce((a, b) => a + (b || 0), 0) : ctx.world.animals.size;
          s.popHistory.push({ day: r.day ?? p.day, n }); if (s.popHistory.length > 60) s.popHistory.shift();
          if (s.settings.autoReport && !parts.settings.isOpen()) parts.report.show(r);
          if (r.bankrupt) parts.notifications.push('error', 'The park is bankrupt. Take a loan or sell animals to continue.', { title: 'Bankruptcy', ttl: -1 });
        }
        parts.topbar.refresh();
      });
      ev.on('selection:changed', (p) => { if (!parts) return; if (p?.kind) parts.sidepanel.show(p.kind, p.id); else parts.sidepanel.hide(); lastSelKey = p?.kind ? p.kind + ':' + p.id : ''; });
      ev.on('module:failed', (p) => parts && parts.notifications.push('error', `Module "${p?.id}" failed during ${p?.phase}.`, { sub: String(p?.error || '').slice(0, 120), ttl: 20 }));
      ev.on('animal:spawned', () => parts && parts.minimap.redraw());
      ev.on('building:placed', () => parts && parts.minimap.redraw());
      ev.on('core:ready', () => parts && api.refresh());

      keyHandler = (e) => { try { onKey(e); } catch (err) { ctx.log.error('key handler', err); } };
      window.addEventListener('keydown', keyHandler);
      api.refresh();
      ctx.log.info('ui ready');
    } catch (err) {
      ctx.log.error('ui init failed', err);
      try { this.dispose(); } catch {}
    }
  },

  update(dt, t) {
    if (!parts) return;
    try {
      parts.topbar.update(dt);
      parts.notifications.update(dt);
      parts.minimap.update(dt);
      acc05 += dt; acc02 += dt;
      if (acc02 >= 0.2) {
        acc02 = 0;
        const sel = s.world.selection;
        const key = sel && sel.kind ? sel.kind + ':' + sel.id : '';
        if (key !== lastSelKey) { lastSelKey = key; if (key) parts.sidepanel.show(sel.kind, sel.id); else parts.sidepanel.hide(); }
      }
      if (acc05 >= 0.5) {
        acc05 = 0;
        parts.topbar.refresh();
        parts.sidepanel.refresh();
        if (s.settings.fps) {
          const p = ctx.app.perf, f = parts.fps.children;
          setText(f[0], Math.round(p.fps) + ' fps'); setText(f[1], p.frameMs.toFixed(1) + ' ms'); setText(f[2], ctx.renderer.info.render.calls + ' draws');
        }
      }
    } catch (err) {
      if (t - lastErrT > 5) { lastErrT = t; ctx.log.error('ui update', err); }
    }
  },

  tick() {},

  dispose() {
    if (keyHandler) window.removeEventListener('keydown', keyHandler);
    keyHandler = null;
    if (parts) for (const k in parts) { try { parts[k].dispose?.(); } catch {} }
    parts = null;
    root?.remove(); root = null;
    styleEl?.remove(); styleEl = null;
    if (globalThis.__SIMSAFARI_UI__ === handle) delete globalThis.__SIMSAFARI_UI__;
    s = null;
  },

  showcase: { presets, stage: (c, preset) => stage(c, preset, handle) },
};
