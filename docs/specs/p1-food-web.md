# Wave P1 — Food-web ecology + plant layer (contract)

Agenda: `docs/ideas-roadmap.md` Wave P1. Mechanics source: `docs/ideas-simsafari-1998.md` §1/§3.1
(mechanics only; all content, numbers and words are ours). Integrator-owned contract: builders do
not change the core files below; they request changes via `docs/requests/<id>.md`.

## Shared data (core, already on the P1 branch)

- `src/core/Plants.js` — `PLANTS` (10 plants: 4 grasses, 2 shrubs, 4 trees) with `form`, `rainfall`
  tier, `attracts` (animal species ids), `food`, `spread`, `maxCover`, `cost`; `PLANT_IDS`,
  `PLANT_INDEX`, `rainfallFit(tier, rain)`.
- `world.vegetation = { res: 64, cell: 16 m, types, cover: Float32Array(types × 64 × 64), version }`
  — cover 0..1 per plant per cell, plant-major. Helpers `world.vegCell(x, z)`, `world.vegCover(t, x, z)`.
- Event `vegetation:changed` `{ x0, z0, x1, z1 }` (world metres) — emitted by the writer after any
  write; readers rebuild only that rect.

## Ownership

| owner | does | never |
|---|---|---|
| **simulation** | seeds natural vegetation from terrain biomes on init/`generate`; daily spread (logistic toward `maxCover × rainfallFit`, into neighbouring cells); grazing/browsing consumption by resident herds; food-driven carrying capacity; food-web (diet/predator) tables; `plant()` API; harness scenarios | draw anything |
| **props** | draws plants from `world.vegetation` (instanced, per `form`, deterministic placement from cell + `ctx.rng`), rebuilds only changed rects, LOD, showcase preset | write `world.vegetation` |
| **integrator** | core files, `park` demo planting, STATUS, merging | — |

## simulation — required behaviour

1. **Seeding:** grass cover from BIOME (GRASS/DRY_GRASS → `red_oat`/`couch`/`lovegrass` mix,
   WETLAND/near water → `sedge`), sparse trees/shrubs; deterministic (`ctx.rng`).
2. **Spread:** once per sim day, per cell and plant: `c += spread × fit × c × (1 − c/maxCover)`
   plus a small neighbour seeding term so a planted patch grows outward. Rainfall `rain` from
   `world.weather` season/drought state (dry season lower; the existing drought event lowers it).
3. **Food and capacity:** per habitat and herbivore species, `food = Σ cells Σ plants attracting it
   (cover × food × cellHa)`; `capacity = min(area/space, food / dailyNeed)` (keep the existing
   space term as the ceiling). **Consumption** reduces cover proportionally to the herd's need, so
   overgrazing shows up as declining cover and then falling capacity.
4. **Food web:** a diet/predator table per species (`tables.js`): predators' capacity follows prey
   biomass in reach (lion: zebra/wildebeest/buffalo/impala/warthog; cheetah: impala/warthog/ostrich
   young…). Removing prey makes predators decline after a lag (hunger → unhappy → deaths/leave).
   There are no insectivores among our 12 species, so the original's "insects come free with
   grass" rule does not apply this wave; say so in the README.
5. **API:** `plant(type, x, z, radius, cover = 0.25)` → charges `cost × ha` via `spend(..., 'plant')`,
   writes cover, emits `vegetation:changed`, returns `{ ok, cost, cells }`;
   `getVegetation(x, z)` → `{ [id]: cover }`; `getFoodReport(habitatId)` → per-species
   `{ food, need, capacity }`.
6. **Determinism:** same seed → identical cover arrays after N days (unit-test it). The existing
   89 tests must stay green; if a behaviour change is intended, update the test consciously and
   say why in the commit.
7. **Budget:** the daily vegetation update stays < 5 ms (64² × 10 = 41k cells); per-frame cost ~0.

## props — required behaviour

1. Plant meshes per form, reusing props' existing procedural tree/grass/shrub generators: grass
   types tint/density variants, shrubs (aloe rosette, sour-plum bush), trees (umbrella thorn flat
   crown, knobthorn, marula round crown, baobab fat trunk). Recognisable at 30–80 m.
2. Placement: per cell, instance count ∝ cover (grasses as tuft density, trees as individuals),
   jittered deterministically from the cell index + `ctx.rng` fork; ground-conformed.
3. Coexist with existing props: the current scatter should read from `world.vegetation` where it
   overlaps (grass density ← grass cover, trees ← tree cover) instead of drawing a second, unrelated
   layer. If that is too invasive for this wave, draw the plant layer additively and document.
4. Budget: ≤ 12 extra draw calls (instanced per form × LOD), no per-frame allocations, rebuild only
   the rect in `vegetation:changed` (throttled to at most once per 0.5 s).
5. Showcase preset `plants`: each of the 10 plants visible and labelled in the README table.

## Harness (simulation adds to `tools/fidelity.mjs`, additive only — granted for this wave)

- `plant-aloe`: plant aloe + marula in the woodland habitat → elephant capacity rises by ≥ N
  within 30 days vs control.
- `remove-prey`: remove all impala/warthog/zebra from the lion's habitat → lion count declines
  after a lag of ≥ k days vs control.
- `spread`: plant a few red-oat cells → covered area grows over 30 days; drought slows it.
- The existing scenarios must still pass. Note their numbers may move (capacity is now
  food-coupled) — report old vs new; the $15 break-even is the headline to watch.

## Wave exit

Tests + new tests green, determinism identical, harness (old + new) run and reported, screenshots of
the `plants` preset and one full-game view read by the orchestrator, READMEs updated with measured
numbers and honest gaps. `game.gameplayFidelity` re-measured by the orchestrator.
