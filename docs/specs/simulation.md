# simulation — spec

Owner of `world.economy`, `world.visitors`, and habitat/population/happiness rules. Headless: **no rendering**.
Fidelity target: the systems of the original SimSafari (1998): habitats, animal happiness, tourist flow, park economy,
village prosperity.

## Must deliver
* `src/modules/simulation/sim.js` — pure JS (no three, no DOM) class `Simulation(world, rng, hooks)` runnable in Node.
  `index.js` is the thin module wrapper. Include `src/modules/simulation/test.mjs` (plain node, no deps) that runs
  90 game days on a synthetic world and asserts sanity (cash changes, visitors respond to satisfaction, population
  grows when happy, dies when unhappy). Print a summary table.
* **Habitat quality** `scoreHabitat(habitat, species)` in [0,1] from species preferences vs habitat stats
  (`world.habitats` has area, water, shade, cover; plus terrain roughness and predator presence). Use `animals` species
  info via `ctx.modules.get('animals')?.speciesInfo(s)` with an internal fallback table.
* **Animal population**: per species per habitat: birth rate ∝ happiness, death rate ∝ (1 − happiness) + age; migration
  out of the park if happiness < 0.3 for 3 days; carrying capacity by area. Ask `animals` to spawn/remove
  (`ctx.modules.get('animals')?.spawn/remove`) or keep counts internally if absent.
* **Visitors**: daily arrivals = base × reputation × price elasticity × season × weather; each visitor group takes a tour
  (if `traffic` is present it drives it; else simulate sightings statistically from animal counts/rarity/visibility).
  Satisfaction = f(species variety, rarity, close sightings, road comfort, lodge quality, price fairness, crowding).
  Reputation is an EMA of satisfaction → drives arrivals. Track `seenSpecies`.
* **Economy**: income = tickets + lodge nights + shop; expenses = staff wages + building upkeep + road upkeep + animal
  feed/vet + loan interest. `world.economy.history` daily. Bankruptcy flag when cash < −50 000 for 5 days.
  `api.setTicketPrice`, `api.takeLoan(amount)`, `api.hire(role, n)`, `api.fire(role, n)`.
* **Village/staff**: staff count and morale; morale ∝ wages and park success; low morale → upkeep efficiency drop, poaching risk event.
* **Events**: random (seeded) events: drought (season), poachers, disease, viral visitor review; each with effect + notification via `ui:notify`.
* **Daily report** `api.getReport()` → `{day, cash, income, expenses, visitors, satisfaction, reputation, population:{species:n}, happiness:{species}, events:[...]}`; emit `sim:day` and `economy:updated`.
* `api.getState()`, `api.speed(n)`, `api.reset(seed)`, `api.scoreHabitat`, `api.getVisitorSatisfaction()`.

## Showcase
Since there is nothing to render, `stage()` runs 60 accelerated days and shows a DOM panel (`// lint-allow`) in
`#ui-root` with cash/visitors/population sparklines and the last report, so the critic can screenshot it. Presets:
`overview` (60 days default), `boom` (cheap tickets, good habitats), `bust` (no water, expensive), `night` (same as overview at 21.5 h).
