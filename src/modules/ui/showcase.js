// ui showcase: presets + stage(). stage() fills the world with mock data for whatever modules are absent and opens the relevant panel.
import { populateMockWorld, mockReport, mockPopHistory } from './mock.js';

export const presets = {
  overview: { camera: { target: [0, 40], distance: 520, pitch: 42, yaw: 35 }, tod: 15, description: 'Full HUD: top bar, toolbar, minimap, three notifications over the park at 15 h' },
  report:   { camera: { target: [0, 40], distance: 520, pitch: 42, yaw: 35 }, tod: 15, description: 'Daily report modal with 30-day sparklines, breakdowns, population, biodiversity and events' },
  settings: { camera: { target: [0, 40], distance: 520, pitch: 42, yaw: 35 }, tod: 15, description: 'Settings modal open over the park, including the CC-BY credits section' },
  panel:    { camera: { target: [110, -140], distance: 70, pitch: 24, yaw: 60 }, tod: 16.5, description: 'Animal selected: side panel with happiness ring, needs bars, facts and actions' },
  toolbar:  { camera: { target: [0, 40], distance: 420, pitch: 40, yaw: 35 }, tod: 15, description: 'Buildings category open in the toolbar, a card hovered with its tooltip' },
  close:    { camera: { target: [-130, 80], distance: 60, pitch: 20, yaw: 60 }, tod: 16.5, description: 'Close camera; habitat selected (quality, resources, fit per species); animals category open' },
  objectives: { camera: { target: [0, 40], distance: 420, pitch: 40, yaw: 35 }, tod: 15, description: 'Objectives panel mid-mission (Wave P3): progress bar, days left, star brackets, biodiversity strip' },
  'objectives-won': { camera: { target: [0, 40], distance: 420, pitch: 40, yaw: 35 }, tod: 15, description: 'Objectives panel on a completed mission (Wave P3): stars awarded, result rows, completion toast' },
  night:    { camera: { target: [60, 300], distance: 140, pitch: 25, yaw: 120 }, tod: 21.5, description: 'HUD at night: moon glyph, lodge selected, poacher warning toast' },
};

export async function stage(ctx, presetName, ui) {
  // `ui` is the module's internal handle (passed by index.js); without it (registry call) we look it up.
  const H = ui || globalThis.__SIMSAFARI_UI__;
  if (!H || !H.parts) return;
  const s = H.state, api = H.api;
  const mock = populateMockWorld(ctx, presetName);
  s.reputation = ctx.modules.get('simulation') ? s.reputation : 0.76;
  s.popHistory = mockPopHistory(ctx);
  s.parkName = 'Serengeti Ridge';
  s.lastReport = mockReport(ctx, s);
  api.refresh();
  H.parts.minimap.setPreview(mock.terrainPreview || null);
  H.parts.notifications.clear();

  const sel = (kind, id) => { ctx.world.selection.kind = kind; ctx.world.selection.id = id; H.parts.sidepanel.show(kind, id); };

  switch (presetName) {
    case 'report':
      api.showReport(s.lastReport);
      break;
    case 'settings':
      api.openPanel('settings');
      break;
    case 'panel':
      if (mock.selectedAnimal) sel('animal', mock.selectedAnimal);
      api.notify('good', 'Two zebra foals were born in Acacia Flats.', { x: -130, z: 80 });
      break;
    case 'toolbar': {
      api.openPanel('buildings');
      s.requestTool('building.place', { type: 'lodge' }, null);
      // demonstrate the hover tooltip on the lodge card
      const card = H.parts.toolbar.hoverCard(1);
      if (card) H.parts.tooltip.showFor(card);
      break;
    }
    case 'close':
      if (mock.habitat) sel('habitat', mock.habitat);
      api.openPanel('animals');
      break;
    case 'objectives':
    case 'objectives-won': {
      // Wave P3: drive a real mission through the simulation API (present in this showcase's
      // dependency closure) — the panel itself only ever reads state, never computes it.
      s.settings.autoReport = false; // runDays would auto-open the report modal over this panel
      const sim = ctx.modules.get('simulation');
      const won = presetName === 'objectives-won';
      if (sim?.startMission) {
        try {
          sim.startMission('pride');
          let hid = null;
          for (const a of ctx.world.animals.values()) {
            if (a.species !== 'lion') continue;
            hid = a.habitat ?? a.habitatId ?? (ctx.world.grid.habitatId[ctx.world.cellAt(a.x, a.z).index] || 0);
            break;
          }
          if (hid == null) hid = [...ctx.world.habitats.keys()][0] ?? 1;
          sim.buyAnimals('lion', hid, won ? 6 : 1);
          sim.runDays(won ? 1 : 3);
        } catch (err) { ctx.log.warn('objectives stage: ' + err.message); }
      }
      api.openPanel('objectives');
      if (won) api.notify('good', 'The Pride Grows complete — ★★★', { title: 'Objective', ttl: -1 });
      break;
    }
    case 'night':
      if (mock.lodge) sel('building', mock.lodge);
      api.notify('error', 'Poachers spotted near the north fence — rangers dispatched.', { title: 'Alert', x: -300, z: 240, ttl: -1 });
      api.notify('info', 'The hippos are leaving the river to graze.', { x: 200, z: 190, ttl: -1 });
      break;
    default: // overview
      api.notify('good', 'Two zebra foals were born in Acacia Flats.', { x: -130, z: 80, ttl: -1 });
      api.notify('info', 'A tour group watched the lion pride at Lion Ridge (+8% satisfaction).', { ttl: -1 });
      api.notify('warn', 'Water hole at Kopje Springs is running low.', { x: 120, z: -110, ttl: -1 });
      break;
  }
}
