# Core / cross-module change requests — `tools`

## 1. (core, `World.js`/`simulation`) No public "spend"/"credit" API for `world.economy.cash`

`world.economy` is owner-written by `simulation` (ARCHITECTURE §3), but there is no public function
on `simulation`'s API to charge or refund an arbitrary cost — only `buyAnimals`, `takeLoan`,
`repayLoan`, `hire`/`fire`/`setWage`, none of which fit "charge N currency for a terraform stroke /
road / building placement" from another module.

**What tools does today:** `common.js`'s `spend(ctx, amount)` writes `ctx.world.economy.cash -= amount`
directly and re-emits `economy:updated`, gated on `ctx.modules.get('simulation')` being present (per
the spec: "cost charged to world.economy if simulation is present"). This is a pragmatic direct write
to a field this module does not own.

**Proposed diff (simulation owner):** add to `simulation`'s `api`:

```diff
+  /** Charge (positive) or refund (negative) `amount` against cash. Returns the new cash balance. */
+  spend(amount, reason) { return sim?.spend(amount, reason) ?? null; },
```

backed by a `Simulation.spend()` that updates `cash`, appends to `history`/an expense log keyed by
`reason`, and emits `economy:updated` itself — so tools (and any other module with a cost to charge)
stops writing a field it does not own, and the daily report can show *why* cash moved instead of an
opaque `expenses` bucket.

## 2. (not core — `zoning`) `paintCells` rejects `ZONE.NO_BUILD` as a target

`zoning/grid.js`'s `validPaintZone()` only allows `HABITAT | VISITOR | SERVICE | NONE`. This is
correct for the paint tool (a player should never *paint* NO_BUILD directly), but it means an outside
caller cannot use `paintCells` to restore a cell that was `NO_BUILD` before an edit — `tools`' zone
undo/redo works around this by remapping any captured `NO_BUILD` value to `NONE` on restore (relying
on `zoning`'s own `recomputeNoBuild()`, called from every `afterEdit()`, to re-assert `NO_BUILD` on
any cell that is still actually blocked). This works today because `recomputeNoBuild` is purely a
function of terrain/road/water state, not of history — flagging it only so nobody "fixes"
`validPaintZone` to reject the remapped `NONE` value for a genuinely-blocked cell without checking
this dependency first.

## 3. (not core — `CameraRig`) No modifier-aware wheel hook

`CameraRig`'s `wheel` listener always zooms the camera (`src/core/CameraRig.js`, no modifier check).
The spec asks for "mouse wheel + shift adjusts radius" on the terrain/zone brush. `tools` cannot
`stopPropagation`/`preventDefault` its way out of this — both listeners are bound to the same
`<canvas>` element and Three's `wheel` handler runs regardless — so today shift+wheel *also* still
zooms the camera while `tools` adjusts the brush radius alongside it. Worked around with `[`/`]` (and
`,`/`.` for strength) as the reliable keyboard path; shift+wheel is left in as a best-effort extra.

**Proposed diff (integrator, `CameraRig._bind()`):**

```diff
 dom.addEventListener('wheel', (e) => {
   if (!this.enabled) return;
+  if (e.shiftKey && this.input?.toolActive) return; // let the active tool own shift+wheel
   e.preventDefault();
   this.distance = clamp(this.distance * Math.exp(e.deltaY * 0.0012), this.minDistance, this.maxDistance);
 }, { passive: false });
```

`tools` would then add its own `wheel` listener (already has `ctx.renderer.domElement`) gated on
`e.shiftKey` to resize the current tool's radius exclusively.
