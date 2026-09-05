// Fallback catalogue data used when the `animals` / `buildings` modules are absent or return partial info.
// Every number is a placeholder for the HUD only — the real values come from those modules' APIs.

export const SPECIES = {
  elephant:   { name: 'African elephant', latin: 'Loxodonta africana', diet: 'browser',  shoulder: 3.2, mass: 5400, herd: 8,  cost: 42000, appeal: 5, activity: 'day', desc: 'The largest land animal. Needs water daily and a lot of space; herds are led by a matriarch.' },
  giraffe:    { name: 'Giraffe',          latin: 'Giraffa camelopardalis', diet: 'browser', shoulder: 4.6, mass: 1100, herd: 6, cost: 28000, appeal: 5, activity: 'day', desc: 'Browses acacia crowns; wants scattered trees and open sightlines.' },
  zebra:      { name: 'Plains zebra',     latin: 'Equus quagga',      diet: 'grazer',   shoulder: 1.3, mass: 300,  herd: 12, cost: 6500,  appeal: 4, activity: 'day', desc: 'Grazes short grass and migrates with wildebeest. Happiest in large mixed herds.' },
  wildebeest: { name: 'Blue wildebeest',  latin: 'Connochaetes taurinus', diet: 'grazer', shoulder: 1.4, mass: 250, herd: 20, cost: 4200, appeal: 3, activity: 'day', desc: 'Keystone grazer of the plains; big herds keep the grass short for others.' },
  buffalo:    { name: 'Cape buffalo',     latin: 'Syncerus caffer',   diet: 'grazer',   shoulder: 1.5, mass: 700,  herd: 15, cost: 9800,  appeal: 4, activity: 'day', desc: 'Heavy grazer that needs wallows and dense cover. Unpredictable near vehicles.' },
  lion:       { name: 'Lion',             latin: 'Panthera leo',      diet: 'predator', shoulder: 1.2, mass: 190,  herd: 6,  cost: 36000, appeal: 5, activity: 'night', desc: 'Apex predator. Prides rest in shade by day and hunt at dusk; prey species keep their distance.' },
  cheetah:    { name: 'Cheetah',          latin: 'Acinonyx jubatus',  diet: 'predator', shoulder: 0.8, mass: 55,   herd: 2,  cost: 31000, appeal: 5, activity: 'day', desc: 'Fastest land animal; needs long open runs and few competing predators.' },
  hippo:      { name: 'Hippopotamus',     latin: 'Hippopotamus amphibius', diet: 'grazer', shoulder: 1.5, mass: 1500, herd: 10, cost: 24000, appeal: 4, activity: 'night', desc: 'Spends the day submerged and grazes at night. Needs a deep, permanent water body.' },
  rhino:      { name: 'White rhinoceros', latin: 'Ceratotherium simum', diet: 'grazer', shoulder: 1.8, mass: 2300, herd: 3,  cost: 58000, appeal: 5, activity: 'day', desc: 'Rare and valuable; the biggest poaching risk in the park. Needs ranger patrols.' },
  warthog:    { name: 'Warthog',          latin: 'Phacochoerus africanus', diet: 'mixed', shoulder: 0.7, mass: 80, herd: 5, cost: 1800, appeal: 2, activity: 'day', desc: 'Digs for roots and sleeps in burrows. Tolerant of poor habitat.' },
  ostrich:    { name: 'Ostrich',          latin: 'Struthio camelus',  diet: 'mixed',    shoulder: 2.4, mass: 120,  herd: 8,  cost: 3200,  appeal: 3, activity: 'day', desc: 'Largest bird; open plains with sparse cover. Visitors love the chicks.' },
  impala:     { name: 'Impala',           latin: 'Aepyceros melampus', diet: 'mixed',   shoulder: 0.9, mass: 55,   herd: 25, cost: 1500,  appeal: 2, activity: 'day', desc: 'Edge species — mixes grazing and browsing. Prolific breeder and common prey.' },
};

