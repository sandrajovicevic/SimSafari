// The building catalogue: everything the park can build, with footprint, economics and placement rules.
// `w` × `d` are the footprint in metres BEFORE rotation (w along local x, d along local z).
// Placement rules are read by canPlace(); the economics are read by the simulation and ui modules.

/** Category ids used by the build toolbar. */
export const CATEGORIES = ['entrance', 'guest', 'food', 'retail', 'service', 'wildlife', 'viewing', 'staff', 'infra'];

const T = (o) => Object.freeze(o);

export const TYPES = Object.freeze({
  gate: T({
    key: 'gate', name: 'Entrance Gate & Ticket Office', category: 'entrance',
    w: 18, d: 11, height: 6.2, builder: 'gate',
    cost: 48000, upkeep: 240, staff: 3, capacity: 0, appeal: 0.30, jobs: 3,
    rules: { roadAccess: 24, maxSlope: 7, allowWater: false, zone: null, flatten: true },
    desc: 'Twin stone piers, a timber lintel carrying the park sign, a thatched ticket kiosk and a boom.',
  }),
  lodge: T({
    key: 'lodge', name: 'Safari Lodge', category: 'guest',
    w: 38, d: 32, height: 11.2, builder: 'lodge',
    cost: 320000, upkeep: 1850, staff: 12, capacity: 24, appeal: 0.95, jobs: 12, beds: 24,
    rules: { roadAccess: 30, maxSlope: 9, allowWater: false, zone: null, flatten: true },
    desc: '12 rooms in two wings around a thatched great room on a stone plinth, timber deck and pool.',
  }),
  tent: T({
    key: 'tent', name: 'Tented Camp Unit', category: 'guest',
    w: 7, d: 6.5, height: 3.6, builder: 'tent',
    cost: 13000, upkeep: 95, staff: 0, capacity: 2, appeal: 0.55, jobs: 0, beds: 2,
    rules: { roadAccess: 45, maxSlope: 10, allowWater: false, zone: null, flatten: true },
    desc: 'Canvas safari tent with a fly sheet on a raised timber deck.',
  }),
  restaurant: T({
    key: 'restaurant', name: 'Restaurant & Bar', category: 'food',
    w: 22, d: 15, height: 7.6, builder: 'restaurant',
    cost: 125000, upkeep: 720, staff: 6, capacity: 60, appeal: 0.70, jobs: 6,
    rules: { roadAccess: 25, maxSlope: 8, allowWater: false, zone: null, flatten: true },
    desc: 'Open-sided thatched boma with a stone bar, long tables and a fire pit.',
  }),
  shop: T({
    key: 'shop', name: 'Gift Shop', category: 'retail',
    w: 13, d: 10, height: 5.6, builder: 'shop',
    cost: 56000, upkeep: 270, staff: 2, capacity: 20, appeal: 0.45, jobs: 2,
    rules: { roadAccess: 22, maxSlope: 8, allowWater: false, zone: null, flatten: true },
    desc: 'Plastered shop with a shaded veranda, display windows and a hanging sign.',
  }),
  ranger: T({
    key: 'ranger', name: 'Ranger Station', category: 'service',
    w: 15, d: 11, height: 6.4, builder: 'ranger',
    cost: 72000, upkeep: 430, staff: 4, capacity: 0, appeal: 0.15, jobs: 4,
    rules: { roadAccess: 30, maxSlope: 9, allowWater: false, zone: null, flatten: true },
    desc: 'Radio mast, solar panels, water tank and a corrugated-iron equipment bay.',
  }),
  clinic: T({
    key: 'clinic', name: 'Veterinary Clinic', category: 'service',
    w: 17, d: 12, height: 6.0, builder: 'clinic',
    cost: 98000, upkeep: 580, staff: 3, capacity: 0, appeal: 0.10, jobs: 3,
    rules: { roadAccess: 26, maxSlope: 8, allowWater: false, zone: null, flatten: true },
    desc: 'Whitewashed treatment block with a covered ambulance bay and a holding pen.',
  }),
  workshop: T({
    key: 'workshop', name: 'Workshop & Garage', category: 'service',
    w: 19, d: 13, height: 5.8, builder: 'workshop',
    cost: 66000, upkeep: 310, staff: 3, capacity: 0, appeal: 0.02, jobs: 3,
    rules: { roadAccess: 20, maxSlope: 9, allowWater: false, zone: null, flatten: true },
    desc: 'Corrugated-iron shed with open vehicle bays, fuel drums and a jib crane.',
  }),
  hide: T({
    key: 'hide', name: 'Hide', category: 'viewing',
    w: 10, d: 8, height: 4.6, builder: 'hide',
    cost: 27000, upkeep: 150, staff: 0, capacity: 12, appeal: 0.60, jobs: 0,
    rules: { roadAccess: 60, maxSlope: 14, allowWater: false, zone: null, flatten: true },
    desc: 'Viewing shelter on stilts with a slot window, reed screen and access stair.',
  }),
  tower: T({
    key: 'tower', name: 'Viewing Tower', category: 'viewing',
    w: 8, d: 8, height: 12.5, builder: 'tower',
    cost: 44000, upkeep: 210, staff: 0, capacity: 16, appeal: 0.72, jobs: 0,
    rules: { roadAccess: 60, maxSlope: 12, allowWater: false, zone: null, flatten: true },
    desc: 'Braced timber tower, two stair flights and a thatched crow’s nest.',
  }),
  pump: T({
    key: 'pump', name: 'Water Pump & Trough', category: 'wildlife',
    w: 9, d: 7, height: 7.4, builder: 'pump',
    cost: 19000, upkeep: 130, staff: 0, capacity: 0, appeal: 0.20, jobs: 0, water: 1,
    rules: { roadAccess: 0, maxSlope: 12, allowWater: false, zone: null, flatten: true },
    desc: 'Multi-blade windpump, header tank and a concrete drinking trough.',
  }),
  feeder: T({
    key: 'feeder', name: 'Feeding Station', category: 'wildlife',
    w: 7, d: 7, height: 3.9, builder: 'feeder',
    cost: 9500, upkeep: 85, staff: 0, capacity: 0, appeal: 0.15, jobs: 0, food: 1,
    rules: { roadAccess: 0, maxSlope: 14, allowWater: false, zone: null, flatten: true },
    desc: 'Raised hay crib under a small thatch canopy with a salt lick.',
  }),
  house: T({
    key: 'house', name: 'Staff House', category: 'staff',
    w: 10, d: 8, height: 4.8, builder: 'house',
    cost: 23000, upkeep: 115, staff: 0, capacity: 0, appeal: 0.05, jobs: 0, houses: 4,
    rules: { roadAccess: 40, maxSlope: 10, allowWater: false, zone: null, flatten: true },
    desc: 'Village house: rendered walls, a corrugated or thatched roof and a shaded stoep.',
  }),
  toilets: T({
    key: 'toilets', name: 'Toilets', category: 'infra',
    w: 9, d: 6, height: 3.9, builder: 'toilets',
    cost: 21000, upkeep: 140, staff: 1, capacity: 8, appeal: 0.12, jobs: 1,
    rules: { roadAccess: 25, maxSlope: 8, allowWater: false, zone: null, flatten: true },
    desc: 'Small block with two doors, a vent pipe and a header tank.',
  }),
  parking: T({
    key: 'parking', name: 'Car Park', category: 'infra',
    w: 28, d: 18, height: 3.2, builder: 'parking',
    cost: 42000, upkeep: 160, staff: 0, capacity: 40, appeal: 0.05, jobs: 0,
    rules: { roadAccess: 14, maxSlope: 5, allowWater: false, zone: null, flatten: true },
    desc: 'Gravel bay with timber kerbs, bollards and a shade tree island.',
  }),
  fencegate: T({
    key: 'fencegate', name: 'Fence Gate', category: 'infra',
    w: 7, d: 2.4, height: 3.0, builder: 'fencegate',
    cost: 6500, upkeep: 45, staff: 0, capacity: 0, appeal: 0.0, jobs: 0,
    rules: { roadAccess: 12, maxSlope: 12, allowWater: false, zone: null, flatten: true },
    desc: 'Two braced posts and a swing gate through a habitat fence line.',
  }),
});

export const TYPE_KEYS = Object.freeze(Object.keys(TYPES));

/** Public catalogue rows (plain, serialisable). */
export function catalogueRows() {
  return TYPE_KEYS.map((k) => {
    const t = TYPES[k];
    return {
      key: t.key, name: t.name, category: t.category, desc: t.desc,
      w: t.w, d: t.d, height: t.height,
      cost: t.cost, upkeep: t.upkeep, staff: t.staff, capacity: t.capacity, appeal: t.appeal,
      beds: t.beds || 0, houses: t.houses || 0, jobs: t.jobs || 0,
      rules: { ...t.rules },
    };
  });
}

export function getType(key) { return TYPES[key] || null; }
