# Step003 — Physical Wood + Extraction + Colony Center

Baseline: `2ea8a0b` (Step002 money suite). Implements the first
physical-resource slice from the audit
(`docs/audits/RESOURCE-ECONOMIC-SYSTEM-AUDIT-2026-10-08.md`, decisions D1/D2/D4).
Date: 2026-10-08.

## IMPLEMENTATION

### Wood deposits (audit D1/D2)

- New canonical state field `woodDeposits: Record<"x,y", WoodDeposit>` —
  cell-keyed, finite, persisted. Exhaustion sets `remaining: 0`; the deposit
  entry never disappears. No regeneration.
- Seeded from `config.world.woodDeposits` at initialization, normalized with
  the same key/dedupe convention as `blockedCells`
  (`src/domain/world/woodDeposits.ts`).
- Placement on a deposit cell is refused with the new
  `PlacementValidation` reason `depositBlocked` (a building must never
  overwrite a world feature; a camp on its own deposit could never extract).

### Lumber Camp (extraction)

- New building type `lumberCamp`: workplace (capacity 1, existing
  staffing/road-access/mobility rules unchanged), 2-tick construction,
  25 money, no water cost.
- `produceWood` (new tick phase 4c, after `produceWater`): every staffed
  operational Lumber Camp extracts `WOOD_PER_LUMBER_CAMP_PER_TICK = 2` wood
  from the deposits orthogonally adjacent to it, capped by what remains
  (multi-deposit drain: lowest canonical key first). Same next-tick staffing
  timing contract as farms. Extraction decrements the deposits.

### Colony Center (audit D4 — anti-self-lock)

- New building type `colonyCenter`: 2-tick construction, 25 money, **not a
  workplace** — its primitive collection is unstaffed by contract.
- Extracts `WOOD_PER_COLONY_CENTER_PER_TICK = 1`/tick from adjacent deposits,
  same capping rules. Deliberately low-rate: it must never replace a Lumber
  Camp economically.
- This is the anti-self-lock path: with an eligible deposit and no
  functioning Lumber Camp, a Colony Center still recovers wood — including a
  population-0 colony, which the previous model could never recover.

### Resource accounting

- `resources.wood` added to the canonical stock (initial 0; wood only ever
  enters through extraction — never created ex nihilo). No economy change:
  taxes, maintenance, commerce and construction costs are untouched.

### Save / migration

- `SAVE_VERSION` 9 → **10**; `MIGRATABLE_SAVE_VERSION` 8 → 9 (the v4–v9
  chain is preserved). `migrateV9ToV10` adds `resources.wood: 0` and
  `woodDeposits: {}` deterministically; no existing field is renamed.

### UI (minimal per scope)

- `window.__nova.stats()` exposes `wood` (validation surface). No palette
  buttons were added: the palette row width is a documented fragile layout
  contract (canvas hit-testing), and the mechanic is fully validatable via
  state-injection fixtures, matching the established E2E pattern.

## SELF-LOCK INVARIANT (tests/woodExtraction.test.ts, 12 tests)

- normal extraction (wood +2, deposit −2, pure input);
- empty deposit → zero extraction, deposit entry remains;
- unstaffed camp → zero extraction;
- partial drain capped by the remaining quantity;
- Colony Center fallback recovers wood with **zero colonists and no camp**;
- no ex-nihilo generation (no deposits → no wood, camp + center both idle);
- orthogonality of deposit adjacency;
- determinism (same state + ticks → identical canonical hash);
- full-tick path through `stepSimulation`;
- placement protection (`depositBlocked`).

## VALIDATION

| Gate | Command | Result |
|---|---|---|
| G1 | `npx tsc --noEmit` | PASS |
| G2 | `npx eslint .` | PASS |
| G3 | `npx vitest run` | PASS — 122 files / 1889 tests (12 new), 0 failed |
| G8 | `npm run build` | PASS |
| G9 | full E2E suite | 25/27 in batch; the 2 failures (spatial-readability, road-affordability) are pre-existing single-read hover races and PASS in isolation — effective 27/27 |

## DEFERRED (unchanged scope boundary)

Stone, transformation/workshop re-anchoring, commerce re-anchoring, fertility,
regeneration, recycling, logistics, warehouses, tech/ages, demolish, economy
balancing, day-0 Colony Center presence in `createInitialState` (product
decision: the Center is currently placeable, not pre-placed).

## RESULT

Step003 complete: a small, deterministic, physically grounded wood-extraction
slice with a real anti-self-lock path.
