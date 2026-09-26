// Fallback data tables for the simulation. Pure JS, no imports.
// Used when the `animals` / `buildings` / `roads` modules are absent or do not expose the field we need.
// Units: metres, m², game-days, park currency ($).

/**
 * Species catalogue (fallback for animals.speciesInfo()).
 * prefs are the preferred habitat statistics in [0,1] (grass density, tree cover/shade, water need,
 * terrain roughness, hiding cover). space = m² per animal (carrying capacity = area / space).
 * breed = births per animal per day at full happiness. lifespan in days. feed/vet = $ per animal per day.
 * rarity = visitor appeal (0..1). visibility = how easy it is to spot from a vehicle. nocturnal = night activity share.
 */
// breed rates retuned 2026-09-08 (round 3): the old 0.0015–0.008/day values were calibrated so that
// a herd at happiness ~0.55 (drive 0.1 under the old 0.5 gate) produced ~0.07 expected births per
// month — the demo park measured 0 births in 30 days at every price point (tools/fidelity.mjs).
// Rates are now ~1.5x and the drive gate ramps from happiness 0.45 (sim.js): a moderately happy
// herd (h ≈ 0.6–0.7) adds a visible ~1–3 individuals per month while the room term (1 − n/capacity)
// still caps growth at carrying capacity, and a full 90 days of growth stays inside the feed bill
// (test.mjs: "a well-designed park makes money"). Births per animal per day at FULL happiness = breed.
export const SPECIES = Object.freeze({
  elephant:   { diet: 'mixed',    rarity: 0.90, visibility: 1.00, herd: 8,  space: 5000,  prefs: { grass: 0.50, trees: 0.60, water: 0.80, roughness: 0.20, cover: 0.30 }, predatorTolerance: 0.90, breed: 0.0020, lifespan: 60 * 365, feed: 60, vet: 8, price: 12000, nocturnal: 0.30 },
  giraffe:    { diet: 'browser',  rarity: 0.80, visibility: 0.95, herd: 6,  space: 3500,  prefs: { grass: 0.40, trees: 0.80, water: 0.30, roughness: 0.15, cover: 0.30 }, predatorTolerance: 0.60, breed: 0.0040, lifespan: 25 * 365, feed: 30, vet: 5, price: 6000,  nocturnal: 0.20 },
  zebra:      { diet: 'grazer',   rarity: 0.50, visibility: 0.80, herd: 12, space: 1200,  prefs: { grass: 0.85, trees: 0.20, water: 0.60, roughness: 0.15, cover: 0.15 }, predatorTolerance: 0.30, breed: 0.0070, lifespan: 20 * 365, feed: 15, vet: 3, price: 1500, nocturnal: 0.20 },
  wildebeest: { diet: 'grazer',   rarity: 0.40, visibility: 0.75, herd: 20, space: 900,   prefs: { grass: 0.90, trees: 0.15, water: 0.60, roughness: 0.10, cover: 0.10 }, predatorTolerance: 0.35, breed: 0.0080, lifespan: 18 * 365, feed: 14, vet: 3, price: 1000, nocturnal: 0.25 },
  buffalo:    { diet: 'grazer',   rarity: 0.55, visibility: 0.80, herd: 15, space: 1500,  prefs: { grass: 0.80, trees: 0.30, water: 0.80, roughness: 0.20, cover: 0.30 }, predatorTolerance: 0.60, breed: 0.0055, lifespan: 20 * 365, feed: 22, vet: 4, price: 2500, nocturnal: 0.30 },
  lion:       { diet: 'predator', rarity: 0.95, visibility: 0.60, herd: 6,  space: 9000,  prefs: { grass: 0.50, trees: 0.40, water: 0.40, roughness: 0.30, cover: 0.50 }, predatorTolerance: 1.00, breed: 0.0040, lifespan: 15 * 365, feed: 45, vet: 7, price: 9000,  nocturnal: 0.50 },
  cheetah:    { diet: 'predator', rarity: 0.85, visibility: 0.50, herd: 2,  space: 12000, prefs: { grass: 0.70, trees: 0.20, water: 0.30, roughness: 0.10, cover: 0.30 }, predatorTolerance: 1.00, breed: 0.0030, lifespan: 12 * 365, feed: 30, vet: 6, price: 8000,  nocturnal: 0.10 },
  hippo:      { diet: 'grazer',   rarity: 0.70, visibility: 0.70, herd: 8,  space: 1000,  prefs: { grass: 0.60, trees: 0.20, water: 1.00, roughness: 0.05, cover: 0.20 }, predatorTolerance: 0.90, breed: 0.0040, lifespan: 40 * 365, feed: 40, vet: 6, price: 7000,  nocturnal: 0.60 },
  rhino:      { diet: 'grazer',   rarity: 0.95, visibility: 0.85, herd: 3,  space: 5000,  prefs: { grass: 0.70, trees: 0.40, water: 0.60, roughness: 0.30, cover: 0.40 }, predatorTolerance: 0.80, breed: 0.0020, lifespan: 40 * 365, feed: 45, vet: 8, price: 15000, nocturnal: 0.30 },
  warthog:    { diet: 'mixed',    rarity: 0.30, visibility: 0.60, herd: 5,  space: 600,   prefs: { grass: 0.70, trees: 0.30, water: 0.40, roughness: 0.20, cover: 0.40 }, predatorTolerance: 0.30, breed: 0.0110, lifespan: 12 * 365, feed: 8,  vet: 2, price: 400,   nocturnal: 0.10 },
  ostrich:    { diet: 'mixed',    rarity: 0.50, visibility: 0.85, herd: 8,  space: 1200,  prefs: { grass: 0.70, trees: 0.10, water: 0.20, roughness: 0.10, cover: 0.10 }, predatorTolerance: 0.40, breed: 0.0080, lifespan: 35 * 365, feed: 10, vet: 2, price: 900,   nocturnal: 0.10 },
  impala:     { diet: 'browser',  rarity: 0.35, visibility: 0.70, herd: 25, space: 500,   prefs: { grass: 0.60, trees: 0.50, water: 0.50, roughness: 0.20, cover: 0.40 }, predatorTolerance: 0.25, breed: 0.0100, lifespan: 12 * 365, feed: 7,  vet: 2, price: 500,   nocturnal: 0.15 },
});

