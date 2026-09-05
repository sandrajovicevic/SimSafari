// Bottom toolbar: category bar + item cards. Choosing an item emits tool:request {tool, options}; `tools` answers with tool:selected.
import { el, clear, fmtMoney, titleCase } from './dom.js';
import { icon, hasIcon, animalIconName } from './icons.js';
import { SPECIES_ORDER, BUILDINGS, OVERLAYS, speciesFacts } from './species.js';

const DIET_TAG = { predator: 'predator', browser: 'browser', grazer: 'grazer', mixed: 'mixed' };

/** Build the default category list from whatever modules are present. */
export function defaultCategories(s) {
  const get = (id) => { try { return s.ctx.modules.get(id); } catch { return null; } };
  const cats = [];
  cats.push({ id: 'select', name: 'Select', icon: 'select', key: 'Esc', tool: null, tip: 'Select tool — click animals, buildings, habitats and roads' });
  cats.push({ id: 'terrain', name: 'Terrain', icon: 'raise', key: '1', hint: 'Left-drag to sculpt. Hold Shift for a bigger brush.', items: [
    { id: 'raise', name: 'Raise', icon: 'raise', tool: 'terrain.raise', cost: '$2/m²', desc: 'Push the ground up under the brush.' },
    { id: 'lower', name: 'Lower', icon: 'lower', tool: 'terrain.lower', cost: '$2/m²', desc: 'Dig the ground down. Dig below the water table for a lake.' },
    { id: 'flatten', name: 'Flatten', icon: 'flatten', tool: 'terrain.flatten', cost: '$1/m²', desc: 'Level the ground to the height where you started the stroke.' },
    { id: 'smooth', name: 'Smooth', icon: 'smooth', tool: 'terrain.smooth', cost: '$1/m²', desc: 'Soften bumps and cliffs.' },
    { id: 'paint', name: 'Paint biome', icon: 'paint', tool: 'terrain.paint', options: { biome: 0 }, cost: 'free', desc: 'Paint grass, dry grass, dirt, rock or sand.' },
  ] });
  cats.push({ id: 'roads', name: 'Roads', icon: 'road', key: '2', hint: 'Click to start a road, click again to place a node; right-click to finish.', items: [
    { id: 'dirt', name: 'Dirt track', icon: 'roadDirt', tool: 'road.dirt', cost: '$40/m', desc: 'Cheap, bumpy; visitors tolerate it for short stretches.' },
    { id: 'gravel', name: 'Gravel road', icon: 'roadGravel', tool: 'road.gravel', cost: '$110/m', desc: 'Standard safari road. Good comfort, low upkeep.' },
    { id: 'paved', name: 'Paved road', icon: 'roadPaved', tool: 'road.paved', cost: '$260/m', desc: 'Smooth and fast; required near the lodge and gate.' },
    { id: 'bulldoze', name: 'Bulldoze', icon: 'bulldoze', tool: 'bulldoze', cost: 'refund 50%', desc: 'Remove roads, buildings or fences.' },
  ] });
  cats.push({ id: 'zones', name: 'Zones', icon: 'zone', key: '3', hint: 'Paint cells (4 m). Habitats become enclosures once fenced.', items: [
    { id: 'habitat', name: 'Habitat', icon: 'habitat', tool: 'zone.habitat', cost: 'free', desc: 'Land reserved for animals. Fence it to make an enclosure.' },
    { id: 'visitor', name: 'Visitor', icon: 'visitorZone', tool: 'zone.visitor', cost: 'free', desc: 'Where visitors may walk: lodge grounds, viewpoints, shops.' },
    { id: 'service', name: 'Service', icon: 'service', tool: 'zone.service', cost: 'free', desc: 'Staff-only: ranger stations, depots, feed stores.' },
    { id: 'erase', name: 'Erase zone', icon: 'erase', tool: 'zone.erase', cost: 'free', desc: 'Clear zoning from cells.' },
  ] });

  // buildings — from the buildings module catalogue when present
  let blds = null;
  try { blds = get('buildings')?.catalogue?.() || null; } catch { blds = null; }
  const bList = Array.isArray(blds) ? blds : blds && typeof blds === 'object' ? Object.entries(blds).map(([type, v]) => ({ type, ...v })) : BUILDINGS;
  cats.push({ id: 'buildings', name: 'Buildings', icon: 'building', key: '4', hint: 'Click to place, R rotates, right-click cancels.', items: bList.map((b) => ({
    id: b.type || b.id, name: b.name || titleCase(b.type || b.id), icon: hasIcon(b.icon) ? b.icon : hasIcon(b.type) ? b.type : 'building',
    tool: 'building.place', options: { type: b.type || b.id }, cost: b.perM ? fmtMoney(b.cost) + '/m' : b.cost, upkeep: b.upkeep, desc: b.desc || b.description || '',
  })) });

  // animals — species list from the animals module when present
  const animals = get('animals');
  let ids = null;
  try { ids = animals?.allSpecies?.() || null; } catch { ids = null; }
  const speciesIds = Array.isArray(ids) && ids.length ? ids.map((x) => (typeof x === 'string' ? x : x.id || x.name)) : SPECIES_ORDER;
  cats.push({ id: 'animals', name: 'Animals', icon: 'paw', key: '5', hint: 'Click inside a fenced habitat to release a herd.', items: speciesIds.map((sid) => {
    const f = speciesFacts(sid, animals);
    return { id: sid, name: f.name, icon: animalIconName(sid), tool: 'animal.place', options: { species: sid }, cost: f.cost, tag: DIET_TAG[f.diet] || null, tagCls: f.diet === 'predator' ? 'warn' : '', desc: f.desc };
  }) });

  cats.push({ id: 'view', name: 'View', icon: 'eye', key: '6', hint: 'Overlays are drawn on the terrain. They do not cost anything.', items: OVERLAYS.map((o) => ({
    id: o.id, name: o.name, icon: o.icon, tool: 'overlay', options: { overlay: o.id }, cost: '', desc: o.desc, sticky: true,
  })) });
  return cats;
}

