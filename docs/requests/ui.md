# ui — in-game credits panel (integrator request, 2026-09-25)

## What
Add a small credits/attribution surface listing CC-BY assets shown in-game, per ARCHITECTURE §8
("CC-BY attributions are shown in-game (credits panel)") and docs/ASSETS.md.

## Why
Three CC-BY 3.0 models are now shipped and visible in every animals/savannah/park scene since
2026-09-25 (Giraffe.glb, Elephant.glb, Lion.glb — Poly by Google, via poly.pizza). The §8
obligation is currently unmet; docs/ASSETS.md flags it as pending. Suggested wording per model:
"Animal models (giraffe, elephant, lion): Poly by Google, CC-BY 3.0, via poly.pizza".

## Proposed shape (minimal)
- A "credits" line/panel reachable from the existing top-bar or settings affordance (even a
  collapsible footer overlay is acceptable for now), content sourced from a static list in ui
  kept in sync with docs/ASSETS.md CC-BY rows (hardcoded list is fine at this scale; do not
  fetch ASSETS.md at runtime).
- No new dependencies, no network, DOM only, zero per-frame cost (static panel).

## Priority
Before the final evaluation so the §8 obligation is met on-camera, but after the in-flight
critic captures finish (an HMR reload kills in-flight captures). The integrator will apply or
coordinate this at the integration step if no ui builder is active by then.
