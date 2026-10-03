// Plant field-guide text (Wave P6). Names, latin names, form, rainfall tier and the species each
// plant attracts are owned by core/Plants.js and read from it — this file adds only the guide's
// own words (summary + facts), per docs/specs/p6-field-guide.md ("core/Plants.js stays data-only").
// Every sentence is ours; numbers that appear in Plants.js (food units, cost) are quoted as-is.
import { PLANTS, PLANT_INDEX } from '../../core/Plants.js';

/** plant id → guide text. Everything else on a plant page comes from core/Plants.js live. */
export const PLANT_GUIDE = {
  red_oat: {
    summary: 'The backbone grass of the savanna and the first thing you should plant on tired ground. Red oat grows in waist-high tussocks, seeds itself steadily outward, and turns the colour of rust iron as the dry season ripens the seed heads — the cue every grazing herd in the park has learned to follow. It carries more forage per patch than anything else you can sow, and the herd it feeds will keep the sward low, green and growing all season.',
    facts: ['The park\'s highest-yield grass: 60 food units a day at full cover.', 'Russet seed heads give the dry season its signature colour.', 'Attracts zebra, wildebeest, buffalo and hippo.', 'A medium-rainfall plant: steady in the wet, dormant in drought.'],
  },
  couch: {
    summary: 'The recovery grass. Couch creeps sideways on runners, grabs bare soil, and knits a rooting green mat over ground that heavier grasses would starve on — which makes it the tool for repairing trampled banks, firebreaks and construction scars. It does not grow tall and never will; what it does is hold the park together at ground level, and feed the pickier short-grass grazers that flock to a mown lawn.',
    facts: ['Creeping runners bind bare soil fast — first plant on any scar.', 'Short but reliable: 45 food units at full cover.', 'Attracts impala, warthog, zebra and rhino.', 'Handles dry spells better than the tall grasses (low rainfall tier).'],
  },
  lovegrass: {
    summary: 'A fine, weeping, silver-green bunchgrass that asks for almost nothing. Lovegrass is the drought tier\'s quiet performer: it stays alive and palatable through dry stretches that flatten red oat, holding a thin green haze over ground that would otherwise blow away. It is not a bulk feeder — think of it as the park\'s insurance layer, keeping browsers and grazers fed at the exact time of year everything else has stopped.',
    facts: ['The driest of the grasses — drought tier, green when others are not.', '35 food units a day at full cover.', 'Attracts wildebeest, rhino and ostrich.', 'Fine drooping leaves; seeds freely on poor soil.'],
  },
  sedge: {
    summary: 'The waterline\'s own grass. Sedge colonises riverbanks, seeps and the wet ring around every waterhole, standing in dense emerald clumps where nothing woody dares root. It is the most water-hungry plant in the catalogue and pays for it by feeding the two heaviest water-side species in the park, who arrive to drink and stay to graze. Plant it on every bank you own; it stops the edges washing into your water.',
    facts: ['High-rainfall tier: needs wet ground or it sulks.', '50 food units a day at full cover — rich grazing.', 'Feeds hippo and buffalo at the water\'s edge.', 'Dense rooted clumps armour banks against erosion.'],
  },
  aloe: {
    summary: 'A rugged, torch-shaped succulent that spends the dry season doing what everything else has given up on: flowering. Tall spikes of orange-red open when the park is at its driest, and for a few weeks the aloe stands are the busiest places in the reserve. The fleshy, bitter leaves hold water through drought, need no care, and give a thorny, architectural shape to bare ground. Cheap insurance against a brown, flowerless dry season.',
    facts: ['Drought tier — the plant that blooms when the rains fail.', 'Modest 25 food units, but it never stops offering them.', 'Elephant, warthog and ostrich seek it out.', 'Bitter, water-filled leaves; nothing overgrazes it.'],
  },
  sour_plum: {
    summary: 'A stiff, twiggy shrub with small leathery leaves and a fruit that earns its name twice over: mouth-puckering raw, prized cooked. Sour plum thickets are the middle storey the park needs — too low to be a tree, too dense to be grass — and they specialise in edges: the seam between grassland and bush where impala, giraffe and young elephants do most of their feeding. Every habitat with an edge wants a line of them.',
    facts: ['Medium rainfall tier; tolerant of poor, thin soil.', '30 food units a day at full cover.', 'Attracts impala, elephant and giraffe.', 'Fruit is bitter fresh but prized by birds and people.'],
  },
  umbrella_thorn: {
    summary: 'The postcard tree: a flat, flat-topped crown on a dark, twisted trunk, throwing the classic circle of shade every visitor photograph hunts for. Umbrella thorns drive taproots deep enough to shrug off real drought, and their crowns are the park\'s high canteen — the browsing level giraffes and elephants built their lives around. Plant them where you want shade, silhouette and structure; they are the cheapest architecture in the catalogue.',
    facts: ['The iconic flat crown — the savanna\'s silhouette tree.', 'Low rainfall tier: deep roots ride out dry years.', '40 food units; giraffe, elephant and impala browse it.', 'Tough, cheap and fast to establish for a tree.'],
  },
  knobthorn: {
    summary: 'The aristocrat of the acacias: pale, iron-hard wood studded with paired thorns the size of dressmaker\'s pins, and a crown giraffes treat as a personal salad bar. Knobthorn grows slowly into a broad, sculptural tree that outlives everything planted around it, and in late winter it vanishes under cream flowers that bring the park alive for a fortnight. Expensive, patient, and worth it — this is the tree a mature park is built around.',
    facts: ['Slow, hard-wooded, long-lived — plant for the decade, not the season.', 'Medium rainfall tier; 35 food units at full cover.', 'Browsed by giraffe and elephant almost exclusively.', 'Cream flowering flush is a park-wide event each dry season.'],
  },
  marula: {
    summary: 'The generous one. A marula is a broad, spreading tree that drops sweet yellow fruit in quantities that bring every fruit-eater in the reserve running — and the fruit\'s second life in kitchens and liqueurs is famous far beyond any park fence. Elephant will walk past better food to reach a fruiting marula, and the bulls will test any marula\'s bark. It is costly and slow, but no other single tree feeds so much of the park at once.',
    facts: ['The heaviest-feeding tree: 45 food units at full cover.', 'Elephant, warthog, impala and giraffe all queue for the fruit drop.', 'Medium rainfall tier; wants real soil to thrive.', 'Elephant bulls strip bark — marula groves need space from the herd.'],
  },
  baobab: {
    summary: 'The park\'s monument: a swollen, water-storing trunk the size of a cottage, bare branches like roots against the sky for most of the year, and a lifespan measured in centuries rather than decades. A baobab is not forage — it is landscape, landmark and legend in one, the tree visitors describe to people back home. Buy one when the park can afford ceremony. Plant it where the evening light will find it, and protect it: even a century-old giant can be ruined by a bored elephant.',
    facts: ['Drought tier by constitution — the trunk IS the reservoir.', 'Sparse feed (30 units): its value is the landmark, not the forage.', 'Attracts elephant, which also girdles young ones — give them space.', 'The costliest plant in the catalogue, and the only one that outlives the fence.'],
  },
};

/** Plant guide entry for ui pages: merges core data (the owner) with this file's text.
 * Unknown id → null. Pure data. */
export function plantGuideEntry(id) {
  const i = PLANT_INDEX[id];
  if (i === undefined) return null;
  const p = PLANTS[i];
  const g = PLANT_GUIDE[id] || {};
  return { id, name: p.name, latin: p.latin, form: p.form, rainfall: p.rainfall,
    attracts: (p.attracts || []).slice(), food: p.food, cost: p.cost,
    summary: g.summary || '', facts: (g.facts || []).slice() };
}

export const PLANT_GUIDE_IDS = Object.freeze(PLANTS.map((p) => p.id));