export function createToolbar(root, s) {
  const node = el('div.toolbar');
  const pill = el('div.active-tool-pill.panel.pe', { hidden: true });
  const items = el('div.tb-items.panel.pe', { hidden: true });
  const cats = el('div.tb-cats.panel.pe');
  node.append(pill, items, cats);
  root.appendChild(node);

  let categories = [];
  let open = null;          // open category id
  let overlay = 'none';
  const catButtons = new Map();

  function setCategories(list) {
    categories = list;
    clear(cats); catButtons.clear();
    for (const c of categories) {
      if (c.id === 'select') {
        const b = el('button.cat.small', { 'data-tip': c.tip || c.name, 'data-key': c.key, onclick: () => { s.requestTool(null, null, null); openCategory(null); } }, icon(c.icon), el('span.cl', { text: c.name }));
        catButtons.set(c.id, b); cats.appendChild(b); cats.appendChild(el('span.cat.sep'));
        continue;
      }
      const b = el('button.cat', { 'data-tip': c.tip || c.name + ' tools', 'data-key': c.key, onclick: () => openCategory(open === c.id ? null : c.id) },
        icon(c.icon), el('span.cl', { text: c.name }), c.key ? el('span.key', { text: c.key }) : null);
      catButtons.set(c.id, b); cats.appendChild(b);
    }
    renderItems();
  }

  function openCategory(id) {
    open = id && categories.some((c) => c.id === id) ? id : null;
    for (const [cid, b] of catButtons) b.classList.toggle('on', cid === open);
    renderItems();
  }

  function renderItems() {
    clear(items);
    const c = categories.find((x) => x.id === open);
    if (!c || !c.items) { items.hidden = true; return; }
    items.hidden = false;
    const head = el('div.tb-items-h', null,
      el('span.title', null, icon(c.icon), c.name, c.hint ? el('span.hint', { text: c.hint }) : null),
      el('span.sp'),
      el('button.btn.icon.ghost', { 'data-tip': 'Close', 'data-key': 'Esc', onclick: () => openCategory(null) }, icon('close')));
    const row = el('div.cards');
    c.items.forEach((it, i) => {
      const active = it.sticky ? (it.tool === 'overlay' && it.options?.overlay === overlay) : (s.activeTool && s.activeTool.tool === it.tool && sameOptions(s.activeTool.options, it.options));
      const costTxt = typeof it.cost === 'number' ? fmtMoney(it.cost) : (it.cost || '');
      const tip = it.desc || it.name;
      const sub = typeof it.upkeep === 'number' ? 'Upkeep ' + fmtMoney(it.upkeep) + '/day' : undefined;
      const card = el('button.card' + (active ? '.on' : ''), {
        'data-tip': tip, 'data-sub': sub,
        onclick: () => choose(it),
      },
        it.tag ? el('span.tag' + (it.tagCls ? '.' + it.tagCls : ''), { text: it.tag }) : null,
        el('span.card-ic', null, icon(it.icon || 'select')),
        el('span.card-n', { text: it.name }),
        costTxt ? el('span.card-c' + (costTxt === 'free' ? '.free' : ''), { text: costTxt }) : null);
      card._item = it;
      row.appendChild(card);
    });
    items.append(head, row);
  }

  function choose(it) {
    if (it.tool === 'overlay') { overlay = it.options?.overlay || 'none'; s.ctx.events.emit('ui:overlay', { overlay }); }
    s.requestTool(it.tool, it.options || null, it);
    renderItems();
  }

  function refresh() {
    for (const c of categories) {
      if (!c.items) continue;
      const b = catButtons.get(c.id);
      const has = !!s.activeTool && c.items.some((it) => !it.sticky && it.tool === s.activeTool.tool && sameOptions(s.activeTool.options, it.options));
      b?.classList.toggle('active-tool', has);
    }
    // pill
    const t = s.activeTool;
    if (t && t.tool) {
      clear(pill);
      const item = t.item || findItem(t.tool, t.options);
      const cost = item ? (typeof item.cost === 'number' ? fmtMoney(item.cost) : item.cost) : '';
      pill.append(icon(item?.icon || 'select'), el('span', { text: item?.name || titleCase(t.tool) }),
        cost ? el('span.muted', { text: cost }) : null, el('span.muted', { text: '·' }), el('span.muted', null, 'Cancel', el('span.key', { text: 'Esc' })));
      pill.hidden = false;
    } else pill.hidden = true;
    renderItems();
  }

  function findItem(tool, options) {
    for (const c of categories) for (const it of c.items || []) if (it.tool === tool && sameOptions(it.options, options)) return it;
    return null;
  }

  function pressNumber(n) {
    const c = categories.find((x) => x.id === open);
    if (!c || !c.items) return false;
    const it = c.items[n - 1];
    if (!it) return false;
    choose(it);
    return true;
  }

  function categoryByKey(key) { return categories.find((c) => c.key && c.key.toLowerCase() === key.toLowerCase() && c.items); }

  setCategories(defaultCategories(s));

  return {
    el: node, setCategories, openCategory, refresh, pressNumber, categoryByKey,
    getOpen: () => open,
    getOverlay: () => overlay,
    hoverCard(index) { return items.querySelectorAll('.card')[index] || null; },
    dispose() { node.remove(); },
  };
}

function sameOptions(a, b) {
  if (a === b) return true;
  if (!a || !b) return !a && !b;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (a[k] !== b[k]) return false;
  return true;
}