export const SPECIES_ORDER = Object.freeze(Object.keys(SPECIES));

/** Weights of the habitat-quality terms (sum = 1). */
export const HABITAT_WEIGHTS = Object.freeze({ grass: 0.20, trees: 0.15, water: 0.25, roughness: 0.05, cover: 0.05, space: 0.15, predator: 0.15 });

/**
 * Building catalogue (fallback for buildings.catalogue()). Matched by keyword against the building `type`
 * (case-insensitive, non-letters stripped) so 'rangerStation', 'ranger_station' and 'Ranger station' all match.
 * upkeep = $/day. Effects are read by the simulation only.
 */
export const BUILDINGS = Object.freeze([
  { key: 'lodge',      match: ['lodge', 'camp', 'hotel'],       upkeep: 400, beds: 40, quality: 0.70, rate: 90 },
  { key: 'gate',       match: ['gate', 'entrance'],             upkeep: 60 },
  { key: 'hide',       match: ['hide', 'blind', 'viewpoint'],   upkeep: 25, closeness: 0.12 },
  { key: 'tower',      match: ['tower', 'lookout'],             upkeep: 40, closeness: 0.10 },
  { key: 'ranger',     match: ['ranger', 'patrol', 'station'],  upkeep: 90, patrol: 1 },
  { key: 'waterhole',  match: ['water', 'pond', 'dam', 'pan'],  upkeep: 40, water: 0.30 },
  // water pump & trough (buildings catalogue 'pump'): the catalogue intends water: 1 — a pump fully
  // waters its habitat — but its catalogueRows() serialization drops the effect fields, so this
  // fallback row is what the sim actually reads (measured 2026-09-08: pumps were invisible and the
  // demo's dry habitats stayed below the breeding drive).
  { key: 'pump',       match: ['pump', 'trough'],               upkeep: 130, water: 1 },
  { key: 'shop',       match: ['shop', 'kiosk', 'store', 'souvenir'], upkeep: 60, shop: 1 },
  { key: 'restaurant', match: ['restaurant', 'cafe', 'diner'],  upkeep: 120, lodgeQuality: 0.10, shop: 0.5 },
  { key: 'vet',        match: ['vet', 'clinic', 'hospital'],    upkeep: 150, vet: 1 },
  { key: 'village',    match: ['village', 'housing', 'quarters', 'staff'], upkeep: 100, morale: 0.10 },
  { key: 'workshop',   match: ['workshop', 'garage', 'depot'],  upkeep: 80, efficiency: 0.10 },
  { key: 'fuel',       match: ['fuel', 'petrol'],               upkeep: 50 },
  { key: 'fence',      match: ['fence'],                        upkeep: 5 },
  { key: 'generic',    match: [],                               upkeep: 50 },
]);

