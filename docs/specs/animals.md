# animals — spec

Owner of `world.animals`. Reference: BBC wildlife documentary stills; Planet Zoo animals. This is the hardest module
visually: there are no downloaded models, so the animals are **procedurally modelled, textured and animated**.

## Must deliver
* **Species catalogue** (`species.js`), each with size (shoulder height, length, mass), diet (grazer/browser/predator/mixed),
  herd size, speed (walk/run), habitat preferences (grass density, tree cover, water distance, terrain roughness, space
  per animal, predator tolerance), rarity/visitor appeal, day/night activity. Minimum 10 species: elephant, giraffe,
  zebra, wildebeest, buffalo, lion, cheetah, hippo, white rhino, warthog, ostrich, impala.
* **Meshes**: parametric body builder — smooth tapered body/neck/head/legs built from lathe/tube geometries or
  subdivided primitives, merged into ONE geometry per species with a skeleton built in code (spine, neck ×3, head,
  jaw, 4 legs ×3 bones, tail ×3, ears). Proportions from the catalogue so a giraffe is 5 m tall and a warthog 0.7 m.
  Silhouettes must read: elephant trunk + ears, giraffe neck + ossicones, rhino horn, buffalo horns, lion mane, ostrich.
* **Materials**: procedural skin/fur via `ctx.textures.gpu()` in object-space or UV space: zebra stripes (noise-warped),
  giraffe patches (worley), cheetah spots, elephant wrinkled grey with dust, lion tawny with darker mane, hippo wet
  sheen. Normal + roughness maps. No flat colours.
* **Animation**: procedural skeletal — walk/trot/gallop leg cycles with proper phase per gait (quadruped lateral
  sequence), head bob, neck sway, tail swish, ear flick, breathing when idle; graze (head down), drink, lie down/sleep,
  alert (head up, ears forward), flee. Blend between states. Feet stay on `world.getHeight`. Body pitches with slope.
* **Behaviour** (`tick`): needs (food, water, rest, safety, social) drift; state machine choosing graze/walk-to-water/
  drink/rest/socialise/flee/hunt; herds: boids-style cohesion/separation/alignment with a leader wandering; predators
  stalk + chase when hungry, prey flee when a predator is within alert radius; sleep at night for diurnal species.
  Happiness from needs + habitat quality (use `ctx.modules.get('zoning')?.getHabitatQuality(id, species)` if present, else 0.6).
  Deterministic via `ctx.rng`.
* **Rendering budget**: up to 300 animals on screen: use one `SkinnedMesh` per animal with a shared material per species
  (≤ 300 draw calls worst case — document it), or better, instanced skinning with per-instance bone textures. LOD: beyond
  250 m switch to a rigid low-poly/imposter. Shadows cast.
* **API**: `spawn(species, x, z, count=1, opts)`, `remove(id)`, `list(species?)`, `get(id)`, `count(species)`,
  `speciesInfo(species)`, `allSpecies()`, `getHappiness(id)`, `setHabitatQualityFn(fn)`, `nearest(x,z,r)`.
  Emit `animal:spawned/died/state`.

## Presets
`overview` (mixed herds on plains, 16 h), `herd` (close on zebra + wildebeest walking, 16.5 h), `waterhole` (elephants
+ giraffe drinking, 8 h), `predators` (lion pride resting, cheetah walking, 17.5 h), `close` (one elephant at 12 m, 15 h),
`night` (21.5 h, hippos active).

## Budget
≤ 200 draw calls at overview, ≤ 1.5 M tris; `update()` ≤ 3 ms for 200 animals; zero per-frame allocation.
