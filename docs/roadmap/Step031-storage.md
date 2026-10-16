# Step031 — Storage Capacity

Baseline: `fda6158` (Step030 structure plan). Implements storage caps —
the last "consciously parked" audit item (D5) — as derived capacity plus
one industry-gated building. Commits: `d746482` (feature), `dfdcb09`
(cleanup), `ecc4c98` (STATE).

## 1. What shipped

**`src/domain/storage/storage.ts` (new, 50 lines)** — food/water colony
stocks are capped by derived capacity: base 120/80 (2× D2 day-0 stocks
60/40) plus 60/40 per operational warehouse. Derived only, never
persisted — same pattern as `housingCapacity`, so no save migration.
Money stays an uncapped accounted treasury.

**Warehouse building** (`src/content/buildings.ts`) — 25$ + 2 planks,
upkeep 1, 2 construction ticks, `jobCapacity: 0` (passive, unstaffed),
no age gate. Mothballing removes its capacity via the `isActive` filter;
under-construction warehouses add nothing. The plank cost forces storage
to compete with construction — deliberate economic tension.

**Tick-phase clamp** (`src/domain/simulation/tick.ts`) — `clampStorage`
runs after consumption: only the true surplus is lost. Colonists eat
first, so famine semantics are unchanged; market sales (later in the
tick) see the already-capped stock. Returns `{ foodWasted,
waterWasted }` for future telemetry; currently unconsumed.

**Surfaces** — caps in `ColonyStats` (`foodCapacity`, `waterCapacity`);
storage-full alerts in `getAlerts` when balance > 0 and stock is pinned
at capacity (`Food storage full (120/120) · +3/tick wasted`); both state
the cause, never prescribe — alerts rule §7 holds.

**Cleanup (`dfdcb09`)** — single palette-order source (was duplicated);
three.js moved to a vendor chunk (app 53kB + three 471kB).

## 2. Design decisions

- Derived-not-persisted: capacity recomputes from buildings each
  access; saves carry no new fields (verified: no migration step).
- Clamp after consumption, not before: the alternative (clamp-then-eat)
  would let the cap starve colonists when production overshoots — the
  chosen order keeps the colony's promise that stored food feeds first.
- Warehouse has upkeep 1 but no jobs: passive infrastructure like
  residences are upkeep-exempt, but warehouses are industry-adjacent
  storage — upkeep 1 keeps large stockpiles from being free.

## 3. Validation

Unit: `tests/storage.test.ts` (145 lines, +12 tests) — derived caps,
mothball removal, clamp-after-consumption ordering, no-migration
round-trip. Suite: 19 files / 230 tests green.

E2E (`dfdcb09` follow-up): the MVP-loop journey's "stock grows" proof
had to drain food to 40 first — a pinned stock cannot grow by design,
so the test now establishes headroom before asserting growth. Suite:
15/15 scenarios.

Gates (all executed 2026-10-15): `npx tsc --noEmit` clean, `npx eslint
.` clean, `npx vitest run` 230/230, `pnpm build` (tsc + vite) PASS,
Playwright 15/15.