/** Road kinds: upkeep per km per day and visitor comfort. */
export const ROADS = Object.freeze({
  dirt:   { upkeepPerKm: 40,  comfort: 0.45 },
  gravel: { upkeepPerKm: 70,  comfort: 0.70 },
  paved:  { upkeepPerKm: 120, comfort: 1.00 },
});

/** Staff roles: reference daily wage and what one person covers. */
export const STAFF = Object.freeze({
  ranger:      { wage: 130, label: 'Rangers',     per: 'habitat hectares', covers: 40 },   // one ranger patrols 40 ha
  keeper:      { wage: 110, label: 'Keepers',     per: 'animals',          covers: 20 },   // one keeper cares for 20 animals
  guide:       { wage: 100, label: 'Guides',      per: 'visitors/day',     covers: 40 },   // one guide per 40 visitors per day
  maintenance: { wage: 95,  label: 'Maintenance', per: 'buildings + km',   covers: 4 },
  lodge:       { wage: 80,  label: 'Lodge staff', per: 'beds',             covers: 15 },
});

export const STAFF_ORDER = Object.freeze(Object.keys(STAFF));

/** Global tunables. All time in game-days unless noted. */
export const CONST = Object.freeze({
  baseArrivals: 100,          // visitors/day at reputation 0.5, reference price, dry season, clear sky
  refPrice: 25,               // $ — price at which the elasticity factor is 1
  priceElasticity: 1.3,       // arrivals ∝ (refPrice/price)^elasticity
  groupSize: 4,               // visitors per safari vehicle
  tourHours: 4,               // hours a day visitor spends in the park
  gateOpen: 7, gateClose: 16, // arrivals window (peak mid-morning)
  lodgeShare: 0.35,           // share of arrivals wanting a lodge night at lodge quality 1
  shopSpend: 4,               // $ per visitor per shop-equivalent at satisfaction 1
  reputationRate: 0.12,       // EMA rate of reputation towards satisfaction
  moraleRate: 0.15,           // EMA rate of staff morale
  prosperityRate: 0.08,       // EMA rate of village prosperity
  loanInterestDaily: 0.0004,  // ≈ 15.7 % per 360-day year
  bankruptcyCash: -50000,
  bankruptcyDays: 5,
  migrationThreshold: 0.30,   // happiness below this counts as an unhappy day
  migrationDays: 3,           // consecutive unhappy days before animals leave
  migrationShare: 0.20,       // share of a group that leaves per day once migrating
  unhappyMortality: 0.025,    // extra deaths/animal/day at happiness 0 (quadratic ramp below 0.55)
  predationRate: 0.03,        // prey killed per predator per day when prey is available (a lion kills every ~33 days)
  sightingK: 0.12,            // P(see species) = 1 - exp(-n * visibility * roadFactor * K)
  seasonLength: 90,           // days per season in the internal fallback calendar (dry, wet alternate)
  historyCap: 400,
  starveRate: 0.03,          // predators above their prey capacity: deaths/day per excess animal (hunger → deaths);
                             // 0.08 collapsed 3 lions to 0 in 3 days on the live park — 0.03 spreads it over ~2–4 weeks
  hungerRate: 0.15,          // EMA rate of predators' perceived prey (count + biomass): ~6-day lag to a prey crash
});

// ---------------------------------------------------------------- food web (Wave P1, docs/specs/p1-food-web.md)

/**
 * Herbivore food need in plant food units per animal per day (the unit core/Plants.js `food` is
 * measured in: one hectare at full cover of a plant yields `food` units per day to the species it
 * attracts). Roughly body mass^0.75 in relative order, but scaled to our small parks (a demo
 * habitat is 2–4 ha, not 2–4 km²) so a well-stocked grass habitat is space-limited, not food-limited,
 * while browsers in a sparse woodland feel the tree cover. mass = kg (prey biomass for predators).
 */
