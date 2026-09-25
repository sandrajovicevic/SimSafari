# SimSafari 1998 — mechanics study and adoption proposals

Provenance: analysis of the owner's locally installed copy (parsing only; **no original code,
assets, text, or audio were copied into this repo**). Sources mined: the game's text table
(`STRINGS.SPD` — advisor messages, field guide, mission goals, trivia), `README.DOC` (mission
names/difficulty), and the `Missions/` folder contents (bitmap minimaps only; objectives live in
the text table). Everything below is a mechanics description in our own words — game *rules and
ideas*, which are not protected expression, plus our own designs for them.

## 1. What the original's systems actually were

**Ecology (the heart of the game):**
- **33 animal species** (vs our 12): big mammals we already have, plus spotted hyena, wild dog,
  leopard, baboon, meerkat, greater kudu, waterbuck, Thomson's gazelle, sable antelope, oryx,
  common duiker, savanna hare, Nile crocodile, and ~10 bird species (flamingo, secretarybird,
  martial eagle, vulture, stork, hornbill, guineafowl, oxpecker, crowned lapwing) plus small
  reptiles/amphibians (mamba, monitor lizard, skink, bullfrog).
- **16 plant species**, each with an **"Attracts" list** (which animals it feeds) and a
  **Preferred Rainfall tier** (low / medium / high / drought-resistant). Grasses (red-oat, Bermuda,
  love grass), shrubs/herbs (aloe, sedge, star lily, sour plum, fever berry), trees (umbrella
  thorn, knobthorn, leadwood, marula, sausage tree, bushwillow, camel thorn, winterthorn, ilala
  palm, baobab).
- **Explicit food web as a first-class UI**: every species lists *My Predators* and *My Diet*.
  The game constantly coaches via it: "balance predator-prey relationships", "put in predators to
  control booming populations", "insects come free with grasses and shrubs" (insectivores fed
  implicitly), "animals may starve if food is too far away or crowded".
- **Plants spread on their own** — plant a few, wait, save money. Vegetation is a growing stock,
  not a static decal.
- **Rainfall axis**: species and plants have rainfall preferences; droughts interact with it;
  placing water in the park mitigates ("add water to keep some species alive").
- **Natural immigration**: wild animals wander in when food they like exists.
- **Population-control verbs**: cull via predators or remove food; herd protection vs crowding
  stress ("too many animals in one area run out of food").

