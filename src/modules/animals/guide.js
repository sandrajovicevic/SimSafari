// Field-guide entries for the 12 species (Wave P6, docs/specs/p6-field-guide.md).
// Every word is ours — general natural-history knowledge in our own sentences; nothing copied or
// closely paraphrased from the original game's guide, Wikipedia, or any published guide.
// Numbers that also exist in simulation/tables.js (herd, lifespan, diet) are repeated here and
// cross-checked against the table by guide.test.mjs — keep both sides in sync.
import { PLANTS } from '../../core/Plants.js';

/** id → guide entry. `herd`/`lifespanYears`/`diet` mirror SPECIES in simulation/tables.js;
 * `prey`/`predators` mirror DIET there (mutual, checked by the test). */
export const GUIDE = {
  elephant: {
    name: 'African elephant', latin: 'Loxodonta africana',
    summary: 'The largest land animal on Earth and the one that reshapes everything around it: elephants push over trees to browse, keep old routes to water open, and carry seeds for miles in their dung. A park needs wide ground and deep pockets for them, because a breeding herd eats and drinks in serious volume every single day. That appetite is also a management tool — where bush thickens into scrub, an elephant herd will open it back up faster than any tool you own.',
    facts: ['Breeding herds of about 8, led by the oldest female.', 'Can live around 60 years — the longest span in the park.', 'Classed here as a mixed feeder: grass by the season, browse every day.', 'The only species the baobab entry fears: bark-stripping can kill an old tree.'],
    diet: 'mixed', social: 'A matriarchal family line: daughters stay, sons drift off when grown.',
    prey: [], predators: [], herd: 8, lifespanYears: 60,
  },
  giraffe: {
    name: 'Giraffe', latin: 'Giraffa camelopardalis',
    summary: 'The tallest animal that has ever lived, and the park\'s built-in ladder: where giraffes browse, the acacia canopy stays trimmed into a flat, shaded shelf that antelope feed under. They move loose and unhurried, watch the whole park from five metres up, and fight by swinging their necks like hammers. Keep them near scattered tall trees with clear sightlines — a giraffe in open short grass is a nervous giraffe, and a giraffe in dense forest is a wasted one.',
    facts: ['Loose herds of about 6, constantly changing membership.', 'Lifespan of roughly 25 years in a well-kept park.', 'Browsers: umbrella thorn and knobthorn crowns are their canteen.', 'About 55 cm of tongue strips branches without a thorn complaint.'],
    diet: 'browser', social: 'Open herds with no fixed leader; mothers with calves keep to cover.',
    prey: [], predators: [], herd: 6, lifespanYears: 25,
  },
  zebra: {
    name: 'Plains zebra', latin: 'Equus quagga',
    summary: 'Living barcodes and the park\'s most photogenic lawnmowers. Every stripe pattern is an individual\'s, which is how you will learn to tell herds apart before you learn to budget. Zebra graze the coarse grass tops first, opening the sward for the pickier feeders behind them — the classic grazing line of the savanna. They are also the species your lions will take most often, so a big, breeding zebra herd is quietly doing double duty as pride support.',
    facts: ['Family harems gather into herds of about 12.', 'Live around 20 years.', 'Grazers that favour short, sweet grass near water.', 'Stripe patterns are unique — guides name them like friends.'],
    diet: 'grazer', social: 'One stallion per harem of mares; bachelor groups orbit the edges.',
    prey: [], predators: ['lion'], herd: 12, lifespanYears: 20,
  },
  wildebeest: {
    name: 'Blue wildebeest', latin: 'Connochaetes taurinus',
    summary: 'The engine room of the plains. Wildebeest live in the park\'s biggest herds, eat grass down to a lawn, and calve in a tight, noisy window that swamps every predator for a few weeks. They look like a committee designed them — beef forequarters, spindly legs, a beard — but the design works: they migrate, they breed fast, and they hold the bottom of the food chain steady for everything above them. Where the wildebeest thrive, the park is working.',
    facts: ['Herds of around 20 — the largest in the park.', 'Lifespan near 18 years.', 'Grazers: they will mow a habitat to a lawn and move on.', 'Calves stand and run within minutes of birth.'],
    diet: 'grazer', social: 'Fluid massed herds; territory matters less than grass does.',
    prey: [], predators: ['lion'], herd: 20, lifespanYears: 18,
  },
  buffalo: {
    name: 'Cape buffalo', latin: 'Syncerus caffer',
    summary: 'A buffalo herd is the park\'s fastest tank column: dense, dark, dusty, and completely uninterested in your vehicle schedule. They are heavy grazers that need wallows and thick cover, and they are the one prey species your lions will think hard about — a healthy herd defends its own, and injured lions are a vet bill. Give them the wettest habitat you have and leave them to it; visitors rate a buffalo wallow at dusk above almost anything.',
    facts: ['Herds of about 15, stacked close when threatened.', 'Live around 20 years.', 'Grazers tied to water: wallows, green edges, dense cover.', 'Herd defense works — lions pay dearly for a mistake.'],
    diet: 'grazer', social: 'Defensive herds with mixed ages; old bulls drift to bachelor fringes.',
    prey: [], predators: ['lion'], herd: 15, lifespanYears: 20,
  },
  lion: {
    name: 'Lion', latin: 'Panthera leo',
    summary: 'The park\'s headline act and its hardest management problem. A pride sleeps through the heat of the day and works at dusk and after dark, and the females do nearly all of it — the male\'s job is presence, mane, and noise. Lions need a real prey base to stand on: stock a kopje with impala and zebra and the pride pays for itself in gate receipts; let the prey run down and the pride starves in front of your visitors. Buy the prey before you buy the cats.',
    facts: ['Prides of about 6 — the matriarch\'s daughters and their cubs.', 'Lifespan of roughly 15 years.', 'The park\'s apex predator: zebra, wildebeest, buffalo, impala and warthog are all on the menu.', 'Mostly crepuscular: dawn and dusk drives see the action.'],
    diet: 'predator', social: 'Related females for life; a coalition of males holds the pride for a few years.',
    prey: ['zebra', 'wildebeest', 'buffalo', 'impala', 'warthog'], predators: [], herd: 6, lifespanYears: 15,
  },
  cheetah: {
    name: 'Cheetah', latin: 'Acinonyx jubatus',
    summary: 'Built like a greyhound with an engine upgrade: a light frame, a tail built for steering, and a sprint that empties the tank in twenty seconds. Cheetah hunt by daylight, in the open, alone or in small sibling coalitions, and they need exactly that — long sightlines and low, scattered cover. They lose kills to lions and hyenas in the wild, so in the park the rule is simple: never put them where the pride lives, and give them a plain of their own.',
    facts: ['Seen alone or in pairs — the smallest social unit here.', 'Lifespan of about 12 years.', 'Hunt impala, warthog and ostrich in open country.', 'A sprint lasts seconds; the recovery after it takes much longer.'],
    diet: 'predator', social: 'Mothers with cubs, or brother coalitions; otherwise solitary.',
    prey: ['impala', 'warthog', 'ostrich'], predators: [], herd: 2, lifespanYears: 12,
  },
  hippo: {
    name: 'Hippopotamus', latin: 'Hippopotamus amphibius',
    summary: 'A wall of muscle that spends the day as a log and the night as a lawnmower. Hippos lounge in deep water through the heat, graze riverside grass after dark, and defend their stretch of water so seriously that the fencing plan should treat them as infrastructure. They are grazers despite the amphibious life — grass, and a great deal of it. Keep the water deep and permanent, keep the banks gentle, and the pod becomes the single most reliable sighting in the park.',
    facts: ['Pods of about 8 stacked into the best water.', 'Lifespan around 40 years.', 'Night grazers: banks are mowed while the park sleeps.', 'Water dependency is total — no river, no hippos.'],
    diet: 'grazer', social: 'A bull\'s water, a pod of cows; skirmishes at the shallows are constant.',
    prey: [], predators: [], herd: 8, lifespanYears: 40,
  },
  rhino: {
    name: 'White rhinoceros', latin: 'Ceratotherium simum',
    summary: 'A grazing machine the size of a car, with a square lip built like a mower blade for cropping short grass close to the ground. Rhino are the park\'s headline conservation story and its biggest poaching magnet at the same time — a single horn is worth more to a poacher than most parks earn in a year, so rangers come first, rhino second, always. They are calmer than they look, near-sighted, and happiest on wide, open, well-grazed ground they can see around.',
    facts: ['Usually seen as a cow and calf, or three at most.', 'Can reach 40 years — the park\'s longest-lived grazer.', 'Broad square lip: a strict short-grass specialist.', 'The poaching math is brutal: fund the ranger station first.'],
    diet: 'grazer', social: 'Mostly solitary; calves stay with the cow for years.',
    prey: [], predators: [], herd: 3, lifespanYears: 40,
  },
  warthog: {
    name: 'Warthog', latin: 'Phacochoerus africanus',
    summary: 'The park\'s hardy little survivor: knees built for kneeling, a snout built for digging, and a burrow it backs into tail-first whenever anything goes wrong. Warthog eat anything the ground offers — roots, bulbs, grass, the odd grub — which makes them the cheapest large animal to keep and a reliable filler for poor habitat nothing else wants. They are also fast, funny, and forever in the middle of the road, which is exactly why visitors remember them.',
    facts: ['Sounders of about 5, often one sow and her piglets.', 'Around 12 years of rooting, running and bolting for cover.', 'Mixed feeders: dig for roots, graze new grass, never fussy.', 'Back into the burrow first — tusks face whatever follows.'],
    diet: 'mixed', social: 'Sow-led sounders; boars go it alone outside the breeding season.',
    prey: [], predators: ['lion', 'cheetah'], herd: 5, lifespanYears: 12,
  },
  ostrich: {
    name: 'Ostrich', latin: 'Struthio camelus',
    summary: 'The biggest bird that has ever lived, and it has given up flying entirely in exchange for legs: a sprinting ostrich outruns anything in the park except a vehicle. They patrol the open plains in loose groups, grazing and picking at anything small, with eyes that miss nothing — the flocks you bought as a curiosity become the park\'s early-warning system for visitors and predators alike. The eggs are a spectacle in themselves; a public nest is a guaranteed stop on every tour.',
    facts: ['Loose groups of about 8 on open ground.', 'A lifespan of some 35 years.', 'Mixed feeders: grass, seed, and whatever the ground offers.', 'The largest egg of any living bird — one feeds a family.'],
    diet: 'mixed', social: 'One cock with a harem; chicks are crèched into one big guarded group.',
    prey: [], predators: ['cheetah'], herd: 8, lifespanYears: 35,
  },
  impala: {
    name: 'Impala', latin: 'Aepyceros melampus',
    summary: 'The park\'s small change and its foundation stone. Impala live in the biggest herds you can buy, breed faster than anything else with hooves, and leap like they have springs hidden in the legs. The park books them as browsers — bush-edge feeders that work the line between grass and thicket, which is why they thrive where cover and open ground meet. Everything with claws eats them, which is not a design flaw: it is their job description. Keep them numerous.',
    facts: ['Herds of about 25 — biggest head-count per purchase.', 'Around 12 years of high-alert living.', 'Feed at the bush line; classed here as browsers.', 'Can clear 3 metres in a single bound, often for no visible reason.'],
    diet: 'browser', social: 'Bachelor herds apart from breeding herds; rams fight hard each rut.',
    prey: [], predators: ['lion', 'cheetah'], herd: 25, lifespanYears: 12,
  },
};

/** Plant catalogue names that list this species under `attracts` (core/Plants.js is the owner). */
function attractorsOf(species) {
  return PLANTS.filter((p) => (p.attracts || []).includes(species)).map((p) => p.name);
}

/** Guide entry for one species → { id, name, latin, summary, facts, diet, social, prey, predators,
 * attracts, herd, lifespanYears }. Unknown id → null. Pure data, no DOM, no module state. */
export function guideEntry(species) {
  const g = GUIDE[species];
  if (!g) return null;
  return { id: species, name: g.name, latin: g.latin, summary: g.summary, facts: g.facts.slice(),
    diet: g.diet, social: g.social, prey: g.prey.slice(), predators: g.predators.slice(),
    attracts: attractorsOf(species), herd: g.herd, lifespanYears: g.lifespanYears };
}

/** All entry ids in table order (leopard deliberately absent — it is not in the park). */
export const GUIDE_IDS = Object.freeze(Object.keys(GUIDE));