export const FOOD = Object.freeze({
  elephant:   { need: 3.5,  mass: 4000 },
  giraffe:    { need: 1.2,  mass: 900 },
  hippo:      { need: 2.2,  mass: 1500 },
  rhino:      { need: 2.0,  mass: 1600 },
  buffalo:    { need: 1.6,  mass: 600 },
  zebra:      { need: 1.1,  mass: 250 },
  wildebeest: { need: 0.9,  mass: 200 },
  ostrich:    { need: 0.45, mass: 100 },
  warthog:    { need: 0.35, mass: 70 },
  impala:     { need: 0.3,  mass: 50 },
});

/**
 * Predator diet: prey species in reach (same habitat), daily meat need (kg/animal/day). Capacity follows
 * the LAGGED prey biomass (hunger): capacity = preyKg × PREY_YIELD / needKg, where preyKg is an EMA of the
 * live prey biomass with rate CONST.hungerRate — removing prey starves predators after a lag, not at once.
 * No insectivores among our 12 species, so there is no "insects come free with grass" rule this wave.
 */
export const DIET = Object.freeze({
  lion:    { prey: ['zebra', 'wildebeest', 'buffalo', 'impala', 'warthog'], needKg: 7 },
  cheetah: { prey: ['impala', 'warthog', 'ostrich'], needKg: 3 },
});

/** Share of prey biomass a habitat yields to its predators per day (sustainable offtake). */
export const PREY_YIELD = 0.05;

/**
 * Plant site suitability 0..1 per terrain BIOME (core/World.js order: GRASS, DRY_GRASS, DIRT, ROCK,
 * SAND, WETLAND, RIVERBED, ROAD_DUST) per plant (core/Plants.js order). A cell's cover ceiling is
 * maxCover × rainfallFit × site. Planting raises the site to at least PLANT_SITE (prepared ground).
 */
export const SITE = Object.freeze({
  //            red_oat couch lovegr sedge aloe sourpl umbrel knob  marula baobab
  0: Object.freeze([1.00, 0.60, 0.30, 0.10, 0.20, 0.50, 0.60, 0.60, 0.50, 0.20]), // GRASS
  1: Object.freeze([0.45, 0.80, 0.80, 0.00, 0.50, 0.35, 0.80, 0.30, 0.40, 0.50]), // DRY_GRASS
  2: Object.freeze([0.15, 0.35, 0.45, 0.00, 0.60, 0.15, 0.40, 0.10, 0.15, 0.40]), // DIRT
  3: Object.freeze([0.00, 0.05, 0.20, 0.00, 0.70, 0.05, 0.15, 0.00, 0.05, 0.50]), // ROCK
  4: Object.freeze([0.00, 0.10, 0.25, 0.00, 0.20, 0.00, 0.05, 0.00, 0.00, 0.10]), // SAND
  5: Object.freeze([0.30, 0.30, 0.05, 1.00, 0.00, 0.30, 0.10, 0.30, 0.20, 0.00]), // WETLAND
  6: Object.freeze([0.00, 0.15, 0.00, 0.60, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00]), // RIVERBED
  7: Object.freeze([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),                               // ROAD_DUST
});

/** Vegetation dynamics constants. */
export const VEG = Object.freeze({
  plantSite: 0.8,          // planting prepares the ground: site ≥ this in planted cells
  neighbourSeed: 0.5,      // share of the 4-neighbour mean cover that seeds a cell (× spread × fit)
  grazeDamp: 0.5,          // at pressure P ≤ 1 regrowth is scaled by (1 − grazeDamp × P)
  // overgrazing: at P > 1 the herd bites into the standing stock, cover × (1 − overgraze[form] × (P − 1))
  overgraze: Object.freeze({ grass: 0.10, shrub: 0.05, tree: 0.02 }),
  maxLoss: 0.5,            // at most half a cell's cover of one plant eaten per day
  rootReserve: 0.1,        // grazing never takes cover below this share of the cell's ceiling (roots/rootstock regrow)
  treeDensity: 0.6,        // seeding: P(tree/shrub present in a cell) = site × treeDensity (cover then 50–100 % of its ceiling)
  rainDry: 0.4, rainWet: 0.8, droughtRain: 0.35, weatherRain: 0.2,
  emitThreshold: 0.02,     // a cell counts as changed for vegetation:changed when a cover moved this much
});
