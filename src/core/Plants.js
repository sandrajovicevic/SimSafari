// Plant catalogue — shared data for the ideas-phase food web (docs/specs/p1-food-web.md).
// Core-owned: `simulation` runs the ecology (spread, grazing, capacity) against it, `props` draws it.
// Species and their broad ecology are natural-history facts; names, numbers and wording are ours.
//
// Fields
//   id, name, latin
//   form      'grass' | 'shrub' | 'tree'           (props picks a mesh family from this)
//   rainfall  'drought' | 'low' | 'medium' | 'high' (preferred rainfall tier; see RAINFALL_FIT)
//   attracts  animal species ids that feed on it (animals/species.js ids)
//   food      food units one hectare at full cover yields per day for its attracted species
//   spread    fractional growth of cover per day under ideal rainfall (logistic toward maxCover)
//   maxCover  cover ceiling 0..1 for this plant in one vegetation cell
//   cost      planting cost in $ per hectare-equivalent seeded (simulation.spend)

export const PLANTS = Object.freeze([
  { id: 'red_oat', name: 'Red-oat grass', latin: 'Themeda triandra', form: 'grass', rainfall: 'medium',
    attracts: ['zebra', 'wildebeest', 'buffalo', 'hippo'], food: 60, spread: 0.06, maxCover: 0.9, cost: 400 },
  { id: 'couch', name: 'Couch grass', latin: 'Cynodon dactylon', form: 'grass', rainfall: 'low',
    attracts: ['impala', 'warthog', 'zebra', 'rhino'], food: 45, spread: 0.08, maxCover: 0.85, cost: 300 },
  { id: 'lovegrass', name: 'Weeping lovegrass', latin: 'Eragrostis curvula', form: 'grass', rainfall: 'drought',
    attracts: ['wildebeest', 'rhino', 'ostrich'], food: 35, spread: 0.05, maxCover: 0.8, cost: 350 },
  { id: 'sedge', name: 'River sedge', latin: 'Cyperus sp.', form: 'grass', rainfall: 'high',
    attracts: ['hippo', 'buffalo'], food: 50, spread: 0.04, maxCover: 0.9, cost: 500 },
  { id: 'aloe', name: 'Aloe', latin: 'Aloe marlothii', form: 'shrub', rainfall: 'drought',
    attracts: ['elephant', 'warthog', 'ostrich'], food: 25, spread: 0.015, maxCover: 0.4, cost: 900 },
  { id: 'sour_plum', name: 'Sour plum', latin: 'Ximenia caffra', form: 'shrub', rainfall: 'medium',
    attracts: ['impala', 'elephant', 'giraffe'], food: 30, spread: 0.02, maxCover: 0.45, cost: 800 },
  { id: 'umbrella_thorn', name: 'Umbrella thorn', latin: 'Vachellia tortilis', form: 'tree', rainfall: 'low',
    attracts: ['giraffe', 'elephant', 'impala'], food: 40, spread: 0.008, maxCover: 0.35, cost: 1600 },
  { id: 'knobthorn', name: 'Knobthorn', latin: 'Senegalia nigrescens', form: 'tree', rainfall: 'medium',
    attracts: ['giraffe', 'elephant'], food: 35, spread: 0.006, maxCover: 0.3, cost: 1700 },
  { id: 'marula', name: 'Marula', latin: 'Sclerocarya birrea', form: 'tree', rainfall: 'medium',
    attracts: ['elephant', 'warthog', 'impala', 'giraffe'], food: 45, spread: 0.005, maxCover: 0.25, cost: 2200 },
  { id: 'baobab', name: 'Baobab', latin: 'Adansonia digitata', form: 'tree', rainfall: 'drought',
    attracts: ['elephant'], food: 30, spread: 0.002, maxCover: 0.15, cost: 3000 },
]);

export const PLANT_IDS = Object.freeze(PLANTS.map((p) => p.id));
export const PLANT_INDEX = Object.freeze(Object.fromEntries(PLANTS.map((p, i) => [p.id, i])));

/** Growth multiplier by (plant rainfall tier × current rainfall 0..1). Rows: tier; value at rain = 0, 0.5, 1. */
export const RAINFALL_FIT = Object.freeze({
  drought: [1.0, 0.9, 0.6],
  low: [0.6, 1.0, 0.8],
  medium: [0.25, 1.0, 1.0],
  high: [0.05, 0.6, 1.0],
});

/** Interpolated rainfall fit for a tier at rain 0..1. */
export function rainfallFit(tier, rain) {
  const r = RAINFALL_FIT[tier] || RAINFALL_FIT.medium;
  const t = rain <= 0 ? 0 : rain >= 1 ? 1 : rain;
  return t < 0.5 ? r[0] + (r[1] - r[0]) * (t / 0.5) : r[1] + (r[2] - r[1]) * ((t - 0.5) / 0.5);
}
