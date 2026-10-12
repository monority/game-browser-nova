# Step012 — Commerce Re-anchoring (D3/D6)

Baseline: `5698089` (Step011). Implements the D3/D6 audit decisions with a
user-approved design: **commerce = 2 per connected workshop (base,
unchanged) + 1 per plank actually produced this tick (throughput bonus)**.
Date: 2026-10-09.

## DESIGN (why this shape — derived, then verified)

- Pure staffing/throughput anchoring (vacant earns 0) is structurally
  net ≤ 0: with tax 1/inhabitant ≈ residence maintenance 1 and
  F ≥ ⌈pop/2⌉ farms for food stability, max net = W − F − wells ≤ −wells.
  Small colonies (pop 1, cannot staff a workshop) would freeze permanently —
  "a realistic path to equilibrium exists" (D6 invariant) would fail.
- The hybrid keeps the calibrated 2/tick connection base (audit D3:
  "keeping the 2/tick number as the migration stepping stone") and adds the
  throughput increment, making real transformation the growth engine:
  staffed + supplied workshop nets +2/tick (3 commerce − 1 maintenance).
- Long-run honesty: wood is finite; when deposits exhaust, workshops idle
  and the economy falls back to the connection base (the pre-Step012
  dynamics). No terminal cliff is introduced; renewable wood remains a
  future design decision.

## IMPLEMENTATION

- `plankThroughput(state)`: staffed active workshops with the full wood
  batch available (pure, all-or-nothing, consistent with `producePlanks`).
- `producePlanks` returns the planks produced; the tick wires the value
  into `collectRevenue(state, planksProduced)` — explicit dataflow, no
  transient state (persistence untouched, still v14).
- `COMMERCE_PER_PLANK_PRODUCED_PER_TICK = 1` (new constant);
  `COMMERCE_PER_CONNECTED_WORKSHOP_PER_TICK = 2` unchanged.
- Vacant or wood-less workshops: exactly the pre-Step012 contract.

## VALIDATION (executed 2026-10-09)

| Gate | Command | Result |
|---|---|---|
| G1 | `npx tsc --noEmit` | PASS |
| G2 | `npx eslint .` | PASS |
| G3 | `npx vitest run` | PASS — 12 files / 142 tests (3 new + 1 retargeted), 0 failed |
| G8 | `pnpm build` | PASS |
| G9 | `pnpm test:e2e` | PASS — 11/11 scenarios |
| G10 | per-file diff review | PASS |

Retargeted test: "commerce is unchanged and separate from transformation"
→ staffed workshop with wood now earns 3 (2 base + 1 bonus); the old
assertion documented the pre-re-anchoring contract.

## RESULT

D3/D6 implemented: commerce grows with real transformation work, the
connection floor preserves small-colony viability and every verified
recovery path (removal W>F, mothballing, W=F boundary). The subsidy is now
a floor, not the engine.

## DEFERRED

Renewable wood / tree regrowth (the long-run "wood age" boundary),
D3 second step (mills/goods), D5 storage, environment, tech/ages,
starvation terminal state.
