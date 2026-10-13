# Step018 - Renewable Wood (park forest regrowth)

Baseline: 5fbb097 (Step017 Age 2 market). Wood deposits were strictly
finite: exhausted camps and the Colony Center anchor stalled forever.
Parks now tend adjacent wood back toward its seeded capacity. Date:
2026-10-12.

## DESIGN

- Each operational active park regrows +1 wood per tick into orthogonally
  adjacent wood deposits, lowest canonical key first (mirrors extraction
  order). Regrowth caps at per-cell capacity (the seeded amount).
- Stone never regrows: deliberate asymmetry, wood is the living resource.
- Regrowth runs inside the environment phase, after extraction, so regrown
  wood is collectible next tick. Mothballed parks tend nothing.
- Player decision: parks cost maintenance plus buildable cells near
  deposits, buying pollution absorption plus a slow wood income against
  lumber-camp throughput (2/tick). One park sustains half a camp.
- Persistence: Deposit gains capacity. SAVE_VERSION 17; v16 to v17 rebuilds
  capacities from world-config seeds (faithful amounts); seedless cells keep
  capacity = remaining (no headroom invented).

## IMPLEMENTATION

- World: Deposit capacity, normalizeDeposits, depositCapacities,
  regrowAdjacent (extraction-order mirror).
- Environment: WOOD_REGROWTH_PER_PARK_PER_TICK = 1 in updateEnvironment.
- Persistence: v17, strict capacity validation, v16 to v17 migration.
- UI: park inspection copy mentions regrowth. Renderer deposit trees grow
  back automatically (size reads remaining).
- Tick phase doc updated; no phase reorder.

## VALIDATION (executed 2026-10-12)

- npx tsc --noEmit: PASS, no errors.
- npx eslint .: PASS, no findings.
- npx vitest run: PASS, 16 files / 189 tests, 0 failed (10 new regrowth).
- pnpm build: PASS.
- Playwright: PASS, 12/12 scenarios.

## RESULT

Exhausted forests recover under park tending; old cities without parks
behave exactly as before. The terminal wood stall is retired the same way
Step015 retired the food lock.

## DEFERRED

Pollution depth beyond admission gating, graphs, storage caps, further
Age 2 systems.