export const SPECIES_ORDER = Object.keys(SPECIES);

export const BUILDINGS = [
  { type: 'gate',      name: 'Park gate',      icon: 'gate',      cost: 12000, upkeep: 120,  staff: 2,  w: 12, d: 6,  desc: 'Visitors enter here and buy tickets. One per park.' },
  { type: 'lodge',     name: 'Safari lodge',   icon: 'lodge',     cost: 85000, upkeep: 900,  staff: 12, w: 30, d: 18, desc: 'Overnight stays are the biggest earner. Needs a paved road and a view.' },
  { type: 'hide',      name: 'Wildlife hide',  icon: 'hide',      cost: 6500,  upkeep: 40,   staff: 0,  w: 6,  d: 6,  desc: 'Close, quiet sightings near water raise satisfaction.' },
  { type: 'waterhole', name: 'Water hole',     icon: 'water',     cost: 9000,  upkeep: 60,   staff: 0,  w: 16, d: 16, desc: 'Pumped water point; every species needs one within walking range.' },
  { type: 'ranger',    name: 'Ranger station', icon: 'ranger',    cost: 22000, upkeep: 380,  staff: 6,  w: 14, d: 10, desc: 'Patrols cut poaching risk and let vets treat sick animals.' },
  { type: 'shop',      name: 'Gift shop',      icon: 'shop',      cost: 18000, upkeep: 160,  staff: 3,  w: 12, d: 8,  desc: 'Extra income per visitor. Best next to the gate or lodge.' },
  { type: 'viewpoint', name: 'Viewpoint',      icon: 'viewpoint', cost: 4200,  upkeep: 25,   staff: 0,  w: 8,  d: 8,  desc: 'Cheap picnic stop with a view over a habitat.' },
  { type: 'fence',     name: 'Fence line',     icon: 'fence',     cost: 35,    upkeep: 1,    staff: 0,  perM: true, desc: 'Keeps predators and prey apart. Cost per metre.' },
];

export const OVERLAYS = [
  { id: 'none',      name: 'No overlay',       icon: 'eye',    desc: 'Plain view.' },
  { id: 'habitat',   name: 'Habitat quality',  icon: 'layers', desc: 'Colours each habitat by how well it fits the species living there.' },
  { id: 'happiness', name: 'Happiness heat',   icon: 'heat',   desc: 'Heat map of animal happiness across the park.' },
  { id: 'traffic',   name: 'Road usage',       icon: 'traffic', desc: 'Shows how busy each road segment is with safari vehicles.' },
];

export function speciesFacts(id, animalsApi) {
  const fb = SPECIES[id] || { name: titleFromId(id), latin: '', diet: 'grazer', shoulder: 1, mass: 100, herd: 5, cost: 5000, appeal: 3, activity: 'day', desc: '' };
  let info = null;
  try { info = animalsApi?.speciesInfo?.(id) || null; } catch { info = null; }
  if (!info) return { id, ...fb };
  // Merge whatever the animals module exposes over the fallback (tolerant of different key names).
  const size = info.size || info;
  return {
    id,
    name: info.name || info.displayName || fb.name,
    latin: info.latin || info.scientific || fb.latin,
    diet: info.diet || fb.diet,
    shoulder: num(size.shoulder ?? size.shoulderHeight ?? size.height, fb.shoulder),
    mass: num(size.mass ?? info.mass, fb.mass),
    herd: num(info.herd ?? info.herdSize ?? info.herd?.size, fb.herd),
    cost: num(info.cost ?? info.price, fb.cost),
    appeal: num(info.appeal ?? info.rarity ?? info.visitorAppeal, fb.appeal),
    activity: info.activity || (info.nocturnal ? 'night' : fb.activity),
    desc: info.desc || info.description || fb.desc,
  };
}

function num(v, d) { return typeof v === 'number' && Number.isFinite(v) ? v : d; }
function titleFromId(id) { return String(id || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()); }