**Active disasters (the original's signature hands-on play):**
- **Fire** in the park, camp, or village. Fire spreads through vegetation; the player fights it
  actively — **bulldoze firebreaks** or **ring it with water**. Consequences are granular: burnt
  grassland regrows; specific camp buildings burn (tent, dining area, outhouse, cottage, lodge,
  car, amphitheater, hot tub, pool, animal blind, camp office, ranger station) and must be
  bulldozed-then-rebuilt.
- **Locust invasions** — cleared with the bulldozer.
- **Drought** — wait it out or place water.

**Camp + village side (two-map management):**
- The player manages a **tourist camp** (buildings grid) *and* the **reserve**, plus a **village**
  the staff come from.
- Facility ladder: **tents → cottages → lodge** (guests pay more per tier); support buildings:
  outhouses, showers, dining halls, picnic tables, camp office, ranger station; luxuries:
  swimming pool, hot tub, amphitheater, **animal blind** (watch animals without disturbing them).
- **Paths matter**: a building without a path is unused ("visitors only use the stuff that has a
  path leading to it").
- **Vehicle fleet ladder**: basic cars → poptop vans → 4-door cars; **every car needs a driver**;
  safari drives require roads connecting the camp edge to the park edge.
- **Five staff types** — cooks, attendants, scouts, naturalists, drivers — each facility consumes
  specific staff; over/understaffing is coached; **layoffs damage village trust**; in a money
  crisis staff work for free temporarily (morale).
- **Feedback loops the advisors narrate**: bed occupancy vs visitor inflow, crowding ("too many
  visitors, too many buildings — they want nature"), species variety complaints, **poaching signs
  (bones) depressing guests**, Big 5 presence driving bookings.

**Meta / progression:**
- **Big 5 + biodiversity scoring** with public consequences ("written up in travel magazines" →
  demand). Mission goals like "5+ of each of the Big 5".
- **Missions with time-limited quantitative goals**: zebra → 60 in 5 years; cheetah → 30 in 10;
  rhino → 20 in 10; elephant → 20 in 10; hares → cull to 150–200 and hold for 2 months;
  "Stop the Poaching"; "Safari Camp Self-Barbecue" (fire survival). Endangered-species missions
  pick the species randomly. Money goal example: "$50,000 in the bank by year 10".
- **5-star ranger rating** for balancing park + camp + village.
- **Educational layer**: per-species Field Guide entries (predators, diet, natural-history facts)
  and **trivia quizzes** with multiple-choice questions.

## 2. What the remake already covers

Deterministic ecosystem sim (habitat quality per species, births/deaths/migration, predator
pressure), visitor arrivals with price elasticity, full ledger, rangers vs poaching risk, seeded
drought/disease events, village prosperity, tours and a sightings chain, vehicles and roads,
a buildings catalogue (lodge/tents etc.), UI shell, 12 of the original's 33 species.

## 3. Ranked adoption proposals (impact × feasibility, agent-sized)

1. **Food-web ecology + plant layer** (simulation + props + park). Per-species `diet`/`predators`
   tables; 8–10 procedural plants with `attracts` + rainfall tier + self-spreading coverage;
   insectivores fed implicitly by grass/shrub coverage. Deepens the core loop the harness already
   measures. *Harness scenarios:* "plant 5 aloe → elephant carrying capacity rises by N";
   "remove prey → predator population follows after k days".
2. **Fire as an interactive disaster** (terrain burn state + tools + effects + simulation event).
   Fire cells spread with wind/dryness; player countermeasures: bulldozer firebreak, water ring.
   Burnt buildings enter a rebuild state; burnt grassland regrows. *Harness:* "fire at day X with
   response vs without → hectares lost, buildings destroyed".
3. **Missions + star rating** (new lightweight `missions` module or park scenarios + ui).
   Objective types already measurable by the harness: population-N-within-T, hold-range-for-T,
   cash-by-year, survive-the-fire. Gives the sandbox an actual game. *Harness:* mission runner
   replays deterministically.
4. **Big 5 / biodiversity index** (simulation + ui). A biodiversity stat from species richness +
   evenness + Big 5 populations; feeds reputation/publicity multiplier. Cheap, high fidelity
   payoff. *Harness:* biodiversity vs arrivals coupling.
5. **Camp-side management lite** (park + simulation). Occupancy rate, tier ladder
   (tent→cottage→lodge pricing), staff-type balance (cooks/attendants/scouts/naturalists/drivers),
   layoffs hurting village trust (we already model prosperity). *Harness:* occupancy→arrivals
   elasticity at each tier.
6. **Advisor personas with tiered state-driven advice** (ui + simulation). Three voices (camp,
   ecology, village) emitting tiered messages from measured state. Cheap — our notification panel
   exists; large character payoff, faithful to the original's feel.
7. **Rainfall-preference axis + drought interplay** (simulation + terrain water). Species/plants
   carry a rainfall tier; drought stresses high-rainfall species first; placed water mitigates.
   *Harness:* drought with/without water placement → mortality delta.
8. **Locust invasions** (effects + simulation). Swarm entity eats grass coverage; bulldozer
   clears. Small, showy.
9. **Salt licks + blinds as sighting hotspots** (props + traffic). Static attractors that boost
   sighting probability nearby — ties our existing sightings chain to placeable content.
10. **Field Guide + trivia** (ui + animals). Educational panels per species (from our own
    knowledge) and optional quizzes. Pure UI, strong fidelity signal, zero sim risk.

**Deliberately not adopted:** anything asset-, code-, or text-derived from the original (sprites,
audio, its exact strings); its fixed 640×480-era UI metaphors that conflict with our CS:2-style
UI; and its non-deterministic feel — every adopted mechanic must fit our seeded-determinism rule.

## 4. Suggested wave ordering

Waves of 2 agents, biggest first: (1) food web + plants; (2) fire; (3) missions + biodiversity;
(4) camp lite + advisors; (5) rainfall axis + locusts + salt licks; (6) field guide + trivia.
Each wave ships its harness scenarios so `game.gameplayFidelity` gets re-measured against the
original's mechanics, not just our current 6 scenarios.
