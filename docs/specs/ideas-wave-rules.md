# Ideas waves P3–P6 — shared rules (read before any `p3`…`p6` spec)

Written 2026-09-28 by the verifier after P1/P2, from what actually went wrong in those waves. Every
rule below exists because breaking it cost a verification round. The wave specs
(`p3-biodiversity-missions.md`, `p4-camp-advisors.md`, `p5-rainfall-locusts-licks.md`,
`p6-field-guide.md`) assume them and do not repeat them.

## Branches, merging, CI

1. One branch per wave: `claude/p<N>-<slug>`, cut from the **current** `main`. Merge `main` into it
   (no rebase, no force-push) before every push. The wave lands through a PR, never a direct push
   to `main`.
2. `.github/workflows/ci.yml` runs on every PR: lint, build, `node src/modules/simulation/test.mjs`,
   `node --check tools/*.mjs`, and `node tools/check-harness.mjs`. A red CI is not reviewable —
   fix it before asking for review.
3. The GLM dev-agent workflow is paused (`if: false`) for the duration of P3–P6. Do not re-enable
   it from a wave branch.

## Harness (`tools/fidelity.mjs`, additive only)

4. **Every scenario function is a top-level `async function scenarioX(browser)`.** P2 shipped a
   misplaced brace that nested `scenarioSpread` inside `scenarioFireResponse`; the harness crashed
   only after ~20 min of browser work. `check-harness.mjs` now fails CI on this.
5. Every new scenario name goes in **both** the default `SCENARIOS` list and a
   `SCENARIOS.includes('<name>')` dispatcher branch (CI checks both directions).
6. Every scenario returns `{ result: { pass: <boolean>, ... }, consoleErrors }`. The harness exits
   non-zero on `pass === false`. `pass` must include a **non-vacuity** term (P2 `fire-response`:
   "the defended fire still burns > 0 ha"), so that a scenario where nothing happens cannot pass.
7. **Before claiming a wave done, run the full default harness, not only your new scenarios.** P1's
   `spread` regressed unnoticed because only 6 scenarios were re-run after a follow-up.
8. Scripted disasters are **bounded**: every `injectEvent` a scenario or mission uses passes an
   explicit budget (`stamina` for fire, the equivalent for new event types). P2's unlimited scripted
   fire swept the whole park and broke `fire-regrowth`.
9. Report old vs new for the headline numbers every wave: baseline `netPerDay` at $25
   (−$2,496.83/d on main at 83312d2), the $15 break-even (+$433.13/d), and `determinism.identical`.
   A change to them is allowed only when intended, and stated in the commit.

## Simulation state and determinism

10. **Per-event state, never a shared global.** P2's containment budget was one global, so a second
    fire inherited the first fire's exhausted budget. Unit-test "the second event of the same type".
11. Only `ctx.rng` / forked streams. **Do not add draws to the sim's main economy stream** — that
    shifts every later roll and changes the baseline. Fork a named stream
    (`new Rng('<feature>:<seed>')`, as `vegetation.js` does with `veg:<seed>`).
12. `sim.reset()` restores every new piece of state (P2: the vegetation snapshot). Add a test that a
    run → reset → identical run gives byte-identical reports.
13. Timings (`stepMs`) stay out of the daily report so same-seed reports stay byte-identical.

## World fields and ownership

14. **New `world.*` fields are declared in `src/core/World.js` by the integrator**, not created ad hoc
    by a module. A builder writes the request in `docs/requests/<module>.md` with the exact shape.
    Name the single writer; everyone else reads.
15. Builders own one folder. No cross-module imports; talk through `ctx.modules.get(id)` and events.
    A module that needs another module's change files a request; it does not edit.

## Visuals

16. Shader injections: bump the material's program cache key whenever the injected code changes
    (`terrain-splat-v7` precedent), and test **every** material variant that shares the effect —
    P2's impostor shader replaced `map_fragment`, so impostors silently never charred.
17. Check the `night` preset and a full-game night shot for anything emissive or lit: the night
    exposure is ×12, so an effect tuned at noon is usually wrong at night (P2 smoke under-light).
18. Screenshots with the real LFS assets need `--timeout 400000`. A timed-out capture leaves the
    **previous** PNG in place — check the `.json` timestamp/errors before reading a PNG.
19. Visual checks on SwiftShader say "renders and composes correctly", not "looks right on a GPU".
    Say which you did.

## Budgets (whole game, unchanged)

≤ 1500 draw calls total; module soft caps in ARCHITECTURE §7; zero per-frame allocations in
`update()`; instancing for > 20 copies; LOD beyond 300 m; daily sim step total < 15 ms.

## Wave exit (every wave)

- CI green on the PR head; `main` merged in; no conflicts.
- Unit tests (old + new) green; determinism identical; full harness run and reported with old vs new.
- Screenshots of every new/changed preset and one full-game view, actually read; honest known gaps
  in each touched module's README.
- The spec file gets a short "Shipped" header like `p2-fire.md`, with measured numbers.
